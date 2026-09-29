/* Live carousel: one message whose photo swaps in place when people tap.
   Simulates real callback queries (voters, not the operator) and asserts the
   media edit, the wrap-around, the pause switch and the invalid paths.
   Usage: node carousel_test.mjs <bundle.mjs>            (exit 0 = pass)      */
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
  if (m === 'answerCallbackQuery') { answers.push({ text: p.text || '', alert: !!p.show_alert }); return Response.json({ ok: true, result: true }); }
  if (m === 'editMessageMedia') {
    sent.push({ m, chat_id: p.chat_id, message_id: p.message_id, fileId: p.media?.media, caption: p.media?.caption || '', markup: p.reply_markup });
    return Response.json({ ok: true, result: { message_id: p.message_id } });
  }
  if (m === 'sendPhoto' || m === 'sendRichMessage' || m === 'sendMessage') {
    sent.push({ m, chat_id: p.chat_id, caption: p.caption || p.rich_message?.html || p.text || '' });
    return Response.json({ ok: true, result: { message_id: 999 } });
  }
  return Response.json({ ok: true, result: true });
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

const CHAT = -1001234567890;
let seq = 900;
const tap = async (data, { uid = 111, chat = CHAT, msgId = 77 } = {}) => {
  sent = []; answers = [];
  const update = { update_id: ++seq, callback_query: { id: 'cb' + (++seq), from: { id: uid, first_name: 'u' + uid }, message: { message_id: msgId, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: 'channel', title: 'کانال تست' } }, data } };
  let pending;
  const res = await worker.fetch(new Request(`${ORIGIN}/telegram/webhook`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(update) }), env, { waitUntil: (x) => { pending = x; } });
  if (pending) await pending.catch(() => {});
  return { status: res.status, last: sent[sent.length - 1], answers: answers.slice(), edits: sent.slice() };
};
const stateNow = (id) => JSON.parse(doStore.get(`car:${id}`) || kvData.get(`car:${id}`) || '{}');
const text = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const SLIDES = [
  { fileId: 'FILE_A', title: '🏔 کوه', caption: 'اسلاید یک' },
  { fileId: 'FILE_B', title: '🌿 باغ', caption: 'اسلاید دو' },
  { fileId: 'FILE_C', title: '🏜 کویر', caption: 'اسلاید سه' },
  { fileId: 'FILE_D', title: '🌫 جنگل', caption: 'اسلاید چهار' }
];
const seed = (id, extra = {}) => {
  const state = Object.assign({ id, slides: SLIDES, idx: 0, auto: true, createdAt: Date.now(), updatedAt: Date.now() }, extra);
  doStore.set(`car:${id}`, JSON.stringify(state));
  kvData.set(`car:${id}`, JSON.stringify(state));
  return state;
};

