/* Build step: embed the interactive renderers (live post + live carousel) into
   the worker bundle and add the glue that makes them work.

   Rules learned the hard way:
   · escape ONLY non-ASCII code points (\\uXXXX / \\u{...}), keep real newlines
   · assert every anchor is unique and present before touching the file
   · the bundle also carries a display-only `var workerSource` string — never
     patch a zone without first proving the anchor is real code

   Usage: node patch_live_v2.mjs <bundle.js>                                  */
import fs from 'node:fs';

const target = process.argv[2] || '/home/user/gh/worker/index.js';
const LIVE_SRC = '/home/user/cf/live/live_render.js';
const CAR_SRC = '/home/user/cf/live/carousel_render.js';

function jsEscape(src) {
  let out = '';
  for (const ch of src) {
    const cp = ch.codePointAt(0);
    if (cp < 128) out += ch;
    else if (cp <= 0xffff) out += '\\u' + cp.toString(16).toUpperCase().padStart(4, '0');
    else out += '\\u{' + cp.toString(16).toUpperCase() + '}';
  }
  return out;
}
const read = (p) => fs.readFileSync(p, 'utf8');
let src = read(target);
const count = (needle) => src.split(needle).length - 1;
const must = (cond, msg) => { if (!cond) { console.error('✖ ' + msg); process.exit(1); } };

/* ---------- idempotency ---------- */
must(count('carouselView') === 0, 'bundle already carries the carousel — nothing to do');

/* ---------- 1) glue that lives next to the renderers ---------- */
const GLUE = `
/* ── live carousel ──
   A carousel that lives inside one message: every tap rewrites the photo in
   place (editMessageMedia), so a ten-slide post never becomes a ten-message
   thread. The server can also walk it forward on its own (see applyLiveTick). */
function carouselStripIcons(mk) {
  if (!mk || !mk.inline_keyboard) return mk;
  return { ...mk, inline_keyboard: mk.inline_keyboard.map((row) => row.map((b) => {
    const { icon_custom_emoji_id, ...rest } = b;
    return rest;
  })) };
}
async function editCarouselMessage(env, chatId, msgId, view) {
  const emojiMap = await getJson(env, "map", {});
  const content = applyEmojiSubs(ensureRichHtmlStructure(String(view.caption || "").trim()), {}, emojiMap);
  const caption = sanitizeTelegramHtml(content).slice(0, 1024);
  const markup = decorateReplyMarkup(view.keyboard, emojiMap);
  const media = { type: "photo", media: view.fileId, caption, parse_mode: "HTML" };
  const unchanged = (res) => !!res && /not modified/i.test(String(res?.description || ""));
  let res = null;
  try {
    res = await tgCall(env, "editMessageMedia", { chat_id: chatId, message_id: msgId, media, ...markup ? { reply_markup: markup } : {} });
    if (res && res.ok) return res;
    if (unchanged(res)) return { ok: true, result: { message_id: msgId }, unchanged: true };
    const res2 = await tgCall(env, "editMessageMedia", { chat_id: chatId, message_id: msgId, media, ...markup ? { reply_markup: carouselStripIcons(markup) } : {} });
    if (res2 && res2.ok) return res2;
    if (unchanged(res2)) return { ok: true, result: { message_id: msgId }, unchanged: true };
    res = res2 || res;
  } catch (e) {
    console.warn("carousel edit failed", e?.message);
  }
  return res;
}
async function handleCarouselTap(cb, env, origin) {
  const qId = cb.id;
  const chatId = cb.message?.chat?.id;
  const msgId = cb.message?.message_id;
  const parts = String(cb.data || "").split(":");
  const id = parts[1] || "";
  const action = parts[2] || "";
  if (!id || !chatId || !msgId) return answerCallback(env, qId, "پیام پیدا نشد.", true);
  const state = await getJson(env, \`car:\${id}\`, null);
  if (!state || !Array.isArray(state.slides) || !state.slides.length) return answerCallback(env, qId, "این کاروسل در دسترس نیست.", true);
  const n = state.slides.length;
  const cur = carouselIndex(state);
  const show = async (toast) => {
    await editCarouselMessage(env, chatId, msgId, carouselView(state));
    return answerCallback(env, qId, toast);
  };
  if (action === "x") {
    return answerCallback(env, qId, \`اسلاید \${carouselFa(cur + 1)} از \${carouselFa(n)} — با ◀️ و ▶️ ورق بزن\`);
  }
  if (action === "pause" || action === "play") {
    const on = action === "play";
    if (state.auto === on) return answerCallback(env, qId, on ? "پخش خودکار از قبل روشن بود" : "پخش خودکار نگه داشته شده بود");
    state.auto = on;
    state.updatedAt = Date.now();
    await setJson(env, \`car:\${id}\`, state, 30 * 86400);
    return await show(on ? "▶️ پخش خودکار روشن شد — هر دقیقه یک اسلاید" : "⏸ پخش خودکار نگه داشته شد");
  }
  let target = cur;
  if (action === "n") target = (cur + 1) % n;
  else if (action === "p") target = (cur - 1 + n) % n;
  else {
    const t = Number(action);
    if (!isFinite(t) || t < 0 || t >= n) return answerCallback(env, qId, "اسلاید نامعتبر", true);
    target = Math.round(t);
  }
  state.idx = target;
  state.updatedAt = Date.now();
  await setJson(env, \`car:\${id}\`, state, 30 * 86400);
  return await show(\`اسلاید \${carouselFa(target + 1)} از \${carouselFa(n)} ✓\`);
}

/* ── the server side of a live post ──
   A scheduled job with kind:"live_tick" either appends a line to a coverage
   post (entry/patch) or walks a carousel one slide forward (advance). */
async function applyLiveTick(env, job) {
  const id = job.liveId;
  if (!id) return { ok: false, description: "tick without liveId" };
  if (job.advance) {
    const st = await getJson(env, \`car:\${id}\`, null);
    if (!st || !Array.isArray(st.slides) || !st.slides.length) return { ok: false, description: "carousel state missing" };
    if (st.auto === false) return { ok: true, result: { message_id: job.messageId }, skipped: true };
    st.idx = (carouselIndex(st) + 1) % st.slides.length;
    st.updatedAt = Date.now();
    await setJson(env, \`car:\${id}\`, st, 30 * 86400);
    const res = await editCarouselMessage(env, job.target, job.messageId, carouselView(st));
    return res && res.ok ? { ok: true, result: { message_id: job.messageId } } : { ok: false, description: res?.description || "carousel advance failed" };
  }
  const st = await getJson(env, \`live:\${id}\`, null);
  if (!st) return { ok: false, description: "live state missing" };
  st.entries = Array.isArray(st.entries) ? st.entries : [];
  if (job.entry && job.entry.text) {
    st.entries.push({ at: Number(job.entry.at) || Number(job.scheduledAt) || Date.now(), text: String(job.entry.text).slice(0, 280) });
    if (st.entries.length > 40) st.entries = st.entries.slice(-40);
  }
  if (job.patch && typeof job.patch === "object") {
    if (typeof job.patch.title === "string") st.title = job.patch.title.slice(0, 120);
    if (typeof job.patch.subtitle === "string") st.subtitle = job.patch.subtitle.slice(0, 300);
    if (typeof job.patch.status === "string") st.status = job.patch.status.slice(0, 120);
  }
  st.updatedAt = Date.now();
  await setJson(env, \`live:\${id}\`, st, 30 * 86400);
  const res = await editLivePost(env, job.target, job.messageId, st);
  return res && res.ok ? { ok: true, result: { message_id: job.messageId } } : { ok: false, description: res?.description || "live tick failed" };
}
`;

