/* Live posts: one message whose bars move as channel subscribers vote.
   Simulates Telegram callbacks (including voters who are not the operator) and
   asserts the message edit, the tallies, vote changes and the deadline.
   Usage: node live_post_test.mjs <bundle.mjs>            (exit 0 = pass)      */
import { pathToFileURL } from 'node:url';

const bundlePath = process.argv[2] || './index.js';
const { default: worker } = await import(pathToFileURL(bundlePath).href);

const BOT = 'TEST:TOKEN', ORIGIN = 'https://rich-post-bot.4lisarani-1.workers.dev';
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

let sent = [], answers = [];
globalThis.fetch = async (url, opts = {}) => {
  const m = String(url).split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  let p = {};
  try { p = opts.body ? JSON.parse(opts.body) : {}; } catch {}
  if (m === 'getMe') return Response.json({ ok: true, result: { id: 8826777931, is_bot: true, username: 'RasaRichBot' } });
  if (m === 'answerCallbackQuery') { answers.push(p.text || ''); return Response.json({ ok: true, result: true }); }
  if (m === 'editMessageText' || m === 'editMessageCaption') { sent.push({ m, chat_id: p.chat_id, message_id: p.message_id, html: p.rich_message?.html || p.text || p.caption || '', markup: p.reply_markup }); return Response.json({ ok: true, result: { message_id: p.message_id } }); }
  if (m === 'sendRichMessage' || m === 'sendMessage') { sent.push({ m, chat_id: p.chat_id, html: p.rich_message?.html || p.text || '', markup: p.reply_markup }); return Response.json({ ok: true, result: { message_id: 4242 } }); }
  return Response.json({ ok: true, result: true });
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

const CHANNEL = -1001234567890;
let seq = 500;
const vote = async (data, { uid = 111, chat = CHANNEL, msgId = 77 } = {}) => {
  sent = []; answers = [];
  const update = { update_id: ++seq, callback_query: { id: 'cb' + (++seq), from: { id: uid, first_name: 'u' + uid }, message: { message_id: msgId, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: 'channel', title: 'کانال تست' } }, data } };
  let pending;
  const res = await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(update) }), env, { waitUntil: (x) => { pending = x; } });
  if (pending) await pending.catch(() => {});
  return { status: res.status, last: sent[sent.length - 1], answers: answers.slice(), edits: sent.slice() };
};
const stateNow = (id) => JSON.parse(doStore.get(`live:${id}`) || kvData.get(`live:${id}`) || '{}');
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const bars = (h) => (String(h || '').match(/[█░]+/g) || []);
const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const seed = (id, extra = {}) => {
  const state = Object.assign({
    id, title: '📊 نظرسنجی زندهٔ بازار', subtitle: 'هر رأی، نمودار همین پست را برای همه بالا می‌برد.',
    options: [{ key: 'up', label: '📈 صعودی' }, { key: 'down', label: '📉 نزولی' }, { key: 'flat', label: '➡️ خنثی' }],
    votes: {}, createdAt: Date.now(), updatedAt: Date.now(), endsAt: Date.now() + 30 * 60 * 1000
  }, extra);
  doStore.set(`live:${id}`, JSON.stringify(state));
  return state;
};

