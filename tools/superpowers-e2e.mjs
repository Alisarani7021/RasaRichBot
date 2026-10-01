#!/usr/bin/env node
/* تست «قدرت‌های نسل بعد» (b43): رسانه، کنترل، ترجمه، بازار، RSS، تکرار، رصد، تأیید، خوش‌آمد
   Usage: node cf/sim/sp_test.mjs [bundle.mjs]                                    */
import path from 'node:path';

const BUNDLE = process.argv[2] || 'cf/sim/bundle_v28.mjs';
const OWNER = 5982315292, CHAN = '@xjjsjsjsjji', SECRET = 'TESTSECRET123456';
const BRAIN = process.env.CMDR_BRAIN_URL || 'https://rasa-aitest.4lisarani-1.workers.dev';
const BRAIN_KEY = process.env.CMDR_BRAIN_KEY || 'rasa-test-9f2K';
let results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

/* ── KV جعلی ── */
const kv = new Map([['cmd:chan:shared', JSON.stringify(CHAN)]]);
const makeKV = () => ({
  async get(k, o) { const v = kv.get(k); if (v === undefined) return null; if (o && o.type === 'json') { try { return JSON.parse(v); } catch { return null; } } return v; },
  async put(k, v) { kv.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kv.delete(k); },
  async list() { return { keys: [] }; }
});
const kvGet = (k) => { const v = kv.get(k); try { return v === undefined ? null : JSON.parse(v); } catch { return v; } };

/* ── تلگرام جعلی ── */
const sent = [];
let mid = 800;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/') && !u.includes('/file/')) {
    const method = u.split('/').pop();
    let body = {};
    try { body = typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch { body = {}; }
    const isMultipart = !!(opts.body && typeof opts.body.append === 'function');
    const rec = { method, chat: body.chat_id, text: body.text, caption: body.caption, hasPhoto: !!body.photo, media: body.media, question: body.question, multipart: isMultipart, markup: body.reply_markup };
    sent.push(rec);
    mid += 1;
    let result = { message_id: mid };
    if (method === 'sendPhoto') result = { message_id: mid, photo: [{ file_id: 'FID_PHOTO' }] };
    if (method === 'sendVoice') result = { message_id: mid, voice: { file_id: 'FID_VOICE' } };
    if (method === 'sendMediaGroup') result = [{ message_id: mid }, { message_id: mid + 1 }];
    if (method === 'sendPoll') result = { message_id: mid };
    if (method === 'getChat') result = { id: -100123, title: 'ch', username: CHAN.replace('@', ''), type: 'channel' };
    if (method === 'getChatMember' || method === 'getChatMemberCount') result = method === 'getChatMember' ? { status: 'creator' } : 123;
    if (method === 'deleteMessage' || method === 'pinChatMessage' || method === 'unpinChatMessage' || method === 'restrictChatMember' || method === 'banChatMember' || method === 'unbanChatMember') result = true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, opts);
};

const env = {
  BOT_TOKEN: '1:T', KV: makeKV(), KV_FRESH: makeKV(), RASA_KV: makeKV(), STORE: makeKV(),
  MCP_SECRET: SECRET, CMD_CHANNEL: CHAN, COMMANDER_ON: '1', COMMANDER_OWNERS: String(OWNER),
  CMDR_BRAIN_URL: BRAIN, CMDR_BRAIN_KEY: BRAIN_KEY
};
const { default: worker } = await import(path.resolve(BUNDLE));

/* ── پیام‌های مالک ── */
let seq = 5000;
async function ownerMsg(extra = {}) {
  const update = { update_id: (seq += 1), message: { message_id: seq, date: Math.floor(Date.now() / 1000), chat: { id: OWNER, type: 'private' }, from: { id: OWNER, first_name: 'Owner' }, ...extra } };
  const pending = [];
  await worker.fetch(new Request('https://x/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'sek' }, body: JSON.stringify(update) }), env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending.map((p) => Promise.resolve(p).catch((e) => console.log('(bg:', String(e.message).slice(0, 100), ')'))));
  return sent.splice(0);
}
const mcp = async (method, params, id = 1) => {
  const res = await worker.fetch(new Request('https://x/api/mcp/' + SECRET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }), env, {});
  return res.json();
};
const callTool = async (name, args) => { const r = await mcp('tools/call', { name, arguments: args }); return JSON.parse(r.result.content[0].text); };
const tick = async () => { const pend = []; await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: (p) => pend.push(p) }); await Promise.all(pend); };

