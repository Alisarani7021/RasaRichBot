#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   رِسا MCP Server — رِسا را به‌عنوان «ابزار» به کلاینت‌های هوش مصنوعی می‌دهد.
   پشتیبانی‌شده: Gemini CLI · Claude Code · Claude Desktop · Cursor · VS Code …
   پروتکل: MCP (JSON-RPC روی stdio) — بدون نصب هیچ پکیجی.

   نصب روی سیستم خودت:
     export RASA_BOT_TOKEN=...        # توکن ربات (اختیاری اگر فایل محلی باشد)
     export RASA_UID=5982315292       # آی‌دی عددی خودت در تلگرام
     gemini mcp add rasa node /path/to/rasa-mcp.mjs

   حالت خط فرمان (برای تست سریع):
     node rasa-mcp.mjs cli stats @mychannel
     node rasa-mcp.mjs cli occasions
     node rasa-mcp.mjs cli post --channel @mychannel --text "سلام"
                                                                              */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ORIGIN = process.env.RASA_ORIGIN || 'https://rich-post-bot.4lisarani-1.workers.dev';
export const readToken = () => {
  if (process.env.RASA_BOT_TOKEN) return process.env.RASA_BOT_TOKEN.trim();
  for (const p of ['/home/user/.cf/bot_token', path.join(os.homedir(), '.rasa/bot_token')]) {
    try { return fs.readFileSync(p, 'utf8').trim(); } catch {}
  }
  throw new Error('توکن ربات پیدا نشد. RASA_BOT_TOKEN را ست کن یا در ~/.rasa/bot_token بگذار.');
};
const UID = Number(process.env.RASA_UID || 5982315292);

/* ── نشست مینی‌اپ (HMAC) — همان احراز هویتی که خودِ اپ استفاده می‌کند ──────── */
let session = { token: '', at: 0 };
export async function getSession() {
  if (session.token && Date.now() - session.at < 6 * 3600e3) return session.token;
  const bot = readToken();
  const p = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AA' + Math.random().toString(36).slice(2), user: JSON.stringify({ id: UID, first_name: 'Rasa' }) };
  const dcs = Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(bot).digest();
  p.hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  const res = await fetch(`${ORIGIN}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: new URLSearchParams(p).toString() }) });
  const j = await res.json();
  if (!j.token) throw new Error('ورود ناموفق: ' + JSON.stringify(j).slice(0, 160));
  session = { token: j.token, at: Date.now() };
  return session.token;
}
export async function api(path, body = {}) {
  const token = await getSession();
  const res = await fetch(ORIGIN + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rasa-token': token }, body: JSON.stringify(body) });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { ok: false, error: 'bad json', raw: txt.slice(0, 200) }; }
}

/* ── تقویم شمسی و مناسبت (همان منطق ورکر، نسخهٔ محلی) ────────────────────── */
const FA_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const FA_DAYS = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
const div = (a,b) => ~~(a/b), mod = (a,b) => a - ~~(a/b)*b;
const BREAKS = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
function jalCal(jy, withoutLeap) {
  let bl = BREAKS.length, gy = jy + 621, leapJ = -14, jp = BREAKS[0], jm, jump, leap, leapG, march, n, i;
  for (i = 1; i < bl; i += 1) { jm = BREAKS[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump,33)*8 + div(mod(jump,33),4); jp = jm; }
  n = i - 1;
  leapJ += div(jy - jp, 33)*8 + div(mod(jy - jp, 33) + 3, 4);
  if (mod(jump,33) === 4 && jump - n === 4) leapJ += 1;
  leapG = div(gy,4) - div((div(gy,100)+1)*3,4) - 150;
  march = 20 + leapJ - leapG;
  if (!withoutLeap) { if (jump - n < 6) n = n - jump + div(jump + 4, 33)*33; leap = mod(mod(n+1,33)-1,4); if (leap === -1) leap = 4; }
  return { leap, gy, march };
}
const g2d = (gy,gm,gd) => { let d = div((gy + div(gm-8,6) + 100100)*1461,4) + div(153*mod(gm+9,12)+2,5) + gd - 34840408; return d - div(div(gy + 100100 - div(gm-8,6),100)*3,4) + 752; };
const d2g = (jdn) => { let j = 4*jdn + 139361631; j += div(div(4*jdn + 183187720, 146097)*3,4)*4 - 3908; const i = div(mod(j,1461),4)*5 + 308; const gd = div(mod(i,153),5)+1, gm = mod(div(i,153),12)+1, gy = div(j,1461) - 100100 + div(8-gm,6); return { gy, gm, gd }; };
export function toJalali(d) {
  const jdn = g2d(d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate());
  let gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy, false), k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) { if (k <= 185) return { jy, jm: 1 + div(k,31), jd: mod(k,31)+1 }; k -= 186; } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  return { jy, jm: 7 + div(k,30), jd: mod(k,30)+1 };
}
const fa = (x) => String(x).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const tehran = (ts = Date.now()) => new Date(ts + 126e5);
export function faToday(ts = Date.now()) {
  const d = tehran(ts), j = toJalali(d);
  return `${FA_DAYS[d.getUTCDay()]} ${fa(j.jd)} ${FA_MONTHS[j.jm-1]} ${fa(j.jy)}`;
}
export async function occasions(ts = Date.now()) {
  const j = toJalali(tehran(ts));
  const url = `https://holidayapi.ir/jalali/${j.jy}/${String(j.jm).padStart(2,'0')}/${String(j.jd).padStart(2,'0')}`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'RasaMCP/1.0' } });
    const raw = await r.json();
    const skip = /^(جمعه|پنجشنبه|چهارشنبه|سه‌شنبه|دوشنبه|یکشنبه|شنبه|تعطیل)$/;
    const keep = /(عید|شهادت|ولادت|رحلت|مبعث|میلاد|تاسوعا|عاشورا|اربعین|غدیر|رمضان|محرم|قربان|فطر|نوروز|مهرگان|یلدا|جشن|بزرگداشت|روز جهانی|روز ملی|روز ارتش|روز پزشک|انقلاب|دفاع مقدس)/;
    const drop = /(درگذشت|زادروز|پیروزی|نبرد|تأسیس|تاسیس|اعدام|اعلام|امضای|انتخاب|کشف|افتتاح|اشغال|انقراض|جمهوری خلق)/;
    const events = (raw.events || []).map((e) => String(e.description || '').trim())
      .filter((d) => d && !skip.test(d) && (keep.test(d) || e_isReligious(raw, d)) && !drop.test(d));
    return { date: faToday(ts), jalali: j, holiday: !!raw.is_holiday, events: events.slice(0, 6), all: (raw.events || []).length };
  } catch (e) { return { date: faToday(ts), jalali: j, holiday: null, events: [], error: String(e.message || e) }; }
}
function e_isReligious(raw, d) { return (raw.events || []).some((e) => String(e.description || '').trim() === d && e.is_religious); }

