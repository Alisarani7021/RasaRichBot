/* Sends the live-carousel demo: one photo message whose image swaps in place
   when people tap (or on its own, one slide per tick, while auto-play is on).
   Uses the very same renderer the worker embeds, so the first message and every
   later edit are identical.
   Usage: node send_carousel_demo.mjs <chat_id> <minutes_per_slide> <ticks>     */
import fs from 'node:fs';

const BOT = fs.readFileSync('/home/user/.cf/bot_token', 'utf8').trim();
const CF = fs.readFileSync('/home/user/.cf/token', 'utf8').trim();
const ACCT = 'ab05b8b5f2822a491ec407585327eb8f';
const KV_MAIN = '8eff5bd6b33a4a79ba3d869ef373065a';
const KV_FRESH = '32075883d0054d95ad579888f58ff613';
const RASA_KV = 'f7714cd6f0e74ae0b55d73107fa8d88e';

/* the shared renderer, loaded as a module */
const src = fs.readFileSync('/home/user/cf/live/carousel_render.js', 'utf8').replace(/if \(typeof module[\s\S]*$/, '');
fs.writeFileSync('/tmp/carousel_mod.mjs', src + '\nexport { carouselView, carouselCaption, carouselKeyboard };\n');
const { carouselCaption, carouselKeyboard } = await import('/tmp/carousel_mod.mjs');

const chatId = Number(process.argv[2] || 5982315292);
const perSlide = Number(process.argv[3] || 1);
const ticks = Number(process.argv[4] || 10);
const TICK_USER = 999001;

const SLIDES = [
  { path: '/home/user/carousel/s1.jpg', title: '🏔 دماوند، بام ایران', caption: '۵۶۱۰ متر ارتفاع — این صورتیِ طلوع را سالی چند هفته میشود دید.' },
  { path: '/home/user/carousel/s2.jpg', title: '🌿 باغ ایرانی؛ هندسهٔ آب', caption: 'قنات آب را زیر کویر میبرد و بالا میآورد؛ باغ ایرانی در فهرست یونسکو است.' },
  { path: '/home/user/carousel/s3.jpg', title: '🏜 یزد؛ شهر بادگیرها', caption: 'بادگیرها بدون یک وات برق، هوای خانههای کویری را خنک میکنند.' },
  { path: '/home/user/carousel/s4.jpg', title: '🌫 جادهٔ جنگلی شمال', caption: 'مِه صبحگاهی روی جادهٔ چالوس؛ انگار داری در ابرها راه میروی.' }
];

const api = (method, payload) => fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
}).then(r => r.json());
const kvPut = async (ns, key, value) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${CF}` }, body: JSON.stringify(value)
  });
  const j = await r.json();
  if (!j.success) throw new Error('KV write failed: ' + JSON.stringify(j.errors));
};
const kvGet = async (ns, key) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${CF}` } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return null; }
};

/* 1) upload the four photos once, keep their file_ids, clean the album up */
const form = new FormData();
form.append('chat_id', String(chatId));
form.append('media', JSON.stringify(SLIDES.map((s, i) => ({ type: 'photo', media: `attach://s${i + 1}` }))));
SLIDES.forEach((s, i) => form.append(`s${i + 1}`, new Blob([fs.readFileSync(s.path)], { type: 'image/jpeg' }), `s${i + 1}.jpg`));
const up = await (await fetch(`https://api.telegram.org/bot${BOT}/sendMediaGroup`, { method: 'POST', body: form })).json();
if (!up.ok) { console.error('upload failed:', JSON.stringify(up)); process.exit(1); }
const fileIds = up.result.map(m => (m.photo || []).slice(-1)[0]?.file_id);
for (const m of up.result) await api('deleteMessage', { chat_id: chatId, message_id: m.message_id }).catch(() => {});
console.log('uploaded:', JSON.stringify(fileIds));

/* 2) state → both KV namespaces (the worker reads either one) */
const id = 'c' + Date.now().toString(36);
const state = {
  id,
  slides: SLIDES.map((s, i) => ({ fileId: fileIds[i], title: s.title, caption: s.caption })),
  idx: 0,
  auto: true,
  createdAt: Date.now(),
  updatedAt: Date.now()
};
for (const ns of [KV_MAIN, KV_FRESH]) await kvPut(ns, `car:${id}`, state);

/* 3) the first message: slide 1 + the caption/keyboard the worker will reuse */
const send = await api('sendPhoto', {
  chat_id: chatId,
  photo: fileIds[0],
  caption: carouselCaption(state),
  parse_mode: 'HTML',
  reply_markup: carouselKeyboard(state)
});
if (!send.ok) { console.error('send failed:', JSON.stringify(send)); process.exit(1); }
const messageId = send.result.message_id;
console.log('sent:', JSON.stringify({ ok: true, message_id: messageId, live_id: id }));

/* 4) auto-play: one tick per slide, the cron walks it forward on its own */
const jobs = [];
for (let i = 1; i <= ticks; i++) {
  jobs.push({ id: 'adv' + id + '_' + i, kind: 'live_tick', advance: true, liveId: id, target: chatId, messageId, scheduledAt: Date.now() + i * perSlide * 60000 + 20000, status: 'pending', createdAt: Date.now() });
}
const cur = (await kvGet(RASA_KV, `sched:${TICK_USER}`)) || { jobs: [] };
cur.jobs = [...(cur.jobs || []).filter(j => j.status === 'pending'), ...jobs].slice(-200);
await kvPut(RASA_KV, `sched:${TICK_USER}`, cur);
const g = (await kvGet(RASA_KV, 'sched_global')) || { ids: [] };
const ids = [...jobs.map(j => ({ id: j.id, uid: TICK_USER, at: j.scheduledAt })), ...(g.ids || [])].slice(0, 500);
await kvPut(RASA_KV, 'sched_global', { ids });
console.log('ticks seeded:', jobs.length, 'first at', new Date(jobs[0].scheduledAt).toISOString());