console.log('\n🦾 تست قدرت‌های نسل بعد\n');

/* ۱) گرفتن رسانه از پیوی */
let a = await ownerMsg({ photo: [{ file_id: 'S1' }, { file_id: 'BIG1', width: 1080, height: 1080 }], caption: '' });
check('رسانهٔ پیوی ذخیره شد + تأیید', a.some((x) => x.method === 'sendMessage' && /دریافت شد/.test(x.text || '')), (kvGet('sp:media:5982315292') || {}).items?.length + ' در صف');

/* ۲) انتشار رسانه */
let pm = await callTool('publish_media', { caption: '**کپشن تست**\nخط دوم' });
check('publish_media → sendPhoto به کانال', pm.ok === true && pm.kind === 'photo', JSON.stringify(pm).slice(0, 90));

/* ۳) آلبوم */
await ownerMsg({ photo: [{ file_id: 'P2' }] });
let al = await callTool('album', { caption: 'آلبوم تست' });
/* فقط یک عکس در صف → باید خطا بدهد؛ یکی دیگر بفرست */
await ownerMsg({ photo: [{ file_id: 'P3' }] });
al = await callTool('album', { caption: 'آلبوم تست' });
check('album → sendMediaGroup با ۲ عکس', al.ok === true && al.count >= 2, JSON.stringify(al).slice(0, 90));

/* ۴) حذف و سنجاق */
let dp = await callTool('delete_post', { message_id: 555 });
check('delete_post → deleteMessage', dp.ok === true && dp.deleted === 555);
let pin = await callTool('pin_post', { message_id: 556, silent: true });
check('pin_post → pinChatMessage', pin.ok === true);

/* ۵) مدیریت مزاحم */
let mu = await callTool('mute_user', { user_id: 123456, minutes: 30 });
check('mute_user → restrictChatMember', mu.ok === true && mu.minutes === 30);
let ba = await callTool('ban_user', { user_id: 123456 });
check('ban_user → banChatMember', ba.ok === true && ba.banned === 123456);

/* ۶) ترجمه */
let tr = await callTool('translate', { text: 'hello world', to: 'fa' });
check('translate → ترجمهٔ فارسی', tr.ok === true && /سلام|جهان/.test(tr.text || ''), (tr.text || tr.error || '').slice(0, 40));

/* ۷) قیمت بازار */
let mk = await callTool('market', { asset: 'دلار' });
check('market دلار → قیمت واقعی', mk.ok === true && /\d/.test(mk.value || ''), (mk.text || mk.error || '').slice(0, 40));
let mk2 = await callTool('market', { asset: 'طلا' });
check('market طلا → قیمت واقعی', mk2.ok === true && /\d/.test(mk2.value || ''), (mk2.text || mk2.error || '').slice(0, 40));

/* ۸) عکس با استایل + صدا */
let im = await callTool('make_image', { prompt: 'sunset over Tehran skyline', style: 'neon' });
check('make_image با استایل neon', im.ok === true && im.style === 'neon' && (im.file_id || '').length > 0, 'file_id=' + (im.file_id || '').slice(0, 8));
let vo = await callTool('make_voice', { text: 'Hello from Rasa, your channel assistant.' });
check('make_voice → sendVoice', vo.ok === true && sent.some((x) => x.method === 'sendVoice'));

