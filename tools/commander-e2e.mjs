#!/usr/bin/env node
/* تست فرمانده (b41): پیام مالک → مغز → ابزارها → کانال (تلگرام شبیه‌سازی‌شده)
   Usage: node cf/sim/commander_test.mjs [scenario]                                */
import fs from 'node:fs';
import path from 'node:path';

const BUNDLE = process.argv[3] || 'cf/sim/bundle_v26.mjs';
const SCEN = process.argv[2] || 'all';
const BRAIN = process.env.CMDR_BRAIN_URL || 'https://rasa-aitest.4lisarani-1.workers.dev';
const BRAIN_KEY = process.env.CMDR_BRAIN_KEY || 'rasa-test-9f2K';
const OWNER = 5982315292;
const CHANNEL = '@xjjsjsjsjji';

/* ── KV شبیه‌سازی‌شده ─────────────────────────────────────────────────── */
const kvData = new Map();
const makeKV = () => ({
  async get(key, opts) {
    const v = kvData.get(key);
    if (v === undefined) return null;
    if (opts && opts.type === 'json') { try { return JSON.parse(v); } catch { return null; } }
    return v;
  },
  async put(key, value) { kvData.set(key, typeof value === 'string' ? value : JSON.stringify(value)); },
  async delete(key) { kvData.delete(key); },
  async list() { return { keys: [...kvData.keys()].map((name) => ({ name })) }; }
});
kvData.set('cmd:chan:shared', JSON.stringify(CHANNEL));

/* ── رهگیری خروجی‌های تلگرام ───────────────────────────────────────────── */
const sent = [];
let mid = 900;
const realFetch = globalThis.fetch;
const voiceB64 = JSON.parse(fs.readFileSync('cf/sim/assets/voice_test.json', 'utf8')).b64;
const voiceBytes = Buffer.from(voiceB64, 'base64');

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/file/')) {
    return new Response(voiceBytes, { status: 200 });
  }
  if (u.startsWith('https://api.telegram.org/')) {
    const method = u.split('/').pop();
    let body = {};
    try { body = opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch {}
    mid += 1;
    const rec = { method, chat: body.chat_id, text: body.text, caption: body.caption, hasPhoto: !!body.photo, question: body.question };
    sent.push(rec);
    let result = { message_id: mid };
    if (method === 'sendPhoto') result = { message_id: mid, photo: [{ file_id: 'FID1' }, { file_id: 'FID_BIG', file_size: 1000 }] };
    if (method === 'getFile') result = { file_path: 'voice/test.wav' };
    if (method === 'sendPoll') result = { message_id: mid, poll: { id: 'p1' } };
    if (method === 'deleteMessage') result = true;
    if (method === 'getChat') result = { id: -100, title: 'ch', username: CHANNEL.replace('@', ''), type: 'channel' };
    if (method === 'getChatMember') result = { status: 'creator' };
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  // درخواست به مغز تستی و بقیه شبکه: عبور واقعی
  return realFetch(url, opts);
};

/* ── محیط ─────────────────────────────────────────────────────────────── */
const KV = makeKV();
const env = {
  BOT_TOKEN: '123:TEST', ADMIN_KEY: 'k', WEBHOOK_SECRET: 'sek', WEBHOOK_PATH: '/telegram/webhook',
  KV, KV_FRESH: makeKV(), RASA_KV: KV, STORE: KV,
  CMDR_BRAIN_URL: BRAIN, CMDR_BRAIN_KEY: BRAIN_KEY, COMMANDER_OWNERS: String(OWNER)
};
const mod = await import(path.resolve(BUNDLE));
const worker = mod.default;

let uidCounter = 1;
async function sendOwner(text, extra = {}) {
  const update = {
    update_id: 1000 + (uidCounter += 1),
    message: { message_id: uidCounter, date: Math.floor(Date.now() / 1000), chat: { id: OWNER, type: 'private' }, from: { id: OWNER, first_name: 'Owner' }, text, ...extra }
  };
  const req = new Request('https://rich-post-bot.4lisarani-1.workers.dev/telegram/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'sek' }, body: JSON.stringify(update)
  });
  const pending = [];
  const t0 = Date.now();
  await worker.fetch(req, env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending.map((p) => Promise.resolve(p).catch((e) => console.log('   (خطای پس‌زمینه:', String(e.message).slice(0,120), ')'))));
  return Date.now() - t0;
}
function drain() { const s = sent.splice(0); return s; }
const show = (label) => {
  const items = drain();
  for (const it of items) {
    const what = it.method === 'sendRichMessage' || it.method === 'sendMessage' ? (it.text || '').slice(0, 120)
      : it.method === 'sendPhoto' ? '(عکس) ' + (it.caption || '').slice(0, 60)
      : it.method === 'sendPoll' ? 'نظرسنجی: ' + it.question : '';
    console.log('   ⤴️', it.method, '→', it.chat, what ? '| ' + what.replace(/\n/g, ' ⏎ ') : '');
  }
  if (!items.length) console.log('   (هیچ خروجی تلگرامی نبود)');
};

const scenarios = {
  img: async () => { console.log('\n🧪 سناریو ۱ — «یه عکس از غروب تهران بساز و با یه کپشن قشنگ بذار تو کانال»'); const ms = await sendOwner('یه عکس از غروب تهران بساز و با یه کپشن قشنگ بذار تو کانال'); console.log('   ⏱', ms, 'ms'); show(); },
  stats: async () => { console.log('\n🧪 سناریو ۲ — «آمار دیروز کانالم چطور بود؟»'); const ms = await sendOwner('آمار دیروز کانالم چطور بود؟'); console.log('   ⏱', ms, 'ms'); show(); },
  occ: async () => { console.log('\n🧪 سناریو ۳ — «مناسبت فردا چیه؟ اگه خاصه یه پست تبریک بساز»'); const ms = await sendOwner('مناسبت فردا چیه؟ اگه خاصه یه پست تبریک بساز'); console.log('   ⏱', ms, 'ms'); show(); },
  voice: async () => {
    console.log('\n🧪 سناریو ۴ — پیام صوتی مالک');
    const ms = await sendOwner('', { voice: { file_id: 'VOICE1', duration: 6, mime_type: 'audio/ogg' } });
    console.log('   ⏱', ms, 'ms'); show();
  },
  link: async () => { console.log('\n🧪 سناریو ۵ — «این لینک رو بخون و ۳ نکته‌شو بذار تو کانال: https://example.com»'); const ms = await sendOwner('این لینک رو بخون و سه نکتهٔ مهمش رو بذار تو کانال: https://example.com'); console.log('   ⏱', ms, 'ms'); show(); },
  del: async () => { console.log('\n🧪 سناریو ۶ — «آخرین پستت رو پاک کن»'); const ms = await sendOwner('آخرین پستی که گذاشتی رو پاک کن'); console.log('   ⏱', ms, 'ms'); show(); }
};

if (SCEN === 'all') {
  for (const [k, fn] of Object.entries(scenarios)) { try { await fn(); } catch (e) { console.log('   ❌', String(e.message).slice(0, 200)); } }
} else {
  await scenarios[SCEN]();
}
console.log('\n— پایان —');
