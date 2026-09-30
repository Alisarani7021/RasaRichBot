/* Patch: interactive templates API for the mini app.
   Adds /api/interactive/* — create a live poll, a multi-depth post or a native
   slideshow, list what the owner published, end a poll early or remove a post.
   Idempotent: refuses to run twice.
   Usage: node patch_interactive_api.mjs <bundle.js>                            */
import fs from 'node:fs';

const target = process.argv[2] || '/home/user/gh/worker/index.js';
let src = fs.readFileSync(target, 'utf8');
const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('"/api/interactive/') === 0, 'bundle already has the interactive API');

const BLOCK = `
  if (path.indexOf("/api/interactive/") === 0) {
    const need = path.slice("/api/interactive/".length);
    const escT = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const convT = (x) => {
      const s = String(x || "").trim();
      if (!s) return "";
      return HTML_TAG_RE.test(s) ? mixedToHtml(s) : mdToHtml(s);
    };
    const stripMediaIcons = (mk) => {
      if (!mk || !mk.inline_keyboard) return mk;
      return { ...mk, inline_keyboard: mk.inline_keyboard.map((row) => row.map((b) => {
        const { icon_custom_emoji_id, ...rest } = b;
        return rest;
      })) };
    };
    const sendAny = async (chatId, html, markup) => {
      let i = 0;
      const media = [];
      const mapped = String(html).replace(/<img[^>]+src=["']tg:\\/\\/photo\\?id=([^"']+)["'][^>]*\\/?>/gi, (full, fid) => {
        const mid = "m" + i++;
        media.push({ id: mid, media: { type: "photo", media: fid } });
        return full.replace(fid, mid);
      });
      const rich = { html: mapped, ...media.length ? { media } : {} };
      try {
        return await tg.sendRich(chatId, rich, markup ? { reply_markup: markup } : {});
      } catch (e) {
        const why = String(e?.description || e?.message || e);
        if (!markup || !/icon|emoji|custom/i.test(why)) throw e;
        return await tg.sendRich(chatId, rich, { reply_markup: stripMediaIcons(markup) });
      }
    };
    const box = async () => await store2.get(\`intx:\${uid}\`, { items: [] });
    const listAdd = async (entry) => {
      const b = await box();
      b.items = [entry, ...(b.items || [])].slice(0, 60);
      await store2.put(\`intx:\${uid}\`, b, 120 * 86400);
    };
    const findItem = async (id) => ((await box()).items || []).find((x) => String(x.id) === String(id)) || null;
    const dropItem = async (id) => {
      const b = await box();
      b.items = (b.items || []).filter((x) => String(x.id) !== String(id));
      await store2.put(\`intx:\${uid}\`, b, 120 * 86400);
    };

    if (need === "list") {
      const b = await box();
      const items = [];
      for (const it of (b.items || []).slice(0, 30)) {
        let votes = null;
        if (it.kind === "poll") {
          const st = await getJson(env, \`live:\${it.id}\`, null);
          votes = st ? Object.keys(st.votes || {}).length : null;
        }
        items.push({ ...it, votes });
      }
      return json({ ok: true, items });
    }

    const rawTarget = String(body?.target || "").trim();
    const toMe = !rawTarget || rawTarget === "me" || rawTarget === "self";
    let chatId = uid;
    if (!toMe) {
      const verdict = await (await channelCheck(tg, uid, rawTarget)).json();
      if (!verdict.ok) return json({ ok: false, error: "permissions", verdict });
      const parsed = parseTarget(rawTarget);
      if (!parsed) return bad("target");
      chatId = parsed.chat;
    }
    const linkOf = (msgId) => {
      const m = /^@([A-Za-z0-9_]{4,})$/.exec(rawTarget);
      return m ? \`https://t.me/\${m[1]}/\${msgId}\` : null;
    };
    const newId = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);

    if (need === "poll") {
      const title = String(body?.title || "").trim().slice(0, 120) || "\\u{1F5F3} \\u0646\\u0638\\u0631\\u0633\\u0646\\u062C\\u06CC \\u0632\\u0646\\u062F\\u0647";
      const subtitle = String(body?.subtitle || "").trim().slice(0, 300);
      const labels = (Array.isArray(body?.options) ? body.options : [])
        .map((x) => String(x || "").trim().slice(0, 60)).filter(Boolean).slice(0, 6);
      if (labels.length < 2) return bad("\\u062D\\u062F\\u0627\\u0642\\u0644 \\u062F\\u0648 \\u06AF\\u0632\\u06CC\\u0646\\u0647 \\u0644\\u0627\\u0632\\u0645 \\u0627\\u0633\\u062A");
      const minutes = Math.max(0, Math.min(10080, Number(body?.minutes) || 0));
      const id = newId("p");
      const state = {
        id, title, subtitle,
        options: labels.map((l, k) => ({ key: "o" + (k + 1), label: l })),
        votes: {}, createdAt: Date.now(), updatedAt: Date.now(),
        ...minutes ? { endsAt: Date.now() + minutes * 60000 } : {}
      };
      const sent = await sendAny(chatId, renderLivePost(state), liveKeyboard(state));
      await setJson(env, \`live:\${id}\`, state, 30 * 86400);
      const entry = { kind: "poll", id, title, at: Date.now(), chat: String(chatId), msg: sent.message_id, link: linkOf(sent.message_id), minutes };
      await listAdd(entry);
      return json({ ok: true, ...entry, message_id: sent.message_id });
    }

    if (need === "levels") {
      const title = String(body?.title || "").trim().slice(0, 120);
      const lv = body?.levels || {};
      const short = convT(lv.short);
      const mid = convT(lv.mid) || short;
      const full = convT(lv.full);
      if (!short || !full) return bad("\\u062E\\u0644\\u0627\\u0635\\u0647 \\u0648 \\u0646\\u0633\\u062E\\u0647\\u0654 \\u06A9\\u0627\\u0645\\u0644 \\u0644\\u0627\\u0632\\u0645 \\u0627\\u0633\\u062A");
      const id = newId("d");
      const levels = {
        short: { label: "\\u26A1 \\u062E\\u0644\\u0627\\u0635\\u0647\\u0654 \\u06F3\\u06F0 \\u062B\\u0627\\u0646\\u06CC\\u0647", html: short },
        mid: { label: "\\u{1F4D6} \\u0646\\u0633\\u062E\\u0647\\u0654 \\u0645\\u062A\\u0648\\u0633\\u0637", html: mid },
        full: { label: "\\u2705 \\u0646\\u0633\\u062E\\u0647\\u0654 \\u06A9\\u0627\\u0645\\u0644", html: full }
      };
      const head = title ? \`<h2>\${escT(title)}</h2>\\n\` : "";
      const rows = Object.keys(levels).map((k) => ([{
        text: (k === "short" ? "\\u25CF " : "") + levels[k].label,
        callback_data: \`deep:\${id}:\${k}\`
      }]));
      const sent = await sendAny(chatId, head + levels.short.html, { inline_keyboard: rows });
      await setJson(env, \`deep:\${id}\`, {
        id, chatId, msgId: sent.message_id, level: "short", levels,
        title: title || "", createdAt: Date.now(), updatedAt: Date.now()
      }, 30 * 86400);
      const entry = { kind: "levels", id, title: title || "\\u067E\\u0633\\u062A \\u0686\\u0646\\u062F\\u062D\\u0627\\u0644\\u062A\\u0647", at: Date.now(), chat: String(chatId), msg: sent.message_id, link: linkOf(sent.message_id) };
      await listAdd(entry);
      return json({ ok: true, ...entry, message_id: sent.message_id });
    }

    if (need === "slideshow") {
      const media = (Array.isArray(body?.media) ? body.media : [])
        .map((m) => ({ fileId: String(m?.fileId || "").trim() }))
        .filter((m) => m.fileId).slice(0, 8);
      if (media.length < 2) return bad("\\u062D\\u062F\\u0627\\u0642\\u0644 \\u062F\\u0648 \\u0639\\u06A9\\u0633 \\u0644\\u0627\\u0632\\u0645 \\u0627\\u0633\\u062A");
      const caption = String(body?.caption || "").trim().slice(0, 600);
      const html =
        (caption ? \`<p>\${escT(caption)}</p>\` : "") +
        "<tg-slideshow>" +
        media.map((m) => \`<img src="tg://photo?id=\${m.fileId}"/>\`).join("") +
        "</tg-slideshow>";
      const sent = await sendAny(chatId, html);
      const entry = { kind: "slideshow", id: newId("s"), title: caption.slice(0, 60) || "\\u0627\\u0633\\u0644\\u0627\\u06CC\\u062F\\u0634\\u0648", at: Date.now(), chat: String(chatId), msg: sent.message_id, link: linkOf(sent.message_id), count: media.length };
      await listAdd(entry);
      return json({ ok: true, ...entry, message_id: sent.message_id });
    }

    if (need === "end") {
      const id = String(body?.id || "");
      const st = await getJson(env, \`live:\${id}\`, null);
      if (!st) return bad("\\u067E\\u06CC\\u062F\\u0627 \\u0646\\u0634\\u062F", 404);
      st.endsAt = Date.now();
      st.updatedAt = Date.now();
      await setJson(env, \`live:\${id}\`, st, 30 * 86400);
      const it = await findItem(id);
      if (it?.chat && it?.msg) {
        await editPostMessage(env, Number(it.chat) || it.chat, it.msg, { html: renderLivePost(st), replyMarkup: liveKeyboard(st) }).catch(() => null);
      }
      return json({ ok: true, id });
    }

    if (need === "remove") {
      const id = String(body?.id || "");
      const it = await findItem(id);
      if (it?.chat && it?.msg) await tg.deleteMessage(Number(it.chat) || it.chat, it.msg).catch(() => null);
      const kind = String(body?.kind || it?.kind || "");
      if (kind === "poll") await deleteKey(env, \`live:\${id}\`);
      if (kind === "levels") await deleteKey(env, \`deep:\${id}\`);
      await dropItem(id);
      return json({ ok: true, id });
    }

    return bad("route", 404);
  }
`;

const ANCHOR = '  if (path === "/api/render" && request.method === "POST") return renderPayload(env, store2, uid, body);';
must(count(ANCHOR) === 1, 'render anchor not unique (' + count(ANCHOR) + ')');
src = src.replace(ANCHOR, BLOCK + '\n' + ANCHOR);

const API_TAIL = '  /^\\/api\\/landing\\//\n];';
must(count(API_TAIL) === 1, 'router tail not unique (' + count(API_TAIL) + ')');
src = src.replace(API_TAIL, '  /^\\/api\\/landing\\//,\n  /^\\/api\\/interactive\\//\n];');

/* the mini app url lives in a couple of keyboards — bump it so the new section shows */
const V_COUNT = count('/app?v=32');
src = src.split('/app?v=32').join('/app?v=33');

must(count('"/api/interactive/') === 2, 'endpoint block missing (' + count('"/api/interactive/') + ')');
must(count('/^\\/api\\/interactive\\//') === 1, 'router entry missing');
fs.writeFileSync(target, src);
console.log('✔ interactive API patched →', Buffer.byteLength(src), 'bytes (v=33 in', V_COUNT, 'places)');
