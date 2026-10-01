#!/usr/bin/env node
/* b48 — «رسا پل است»: نصب اختصاصی بدون ربات تازه
   • موتور نصب قدیمی (b45) را با نسخهٔ جدید عوض می‌کند
   • مسیر /api/bridge  +  سرو فایل ربات روی /bundle.js
   • ورکرهای شخصی: هر تماس تلگرامی از پل رسا رد می‌شود (tgCall + createTelegram + spChannel)
   روی بستهٔ فعلی (b47) اجرا می‌شود — Usage: node patch_b48.mjs <bundle.mjs>          */
import fs from 'node:fs';

const target = process.argv[2] || 'cf/sim/bundle_v28.mjs';
let src = fs.readFileSync(target, 'utf8');
const snip = fs.readFileSync(new URL('./snippets/superpowers3.js', import.meta.url), 'utf8');
const snipManner = fs.readFileSync(new URL('./snippets/superpowers4.js', import.meta.url), 'utf8');

const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('spBridgeHost') === 0, 'already patched (b48)');
must(count("var SP_BUILD = 'b47'") >= 1, 'base باید b47 باشد');
must(count('spCmdFast') >= 2, 'b47 لازم است (manner)');
must(count('\nasync function applyLiveTick(env, job) {') === 1, 'applyLiveTick anchor');

/* ۱) جایگزینی کل موتور نصب */
const startMark = 'b45 — «نصب اختصاصی»';
const i0 = src.indexOf(startMark);
must(i0 > 0, 'engine start');
const start = src.lastIndexOf('/*', i0);
const end = src.indexOf('\nasync function applyLiveTick(env, job) {', i0);
must(start > 0 && end > start, 'engine bounds');
/* موتور b47 (رفتار «مثل قبل») هم در همین بازه بود؛ دوباره اضافه می‌شود */
src = src.slice(0, start) + snip.trimEnd() + '\n\n' + snipManner.trimEnd() + '\n' + src.slice(end);

/* ۲) مسیرها: پل + سرو فایل ربات */
const OLD_DISPATCH = `    if (url.pathname === "/go" || url.pathname === "/install" || url.pathname === "/install/" || url.pathname === "/api/selfinstall" || url.pathname === "/api/selfinstall/") {
      try { const spInst = await spInstallRoute(env, request, url); if (spInst) return spInst; } catch (e) { return new Response("install error: " + String(e && e.message || e), { status: 500 }); }
    }`;
must(count(OLD_DISPATCH) === 1, 'dispatch anchor');
src = src.replace(OLD_DISPATCH, `    if (url.pathname === "/bundle.js") {
      try {
        const spBun = await env.RASA_KV.get("asset:bundle", "text");
        if (!spBun) return new Response("bundle asset missing", { status: 503 });
        return new Response(spBun, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
      } catch (e) { return new Response("bundle error", { status: 500 }); }
    }
    if (url.pathname === "/api/bridge" || url.pathname === "/api/bridge/") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" } });
      try { return await spBridgeHost(env, request); } catch (e) { return new Response("bridge error: " + String(e && e.message || e), { status: 500 }); }
    }
` + OLD_DISPATCH);

/* ۳) پل برای ورکرهای شخصی: tgCall */
const OLD_TGCALL = `async function tgCall(env, method, payload) {
  const token = env.BOT_TOKEN;`;
must(count(OLD_TGCALL) === 1, 'tgCall anchor');
src = src.replace(OLD_TGCALL, `async function tgCall(env, method, payload) {
  if (env && String(env.TENANT || '') === '1' && env.BRIDGE_URL) return await spBridgeCall(env, method, payload);
  const token = env.BOT_TOKEN;`);

/* ۴) پل برای ورکرهای شخصی: createTelegram */
const OLD_TC = `  const doCall = /* @__PURE__ */ __name(async (method, payload = {}) => {
    if (!token) throw new TelegramError(method, "BOT_TOKEN is not configured on the Worker.", 503);`;
must(count(OLD_TC) === 1, 'createTelegram anchor');
src = src.replace(OLD_TC, `  const doCall = /* @__PURE__ */ __name(async (method, payload = {}) => {
    if (env && String(env.TENANT || '') === '1' && env.BRIDGE_URL) {
      const sb = await spBridgeCall(env, method, payload);
      if (!sb || !sb.ok) throw new TelegramError(method, (sb && sb.description) || "bridge error", (sb && sb.error_code) || 400);
      return sb.result;
    }
    if (!token) throw new TelegramError(method, "BOT_TOKEN is not configured on the Worker.", 503);`);

/* ۵) کانال ورکر شخصی: همیشه «خودم» → پل آن را به کانال کاربر در رسا نگاشت می‌کند */
const OLD_GATE = `  var chan = await store.get('cmd:chan:' + MCP_OWNER, null) || await store.get('cmd:chan:shared', null) || String(env.CMD_CHANNEL || '').trim();`;
must(count(OLD_GATE) === 1, 'mcp gate channel anchor');
src = src.replace(OLD_GATE, `  var chan = await spChannel(env, MCP_OWNER);`);

const OLD_CHAN = `async function spChannel(env, uid) {
  var store = new Store(rasaEnv(env), cfg(env));
  return await store.get('cmd:chan:' + uid, null) || await store.get('cmd:chan:shared', null) || String(env.CMD_CHANNEL || '').trim();
}`;
must(count(OLD_CHAN) === 1, 'spChannel anchor');
src = src.replace(OLD_CHAN, `async function spChannel(env, uid) {
  if (String(env.TENANT || '') === '1') return '@__self__';
  var store = new Store(rasaEnv(env), cfg(env));
  return await store.get('cmd:chan:' + uid, null) || await store.get('cmd:chan:shared', null) || String(env.CMD_CHANNEL || '').trim();
}`);

/* ۵.۵) ابزارهای MCP در ورکر شخصی: کانال واقعی را از پل بگیر */
const OLD_MCPCHAN = `  var chan = await spChannel(env, MCP_OWNER);`;
must(count(OLD_MCPCHAN) === 1, 'mcp chan anchor');
src = src.replace(OLD_MCPCHAN, `  var chan = await spChannel(env, MCP_OWNER);
  if (String(env.TENANT || '') === '1' && env.BRIDGE_URL) {
    try {
      const _br = await spBridgeCall(env, 'rasa.channel', {});
      if (_br && _br.ok && _br.result && _br.result.channel) chan = _br.result.channel;
    } catch (e) { }
  }`);

/* ۶) لینک پست در ورکر شخصی: از کانال واقعی استفاده کن (نه @__self__) */
const OLD_LINK = `  const linkFor = /* @__PURE__ */ __name((mid) => typeof target.chat === "string" ? \`https://t.me/\${target.chat.replace(/^@/, "")}/\${mid || ""}\` : null, "linkFor");`;
must(count(OLD_LINK) === 1, 'linkFor anchor');
src = src.replace(OLD_LINK, `  const linkFor = /* @__PURE__ */ __name((mid) => {
    if (typeof target.chat !== "string") return null;
    let _c = String(target.chat).replace(/^@/, "");
    if (_c === "__self__") { const _real = spSelfChat(); if (_real) _c = _real.replace(/^@/, ""); }
    return \`https://t.me/\${_c}/\${mid || ""}\`;
  }, "linkFor");`);

fs.writeFileSync(target, src);
console.log('✅ patched: ' + target + ' (b48 — رسا پل است)');
