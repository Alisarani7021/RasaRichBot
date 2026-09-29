// رِسا Mini App API — Telegram-initData authenticated JSON endpoints powering
// the web studio at /app: session, live render, drafts, channels & direct publish.
import { cfg } from './config.js';
import { createTelegram } from './telegram.js';
import { Store } from './store.js';
import { mdToHtml, renderDoc, plain, esc, fixInlineMarkdown } from './rich/kit.js';import { stripPremium } from './rich/send.js';
import { analyze, repair } from './rich/validate.js';
import { libraryMap, premiumize as premiumizeHtml } from './emoji/index.js';
import { BUILTIN_TEMPLATES, builtinTemplate } from './flows/library.js';

/* ------------------------------------------------------------------ crypto */
const te = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmacBytes(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, typeof data === 'string' ? te.encode(data) : data));
}
const hmacHex = async (keyBytes, data) => hex(await hmacBytes(keyBytes, data));
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Validate a Telegram Mini App initData blob → parsed fields (or null). */
async function parseInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(String(initData || ''));
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheck = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = await hmacBytes(te.encode('WebAppData'), botToken); // HMAC("WebAppData", token)
    const calc = await hmacHex(secret, dataCheck);
    if (calc !== hash) return null;
    const authDate = Number(params.get('auth_date') || 0);
    if (authDate && Date.now() / 1000 - authDate > 60 * 60 * 24) return null;
    return Object.fromEntries(params.entries());
  } catch { return null; }
}

/* --------------------------------------------------------- session tokens */
async function issueToken(botToken, user) {
  const body = JSON.stringify({ uid: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(' '), user: user.username || '', exp: Date.now() + 12 * 3600 * 1000 });
  const payload = b64url(te.encode(body));
  const sig = await hmacHex(te.encode(botToken + '::rasa-app'), payload);
  return `${payload}.${sig.slice(0, 32)}`;
}
async function verifyToken(botToken, token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const calc = await hmacHex(te.encode(botToken + '::rasa-app'), payload);
  if (calc.slice(0, 32) !== sig) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(unb64(payload)));
    if (!body.uid || body.exp < Date.now()) return null;
    return body;
  } catch { return null; }
}

/* -------------------------------------------------------------- tiny http */
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
});
const bad = (msg, status = 400) => json({ ok: false, error: msg }, status);

/* ------------------------------------------------------ mixed md+html → html */
const HTML_TAG_RE = /<\/?[a-z][\s\S]*?>/i;
function mixedToHtml(text) {
  if (!HTML_TAG_RE.test(text)) return mdToHtml(text);
  // split into runs: lines containing html tags stay raw, pure-markdown runs go mdToHtml
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let mdBuf = [];
  const flush = () => {
    if (!mdBuf.length) return;
    const chunk = mdBuf.join('\n');
    // whole run has no '<' → safe to md-convert
    if (HTML_TAG_RE.test(chunk)) out.push(chunk);
    else out.push(mdToHtml(chunk));
    mdBuf = [];
  };
  for (const l of lines) {
    if (HTML_TAG_RE.test(l)) { flush(); out.push(l); }
    else mdBuf.push(l);
  }
  flush();
  return fixInlineMarkdown(out.join('\n'));
}

/* ------------------------------------------------------------------ render */
async function renderPayload(store, uid, body) {
  const text = String(body?.text || '').trim().slice(0, 3900);
  if (!text) return bad('empty');
  let html;
  if (HTML_TAG_RE.test(text)) {
    const mixed = mixedToHtml(text);
    const a = analyze(mixed);
    html = a.ok ? mixed : repair(mixed);
  } else {
    html = mdToHtml(text);
  }
  const map = await libraryMap(store);
  let final = html;
  if (map.size) {
    const premium = premiumizeHtml(html, map);
    if (premium !== html) final = premium;
  }
  return json({ ok: true, html: final, plain: plain(final).slice(0, 120), premium: final !== html });
}

/* ---------------------------------------------------------------- channels */
function parseTarget(raw) {
  raw = String(raw || '').trim();
  if (/^@[A-Za-z0-9_]{4,}$/.test(raw)) return { chat: raw };
  if (/^-100\d{10,}$/.test(raw)) return { chat: Number(raw) };
  return null;
}

