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
  check('دکمه‌های سطح، اموجی کاربر را دست‌نخورده نگه می‌دارند', !JSON.stringify(sent?.p.reply_markup || {}).includes('icon_custom_emoji_id'), JSON.stringify(sent?.p.reply_markup || {}).slice(0, 130));
  check('اموجی متن جانشین نمی‌شود', !/tg-emoji/.test(sent?.p.rich_message?.html || ''));
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
  check('اموجیِ فرم دست‌نخورده می‌ماند — هیچ تگ/آرت جانشینی نمی‌آید', (tagHtml.match(/🗳/g) || []).length === 3 && !/<tg-emoji/.test(tagHtml), 'count=' + (tagHtml.match(/🗳/g) || []).length);
  check('دکمه‌ها همان اموجی کاربر را نشان می‌دهند (بدون آیکن جانشین)', !/icon_custom_emoji_id/.test(tagButtons) && /"text":"[^"]*گزینه/.test(tagButtons), tagButtons.slice(0, 150));
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
  check('اموجی متنی که کاربر تایپ کرده شکل خودش را نگه می‌دارد', /🚀/.test(richHtml) && !/<tg-emoji[^>]*>🚀/.test(richHtml), richHtml.slice(0, 90));
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

  /* ۴ب۲) اموجیِ انتخاب‌شده از نوار: نشانهٔ نامرئی → آرت پرمیوم همان اموجی */
  const b36 = (x) => Number(x).toString(36);
  const rocket = '🚀\u2063' + b36(12345) + '\u2063';
  const heart = '❤\u2063253ir3xy\u2063';
  tg = [];
  const marked = await apiCall('interactive/poll', {
    target: 'me',
    title: 'نظرسنجی ' + rocket + ' تیتر',
    options: ['گزینه ' + rocket, 'دوم ' + heart],
    subtitle: 'زیرنویس ' + rocket
  });
  const mSent = lastTg('sendRichMessage');
  const mHtml = mSent?.p.rich_message?.html || '';
  const mButtons = JSON.stringify(mSent?.p.reply_markup || {});
  check('نشانهٔ نامرئی در تیتر به تگ پرمیوم تبدیل می‌شود', /<h2>[^<]*<tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(mHtml), mHtml.slice(0, 90));
  check('نشانه در سلول جدول هم به آرت تبدیل می‌شود', /<td>گزینه <tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(mHtml) && /<td>دوم <tg-emoji emoji-id="\d+">❤<\/tg-emoji>/.test(mHtml), (mHtml.match(/<td>[^<]*<tg-emoji[^>]*>/) || [''])[0]);
  check('عنوان دکمه، آیکن پرمیوم همان آرت را می‌گیرد', /"text":"گزینه 🚀[^"]*","callback_data":"vote:[^"]+","icon_custom_emoji_id":"12345"/.test(mButtons), mButtons.slice(0, 170));
  check('هیچ نشانهٔ نامرئی‌ای در پیام نمی‌ماند', !/\u2063/.test(mHtml) && !/\u2063/.test(mButtons));
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

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
