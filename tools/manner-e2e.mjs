#!/usr/bin/env node
/* تست b47: «مثل قبل» — پیام‌های معمولی به استودیو می‌روند، AI فقط با /ai
   Usage: node cf/sim/manner_test.mjs [bundle.mjs]                                  */
import path from 'node:path';

const BUNDLE = process.argv[2] || 'cf/sim/bundle_v28.mjs';
const OWNER = 5982315292, OTHER = 111222333, CHAN = '@xjjsjsjsjji';
let results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const kv = new Map([['cmd:chan:shared', JSON.stringify(CHAN)]]);
const makeKV = () => ({
  async get(k, o) { const v = kv.get(k); if (v === undefined) return null; if (o && o.type === 'json') { try { return JSON.parse(v); } catch { return null; } } return v; },
  async put(k, v) { kv.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kv.delete(k); },
  async list() { return { keys: [] }; }
});
const sent = [];
let mid = 900, brainCalls = 0, brainMode = 'ok';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/')) {
    const method = u.split('/').pop();
    let body = {};
    try { body = typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch { }
    mid += 1;
    sent.push({ method, chat: body.chat_id, json: JSON.stringify(body) });
    let result = { message_id: mid };
    if (method === 'getChat') result = { id: -100, title: 'ch', username: CHAN.replace('@', ''), type: 'channel' };
    if (method === 'getChatMember') result = { status: 'creator' };
    if (method === 'getChatMemberCount') result = 7;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://call1.tgju.org/')) return new Response(JSON.stringify({ current: { price_dollar_rl: { p: '2,547,000', t: '11:57:19' }, geram18: { p: '254,940,000', t: '11:57:19' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('rasa-aitest') || u.includes('/brain')) {
    brainCalls += 1;
    if (brainMode === 'quota') return new Response(JSON.stringify({ ok: false, text: '4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare Workers Paid plan if you would like to continue usage.' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: true, text: 'باشه، انجام شد.' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, opts);
};
const env = {
  BOT_TOKEN: '1:T', KV: makeKV(), KV_FRESH: makeKV(), RASA_KV: makeKV(), STORE: makeKV(),
  CMD_CHANNEL: CHAN, COMMANDER_ON: '1', COMMANDER_OWNERS: String(OWNER),
  CMDR_BRAIN_URL: 'https://rasa-aitest.4lisarani-1.workers.dev', CMDR_BRAIN_KEY: 'k'
};
const { default: worker } = await import(path.resolve(BUNDLE));
let seq = 7000;
const send = async (from, text) => {
  const upd = { update_id: (seq += 1), message: { message_id: seq, date: Math.floor(Date.now() / 1000), chat: { id: from, type: 'private' }, from: { id: from, first_name: 'U' }, text } };
  const pend = [];
  await worker.fetch(new Request('https://x/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'sek' }, body: JSON.stringify(upd) }), env, { waitUntil: (p) => pend.push(p) });
  await Promise.all(pend.map((p) => Promise.resolve(p).catch(() => { })));
  return sent.splice(0);
};
const allText = (m) => m.map((x) => x.json).join(' | ');

console.log('\n🛠 تست «مثل قبل» (b47)\n');

/* ۱) متن ساده → پیش‌نویس استودیو، نه AI */
let b0 = brainCalls;
let m = await send(OWNER, 'سلام');
check('متنی ساده → پیش‌نویس استودیو (نه AI)', m.length > 0 && allText(m).includes('سلام') && brainCalls === b0, `پیام‌ها=${m.length}، مغز=${brainCalls - b0}`);
const postKey = [...kv.keys()].find((k) => k.startsWith('post:'));
check('پیش‌نویس در حافظه ثبت شد (post:…)', !!postKey, postKey || '—');
const draft = m[0] && m[0].json || '';
check('پیش‌نویس دکمه‌های ویرایش/انتشار دارد', /st:|publish|انتشار/.test(draft));

/* ۲) «قیمت دلار» معمولی هم پیش‌نویس می‌شود (نه جواب قیمت) */
b0 = brainCalls;
m = await send(OWNER, 'قیمت دلار');
check('«قیمت دلار» معمولی → پیش‌نویس، نه پاسخ قیمت', !/2,547,000/.test(allText(m)) && brainCalls === b0);

/* ۳) با /ai → میان‌بُر قیمت، بدون مصرف سهمیه */
b0 = brainCalls;
m = await send(OWNER, '/ai قیمت دلار');
check('/ai قیمت دلار → پاسخ قیمت بدون AI', /2,547,000/.test(allText(m)) && brainCalls === b0, `مغز=${brainCalls - b0}`);

/* ۴) /ai تنها → راهنما */
m = await send(OWNER, '/ai');
check('/ai تنها → راهنما می‌دهد', /بعد از \/ai/.test(allText(m)));

/* ۵) /ai + درخواست واقعی با سهمیهٔ تمام → پیام فارسی انسانی + منو */
brainMode = 'quota';
b0 = brainCalls;
m = await send(OWNER, '/ai یک پست بلند دربارهٔ پاییز بنویس و منتشر کن');
const raw5 = allText(m);
check('/ai با سهمیهٔ تمام → پیام فارسی (نه متن خام)', /سهمیهٔ امروزِ هوش مصنوعی/.test(raw5) && !/4006/.test(raw5), (raw5.match(/[^"]*سهمیه[^"]*/) || [''])[0].slice(0, 60));
check('/ai با سهمیهٔ تمام → منوی دکمه‌ها می‌آید', /inline_keyboard/.test(raw5) && /web_app/.test(raw5));
brainMode = 'ok';

/* ۶) /post مال استودیو است (نه انتشار مستقیم) */
m = await send(OWNER, '/post');
check('/post → پست‌ساز استودیو (نه انتشار مستقیم)', !/منتشر شد/.test(allText(m)) && m.length > 0);

/* ۷) حالت در انتظار ورودی (st:) → استودیو مصرف می‌کند */
if (postKey) {
  const pid = postKey.slice('post:'.length);
  kv.set(`st:${OWNER}`, JSON.stringify({ action: 'edit_text', pid }));
  b0 = brainCalls;
  m = await send(OWNER, 'متن ویرایش‌شدهٔ من');
  check('در حالت ویرایش، متن به استودیو می‌رود (نه AI)', /متن ویرایش‌شدهٔ من/.test(allText(m)) && brainCalls === b0);
  check('حالت موقت پاک شد', !kv.has(`st:${OWNER}`));
}

/* ۸) کاربر غیرمالک → استودیو، نه AI */
b0 = brainCalls;
m = await send(OTHER, 'سلام به همه');
check('کاربر عادی → استودیو (AI برای مالک است)', m.length > 0 && brainCalls === b0);

/* ۹) هیچ‌جا خطای خام انگلیسی نمی‌رود */
check('هیچ پیامی خطای خام «⚠️ خطا» ندارد', !/⚠️ خطا:/.test(allText(sent)));

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