console.log('— کاروسل زندهٔ درجا —');
{
  /* ۱) جلو رفتن، همان پیام عوض می‌شود */
  kvData.clear(); doStore.clear();
  seed('c1');
  const r1 = await tap('car:c1:n');
  check('تپ ▶️ عکسِ همان پیام را عوض می‌کند', r1.last?.m === 'editMessageMedia' && r1.last.fileId === 'FILE_B', JSON.stringify(r1.last || {}).slice(0, 120));
  check('پیام جدیدی ساخته نمی‌شود', !r1.edits.some(e => /^send/.test(e.m)));
  check('همان message_id ویرایش می‌شود', r1.last?.message_id === 77);
  check('کپشن اسلاید دوم و شمارندهٔ فارسی می‌آید', /باغ/.test(r1.last.caption) && /۲ \/ ۴/.test(text(r1.last.caption)), text(r1.last.caption).slice(0, 90));
  check('نقطه‌های مسیر جای درست را نشان می‌دهند', (r1.last.caption.match(/●/g) || []).length === 1 && (r1.last.caption.match(/○/g) || []).length === 3 && /○ ● ○ ○/.test(r1.last.caption));
  check('حالت جدید در state ذخیره می‌شود', stateNow('c1').idx === 1);
  check('دکمهٔ اسلاید فعلی در کیبورد علامت دارد', JSON.stringify(r1.last.markup).includes('● ۲'));
}
{
  /* ۲) پرش با شماره */
  const r2 = await tap('car:c1:3');
  check('پرش با شماره به اسلاید ۴ می‌رود', r2.last.fileId === 'FILE_D' && /۴ \/ ۴/.test(text(r2.last.caption)));
  check('تپ دکمهٔ شماره‌دار توست می‌دهد', /اسلاید ۴ از ۴/.test(r2.answers.map(a => a.text).join(' ')), r2.answers.map(a => a.text).join(' / '));
}
{
  /* ۳) چرخش دورانی */
  const r3 = await tap('car:c1:n');
  check('بعد از اسلاید آخر، دوباره از اول شروع می‌شود', r3.last.fileId === 'FILE_A', r3.last.fileId);
  const r4 = await tap('car:c1:p');
  check('دکمهٔ ◀️ از اول به آخر می‌چرخد', r4.last.fileId === 'FILE_D' && stateNow('c1').idx === 3, r4.last.fileId);
}
{
  /* ۴) نگه‌داشتن و روشن‌کردن پخش خودکار */
  const r5 = await tap('car:c1:pause');
  const st5 = stateNow('c1');
  check('⏸ پخش خودکار را خاموش می‌کند', st5.auto === false);
  check('کپشن دیگر ادعای پخش خودکار نمی‌کند', !/پخش خودکار روشن/.test(text(r5.last.caption)));
  check('دکمه به «پخش خودکار» تغییر می‌کند', JSON.stringify(r5.last.markup).includes('پخش خودکار'));
  const r6 = await tap('car:c1:play');
  check('▶️ پخش خودکار را دوباره روشن می‌کند', stateNow('c1').auto === true && /پخش خودکار روشن/.test(text(r6.last.caption)));
  const r7 = await tap('car:c1:play');
  check('تپ تکراری بی‌خطر است', r7.last?.m === undefined || r7.answers.length > 0, JSON.stringify(r7.answers));
}
{
  /* ۵) مسیرهای خطا */
  const r8 = await tap('car:c1:9');
  check('شمارهٔ نامعتبر رد می‌شود', /نامعتبر/.test(r8.answers.map(a => a.text).join(' ')) && !r8.last, r8.answers.map(a => a.text).join(' / '));
  const r9 = await tap('car:missing:n');
  check('کاروسل ناموجود پیام روشن می‌دهد', /در دسترس نیست/.test(r9.answers.map(a => a.text).join(' ')) && r9.answers.some(a => a.alert));
  const r10 = await tap('car:c1:x', { msgId: 78 });
  check('دکمهٔ شمارنده فقط توست می‌دهد و پیام را دست نمی‌زند', !r10.last && /ورق بزن/.test(r10.answers.map(a => a.text).join(' ')), r10.answers.map(a => a.text).join(' / '));
}
{
  /* ۶) نمایش‌دهندهٔ مشترک: کپشن دقیقاً از روی state ساخته می‌شود */
  const st = stateNow('c1');
  delete st.auto;
  doStore.set('car:c1', JSON.stringify(st));
  const r11 = await tap('car:c1:0');
  check('بدون auto هم رندر درست است', r11.last.fileId === 'FILE_A' && /کاروسل زنده/.test(text(r11.last.caption)), text(r11.last.caption).slice(0, 80));
  check('تعداد اسلایدها در کپشن فارسی است', /۱ \/ ۴/.test(text(r11.last.caption)));
  const bad = await tap('car:c1:n', { msgId: 0 });
  check('تپ بدون message_id امن است', /پیام پیدا نشد/.test(bad.answers.map(a => a.text).join(' ')));
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
