// رِسا Mini App API — Telegram-initData authenticated JSON endpoints powering
// the web studio at /app: session, live render, drafts, channels & direct publish.
import { cfg } from './config.js';
import { createTelegram } from './telegram.js';
import { Store } from './store.js';
import { mdToHtml, renderDoc, plain, esc, fixInlineMarkdown } from './rich/kit.js';import { stripPremium } from './rich/send.js';
import { analyze, repair } from './rich/validate.js';
import { libraryMap, premiumize as premiumizeHtml } from './emoji/index.js';
import { BUILTIN_TEMPLATES, builtinTemplate } from './flows/library.js';

/* ------------------------------------------------------------- forward credit */
// هر فوروارد لینک = ۱ اعتبار، با توکن یک‌بارمصرف تا تکراری حساب نشود.
// این سقف‌ها فقط جلوی سوءاستفاده‌ی خودکار را می‌گیرند، نه کاربر واقعی.
const FWD_DAILY_LIMIT = 20;      // حداکثر اعتبار روزانه از راه فوروارد
const FWD_MINT_GAP_MS = 5000;    // فاصله بین دو درخواست لینک فوروارد
const FWD_CREDIT_GAP_MS = 10000; // فاصله بین دو اعتبار فوروارد
const FWD_TOKEN_TTL_MS = 30 * 86400000;

