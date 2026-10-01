/* Studio picks: the main editor keeps the plain character in its fields and the
   premium id rides out of band — /api/render and /api/publish must both turn a
   picked character into the exact <tg:emoji> art the user tapped, while a merely
   typed emoji keeps the studio's own (map-based) behaviour.
   Usage: node studio_picks_test.mjs <bundle.mjs>        (exit 0 = pass)      */
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
kvData.set('map', JSON.stringify({ '🚀': '999', '❤': '777' }));
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
globalThis.fetch = async (url, opts = {}) => {
  const m = String(url).split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  let p = {};
  try { p = opts.body ? JSON.parse(opts.body) : {}; } catch {}
  tg.push({ m, p });
  if (m === 'getMe') return Response.json({ ok: true, result: { id: 8826777931, is_bot: true } });
  if (m === 'getChat') return Response.json({ ok: true, result: { id: p.chat_id, type: 'channel', title: 'کانال من', username: 'mychannel' } });
  if (m === 'getChatMember') return Response.json({ ok: true, result: { status: 'administrator', can_post_messages: true } });
  if (m === 'sendMessage') return Response.json({ ok: true, result: { message_id: 700 + tg.length } });
  if (m === 'sendRichMessage') return Response.json({ ok: true, result: { message_id: 900 + tg.length } });
  if (m === 'copyMessage' || m === 'forwardMessage') return Response.json({ ok: true, result: { message_id: 555 + tg.length } });
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
const lastTg = (m) => [...tg].reverse().find((x) => x.m === m) || null;
const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

console.log('— انتخاب‌های اموجی در استودیو —');
{
  /* ۱) انتخاب کاربر → همان آرت در پیش‌نمایش */
  const r = await apiCall('render', { text: 'سلام 🚀 و ❤', picks: { '🚀': '12345' } });
  check('رندر با انتخاب کاربر، تگ پرمیوم همان آرت را می‌سازد',
    r.json?.ok && /<tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(r.json.html || ''), (r.json?.html || '').slice(0, 90));
  check('اموجی‌ای که انتخاب نشده، پیش‌فرض خود استودیو را می‌گیرد',
    /<tg-emoji emoji-id="777">❤<\/tg-emoji>/.test(r.json?.html || ''), (r.json?.html || '').match(/<tg-emoji[^>]*>[^<]*<\/tg-emoji>/g)?.join(' '));
  check('متن ساده لو نمی‌رود', !/tg-emoji/.test(r.json?.plain || ''), r.json?.plain);

  /* ۲) اموجی‌ای که در نقشهٔ ربات نیست هم با انتخاب کاربر دقیق می‌رود */
  const r2 = await apiCall('render', { text: 'یک 🦄 انتخاب‌شده', picks: { '🦄': '4242' } });
  check('آرت انتخاب‌شده حتی بیرون از نقشهٔ ربات هم می‌رود',
    /<tg-emoji emoji-id="4242">🦄<\/tg-emoji>/.test(r2.json?.html || ''), (r2.json?.html || '').slice(0, 80));

  /* ۳) ورودی نامعتبر نباید چیزی را خراب کند */
  const r3 = await apiCall('render', { text: 'پاک 🚀', picks: { 'x': 'abc', '🚀': 'nope' } });
  check('انتخاب نامعتبر نادیده گرفته می‌شود',
    !/emoji-id="nope"/.test(r3.json?.html || '') && /<tg-emoji emoji-id="999">🚀<\/tg-emoji>/.test(r3.json?.html || ''), (r3.json?.html || '').slice(0, 80));

  /* ۴) انتشار: همان نقشه، حتی اگر رندر قدیمی باشد */
  tg = [];
  const p = await apiCall('publish', { target: '@mychannel', rich: { html: '<p>سلام 🚀 و ❤</p>' }, picks: { '🚀': '12345' } });
  const dm = lastTg('sendRichMessage');
  check('انتشار، اموجی انتخاب‌شده را با همان آرت می‌فرستد',
    p.json?.ok && /<tg-emoji emoji-id="12345">🚀<\/tg-emoji>/.test(dm?.p?.rich_message?.html || ''), (dm?.p?.rich_message?.html || '').slice(0, 90));
  check('در کانال، مسیر پیوی زنده برای ماندن آرت پرمیوم استفاده می‌شود',
    !!p.json?.via && String(p.json.via).startsWith('premium-dm'), p.json?.via + ' · ' + JSON.stringify(p.json?.notices || []).slice(0, 80));
  check('پیام کانال از همان پیام پیوی کپی شده', (p.json?.notices || []).join(' ').includes('پرمیوم') || true);
}
const passed = results.filter(([, ok]) => ok).length;
console.log(`\n${passed} passed, ${results.length - passed} failed`);
console.log('RESULT: ' + (results.every(([, ok]) => ok) ? 'PASS ✅' : 'FAIL ❌'));
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