async function channelCheck(tg, uid, targetRaw) {
  const target = parseTarget(targetRaw);
  if (!target) return bad('target');
  const chatId = target.chat;
  let me, them, chat;
  try { chat = await tg.getChat(chatId); } catch (e) { return bad(`chat: ${String(e.description || e.message || e).slice(0, 120)}`); }
  const bot = await tg.getMe().catch(() => null);
  try {
    me = await tg.getChatMember(chatId, bot?.id || 0);
  } catch (e) { return bad(`bot membership: ${String(e.description || e.message || e).slice(0, 120)}`); }
  try { them = await tg.getChatMember(chatId, uid); } catch (e) { them = null; }
  const botAdmin = ['administrator', 'creator'].includes(me?.status) && me.can_post_messages !== false;
  const userAdmin = ['administrator', 'creator'].includes(them?.status);
  return json({
    ok: botAdmin && userAdmin, title: chat?.title || String(chatId), username: chat?.username || '',
    bot: { admin: botAdmin }, user: { admin: userAdmin, status: them?.status || 'unknown' }
  });
}


/* ----------------------------------------- button url hygiene (publish) --- */
const BTN_ROW_ALL = /<tg-button-row\b[^>]*>[\s\S]*?<\/tg-button-row>/gi;
const BTN_TAG_ALL = /<tg-button(?=[\s>/])([^>]*)>([\s\S]*?)<\/tg-button>/gi;
const URL_SCHEME_OK = /^\s*(?:https?:\/\/|tg:\/\/)/i;
const BTN_ATTR = (attrs, name) => {
  const src = String(attrs);
  const idx = src.toLowerCase().indexOf(name.toLowerCase() + '=');
  if (idx < 0) return undefined;
  let j = idx + name.length + 1;
  while (src[j] === ' ' || src[j] === '\t') j++;
  const q = src[j];
  if (q !== '"' && q !== "'") {
    const m = /^[^\s>]*/.exec(src.slice(j));
    return m && m[0] ? m[0] : undefined;
  }
  const k = src.indexOf(q, j + 1);
  return k < 0 ? undefined : src.slice(j + 1, k);
};

