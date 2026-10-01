/* ═══════════════════════════════════════════════════════════════════════════
   b45 — «نصب اختصاصی»: هر کس ورکر خودش، سهمیهٔ هوش مصنوعی خودش، کانال خودش
   • صفحهٔ /go  →  فرم نصب
   • POST /api/selfinstall  →  ساخت ورکر شخصی روی حساب کلادفلر کاربر
   • spTenantHook  →  مالکیت، /mcp ، /channel در ورکرهای مستأجر
   ═══════════════════════════════════════════════════════════════════════════ */

var SP_CF_API = 'https://api.cloudflare.com/client/v4';
var SP_BUNDLE_URLS = [
  'https://raw.githubusercontent.com/Alisarani7021/RasaRichBot/main/worker/index.js',
  'https://cdn.jsdelivr.net/gh/Alisarani7021/RasaRichBot@main/worker/index.js'
];
var SP_REPO = 'https://github.com/Alisarani7021/RasaRichBot';
var SP_BUILD = 'b46'; /* مهر نسخه — هنگام هر تغییر این را یکی جلو ببر تا نصب‌ها نسخهٔ تازه بگیرند */

function spRandHex(n) {
  var b = new Uint8Array(Math.ceil(n / 2));
  crypto.getRandomValues(b);
  return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').slice(0, n);
}
function spTokenTemplateUrl(name) {
  var perms = [{ key: 'workers_scripts', type: 'edit' }, { key: 'workers_kv_storage', type: 'edit' }];
  return 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=' + encodeURIComponent(JSON.stringify(perms)) + '&accountId=*&zoneId=all&name=' + encodeURIComponent(name || 'Rasa Bot — نصب اختصاصی');
}
async function spCf(token, method, path, body) {
  var init = { method: method, headers: { authorization: 'Bearer ' + token } };
  if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  try {
    var r = await fetch(SP_CF_API + path, init);
    var j = null;
    try { j = await r.json(); } catch (e) { j = { success: false, errors: [{ message: 'HTTP ' + r.status }] }; }
    if (!j.success) {
      var msg = (j.errors || []).map(function (x) { return x.message; }).join(' · ') || ('HTTP ' + r.status);
      return { ok: false, error: msg, result: j.result };
    }
    return { ok: true, result: j.result };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
function spSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function spFetchBundle() {
  var stale = false;
  for (var attempt = 0; attempt < 3; attempt += 1) {
    for (var i = 0; i < SP_BUNDLE_URLS.length; i += 1) {
      try {
        var r = await fetch(SP_BUNDLE_URLS[i] + '?v=' + Date.now(), { headers: { 'user-agent': 'RasaInstaller/1.0', 'cache-control': 'no-cache' } });
        if (!r.ok) continue;
        var t = await r.text();
        if (t && t.length > 2500000 && t.indexOf('mcpHandle') > -1) {
          if (t.indexOf("var SP_BUILD = '" + SP_BUILD + "'") > -1) return { ok: true, text: t, from: SP_BUNDLE_URLS[i] };
          stale = true;
        }
      } catch (e) { /* مسیر بعدی */ }
    }
    if (attempt < 2) await spSleep(15000);
  }
  return { ok: false, error: stale ? 'نسخهٔ تازهٔ فایل ربات هنوز در گیت‌هاب منتشر نشده؛ ۲ دقیقه بعد دوباره نصب را بزن' : 'دریافت فایل ربات ناموفق بود (اینترنت یا مخزن در دسترس نبود)' };
}
function spWorkerName(x) {
  var n = String(x || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (n.length < 3) n = 'rasa-' + spRandHex(4);
  return n;
}

/* ── نصب: همهٔ مراحل ─────────────────────────────────────────────────────── */
async function spSelfInstall(env, body, ipHash) {
  var log = [];
  var note = function (t, ok, extra) { log.push({ t: t, ok: ok === undefined ? true : !!ok, x: extra || '' }); };
  var cfT = String(body.cf_token || '').trim();
  var botT = String(body.bot_token || '').trim();
  var chan = String(body.channel || '').trim().replace(/^https?:\/\/t\.me\//i, '@');
  if (chan && chan.charAt(0) !== '@' && /^[A-Za-z0-9_]{4,}$/.test(chan)) chan = '@' + chan;
  var name = spWorkerName(body.name);

  if (cfT.length < 20) return { ok: false, log: log, error: 'توکن کلادفلر خالی یا نامعتبر است' };
  if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(botT)) return { ok: false, log: log, error: 'توکن ربات تلگرام نامعتبر است (از @BotFather بگیر: عدد:حروف)' };
  if (chan && !/^@[A-Za-z0-9_]{4,}$/.test(chan)) return { ok: false, log: log, error: 'نام کانال نامعتبر است (مثل @mychannel)' };

  /* ۱) بررسی توکن */
  var v = await spCf(cfT, 'GET', '/user/tokens/verify');
  if (!v.ok) return { ok: false, log: log, error: 'توکن کلادفلر پذیرفته نشد: ' + v.error };
  note('توکن کلادفلر تأیید شد');

  /* ۲) حساب */
  var acc = await spCf(cfT, 'GET', '/accounts?per_page=50');
  if (!acc.ok || !(acc.result || []).length) return { ok: false, log: log, error: 'حسابی با این توکن پیدا نشد. هنگام ساخت توکن، Account Resources را روی «All accounts» بگذار.' };
  var account = acc.result[0];
  note('حساب: ' + (account.name || account.id), true, account.id);

  /* ۳) زیردامنه (workers.dev) */
  var sub = await spCf(cfT, 'GET', '/accounts/' + account.id + '/workers/subdomain');
  var subdomain = sub.ok && sub.result && sub.result.subdomain ? sub.result.subdomain : '';
  if (!subdomain) {
    for (var s = 0; s < 3 && !subdomain; s += 1) {
      var tryName = 'rasa-' + spRandHex(6);
      var made = await spCf(cfT, 'PUT', '/accounts/' + account.id + '/workers/subdomain', { subdomain: tryName });
      if (made.ok && made.result && made.result.subdomain) subdomain = made.result.subdomain;
    }
    if (!subdomain) return { ok: false, log: log, error: 'زیردامنهٔ workers.dev ساخته نشد: ' + (sub.error || 'خطای نامشخص') };
    note('زیردامنه ساخته شد: ' + subdomain + '.workers.dev');
  } else {
    note('زیردامنه: ' + subdomain + '.workers.dev');
  }
  var base = 'https://' + name + '.' + subdomain + '.workers.dev';

  /* ۴) سه انبار KV */
  var kvIds = [];
  for (var k = 1; k <= 3; k += 1) {
    var mk = await spCf(cfT, 'POST', '/accounts/' + account.id + '/storage/kv/namespaces', { title: name + '-kv' + k + '-' + spRandHex(3) });
    if (!mk.ok || !mk.result) return { ok: false, log: log, error: 'ساخت انبار داده نشد: ' + mk.error + ' (توکن باید Workers KV Storage:Edit داشته باشد)' };
    kvIds.push(mk.result.id);
  }
  note('انبارهای داده ساخته شد (۳ عدد)');

  /* ۵) فایل ربات */
  var bun = await spFetchBundle();
  if (!bun.ok) return { ok: false, log: log, error: bun.error };
  note('فایل ربات دریافت شد', true, Math.round(bun.text.length / 1024) + 'KB');

  /* ۶) آپلود ورکر شخصی */
  var secret = spRandHex(32);
  var hookSecret = spRandHex(24);
  var bindings = [
    { type: 'kv_namespace', name: 'KV', namespace_id: kvIds[0] },
    { type: 'kv_namespace', name: 'KV_FRESH', namespace_id: kvIds[1] },
    { type: 'kv_namespace', name: 'RASA_KV', namespace_id: kvIds[2] },
    { type: 'durable_object_namespace', name: 'STATE', class_name: 'State' },
    { type: 'ai', name: 'AI' },
    { type: 'secret_text', name: 'BOT_TOKEN', text: botT },
    { type: 'secret_text', name: 'WEBHOOK_SECRET', text: hookSecret },
    { type: 'secret_text', name: 'MCP_SECRET', text: secret },
    { type: 'plain_text', name: 'WEBHOOK_PATH', text: '/telegram/webhook' },
    { type: 'plain_text', name: 'COMMANDER_ON', text: '1' },
    { type: 'plain_text', name: 'TENANT', text: '1' },
    { type: 'plain_text', name: 'PUBLIC_BASE', text: base },
    { type: 'plain_text', name: 'CMD_CHANNEL', text: chan || '' },
    { type: 'plain_text', name: 'COMMANDER_OWNERS', text: String(body.owner_id || '') }
  ];
  var meta = { main_module: 'index.js', compatibility_date: '2026-09-28', bindings: bindings, migrations: { new_tag: 'v1', new_sqlite_classes: ['State'] } };
  async function upload(metadata) {
    var fd = new FormData();
    fd.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
    fd.append('index.js', new Blob([bun.text], { type: 'application/javascript+module' }), 'index.js');
    var r = await fetch(SP_CF_API + '/accounts/' + account.id + '/workers/scripts/' + name, { method: 'PUT', headers: { authorization: 'Bearer ' + cfT }, body: fd });
    var j = null; try { j = await r.json(); } catch (e) { j = { success: false, errors: [{ message: 'HTTP ' + r.status }] }; }
    return { ok: !!(j && j.success), error: (j && (j.errors || []).map(function (x) { return x.message; }).join(' · ')) || ('HTTP ' + r.status) };
  }
  var up = await upload(meta);
  if (!up.ok && /migration|class/i.test(up.error)) {
    var nss = await spCf(cfT, 'GET', '/accounts/' + account.id + '/workers/durable_objects/namespaces?per_page=100');
    var found = null;
    (nss.result || []).forEach(function (n) { if (!found && (n.class === 'State' || n.class_name === 'State') && (n.script === name || n.script_name === name)) found = n; });
    if (found) {
      var b2 = bindings.map(function (b) { return b.name === 'STATE' ? { type: 'durable_object_namespace', name: 'STATE', class_name: 'State', namespace_id: found.id } : b; });
      var meta2 = { main_module: 'index.js', compatibility_date: '2026-09-28', bindings: b2 };
      up = await upload(meta2);
    }
  }
  if (!up.ok) return { ok: false, log: log, error: 'آپلود ورکر نشد: ' + up.error };
  note('ورکر «' + name + '» ساخته و آپلود شد');
  var subEn = await spCf(cfT, 'POST', '/accounts/' + account.id + '/workers/scripts/' + name + '/subdomain', { enabled: true, previews_enabled: false });
  if (subEn.ok) note('آدرس workers.dev فعال شد');
  else note('فعال‌سازی آدرس: ' + subEn.error, false);

  /* ۷) درج مقادیر اولیه */
  async function kvPut(nsId, key, value) {
    var r = await fetch(SP_CF_API + '/accounts/' + account.id + '/storage/kv/namespaces/' + nsId + '/values/' + encodeURIComponent(key), { method: 'PUT', headers: { authorization: 'Bearer ' + cfT, 'content-type': 'text/plain' }, body: value });
    return r.ok;
  }
  if (chan) await kvPut(kvIds[2], 'cmd:chan:shared', JSON.stringify(chan));
  await kvPut(kvIds[2], 'install:info', JSON.stringify({ at: Date.now(), from: 'installer', base: base, name: name, channel: chan || '' }));
  if (body.owner_id) await kvPut(kvIds[2], 'cmd:owner', JSON.stringify({ uid: Number(body.owner_id), at: Date.now(), name: '' }));
  note('تنظیمات اولیه نوشته شد' + (chan ? ' (کانال: ' + chan + ')' : ''));

  /* ۸) وب‌هوک ربات خودش */
  var me = null;
  try {
    var mr = await fetch('https://api.telegram.org/bot' + botT + '/getMe');
    var mj = await mr.json();
    if (mj && mj.ok) me = mj.result;
  } catch (e) { /* ادامه */ }
  if (!me) return { ok: false, log: log, error: 'توکن ربات تلگرام کار نکرد — از @BotFather یک توکن تازه بگیر', partial: { base: base, mcp_url: base + '/api/mcp/' + secret } };
  note('ربات تأیید شد: @' + me.username);
  var wh = false;
  if (body.no_webhook === true) {
    note('وب‌هوک ثبت نشد (حالت آزمایشی)');
  } else {
    try {
      var wr = await fetch('https://api.telegram.org/bot' + botT + '/setWebhook', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: base + '/telegram/webhook', secret_token: hookSecret, allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member'] })
      });
      var wj = await wr.json();
      wh = !!(wj && wj.ok);
      if (!wh) note('وب‌هوک ثبت نشد: ' + ((wj && wj.description) || 'خطا'), false);
    } catch (e) { note('وب‌هوک ثبت نشد: ' + String(e && e.message || e), false); }
    if (wh) note('وب‌هوک ربات روی ورکر شخصی تنظیم شد');
  }
  try {
    await fetch('https://api.telegram.org/bot' + botT + '/setMyCommands', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commands: [
        { command: 'start', description: 'شروع · استودیو پست' },
        { command: 'mcp', description: 'لینک اتصال به جمنای/کلاد/گروک' },
        { command: 'channel', description: 'تعیین کانال: /channel @mychannel' }
      ] })
    });
  } catch (e) { /* اختیاری */ }

  /* ۹) زمان‌بند هر دقیقه */
  var sch = await spCf(cfT, 'PUT', '/accounts/' + account.id + '/workers/scripts/' + name + '/schedules', [{ cron: '* * * * *' }]);
  if (sch.ok) note('زمان‌بند هر دقیقه فعال شد (پست خودکار/RSS/رصد)');
  else note('زمان‌بند فعال نشد: ' + sch.error, false);

  /* ۱۰) آزمون زندهٔ دریچهٔ MCP */
  var mcpUrl = base + '/api/mcp/' + secret;
  var alive = false;
  try {
    var tr = await fetch(mcpUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }) });
    var tj = await tr.json();
    alive = !!(tj && tj.result && tj.result.serverInfo);
  } catch (e) { /* آزمون نشد */ }
  note(alive ? 'آزمون زندهٔ MCP موفق ✅' : 'لینک ساخته شد (آزمون خودکار از داخل حساب ممکن نشد؛ چند لحظه بعد خودت امتحان کن)', alive);

  /* ثبت در دفتر نصب (بدون توکن) */
  try {
    var store = new Store(rasaEnv(env), cfg(env));
    var reg = await store.get('installs', { items: [] });
    reg.items = [{ at: Date.now(), worker: name, base: base, bot: me.username, acc: account.id.slice(0, 8), ip: ipHash || '' }].concat(reg.items || []).slice(0, 500);
    await store.put('installs', reg, 400 * 86400);
  } catch (e) { /* مهم نیست */ }

  return {
    ok: true, log: log, name: name, base: base, mcp_url: mcpUrl,
    bot_username: me.username, account: account.name || account.id,
    channel: chan || '', tenant: true,
    next_steps: [
      'به ربات خودت در تلگرام پیام بده (/start) تا مالکش شوی و راهنمای اتصال بیاید',
      'لینک بالا را در جمنای/کلاد/گروک به‌عنوان MCP اضافه کن',
      chan ? ('کانال ' + chan + ' را ثبت کردم؛ ربات را ادمین کانال کن') : 'در پیوی رباتت بنویس: /channel @نام‌کانال'
    ]
  };
}

