#!/usr/bin/env node
/* تست دریچهٔ MCP (b42): initialize / tools/list / tools/call / خطاها
   Usage: node cf/sim/mcp_test.mjs [bundle.mjs]                                   */
import path from 'node:path';

const BUNDLE = process.argv[2] || 'cf/sim/bundle_v27.mjs';
const OWNER = 5982315292, CHAN = '@xjjsjsjsjji', SECRET = 'TESTSECRET123456';
let results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

/* KV جعلی */
const kv = new Map([['cmd:chan:shared', JSON.stringify(CHAN)]]);
const makeKV = () => ({
  async get(k, o) { const v = kv.get(k); if (v === undefined) return null; if (o && o.type === 'json') { try { return JSON.parse(v); } catch { return null; } } return v; },
  async put(k, v) { kv.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kv.delete(k); },
  async list() { return { keys: [] }; }
});

/* تلگرام شبیه‌سازی‌شده */
const sent = [];
let mid = 700;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/')) {
    const method = u.split('/').pop();
    let body = {};
    try { body = typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch {}
    mid += 1;
    sent.push({ method, chat: body.chat_id, text: body.text, caption: body.caption, question: body.question });
    let result = { message_id: mid };
    if (method === 'sendPhoto') result = { message_id: mid, photo: [{ file_id: 'FID_MCP' }] };
    if (method === 'deleteMessage') result = true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, opts);
};

const env = {
  BOT_TOKEN: '1:T', KV: makeKV(), KV_FRESH: makeKV(), RASA_KV: makeKV(), STORE: makeKV(),
  MCP_SECRET: SECRET, CMD_CHANNEL: CHAN,
  CMDR_BRAIN_URL: process.env.CMDR_BRAIN_URL || 'https://rasa-aitest.4lisarani-1.workers.dev',
  CMDR_BRAIN_KEY: process.env.CMDR_BRAIN_KEY || 'rasa-test-9f2K'
};
const { default: worker } = await import(path.resolve(BUNDLE));
const call = (pathname, body, method = 'POST') => worker.fetch(
  new Request('https://rich-post-bot.4lisarani-1.workers.dev' + pathname, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
  }), env, {});
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });

console.log('\n🔌 تست دریچهٔ MCP\n');

// ۱) بدون کلید
let a = await j(await call('/api/mcp', rpc('tools/list')));
check('بدون کلید مسیر → 401', a.status === 401);
let b = await j(await call('/api/mcp/WRONGKEY', rpc('tools/list')));
check('کلید غلط → 401', b.status === 401);

// ۲) initialize
let init = await j(await call('/api/mcp/' + SECRET, rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gemini', version: '1' } })));
check('initialize → serverInfo=rasa', init.body && init.body.result && init.body.result.serverInfo && init.body.result.serverInfo.name === 'rasa', JSON.stringify(init.body && init.body.result && init.body.result.protocolVersion));
check('initialize → instructions موجود است', !!(init.body && init.body.result && init.body.result.instructions));

// ۳) notifications/initialized → 202 خالی
const notif = await worker.fetch(new Request('https://x/api/mcp/' + SECRET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }), env, {});
check('notifications/initialized → 202', notif.status === 202);

// ۴) tools/list
let tl = await j(await call('/api/mcp/' + SECRET, rpc('tools/list', {})));
const tools = (tl.body && tl.body.result && tl.body.result.tools) || [];
const CORE9 = ['make_image', 'publish_post', 'get_stats', 'get_occasions', 'web_fetch', 'poll', 'schedule_post', 'delete_last', 'set_channel'];
check('tools/list → ۹ ابزار پایه + قدرت‌ها', tools.length >= 9 && CORE9.every((n) => tools.map((t) => t.name).includes(n)), 'count=' + tools.length);
check('schema ابزارها JSON Schema دارند', tools.every((t) => t.inputSchema && t.inputSchema.type === 'object'));

// ۵) tools/call: get_occasions
let occ = await j(await call('/api/mcp/' + SECRET, rpc('tools/call', { name: 'get_occasions', arguments: {} })));
const occText = occ.body.result.content[0].text;
check('get_occasions → مناسبت امروز', /امروز|مهر/.test(occText), occText.slice(0, 80));

// ۶) tools/call: make_image (از دروازهٔ تستی)
let img = await j(await call('/api/mcp/' + SECRET, rpc('tools/call', { name: 'make_image', arguments: { prompt: 'golden sunset over Tehran skyline' } })));
const imgContent = img.body.result.content;
const imgText = String((imgContent[0] || {}).text || '');
const quota = /سهمیه|neuron|daily free|allocation/i.test(imgText);
if (quota) {
  console.log('  ⚠️  make_image — نادیده گرفته شد: سهمیهٔ روزانهٔ هوش مصنوعی تمام است (نه باگ)');
} else {
  check('make_image → محتوای تصویری', imgContent.some((c) => c.type === 'image' && c.data && c.data.length > 1000), 'parts=' + imgContent.map((c) => c.type).join('+'));
  check('make_image → متن نتیجه file_id دارد', /file_id/.test(imgText));
}

// ۷) tools/call: publish_post با عکس
let pub = await j(await call('/api/mcp/' + SECRET, rpc('tools/call', { name: 'publish_post', arguments: { text: '**تست MCP**\n\nانتشار از طریق جمنای.', with_image: true } })));
const pubText = pub.body.result.content[0].text;
check('publish_post → موفق با لینک', /"ok":true/.test(pubText) && /link/.test(pubText), pubText.slice(0, 100));
const richMsg = sent.filter((s) => s.method === 'sendRichMessage').pop();
check('publish_post → پست ریچ به کانال رفت', !!richMsg && String(richMsg.chat).includes(CHAN.replace('@', '')));
check('اعلان پیوی مالک برای انتشار MCP', sent.some((s) => s.method === 'sendMessage' && s.chat === OWNER && /MCP/.test(s.text || '')));

// ۸) delete_last
let del = await j(await call('/api/mcp/' + SECRET, rpc('tools/call', { name: 'delete_last', arguments: {} })));
check('delete_last → حذف شد', /"ok":true/.test(del.body.result.content[0].text));

// ۹) ابزار ناشناخته
let unk = await j(await call('/api/mcp/' + SECRET, rpc('tools/call', { name: 'hack_the_planet', arguments: {} })));
check('ابزار ناشناخته → خطای -32602', unk.body.error && unk.body.error.code === -32602);

// ۱۰) GET → 405
const g = await worker.fetch(new Request('https://x/api/mcp/' + SECRET, { method: 'GET' }), env, {});
check('GET روی /api/mcp → 405', g.status === 405);

// ۱۱) متد ناشناخته
let m = await j(await call('/api/mcp/' + SECRET, rpc('resources/subscribe', {})));
check('متد ناشناخته → -32601', m.body.error && m.body.error.code === -32601);

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
