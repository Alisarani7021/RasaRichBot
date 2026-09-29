/* Simulates the bot's «اتصال کانال» flow end to end:
   /start → منوی کانال → اتصال کانال جدید → فوروارد یک پیام از کانال.
   The Telegram mock knows the bot's real id, so a check against a wrong id fails
   exactly like production did ("ربات هنوز ادمین نیست" while it actually is).
   Usage: node channel_connect_test.mjs <bundle.mjs>        (exit 0 = pass)         */
import { pathToFileURL } from 'node:url';

const bundlePath = process.argv[2] || './index.js';
const { default: worker } = await import(pathToFileURL(bundlePath).href);

/* ── fake KV + DO ── */
const kvData = new Map();
const kv = {
  async get(key, type) { const v = kvData.get(key); if (v === undefined) return null; return type === 'json' ? JSON.parse(v) : v; },
  async put(key, value) { kvData.set(key, typeof value === 'string' ? value : JSON.stringify(value)); },
  async delete(key) { kvData.delete(key); },
  async list({ prefix = '' } = {}) { return { keys: [...kvData.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; }
};
const doStore = new Map();
const stateFetch = async (input, init = {}) => {
  const href = typeof input === 'string' ? input : input.url;
  const method = init?.method || 'GET';
  const key = new URL(href).searchParams.get('key');
  if (!key) return new Response('key required', { status: 400 });
  if (method === 'GET') { const v = doStore.get(key); return v === undefined ? new Response('', { status: 404 }) : new Response(String(v)); }
  if (method === 'PUT') { doStore.set(key, String(init.body ?? '')); return new Response('OK'); }
  if (method === 'DELETE') { doStore.delete(key); return new Response('OK'); }
  return new Response('', { status: 405 });
};
const env = {
  BOT_TOKEN: 'TEST:TOKEN', WEBHOOK_SECRET: 's3cret', ADMIN_KEY: 'admin', WEBHOOK_PATH: '/telegram/webhook',
  KV: kv, RASA_KV: kv, KV_FRESH: kv,
  STATE: { idFromName: () => 'x', get: () => ({ fetch: stateFetch }) }
};

/* ── Telegram mock with the REAL bot id from this token ── */
const REAL_BOT_ID = 8826777931;
const BOT_USERNAME = 'RasaRichBot';
const CHANNEL = { id: -1001234567890, title: 'پیام‌رسان پول دار', username: 'mo_pool_dar', type: 'channel' };

let sent = [];
let membership = {};           // user_id → member object (or undefined = not a member)
let tgError = null;            // when set, getChatMember returns this error
const ok = (result) => new Response(JSON.stringify({ ok: true, result }), { headers: { 'content-type': 'application/json' } });
const fail = (code, description) => new Response(JSON.stringify({ ok: false, error_code: code, description }), { headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = u.split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  let p = {};
  try { p = opts.body ? JSON.parse(opts.body) : {}; } catch {}
  switch (method) {
    case 'getMe': return ok({ id: REAL_BOT_ID, is_bot: true, username: BOT_USERNAME, first_name: 'رِسا' });
    case 'getChat': return p.chat_id === CHANNEL.id ? ok(CHANNEL) : fail(400, 'Bad Request: chat not found');
    case 'getChatMember': {
      if (tgError) return fail(tgError.code || 400, tgError.description);
      const m = membership[String(p.user_id)];
      if (!m) return fail(400, 'Bad Request: user not found');
      return ok({ user: { id: p.user_id }, ...m });
    }
    case 'sendRichMessage': case 'sendMessage': { const id = 1000 + sent.length; sent.push({ chat_id: p.chat_id, html: p.rich_message?.html || p.text || '', markup: p.reply_markup }); return ok({ message_id: id }); }
    case 'editMessageText': case 'editMessageCaption': {
      const html = p.rich_message?.html || p.text || p.caption || '';
      if (html) sent.push({ chat_id: p.chat_id, html, markup: p.reply_markup, edit: true });
      return ok({ message_id: p.message_id });
    }
    case 'editMessageReplyMarkup': return ok({ message_id: p.message_id });
    case 'deleteMessage': case 'answerCallbackQuery': return ok(true);
    default: return ok(true);
  }
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

const CHAT = 5982315292;
const origin = 'https://rich-post-bot.4lisarani-1.workers.dev';
let seq = 700;
const send = async (update) => {
  sent = [];
  const req = new Request(`${origin}/telegram/webhook`, {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(update)
  });
  let pending;
  await worker.fetch(req, env, { waitUntil: (x) => { pending = x; } });
  if (pending) await pending.catch(() => {});
  return sent;
};
const message = (extra) => ({ update_id: ++seq, message: { message_id: ++seq, date: Math.floor(Date.now() / 1000), chat: { id: CHAT, type: 'private' }, from: { id: CHAT, first_name: 'Ali' }, ...extra } });
const callback = (data, messageId = 1) => ({ update_id: ++seq, callback_query: { id: 'cb' + (++seq), from: { id: CHAT, first_name: 'Ali' }, message: { message_id: messageId, date: Date.now(), chat: { id: CHAT, type: 'private' } }, data } });

/* forwarded channel post — modern shape (Bot API 7+ uses forward_origin) */
const fwdModern = () => message({ forward_origin: { type: 'channel', date: Date.now(), message_id: 5, chat: CHANNEL }, text: 'سلام' });
/* forwarded channel post — legacy shape (some clients still deliver forward_from_chat) */
const fwdLegacy = () => message({ forward_from_chat: CHANNEL, forward_from_message_id: 5, text: 'سلام' });

const lastText = (msgs) => (msgs[msgs.length - 1]?.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const flow = async (fwd, members = {}) => {
  kvData.clear(); doStore.clear(); membership = { ...members };
  await send(message({ text: '/start' }));
  const menu = lastText(await send(callback('nav:channel', 1)));
  const ready = lastText(await send(callback('ch:connect_start', 1)));
  const res = lastText(await send(fwd()));
  return { menu, ready, res, stored: doStore.get(`ch:${CHAT}`) || kvData.get(`ch:${CHAT}`) };
};

const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

console.log('— اتصال کانال از داخل ربات —');

const ADMIN_BOT = { [String(REAL_BOT_ID)]: { status: 'administrator', can_post_messages: true }, [String(CHAT)]: { status: 'creator' } };

/* ۱) ربات ادمین است و حق ارسال پیام دارد → باید وصل شود */
{
  const { menu, ready, res, stored } = await flow(fwdModern, ADMIN_BOT);
  check('منوی کانال باز می‌شود', menu.includes('کانال'), menu.slice(0, 60));
  check('دستور اتصال، راهنمای فوروارد را نشان می‌دهد', ready.includes('فوروارد'), ready.slice(0, 70));
  check('با forward_origin کانال وصل شد', res.includes('با موفقیت متصل'), res.slice(0, 80));
  check('کانال در حافظه ذخیره شد', !!stored, stored ? stored.slice(0, 60) : '');
}
{
  const { res, stored } = await flow(fwdLegacy, ADMIN_BOT);
  check('با forward_from_chat هم وصل می‌شود', res.includes('با موفقیت متصل') && !!stored, res.slice(0, 60));
}

/* ۲) ربات واقعاً ادمین نیست → پیام واضح + راهنما */
{
  const { res, stored } = await flow(fwdModern, { [String(REAL_BOT_ID)]: { status: 'left' } });
  check('وقتی ربات عضو نیست، خطای روشن می‌دهد', res.includes('ادمین نیست') && !stored, res.slice(0, 90));
  check('راهنمای گام‌به‌گام ادمین‌کردن هست', res.includes('افزودن ادمین') || res.includes('مدیریت'));
}

/* ۳) ربات ادمین است ولی اجازه ارسال پیام ندارد */
{
  const { res, stored } = await flow(fwdModern, { [String(REAL_BOT_ID)]: { status: 'administrator', can_post_messages: false } });
  check('نبود دسترسی «ارسال پیام» جدا گزارش می‌شود', res.includes('ارسال پیام') && !stored, res.slice(0, 90));
}

/* ۴) خطای API (مثلاً قطعی تلگرام) → دلیلش گفته می‌شود */
tgError = { code: 500, description: 'Internal Server Error: timeout' };
{
  const { res } = await flow(fwdModern);
  check('خطای API با متن خطا گزارش می‌شود', res.includes('خطای تلگرام'), res.slice(0, 90));
}
tgError = null;

/* ۵) پیام فوروارد نشده */
{
  const { res } = await flow(() => message({ text: 'سلام معمولی' }), ADMIN_BOT);
  check('پیام غیرفوروارد، خطای مربوط به خودش را می‌گیرد', res.includes('فوروارد نشده'), res.slice(0, 80));
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