/* ── آمار واقعی کانال (t.me/s + شمارش اعضا) — بدون نیاز به دیپلوی ───────── */
const parseViews = (t) => { const m = /^([\d.,]+)\s*([KMkm])?$/.exec(String(t||'').replace(/[\u200e\u200f]/g,'').trim()); if (!m) return 0; let n = Number(m[1].replace(/,/g,'')); if (m[2]) n *= (m[2].toLowerCase()==='k'?1e3:1e6); return Math.round(n); };
export async function stats(channel) {
  const uname = String(channel || '').replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  if (!/^[A-Za-z0-9_]{4,}$/.test(uname)) return { ok: false, error: 'کانال عمومی لازم است (مثل @mychannel)' };
  const posts = [];
  let before = null;
  for (let page = 0; page < 3; page += 1) {
    const r = await fetch(`https://t.me/s/${uname}${before ? `?before=${before}` : ''}`, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!r.ok) break;
    const html = await r.text();
    const blocks = html.split('<div class="tgme_widget_message ').slice(1);
    if (!blocks.length) break;
    for (const b of blocks) {
      const mid = /data-post="[^"/]+\/(\d+)"/.exec(b), tm = /datetime="([^"]+)"/.exec(b), vw = /tgme_widget_message_views">([^<]+)</.exec(b);
      if (!mid || !tm) continue;
      const iT = b.indexOf('tgme_widget_message_text');
      let snip = '';
      if (iT > -1) { const end = b.indexOf('tgme_widget_message_footer', iT); snip = b.slice(iT, end > iT ? end : iT + 1200).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
      posts.push({ id: +mid[1], at: Date.parse(tm[1]) || 0, views: vw ? parseViews(vw[1]) : 0, snippet: snip.slice(0, 120) });
    }
    const b4 = /data-post="[^"/]+\/(\d+)"/.exec(blocks[0]);
    before = b4 ? b4[1] : null;
    if (posts.length >= 40 || !before) break;
  }
  const uniq = [...new Map(posts.map((p) => [p.id, p])).values()].sort((a, b) => b.id - a.id);
  const dayOf = (at) => { const d = tehran(at); return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`; };
  const today = dayOf(Date.now());
  const y = dayOf(Date.now() - 864e5), yy = dayOf(Date.now() - 2*864e5);
  const grp = (key) => uniq.filter((p) => dayOf(p.at) === key);
  const yP = grp(y).sort((a, b) => b.views - a.views), yyP = grp(yy);
  const sum = (a) => a.reduce((n, p) => n + p.views, 0);
  let members = null;
  try {
    const s = await (await fetch(`${ORIGIN}/api/channel/check`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rasa-token': await getSession() }, body: JSON.stringify({ target: '@' + uname }) })).json();
    if (s && s.ok) members = null; // دسترسی به شمارش اعضا از خود تلگرام لازم است
  } catch {}
  return {
    ok: true, channel: '@' + uname, date: faToday(),
    yesterday: { posts: yP.length, views: sum(yP) },
    before: { posts: yyP.length, views: sum(yyP) },
    top: yP.slice(0, 5).map((p) => ({ id: p.id, views: p.views, text: p.snippet })),
    lastPosts: uniq.slice(0, 5).map((p) => ({ id: p.id, at: new Date(p.at).toISOString().slice(0, 16).replace('T', ' '), views: p.views, text: p.snippet })),
    scanned: uniq.length
  };
}

/* ── پیش‌نمایش/انتشار پست‌های روزانه (موتور همان ورکر، نسخهٔ محلی) ────────── */
async function dailyModule() {
  const snip = fs.readFileSync('/home/user/cf/patch/snippets/daily_posts.js', 'utf8');
  const shim = `
const escapeHtml = (v) => String(v == null ? "" : v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const __kv = new Map();
async function getJson(env, key, dflt = null) { return __kv.has(key) ? __kv.get(key) : dflt; }
async function setJson(env, key, value) { __kv.set(key, value); return true; }
class Store { constructor() {} async get(k, d = null) { return __kv.get(k) ?? d; } async put(k, v) { __kv.set(k, v); return v; } }
const rasaEnv = (e) => e; const cfg = () => ({});
const createTelegram = () => ({ call: async () => ({}) });
const sendPostMessage = async () => {}; const publishNow = async () => ({ json: async () => ({}) });
`;
  const tmp = path.join(os.tmpdir(), 'rasa_daily_mcp.mjs');
  fs.writeFileSync(tmp, shim + snip + '\nexport { buildMorning, buildDigest };\n');
  return import(`file://${tmp}?v=${Date.now()}`);
}
const plain = (html) => String(html).replace(/<footer>[\s\S]*?<\/footer>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
export async function dailyText(kind, channel, city = 'تهران') {
  const mod = await dailyModule();
  const env = {}, tg = { call: async (m, p) => {
    const bot = readToken();
    const r = await fetch(`https://api.telegram.org/bot${bot}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
    const j = await r.json(); if (!j.ok) throw new Error(j.description || m); return j.result;
  } };
  const built = kind === 'morning' ? await mod.buildMorning(env, channel, city, tg) : await mod.buildDigest(env, channel, tg);
  return { html: built.html, text: plain(built.html), data: built.data };
}

/* ── ابزارها ─────────────────────────────────────────────────────────────── */
const TOOLS = [
  { name: 'list_channels', description: 'کانال‌های وصل‌شده به رِسا و وضعیت دسترسی ربات را نشان می‌دهد.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => { const r = await api('/api/context', {}); return { channels: r.channels || [], drafts: (r.drafts || []).length, templates: (r.templates || []).length }; } },
  { name: 'get_stats', description: 'آمار واقعی یک کانال عمومی: پست‌های دیروز، بازدیدها، سه پست پربازدید و آخرین پست‌ها.',
    inputSchema: { type: 'object', properties: { channel: { type: 'string', description: 'مثل @mychannel' } }, required: ['channel'], additionalProperties: false },
    run: ({ channel }) => stats(channel) },
  { name: 'get_occasions', description: 'مناسبت‌های رسمی امروز و فردا (تقویم هجری شمسی) به‌همراه تعطیلی.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const t = await occasions();
      const tmr = await occasions(Date.now() + 864e5);
      return { today: { date: t.date, holiday: t.holiday, events: t.events }, tomorrow: { date: tmr.date, holiday: tmr.holiday, events: tmr.events } };
    } },
  { name: 'render_draft', description: 'متن (مارک‌داون یا HTML) را به پیام ریچ تلگرام تبدیل می‌کند و پیش‌نمایش متن می‌دهد — بدون انتشار.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
    run: async ({ text }) => { const r = await api('/api/render', { text }); return { ok: !!r.ok, plain: r.plain || '', html: (r.html || '').slice(0, 4000), premium: !!r.premium }; } },
  { name: 'preview_daily', description: 'پیش‌نمایش پست «صبح کانال» یا «خلاصهٔ روز» برای یک کانال (متن آماده + داده‌ای که استفاده شد).',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['morning', 'digest'] }, channel: { type: 'string' }, city: { type: 'string' } }, required: ['kind', 'channel'], additionalProperties: false },
    run: async ({ kind, channel, city }) => { const d = await dailyText(kind, channel, city || 'تهران'); return { text: d.text, data: { date: d.data.date, occasion: (d.data.occasion?.events || []).map((e) => e.d), stats: d.data.stats ? { posts: d.data.stats.postsY, views: d.data.stats.viewsY } : null } }; } },
  { name: 'publish_post', description: 'پست را در کانال منتشر می‌کند (متن مارک‌داون/HTML یا HTML آماده). unsigned=true یعنی بدون امضای رِسا (۱ اعتبار کم می‌کند).',
    inputSchema: { type: 'object', properties: { channel: { type: 'string' }, text: { type: 'string', description: 'متن پست (مارک‌داون یا HTML ریچ)' }, unsigned: { type: 'boolean', description: 'بدون امضای رِسا؟' } }, required: ['channel', 'text'], additionalProperties: false },
    run: async ({ channel, text, unsigned }) => {
      const r = await api('/api/publish', { target: channel, rich: { html: text }, unsigned: unsigned === true });
      const out = { ok: !!r.ok, link: r.link || null, message_id: r.message_id || null, signed: r.signed, charged: r.charged, credits: r.credits, notices: r.notices || [], error: r.error || null };
      if (!r.ok && r.error === 'permissions') {
        out.hint = 'کاربر RASA_UID باید ادمین کانال باشد (و ربات هم ادمین با مجوز ارسال). وضعیت: ' + JSON.stringify(r.verdict || {});
      }
      return out;
    } },
  { name: 'publish_daily', description: 'همان پست روزانه (صبح کانال یا خلاصهٔ روز) را واقعاً در کانال منتشر می‌کند.',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['morning', 'digest'] }, channel: { type: 'string' }, city: { type: 'string' } }, required: ['kind', 'channel'], additionalProperties: false },
    run: async ({ kind, channel, city }) => {
      const d = await dailyText(kind, channel, city || 'تهران');
      const r = await api('/api/publish', { target: channel, rich: { html: d.html }, unsigned: false });
      return { ok: !!r.ok, link: r.link || null, notices: r.notices || [], error: r.error || null };
    } },
];
const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/* ── MCP روی stdio ───────────────────────────────────────────────────────── */
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const textOf = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
async function handle(req) {
  const { id, method, params } = req;
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'rasa', version: '10.4.0' } } });
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {};
    const tool = byName[name];
    if (!tool) return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: 'ابزار ناشناخته: ' + name }] } });
    try {
      const out = await tool.run(args);
      const isErr = out && out.ok === false;
      return send({ jsonrpc: '2.0', id, result: { isError: !!isErr, content: [{ type: 'text', text: textOf(out) }] } });
    } catch (e) {
      return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: 'خطا: ' + String(e.message || e) }] } });
    }
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'روش پشتیبانی نمی‌شود: ' + method } });
}

/* ── حالت خط فرمان: node rasa-mcp.mjs cli <cmd> [args] ──────────────────── */
if (process.argv[2] === 'cli') {
  const [, , , cmd, ...rest] = process.argv;
  const flag = (n, d) => { const i = rest.indexOf('--' + n); return i > -1 ? rest[i + 1] : d; };
  const pos = rest.filter((x, i) => !x.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
  (async () => {
    if (cmd === 'channels') console.log(textOf(await byName.list_channels.run({})));
    else if (cmd === 'stats') console.log(textOf(await stats(pos[0] || flag('channel'))));
    else if (cmd === 'occasions') console.log(textOf(await byName.get_occasions.run({})));
    else if (cmd === 'daily') console.log((await dailyText(pos[0] || 'morning', flag('channel') || pos[1], flag('city'))).text);
    else if (cmd === 'post') console.log(textOf(await byName.publish_post.run({ channel: flag('channel'), text: flag('text'), unsigned: rest.includes('--unsigned') })));
    else console.log('دستورها: channels | stats @ch | occasions | daily morning|digest --channel @ch | post --channel @ch --text "..." [--unsigned]');
  })().catch((e) => { console.error('خطا:', e.message); process.exit(1); });
} else {
  /* stdio: خطوط JSON-RPC را به ترتیب پردازش می‌کنیم و تا تمام‌شدن کارهای در جریان
     زنده می‌مانیم (کلاینت‌ها ورودی را زود می‌بندند، ولی ابزارها ممکن است درخواست شبکه داشته باشند). */
  let buf = '', pending = 0, ended = false;
  const maybeExit = () => { if (ended && pending === 0) process.exit(0); };
  const queue = [];
  let working = false;
  const pump = async () => {
    if (working) return;
    working = true;
    while (queue.length) {
      const line = queue.shift();
      pending += 1;
      try { await handle(JSON.parse(line)); } catch (e) { /* خطای تجزیه: نادیده */ }
      pending -= 1;
    }
    working = false;
    maybeExit();
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) > -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) queue.push(line);
    }
    pump();
  });
  process.stdin.on('end', () => {
    const rest = buf.trim();
    if (rest) queue.push(rest);
    ended = true;
    pump();
    maybeExit();
  });
}