/* ---------- 2) swap the embedded renderer zone ---------- */
const ZONE_START = '/* Live-post renderer';
const ZONE_END = '/* \\u2500\\u2500 live posts \\u2500\\u2500';
must(count(ZONE_START) === 1, 'renderer zone start not found exactly once (' + count(ZONE_START) + ')');
must(count(ZONE_END) === 1, 'renderer zone end not found exactly once (' + count(ZONE_END) + ')');
const startAt = src.indexOf(ZONE_START);
const endAt = src.indexOf(ZONE_END);
must(startAt > -1 && endAt > startAt, 'renderer zone bounds are wrong');
const zone = jsEscape(read(LIVE_SRC)) + '\n' + jsEscape(read(CAR_SRC)) + '\n' + jsEscape(GLUE) + '\n';
src = src.slice(0, startAt) + zone + src.slice(endAt);

/* ---------- 3) route carousel taps (next to the vote branch) ---------- */
const VOTE_ANCHOR = '  if (typeof cb.data === "string" && cb.data.indexOf("vote:") === 0) {\n    return handleLiveVote(cb, env, origin);\n  }';
must(count(VOTE_ANCHOR) === 1, 'vote branch anchor not unique (' + count(VOTE_ANCHOR) + ')');
src = src.replace(VOTE_ANCHOR, VOTE_ANCHOR + '\n  // live-carousel taps: same idea, but the photo itself swaps in place\n  if (typeof cb.data === "string" && cb.data.indexOf("car:") === 0) {\n    return handleCarouselTap(cb, env, origin);\n  }');

/* ---------- 4) allow refresh on posts without options (coverage posts) ---------- */
const OPT_ANCHOR = 'if (!state || !state.options) return answerCallback(env, qId,';
must(count(OPT_ANCHOR) === 1, 'options guard anchor not unique (' + count(OPT_ANCHOR) + ')');
src = src.replace(OPT_ANCHOR, 'if (!state || (!state.options && action !== "__refresh")) return answerCallback(env, qId,');

/* ---------- 5) teach scheduled() about live ticks ---------- */
const JOB_ANCHOR = 'const job = sched.jobs[jobIdx];';
must(count(JOB_ANCHOR) === 1, 'scheduled job anchor not unique (' + count(JOB_ANCHOR) + ')');
src = src.replace(JOB_ANCHOR, JOB_ANCHOR + '\n              let tj = {};\n              if (job.kind === "live_tick") {\n                tj = await applyLiveTick(env, job);\n              } else {');
const TJ_ANCHOR = 'const tj = await tgRes.json().catch(() => ({}));';
must(count(TJ_ANCHOR) === 1, 'scheduled result anchor not unique (' + count(TJ_ANCHOR) + ')');
src = src.replace(TJ_ANCHOR, 'tj = await tgRes.json().catch(() => ({}));\n              }');

/* ---------- 6) sanity + write ---------- */
must(count('carouselView') >= 2, 'carousel renderer not embedded');
must(count('applyLiveTick') === 3, 'applyLiveTick wiring looks wrong (' + count('applyLiveTick') + ')');
must(count("handleCarouselTap") >= 2, 'handleCarouselTap wiring looks wrong (' + count('handleCarouselTap') + ')');
must(count('job.kind === "live_tick"') === 1, 'scheduled kind routing missing');
fs.writeFileSync(target, src);
console.log('✔ patched', target, '→', Buffer.byteLength(src), 'bytes');