/* ۹) صف تأیید */
sent.splice(0);
let dr = await callTool('draft_post', { text: '**پیش‌نویس تست**\nمتن پست.', with_image: false });
check('draft_post → پیام + دکمهٔ تأیید', dr.ok === true && sent.some((x) => x.method === 'sendMessage' && /پیش‌نویس/.test(x.text || '')), (dr.draft_id || ''));
const cbRes = await worker.fetch(new Request('https://x/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'sek' }, body: JSON.stringify({ update_id: 9999, callback_query: { id: 'cbx', from: { id: OWNER, first_name: 'O' }, message: { message_id: 900, chat: { id: OWNER, type: 'private' } }, data: 'sp:ok:' + dr.draft_id } }) }), env, { waitUntil: (p) => p });
await new Promise((r) => setTimeout(r, 400));
check('دکمهٔ ✅ → انتشار در کانال', sent.some((x) => x.method === 'sendRichMessage' && String(x.chat).includes('xjjsjsjsjji')));

/* ۱۰) گزارش هفتگی و آرشیو */
let wr = await callTool('weekly_report', {});
check('weekly_report → عدد و ماهیت', wr.ok === true && typeof wr.week_posts === 'number', 'posts=' + wr.week_posts);
let sa = await callTool('search_archive', { query: 'کانال' });
check('search_archive → نتیجه ساختاری', sa.ok === true && typeof sa.found === 'number', 'found=' + sa.found);

/* ۱۱) تکرارشونده */
const now = new Date(Date.now() + 126e5);
const clock = String(now.getUTCHours()).padStart(2, '0') + ':' + String(now.getUTCMinutes()).padStart(2, '0');
const ra = await callTool('recurring_add', { at: clock, text: '⏰ پست تست تکرارشونده', kind: 'text' });
check('recurring_add → ثبت', ra.ok === true && ra.at === clock, ra.id || '');
sent.splice(0);
await tick();
check('cron → پست تکرارشونده منتشر شد', sent.some((x) => x.method === 'sendRichMessage' && String(x.chat).includes('xjjsjsjsjji')));
sent.splice(0);
await tick();
check('cron → تکرار دوباره در همان روز نیست', !sent.some((x) => x.method === 'sendRichMessage'), '');

/* ۱۲) رصد */
const wa = await callTool('watch_add', { url: 'https://call1.tgju.org/ajax.json', kind: 'contains', value: 'price_dollar_rl', note: 'تست رصد' });
check('watch_add → ثبت', wa.ok === true, wa.id || '');
sent.splice(0);
await tick();
check('cron → رصد، پیام اطلاع در پیوی', sent.some((x) => x.method === 'sendMessage' && /پیدا شد/.test(x.text || '')));

/* ۱۳) RSS */
const rr = await callTool('rss_add', { url: 'https://feeds.bbci.co.uk/persian/rss.xml', every_minutes: 10, rewrite: false, max_per_run: 1 });
check('rss_add → ثبت فید', rr.ok === true, rr.id || '');
const resetRss = () => { const b = kvGet('sp:rss:5982315292'); b.items[0].lastRun = 0; kv.set('sp:rss:5982315292', JSON.stringify(b)); };
/* اولین اجرا فقط seen را پر می‌کند */
resetRss();
await tick();
resetRss();
sent.splice(0);
await tick();
check('cron → خبر تازه از فید منتشر شد', sent.some((x) => x.method === 'sendRichMessage' && String(x.chat).includes('xjjsjsjsjji')));
const lb = kvGet('sp:rss:5982315292');
check('RSS لیست سالم است', lb.items[0].seen >= 1, 'seen=' + lb.items[0].seen + ' err=' + (lb.items[0].lastErr || '-'));

/* ۱۴) خوش‌آمد */
const ws = await callTool('welcome_set', { text: 'خوش آمدی {name}! 🌟', chat: CHAN });
check('welcome_set → ثبت', ws.ok === true);
sent.splice(0);
await worker.fetch(new Request('https://x/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'sek' }, body: JSON.stringify({ update_id: 7777, chat_member: { chat: { id: -100123, username: CHAN.replace('@', ''), type: 'channel' }, from: { id: 42 }, date: Date.now(), old_chat_member: { status: 'left', user: { id: 42 } }, new_chat_member: { status: 'member', user: { id: 42, first_name: 'مریم' } } } }) }), env, { waitUntil: (p) => p });
await new Promise((r) => setTimeout(r, 300));
check('ورود عضو → پیام خوش‌آمد با اسم', sent.some((x) => x.method === 'sendMessage' && /مریم/.test(x.text || '')));

/* ۱۵) فهرست ابزارهای MCP */
const tl = await mcp('tools/list', {});
const names = tl.result.tools.map((t) => t.name);
check('MCP → تعداد ابزارها ≥ ۳۵', names.length >= 35, 'count=' + names.length);
for (const must of ['publish_media', 'album', 'market', 'translate', 'rss_add', 'recurring_add', 'watch_add', 'draft_post', 'weekly_report', 'welcome_set']) {
  if (!names.includes(must)) check('MCP شامل ' + must, false);
}
check('MCP → همهٔ ابزارهای کلیدی موجودند', ['publish_media', 'album', 'market', 'translate', 'rss_add', 'recurring_add', 'watch_add', 'draft_post', 'weekly_report', 'welcome_set'].every((n) => names.includes(n)));

/* ۱۶) ابزار ناشناخته دست‌نخورده */
const unk = await mcp('tools/call', { name: 'nope_tool', arguments: {} });
check('ابزار ناشناخته → خطا', unk.error && unk.error.code === -32602);

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