/* ── مسیرها ─────────────────────────────────────────────────────────────── */
async function spInstallRoute(env, request, url) {
  if (url.pathname === '/go' || url.pathname === '/install' || url.pathname === '/install/') {
    if (request.method !== 'GET') return new Response('POST لازم است', { status: 405 });
    return new Response(spInstallPage(env, url), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  }
  if (url.pathname === '/api/selfinstall' || url.pathname === '/api/selfinstall/') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' } });
    if (request.method !== 'POST') return spJsonOut({ ok: false, error: 'POST لازم است' }, 405);
    var body = {};
    try { body = await request.json(); } catch (e) { return spJsonOut({ ok: false, error: 'JSON نامعتبر' }, 400); }
    if (String(body.consent || '') !== 'yes') return spJsonOut({ ok: false, error: 'تأیید شرایط لازم است' }, 400);
    var ip = String(request.headers.get('cf-connecting-ip') || '0.0.0.0');
    var ipHash = (await spHash(ip + '|rasa')).slice(0, 12);
    try {
      var store = new Store(rasaEnv(env), cfg(env));
      var rl = await store.get('rl:inst:' + ipHash, { hour: '', n: 0 });
      var hr = new Date().toISOString().slice(0, 13);
      if (rl.hour !== hr) rl = { hour: hr, n: 0 };
      if (rl.n >= 6) return spJsonOut({ ok: false, error: 'تعداد نصب‌های این ساعت زیاد است؛ یک ساعت بعد امتحان کن' }, 429);
      rl.n += 1; await store.put('rl:inst:' + ipHash, rl, 7200);
    } catch (e) { /* بی‌سازمان */ }
    var out = await spSelfInstall(env, body, ipHash);
    return spJsonOut(out, out.ok ? 200 : 200);
  }
  return null;
}

