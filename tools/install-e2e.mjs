#!/usr/bin/env node
/* تست «نصب اختصاصی» (b45): صفحهٔ /go + /api/selfinstall + مالکیت مستأجر
   Usage: node cf/sim/install_test.mjs [bundle.mjs]                                */
import path from 'node:path';

const BUNDLE = process.argv[2] || 'cf/sim/bundle_v28.mjs';
let results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

/* ── KV جعلی ── */
const kv = new Map();
const makeKV = () => ({
  async get(k, o) { const v = kv.get(k); if (v === undefined) return null; if (o && o.type === 'json') { try { return JSON.parse(v); } catch { return null; } } return v; },
  async put(k, v) { kv.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kv.delete(k); },
  async list() { return { keys: [] }; }
});
const kvGet = (k) => { const v = kv.get(k); try { return v === undefined ? null : JSON.parse(v); } catch { return v; } };

/* ── ثبت درخواست‌ها ── */
const cfCalls = [];
const tgCalls = [];
const sent = [];
let bundleFetched = 0;
let kvValues = {};
let uploadedMeta = null;
let schedulesSet = null;
let webhookSet = null;

const FAKE_BUNDLE = ('/* bundle */\n' + 'var mcpHandle = 1;\n' + 'x'.repeat(2600000));
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  /* کلادفلر */
  if (u.startsWith('https://api.cloudflare.com/client/v4')) {
    const p = u.slice('https://api.cloudflare.com/client/v4'.length);
    cfCalls.push({ method: opts.method || 'GET', path: p });
    const j = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (p === '/user/tokens/verify') return j({ success: true, result: { status: 'active' } });
    if (p.startsWith('/accounts?')) return j({ success: true, result: [{ id: 'acc1234567890abcd', name: 'Test Account' }] });
    if (p === '/accounts/acc1234567890abcd/workers/subdomain') return j({ success: true, result: { subdomain: 'test-sub' } });
    if (p === '/accounts/acc1234567890abcd/storage/kv/namespaces') return j({ success: true, result: { id: 'ns' + (Object.keys(kvValues).length + 1) + Math.random().toString(36).slice(2, 6) } });
    if (p.includes('/storage/kv/namespaces/') && p.includes('/values/')) {
      const key = decodeURIComponent(p.split('/values/')[1]);
      kvValues[key] = typeof opts.body === 'string' ? opts.body : '';
      return j({ success: true, result: null });
    }
    if (p.includes('/workers/scripts/') && p.endsWith('/schedules')) {
      schedulesSet = JSON.parse(opts.body);
      return j({ success: true, result: { schedules: schedulesSet } });
    }
    if (p.includes('/workers/scripts/') && (opts.method || 'GET') === 'PUT') {
      uploadedMeta = JSON.parse(await (opts.body.get('metadata')).text());
      uploadedMeta.__bundleSize = (await opts.body.get('index.js').text()).length;
      return j({ success: true, result: { id: 'script' } });
    }
    if (p.includes('/durable_objects/namespaces')) return j({ success: true, result: [{ id: 'don1', class: 'State', script: 'rasa-mybot' }] });
    return j({ success: false, errors: [{ message: 'unhandled ' + p }] });
  }
  /* گیت‌هاب: فایل ربات */
  if (u.startsWith('https://raw.githubusercontent.com/') || u.startsWith('https://cdn.jsdelivr.net/')) {
    bundleFetched += 1;
    return new Response(FAKE_BUNDLE, { status: 200 });
  }
  /* ورکر مستأجر (آزمون زندهٔ MCP) */
  if (/^https:\/\/[a-z0-9-]+\.test-sub\.workers\.dev\/api\/mcp\//.test(u)) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'rasa', version: '1.0' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  /* تلگرام */
  if (u.startsWith('https://api.telegram.org/')) {
    const method = u.split('/').pop();
    let body = {};
    try { body = typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch { }
    tgCalls.push({ method, body });
    if (method === 'getMe') return new Response(JSON.stringify({ ok: true, result: { id: 777, username: 'my_rasa_bot', first_name: 'Rasa' } }), { status: 200 });
    if (method === 'setWebhook') { webhookSet = body; }
    if (method === 'sendMessage') sent.push({ chat: body.chat_id, text: body.text });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, opts);
};

const env = {
  BOT_TOKEN: '1:T', KV: makeKV(), KV_FRESH: makeKV(), RASA_KV: makeKV(), STORE: makeKV(),
  MCP_SECRET: 'HOSTSECRET', CMD_CHANNEL: '@hostchan', COMMANDER_ON: '1', COMMANDER_OWNERS: '5982315292'
};
const { default: worker } = await import(path.resolve(BUNDLE));
const post = (body) => worker.fetch(new Request('https://host.example/api/selfinstall', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' }, body: JSON.stringify(body) }), env, {});
const jpost = async (b) => (await post(b)).json();

console.log('\n🏗 تست نصب اختصاصی (b45)\n');

/* ۱) صفحهٔ نصب */
const pg = await worker.fetch(new Request('https://host.example/go'), env, {});
const pgt = await pg.text();
check('GET /go → صفحهٔ نصب', pg.status === 200 && pgt.includes('نصب کن'), 'bytes=' + pgt.length);
check('صفحه → دکمهٔ لینک آمادهٔ توکن کلادفلر', pgt.includes('permissionGroupKeys') && pgt.includes('workers_kv_storage'));
check('صفحه → راهنمای هر سه سرویس', pgt.includes('Custom apps for Spark') && pgt.includes('Add custom connector') && pgt.includes('grok.com/connectors'));

/* ۲) اعتبارسنجی ورودی‌ها */
let r1 = await jpost({ consent: 'yes', cf_token: 'short', bot_token: '123:AAAA' });
check('توکن کلادفلر کوتاه → رد', r1.ok === false && /کلادفلر/.test(r1.error));
let r2 = await jpost({ consent: 'yes', cf_token: 'x'.repeat(30), bot_token: 'bad' });
check('توکن ربات بد → رد', r2.ok === false && /ربات/.test(r2.error));
let r3 = await jpost({ cf_token: 'x'.repeat(30), bot_token: '123456:' + 'a'.repeat(35) });
check('بدون تأیید شرایط → رد', r3.ok === false && /تأیید/.test(r3.error));

/* ۳) نصب کامل */
const BOT = '8826777931:' + 'A'.repeat(35);
const res = await jpost({ consent: 'yes', cf_token: 'cf-' + 'x'.repeat(30), bot_token: BOT, channel: 'mychannel', name: 'rasa-mybot' });
check('نصب موفق', res.ok === true, (res.error || '') + ' worker=' + res.name);
check('آدرس MCP ساخته شد', /^https:\/\/rasa-mybot\.test-sub\.workers\.dev\/api\/mcp\/[0-9a-f]{32}$/.test(res.mcp_url || ''), res.mcp_url || '');
check('کانال نرمال‌سازی شد (@mychannel)', res.channel === '@mychannel', res.channel || '');
check('۳ انبار داده ساخته شد', cfCalls.filter((c) => c.path.endsWith('/storage/kv/namespaces') && c.method === 'POST').length === 3);
check('فایل ربات از گیت‌هاب گرفته شد', bundleFetched >= 1);
check('متادیتای آپلود: ۳ KV + STATE + AI', uploadedMeta && uploadedMeta.bindings.filter((b) => b.type === 'kv_namespace').length === 3 && uploadedMeta.bindings.some((b) => b.name === 'STATE' && b.type === 'durable_object_namespace') && uploadedMeta.bindings.some((b) => b.type === 'ai'));
check('متادیتا: توکن‌ها به‌صورت secret', uploadedMeta.bindings.filter((b) => b.type === 'secret_text').map((b) => b.name).sort().join(',') === 'BOT_TOKEN,MCP_SECRET,WEBHOOK_SECRET');
check('متادیتا: TENANT=1 و PUBLIC_BASE', uploadedMeta.bindings.some((b) => b.name === 'TENANT' && b.text === '1') && uploadedMeta.bindings.some((b) => b.name === 'PUBLIC_BASE' && /test-sub/.test(b.text)));
check('مهاجرت Durable Object (SQLite برای پلن رایگان)', !!(uploadedMeta.migrations && uploadedMeta.migrations.new_sqlite_classes && uploadedMeta.migrations.new_sqlite_classes[0] === 'State'));
check('باندل واقعی آپلود شد (>2.5MB)', (uploadedMeta.__bundleSize || 0) > 2500000, (uploadedMeta.__bundleSize || 0) + ' bytes');
check('وب‌هوک روی ورکر مستأجر تنظیم شد', webhookSet && webhookSet.url === 'https://rasa-mybot.test-sub.workers.dev/telegram/webhook' && !!webhookSet.secret_token);
check('دستورات ربات ثبت شد', tgCalls.some((c) => c.method === 'setMyCommands'));
check('آدرس workers.dev خودکار فعال شد', cfCalls.some((c) => c.path.endsWith('/workers/scripts/rasa-mybot/subdomain') && c.method === 'POST'));
check('زمان‌بند هر دقیقه فعال شد', JSON.stringify(schedulesSet) === JSON.stringify([{ cron: '* * * * *' }]));
check('کانال در KV مستأجر نوشته شد', kvValues['cmd:chan:shared'] === JSON.stringify('@mychannel'), kvValues['cmd:chan:shared'] || '-');
check('آزمون زندهٔ MCP ✅ در لاگ', (res.log || []).some((x) => /MCP/.test(x.t) && x.ok));
check('ثبت در دفتر نصب میزبان', (kvGet('installs') || {}).items?.length >= 1, 'bot=' + ((kvGet('installs') || {}).items?.[0] || {}).bot);

/* ۳ب) مستأجر بدون کانال: ابزارهای غیرانتشاری باید کار کنند */
const tenv0 = { BOT_TOKEN: '9:T', KV: makeKV(), KV_FRESH: makeKV(), RASA_KV: makeKV(), MCP_SECRET: 'NOKEY123' };
const mc0 = async (name, args) => {
  const r = await worker.fetch(new Request('https://rasa-mybot.test-sub.workers.dev/api/mcp/NOKEY123', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), tenv0, {});
  return JSON.parse((await r.json()).result.content[0].text);
};
const mk0 = await mc0('market', { asset: 'دلار' });
check('بدون کانال → market کار می‌کند', mk0.ok === true && !!mk0.value, mk0.value || mk0.error || '');
const pub0 = await mc0('publish_post', { text: 'تست' });
check('بدون کانال → ابزار انتشار خطای راهنما می‌دهد', pub0.ok === false && /set_channel|channel/.test(pub0.error), (pub0.error || '').slice(0, 50));

/* ۴) نصب با owner مشخص */
const res2 = await jpost({ consent: 'yes', cf_token: 'cf-' + 'y'.repeat(30), bot_token: BOT, owner_id: 555000111, name: 'rasa-second' });
check('نصب دوم با مالک مشخص', res2.ok === true && kvValues['cmd:owner'] === JSON.stringify({ uid: 555000111, at: JSON.parse(kvValues['cmd:owner']).at, name: '' }), res2.name || '');

/* ۵) محدودیت نرخ */
let last = null;
for (let i = 0; i < 6; i += 1) last = await jpost({ consent: 'yes', cf_token: 'cf-' + 'z'.repeat(30), bot_token: BOT, name: 'rasa-rl-' + i });
check('محدودیت نرخ پس از ۶ نصب در ساعت', last.ok === false && /زیاد/.test(last.error), last.error || '');

/* ── ورکر مستأجر: مالکیت و دستورها ── */
console.log('\n  — ورکر مستأجر (TENANT=1) —');
const tenv = {
  BOT_TOKEN: '9:T', KV: makeKV(), KV_FRESH: makeKV(), RASA_KV: makeKV(), MCP_SECRET: 'TENANTSECRET123',
  TENANT: '1', PUBLIC_BASE: 'https://rasa-mybot.test-sub.workers.dev', COMMANDER_ON: '1', COMMANDER_OWNERS: ''
};
const sendDM = async (uid, text, extra = {}) => {
  const upd = { update_id: Math.floor(Math.random() * 1e6), message: { message_id: Math.floor(Math.random() * 1e4), date: Math.floor(Date.now() / 1000), chat: { id: uid, type: 'private' }, from: { id: uid, first_name: 'User' + uid }, text, ...extra } };
  const pend = [];
  await worker.fetch(new Request('https://rasa-mybot.test-sub.workers.dev/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 's' }, body: JSON.stringify(upd) }), tenv, { waitUntil: (p) => pend.push(p) });
  await Promise.all(pend.map((p) => Promise.resolve(p).catch(() => { })));
  return sent.splice(0);
};
let msgs = await sendDM(424242, '/start');
check('اولین پیام → مالکیت ثبت شد', (kvGet('cmd:owner') || {}).uid === 424242, JSON.stringify(kvGet('cmd:owner')));
check('پیام خوش‌آمد مالک با راهنما', msgs.some((m) => /مالک این ربات شدی/.test(m.text || '')));
msgs = await sendDM(424242, '/mcp');
check('/mcp → لینک اتصال', msgs.some((m) => /TENANTSECRET123/.test(m.text || '')), (msgs[0] && msgs[0].text || '').slice(0, 60));
msgs = await sendDM(424242, '/channel @my_new_chan');
check('/channel → ثبت کانال', msgs.some((m) => /کانال ثبت شد/.test(m.text || '')) && kvGet('cmd:chan:shared') === '@my_new_chan', String(kvGet('cmd:chan:shared')));
msgs = await sendDM(999999, '/mcp');
check('غریبه → نه مالکیت نه لینک', !msgs.some((m) => /TENANTSECRET/.test(m.text || '')));

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
