/* Wave-2 surfaces: community-built posts, the /p/<id> landing page with its
   public submit endpoint, and the live-flow tick. Simulates real updates.
   Usage: node wave2_test.mjs <bundle.mjs>               (exit 0 = pass)      */
import { pathToFileURL } from 'node:url';

const bundlePath = process.argv[2] || './index.js';
const { default: worker } = await import(pathToFileURL(bundlePath).href);

const BOT = 'TEST:TOKEN', ORIGIN = 'https://rich-post-bot.4lisarani-1.workers.dev';
const kvData = new Map();
const kv = {
  async get(k, t) { const v = kvData.get(k); if (v === undefined) return null; return t === 'arrayBuffer' ? new TextEncoder().encode(v) : (t === 'json' ? JSON.parse(v) : v); },
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
const env = {
  BOT_TOKEN: BOT, WEBHOOK_SECRET: 's3cret', ADMIN_KEY: 'a',
  KV: kv, RASA_KV: kv, KV_FRESH: kv,
  STATE: { idFromName: () => 'x', get: () => ({ fetch: stateFetch }) }
};

let calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const m = u.split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  let p = {};
  try { p = opts.body ? JSON.parse(opts.body) : {}; } catch {}
  calls.push({ m, p });
  if (m === 'getMe') return Response.json({ ok: true, result: { id: 8826777931, is_bot: true, username: 'RasaRichBot' } });
  if (m === 'answerCallbackQuery') return Response.json({ ok: true, result: true });
  if (m === 'editMessageText' || m === 'editMessageCaption') return Response.json({ ok: true, result: { message_id: p.message_id } });
  if (m === 'editMessageMedia') return Response.json({ ok: true, result: { message_id: p.message_id } });
  if (m === 'sendMessage' || m === 'sendRichMessage') return Response.json({ ok: true, result: { message_id: 4242 } });
  return Response.json({ ok: true, result: true });
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

const text = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };
const post = async (body) => {
  calls = [];
  let pending;
  const res = await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, { waitUntil: (x) => { pending = x; } });
  if (pending) await pending.catch(() => {});
  return { status: res.status, calls: calls.slice() };
};
let seq = 3000;
const send = async (message, opts = {}) => post({ update_id: ++seq, message: { message_id: 60, date: Math.floor(Date.now() / 1000), chat: { id: opts.chat ?? 5982315292, type: opts.type || 'private' }, from: { id: opts.uid ?? 999004, first_name: opts.name || 'مهمان' }, text: message } });
const tap = async (data, opts = {}) => post({ update_id: ++seq, callback_query: { id: 'cb' + (++seq), from: { id: opts.uid ?? 999004, first_name: opts.name || 'مهمان' }, message: { message_id: opts.msgId ?? 500, date: Math.floor(Date.now() / 1000), chat: { id: opts.chat ?? 5982315292, type: 'private' } }, data } });
const edits = (cs) => cs.filter(c => c.m === 'editMessageText' || c.m === 'editMessageCaption');
const edHtml = (c) => (c?.p.rich_message?.html || c?.p.text || c?.p.caption || '');
const dms = (cs, uid) => cs.filter(c => (c.m === 'sendMessage' || c.m === 'sendRichMessage') && String(c.p.chat_id) === String(uid));

const seedComm = (id, extra = {}) => {
  const st = Object.assign({
    id, chatId: 5982315292, msgId: 500, title: '🧩 پست با هم', subtitle: 'هر عضو یک خط',
    founder: 999005, founderName: 'علی', lines: [{ uid: '999004', name: 'مهمان', at: Date.now() - 60000, text: 'اولین خط' }], open: true, goal: 5, updatedAt: Date.now()
  }, extra);
  doStore.set(`comm:${id}`, JSON.stringify(st));
  kvData.set(`comm:${id}`, JSON.stringify(st));
  return st;
};
const commState = (id) => JSON.parse(doStore.get(`comm:${id}`) || '{}');
const seedLive = (id, extra = {}) => {
  const st = Object.assign({ id, title: '🌊 استریمر', subtitle: 'خودش می‌رود', status: '🟢 زنده', entries: [], updatedAt: Date.now() }, extra);
  doStore.set(`live:${id}`, JSON.stringify(st));
  return st;
};
const seedJobs = (jobs) => {
  kvData.set('sched:999001', JSON.stringify({ jobs }));
  kvData.set('sched_global', JSON.stringify({ ids: jobs.map(j => ({ id: j.id, uid: 999001, at: Date.now() - 1000 })) }));
};