/* ── مستأجر: مالکیت، لینک، کانال ─────────────────────────────────────────── */
async function spTenantHook(env, message) {
  if (String(env.TENANT || '') !== '1') return null;
  var chat = message.chat || {};
  if (chat.type !== 'private') return null;
  var uid = Number((message.from || {}).id || 0);
  if (!uid) return null;
  var store = new Store(rasaEnv(env), cfg(env));
  var base = String(env.PUBLIC_BASE || '').replace(/\/+$/, '');
  var link = base ? base + '/api/mcp/' + String(env.MCP_SECRET || '') : '';
  var text = String(message.text || '').trim();
  var claim = await store.get('cmd:owner', null);
  if (!claim || !claim.uid) {
    claim = { uid: uid, at: Date.now(), name: String((message.from || {}).first_name || '') };
    await store.put('cmd:owner', claim, 60 * 60 * 24 * 3650);
    await cmdSay(env, uid, '🎉 **تو مالک این ربات شدی!**\n\nاین رباتِ اختصاصی خودته: روی حساب کلادفلر خودت، با سهمیهٔ هوش مصنوعی خودت، برای کانال خودت.\n\n' + (link ? '🔗 لینک اتصال به جمنای/کلاد/گروک:\n' + link + '\n\n' : '') + 'قدم‌های بعدی:\n۱) کانال را ثبت کن: /channel @نام‌کانال\n۲) ربات را ادمین کانال کن\n۳) هر کاری خواستی به همین ربات بگو (چه در تلگرام، چه از جمنای/کلاد/گروک).');
    return { stop: true };
  }
  if (Number(claim.uid) !== uid) return null;
  if (/^\/mcp\b|^\/link\b|^لینک اتصال$/.test(text)) {
    await cmdSay(env, uid, link ? ('🔗 لینک اتصال تو (جمنای / کلاد / گروک → MCP):\n' + link + '\n\nراهنما: ' + base + '/go') : 'لینک ساخته نشده؛ یک بار نصب را از ' + base + '/go تکرار کن.');
    return { stop: true };
  }
  var mch = text.match(/^\/channel\s+(\S+)/);
  if (mch) {
    var c = mch[1].replace(/^https?:\/\/t\.me\//i, '@');
    if (c.charAt(0) !== '@') c = '@' + c;
    if (!/^@[A-Za-z0-9_]{4,}$/.test(c)) { await cmdSay(env, uid, 'نام کانال درست نیست. مثال: /channel @mychannel'); return { stop: true }; }
    await store.put('cmd:chan:' + uid, c, 60 * 60 * 24 * 3650);
    await store.put('cmd:chan:shared', c, 60 * 60 * 24 * 3650);
    await cmdSay(env, uid, '✅ کانال ثبت شد: ' + c + '\nربات را ادمین کانال کن (با اجازهٔ ارسال پست)، بعد بگو: «یک پست تبریک بذار»');
    return { stop: true };
  }
  if (/^\/help\b|^\/راهنما$/.test(text)) {
    await cmdSay(env, uid, 'کمک سریع:\n/channel @نام‌کانال — ثبت کانال\n/mcp — لینک اتصال به جمنای/کلاد/گروک\n/github — راهنمای رصد گیت‌هاب\n\nبقیهٔ کارها را ساده بگو: «یک پست دربارهٔ ... بذار»، «قیمت دلار چنده؟ پست کن»، «این مخزن را زیر نظر بگیر: ...»');
    return { stop: true };
  }
  return null;
}

/* ── صفحهٔ نصب ───────────────────────────────────────────────────────────── */
function spInstallPage(env, url) {
  var tokUrl = spTokenTemplateUrl('Rasa Bot — نصب اختصاصی');
  var repo = SP_REPO;
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>نصب اختصاصی رِسا — ورکر خودت، سهمیهٔ خودت</title>
<style>
:root{--bg:#0b0e14;--card:#141924;--line:#232a39;--gold:#e9b949;--txt:#e8ecf4;--dim:#9aa6bd;--ok:#34d399;--bad:#f87171}
*{box-sizing:border-box}
body{margin:0;background:linear-gradient(180deg,#0b0e14,#0f141c 55%,#0b0e14);color:var(--txt);font-family:Tahoma,"Segoe UI",sans-serif;line-height:1.9;padding:16px}
.wrap{max-width:720px;margin:0 auto}
.hero{text-align:center;padding:22px 10px 6px}
.badge{display:inline-block;border:1px solid var(--gold);color:var(--gold);border-radius:999px;padding:3px 12px;font-size:12px}
h1{font-size:24px;margin:.45em 0 .2em}
.sub{color:var(--dim);font-size:14px;margin:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:14px 0}
.step{display:flex;gap:10px;align-items:flex-start;margin-bottom:6px}
.num{flex:0 0 26px;height:26px;border-radius:50%;background:var(--gold);color:#171101;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px}
h3{margin:.1em 0;font-size:16px}
p.small{color:var(--dim);font-size:13px;margin:.35em 0}
a.btn,button.btn{display:block;width:100%;text-align:center;text-decoration:none;border:0;border-radius:13px;padding:13px 16px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
a.gold,button.gold{background:var(--gold);color:#171101}
a.ghost,button.ghost{background:transparent;color:var(--txt);border:1px solid var(--line)}
label{display:block;font-size:13px;color:var(--dim);margin:10px 0 4px}
input,textarea{width:100%;background:#0b0d11;color:var(--txt);border:1px solid #2a2f3a;border-radius:11px;padding:11px;font-size:14px;font-family:inherit}
input.ltr,textarea.ltr{direction:ltr;text-align:left;font-family:ui-monospace,Menlo,monospace}
.row{display:flex;gap:8px;flex-wrap:wrap}
.row>*{flex:1 1 140px}
.chk{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:13px;color:var(--dim)}
.chk input{width:auto;margin-top:5px}
.log{font-size:13px;margin:10px 0 0;padding:0;list-style:none}
.log li{padding:4px 0;border-bottom:1px dashed var(--line);color:var(--dim)}
.log li b{color:var(--txt)}
.ok{color:var(--ok)} .bad{color:var(--bad)}
.res{display:none}
.url{background:#0b0d11;border:1px dashed var(--gold);border-radius:12px;padding:11px;direction:ltr;text-align:left;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;word-break:break-all;margin:8px 0}
.tabs{display:flex;gap:6px;margin:10px 0 4px;flex-wrap:wrap}
.tabs button{flex:1 1 90px;background:transparent;color:var(--dim);border:1px solid var(--line);border-radius:10px;padding:8px;font-family:inherit;font-size:13px;cursor:pointer}
.tabs button.on{color:#171101;background:var(--gold);border-color:var(--gold);font-weight:700}
.tabBody{font-size:13.5px;color:var(--dim)}
.tabBody b{color:var(--txt)}
.hide{display:none}
.spin{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--gold);border-radius:50%;animation:sp 1s linear infinite;vertical-align:-2px}
@keyframes sp{to{transform:rotate(360deg)}}
.warn{border-color:#6b4a12;background:#1c1608}
.foot{color:#5d6980;font-size:11.5px;text-align:center;margin:22px 0 8px}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <span class="badge">نسخهٔ اختصاصی · بدون اشتراک</span>
    <h1>ربات خودت را روی حساب خودت بساز</h1>
    <p class="sub">۵۹ ابزار هوش مصنوعی، رصد گیت‌هاب، ساخت سایت و اپ — همه روی ورکر خودت؛ سهمیهٔ هوش مصنوعی خودت؛ کانال خودت. هیچ ربطی به حساب من ندارد.</p>
  </div>

  <div class="card">
    <div class="step"><div class="num">۱</div><div><h3>توکن کلادفلر بساز</h3><p class="small">دکمه را بزن؛ صفحهٔ کلادفلر با دسترسی‌های لازم از قبل پر می‌شود. فقط <b>Continue to summary</b> → <b>Create Token</b> → کپی.</p></div></div>
    <a class="btn gold" target="_blank" rel="noopener" href="${tokUrl}">🔑 ساخت توکن آماده در کلادفلر</a>
    <p class="small">دسترسی‌هایی که لازم است: Workers Scripts (Edit) + Workers KV Storage (Edit) — همین دو کافی است.</p>
  </div>

  <div class="card">
    <div class="step"><div class="num">۲</div><div><h3>توکن ربات تلگرام خودت</h3><p class="small">در تلگرام به <b>@BotFather</b> پیام بده → <b>/newbot</b> → نام بده → توکنی مثل <code class="ltr">123456:AAE…</code> می‌دهد.</p></div></div>
  </div>

  <div class="card">
    <div class="step"><div class="num">۳</div><div><h3>نصب کن</h3><p class="small">توکن‌ها را بچسبان و دکمه را بزن. همه‌چیز خودکار ساخته می‌شود: ورکر، انبار داده، وب‌هوک، زمان‌بند و لینک اتصال.</p></div></div>
    <label>توکن کلادفلر</label>
    <textarea class="ltr" id="cf" rows="2" placeholder="cf token..."></textarea>
    <label>توکن ربات تلگرام</label>
    <input class="ltr" id="bt" placeholder="123456:AAE..."/>
    <div class="row">
      <div><label>کانال (اختیاری)</label><input class="ltr" id="ch" placeholder="@mychannel"/></div>
      <div><label>نام ورکر (اختیاری)</label><input class="ltr" id="nm" placeholder="rasa-mybot"/></div>
    </div>
    <div class="chk"><input type="checkbox" id="ok"/><label for="ok" style="margin:0">توکن‌ها فقط برای همین نصب استفاده می‌شوند و هیچ‌جا ذخیره نمی‌شوند. موافقم روی حساب خودم ورکر ساخته شود.</label></div>
    <button class="btn gold" id="go" style="margin-top:12px">🚀 نصب کن</button>
    <p class="small" id="stat"></p>
    <ul class="log" id="log"></ul>
  </div>

  <div class="card res" id="res">
    <h3 class="ok">✅ نصب شد!</h3>
    <p class="small">این لینک اختصاصی توست — در جمنای، کلاد یا گروک به‌عنوان MCP اضافه کن:</p>
    <div class="url" id="mcpurl"></div>
    <button class="btn ghost" id="copy">📋 کپی لینک</button>
    <div class="tabs">
      <button data-t="g" class="on">جمنای</button><button data-t="c">کلاد</button><button data-t="x">گروک</button>
    </div>
    <div class="tabBody" id="tg"><b>جمنای:</b> Settings → Connected Apps → Custom apps for Spark → Add → لینک را بچسبان → Client ID/Secret خالی → ذخیره. اسمش را مثلاً «رسا» بگذار.</div>
    <div class="tabBody hide" id="tc"><b>کلاد:</b> Settings → Connectors → Add custom connector → لینک را بچسبان → Add. (کلاد کد: <span class="ltr">claude mcp add --transport http rasa «لینک»</span>)</div>
    <div class="tabBody hide" id="tx"><b>گروک:</b> grok.com/connectors → New Connector → Custom → لینک را بچسبان → ذخیره. (نیاز به اشتراک پرداختی گروک دارد.)</div>
    <p class="small" id="steps"></p>
  </div>

  <div class="card warn">
    <h3>صادقانه</h3>
    <p class="small">سهمیهٔ هوش مصنوعی هر ورکر روی حساب خودِ صاحبش حساب می‌شود؛ سقف رایگان کلادفلر روزانه است و اگر زیاد استفاده کنی باید پلن ۵ دلاری Workers Paid را فعال کنی. توکن‌ها در مرورگر تو می‌مانند و فقط یک‌بار برای ساخت استفاده می‌شوند. اگر جایی گیر کردی، دوباره همین صفحه را باز کن و نصب را تکرار کن (نصب دوباره = به‌روزرسانی).</p>
  </div>

  <p class="foot">رِسا · <span class="ltr">${repo}</span></p>
</div>
<script>
var $=function(id){return document.getElementById(id)};
function esc(s){var d=document.createElement('div');d.textContent=String(s);return d.innerHTML}
$('go').onclick=function(){
  var cf=$('cf').value.trim(), bt=$('bt').value.trim(), ch=$('ch').value.trim(), nm=$('nm').value.trim();
  if(cf.length<20){$('stat').innerHTML='<span class="bad">توکن کلادفلر را بچسبان</span>';return}
  if(bt.indexOf(':')<5){$('stat').innerHTML='<span class="bad">توکن ربات تلگرام را بچسبان</span>';return}
  if(!$('ok').checked){$('stat').innerHTML='<span class="bad">تیک موافقت را بزن</span>';return}
  $('go').disabled=true;$('log').innerHTML='';$('res').className='card res hide';
  $('stat').innerHTML='<span class="spin"></span> در حال نصب… (۳۰ تا ۹۰ ثانیه، صفحه را نبند)';
  fetch('/api/selfinstall',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cf_token:cf,bot_token:bt,channel:ch,name:nm,consent:'yes'})})
  .then(function(r){return r.json()})
  .then(function(d){
    var html='';
    (d.log||[]).forEach(function(x){html+='<li>'+(x.ok?'✅':'⚠️')+' '+esc(x.t+(x.x?(' — '+x.x):''))+'</li>'});
    $('log').innerHTML=html;
    if(!d.ok){$('stat').innerHTML='<span class="bad">❌ '+esc(d.error||'نصب نشد')+'</span>';$('go').disabled=false;return}
    $('stat').innerHTML='<span class="ok">تمام شد.</span>';
    $('mcpurl').textContent=d.mcp_url;
    $('steps').innerHTML=(d.next_steps||[]).map(function(s){return '• '+esc(s)}).join('<br>');
    $('res').className='card res';
    window.__mcp=d.mcp_url;
    $('go').disabled=false;
  })
  .catch(function(e){$('stat').innerHTML='<span class="bad">خطای شبکه: '+esc(e.message)+'</span>';$('go').disabled=false});
};
$('copy').onclick=function(){var u=window.__mcp||$('mcpurl').textContent;var d=document.createElement('textarea');d.value=u;document.body.appendChild(d);d.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(d);this.textContent='✅ کپی شد';var b=this;setTimeout(function(){b.textContent='📋 کپی لینک'},1500)};
var btns=document.querySelectorAll('.tabs button');
for(var i=0;i<btns.length;i++){(function(b){b.onclick=function(){for(var j=0;j<btns.length;j++){btns[j].className=''}$('tg').className='tabBody hide';$('tc').className='tabBody hide';$('tx').className='tabBody hide';b.className='on';var map={g:'tg',c:'tc',x:'tx'};$(map[b.getAttribute('data-t')]).className='tabBody'}})(btns[i])}
</script>
</body>
</html>`;
}
