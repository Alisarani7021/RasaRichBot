/* Worker glue for the interactive renderers. Embedded into the bundle by
   cf/build/patch_live_v3.mjs, right after the renderer sources, so the worker
   and the delivery scripts always agree on how a post looks.
   Requires the bundle's own helpers (hoisted function declarations):
   getJson / setJson / deleteKey / tgCall / editPostMessage / sendPostMessage /
   answerCallback / getStartKeyboard / escapeHtml / applyEmojiSubs /
   ensureRichHtmlStructure / decorateReplyMarkup / sanitizeTelegramHtml        */

/* ══════════ live carousel ══════════ */
function carouselStripIcons(mk) {
  if (!mk || !mk.inline_keyboard) return mk;
  return { ...mk, inline_keyboard: mk.inline_keyboard.map((row) => row.map((b) => {
    const { icon_custom_emoji_id, ...rest } = b;
    return rest;
  })) };
}
async function editCarouselMessage(env, chatId, msgId, view) {
  if (!view.fileId) {
    // a text tab: the same message rewrites its rich content (images included)
    return await editPostMessage(env, chatId, msgId, { html: view.caption, replyMarkup: view.keyboard }).catch((e) => {
      console.warn("text-tab edit failed", e?.message);
      return null;
    });
  }
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
  const state = await getJson(env, `car:${id}`, null);
  if (!state || !Array.isArray(state.slides) || !state.slides.length) return answerCallback(env, qId, "این کاروسل در دسترس نیست.", true);
  const n = state.slides.length;
  const cur = carouselIndex(state);
  const show = async (toast) => {
    await editCarouselMessage(env, chatId, msgId, carouselView(state));
    return answerCallback(env, qId, toast);
  };
  if (action === "x") {
    return answerCallback(env, qId, `اسلاید ${carouselFa(cur + 1)} از ${carouselFa(n)} — با ◀️ و ▶️ ورق بزن`);
  }
  if (action === "pause" || action === "play") {
    const on = action === "play";
    if (state.auto === on) return answerCallback(env, qId, on ? "پخش خودکار از قبل روشن بود" : "پخش خودکار نگه داشته شده بود");
    state.auto = on;
    state.updatedAt = Date.now();
    await setJson(env, `car:${id}`, state, 30 * 86400);
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
  await setJson(env, `car:${id}`, state, 30 * 86400);
  return await show(`اسلاید ${carouselFa(target + 1)} از ${carouselFa(n)} ✓`);
}

/* ══════════ live ticks: coverage, carousel advance, live flow ══════════ */
async function applyLiveTick(env, job) {
  const id = job.liveId;
  if (!id) return { ok: false, description: "tick without liveId" };
  if (job.advance) {
    const st = await getJson(env, `car:${id}`, null);
    if (!st || !Array.isArray(st.slides) || !st.slides.length) return { ok: false, description: "carousel state missing" };
    if (st.auto === false) return { ok: true, result: { message_id: job.messageId }, skipped: true };
    st.idx = (carouselIndex(st) + 1) % st.slides.length;
    st.updatedAt = Date.now();
    await setJson(env, `car:${id}`, st, 30 * 86400);
    const res = await editCarouselMessage(env, job.target, job.messageId, carouselView(st));
    return res && res.ok ? { ok: true, result: { message_id: job.messageId } } : { ok: false, description: res?.description || "carousel advance failed" };
  }
  if (job.flow) {
    const st0 = await getJson(env, `live:${id}`, null);
    if (!st0) return { ok: false, description: "live state missing" };
    const f = job.flow;
    const prevSeries = (st0.flow && Array.isArray(st0.flow.series)) ? st0.flow.series.slice(-24) : (Array.isArray(job.flow.seed) ? job.flow.seed.slice(-24) : []);
    const last = prevSeries.length ? prevSeries[prevSeries.length - 1] : (Number(f.start) || 0);
    const drift = (Number(f.step) || 0) + (Math.random() * 2 - 1) * (Number(f.jitter) || 0);
    let value = last + drift;
    if (f.min != null) value = Math.max(Number(f.min), value);
    if (f.max != null) value = Math.min(Number(f.max), value);
    value = Math.round(value * 100) / 100;
    st0.flow = {
      label: f.label || st0.flow?.label || "",
      emoji: f.emoji || st0.flow?.emoji || "",
      unit: f.unit || st0.flow?.unit || "",
      value,
      series: [...prevSeries, value].slice(-24)
    };
    if (f.status) st0.status = f.status;
    st0.updatedAt = Date.now();
    await setJson(env, `live:${id}`, st0, 30 * 86400);
    const res0 = await editLivePost(env, job.target, job.messageId, st0);
    return res0 && res0.ok ? { ok: true, result: { message_id: job.messageId } } : { ok: false, description: res0?.description || "flow tick failed" };
  }
  const st = await getJson(env, `live:${id}`, null);
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
  await setJson(env, `live:${id}`, st, 30 * 86400);
  const res = await editLivePost(env, job.target, job.messageId, st);
  return res && res.ok ? { ok: true, result: { message_id: job.messageId } } : { ok: false, description: res?.description || "live tick failed" };
}

/* ══════════ community posts: the audience builds the post ══════════ */
async function communityAddLine(env, st, from, text) {
  const line = {
    uid: String(from?.id || ""),
    name: String(from?.first_name || from?.username || "عضو").slice(0, 30),
    at: Date.now(),
    text: String(text || "").replace(/\s+/g, " ").trim().slice(0, 200)
  };
  if (!line.text) return false;
  const dupe = (st.lines || []).some((l) => l.uid === line.uid && l.text === line.text);
  if (!dupe) {
    st.lines = [...(st.lines || []), line].slice(-60);
    st.updatedAt = Date.now();
  }
  await setJson(env, `comm:${st.id}`, st, 30 * 86400);
  await editPostMessage(env, st.chatId, st.msgId, { html: renderCommunityPost(st), replyMarkup: communityKeyboard(st) }).catch((e) => {
    console.warn("community edit failed", e?.message);
  });
  return true;
}
async function communityDispatch(msg, env, origin) {
  const uid = msg.from?.id;
  const text = String(msg.text || "").trim();
  if (!uid || !text || text.startsWith("/")) return false;
  const pend = await getJson(env, `st:${uid}`, null);
  if (!pend || pend.mode !== "community_line" || !pend.cid) return false;
  if (Date.now() - (pend.at || 0) > 30 * 60 * 1000) {
    await deleteKey(env, `st:${uid}`);
    return false;
  }
  const st = await getJson(env, `comm:${pend.cid}`, null);
  await deleteKey(env, `st:${uid}`);
  if (!st) return false;
  if (st.open === false) {
    await sendPostMessage(env, uid, { html: "✅ <b>این پست بسته شده است.</b>", replyMarkup: getStartKeyboard(origin) }).catch(() => {});
    return true;
  }
  const ok = await communityAddLine(env, st, msg.from, text);
  await sendPostMessage(env, uid, {
    html: ok
      ? `✅ <b>خطت اضافه شد!</b>\n\nهمین حالا در پست دیده می‌شود (${(st.lines || []).length} خط).`
      : "⚠️ خط خالی بود؛ دوباره بنویس.",
    replyMarkup: getStartKeyboard(origin)
  }).catch(() => {});
  return true;
}
async function handleCommunityCallback(cb, env, origin) {
  const qId = cb.id;
  const chatId = cb.message?.chat?.id;
  const msgId = cb.message?.message_id;
  const uid = cb.from?.id;
  const parts = String(cb.data || "").split(":");
  const id = parts[1] || "";
  const action = parts[2] || "";
  if (!id || !chatId || !msgId) return answerCallback(env, qId, "پیام پیدا نشد.", true);
  const st = await getJson(env, `comm:${id}`, null);
  if (!st) return answerCallback(env, qId, "این پست در دسترس نیست.", true);
  st.chatId = chatId;
  st.msgId = msgId;
  if (action === "add") {
    if (st.open === false) return answerCallback(env, qId, "این پست بسته شده 😊", true);
    await setJson(env, `st:${uid}`, { mode: "community_line", cid: id, at: Date.now() }, 1800);
    await answerCallback(env, qId, "✍️ خطت را در پیوی ربات بنویس");
    await sendPostMessage(env, uid, {
      html: `✍️ <b>خطت را برای پست «${escapeHtml(st.title || "")}» بنویس.</b>\n\nفقط یک خط — همین حالا در پست منتشر می‌شود.`,
      replyMarkup: getStartKeyboard(origin)
    }).catch(() => {});
    return;
  }
  if (action === "close") {
    if (String(st.founder) !== String(uid)) return answerCallback(env, qId, "فقط سازندهٔ پست می‌تواند ببندد", true);
    st.open = false;
    st.updatedAt = Date.now();
    await setJson(env, `comm:${id}`, st, 30 * 86400);
    await editPostMessage(env, chatId, msgId, { html: renderCommunityPost(st), replyMarkup: communityKeyboard(st) }).catch(() => {});
    return answerCallback(env, qId, "✅ پست کامل شد");
  }
  await editPostMessage(env, chatId, msgId, { html: renderCommunityPost(st), replyMarkup: communityKeyboard(st) }).catch(() => {});
  return answerCallback(env, qId, "به‌روز شد ♻️");
}


/* ══════════ three-state posts: one message, three depths ══════════ */
function deepKeyboard(st) {
  const levels = st.levels || {};
  return { inline_keyboard: Object.keys(levels).map((k) => ([{
    text: (k === st.level ? "\u25CF " : "") + (levels[k].label || k),
    callback_data: `deep:${st.id}:${k}`
  }])) };
}
async function handleDeepCallback(cb, env, origin) {
  const qId = cb.id;
  const chatId = cb.message?.chat?.id;
  const msgId = cb.message?.message_id;
  const parts = String(cb.data || "").split(":");
  const id = parts[1] || "";
  const level = parts[2] || "";
  const st = await getJson(env, `deep:${id}`, null);
  if (!st || !st.levels || !st.levels[level]) return answerCallback(env, qId, "این نسخه در دسترس نیست.", true);
  st.chatId = chatId;
  st.msgId = msgId;
  st.level = level;
  st.updatedAt = Date.now();
  await setJson(env, `deep:${id}`, st, 30 * 86400);
  await editPostMessage(env, chatId, msgId, { html: st.levels[level].html, replyMarkup: deepKeyboard(st) }).catch((e) => {
    console.warn("deep edit failed", e?.message);
  });
  return answerCallback(env, qId, `\u062D\u0627\u0644\u062A: ${st.levels[level].label || level}`);
}
