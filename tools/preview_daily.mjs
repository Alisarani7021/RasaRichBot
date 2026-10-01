/* پیش‌نمایش پست‌های روزانه در ترمینال — بدون دیپلوی.
   موتور را با شیم‌های محیطی اجرا می‌کند و KV واقعی کلاودفلر را برای کش می‌خواند.
   Usage: node tools/preview_daily.mjs [channel] [extraSampleChannel]                     */
import fs from 'node:fs';

const BOT = fs.readFileSync('/home/user/.cf/bot_token', 'utf8').trim();
const CF = fs.readFileSync('/home/user/.cf/token', 'utf8').trim();
const ACCT = 'ab05b8b5f2822a491ec407585327eb8f', RASA = 'f7714cd6f0e74ae0b55d73107fa8d88e';
const CHAN = process.argv[2] || '@xjjsjsjsjji';
const SAMPLE = process.argv[3] || '';

const kvGet = async (k) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${RASA}/values/${encodeURIComponent(k)}`, { headers: { Authorization: `Bearer ${CF}` } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return null; }
};
const kvPut = async (k, v) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${RASA}/values/${encodeURIComponent(k)}`, { method: 'PUT', headers: { Authorization: `Bearer ${CF}` }, body: JSON.stringify(v) });

const shim = `
const BOT = ${JSON.stringify(BOT)};
const escapeHtml = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function getJson(env, key, dflt = null) { const v = await env.__kvGet(key); return v == null ? dflt : v; }
async function setJson(env, key, value) { await env.__kvPut(key, value); return true; }
class Store { constructor(env) { this.env = env; } async get(k, d = null) { const v = await this.env.__kvGet(k); return v == null ? d : v; } async put(k, v) { return this.env.__kvPut(k, v); } }
const rasaEnv = (env) => env; const cfg = () => ({ token: BOT });
const createTelegram = () => ({ call: async (m, p) => { const r = await fetch("https://api.telegram.org/bot" + BOT + "/" + m, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) }); const j = await r.json(); if (!j.ok) throw new Error(j.description); return j.result; } });
const sendPostMessage = async () => {}; const publishNow = async () => ({ json: async () => ({}) });
`;
const snip = fs.readFileSync('/home/user/cf/patch/snippets/daily_posts.js', 'utf8');
fs.writeFileSync('/tmp/preview_mod.mjs', shim + snip + '\nexport { buildMorning, buildDigest, successMessage, jalaliOf, faDate, faGregorian, tehranDate };\n');
const mod = await import('/tmp/preview_mod.mjs?v=' + Date.now());

const env = { __kvGet: kvGet, __kvPut: kvPut };
const tg = { call: async (m, p) => { const r = await fetch(`https://api.telegram.org/bot${BOT}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) }); const j = await r.json(); if (!j.ok) throw new Error(j.description); return j.result; } };
const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();

if (process.argv[4] === 'msgs') {
  console.log('—— ۹ پیام موفقیت نمونه (چرخش روزانه) ——');
  for (let i = 0; i < 9; i += 1) {
    const d = new Date(Date.now() + i * 864e5 + 126e5);
    const j = mod.jalaliOf(d);
    const s = mod.successMessage(j, null);
    console.log(`\n${mod.faDate(d)}\n  💚 ${s.m}\n  ✅ کار امروز: ${s.a}`);
  }
} else {
  const m = await mod.buildMorning(env, CHAN, 'تهران', tg);
  console.log('──── صبح کانال ────');
  console.log(txt(m.html));
  const d = await mod.buildDigest(env, CHAN, tg);
  console.log('\n──── خلاصهٔ روز ────');
  console.log(txt(d.html));
  if (SAMPLE) {
    const s2 = await mod.buildDigest(env, SAMPLE, tg);
    console.log('\n──── نمونهٔ کانال پرترافیک (' + SAMPLE + ') ────');
    console.log(txt(s2.html).slice(0, 1100));
  }
}