console.log('— موج دوم: پست جمعی، صفحهٔ فرود، استریمر —');
{
  /* ۱) یک عضو خطش را می‌فرستد → همان پست ویرایش می‌شود */
  kvData.clear(); doStore.clear();
  seedComm('k1');
  doStore.set('st:999004', JSON.stringify({ mode: 'community_line', cid: 'k1', at: Date.now() }));
  const r = await send('از شمال، هوای ابری و خلوت ☁️');
  const ed = edits(r.calls);
  check('خط عضو به پست اضافه می‌شود', ed.length === 1 && text(edHtml(ed[0])).includes('هوای ابری'), 'edits=' + ed.length);
  check('همان پیام پست ویرایش می‌شود (نه پیام جدید)', ed[0]?.p.message_id === 500 && !r.calls.some(c => (c.m === 'sendRichMessage' || c.m === 'sendMessage') && String(c.p.chat_id) === '5982315292'));
  check('خط در وضعیت پست ذخیره شد', (commState('k1').lines || []).length === 2);
  check('نویسندهٔ خط ثبت شد', commState('k1').lines[1].uid === '999004' && commState('k1').lines[1].name === 'مهمان');
  check('به خود عضو تأیید می‌رود', dms(r.calls, 999004).some(c => /خطت اضافه شد/.test(text(c.p.text || c.p.rich_message?.html))));
  check('حالت انتظار بعد از استفاده پاک می‌شود', doStore.get('st:999004') === undefined);
  const r2 = await send('پیام عادی ربات');
  check('پیام بی‌ربط دست‌نخورده می‌ماند', edits(r2.calls).length === 0);
}
{
  /* ۲) دکمهٔ «خطم را اضافه کن» */
  const r = await tap('comm:k1:add', { uid: 999007, name: 'سارا' });
  const dm = dms(r.calls, 999007);
  check('تپ دکمه، عضو را به پیوی می‌فرستد', dm.length === 1 && /خطت را/.test(text(dm[0].p.text || dm[0].p.rich_message?.html)));
  check('حالت یک‌خطی برای عضو ست می‌شود', JSON.parse(doStore.get('st:999007') || '{}').mode === 'community_line');
  const r2 = await tap('comm:k1:add', { uid: 999007, name: 'سارا' });
  check('تپ دوم هم امن است', dms(r2.calls, 999007).length === 1);
}
{
  /* ۳) شمارندهٔ فارسی و نوار پیشرفت */
  const r = await send('خط دوم از طرف من', { uid: 999007, name: 'سارا' });
  const html = edHtml(edits(r.calls)[0]);
  check('نوار پیشرفت رندر می‌شود', /[█░]{10}/.test(html) && !/NaN/.test(html), text(html).slice(0, 70));
  check('تعداد خط‌ها و نویسنده‌ها درست است', /3 خط از 2 نویسنده/.test(text(html)), text(html).slice(0, 60));
}
{
  /* ۴) بستن پست فقط دست سازنده */
  const r1 = await tap('comm:k1:close', { uid: 999004 });
  check('غریبه نمی‌تواند ببندد', commState('k1').open === true && JSON.parse(doStore.get('comm:k1')).open === true);
  const r2 = await tap('comm:k1:close', { uid: 999005, name: 'علی' });
  const html = edHtml(edits(r2.calls)[0]);
  check('سازنده می‌تواند ببندد', commState('k1').open === false);
  check('فوتر پست بسته عوض می‌شود', /کامل شد/.test(text(html)), text(html).slice(-60));
  const r3 = await send('بعد از بستن', { uid: 999009, name: 'نگار' });
  const r3b = await tap('comm:k1:add', { uid: 999009 });
  check('بعد از بستن خط جدید ثبت نمی‌شود', (commState('k1').lines || []).length === 3);
  check('به عضو گفته می‌شود پست بسته است', r3b.calls.some(c => c.m === 'answerCallbackQuery' && /بسته/.test(c.p.text || '')));
  check('پیام بی‌خط هم پست را دست نمی‌زند', edits(r3.calls).length === 0);
}
{
  /* ۵) استریمر: کرون مقدار را جلو می‌برد */
  const st = seedLive('str1', { flow: { label: 'شمارندهٔ زنده', emoji: '📈', unit: ' نفر', value: 100, series: [60, 80, 100] } });
  seedJobs([{ id: 'f1', kind: 'live_tick', liveId: 'str1', target: 5982315292, messageId: 610, flow: { label: 'شمارندهٔ زنده', emoji: '📈', unit: ' نفر', step: 40, jitter: 10, min: 0, max: 1000 }, scheduledAt: Date.now() - 100, status: 'pending' }]);
  calls = [];
  await worker.scheduled({}, env, {});
  const ed = edits(calls);
  const now = JSON.parse(doStore.get('live:str1') || '{}');
  check('کرون مقدار زنده را جلو می‌برد', ed.length === 1 && now.flow.value > 100, 'value=' + now.flow.value);
  check('نمودار کوچک (sparkline) در پست می‌آید', /[▁▂▃▄▅▆▇█]/.test(edHtml(ed[0])), text(edHtml(ed[0])).slice(-70));
  check('سری زمانی رشد می‌کند', (now.flow.series || []).length === 4);
  check('سقف و کف رعایت می‌شود', now.flow.value <= 1000 && now.flow.value >= 0);
  for (let i = 0; i < 30; i++) {
    seedJobs([{ id: 'f' + i, kind: 'live_tick', liveId: 'str1', target: 1, messageId: 610, flow: { step: 500, jitter: 0, min: 0, max: 1000 }, scheduledAt: Date.now(), status: 'pending' }]);
    await worker.scheduled({}, env, {});
  }
  check('پس از ۳۰ تیک هم از سقف بیرون نمی‌زند', JSON.parse(doStore.get('live:str1')).flow.value === 1000);
}
{
  /* ۶) صفحهٔ فرود: رندر، فرم، ثبت، شمارش */
  kvData.clear(); doStore.clear();
  const page = { id: 'p1', owner: 999005, title: 'کارگاه عکاسی', subtitle: 'ظرفیت محدود', body: '<p>سه جلسه عملی</p>', blocks: [{ k: 'شهریه', v: '۹۸۰ هزار' }], cta: { text: 'گفتن در تلگرام', url: 'https://t.me/RasaRichBot' }, form: true, image: 'lhero.jpg', photos: ['collab/c1.jpg', 'collab/c2.jpg'] };
  kvData.set('land:p1', JSON.stringify(page));
  const res = await worker.fetch(new Request(`${ORIGIN}/p/p1`, { method: 'GET' }), env, {});
  const html = await res.text();
  check('صفحهٔ فرود با کد ۲۰۰ برمی‌گردد', res.status === 200);
  check('عنوان و توضیح در صفحه هست', html.includes('کارگاه عکاسی') && html.includes('ظرفیت محدود'));
  check('جدول محتوا رندر می‌شود', html.includes('شهریه') && html.includes('۹۸۰ هزار'));
  check('فرم ثبت نام در صفحه هست', html.includes('id="f"') && html.includes('ثبت درخواست'));
  check('دکمهٔ CTA به تلگرام وصل است', html.includes('https://t.me/RasaRichBot'));
  check('صفحه خودبسنده است (فقط اسکریپت رسمی تلگرام)', !/<link/.test(html) && !/src="http(?!s:\/\/telegram\.org)/.test(html));
  check('مسیر عکس‌ها پوشهٔ خودش را نگه می‌دارد', html.includes('/assets/collab/c1.jpg') && html.includes('/assets/lhero.jpg'), 'gallery path');
  check('صفحهٔ ناموجود ۴۰۴ می‌دهد', (await worker.fetch(new Request(`${ORIGIN}/p/nope`, { method: 'GET' }), env, {})).status === 404);

  calls = [];
  const sub = await worker.fetch(new Request(`${ORIGIN}/api/landing/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: 'p1', name: 'مریم', contact: '@maryam', note: 'شنبه بهتره' }) }), env, {});
  const sj = await sub.json();
  check('ثبت فرم ذخیره می‌شود', sub.status === 200 && sj.ok === true && sj.count === 1, JSON.stringify(sj));
  check('به صاحب پست در پیوی خبر می‌رود', calls.some(c => c.m === 'sendMessage' && String(c.p.chat_id) === '999005' && /ثبت جدید/.test(c.p.text || '')));
  const sub2 = await worker.fetch(new Request(`${ORIGIN}/api/landing/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: 'p1', name: 'حسن', contact: '0912' }) }), env, {});
  check('ثبت دوم هم ذخیره می‌شود', (await sub2.json()).count === 2);
  const cnt = await worker.fetch(new Request(`${ORIGIN}/api/landing/count?page=p1`, { method: 'GET' }), env, {});
  check('شمارندهٔ ثبت‌ها قابل خواندن است', (await cnt.json()).count === 2);
  const bad = await worker.fetch(new Request(`${ORIGIN}/api/landing/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: 'p1' }) }), env, {});
  check('ثبت خالی رد می‌شود', bad.status === 400);
  const miss = await worker.fetch(new Request(`${ORIGIN}/api/landing/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: 'none', name: 'x' }) }), env, {});
  check('صفحهٔ ناموجود ثبت نمی‌شود', miss.status === 404);
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