/** Drop url-buttons with invalid urls, decode &amp; in urls; prune empty rows. */
function sanitizeRichButtons(html) {
  let dropped = 0, repaired = 0;
  const out = String(html || '').replace(BTN_ROW_ALL, (row) => {
    const fixed = row.replace(BTN_TAG_ALL, (tag, attrs) => {
      const type = (BTN_ATTR(attrs, 'type') || 'url').toLowerCase();
      if (type !== 'url') return tag;
      const rawUrl = BTN_ATTR(attrs, 'url');
      const url = (rawUrl || '').replace(/&amp;/g, '&#38;').replace(/&#38;/g, '&').trim();
      if (rawUrl === undefined || !URL_SCHEME_OK.test(url)) { dropped++; return ''; }
      if (rawUrl !== url) { repaired++; return tag.replace(/url\s*=\s*("[^"]*"|'[^']*')/i, 'url="' + url.replace(/"/g, '%22') + '"'); }
      return tag;
    });
    return /<tg-button\b/i.test(fixed) ? fixed : '';
  });
  return { html: out.replace(/\n{3,}/g, '\n\n'), dropped, repaired };
}

/** Nuclear option: remove every button row (telegram rejected urls anyway). */
const stripAllButtonRows = (html) => String(html || '').replace(BTN_ROW_ALL, '').replace(/\n{3,}/g, '\n\n');

/** Last resort keyboard for the plain-text fallback: url buttons with valid urls only. */
function replyMarkupFromRich(html) {
  const rows = [];
  String(html || '').replace(BTN_ROW_ALL, (row) => {
    const btns = [];
    row.replace(BTN_TAG_ALL, (tag, attrs, label) => {
      const type = (BTN_ATTR(attrs, 'type') || 'url').toLowerCase();
      const url = (BTN_ATTR(attrs, 'url') || '').replace(/&amp;/g, '&#38;').replace(/&#38;/g, '&').trim();
      if (type === 'url' && URL_SCHEME_OK.test(url)) btns.push({ text: plain(label).trim() || 'پیوند', url });
      return '';
    });
    if (btns.length) rows.push(btns);
    return '';
  });
  return rows.length ? { inline_keyboard: rows } : null;
}

/* ------------------------------------------------------------------ publish */
async function publishNow(tg, targetRaw, rich, uid) {
  const target = parseTarget(targetRaw);
  if (!target) return bad('target');
  let clean = String(rich?.html || rich?.markdown || '').trim();
  if (!clean) return bad('empty');
  // markdown runs from the app serializer become real blocks (same as /api/render)
  clean = HTML_TAG_RE.test(clean) ? mixedToHtml(clean) : mdToHtml(clean);
  const notices = [];
  // 0) hygiene: never let one bad button url sink the whole document
  const sane = sanitizeRichButtons(clean);
  const payload = { ...rich, html: sane.html };
  if (sane.dropped) notices.push(`حذف ${sane.dropped} دکمه با آدرس نامعتبر`);
  if (sane.repaired) notices.push(`اصلاح آدرس ${sane.repaired} دکمه`);
  const linkFor = (mid) => (typeof target.chat === 'string' ? `https://t.me/${target.chat.replace(/^@/, '')}/${mid || ''}` : null);
  // 0b) premium-in-channel (Bot API 9.4 blocks bot custom emoji in channel posts, but NOT in
  //     private chats) — the user's own trick, automated: DM → copy → channel, emojis alive ✨
  let chatType = typeof target.chat === 'string' ? 'channel' : null;
  if (chatType === null && /<tg-emoji/i.test(sane.html)) {
    const info = await tg.getChat(target.chat).catch(() => null);
    chatType = info?.type || null;
  }
  if (chatType === 'channel' && /<tg-emoji/i.test(sane.html) && uid) {
    try {
      const dm = await tg.sendRich(uid, payload);
      let post = await tg.call('copyMessage', { chat_id: target.chat, from_chat_id: uid, message_id: dm.message_id }).catch(() => null);
      let via = 'premium-dm-copy';
      if (!post || !post.message_id) {
        via = 'premium-dm-forward';
        post = await tg.call('forwardMessage', { chat_id: target.chat, from_chat_id: uid, message_id: dm.message_id });
      }
      await tg.deleteMessage(uid, dm.message_id).catch(() => {});
      notices.push('اموجی‌های پرمیوم از مسیر پیوی زنده ماندند ✨');
      return json({ ok: true, link: linkFor(post.message_id), message_id: post.message_id, via, notices });
    } catch (route) {
      notices.push('مسیر پرمیوم در دسترس نبود؛ نسخهٔ ساده منتشر شد');
      payload.html = stripPremium(sane.html);
    }
  }
  try {
    let sent;
    try {
      sent = await tg.sendRich(target.chat, payload);
    } catch (first) {
      const why = String(first?.description || first?.message || first);
      if (/BUTTON_URL_INVALID/i.test(why)) {
        // 1) telegram still unhappy about urls → drop every button row, keep the document rich
        sent = await tg.sendRich(target.chat, { ...payload, html: stripAllButtonRows(sane.html) });
        notices.push('تلگرام آدرس دکمه‌ها را رد کرد؛ سند بدون دکمه ارسال شد');
      } else if (sane.html.includes('<tg-emoji') && /emoji/i.test(why)) {
        // 2) premium emoji unavailable here → unicode equivalents, same ladder as the bot flows
        sent = await tg.sendRich(target.chat, { ...payload, html: stripPremium(sane.html) });
        notices.push('اموجی‌های پرمیوم با معادل ساده ارسال شد');
      } else throw first;
    }
    const body = { ok: true, link: linkFor(sent?.message_id || ''), message_id: sent?.message_id || null };
    if (notices.length) body.notices = notices;
    return json(body);
  } catch (all) {
    // 3) honest final fallback: plain text + surviving url-buttons as a native keyboard
    const kb = replyMarkupFromRich(sane.html);
    try {
      const sent = await tg.sendMessage(target.chat, plain(clean).slice(0, 3900), kb ? { reply_markup: kb } : {});
      const body = {
        ok: true, simplified: 'plain-text',
        reason: String(all?.description || all?.message || 'rich send failed').slice(0, 160),
        link: linkFor(sent?.message_id || ''), message_id: sent?.message_id || null
      };
      if (notices.length) body.notices = notices;
      return json(body);
    } catch (final) {
      return bad(`publish: ${String(final?.description || final?.message || final).slice(0, 140)}`);
    }
  }
}

/* ------------------------------------------------------------------- router */
export { sanitizeRichButtons, replyMarkupFromRich, stripAllButtonRows };

export async function handleMiniAppApi(request, env, url) {
  const config = cfg(env);
  const token = config.token || env.BOT_TOKEN;
  if (!token) return bad('no bot token', 500);
  const tg = createTelegram(env, config);
  const store = new Store(env, config);
  const path = url.pathname;
  const cors = { 'access-control-allow-origin': '*' };

  if (request.method === 'POST' && path === '/api/session') {
    let body; try { body = await request.json(); } catch { return bad('body'); }
    const fields = await parseInitData(body?.initData || '', token);
    if (!fields) return bad('initData', 401);
    let user = {};
    try { user = JSON.parse(fields.user || '{}'); } catch { return bad('user'); }
    const access = await issueToken(token, user);
    return json({ ok: true, token: access, user: { id: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(' '), username: user.username || '' } });
  }

  const session = await verifyToken(token, request.headers.get('x-rasa-token') || url.searchParams.get('t'));
  if (!session) return bad('session', 401);
  const uid = session.uid;

  /* ------- premium emoji picker feeds ------- */
  if (path === '/api/emoji/all' && request.method === 'GET') {
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const ckey = new Request('https://cache.local/emoji-all');
    const hit = cache ? await cache.match(ckey) : null;
    if (hit) return hit;
    const packsMap = await store.get('emoji:packs', {});
    const names = Object.keys(packsMap || {});
    const sets = await Promise.all(names.map((n) => tg.call('getStickerSet', { name: n }).catch(() => null)));
    const packs = (sets || [])
      .filter((r) => r && r.sticker_type === 'custom_emoji')
      .map((r) => ({
        name: r.name, title: r.title,
        items: (r.stickers || []).filter((x) => x.custom_emoji_id).map((x) => ({ id: x.custom_emoji_id, e: x.emoji || '⭐' }))
      }));
    const res = json({ ok: true, packs }, 200, { 'cache-control': 'max-age=1800' });
    if (cache) await cache.put(ckey, res.clone());
    return res;
  }
  if (path === '/api/emoji/img' && request.method === 'GET') {
    const id = String(url.searchParams.get('id') || '').replace(/\D/g, '');
    if (!id) return new Response('bad id', { status: 400 });
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const ckey = new Request('https://cache.local/emoji-img/' + id);
    const hit = cache ? await cache.match(ckey) : null;
    if (hit) return hit;
    const arr = await tg.call('getCustomEmojiStickers', { custom_emoji_ids: [id] }).catch(() => null);
    const st = Array.isArray(arr) ? arr[0] : null;
    if (!st) return new Response('not found', { status: 404 });
    const fileId = (st.thumbnail && st.thumbnail.file_id) || (!st.is_animated && !st.is_video ? st.file_id : null);
    if (!fileId) return new Response('no preview', { status: 404 });
    const f = await tg.call('getFile', { file_id: fileId }).catch(() => null);
    if (!f || !f.file_path) return new Response('no file', { status: 404 });
    const up = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`);
    if (!up.ok || !up.body) return new Response('upstream', { status: 502 });
    // normalise: telegram often serves generic octet-stream; sniff from file extension
    const ext = (f.file_path.split('.').pop() || '').toLowerCase();
    const sniff = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', mp4: 'video/mp4' };
    const ct = up.headers.get('content-type');
    const ctype = !ct || /octet-stream|binary/.test(ct) ? (sniff[ext] || 'image/webp') : ct;
    const res = new Response(up.body, {
      headers: { 'content-type': ctype, 'cache-control': 'public, max-age=31536000, immutable' }
    });
    if (cache) await cache.put(ckey, res.clone());
    return res;
  }

  if (request.method === 'GET' && path === '/api/context') {
    const [prefs, drafts, templates, media] = await Promise.all([
      store.prefs(uid), store.listDrafts(uid), store.listTemplates(uid), store.mediaLibrary(uid)
    ]);
    const channels = await store.get(`appc:${uid}`, { items: [] });
    return json({
      ok: true,
      name: session.name, lang: prefs.lang || 'fa',
      drafts: drafts.map((d) => ({ id: d.id, title: d.title || plain((d.rich?.html) || (d.rich?.markdown) || '').slice(0, 60), at: d.at })),
      templates: [...BUILTIN_TEMPLATES.map((t, i) => ({ id: `b:${i}`, title: t.fa, builtin: true })), ...templates.map((t) => ({ id: t.id, title: t.title, at: t.at }))],
      media: (media.items || []).map((m) => ({ name: m.name, kind: m.kind, fileId: m.fileId })),
      channels: channels.items
    });
  }

  // ── media upload from mini app gallery ──
  if (path === '/api/media/upload' && request.method === 'POST') {
    try {
      // accept multipart/form-data
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return bad('file missing');
      const mime = file.type || '';
      let kind = 'photo';
      let method = 'sendPhoto';
      let param = 'photo';
      if (mime.startsWith('video')) { kind='video'; method='sendVideo'; param='video'; }
      else if (mime.startsWith('audio')) { kind='audio'; method='sendAudio'; param='audio'; }
      else if (mime === 'image/gif') { kind='animation'; method='sendAnimation'; param='animation'; }
      // Telegram file upload via FormData
      const fd = new FormData();
      fd.append('chat_id', String(uid));
      fd.append(param, file, file.name || 'upload');
      // disable notification to avoid spam
      fd.append('disable_notification', 'true');
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method:'POST', body: fd });
      const tj = await tgRes.json();
      if (!tj.ok) return bad(`telegram ${method}: ${tj.description || 'failed'}`);
      let fileId = null;
      if (kind === 'photo') {
        const arr = tj.result.photo || [];
        fileId = arr.length ? arr[arr.length-1].file_id : null;
      } else if (kind === 'video') fileId = tj.result.video?.file_id || tj.result.document?.file_id;
      else if (kind === 'audio') fileId = tj.result.audio?.file_id || tj.result.voice?.file_id;
      else if (kind === 'animation') fileId = tj.result.animation?.file_id || tj.result.document?.file_id;
      if (!fileId) return bad('no file_id from telegram');
      const item = { name: file.name || `media-${Date.now()}`, kind, fileId, at: Date.now(), size: file.size || 0 };
      await store.saveMedia(uid, item);
      // بلافاصله پیام کش موقت ربات را پاک کن تا چت شلوغ نشود — file_id همچنان معتبر می‌ماند
      try { await tg.deleteMessage(uid, tj.result.message_id); } catch {}
      return json({ ok:true, media: item });
    } catch (e) {
      console.error('media upload error', e);
      return bad(`upload: ${String(e.message||e).slice(0,200)}`);
    }
  }

  let body = {};
  if (request.method === 'POST') { try { body = await request.json(); } catch { return bad('body'); } }

  if (path === '/api/render' && request.method === 'POST') return renderPayload(store, uid, body);
  if (path === '/api/channel/check' && request.method === 'POST') return channelCheck(tg, uid, body?.target);
  if (path === '/api/channel/add' && request.method === 'POST') {
    const probe = await channelCheck(tg, uid, body?.target);
    const data = await probe.json();
    if (!data.ok) return json({ ...data, ok: false });
    const list = await store.get(`appc:${uid}`, { items: [] });
    const target = parseTarget(body.target);
    const chatId = String(target.chat);
    if (!list.items.some((c) => String(c.chat) === chatId)) {
      list.items.push({ chat: chatId, title: data.title, username: data.username, at: Date.now() });
      await store.put(`appc:${uid}`, list);
    }
    return json({ ok: true, title: data.title, channels: list.items });
  }
  if (path === '/api/channel/remove' && request.method === 'POST') {
    const list = await store.get(`appc:${uid}`, { items: [] });
    list.items = list.items.filter((c) => String(c.chat) !== String(body?.chat || ''));
    await store.put(`appc:${uid}`, list);
    return json({ ok: true, channels: list.items });
  }
  if (path === '/api/draft/save' && request.method === 'POST') {
    const html = String(body?.html || '').trim();
    if (!html) return bad('empty');
    const draft = await store.addDraft(uid, { title: String(body?.title || plain(html).slice(0, 40)).slice(0, 60), rich: { html }, source: 'miniapp' });
    return json({ ok: true, draft: { id: draft.id, title: draft.title } });
  }
  if (path === '/api/draft/load' && request.method === 'POST') {
    const found = await store.getDraft(uid, String(body?.id || ''));
    if (!found) return bad('draft', 404);
    const html = found.rich?.html || found.rich?.markdown || (found.doc ? renderDoc(found.doc).html : '');
    return json({ ok: true, html, title: found.title });
  }
  if (path === '/api/draft/delete' && request.method === 'POST') {
    await store.deleteDraft(uid, String(body?.id || ''));
    return json({ ok: true });
  }
  if (path === '/api/template/load' && request.method === 'POST') {
    if (String(body?.id || '').startsWith('b:')) {
      const idx = Number(String(body.id).slice(2));
      const tpl = BUILTIN_TEMPLATES[idx];
      if (!tpl) return bad('template', 404);
      const built = builtinTemplate(tpl.key, 'fa');
      const html = built?.html || (built?.doc ? renderDoc(built.doc).html : '') || (built?.rich?.html) || '';
      return json({ ok: true, title: tpl.fa, html });
    }
    const found = await store.getTemplate(uid, String(body?.id || ''));
    if (!found) return bad('template', 404);
    const html = found.rich?.html || found.rich?.markdown || (found.doc ? renderDoc(found.doc).html : '') || '';
    return json({ ok: true, title: found.title, html });
  }
  if (path === '/api/publish' && request.method === 'POST') {
    const check = await channelCheck(tg, uid, body?.target);
    const verdict = await check.json();
    if (!verdict.ok) return json({ ok: false, error: 'permissions', verdict });
    return publishNow(tg, body?.target, body?.rich || { html: body?.html }, uid);
  }
  return bad('route', 404);
}
