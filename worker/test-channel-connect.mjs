/* Simulates the bot's «اتصال کانال» flow end to end:
   /start connect → دکمه‌ی انتخاب کانال (request_chat) → chat_shared،
   و مسیر فوروارد؛ به‌علاوه‌ی ثبت خودکار با my_chat_member.
   The Telegram mock knows the bot's real id, so a check against a wrong id fails
   exactly like production did ("ربات هنوز ادمین نیست" while it actually is).
   Usage: node test-channel-connect.mjs [bundle.mjs]        (exit 0 = pass)         */
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

/* ── ثبت خودکار کانال با my_chat_member ── */
console.log('— اتصال خودکار وقتی ربات ادمین می‌شود —');
const membershipUpdate = (chat, byId, status) => ({
  update_id: ++seq,
  my_chat_member: {
    chat, from: { id: byId, first_name: 'Ali' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: REAL_BOT_ID, is_bot: true } },
    new_chat_member: { status, user: { id: REAL_BOT_ID, is_bot: true }, can_post_messages: true }
  }
});
{
  kvData.clear(); doStore.clear(); membership = {};
  const msgs = await send(membershipUpdate(CHANNEL, CHAT, 'administrator'));
  const list = JSON.parse(doStore.get(`appc:${CHAT}`) || kvData.get(`appc:${CHAT}`) || '{}');
  const fallback = JSON.parse(doStore.get(`ch:${CHAT}`) || kvData.get(`ch:${CHAT}`) || '{}');
  check('کانال به فهرست مینی‌اپ اضافه شد', (list.items || []).some((c) => String(c.chat) === String(CHANNEL.id)), JSON.stringify(list.items || []).slice(0, 80));
  check('مقصد پیش‌فرض ربات هم ست شد', String(fallback.id) === String(CHANNEL.id));
  check('به کاربر اطلاع داده شد', msgs.length > 0 && msgs[0].html.includes('به فهرست اتصالات'), (msgs[0]?.html || '').replace(/<[^>]+>/g, ' ').slice(0, 70));
}
{
  /* کانال دوم: فهرست کامل می‌شود ولی مقصد پیش‌فرض دست‌نخورده می‌ماند */
  const second = { id: -1009876543210, title: 'کانال دوم', username: 'second', type: 'channel' };
  await send(membershipUpdate(second, CHAT, 'administrator'));
  const list = JSON.parse(doStore.get(`appc:${CHAT}`) || kvData.get(`appc:${CHAT}`) || '{}');
  const fallback = JSON.parse(doStore.get(`ch:${CHAT}`) || kvData.get(`ch:${CHAT}`) || '{}');
  check('کانال دوم هم به فهرست اضافه شد', (list.items || []).length === 2);
  check('مقصد پیش‌فرض با کانال دوم عوض نمی‌شود', String(fallback.id) === String(CHANNEL.id));
}
{
  /* حذف ربات از کانال اول → از فهرست پاک می‌شود */
  await send(membershipUpdate(CHANNEL, CHAT, 'left'));
  const list = JSON.parse(doStore.get(`appc:${CHAT}`) || kvData.get(`appc:${CHAT}`) || '{}');
  check('حذف ربات از کانال، فهرست را به‌روز می‌کند', (list.items || []).length === 1 && !(list.items || []).some((c) => String(c.chat) === String(CHANNEL.id)));
}
{
  /* وقتی کسی ربات را از پیوی بلاک می‌کند نباید چیزی ثبت شود */
  kvData.clear(); doStore.clear();
  await send({ update_id: ++seq, my_chat_member: { chat: { id: CHAT, type: 'private', first_name: 'Ali' }, from: { id: CHAT, first_name: 'Ali' }, date: Date.now(), old_chat_member: { status: 'member' }, new_chat_member: { status: 'kicked' } } });
  check('تغییر وضعیت پیوی چیزی ثبت نمی‌کند', ![...kvData.keys(), ...doStore.keys()].some((k) => k.startsWith('appc:')));
}


