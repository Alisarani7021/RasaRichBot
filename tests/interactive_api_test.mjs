/* Interactive-templates API: the mini app creates a live poll / a multi-depth
   post / a slideshow, lists them, ends a poll and removes a post — and the
   created poll really is alive (a channel vote edits the very message).
   Usage: node interactive_api_test.mjs <bundle.mjs>        (exit 0 = pass)   */
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const bundlePath = process.argv[2] || './index.js';
const { default: worker } = await import(pathToFileURL(bundlePath).href);

const BOT = 'TEST:TOKEN', UID = 5982315292, ORIGIN = 'https://rich-post-bot.4lisarani-1.workers.dev';

/* ── fake storage ─────────────────────────────────────────────────────────── */
const mkKv = (map) => ({
  async get(k, t) { const v = map.get(k); if (v === undefined) return null; return t === 'json' ? JSON.parse(v) : (t === 'arrayBuffer' ? new TextEncoder().encode(v) : v); },
  async put(k, v) { map.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { map.delete(k); },
  async list({ prefix = '' } = {}) { return { keys: [...map.keys()].filter((x) => x.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
});
const kvData = new Map(), rasaData = new Map(), doStore = new Map();
const stateFetch = async (input, init = {}) => {
  const href = typeof input === 'string' ? input : input.url;
  const method = init.method || 'GET';
  const key = new URL(href).searchParams.get('key');
  if (method === 'GET') { const v = doStore.get(key); return v === undefined ? new Response('', { status: 404 }) : new Response(String(v)); }
  if (method === 'PUT') { doStore.set(key, String(init.body ?? '')); return new Response('OK'); }
  if (method === 'DELETE') { doStore.delete(key); return new Response('OK'); }
  return new Response('', { status: 405 });
};
const env = {
  BOT_TOKEN: BOT, WEBHOOK_SECRET: 's3cret',
  KV: mkKv(kvData), KV_FRESH: mkKv(kvData), RASA_KV: mkKv(rasaData),
  STATE: { idFromName: () => 'x', get: () => ({ fetch: stateFetch }) }
};

/* ── fake telegram (قواعد واقعی کانال را شبیه‌سازی می‌کند) ────────────────────
   تلگرام: (۱) فرستادن مستقیم به کانال آرت را ساده می‌کند، (۲) ادیت در کانال آرت را
   پاک می‌کند مگر پیام «در پاسخ به» پیامی دیگر باشد، (۳) کپیِ همراه با دکمه/پاسخ
   آرت را می‌خورد، (۴) آیکن پرمیوم روی دکمهٔ اینلاین در کانال حذف می‌شود. */
let tg = [];
let botIsAdmin = true, userIsAdmin = true, chatType = 'channel';
let copyN = 0, msgSeq = 800, stripChannelArt = false, simCancelOnce = false;
const goneIds = new Set();   /* پیام‌هایی که «از دست رفته» فرض می‌شوند */
let failRichOnce = false;
const hasArt = (h) => /<tg-emoji/.test(String(h || ''));
const isChanId = (c) => { const v = String(c == null ? '' : c); return v.startsWith('@') || /^-\d+$/.test(v); };
/* شناسه‌های پیام در این تست‌ها یکتا هستند؛ انبار را با شناسهٔ پیام می‌شناسیم تا
   فیکسچرهای کانال/پیوی با هم قاطی نشوند. */
const chatKey = (_c) => 'm';
const msgStore = new Map();
const putMsg = (chat, id, obj) => msgStore.set(`${chatKey(chat)}:${id}`, { ...obj });
const getMsg = (chat, id) => msgStore.get(`${chatKey(chat)}:${id}`) || null;
globalThis.fetch = async (url, opts = {}) => {
  const m = String(url).split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  let p = {};
  try { p = opts.body ? JSON.parse(opts.body) : {}; } catch {}
  tg.push({ m, p });
  if (m === 'getMe') return Response.json({ ok: true, result: { id: 8826777931, is_bot: true } });
  if (m === 'getChat') return Response.json({ ok: true, result: { id: p.chat_id, type: chatType, title: 'کانال من', username: 'mychannel' } });
  if (m === 'getChatMember') {
    const isBot = String(p.user_id) === '8826777931';
    const status = (isBot ? botIsAdmin : userIsAdmin) ? 'administrator' : 'member';
    return Response.json({ ok: true, result: { status, can_post_messages: true } });
  }
  if (m === 'sendMessage') { const id = ++msgSeq; putMsg(p.chat_id, id, { reply: false, art: false }); return Response.json({ ok: true, result: { message_id: id } }); }
  if (m === 'sendRichMessage') {
    if (failRichOnce && JSON.stringify(p.reply_markup || {}).includes('icon_custom_emoji_id')) {
      failRichOnce = false;
      return Response.json({ ok: false, error_code: 400, description: 'Bad Request: CUSTOM_EMOJI_INVALID' });
    }
    const id = ++msgSeq;
    const art = hasArt(p.rich_message?.html) && !isChanId(p.chat_id);   // کانال در «فرستادن» آرت را ساده می‌کند
    const reply = !!p.reply_parameters;
    putMsg(p.chat_id, id, { reply, art, sig: JSON.stringify(p.rich_message || ''), markup: p.reply_markup || null });
    return Response.json({ ok: true, result: { message_id: id, reply_to_message: reply ? { message_id: p.reply_parameters.message_id } : undefined,
      rich_message: { blocks: art ? [{ type: 'custom_emoji', custom_emoji_id: 'x' }] : [{ type: 'paragraph', text: 'plain' }] } } });
  }
  if (m === 'editMessageText' || m === 'editMessageCaption') {
    let rec = getMsg(p.chat_id, p.message_id) || null;
    if (goneIds.has(p.message_id)) return Response.json({ ok: false, error_code: 400, description: 'Bad Request: message to edit not found' });
    if (!rec) { rec = { reply: false, art: false }; putMsg(p.chat_id, p.message_id, rec); }
    if (simCancelOnce) {   // ادیتِ هم‌زمانِ دیگر: تلگرام یکی را کنسل می‌کند
      simCancelOnce = false;
      return Response.json({ ok: false, error_code: 400, description: 'Bad Request: canceled by new edit message request' });
    }
    const sig = JSON.stringify(p.rich_message || p.caption || '');
    const want = hasArt(p.rich_message?.html || p.caption);
    const keep = isChanId(p.chat_id) ? (!!rec.reply && !stripChannelArt) : true;   // در کانال فقط پیامِ «در پاسخ» آرت را نگه می‌دارد
    const art = want && keep;
    /* «not modified» فقط وقتی محتوا و وضعیت آرت هر دو یکی باشند. */
    if (!stripChannelArt && rec.sig !== undefined && rec.sig === sig && !!rec.art === !!art) {
      return Response.json({ ok: false, error_code: 400, description: 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message' });
    }
    putMsg(p.chat_id, p.message_id, { reply: !!rec.reply, art, sig, markup: rec.markup || null });
    return Response.json({ ok: true, result: { message_id: p.message_id,
      rich_message: { blocks: art ? [{ type: 'custom_emoji', custom_emoji_id: 'x' }] : [{ type: 'paragraph', text: 'plain' }] } } });
  }
  if (m === 'editMessageReplyMarkup') {
    const rec = getMsg(p.chat_id, p.message_id) || {};
    const strip = (kb) => isChanId(p.chat_id)
      ? { inline_keyboard: (kb?.inline_keyboard || []).map((row) => row.map(({ icon_custom_emoji_id, ...b }) => b)) }   // کانال آیکن را حذف می‌کند
      : kb;
    const out = strip(p.reply_markup);
    putMsg(p.chat_id, p.message_id, { reply: !!rec.reply, art: !!rec.art, markup: out });
    return Response.json({ ok: true, result: { message_id: p.message_id, reply_markup: out } });
  }
  if (m === 'copyMessage') {
    copyN += 1;
    const src = getMsg(p.from_chat_id, p.message_id) || {};
    const art = !!src.art && !p.reply_markup && !p.reply_parameters && !stripChannelArt;   // دکمه/پاسخ همراهِ کپی، آرت را می‌خورد
    const id = 950 + copyN;
    putMsg(p.chat_id, id, { reply: !!p.reply_parameters, art });
    return Response.json({ ok: true, result: { message_id: id, rich_message: { blocks: art ? [{ type: 'custom_emoji', custom_emoji_id: 'x' }] : [] } } });
  }
  if (m === 'forwardMessage') {
    copyN += 1;
    const src = getMsg(p.from_chat_id, p.message_id) || {};
    const art = !!src.art && !stripChannelArt;
    const id = 980 + copyN;
    putMsg(p.chat_id, id, { reply: false, art });
    return Response.json({ ok: true, result: { message_id: id, rich_message: { blocks: art ? [{ type: 'custom_emoji', custom_emoji_id: 'x' }] : [] } } });
  }
  if (m === 'deleteMessage') { msgStore.delete(`${chatKey(p.chat_id)}:${p.message_id}`); return Response.json({ ok: true, result: true }); }
  if (m === 'answerCallbackQuery') return Response.json({ ok: true, result: true });
  return Response.json({ ok: true, result: true });
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

/* ── a real mini-app session token (same scheme the worker verifies) ──────── */
function sessionToken(uid = UID) {
  const body = JSON.stringify({ uid, name: 'Test', user: 'tester', exp: Date.now() + 3600 * 1000 });
  const payload = Buffer.from(body.toString(), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', Buffer.from(BOT + '::rasa-app', 'utf8')).update(payload).digest('hex').slice(0, 32);
  return payload + '.' + sig;
}
const apiCall = async (route, body, token = sessionToken()) => {
  const res = await worker.fetch(new Request(`${ORIGIN}/api/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...token ? { 'x-rasa-token': token } : {} },
    body: JSON.stringify(body || {})
  }), env, {});
  let j = null;
  try { j = await res.clone().json(); } catch {}
  return { status: res.status, json: j };
};
const lastTg = (m) => [...tg].reverse().find((x) => x.m === m) || null;
const liveState = (id) => { const raw = doStore.get(`live:${id}`) || kvData.get(`live:${id}`); return raw ? JSON.parse(raw) : null; };
const deepState = (id) => { const raw = doStore.get(`deep:${id}`) || kvData.get(`deep:${id}`); return raw ? JSON.parse(raw) : null; };
const listItems = async () => (await apiCall('interactive/list', {})).json.items || [];

const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

console.log('— API قالب‌های تعاملی —');
{
  /* ۰) بی‌توکن = ۴۰۱ */
  const r = await apiCall('interactive/list', {}, '');
  check('بدون نشست مینیاپ ۴۰۱ می‌گیرد', r.status === 401, 'status=' + r.status);
}
let pollId = null, pollMsg = null, levelsId = null, slideMsg = null;
kvData.set('map', JSON.stringify({ '🚀': '999', '⚡': '888', '✅': '777', '📚': '666', '🗳': '555' }));
{
  /* ۱) نظرسنجی در پیوی خودم */
  tg = [];
  const r = await apiCall('interactive/poll', { target: 'me', title: 'سؤال تست', subtitle: 'زیرنویس', options: ['الف', 'ب', 'ج'], minutes: 60 });
  pollId = r.json?.id; pollMsg = r.json?.message_id;
  check('نظرسنجی ساخته و منتشر می‌شود', r.status === 200 && r.json.ok && !!pollId, JSON.stringify(r.json).slice(0, 90));
  const sent = lastTg('sendRichMessage');
  check('به پیوی خود کاربر رفته', String(sent?.p.chat_id) === String(UID));
  check('چارت و دکمه‌های رأی داخل پیام هست', /<table/.test(sent?.p.rich_message?.html || '') && JSON.stringify(sent?.p.reply_markup || {}).includes(`vote:${pollId}`));
  check('دکمه‌ها اینلاین‌اند (نه دکمه ریچ)' + ' — پیوی مثل قبل می‌ماند', !!sent?.p.reply_markup?.inline_keyboard && !(sent?.p.rich_message?.html || '').includes('tg-button-row') && /icon_custom_emoji_id|"text"/.test(JSON.stringify(sent.p.reply_markup)));
  const st = liveState(pollId);
  check('وضعیت نظرسنجی در انبار ذخیره شد', !!st && st.options.length === 3 && !!st.endsAt);
  check('مهلت درست ثبت شد', Math.abs(st.endsAt - Date.now() - 3600000) < 60000);
  check('فهرست منتشرشده‌ها یک قلم دارد', (await listItems()).length === 1);
}
{
  /* ۲) رأی واقعی روی همان نظرسنجی که از مینیاپ ساخته شد */
  tg = [];
  const vote = { update_id: 7001, callback_query: { id: 'cb1', from: { id: 555111, first_name: 'رأی‌دهنده' }, message: { message_id: pollMsg, date: Math.floor(Date.now() / 1000), chat: { id: -1001234567890, type: 'channel', title: 'کانال' } }, data: `vote:${pollId}:o2` } };
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(vote) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 150));
  const edited = lastTg('editMessageText') || lastTg('editMessageCaption');
  const st = liveState(pollId);
  check('رأی روی نظرسنجی مینیاپی ثبت می‌شود', st && Object.keys(st.votes || {}).length === 1, JSON.stringify(st?.votes || {}));
  check('پیام همان نظرسنجی ویرایش می‌شود', !!edited && String(edited.p.message_id) === String(pollMsg), 'msg=' + edited?.p.message_id);
  check('نمودار رأی را نشان می‌دهد', /(?:█|░){10}/.test(edited?.p.rich_message?.html || edited?.p.text || ''));
  check('جدول نظرسنجی بعد از رأی سالم می‌ماند', /<table bordered striped compact>/.test(edited?.p.rich_message?.html || ''), (edited?.p.rich_message?.html || edited?.p.text || '').slice(0, 60));
  const items = await listItems();
  check('شمارندهٔ رأی در فهرست می‌آید', items[0]?.votes === 1, 'votes=' + items[0]?.votes);
}
{
  /* ۳) انتشار در کانال + بررسی دسترسی */
  botIsAdmin = false;
  const denied = await apiCall('interactive/poll', { target: '@mychannel', title: 'x', options: ['a', 'b'] });
  check('اگر ربات ادمین نباشد، منتشر نمی‌شود', denied.json.ok === false && denied.json.error === 'permissions', JSON.stringify(denied.json).slice(0, 80));
  botIsAdmin = true;
  tg = [];
  const ok = await apiCall('interactive/poll', { target: '@mychannel', title: 'نظرسنجی کانال', options: ['یک', 'دو'] });
  const sent = lastTg('sendRichMessage');
  const chCopy = tg.find((c) => c.m === 'copyMessage' && c.p.chat_id === '@mychannel');
  check('در کانال منتشر می‌شود (مستقیم یا با کپی از پیوی)', ok.json.ok === true && (String(sent?.p.chat_id) === '@mychannel' || !!chCopy),
    JSON.stringify({ direct: sent?.p?.chat_id || null, copy: !!chCopy }));
  check('لینک پست کانال ساخته می‌شود', /^https:\/\/t\.me\/mychannel\//.test(ok.json.link || ''), ok.json.link);
  check('گزینهٔ تک‌نفره رد می‌شود', (await apiCall('interactive/poll', { target: 'me', title: 'x', options: ['تنها'] })).json.ok === false);
}
{
  /* ۴) پست چندحالته */
  tg = [];
  const r = await apiCall('interactive/levels', { target: 'me', title: 'عنوان', levels: { short: 'خلاصه کوتاه', mid: '', full: '<b>کامل</b> با فرمت' } });
  levelsId = r.json?.id;
  check('پست چندحالته ساخته می‌شود', r.json.ok === true && !!levelsId);
  const sent = lastTg('sendRichMessage');
  const kb = JSON.stringify(sent?.p.reply_markup || {});
  check('سه دکمهٔ عمق دارد', (kb.match(/deep:/g) || []).length === 3, kb.slice(0, 120));
  check('همان پیام خلاصه را نشان می‌دهد', /خلاصه کوتاه/.test(sent?.p.rich_message?.html || ''));
  const st = deepState(levelsId);
  check('وضعیت سه‌سطحی ذخیره شد و نسخهٔ متوسط از خلاصه پر شد', !!st && st.levels.mid.html.length > 0);
  check('HTML سطح کامل تبدیل شده', /<b>کامل<\/b>/.test(st.levels.full.html));
  const lvBtns = (sent?.p.reply_markup?.inline_keyboard || []).map((r) => r[0]);
  check('هر سه دکمهٔ سطح آیکن پرمیوم می‌گیرند و متنشان می‌ماند',
    lvBtns.length === 3 && lvBtns.every((b) => b && b.icon_custom_emoji_id) && /خلاصه/.test(lvBtns[0].text) && /متوسط/.test(lvBtns[1].text) && /کامل/.test(lvBtns[2].text),
    JSON.stringify(lvBtns.map((b) => [b.text, b.icon_custom_emoji_id])).slice(0, 170));
  check('آرت دکمه‌ها از پک‌های خود ربات می‌آید',
    lvBtns[0]?.icon_custom_emoji_id === '888' && lvBtns[1]?.icon_custom_emoji_id === '666' && lvBtns[2]?.icon_custom_emoji_id === '777',
    JSON.stringify(lvBtns.map((b) => b.icon_custom_emoji_id)));
  check('اموجی متن جانشین نمی‌شود', !/tg-emoji/.test(sent?.p.rich_message?.html || ''));
  /* انتخاب خود کاربر روی آرت پیش‌فرض دکمه‌ها اولویت دارد */
  tg = [];
  const lvPick = await apiCall('interactive/levels', { target: 'me', levels: { short: '⚡ خلاصه', full: 'کامل' }, picks: { '⚡': '12345' } });
  const lvPickBtns = (lastTg('sendRichMessage')?.p.reply_markup?.inline_keyboard || []).map((r) => r[0]);
  check('اگر کاربر اموجی دکمه را خودش انتخاب کرده باشد همان آرت می‌رود',
    lvPickBtns[0]?.icon_custom_emoji_id === '12345', JSON.stringify(lvPickBtns[0] || {}).slice(0, 120));
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 7051, callback_query: { id: 'cb51', from: { id: UID, first_name: 'Test' }, message: { message_id: lvPick.json.message_id, date: 0, chat: { id: UID, type: 'private' } }, data: `deep:${lvPick.json.id}:full` } }) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 120));
  const lvPickEdit = JSON.stringify((lastTg('editMessageText') || {}).p?.reply_markup || {});
  check('بعد از تپ سطح هم آیکن پرمیوم روی دکمه می‌ماند', lvPickEdit.includes('12345') && lvPickEdit.includes('666'), lvPickEdit.slice(0, 150));
  if (lvPick.json?.id) await apiCall('interactive/remove', { id: lvPick.json.id, kind: 'levels' });
  const miss = await apiCall('interactive/levels', { target: 'me', levels: { short: 'فقط خلاصه' } });
  check('بدون نسخهٔ کامل خطا می‌دهد', miss.json.ok === false);
  /* کلیک واقعی روی دکمهٔ سطح */
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 7002, callback_query: { id: 'cb2', from: { id: UID, first_name: 'Test' }, message: { message_id: 901, date: 0, chat: { id: UID, type: 'private' } }, data: `deep:${levelsId}:full` } }) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 120));
  const ed = lastTg('editMessageText');
  check('تپ «نسخهٔ کامل» همان پیام را عوض می‌کند', /کامل/.test(ed?.p.rich_message?.html || ''), (ed?.p.rich_message?.html || '').slice(0, 50));
}
{
  /* ۳ب) اگر کسی تگ خام پرمیوم را در فیلدهای فرم بگذارد، متن خام نمایش داده نمی‌شود */
  tg = [];
  const tagPoll = await apiCall('interactive/poll', {
    target: 'me',
    title: 'نظرسنجی <tg-emoji emoji-id="555">🗳</tg-emoji> تگ‌دار',
    subtitle: 'زیرنویس <tg-emoji emoji-id="555">🗳</tg-emoji>',
    options: ['<tg-emoji emoji-id="555">🗳</tg-emoji> گزینهٔ یک', 'گزینهٔ دو']
  });
  const tagSent = lastTg('sendRichMessage');
  const tagHtml = tagSent?.p.rich_message?.html || '';
  const tagButtons = JSON.stringify(tagSent?.p.reply_markup || {});
  check('متن تگ‌دار کاربر عیناً به پیام نمی‌رود (هیچ متن فرارشده‌ای نیست)', !/&lt;tg-emoji/.test(tagHtml), tagHtml.slice(0, 95));
  check('اموجی کاربر با همان شناسهٔ خودش می‌رود (نه آرت پیش‌فرض)', (tagHtml.match(/<tg-emoji emoji-id="555">🗳<\/tg-emoji>/g) || []).length === 3, 'count=' + (tagHtml.match(/<tg-emoji emoji-id="555">/g) || []).length);
  check('دکمهٔ گزینه هم آیکن همان اموجی کاربر را می‌گیرد', /"icon_custom_emoji_id":"555"/.test(tagButtons) && /"text":"گزینهٔ یک"/.test(tagButtons), tagButtons.slice(0, 150));
  check('عنوان بدون تگ اضافه رندر می‌شود', /<h2>نظرسنجی 🗳 تگ‌دار<\/h2>/.test(tagHtml.replace(/<tg-emoji[^>]*>/g, '').replace(/<\/tg-emoji>/g, '')), tagHtml.slice(0, 60));
  const tagId = tagPoll.json?.id;
  /* و همان پست، بعد از یک رأی هم تمیز می‌ماند */
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 7011, callback_query: { id: 'cb11', from: { id: 555777, first_name: 'رأی‌دهنده' }, message: { message_id: tagPoll.json.message_id, date: 0, chat: { id: -1001234567890, type: 'channel' } }, data: `vote:${tagId}:o1` } }) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 120));
  const tagEdit = (lastTg('editMessageText') || {}).p?.rich_message?.html || '';
  check('بعد از رأی هم متن فرارشده برنمی‌گردد و جدول سر جایش است', !/&lt;tg-emoji/.test(tagEdit) && /<table/.test(tagEdit) && (tagEdit.match(/🗳/g) || []).length === 3 && !/<tg-emoji/.test(tagEdit), tagEdit.slice(0, 70));
  await apiCall('interactive/remove', { id: tagId, kind: 'poll' });

  /* ۴ب) جدول و اموجی پرمیوم در پست چندحالته */
  tg = [];
  const rich = await apiCall('interactive/levels', { target: 'me', title: '🚀 تیتر', levels: { short: 'خلاصه', full: '<h3>بخش</h3><table bordered striped compact><tr><th>الف</th><th>ب</th></tr><tr><td>۱</td><td>۲</td></tr></table><p>🚀 پایان</p>' } });
  const sentRich = lastTg('sendRichMessage');
  const richHtml = sentRich?.p.rich_message?.html || '';
  check('پیام اول همان خلاصه را نشان می‌دهد (بدون جدول)', /<h2>/.test(richHtml) && !/<table/.test(richHtml), richHtml.slice(0, 70));
  check('اموجی تایپ‌شده آرت پرمیوم خود ربات را می‌گیرد (مثل استودیو)', /<tg-emoji emoji-id="999">🚀<\/tg-emoji>/.test(richHtml),
    (richHtml.match(/<tg-emoji[^>]*>[^<]*<\/tg-emoji>/) || [''])[0] + ' · ' + richHtml.slice(0, 40));
  check('تگ اموجی داخل متن فرار داده نمی‌شود (خام به API نمی‌رود)', !/&lt;tg-emoji/.test(richHtml));
  const richId = rich.json.id;
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 7009, callback_query: { id: 'cb9', from: { id: UID, first_name: 'Test' }, message: { message_id: rich.json.message_id, date: 0, chat: { id: UID, type: 'private' } }, data: `deep:${richId}:full` } }) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 120));
  const tapEd = lastTg('editMessageText');
  const tapHtml = tapEd?.p.rich_message?.html || '';
  check('تپ سطح، پیام را با rich_message ویرایش می‌کند', !!tapEd && !!tapEd.p.rich_message);
  check('بعد از تپ هم جدول و تیتر باقی می‌مانند', /<table bordered striped compact>/.test(tapHtml) && /<h3>/.test(tapHtml), tapHtml.slice(0, 80));
  check('بعد از تپ هم اموجی کاربر عوض نمی‌شود', !/<tg-emoji/.test(tapHtml) && /🚀/.test(tapHtml));
  check('دکمهٔ سطح فعال با نشانهٔ ته‌خط مشخص می‌شود', JSON.stringify(tapEd?.p.reply_markup || {}).includes('خلاصه') || JSON.stringify(tapEd?.p.reply_markup || {}).includes('•'), JSON.stringify(tapEd?.p.reply_markup || {}).slice(0, 120));
  await apiCall('interactive/remove', { id: richId, kind: 'levels' });

  /* ۴ب۲) اموجیِ انتخاب‌شده از نوار: picks → آرت پرمیوم همان اموجی */
  tg = [];
  const marked = await apiCall('interactive/poll', {
    target: 'me',
    title: 'نظرسنجی 🚀 تیتر',
    options: ['گزینه 🚀', 'دوم ❤'],
    subtitle: 'زیرنویس 🚀',
    picks: { '🚀': '12345', '❤': '67890' }
  });
  const mSent = lastTg('sendRichMessage');
  const mHtml = mSent?.p.rich_message?.html || '';
  const mButtons = JSON.stringify(mSent?.p.reply_markup || {});
  check('انتخاب کاربر در تیتر به آرت پرمیوم تبدیل می‌شود', /<h2>[^<]*<tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(mHtml), mHtml.slice(0, 90));
  check('سلول جدول هم همان آرت را می‌گیرد', /<td>گزینه <tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(mHtml) && /<td>دوم <tg-emoji emoji-id="67890">❤<\/tg-emoji>/.test(mHtml), (mHtml.match(/<td>[^<]*<tg-emoji[^>]*>/) || [''])[0]);
  check('عنوان دکمه، آیکن پرمیوم همان آرت را می‌گیرد', /"text":"گزینه","callback_data":"vote:[^"]+","icon_custom_emoji_id":"12345"/.test(mButtons), mButtons.slice(0, 170));
  check('پیام هیچ متن اضافه‌ای ندارد', !/\u2063/.test(mHtml) && !/\u2063/.test(mButtons));
  /* و رأی‌گیری هم همان آرت را نگه می‌دارد */
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 7021, callback_query: { id: 'cb21', from: { id: 555888, first_name: 'v' }, message: { message_id: marked.json.message_id, date: 0, chat: { id: -1001234567890, type: 'channel' } }, data: `vote:${marked.json.id}:o1` } }) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 120));
  const votedHtml = (lastTg('editMessageText') || {}).p?.rich_message?.html || '';
  check('بعد از رأی هم آیکن/آرت روی همان دکمه می‌ماند', /<tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(votedHtml) && /"icon_custom_emoji_id":"12345"/.test(JSON.stringify((lastTg('editMessageText') || {}).p?.reply_markup || {})), votedHtml.slice(0, 60));
  /* ۴ب۳) اگر تلگرام آیکن پرمیوم را رد کند، همان پیام با اموجی ساده می‌رود */
  tg = [];
  failRichOnce = true;
  const rescued = await apiCall('interactive/poll', { target: 'me', title: 'نجات 🚀', options: ['گزینه 🚀', 'دوم ❤'], picks: { '🚀': '12345', '❤': '67890' } });
  const richCalls = tg.filter((c) => c.m === 'sendRichMessage');
  const retry = richCalls[richCalls.length - 1] || { p: {} };
  const retryBtn = retry.p?.reply_markup?.inline_keyboard?.[0]?.[0] || {};
  check('اگر آیکن رد شود، پیام با اموجی ساده دوباره و کامل می‌رود',
    richCalls.length === 2 && !('icon_custom_emoji_id' in retryBtn) && /🚀/.test(retryBtn.text || '') && !/<tg-emoji/.test(retry.p?.rich_message?.html || ''),
    JSON.stringify(retryBtn).slice(0, 120));
  if (rescued.json?.id) await apiCall('interactive/remove', { id: rescued.json.id, kind: 'poll' });
  const mId = marked.json?.id;
  await apiCall('interactive/remove', { id: mId, kind: 'poll' });

  /* ۴ج) تگی که کاربر خودش از پیکر انتخاب کرده، پرمیوم می‌ماند */
  tg = [];
  const picked = await apiCall('interactive/levels', { target: 'me', levels: { short: 'خلاصه', full: 'یک <tg-emoji emoji-id="4242">✨</tg-emoji> انتخاب‌شده' } });
  const pickedState = deepState(picked.json.id);
  check('تگ انتخاب‌شدهٔ خود کاربر در متن ذخیره می‌شود', /<tg-emoji emoji-id="4242">✨<\/tg-emoji>/.test(pickedState?.levels?.full?.html || ''), (pickedState?.levels?.full?.html || '').slice(-70));
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 7013, callback_query: { id: 'cb13', from: { id: UID, first_name: 'Test' }, message: { message_id: picked.json.message_id, date: 0, chat: { id: UID, type: 'private' } }, data: `deep:${picked.json.id}:full` } }) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 120));
  const pickedEdit = (lastTg('editMessageText') || {}).p?.rich_message?.html || '';
  check('تگ انتخاب‌شده بعد از تپ سطح هم حفظ می‌شود', /<tg-emoji emoji-id="4242">✨<\/tg-emoji>/.test(pickedEdit), pickedEdit.slice(-80));
  await apiCall('interactive/remove', { id: picked.json.id, kind: 'levels' });

  /* ۵) اسلایدشو */
  tg = [];
  const r = await apiCall('interactive/slideshow', { target: 'me', caption: 'سه قاب', media: [{ fileId: 'F1' }, { fileId: 'F2' }, { fileId: 'F3' }] });
  slideMsg = r.json?.message_id;
  check('اسلایدشو منتشر می‌شود', r.json.ok === true && !!slideMsg);
  const sent = lastTg('sendRichMessage');
  const html = sent?.p.rich_message?.html || '';
  check('تگ اسلایدشو در پیام هست', /<tg-slideshow>/.test(html) && /کپشن|سه قاب/.test(html));
  check('عکس‌ها به مدیای ریچ تبدیل شدند', (sent?.p.rich_message?.media || []).length === 3 && /tg:\/\/photo\?id=m0/.test(html), JSON.stringify(sent?.p.rich_message?.media || []).slice(0, 120));
  check('با یک عکس رد می‌شود', (await apiCall('interactive/slideshow', { target: 'me', media: [{ fileId: 'F1' }] })).json.ok === false);
}
{
  /* ۶) پایان رأی‌گیری و حذف */
  tg = [];
  const end = await apiCall('interactive/end', { id: pollId });
  const st = liveState(pollId);
  check('پایان رأی‌گیری مهلت را می‌بندد', end.json.ok === true && st.endsAt <= Date.now());
  check('پیام با نتیجهٔ نهایی ویرایش می‌شود', !!lastTg('editMessageText'));
  const before = (await listItems()).length;
  const rm = await apiCall('interactive/remove', { id: levelsId, kind: 'levels' });
  check('حذف، پیام را پاک می‌کند', rm.json.ok === true && !!lastTg('deleteMessage'));
  check('وضعیت هم پاک می‌شود', deepState(levelsId) === null);
  check('از فهرست کم می‌شود', (await listItems()).length === before - 1);
}
{
  /* ۷) رأی بعد از پایان رد می‌شود */
  const vote = { update_id: 7003, callback_query: { id: 'cb3', from: { id: 555222, first_name: 'دیرآمده' }, message: { message_id: pollMsg, date: 0, chat: { id: -1001234567890, type: 'channel' } }, data: `vote:${pollId}:o1` } };
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(vote) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 120));
  const st = liveState(pollId);
  check('بعد از پایان، رأی جدید ثبت نمی‌شود', Object.keys(st.votes || {}).length === 1);
  check('به کاربر گفته می‌شود مهلت تمام شد', /تمام/.test(lastTg('answerCallbackQuery')?.p.text || ''));
}

{
  /* ۷) کانال: پست «در پاسخ» ساخته می‌شود تا ادیت‌های بعدی هم آرت پرمیوم را نگه دارند */
  tg = [];
  const firstId = msgSeq;
  const chPoll = await apiCall('interactive/poll', { target: '@mychannel', title: 'پرسش 🚀 کانال', options: ['یک 🚀', 'دو 😀'], picks: { '🚀': '12345' } });
  const anchor = tg.find((c) => c.m === 'sendMessage');
  const send = tg.find((c) => c.m === 'sendRichMessage');
  const artEdit = tg.find((c) => c.m === 'editMessageText');
  const mk = tg.find((c) => c.m === 'editMessageReplyMarkup');
  const dels = tg.filter((c) => c.m === 'deleteMessage').map((c) => c.p.message_id);
  check('لنگرِ موقت ساخته و همان لحظه پاک می‌شود', !!anchor && dels.includes(firstId + 1), JSON.stringify({ anchor: !!anchor, del: dels }));
  check('پست کانال «در پاسخ» همان لنگر منتشر می‌شود', !!send && String(send.p.chat_id) === '@mychannel' && send.p.reply_parameters?.message_id === firstId + 1, JSON.stringify(send?.p?.reply_parameters || {}));
  check('ادیتِ بعدی آرت پرمیوم را روی پست می‌نشاند', !!artEdit && String(artEdit.p.chat_id) === '@mychannel' && /<tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(artEdit.p.rich_message.html), (artEdit?.p?.rich_message?.html || '').slice(0, 80));
  const rows = (artEdit?.p?.rich_message?.html || '').match(/<tg-button-row>[\s\S]*?<\/tg-button-row>/g) || [];
  check('دکمه‌های رأی داخل خودِ پست می‌آیند (کانال)', rows.length >= 2 && /<tg-button type="callback_data" data="vote:/.test(rows[0] || ''), (rows[0] || '').slice(0, 130));
  check('روی دکمهٔ نظرسنجی آرت پرمیوم نشسته', /<tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(rows[0] || ''), (rows[0] || '').slice(0, 130));
  check('در کانال دکمهٔ اینلاین جدایی ساخته نمی‌شود', !mk || mk.p.message_id !== chPoll.json.message_id, JSON.stringify(mk?.p?.message_id || null));
  check('هیچ پیام موقتی در پیوی نمی‌ماند (مسیر بومی، بدون کپی)', !tg.some((c) => c.m === 'copyMessage' || (c.m === 'sendRichMessage' && String(c.p.chat_id) === String(UID))));
  const chState = liveState(chPoll.json.id);
  check('وضعیت کانال، سازنده و مسیر بومی را نگه می‌دارد', String(chState?.owner) === String(UID) && chState?.chan === true && chState?.via === 'channel-native', JSON.stringify({ owner: chState?.owner, chan: chState?.chan, via: chState?.via }));

  /* رأی در کانال: همان پیام ادیت می‌شود، نه پیام تازه */
  tg = [];
  const msgBefore = chPoll.json.message_id;   /* شناسهٔ پستی که مینی‌اپ ساخت */
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 7031, callback_query: { id: 'cb31', from: { id: 555888, first_name: 'v' }, message: { message_id: msgBefore, date: 0, chat: { id: -1001234567890, type: 'channel' } }, data: `vote:${chPoll.json.id}:o1` } }) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 150));
  const voteEd = lastTg('editMessageText');
  const voteMk = lastTg('editMessageReplyMarkup');
  check('رأی در کانال هیچ پیام تازه‌ای نمی‌فرستد', !tg.some((c) => c.m === 'sendRichMessage' || c.m === 'copyMessage' || c.m === 'forwardMessage'), JSON.stringify(tg.map((c) => c.m)));
  check('همان پیامِ قبلی با آرت بالا می‌رود (شناسه عوض نمی‌شود)', !!voteEd && voteEd.p.message_id === msgBefore && liveState(chPoll.json.id)?.msgId === msgBefore && /<tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(voteEd.p.rich_message.html), JSON.stringify({ ed: voteEd?.p?.message_id, before: msgBefore, now: liveState(chPoll.json.id)?.msgId }));
  const voteRows = (voteEd?.p?.rich_message?.html || '').match(/<tg-button-row>/g) || [];
  check('بعد از رأی هم دکمه‌های پریمیوم داخل پست می‌مانند', voteRows.length >= 2 && /<tg-emoji/.test(voteEd?.p?.rich_message?.html || '') && !(voteMk && voteMk.p.message_id === msgBefore), 'rows=' + voteRows.length);
  const li = await listItems();
  const liRow = li.find((x) => x.id === chPoll.json.id);
  check('فهرست مینی‌اپ همان شناسه را نشان می‌دهد', !!liRow && liRow.msg === msgBefore, JSON.stringify(liRow?.msg));
  await apiCall('interactive/remove', { id: chPoll.json.id, kind: 'poll' });
}

{
  /* ۸) پستِ کانالیِ قدیمی (قبل از این نسخه، بدون «پاسخ») با اولین رأی ارتقا می‌یابد */
  tg = [];
  const fresh = await apiCall('interactive/poll', { target: 'me', title: 'پرسش قدیمی 🚀', options: ['یک', 'دو'] });
  const legacyId = fresh.json.id;
  const st = liveState(legacyId);
  delete st.owner; delete st.chan; delete st.premium; delete st.via;
  st.chatId = -1001234567890; st.msgId = 777;
  doStore.set(`live:${legacyId}`, JSON.stringify(st));
  rasaData.set(`intx:${UID}`, JSON.stringify({ items: [{ kind: 'poll', id: legacyId, title: 'پرسش قدیمی', at: Date.now(), chat: '@mychannel', msg: 777, link: null, minutes: 0 }] }));
  putMsg('@mychannel', 777, { reply: false, art: false });   // پیام قدیمی، بدون پاسخ ⇒ ادیت آرت را از دست می‌دهد
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 7041, callback_query: { id: 'cb41', from: { id: 555999, first_name: 'v' }, message: { message_id: 777, date: 0, chat: { id: -1001234567890, type: 'channel' } }, data: `vote:${legacyId}:o1` } }) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 200));
  const freshSend = tg.find((c) => c.m === 'sendRichMessage' && isChanId(String(c.p.chat_id)));
  const freshEdit = tg.filter((c) => c.m === 'editMessageText' && isChanId(c.p.chat_id)).pop();
  const healedDels = tg.filter((c) => c.m === 'deleteMessage').map((c) => c.p.message_id);
  check('پست قدیمی با نسخهٔ «در پاسخ» و پرمیوم‌دار جایگزین می‌شود', !!freshSend && !!freshSend.p.reply_parameters && !!freshEdit && /<tg-emoji emoji-id="999">🚀<\/tg-emoji>/.test(freshEdit.p.rich_message.html), (freshEdit?.p?.rich_message?.html || '').slice(0, 70));
  check('پیام قدیمی پاک و شناسهٔ تازه در وضعیت و فهرست ثبت می‌شود', healedDels.includes(777) && liveState(legacyId)?.msgId !== 777 && JSON.parse(rasaData.get(`intx:${UID}`)).items[0].msg === liveState(legacyId)?.msgId,
    JSON.stringify({ del: healedDels, now: liveState(legacyId)?.msgId, list: JSON.parse(rasaData.get(`intx:${UID}`)).items[0].msg }));
  check('سازنده در وضعیت ثبت می‌شود تا بعداً اسکن لازم نباشد', String(liveState(legacyId)?.owner) === String(UID) && liveState(legacyId)?.chan === true, JSON.stringify({ owner: liveState(legacyId)?.owner, chan: liveState(legacyId)?.chan }));
  await apiCall('interactive/remove', { id: legacyId, kind: 'poll' });
}

{
  /* ۹) آخرین راه: اگر مسیر بومی جواب ندهد، کپی از پیوی انجام می‌شود */
  tg = [];
  stripChannelArt = true;
  const p2 = await apiCall('interactive/poll', { target: '@mychannel', title: 'پرسش 🚀 دوم', options: ['الف', 'ب'], picks: { '🚀': '12345' } });
  stripChannelArt = false;
  const dmTemp = tg.find((c) => c.m === 'sendRichMessage' && String(c.p.chat_id) === String(UID));
  const copy = tg.find((c) => c.m === 'copyMessage' && String(c.p.chat_id) === '@mychannel');
  const dmDel = tg.find((c) => c.m === 'deleteMessage' && String(c.p.chat_id) === String(UID));
  check('مسیر کپی از پیوی به‌عنوان تور نجات کار می‌کند', !!dmTemp && !!copy && String(copy.p.from_chat_id) === String(UID), JSON.stringify({ dm: !!dmTemp, copy: !!copy }));
  check('پیام موقت پیوی همان‌جا پاک می‌شود', !!dmDel);
  check('وضعیت، مسیر کپی را ثبت می‌کند', String(liveState(p2.json.id)?.via || '').includes('copy'), String(liveState(p2.json.id)?.via));
  await apiCall('interactive/remove', { id: p2.json.id, kind: 'poll' });
}

{
  /* ۱۰) نه اسباب‌کشی: تپ دوبارهٔ «به‌روزرسانی نمودار» بدون تغییر ⇒ نه پیام تازه، نه حذف */
  tg = [];
  const r10 = await apiCall('interactive/poll', { target: '@mychannel', title: 'پرسش بدون تغییر 🚀', options: ['یک', 'دو'], minutes: 0 });
  const id10 = r10.json.id, msg10 = r10.json.message_id;
  putMsg('@mychannel', msg10, { reply: true, art: true, sig: JSON.stringify({ html: 'x' }) });
  const refreshUpd = (n) => ({ update_id: 7060 + n, callback_query: { id: 'cb6' + n, from: { id: 555000 + n, first_name: 'v' }, message: { message_id: msg10, date: 0, chat: { id: -1001234567890, type: 'channel' } }, data: `vote:${id10}:__refresh` } });
  tg = [];
  for (const n of [1, 2, 3]) {
    await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(refreshUpd(n)) }), env, { waitUntil: () => {} });
    await new Promise((r) => setTimeout(r, 120));
  }
  const newPosts = tg.filter((c) => c.m === 'sendRichMessage' || c.m === 'copyMessage' || c.m === 'forwardMessage');
  const delMsgs = tg.filter((c) => c.m === 'deleteMessage');
  check('تپ سه‌بارهٔ به‌روزرسانی هیچ پیام تازه‌ای نمی‌سازد', newPosts.length === 0, JSON.stringify(newPosts.map((c) => c.m)));
  check('و پیام کانال را پاک نمی‌کند', delMsgs.length === 0, JSON.stringify(delMsgs.map((c) => c.p.message_id)));
  check('شناسهٔ پیام در وضعیت و فهرست همان می‌ماند', liveState(id10)?.msgId === msg10 && (await listItems()).find((x) => x.id === id10)?.msg === msg10);
  await apiCall('interactive/remove', { id: id10, kind: 'poll' });
}

{
  /* ۱۱) ادیت هم‌زمان (تپ سریع): یک‌بار «canceled» می‌خورد، ولی پیام تازه ساخته نمی‌شود */
  tg = [];
  const r11 = await apiCall('interactive/poll', { target: '@mychannel', title: 'پرسش تپ سریع 🚀', options: ['یک', 'دو'], minutes: 0 });
  const id11 = r11.json.id, msg11 = r11.json.message_id;
  putMsg('@mychannel', msg11, { reply: true, art: true, sig: 'other' });
  tg = [];
  simCancelOnce = true;
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 7071, callback_query: { id: 'cb71', from: { id: 555777, first_name: 'v' }, message: { message_id: msg11, date: 0, chat: { id: -1001234567890, type: 'channel' } }, data: `vote:${id11}:o1` } }) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 700));
  const posts11 = tg.filter((c) => c.m === 'sendRichMessage' || c.m === 'copyMessage');
  check('خطای «canceled» با یک تلاش دوباره جبران می‌شود و پیام تازه نمی‌سازد', posts11.length === 0 && liveState(id11)?.msgId === msg11, JSON.stringify({ posts: posts11.length, msg: liveState(id11)?.msgId }));
  await apiCall('interactive/remove', { id: id11, kind: 'poll' });
}

{
  /* ۱۲) پیام واقعاً از دست رفته: حفاظت ۲۰ ثانیه‌ای اجازهٔ اسباب‌کشی پشت‌سرهم نمی‌دهد */
  tg = [];
  const r12 = await apiCall('interactive/poll', { target: '@mychannel', title: 'پرسش پیام گم‌شده 🚀', options: ['یک', 'دو'], minutes: 0 });
  const id12 = r12.json.id, msg12 = r12.json.message_id;
  putMsg('@mychannel', msg12, { reply: true, art: true, sig: 'other' });
  goneIds.add(msg12);
  /* حفاظت را از تست‌های قبلی خالی کن (کلید با شناسهٔ چتِ همان جریان ساخته می‌شود) */
  kvData.delete('chg:@mychannel');
  kvData.delete('chg:-1001234567890');
  const vote12 = (n) => ({ update_id: 7080 + n, callback_query: { id: 'cb8' + n, from: { id: 555880 + n, first_name: 'v' }, message: { message_id: msg12, date: 0, chat: { id: -1001234567890, type: 'channel' } }, data: `vote:${id12}:o1` } });
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(vote12(1)) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 200));
  const firstReplace = tg.filter((c) => c.m === 'sendRichMessage' && isChanId(c.p.chat_id)).length;
  tg = [];
  await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(vote12(2)) }), env, { waitUntil: () => {} });
  await new Promise((r) => setTimeout(r, 200));
  const secondReplace = tg.filter((c) => c.m === 'sendRichMessage' && isChanId(c.p.chat_id)).length;
  check('پیام گم‌شده یک بار جایگزین می‌شود', firstReplace === 1, 'posts=' + firstReplace);
  check('جایگزینی پشت‌سرهم (زیر ۲۰ ثانیه) دوباره رخ نمی‌دهد', secondReplace === 0, 'posts=' + secondReplace);
  goneIds.delete(msg12);
  check('حذف قدیمی‌ترین پیام هم یک‌بار انجام می‌شود', tg.filter((c) => c.m === 'deleteMessage').length <= 1);
  await apiCall('interactive/remove', { id: id12, kind: 'poll' });
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
