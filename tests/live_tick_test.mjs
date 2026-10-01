/* Self-updating posts: the cron wakes up, edits the message that is already in
   the chat and never sends a new one. Covers coverage entries, title patches,
   carousel auto-advance, the pause switch and the old schedule behaviour.
   Usage: node live_tick_test.mjs <bundle.mjs>           (exit 0 = pass)      */
import { pathToFileURL } from 'node:url';

const bundlePath = process.argv[2] || './index.js';
const { default: worker } = await import(pathToFileURL(bundlePath).href);

const BOT = 'TEST:TOKEN';
const kvData = new Map();
const kv = {
  async get(k, t) { const v = kvData.get(k); if (v === undefined) return null; return t === 'json' ? JSON.parse(v) : v; },
  async put(k, v) { kvData.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kvData.delete(k); },
  async list({ prefix = '' } = {}) { return { keys: [...kvData.keys()].filter(x => x.startsWith(prefix)).map(name => ({ name })), list_complete: true }; }
};
const doStore = new Map();
const stateFetch = async (input, init = {}) => {
  const href = typeof input === 'string' ? input : input.url;
  const method = init.method || (typeof input === 'object' && input.method) || 'GET';
  const key = new URL(href).searchParams.get('key');
  if (method === 'GET') { const v = doStore.get(key); return v === undefined ? new Response('', { status: 404 }) : new Response(String(v)); }
  if (method === 'PUT') { doStore.set(key, String(init.body ?? '')); return new Response('OK'); }
  if (method === 'DELETE') { doStore.delete(key); return new Response('OK'); }
  return new Response('', { status: 405 });
};
const env = { BOT_TOKEN: BOT, WEBHOOK_SECRET: 's3cret', ADMIN_KEY: 'a', KV: kv, RASA_KV: kv, KV_FRESH: kv, STATE: { idFromName: () => 'x', get: () => ({ fetch: stateFetch }) } };

