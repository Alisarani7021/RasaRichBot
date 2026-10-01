/* امضا و اعتبار: انتشار با «بدون امضای رِسا» باید واقعاً امضا را بردارد و یک اعتبار
   کم کند؛ بدون خواستِ کاربر امضا بماند و شمارشِ «۵ پست با امضا = ۱ اعتبار» کار کند.
   (باگ قبلی: استور در publishNow تعریف نشده بود و همهٔ این منطق بی‌صدا دور می‌خورد.)
   Usage: node signature_credits_test.mjs <bundle.mjs>     (exit 0 = pass)        */
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
kvData.set('map', JSON.stringify({ '🚀': '999' }));
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

/* ── fake telegram: کانال است، پس مسیر پرمیوم از پیوی کپی می‌شود ─────────── */
let tg = [];
globalThis.fetch = async (url, opts = {}) => {
  const m = String(url).split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  let p = {};
  try { p = opts.body ? JSON.parse(opts.body) : {}; } catch {}
  tg.push({ m, p });
  if (m === 'getMe') return Response.json({ ok: true, result: { id: 8826777931, is_bot: true } });
  if (m === 'getChat') return Response.json({ ok: true, result: { id: p.chat_id, type: 'channel', title: 'کانال من', username: 'mychannel' } });
  if (m === 'getChatMember') return Response.json({ ok: true, result: { status: 'administrator', can_post_messages: true } });
  if (m === 'sendRichMessage') return Response.json({ ok: true, result: { message_id: 900 + tg.length } });
  if (m === 'copyMessage' || m === 'forwardMessage') return Response.json({ ok: true, result: { message_id: 555 + tg.length } });
  if (m === 'deleteMessage') return Response.json({ ok: true, result: true });
  return Response.json({ ok: true, result: true });
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

function sessionToken(uid = UID) {
  const body = JSON.stringify({ uid, name: 'Test', user: 'tester', exp: Date.now() + 3600 * 1000 });
  const payload = Buffer.from(body.toString(), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', Buffer.from(BOT + '::rasa-app', 'utf8')).update(payload).digest('hex').slice(0, 32);
  return payload + '.' + sig;
}
const apiCall = async (route, body) => {
  const res = await worker.fetch(new Request(`${ORIGIN}/api/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-rasa-token': sessionToken() },
    body: JSON.stringify(body || {})
  }), env, {});
  let j = null;
  try { j = await res.clone().json(); } catch {}
  return { status: res.status, json: j };
};
const publishedHtml = () => {
  /* هر مسیری که پست را می‌برد: پیوی نسخهٔ اول، یا کپیِ سندِ ساخته‌شده در پیوی */
  const dm = [...tg].reverse().find((c) => c.m === 'sendRichMessage');
  return String(dm?.p?.rich_message?.html || '');
};
const sig = (html) => /RasaRichBot/.test(String(html));
const invite = (uid = UID) => { const raw = rasaData.get(`invites:${uid}`); return raw ? JSON.parse(raw) : null; };
const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

console.log('— امضا و اعتبار —');
{
  /* ۱) با اعتبار + خواستِ صریح: امضا می‌رود و یک اعتبار کم می‌شود */
  rasaData.set(`invites:${UID}`, JSON.stringify({ invited: [], credits: 2, total: 2, used: 0, forwards: [], sigKept: 0 }));
  tg = [];
  const r = await apiCall('publish', { target: '@mychannel', rich: { html: '<p>سلام دنیا 🚀</p>' }, unsigned: true });
  check('انتشار انجام می‌شود', r.json?.ok === true, JSON.stringify(r.json).slice(0, 90));
  check('با «بدون امضا» امضای رِسا نمی‌آید', !sig(publishedHtml()), publishedHtml().slice(-90));
  check('یک اعتبار کم می‌شود (۲ ← ۱)', invite()?.credits === 1, 'credits=' + invite()?.credits);
  check('شمارندهٔ «استفاده‌شده» بالا می‌رود', invite()?.used === 1, 'used=' + invite()?.used);
  check('پیام می‌گوید اعتبار مصرف شد', JSON.stringify(r.json?.notices || []).includes('1'), JSON.stringify(r.json?.notices || []).slice(0, 120));

  /* ۲) بدون خواستِ کاربر: امضا می‌ماند و اعتبار دست نمی‌خورد */
  tg = [];
  const r2 = await apiCall('publish', { target: '@mychannel', rich: { html: '<p>پست عادی</p>' } });
  check('بدون درخواستِ کاربر، امضا سرِ جایش است', sig(publishedHtml()), publishedHtml().slice(-80));
  check('اعتبار فقط برای پست بدون امضا کم می‌شود', invite()?.credits === 1, 'credits=' + invite()?.credits);
  check('پست با امضا شمرده می‌شود', invite()?.sigKept === 1, 'sigKept=' + invite()?.sigKept);

  /* ۳) ادعای «بدون امضا» بدون اعتبار: امضا می‌ماند + توضیح به کاربر */
  rasaData.set(`invites:${UID}`, JSON.stringify({ invited: [], credits: 0, total: 0, used: 0, forwards: [], sigKept: 0 }));
  tg = [];
  const r3 = await apiCall('publish', { target: '@mychannel', rich: { html: '<p>بی‌اعتبار</p>' }, unsigned: true });
  check('بدون اعتبار هم پست منتشر می‌شود (با امضا)', r3.json?.ok === true && sig(publishedHtml()));
  check('کاربر می‌فهمد چرا: پیام «اعتبار نداری» می‌آید', /اعتبار/.test(JSON.stringify(r3.json?.notices || [])), JSON.stringify(r3.json?.notices || []).slice(0, 110));
  check('اعتبار منفی نمی‌شود', invite()?.credits === 0, 'credits=' + invite()?.credits);

  /* ۴) پنج پست با امضا = یک اعتبار هدیه (وقتی شمارنده روی ۴ است) */
  rasaData.set(`invites:${UID}`, JSON.stringify({ invited: [], credits: 0, total: 0, used: 0, forwards: [], sigKept: 4 }));
  tg = [];
  const r4 = await apiCall('publish', { target: '@mychannel', rich: { html: '<p>پنجمین پست</p>' } });
  check('پنجمین پست با امضا یک اعتبار هدیه می‌دهد', (invite()?.credits || 0) === 1 && (invite()?.sigKept || 0) === 5, JSON.stringify({ credits: invite()?.credits, sigKept: invite()?.sigKept }));
  check('هدیه به کاربر اطلاع داده می‌شود', /اعتبار/.test(JSON.stringify(r4.json?.notices || [])), JSON.stringify(r4.json?.notices || []).slice(0, 110));

  /* ۵) پستی که خودش دکمهٔ رِسا دارد، امضا نمی‌خورد و اعتبار هم مصرف نمی‌کند */
  rasaData.set(`invites:${UID}`, JSON.stringify({ invited: [], credits: 3, total: 3, used: 0, forwards: [], sigKept: 0 }));
  tg = [];
  await apiCall('publish', { target: '@mychannel', rich: { html: '<p>با دکمهٔ خودم</p><tg-button-row><tg-button type="url" url="https://t.me/RasaRichBot">رِسا ✨</tg-button></tg-button-row>' }, unsigned: true });
  const cnt = (publishedHtml().match(/RasaRichBot/g) || []).length;
  check('دکمهٔ خودِ کاربر تکرار نمی‌شود', cnt === 1, 'count=' + cnt);
  check('برای چنین پستی اعتبار مصرف نمی‌شود', invite()?.credits === 3, 'credits=' + invite()?.credits);

  /* ۶) رسیدِ انتشار: کاربر باید بفهمد پست با امضا رفت یا بدون امضا و اعتبار مصرف شد یا نه */
  rasaData.set(`invites:${UID}`, JSON.stringify({ invited: [], credits: 2, total: 2, used: 0, forwards: [], sigKept: 0 }));
  tg = [];
  const r6 = await apiCall('publish', { target: '@mychannel', rich: { html: '<p>رسید بدون امضا</p>' }, unsigned: true });
  check('رسید می‌گوید پست بدون امضا رفت', r6.json?.signed === false, 'signed=' + JSON.stringify(r6.json?.signed));
  check('رسید می‌گوید یک اعتبار مصرف شد', r6.json?.charged === true, 'charged=' + JSON.stringify(r6.json?.charged));
  check('رسید باقی‌ماندهٔ اعتبار را می‌گوید', r6.json?.credits === 1, 'credits=' + JSON.stringify(r6.json?.credits));

  rasaData.set(`invites:${UID}`, JSON.stringify({ invited: [], credits: 0, total: 1, used: 1, forwards: [], sigKept: 1 }));
  tg = [];
  const r7 = await apiCall('publish', { target: '@mychannel', rich: { html: '<p>رسید بی‌اعتبار</p>' }, unsigned: true });
  check('بدون اعتبار رسید با امضا گزارش می‌کند', r7.json?.signed === true && r7.json?.charged === false, JSON.stringify({ signed: r7.json?.signed, charged: r7.json?.charged }));
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