console.log('— پست زندهٔ تعاملی —');
{
  kvData.clear(); doStore.clear();
  seed('demo1');
  const r1 = await vote('vote:demo1:up', { uid: 111 });
  const st1 = stateNow('demo1');
  check('رأی یک عضو کانال ثبت می‌شود', st1.votes['111'] === 'up', JSON.stringify(st1.votes));
  check('پیام در همان کانال ویرایش می‌شود', r1.last && r1.last.chat_id === CHANNEL && r1.last.message_id === 77, JSON.stringify({ chat: r1.last?.chat_id, msg: r1.last?.message_id }));
  check('نمودار میله‌ای در پیام هست', bars(r1.last.html).length >= 3, bars(r1.last.html).join(' | '));
  check('میلهٔ گزینهٔ رأی‌داده پر و بقیه خالی', bars(r1.last.html)[0] === '█'.repeat(10) && bars(r1.last.html)[1] === '░'.repeat(10), bars(r1.last.html)[0]);
  check('درصد و تعداد در پیام می‌آید', /100%/.test(r1.last.html) && /<b>1<\/b>/.test(r1.last.html));
  check('مجموع آرا نمایش داده می‌شود', strip(r1.last.html).includes('مجموع آرا: 1'));
  check('به کاربر تأیید رأی نشان داده می‌شود', /ثبت شد/.test(r1.answers.join(' ')), r1.answers.join(' / '));
  check('مهلت با tg-time نمایش داده می‌شود', /<tg-time unix="\d+"/.test(r1.last.html));
  check('رأی‌گیری برای همه باز است (نه فقط اپراتور)', !!r1.last, 'edits=' + r1.edits.length);
}
{
  const r2 = await vote('vote:demo1:down', { uid: 222 });
  const st2 = stateNow('demo1');
  check('رأی نفر دوم اضافه می‌شود', Object.keys(st2.votes).length === 2, JSON.stringify(st2.votes));
  const b = bars(r2.last.html);
  check('نمودار ۵۰/۵۰ می‌شود', b[0] === '█'.repeat(5) + '░'.repeat(5) && b[1] === '█'.repeat(5) + '░'.repeat(5), b.join(' | '));
}
{
  const r3 = await vote('vote:demo1:up', { uid: 111 });
  const st3 = stateNow('demo1');
  check('رأی تکراری دوباره شمرده نمی‌شود', Object.keys(st3.votes).length === 2, JSON.stringify(st3.votes));
  check('به کاربر گفته می‌شود رأیت همین بود', /همین بود/.test(r3.answers.join(' ')), r3.answers.join(' / '));
}
{
  const r4 = await vote('vote:demo1:flat', { uid: 111 });
  const st4 = stateNow('demo1');
  const b = bars(r4.last.html);
  check('رأی قابل تغییر است', st4.votes['111'] === 'flat' && st4.votes['222'] === 'down');
  check('نمودار بعد از تغییر رأی درست است', b[1] === '█'.repeat(5) + '░'.repeat(5) && b[2] === '█'.repeat(5) + '░'.repeat(5), b.join(' | '));
  check('پیام «رأیت عوض شد» می‌آید', /عوض شد/.test(r4.answers.join(' ')), r4.answers.join(' / '));
}
{
  const r5 = await vote('vote:demo1:__nope', { uid: 333 });
  check('گزینهٔ نامعتبر رد می‌شود', /نامعتبر/.test(r5.answers.join(' ')) && !Object.keys(stateNow('demo1').votes).includes('333'), r5.answers.join(' / '));
}
{
  const r6 = await vote('vote:missing:up', { uid: 444 });
  check('نظرسنجی ناموجود پیام روشن می‌دهد', /در دسترس نیست/.test(r6.answers.join(' ')), r6.answers.join(' / '));
}
{
  /* مهلت تمام‌شده: رأی جدید رد می‌شود ولی نتیجه باقی می‌ماند */
  kvData.clear(); doStore.clear();
  seed('demo2', { endsAt: Date.now() - 1000 });
  const r7 = await vote('vote:demo2:up', { uid: 555 });
  const st = stateNow('demo2');
  check('بعد از مهلت رأی جدید ثبت نمی‌شود', !st.votes['555'] && /تمام شد/.test(r7.answers.join(' ')), r7.answers.join(' / '));
  check('پس از پایان، دکمهٔ نتیجهٔ نهایی می‌آید', JSON.stringify(r7.last.markup).includes('__refresh') && strip(r7.last.html).includes('مهلت تمام'));
}
{
  const r8 = await vote('vote:demo2:__refresh', { uid: 666 });
  check('دکمهٔ به‌روزرسانی پیام را ویرایش می‌کند', !!r8.last && r8.last.message_id === 77, 'edits=' + r8.edits.length);
}
{
  /* ظرفیت: بیش از ۵۰۰۰ رأی‌دهنده پذیرفته نمی‌شود */
  kvData.clear(); doStore.clear();
  const big = seed('demo3');
  for (let i = 0; i < 5000; i++) big.votes['u' + i] = 'up';
  doStore.set('live:demo3', JSON.stringify(big));
  const r9 = await vote('vote:demo3:up', { uid: 999999 });
  check('سقف ظرفیت رعایت می‌شود', /ظرفیت/.test(r9.answers.join(' ')), r9.answers.join(' / '));
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