/* ------------------------------------------------------------------ ai keys */
// مدل‌های کلاسیفایر/تبدیل صدا/امبدینگ نمی‌توانند پست بنویسند؛ اگر اشتباهی
// انتخاب شوند درخواست generate با خطای «text classification models» می‌خورد.
const NON_CHAT_MODEL_RE = /(prompt-guard|safeguard|whisper|tts|orpheus|embed|moderation|rerank|classif|distilbert|bge-|e5-)/i;
const CHAT_PREF = [
  /gpt-oss-120b/i, /qwen3\.8-27b/i, /deepseek/i, /llama-4/i, /gpt-oss-20b/i,
  /llama-3\.3-70b/i, /qwen3/i, /gpt-4o/i, /llama-3\.1-8b/i, /mixtral/i, /mistral/i, /gemma/i
];

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
function normalizeAiUrl(u) {
  u = String(u || '').trim().replace(/\/$/, '');
  if (/\/chat\/completions$/i.test(u)) return u;
  if (/\/v1$/i.test(u) || /\/v1\/openai$/i.test(u) || /openai\/v1$/i.test(u)) return u + '/chat/completions';
  if (/\/v1\/models$/i.test(u)) return u.replace(/\/models$/i, '/chat/completions');
  if (!/\/v1/.test(u)) return u + '/v1/chat/completions';
  return u + '/chat/completions';
}

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
  // ── invite / credits ──
  if (path === '/api/invite/status' && request.method === 'POST') {
    const data = await store.get(`invites:${uid}`, { invited: [], forwards: [], credits: 0, total: 0, used: 0, sigKept: 0 });
    const log = data.fwdLog || { day: '', n: 0, last: 0 };
    const today = new Date().toISOString().slice(0, 10);
    return json({
      ok: true,
      invited: data.invited || [], forwards: data.forwards || [],
      credits: data.credits || 0, total: data.total || 0,
      used: data.used || 0, sigKept: data.sigKept || 0,
      fwdDay: log.day === today ? log.n || 0 : 0,
      fwdDayLimit: FWD_DAILY_LIMIT,
      fwdCooldownSec: FWD_CREDIT_GAP_MS / 1000
    });
  }
  if (path === '/api/invite/fwd-token' && request.method === 'POST') {
    // یک توکن تازه برای «لینک فوروارد» می‌سازد؛ مصرف توکن همان لحظه‌ی فوروارد ثبت می‌شود.
    const data = await store.get(`invites:${uid}`, { invited: [], forwards: [], credits: 0, total: 0, fwdTokens: [] });
    const now = Date.now();
    const log = data.fwdLog || { day: '', n: 0, last: 0 };
    const today = new Date(now).toISOString().slice(0, 10);
    if (log.day !== today) { log.day = today; log.n = 0; }
    if (log.mintAt && now - log.mintAt < FWD_MINT_GAP_MS) {
      return json({ ok: false, error: 'کمی صبر کن و دوباره بزن', retryIn: Math.ceil((FWD_MINT_GAP_MS - (now - log.mintAt)) / 1000) }, 429);
    }
    const token = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Math.random()).slice(2) + now).slice(0, 16);
    const kept = (data.fwdTokens || []).filter((x) => x && !x.used && now - (x.at || 0) < FWD_TOKEN_TTL_MS).slice(-24);
    kept.push({ t: token, at: now, used: 0 });
    data.fwdTokens = kept;
    log.mintAt = now;
    data.fwdLog = log;
    await store.put(`invites:${uid}`, data);
    return json({ ok: true, token, link: `https://t.me/RasaRichBot?start=f_${uid}_${token}`, fwdDay: log.n || 0, fwdDayLimit: FWD_DAILY_LIMIT });
  }
  if (path === '/api/invite/fwd-credit' && request.method === 'POST') {
    const token = String(body?.token || '').trim();
    if (!token) return bad('token');
    const data = await store.get(`invites:${uid}`, null);
    if (!data) return bad('no record');
    const rec = (data.fwdTokens || []).find((x) => x && x.t === token);
    if (!rec) return json({ ok: false, error: 'این لینک معتبر نیست — دوباره دکمه‌ی فوروارد را بزن' }, 409);
    if (rec.used) return json({ ok: false, error: 'این فوروارد قبلاً ثبت شده — تکراری حساب نمی‌شود' }, 409);
    const now = Date.now();
    const log = data.fwdLog || { day: '', n: 0, last: 0 };
    const today = new Date(now).toISOString().slice(0, 10);
    if (log.day !== today) { log.day = today; log.n = 0; }
    if ((log.n || 0) >= FWD_DAILY_LIMIT) return json({ ok: false, error: `سقف امروز پر شد (${FWD_DAILY_LIMIT} اعتبار) — فردا دوباره بزن`, fwdDay: log.n, fwdDayLimit: FWD_DAILY_LIMIT }, 429);
    if (log.last && now - log.last < FWD_CREDIT_GAP_MS) return json({ ok: false, error: `بین دو فوروارد ${FWD_CREDIT_GAP_MS / 1000} ثانیه صبر کن`, retryIn: Math.ceil((FWD_CREDIT_GAP_MS - (now - log.last)) / 1000) }, 429);
    rec.used = 1;
    log.n = (log.n || 0) + 1;
    log.last = now;
    data.fwdLog = log;
    data.credits = (data.credits || 0) + 1;
    data.total = (data.total || 0) + 1;
    await store.put(`invites:${uid}`, data);
    return json({ ok: true, credits: data.credits, fwdDay: log.n, fwdDayLimit: FWD_DAILY_LIMIT });
  }
  if (path === '/api/invite/forward' && request.method === 'POST') {
    // legacy: ثبت دستی با آیدی چت — UI دیگر از این استفاده نمی‌کند، برای سازگاری نگه داشته شده
    const targetRaw = String(body?.target || '').trim();
    if (!targetRaw) return bad('target');
    const norm = targetRaw.toLowerCase();
    const data = await store.get(`invites:${uid}`, { invited: [], forwards: [], credits: 0, total: 0 });
    const forwards = new Set(data.forwards || []);
    if (forwards.has(norm)) return json({ ok: true, credits: data.credits || 0, message: 'این چت قبلاً حساب شده' });
    try {
      const chatId = /^@/.test(targetRaw) ? targetRaw : /^-100\d+/.test(targetRaw) ? Number(targetRaw) : targetRaw;
      const chatInfo = await tg.getChat(chatId);
      if (!chatInfo) throw new Error('no chat');
    } catch {
      return json({ ok: false, error: 'چت پیدا نشد — مطمئن شو ربات تو اون چت/گروه هست یا @username درسته' }, 400);
    }
    forwards.add(norm);
    data.forwards = [...forwards];
    data.credits = (data.credits || 0) + 1;
    data.total = (data.total || 0) + 1;
    await store.put(`invites:${uid}`, data);
    return json({ ok: true, credits: data.credits, total: data.total, forwards: data.forwards });
  }

  // ── media library ──
  if (path === '/api/media/delete' && request.method === 'POST') {
    const name = String(body?.name || '').trim();
    const idx = Number(body?.idx);
    const lib = await store.get(`m:${uid}`, { items: [] });
    if (!Number.isNaN(idx) && idx >= 0 && idx < lib.items.length) lib.items.splice(idx, 1);
    else if (name) lib.items = lib.items.filter((it) => it.name !== name && it.fileId !== name);
    else return bad('name or idx required');
    await store.put(`m:${uid}`, lib);
    return json({ ok: true, items: lib.items });
  }

  // ── draft metadata (tags / folder / favourite) ──
  if (path === '/api/draft/update' && request.method === 'POST') {
    const id = String(body?.id || '');
    const draft = await store.getDraft(uid, id);
    if (!draft) return bad('draft', 404);
    const patch = {};
    if (body?.title !== undefined) patch.title = String(body.title).slice(0, 80);
    if (body?.tags !== undefined) patch.tags = String(body.tags).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (body?.folder !== undefined) patch.folder = String(body.folder).slice(0, 30);
    if (body?.fav !== undefined) patch.fav = !!body.fav;
    const updated = { ...draft, ...patch, at: Date.now() };
    await store.put(`d:${uid}:${id}`, updated);
    const idx = await store.get(`d:${uid}:index`, { items: [] });
    const row = idx.items.find((x) => String(x.id) === String(id));
    if (row) { row.title = updated.title || row.title; row.at = updated.at; await store.put(`d:${uid}:index`, idx); }
    return json({ ok: true, draft: updated });
  }

  // ── brand kit ──
  if (path === '/api/brand/list' && request.method === 'POST') {
    const data = await store.get(`brand:${uid}`, { items: [] });
    return json({ ok: true, brands: data.items || [] });
  }
  if (path === '/api/brand/save' && request.method === 'POST') {
    const data = await store.get(`brand:${uid}`, { items: [] });
    const id = String(body?.id || '') || `b${Date.now()}`;
    const item = {
      id,
      name: String(body?.name || '').trim().slice(0, 40) || 'برند من',
      colors: body?.colors || {},
      footer: String(body?.footer || '').slice(0, 500),
      btnStyle: String(body?.btnStyle || 'primary'),
      at: Date.now()
    };
    const items = [item, ...(data.items || []).filter((x) => x.id !== id)].slice(0, 20);
    await store.put(`brand:${uid}`, { items });
    return json({ ok: true, brand: item, brands: items });
  }
  if (path === '/api/brand/delete' && request.method === 'POST') {
    const data = await store.get(`brand:${uid}`, { items: [] });
    data.items = (data.items || []).filter((x) => String(x.id) !== String(body?.id || ''));
    await store.put(`brand:${uid}`, data);
    return json({ ok: true, brands: data.items });
  }

  // ── scheduler ──
  if (path === '/api/schedule/list' && request.method === 'POST') {
    // job های رسیده همین‌جا (به‌صورت lazy) منتشر می‌شوند؛ cron هم همان تابع را صدا می‌زند
    const data = await store.get(`sched:${uid}`, { jobs: [] });
    const now = Date.now();
    const pending = [];
    const done = [];
    for (const j of data.jobs || []) {
      if (j.status === 'pending' && j.scheduledAt && j.scheduledAt <= now) {
        try { await publishNow(tg, j.target, { html: j.html }, uid); j.status = 'done'; j.doneAt = now; done.push(j); }
        catch { pending.push(j); }
      } else pending.push(j);
    }
    if (done.length) { data.jobs = [...done, ...pending].slice(0, 50); await store.put(`sched:${uid}`, data); }
    return json({ ok: true, jobs: data.jobs || [] });
  }
  if (path === '/api/schedule/create' && request.method === 'POST') {
    const target = String(body?.target || '').trim();
    const html = String(body?.html || '').trim();
    const scheduledAt = Number(body?.scheduledAt || 0);
    const deleteAfter = Number(body?.deleteAfter || 0);
    if (!target || !html) return bad('target/html');
    if (!scheduledAt || scheduledAt < Date.now()) return bad('scheduledAt must be future');
    const data = await store.get(`sched:${uid}`, { jobs: [] });
    const job = { id: `j${Date.now()}${Math.floor(Math.random() * 1000)}`, target, html: html.slice(0, 32000), scheduledAt, deleteAfter: deleteAfter || 0, status: 'pending', createdAt: Date.now() };
    data.jobs = [job, ...(data.jobs || [])].slice(0, 50);
    await store.put(`sched:${uid}`, data);
    try {
      const g = await store.get('sched_global', { ids: [] });
      g.ids = [{ id: job.id, uid, at: scheduledAt }, ...(g.ids || [])].slice(0, 500);
      await store.put('sched_global', g);
    } catch { /* index is best-effort */ }
    return json({ ok: true, job });
  }
  if (path === '/api/schedule/delete' && request.method === 'POST') {
    const data = await store.get(`sched:${uid}`, { jobs: [] });
    data.jobs = (data.jobs || []).filter((j) => String(j.id) !== String(body?.id || ''));
    await store.put(`sched:${uid}`, data);
    return json({ ok: true, jobs: data.jobs });
  }

  // ── link import (OG tags → rich blocks) ──
  if (path === '/api/import/url' && request.method === 'POST') {
    const urlStr = String(body?.url || '').trim();
    if (!urlStr || !/^https?:\/\//i.test(urlStr)) return bad('url');
    try {
      const res = await fetch(urlStr, { headers: { 'user-agent': 'RasaBot/1.0' } });
      const page = await res.text();
      const title = (page.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim().slice(0, 120) || '';
      const desc = ((page.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
        || page.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i)) || [])[1] || '';
      const image = (page.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
      let out = '';
      if (title) out += `<h2>${esc(title)}</h2>\n`;
      if (desc) out += `<p>${esc(desc.slice(0, 800))}</p>\n`;
      if (image) out += `<img src="${esc(image)}"/>\n`;
      out += `<p><a href="${esc(urlStr)}">منبع اصلی</a></p>`;
      return json({ ok: true, html: out, title, image });
    } catch (e) {
      return bad(`import failed: ${String(e.message || e).slice(0, 120)}`);
    }
  }

  // ── AI studio (per-user key, OpenAI-compatible) ──
  if (path === '/api/ai/config' && request.method === 'POST') {
    const key = String(body?.key || '').trim().slice(0, 500);
    const url = String(body?.url || '').trim().slice(0, 500);
    const model = String(body?.model || '').trim().slice(0, 100) || 'gpt-4o-mini';
    if (!body?.save) {
      const cur = await store.get(`ai_cfg:${uid}`, { key: '', url: '', model: '' });
      return json({ ok: true, config: { hasKey: !!cur.key, url: cur.url || '', model: cur.model || '', masked: cur.key ? cur.key.slice(0, 6) + '...' + cur.key.slice(-4) : '' } });
    }
    if (key) {
      await store.put(`ai_cfg:${uid}`, { key, url, model, at: Date.now() });
      return json({ ok: true, saved: true });
    }
    await store.put(`ai_cfg:${uid}`, { key: '', url: '', model: '' });
    return json({ ok: true, cleared: true });
  }
  if (path === '/api/ai/test' && request.method === 'POST') {
    // کلید را تست می‌کند، مدل‌های حساب را می‌خواند و یک «مدل نویسنده» انتخاب می‌کند
    const key = String(body?.key || '').trim();
    if (!key) return bad('key');
    const urlAI = normalizeAiUrl(String(body?.url || '').trim() || 'https://api.openai.com/v1/chat/completions');
    const requested = String(body?.model || '').trim() || 'gpt-4o-mini';
    let bestModel = requested;
    let modelsList = [];
    try {
      const mRes = await fetch(urlAI.replace(/\/chat\/completions$/i, '/models'), { headers: { authorization: `Bearer ${key}` } });
      if (mRes.ok) {
        const ids = ((await mRes.json()).data || []).map((x) => x.id).filter(Boolean);
        modelsList = ids;
        const score = (id) => {
          let s = CHAT_PREF.some((rx) => rx.test(id)) ? 100 : 0;
          if (/405b/i.test(id)) s += 40;
          if (/70b|120b/i.test(id)) s += 25;
          if (/mini|8b|7b/i.test(id)) s -= 5;
          return s;
        };
        const usable = ids.filter((id) => !NON_CHAT_MODEL_RE.test(id));
        const pool = usable.length ? usable : ids;
        if (pool.length) bestModel = pool.slice().sort((a, b) => score(b) - score(a))[0];
      }
    } catch { /* provider without /models — keep the requested one */ }
    try {
      const testRes = await fetch(urlAI, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: bestModel, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 })
      });
      const txt = await testRes.text();
      let data = {};
      try { data = JSON.parse(txt); } catch { /* keep raw text for the error path */ }
      if (!testRes.ok) return json({ ok: false, status: testRes.status, error: data.error?.message || txt.slice(0, 400), triedModel: bestModel, models: modelsList.slice(0, 20) });
      return json({ ok: true, model: bestModel, requestedModel: requested, reply: data.choices?.[0]?.message?.content || 'ok', models: modelsList.slice(0, 30), bestModel });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e).slice(0, 400), triedUrl: urlAI });
    }
  }
  if (path === '/api/ai/generate' && request.method === 'POST') {
    const prompt = String(body?.prompt || '').trim().slice(0, 3000);
    const style = String(body?.style || '').trim();
    if (!prompt) return bad('prompt');
    const cfgAI = await store.get(`ai_cfg:${uid}`, null);
    const apiKey = cfgAI?.key || '';
    const apiUrl = normalizeAiUrl(cfgAI?.url || 'https://api.openai.com/v1/chat/completions');
    const model = cfgAI?.model || body?.model || 'gpt-4o-mini';
    if (!apiKey) {
      return json({
        ok: true,
        via: 'fallback',
        html: `<h2>${esc(prompt.slice(0, 80))}</h2>\n<p>${esc(prompt)}</p>\n<blockquote>این متن با هوش مصنوعی بهبود می‌یابد اگر کلید خود را در تنظیمات AI وارد کنید.</blockquote>`
      });
    }
    const sysMap = {
      viral: 'You are a Telegram Rich Message architect. Make the user text viral, engaging, with emojis, bold, tables if needed. Return only raw HTML (b,p,blockquote,table,ul).',
      formal: 'You are a Telegram Rich Message architect. Rewrite formally, structured, with headings, bullet points. Return only raw HTML.',
      product: 'You are a Telegram shop post creator. Create a product card HTML with title, description, price table, and a primary button. Return only raw HTML.',
      default: 'You are a Telegram Rich Message architect. Format user text into Telegram Rich HTML (b, blockquote expandable, code, bullet points, table bordered striped compact if applicable) preserving 100% original words. Return only raw formatted HTML without code fences.'
    };
    try {
      const aiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0.7, messages: [{ role: 'system', content: sysMap[style] || sysMap.default }, { role: 'user', content: prompt }] })
      });
      const j = await aiRes.json().catch(() => ({}));
      if (!aiRes.ok) return json({ ok: false, error: j.error?.message || `AI ${aiRes.status}` });
      const out = String(j.choices?.[0]?.message?.content || '').trim().replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      if (!out) return json({ ok: false, error: 'empty ai response' });
      return json({ ok: true, html: out, via: 'ai' });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e).slice(0, 400) });
    }
  }
  return bad('route', 404);
}
