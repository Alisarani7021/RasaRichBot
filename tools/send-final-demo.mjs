/* Final pass on the owner's verdict:
   KEEP  → native slideshow (737), live poll (702), three-state post (732)
   SEND  → the auto-play carousel rebuilt with IN-MESSAGE rich buttons,
           plus a blank live-poll template (classic inline buttons)
   DELETE→ every demo that was rejected, its state, and its scheduled ticks.
   Usage: node send_final.mjs [chat_id]                                        */
import fs from 'node:fs';

const BOT = fs.readFileSync('/home/user/.cf/bot_token', 'utf8').trim();
const CF = fs.readFileSync('/home/user/.cf/token', 'utf8').trim();
const ACCT = 'ab05b8b5f2822a491ec407585327eb8f';
const NS = { MAIN: '8eff5bd6b33a4a79ba3d869ef373065a', FRESH: '32075883d0054d95ad579888f58ff613', RASA: 'f7714cd6f0e74ae0b55d73107fa8d88e' };
const ORIGIN = 'https://rich-post-bot.4lisarani-1.workers.dev';
const CHAT = Number(process.argv[2] || 5982315292);
const TICK_USER = 999004;
const A = (n) => `${ORIGIN}/assets/${n}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const src = fs.readFileSync('/home/user/cf/live/carousel_render.js', 'utf8').replace(/if \(typeof module[\s\S]*$/, '');
fs.writeFileSync('/tmp/car3.mjs', src + '\nexport { carouselRichHtml, carouselCaption, carouselKeyboard };\n');
const car = await import('/tmp/car3.mjs');
const liveSrc = fs.readFileSync('/home/user/cf/live/live_render.js', 'utf8').replace(/if \(typeof module[\s\S]*$/, '');
fs.writeFileSync('/tmp/live3.mjs', liveSrc + '\nexport { renderLivePost, liveKeyboard };\n');
const live = await import('/tmp/live3.mjs');

const api = async (method, payload) => (await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
})).json();
const kvPut = async (ns, key, value) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${CF}` }, body: JSON.stringify(value)
  });
  const j = await r.json();
  if (!j.success) throw new Error('KV ' + key + ' failed');
};
const kvGet = async (ns, key) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${CF}` } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return null; }
};
const kvDel = async (ns, key) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${CF}` } });
  return (await r.json()).success;
};
const kvKeys = async (ns, prefix) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${ns}/keys?prefix=${encodeURIComponent(prefix)}`, { headers: { Authorization: `Bearer ${CF}` } });
  return ((await r.json()).result || []).map((k) => k.name);
};

const log = [];
const del = async (id) => {
  const r = await api('deleteMessage', { chat_id: CHAT, message_id: id });
  log.push(`delete ${id}: ${r.ok ? 'ok' : r.description}`);
  await sleep(350);
};

console.log('══ ۱) حذف دموهای نپسندیده ══');
for (const id of [707, 708, 733, 738, 739, 740, 741, 742, 743, 744]) await del(id);

console.log('══ ۲) پاک‌سازی وضعیت‌ها و کارهای زمان‌بندی ══');
for (const ns of [NS.MAIN, NS.FRESH]) {
  for (const [prefix, keep] of [['comm:', []], ['land:', []], ['landsubs:', []], ['car:', []], ['live:', ['live:dmun7qd7i']]]) {
    for (const key of await kvKeys(ns, prefix)) {
      if (keep.includes(key)) continue;
      await kvDel(ns, key);
    }
  }
}
for (const u of [999001, 999002, 999003]) await kvDel(NS.RASA, `sched:${u}`);
{
  const g = (await kvGet(NS.RASA, 'sched_global')) || { ids: [] };
  const cleaned = (g.ids || []).filter((j) => ![999001, 999002, 999003].includes(Number(j.uid)));
  await kvPut(NS.RASA, 'sched_global', { ids: cleaned });
  log.push(`sched_global cleaned: ${(g.ids || []).length} → ${cleaned.length}`);
}

console.log('══ ۳) کاروسل با دکمه‌های داخل پیام ══');
{
  const id = 'r' + Date.now().toString(36);
  const state = {
    id, rich: true, auto: true, idx: 0, createdAt: Date.now(), updatedAt: Date.now(),
    slides: [
      { img: A('cars/s1.jpg'), title: '🏔 دماوند، بام ایران', caption: 'دکمه‌های ◀️ و ▶️ داخل خودِ همین پیام‌اند — نه زیر پیام. یک بار بزن؛ عکس همین پیام عوض می‌شود.' },
      { img: A('cars/s2.jpg'), title: '🌿 باغ ایرانی؛ هندسهٔ آب', caption: 'هیچ پیام جدیدی ساخته نمی‌شود؛ فقط همین قاب.' },
      { img: A('cars/s3.jpg'), title: '🏜 یزد؛ شهر بادگیرها', caption: 'با دکمه‌های شماره‌دار، مستقیم به هر اسلاید بپر.' },
      { img: A('cars/s4.jpg'), title: '🌫 جادهٔ جنگلی شمال', caption: 'پخش خودکار روشن است؛ هر دقیقه خودش یک اسلاید جلو می‌رود.' }
    ]
  };
  for (const ns of [NS.MAIN, NS.FRESH]) await kvPut(ns, `car:${id}`, state);
  const res = await api('sendRichMessage', {
    chat_id: CHAT,
    rich_message: { html: car.carouselRichHtml(state) }
  });
  if (!res.ok) {
    console.error('✖ rich carousel rejected:', res.description);
    log.push('rich carousel: REJECTED — ' + res.description);
  } else {
    const msgId = res.result.message_id;
    log.push(`rich carousel sent: msg ${msgId} (id ${id})`);
    const jobs = [];
    for (let i = 1; i <= 6; i++) jobs.push({
      id: `radv${id}_${i}`, kind: 'live_tick', advance: true, liveId: id, target: CHAT, messageId: msgId,
      scheduledAt: Date.now() + i * 60000 + 15000, status: 'pending', createdAt: Date.now()
    });
    const cur = (await kvGet(NS.RASA, `sched:${TICK_USER}`)) || { jobs: [] };
    cur.jobs = [...jobs];
    await kvPut(NS.RASA, `sched:${TICK_USER}`, cur);
    const g = (await kvGet(NS.RASA, 'sched_global')) || { ids: [] };
    await kvPut(NS.RASA, 'sched_global', { ids: [...jobs.map((j) => ({ id: j.id, uid: TICK_USER, at: j.scheduledAt })), ...(g.ids || [])].slice(0, 500) });
  }
}

console.log('══ ۴) قالب خالی نظرسنجی زنده (دکمه اینلاین) ══');
{
  const id = 'b' + Date.now().toString(36);
  const state = {
    id,
    title: '🗳 نظرسنجی زنده — قالب خالی',
    subtitle: 'این قالب برای تو آماده است: هر وقت گفتی، سؤال و گزینه‌های خودت را جایش می‌گذارم. برای امتحان همین حالا یکی را بزن — نمودار همین پیام بالا می‌رود و رأیت را هم می‌توانی عوض کنی.',
    options: [
      { key: 'o1', label: 'گزینهٔ ۱' },
      { key: 'o2', label: 'گزینهٔ ۲' },
      { key: 'o3', label: 'گزینهٔ ۳' }
    ],
    votes: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  for (const ns of [NS.MAIN, NS.FRESH]) await kvPut(ns, `live:${id}`, state);
  const res = await api('sendRichMessage', {
    chat_id: CHAT,
    rich_message: { html: live.renderLivePost(state) },
    reply_markup: live.liveKeyboard(state)
  });
  log.push(res.ok
    ? `blank poll sent: msg ${res.result.message_id} (id ${id}) · دکمه‌ها: inline`
    : 'blank poll REJECTED — ' + res.description);
}

console.log('\n══ گزارش ══');
for (const l of log) console.log('  ' + l);
