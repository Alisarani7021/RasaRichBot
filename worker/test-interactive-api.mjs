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

/* ── fake telegram ────────────────────────────────────────────────────────── */
let tg = [];
let botIsAdmin = true, userIsAdmin = true, chatType = 'channel';
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
  if (m === 'sendRichMessage') return Response.json({ ok: true, result: { message_id: 900 + tg.length } });
  if (m === 'editMessageText' || m === 'editMessageCaption') return Response.json({ ok: true, result: { message_id: p.message_id } });
  if (m === 'deleteMessage') return Response.json({ ok: true, result: true });
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
{
  /* ۱) نظرسنجی در پیوی خودم */
  tg = [];
  const r = await apiCall('interactive/poll', { target: 'me', title: 'سؤال تست', subtitle: 'زیرنویس', options: ['الف', 'ب', 'ج'], minutes: 60 });
  pollId = r.json?.id; pollMsg = r.json?.message_id;
  check('نظرسنجی ساخته و منتشر می‌شود', r.status === 200 && r.json.ok && !!pollId, JSON.stringify(r.json).slice(0, 90));
  const sent = lastTg('sendRichMessage');
  check('به پیوی خود کاربر رفته', String(sent?.p.chat_id) === String(UID));
  check('چارت و دکمه‌های رأی داخل پیام هست', /<table/.test(sent?.p.rich_message?.html || '') && JSON.stringify(sent?.p.reply_markup || {}).includes(`vote:${pollId}`));
  check('دکمه‌ها اینلاین‌اند (نه دکمه ریچ)', !!sent?.p.reply_markup?.inline_keyboard && !(sent?.p.rich_message?.html || '').includes('tg-button-row'));
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
  check('در کانال منتشر می‌شود', ok.json.ok === true && String(sent?.p.chat_id) === '@mychannel');
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

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
