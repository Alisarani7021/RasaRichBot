/* Sends the self-completing live post: it starts with one line and the server
   fills in the rest, minute by minute, always inside the same message.
   Usage: node send_coverage_demo.mjs <chat_id> <minutes_between_lines>          */
import fs from 'node:fs';

const BOT = fs.readFileSync('/home/user/.cf/bot_token', 'utf8').trim();
const CF = fs.readFileSync('/home/user/.cf/token', 'utf8').trim();
const ACCT = 'ab05b8b5f2822a491ec407585327eb8f';
const KV_MAIN = '8eff5bd6b33a4a79ba3d869ef373065a';
const KV_FRESH = '32075883d0054d95ad579888f58ff613';
const RASA_KV = 'f7714cd6f0e74ae0b55d73107fa8d88e';
const TICK_USER = 999002;

const src = fs.readFileSync('/home/user/cf/live/live_render.js', 'utf8').replace(/if \(typeof module[\s\S]*$/, '');
fs.writeFileSync('/tmp/live_mod2.mjs', src + '\nexport { renderLivePost, liveKeyboard };\n');
const { renderLivePost, liveKeyboard } = await import('/tmp/live_mod2.mjs');

const chatId = Number(process.argv[2] || 5982315292);
const stepMin = Number(process.argv[3] || 1);

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

const now = Date.now();
const id = 'l' + Date.now().toString(36);
const state = {
  id,
  title: '🛰 پوشش زنده: شب رونمایی',
  subtitle: 'این پست را همین حالا ساختیم؛ از این لحظه خودش کامل میشود — بدون اینکه کسی پیام جدیدی بفرستد.',
  status: '🟢 زنده',
  entries: [{ at: now, text: 'پوشش از همینجا شروع شد؛ درها باز شدند.' }],
  updatedAt: now
};

for (const ns of [KV_MAIN, KV_FRESH]) await kvPut(ns, `live:${id}`, state);

const send = await api('sendRichMessage', { chat_id: chatId, rich_message: { html: renderLivePost(state) }, reply_markup: liveKeyboard(state) });
if (!send.ok) { console.error('send failed:', JSON.stringify(send)); process.exit(1); }
const messageId = send.result.message_id;
console.log('sent:', JSON.stringify({ ok: true, message_id: messageId, live_id: id }));

const LINES = [
  { at: 1, text: 'صف مهمانها تا انتهای خیابان؛ سالن در حال پر شدن است.' },
  { at: 2, text: 'نمایشگرهای صحنه روشن شدند؛ همهچیز آماده است.' },
  { at: 3, text: 'مجری روی صحنه آمد. سالن پر شد.' },
  { at: 4, text: '🎬 پرده کنار رفت — لحظهٔ رونمایی همین حالا.' },
  { at: 5, text: 'تشویق ایستاده؛ اولین پرسشها پرسیده شد.' },
  { at: 6, text: '📸 عکس یادگاری تیم با مهمانها.' },
  { at: 7, text: 'گزارش کامل منتشر شد. ممنون که همراه بودید.', patch: { title: '🎊 شب رونمایی تمام شد', status: '🏁 پایان پوشش — این پست خودش کامل شد' } }
];
const jobs = LINES.map((l, i) => ({
  id: 'cv' + id + '_' + i, kind: 'live_tick', liveId: id, target: chatId, messageId,
  entry: { text: l.text, at: now + l.at * stepMin * 60000 },
  ...l.patch ? { patch: l.patch } : {},
  scheduledAt: now + l.at * stepMin * 60000 + 15000, status: 'pending', createdAt: now
}));
const cur = (await kvGet(RASA_KV, `sched:${TICK_USER}`)) || { jobs: [] };
cur.jobs = [...(cur.jobs || []).filter(j => j.status === 'pending'), ...jobs].slice(-200);
await kvPut(RASA_KV, `sched:${TICK_USER}`, cur);
const g = (await kvGet(RASA_KV, 'sched_global')) || { ids: [] };
const ids = [...jobs.map(j => ({ id: j.id, uid: TICK_USER, at: j.scheduledAt })), ...(g.ids || [])].slice(0, 500);
await kvPut(RASA_KV, 'sched_global', { ids });
console.log('ticks seeded:', jobs.length, 'first at', new Date(jobs[0].scheduledAt).toISOString());
