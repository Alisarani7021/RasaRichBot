#!/usr/bin/env node
/* تست b46: پاسخ‌های آمادهٔ بدون هوش مصنوعی + خطای فارسی انسانی
   Usage: node cf/sim/manner_test.mjs [bundle.mjs]                                  */
import path from 'node:path';

const BUNDLE = process.argv[2] || 'cf/sim/bundle_v28.mjs';
const OWNER = 5982315292, CHAN = '@xjjsjsjsjji';
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
let mid = 900;
let brainMode = 'ok';   // ok | quota
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/')) {
    const method = u.split('/').pop();
    let body = {};
    try { body = typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch { }
    mid += 1;
    sent.push({ method, chat: body.chat_id, text: body.text, markup: body.reply_markup });
    let result = { message_id: mid };
    if (method === 'getChat') result = { id: -100, title: 'ch', username: CHAN.replace('@', ''), type: 'channel' };
    if (method === 'getChatMember') result = { status: 'creator' };
    if (method === 'getChatMemberCount') result = 7;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://call1.tgju.org/')) return new Response(JSON.stringify({ current: { price_dollar_rl: { p: '2,547,000', t: '11:57:19' }, geram18: { p: '254,940,000', t: '11:57:19' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('rasa-aitest') || u.includes('/brain')) {
    if (brainMode === 'quota') return new Response(JSON.stringify({ ok: false, text: '4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare Workers Paid plan if you would like to continue usage.' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: true, text: '{"tool":"get_stats","args":{}}' }), { status: 200, headers: { 'content-type': 'application/json' } });
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
const owner = async (text) => {
  const upd = { update_id: (seq += 1), message: { message_id: seq, date: Math.floor(Date.now() / 1000), chat: { id: OWNER, type: 'private' }, from: { id: OWNER, first_name: 'Owner' }, text } };
  const pend = [];
  await worker.fetch(new Request('https://x/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'sek' }, body: JSON.stringify(upd) }), env, { waitUntil: (p) => pend.push(p) });
  await Promise.all(pend.map((p) => Promise.resolve(p).catch(() => { })));
  return sent.splice(0);
};

console.log('\n🙂 تست رفتار بدون هوش مصنوعی (b46)\n');

let m = await owner('سلام');
check('«سلام» → جواب انسانی + منو، بدون AI', m.some((x) => /سلام! 👋/.test(x.text || '')), (m[0] && (m[0].text || '').slice(0, 40)) || '');
check('«سلام» → منوی دکمه‌دار هم می‌آید', m.some((x) => x.markup), '');

m = await owner('قیمت دلار');
check('«قیمت دلار» → قیمت زندهٔ بدون AI', m.some((x) => /دلار/.test(x.text || '') && /2,547,000/.test(x.text || '')), (m[0] && (m[0].text || '').slice(0, 60)) || '');

m = await owner('قیمت طلا چند است');
check('«قیمت طلا چند است» → قیمت طلا', m.some((x) => /طلای/.test(x.text || '')), (m[0] && (m[0].text || '').slice(0, 50)) || '');

m = await owner('/post این یک پست آزمایشی از مسیر دستی است');
check('/post متن → انتشار مستقیم در کانال', m.some((x) => /منتشر شد/.test(x.text || '')), (m[0] && (m[0].text || '').slice(0, 50)) || '');

/* حالت سهمیه تمام: پیام طولانی که باید به مغز برود */
brainMode = 'quota';
m = await owner('یک پست بلند دربارهٔ پاییز و زیبایی‌هایش برای کانال بنویس و منتشر کن');
const raw = m.map((x) => x.text || '').join(' | ');
check('سهمیه تمام → پیام فارسی انسانی (نه متن خام)', /سهمیهٔ امروزِ هوش مصنوعی/.test(raw) && !/4006/.test(raw), raw.slice(0, 70));
check('سهمیه تمام → راهکارهای بدون AI گفته می‌شود', /قیمت دلار/.test(raw) && /post/.test(raw));
check('سهمیه تمام → منوی دکمه‌ها می‌آید', m.some((x) => x.markup));

/* سلام در حالت سهمیه هم باید کار کند */
m = await owner('سلام');
check('سهمیه تمام → «سلام» هنوز جواب می‌گیرد', m.some((x) => /سلام! 👋/.test(x.text || '')));

/* پیام نامربوط: همان رفتار قبلی (به مغز می‌رود) */
m = await owner('یک پست خبری دربارهٔ هوش مصنوعی بنویس');
check('درخواست واقعی → همچنان به مغز می‌رود و پیام انسانی می‌گیرد', /سهمیه/.test(m.map((x) => x.text || '').join(' ')));

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
