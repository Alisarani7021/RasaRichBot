#!/usr/bin/env node
/* b45 — نصب اختصاصی: /go + /api/selfinstall + مالکیت مستأجر
   زنجیره: v25 → commander → mcp → superpowers → refinements → installer
   Usage: node patch_installer.mjs <bundle.mjs>                                     */
import fs from 'node:fs';

const target = process.argv[2] || 'cf/sim/bundle_v28.mjs';
let src = fs.readFileSync(target, 'utf8');
const snip = fs.readFileSync(new URL('./snippets/superpowers3.js', import.meta.url), 'utf8');

const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('spSelfInstall') === 0, 'already patched');
must(count('spTool2') >= 2, 'refinements اول لازم است');
must(count('mcpToolDefs') >= 1, 'دریچهٔ MCP لازم است');

/* ۱) موتور نصب */
const ENG = '\nasync function applyLiveTick(env, job) {';
must(count(ENG) === 1, 'applyLiveTick anchor');
src = src.replace(ENG, '\n' + snip.trimEnd() + '\n' + ENG);

/* ۲) مسیرهای نصب */
const R = '    const origin = url.origin;';
must(count(R) === 1, 'origin anchor');
src = src.replace(R, '    if (url.pathname === "/go" || url.pathname === "/install" || url.pathname === "/install/" || url.pathname === "/api/selfinstall" || url.pathname === "/api/selfinstall/") {\n      try { const spInst = await spInstallRoute(env, request, url); if (spInst) return spInst; } catch (e) { return new Response("install error: " + String(e && e.message || e), { status: 500 }); }\n    }\n' + R);

/* ۳) مالکیت مستأجر: cmdOwners آگاه از KV */
const OLD_OWNERS = `function cmdOwners(env) {
  try {
    var raw = String(env.COMMANDER_OWNERS || '').trim();
    if (raw) return raw.split(/[,\\s]+/).map(function (x) { return Number(x); }).filter(Boolean);
  } catch (e) {}
  return CMD_DEFAULT_OWNERS;
}`;
must(count(OLD_OWNERS) === 1, 'cmdOwners anchor');
src = src.replace(OLD_OWNERS, `async function cmdOwners(env) {
  try {
    var raw = String(env.COMMANDER_OWNERS || '').trim();
    if (raw) return raw.split(/[,\\s]+/).map(function (x) { return Number(x); }).filter(Boolean);
    if (String(env.TENANT || '') === '1') {
      var st = new Store(rasaEnv(env), cfg(env));
      var cl = await st.get('cmd:owner', null);
      var ids = [];
      if (cl && cl.uid) ids.push(Number(cl.uid));
      if (cl && Array.isArray(cl.extra)) cl.extra.forEach(function (x) { if (Number(x)) ids.push(Number(x)); });
      return ids;
    }
  } catch (e) {}
  return CMD_DEFAULT_OWNERS;
}`);

/* ۴) قلاب مستأجر قبل از بررسی مالک */
const CALL = '  if (cmdOwners(env).indexOf(uid) < 0) return false;';
must(count(CALL) === 1, 'owner call anchor');
src = src.replace(CALL, `  { const spTen = await spTenantHook(env, message); if (spTen && spTen.stop) return true; }
  if ((await cmdOwners(env)).indexOf(uid) < 0) return false;`);

/* ۵) بدون کانال هم همهٔ ابزارهای غیرانتشاری باید کار کنند */
const GATE = `  if (!chan) return { ok: false, error: 'کانال پیش‌فرض تنظیم نشده؛ از ابزار set_channel استفاده کن.' };`;
must(count(GATE) === 1, 'mcp channel gate anchor');
src = src.replace(GATE, `  var SP_NEED_CHAN = ['publish_post', 'publish_media', 'album', 'delete_post', 'delete_last', 'replace_last', 'pin_post', 'unpin_post', 'publish_draft'];
  if (!chan && SP_NEED_CHAN.indexOf(name) > -1) return { ok: false, error: 'کانال پیش‌فرض تنظیم نشده؛ اول ابزار set_channel را صدا بزن (یا در پیوی ربات بنویس /channel @نام‌کانال).' };`);

fs.writeFileSync(target, src);
console.log('✅ patched: ' + target + ' (installer)');