/* ── اتصال از فهرست خود تلگرام (KeyboardButton.request_chat) ── */
console.log('— اتصال از دکمه‌ی «انتخاب کانال از فهرست» —');
const chatShared = (chatId, extra = {}) => message({ chat_shared: { request_id: 1, chat_id: chatId, ...extra } });
const plainHtml = (m) => (m?.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

{
  /* /start connect → پیام راهنما + دکمهٔ انتخاب کانال */
  kvData.clear(); doStore.clear(); membership = { [String(REAL_BOT_ID)]: { status: 'administrator', can_post_messages: true }, [String(CHAT)]: { status: 'creator' } };
  const msgs = await send(message({ text: '/start connect' }));
  const m = msgs[msgs.length - 1];
  const kb = m?.markup?.keyboard;
  const btn = kb && kb[0] && kb[0][0];
  check('دستور اتصال، پیام راهنما می‌دهد', plainHtml(m).includes('انتخاب کانال از فهرست'), plainHtml(m).slice(0, 70));
  check('دکمه‌ی request_chat فرستاده شد', !!(btn && btn.request_chat), JSON.stringify(btn));
  check('فقط کانال‌ها پیشنهاد می‌شوند', !!(btn && btn.request_chat.chat_is_channel === true));
  check('کیبورد بعد از یک استفاده پنهان می‌شود', m?.markup?.one_time_keyboard === true);
}
{
  /* ربات ادمین است → کانال وصل می‌شود */
  kvData.clear(); doStore.clear(); membership = { [String(REAL_BOT_ID)]: { status: 'administrator', can_post_messages: true }, [String(CHAT)]: { status: 'creator' } };
  const msgs = await send(chatShared(CHANNEL.id, { title: CHANNEL.title, username: CHANNEL.username }));
  const list = JSON.parse(doStore.get(`appc:${CHAT}`) || kvData.get(`appc:${CHAT}`) || '{}');
  const last = msgs[msgs.length - 1];
  check('کانال انتخاب‌شده وصل شد', (list.items || []).some((c) => String(c.chat) === String(CHANNEL.id)));
  check('پیام تأیید نام کانال را دارد', plainHtml(last).includes('پیام‌رسان پول دار'), plainHtml(last).slice(0, 70));
  check('کیبورد انتخاب کانال برداشته شد', msgs.some((x) => x.markup && x.markup.remove_keyboard === true));
  check('دکمه‌ی میان‌بر مینی‌اپ در تأییدیه هست', !!(last?.markup?.inline_keyboard?.[0]?.[0]?.web_app));
}
{
  /* ربات ادمین نیست → دقیقاً همان راهنمای سه‌گامی */
  kvData.clear(); doStore.clear(); membership = { [String(CHAT)]: { status: 'creator' } };
  const msgs = await send(chatShared(CHANNEL.id, { title: CHANNEL.title }));
  const list = JSON.parse(doStore.get(`appc:${CHAT}`) || kvData.get(`appc:${CHAT}`) || '{}');
  const t = plainHtml(msgs[msgs.length - 1]);
  check('کانال وصل نشد', !(list.items || []).length);
  check('گفته می‌شود ربات ادمین نیست', t.includes('ادمین نیست'));
  check('راهنمای افزودن ادمین هست', t.includes('افزودن ادمین') && t.includes('RasaRichBot'), t.slice(0, 80));
}
{
  /* ادمین است ولی حق ارسال پیام ندارد */
  kvData.clear(); doStore.clear(); membership = { [String(REAL_BOT_ID)]: { status: 'administrator', can_post_messages: false }, [String(CHAT)]: { status: 'creator' } };
  const msgs = await send(chatShared(CHANNEL.id, { title: CHANNEL.title }));
  const list = JSON.parse(doStore.get(`appc:${CHAT}`) || kvData.get(`appc:${CHAT}`) || '{}');
  const t = plainHtml(msgs[msgs.length - 1]);
  check('عدم اجازه‌ی ارسال پیام جدا گزارش می‌شود', t.includes('ارسال پیام') && t.includes('ندارد'), t.slice(0, 80));
  check('در این حالت هم چیزی وصل نمی‌شود', !(list.items || []).length);
}
{
  /* چت خصوصی انتخاب شود → رد می‌شود */
  kvData.clear(); doStore.clear();
  const msgs = await send(chatShared(CHAT, { title: 'Ali' }));
  const t = plainHtml(msgs[msgs.length - 1]);
  check('چت خصوصی قابل اتصال نیست', t.includes('قابل اتصال نیست'), t.slice(0, 60));
}
{
  /* ثبت از فهرست، مقصد پیش‌فرض موجود را عوض نمی‌کند */
  kvData.clear(); doStore.clear(); membership = { [String(REAL_BOT_ID)]: { status: 'administrator' }, [String(CHAT)]: { status: 'creator' } };
  doStore.set(`ch:${CHAT}`, JSON.stringify({ id: -1007777777777, title: 'کانال قبلی' }));
  await send(chatShared(CHANNEL.id, { title: CHANNEL.title }));
  const fallback = JSON.parse(doStore.get(`ch:${CHAT}`) || '{}');
  check('مقصد پیش‌فرض قبلی دست‌نخورده می‌ماند', String(fallback.id) === '-1007777777777');
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