let sent = [];
globalThis.fetch = async (url, opts = {}) => {
  const m = String(url).split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  let p = {};
  try { p = opts.body ? JSON.parse(opts.body) : {}; } catch {}
  if (m === 'getMe') return Response.json({ ok: true, result: { id: 8826777931, is_bot: true, username: 'RasaRichBot' } });
  if (m === 'editMessageMedia') { sent.push({ m, chat_id: p.chat_id, message_id: p.message_id, fileId: p.media?.media, caption: p.media?.caption || '', html: '' }); return Response.json({ ok: true, result: { message_id: p.message_id } }); }
  if (m === 'editMessageText' || m === 'editMessageCaption') { sent.push({ m, chat_id: p.chat_id, message_id: p.message_id, html: p.rich_message?.html || p.text || p.caption || '' }); return Response.json({ ok: true, result: { message_id: p.message_id } }); }
  if (m === 'sendRichMessage' || m === 'sendMessage') { sent.push({ m, chat_id: p.chat_id, html: p.rich_message?.html || p.text || '' }); return Response.json({ ok: true, result: { message_id: 4242 } }); }
  if (m === 'deleteMessage') { sent.push({ m, chat_id: p.chat_id, message_id: p.message_id }); return Response.json({ ok: true, result: true }); }
  return Response.json({ ok: true, result: true });
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

const text = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const USER = 999001, CHAT = 5982315292, MSG = 700;
const seedLive = (id, extra = {}) => {
  const st = Object.assign({ id, title: '🛰 پوشش زنده', subtitle: 'خودش کامل می‌شود', status: '🟢 زنده', entries: [], updatedAt: Date.now() }, extra);
  doStore.set(`live:${id}`, JSON.stringify(st));
  kvData.set(`live:${id}`, JSON.stringify(st));
  return st;
};
const seedCar = (id, extra = {}) => {
  const st = Object.assign({ id, slides: [{ fileId: 'F1', title: 'ی', caption: 'ی' }, { fileId: 'F2', title: 'د', caption: 'د' }, { fileId: 'F3', title: 'س', caption: 'س' }], idx: 0, auto: true, updatedAt: Date.now() }, extra);
  doStore.set(`car:${id}`, JSON.stringify(st));
  kvData.set(`car:${id}`, JSON.stringify(st));
  return st;
};
const seedJobs = (jobs) => {
  kvData.set(`sched:${USER}`, JSON.stringify({ jobs }));
  kvData.set('sched_global', JSON.stringify({ ids: jobs.map(j => ({ id: j.id, uid: USER, at: Date.now() - 1000 })) }));
};
const jobState = (id) => (JSON.parse(kvData.get(`sched:${USER}`) || '{"jobs":[]}').jobs || []).find(j => j.id === id) || {};
const runCron = async () => { sent = []; await worker.scheduled({}, env, {}); return sent.slice(); };
const stateNow = (key) => JSON.parse(doStore.get(key) || kvData.get(key) || '{}');

console.log('— پست‌هایی که خودشان به‌روز می‌شوند —');
{
  /* ۱) پوشش زنده: کرون یک خط خبر اضافه می‌کند */
  seedLive('cv1');
  seedJobs([
    { id: 't1', kind: 'live_tick', liveId: 'cv1', target: CHAT, messageId: MSG, entry: { text: 'پرده کنار رفت 🎬' }, scheduledAt: Date.now() - 500, status: 'pending', createdAt: Date.now() - 60000 },
    { id: 't2', kind: 'live_tick', liveId: 'cv1', target: CHAT, messageId: MSG, entry: { text: 'صفِ جمعیت تا انتهای سالن' }, scheduledAt: Date.now() - 400, status: 'pending', createdAt: Date.now() - 60000 }
  ]);
  const out = await runCron();
  check('کرون پیام زنده را ویرایش می‌کند، پیام جدید نمی‌فرستد', out.length === 2 && out.every(s => s.m === 'editMessageText' || s.m === 'editMessageCaption') && !out.some(s => /^send/.test(s.m)), out.map(s => s.m).join(','));
  check('همان message_id در چت به‌روز می‌شود', out.every(s => s.message_id === MSG && s.chat_id === CHAT));
  check('خط تازه در متن پست دیده می‌شود', text(out[out.length - 1].html).includes('پرده کنار رفت'), text(out[out.length - 1].html).slice(-120));
  check('هر دو خط ثبت شدند', (stateNow('live:cv1').entries || []).length === 2);
  check('سرتیتر لحظه‌به‌لحظه اضافه شده', /لحظه‌به‌لحظه/.test(text(out[out.length - 1].html)));
  check('کارها done علامت خوردند', jobState('t1').status === 'done' && jobState('t2').status === 'done');
  check('شناسهٔ پیام در سابقهٔ کار ذخیره شد', jobState('t1').message_id === MSG);
  check('فهرست کلی بعد از اجرا پاک می‌شود', JSON.parse(kvData.get('sched_global') || '{"ids":[]}').ids.length === 0);
}
{
  /* ۲) پایان پوشش: عناوین با patch عوض می‌شوند */
  seedJobs([{ id: 't3', kind: 'live_tick', liveId: 'cv1', target: CHAT, messageId: MSG, entry: { text: 'گزارش کامل منتشر شد.' }, patch: { title: '🎊 تمام شد', status: '🏁 پایان پوشش' }, scheduledAt: Date.now() - 200, status: 'pending' }]);
  const out = await runCron();
  const html = text(out[0].html);
  check('عنوان پست با patch عوض می‌شود', html.includes('تمام شد') && html.includes('پایان پوشش'), html.slice(0, 100));
  check('patch فقط سرتیتر و وضعیت را دست می‌زند', stateNow('live:cv1').subtitle === 'خودش کامل می‌شود');
  check('سابقهٔ خط‌های قبلی حفظ می‌شود', (stateNow('live:cv1').entries || []).length === 3);
}
{
  /* ۳) کاروسل خودکار: کرون یک اسلاید جلو می‌رود */
  seedCar('c9');
  seedJobs([{ id: 't4', kind: 'live_tick', advance: true, liveId: 'c9', target: CHAT, messageId: 710, scheduledAt: Date.now() - 100, status: 'pending' }]);
  const out = await runCron();
  check('کرون عکس کاروسل را جلو می‌برد', out[0]?.m === 'editMessageMedia' && out[0].fileId === 'F2', out[0]?.fileId);
  check('اسلاید در state جلو رفته', stateNow('car:c9').idx === 1);
  const again = await runCron();
  check('اجرای دوباره کاری نمی‌کند (کار تمام شده است)', again.length === 0);
}
{
  /* ۴) ⏸ کاربر پخش خودکار را نگه داشته */
  seedCar('c9b', { auto: false });
  seedJobs([{ id: 't5', kind: 'live_tick', advance: true, liveId: 'c9b', target: CHAT, messageId: 711, scheduledAt: Date.now() - 50, status: 'pending' }]);
  const out = await runCron();
  check('در حالت نگه‌داشته هیچ ویرایشی انجام نمی‌شود', out.length === 0);
  check('کار بی‌خطر done می‌شود تا هر دقیقه تلاش نکند', jobState('t5').status === 'done');
  check('اسلاید تکان نمی‌خورد', stateNow('car:c9b').idx === 0);
}
{
  /* ۵) حالت‌های خطا */
  seedJobs([{ id: 't6', kind: 'live_tick', liveId: 'none', target: CHAT, messageId: 712, entry: { text: 'x' }, scheduledAt: Date.now() - 50, status: 'pending' }]);
  const out = await runCron();
  check('پست ناموجود خطا می‌دهد ولی چیزی نمی‌فرستد', out.length === 0);
  check('کار ناموفق pending می‌ماند', jobState('t6').status === 'pending');
  seedJobs([{ id: 't7', kind: 'live_tick', advance: true, liveId: 'noCar', target: CHAT, messageId: 713, scheduledAt: Date.now() - 50, status: 'pending' }]);
  await runCron();
  check('کاروسل ناموجود هم امن است', jobState('t7').status === 'pending');
}
{
  /* ۶) رگرسیون: زمان‌بندی قدیمی دقیقاً مثل قبل کار می‌کند */
  seedJobs([{ id: 't8', target: CHAT, html: '<h2>پست زمان‌بندی‌شده</h2>', scheduledAt: Date.now() - 50, deleteAfter: 60, status: 'pending' }]);
  const out = await runCron();
  check('کار زمان‌بندی‌شدهٔ قبلی هنوز با sendRichMessage منتشر می‌شود', out[0]?.m === 'sendRichMessage' && out[0].html.includes('پست زمان‌بندی‌شده'), out[0]?.m);
  check('حذف خودکار بعد از انتشار ثبت می‌شود', !!kvData.get('sched_del:t8'));
  check('کار قدیمی هم done می‌شود', jobState('t8').status === 'done');
}
{
  /* ۷) سقف سابقه */
  const many = [];
  for (let i = 0; i < 45; i++) many.push({ at: Date.now(), text: 'خط ' + i });
  seedLive('cv2', { entries: many });
  seedJobs([{ id: 't9', kind: 'live_tick', liveId: 'cv2', target: CHAT, messageId: 720, entry: { text: 'آخرین خط' }, scheduledAt: Date.now() - 10, status: 'pending' }]);
  await runCron();
  check('سابقه بی‌نهایت رشد نمی‌کند', (stateNow('live:cv2').entries || []).length === 40);
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
