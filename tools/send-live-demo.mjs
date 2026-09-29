/* Creates a live-post state in the worker's KV and sends the interactive post to
   a chat. Uses the very same renderer source the worker embeds, so the first
   message and every later edit are identical. */
import fs from 'node:fs';
import crypto from 'node:crypto';

const BOT = fs.readFileSync('/home/user/.cf/bot_token', 'utf8').trim();
const CF = fs.readFileSync('/home/user/.cf/token', 'utf8').trim();
const ACCT = 'ab05b8b5f2822a491ec407585327eb8f';
const KV_MAIN = '8eff5bd6b33a4a79ba3d869ef373065a';
const KV_FRESH = '32075883d0054d95ad579888f58ff613';

/* load the shared renderer as a module */
const src = fs.readFileSync('/home/user/cf/live/live_render.js', 'utf8').replace(/if \(typeof module[\s\S]*$/, '');
const tmp = '/tmp/live_render_mod.mjs';
fs.writeFileSync(tmp, src + '\nexport { renderLivePost, liveKeyboard };\n');
const { renderLivePost, liveKeyboard } = await import(tmp);

const chatId = Number(process.argv[2] || 5982315292);
const minutes = Number(process.argv[3] || 30);
const id = 'd' + Date.now().toString(36);
const state = {
  id,
  title: '📊 نظرسنجی زندهٔ بازار',
  subtitle: 'یک پست، یک پیام — هر رأی که بزنی، نمودار همین پست برای همه بالا و پایین می‌رود. رأیت را هم می‌توانی عوض کنی.',
  options: [
    { key: 'up', label: '📈 امروز صعودی' },
    { key: 'down', label: '📉 امروز نزولی' },
    { key: 'flat', label: '➡️ بی‌تغییر' }
  ],
  votes: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
  endsAt: Date.now() + minutes * 60 * 1000
};

/* 1) state → KV (the worker reads both namespaces) */
for (const ns of [KV_MAIN, KV_FRESH]) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${ns}/values/${encodeURIComponent('live:' + id)}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${CF}` }, body: JSON.stringify(state)
  });
  const j = await r.json();
  if (!j.success) { console.error('KV write failed:', JSON.stringify(j.errors)); process.exit(1); }
}

/* 2) send the post itself */
const send = await fetch(`https://api.telegram.org/bot${BOT}/sendRichMessage`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: chatId, rich_message: { html: renderLivePost(state) }, reply_markup: liveKeyboard(state) })
});
const out = await send.json();
console.log('sent:', JSON.stringify(out.ok ? { ok: true, message_id: out.result.message_id, live_id: id } : out));
