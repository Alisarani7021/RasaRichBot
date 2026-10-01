/* ═══════════════════════════════════════════════════════════════════════
   رِسا × جمنای — پست خودکار روزانه   (بدون کامپیوتر، فقط با مرورگر گوشی)
   هر روز صبح: جمنای یک پست تازه می‌نویسد → رِسا آن را در کانال منتشر می‌کند.
   راه‌اندازی: فایل README.md همین پوشه (قدم‌به‌قدم با عکس‌به‌عکس ذهنی).
   تست روی سرور:  node Code.gs doctor | prompt | postnow | publish "متن"
   این فایل هم در Google Apps Script کار می‌کند و هم در Node (شیم پایین فایل).
   ═══════════════════════════════════════════════════════════════════════ */

/* ── ۱) تنظیمات: فقط این خطوط را پر کن ─────────────────────────────────── */
var CFG = {
  BOT_TOKEN: 'PUT_BOT_TOKEN_HERE',        // توکن ربات (همان که در چت تلگرام برایت فرستادم)
  RASA_UID: '8795596928',                  // آی‌دی عددی حسابی که ادمین کانال است
  GEMINI_KEY: 'PUT_GEMINI_API_KEY_HERE',   // از aistudio.google.com/apikey رایگان بگیر
  CHANNEL: '@xjjsjsjsjji',                 // کانال مقصد — کانال خودت را بگذار
  TOPIC: 'کانالی فارسی دربارهٔ بازار، طلا و ارز، کریپتو و تکنولوژی',  // موضوع برای لحن جمنای
  CITY: 'تهران',
  WITH_SIGNATURE: true,                    // true = با امضای رِسا و رایگان | false = بدون امضا (۱ اعتبار)
  NOTIFY: true,                            // پیام «✅ منتشر شد» در پیوی خودت
  ORIGIN: 'https://rich-post-bot.4lisarani-1.workers.dev'
};

/* ── ۲) تقویم هجری شمسی (همان الگوریتم دقیق رِسا) ──────────────────────── */
var FA_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
var FA_DAYS = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
var BREAKS = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];

function div(a, b) { return ~~(a / b); }
function mod(a, b) { return a - ~~(a / b) * b; }

function jalCal(jy, withoutLeap) {
  var bl = BREAKS.length, gy = jy + 621, leapJ = -14, jp = BREAKS[0], jm, jump, leap, leapG, march, n, i;
  for (i = 1; i < bl; i += 1) { jm = BREAKS[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm; }
  n = i - 1;
  leapJ += div(jy - jp, 33) * 8 + div(mod(jy - jp, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  march = 20 + leapJ - leapG;
  if (!withoutLeap) { if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33; leap = mod(mod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4; }
  return { leap: leap, gy: gy, march: march };
}
function g2d(gy, gm, gd) {
  var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 - div(gm - 8, 6), 100) * 3, 4) + 752;
}
function d2g(jdn) {
  var j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  var i = div(mod(j, 1461), 4) * 5 + 308;
  var gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1, gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy: gy, gm: gm, gd: gd };
}
function toJalali(dateUtcShifted) {
  var jdn = g2d(dateUtcShifted.getUTCFullYear(), dateUtcShifted.getUTCMonth() + 1, dateUtcShifted.getUTCDate());
  var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy, false), k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) { if (k <= 185) return { jy: jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 }; k -= 186; }
  else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  return { jy: jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}
function faNum(x) { return String(x).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }); }
function tehranNow() { return new Date(Date.now() + 12600000); }   // UTC+3:30

function todayInfo() {
  var d = tehranNow(), j = toJalali(d);
  var gMonths = ['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];
  return {
    j: j,
    fa: FA_DAYS[d.getUTCDay()] + ' ' + faNum(j.jd) + ' ' + FA_MONTHS[j.jm - 1] + ' ' + faNum(j.jy),
    g: d.getUTCDate() + ' ' + gMonths[d.getUTCMonth()] + ' ' + d.getUTCFullYear(),
    key: j.jy + '/' + j.jm + '/' + j.jd
  };
}

/* ── ۳) مناسبت‌های امروز و فردا (با فیلتر رِسا) ─────────────────────────── */
function occasionsFor(shiftDays) {
  var d = new Date(Date.now() + shiftDays * 86400000 + 12600000), j = toJalali(d);
  var url = 'https://holidayapi.ir/jalali/' + j.jy + '/' + String(j.jm).padStart(2, '0') + '/' + String(j.jd).padStart(2, '0');
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var raw = JSON.parse(r.getContentText());
    var skip = /^(جمعه|پنجشنبه|چهارشنبه|سه‌شنبه|دوشنبه|یکشنبه|شنبه|تعطیل)$/;
    var keep = /(عید|شهادت|ولادت|رحلت|مبعث|میلاد|تاسوعا|عاشورا|اربعین|غدیر|رمضان|محرم|قربان|فطر|نوروز|مهرگان|یلدا|جشن|بزرگداشت|روز جهانی|روز ملی|روز ارتش|روز پزشک|انقلاب|دفاع مقدس)/;
    var drop = /(درگذشت|زادروز|پیروزی|نبرد|تأسیس|تاسیس|اعدام|اعلام|امضای|انتخاب|کشف|افتتاح|اشغال|انقراض|جمهوری خلق)/;
    var evs = (raw.events || []).map(function (e) { return String(e.description || '').trim(); })
      .filter(function (d2) { return d2 && !skip.test(d2) && keep.test(d2) && !drop.test(d2); });
    return { fa: FA_DAYS[d.getUTCDay()] + ' ' + faNum(j.jd) + ' ' + FA_MONTHS[j.jm - 1], holiday: !!raw.is_holiday, events: evs.slice(0, 3) };
  } catch (e) {
    return { fa: '', holiday: null, events: [], error: String(e && e.message || e) };
  }
}

/* ── ۴) پل رِسا (نشست رمز‌امضاشده + انتشار) ──────────────────────────── */
function hexOf(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i += 1) { var v = (bytes[i] + 256) % 256; out += (v < 16 ? '0' : '') + v.toString(16); }
  return out;
}
function rasaToken() {
  var p = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AA' + Math.random().toString(36).slice(2),
    user: JSON.stringify({ id: Number(CFG.RASA_UID), first_name: 'Rasa' })
  };
  var keys = Object.keys(p).sort();
  var dcs = keys.map(function (k) { return k + '=' + p[k]; }).join('\n');
  var secret = Utilities.computeHmacSha256Signature(CFG.BOT_TOKEN, 'WebAppData');
  p.hash = hexOf(Utilities.computeHmacSha256Signature(dcs, secret));
  var initData = keys.concat(['hash']).sort().map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]); }).join('&');
  var r = UrlFetchApp.fetch(CFG.ORIGIN + '/api/session', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ initData: initData }), muteHttpExceptions: true
  });
  var j = JSON.parse(r.getContentText());
  if (!j || !j.token) throw new Error('ورود به رِسا ناموفق: ' + r.getContentText().slice(0, 160));
  return j.token;
}
function rasaApi(path, body, token) {
  var r = UrlFetchApp.fetch(CFG.ORIGIN + path, {
    method: 'post', contentType: 'application/json',
    headers: { 'x-rasa-token': token },
    payload: JSON.stringify(body || {}), muteHttpExceptions: true
  });
  try { return JSON.parse(r.getContentText()); } catch (e) { return { ok: false, error: r.getContentText().slice(0, 160) }; }
}
/* متن جمنای (مارک‌داون) مستقیم به رِسا داده می‌شود؛ رِسا خودش مارک‌داون را
   به ریچ تلگرام (بولد/لیست/نقل‌قول/اموجی پرمیوم) تبدیل می‌کند — همان مسیر مینی‌اپ. */
function publishToChannel(text, unsigned) {
  var token = rasaToken();
  var r = rasaApi('/api/publish', { target: CFG.CHANNEL, rich: { markdown: text }, unsigned: !!unsigned }, token);
  if (!r.ok && r.error === 'permissions') throw new Error('حساب ' + CFG.RASA_UID + ' باید ادمین ' + CFG.CHANNEL + ' باشد');
  if (!r.ok) throw new Error('انتشار ناموفق: ' + JSON.stringify(r).slice(0, 200));
  return r;
}
function notifyOwner(text) {
  if (!CFG.NOTIFY) return;
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + CFG.BOT_TOKEN + '/sendMessage', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ chat_id: Number(CFG.RASA_UID), text: text, disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
  } catch (e) { /* بی‌صدا */ }
}

/* ── ۵) نویسندهٔ جمنای ─────────────────────────────────────────────────── */
function buildPrompt(t, occ, occTomorrow) {
  var lines = [];
  lines.push('تو نویسندهٔ کانال تلگرامی من هستی. ' + CFG.TOPIC + '.');
  lines.push('امروز: ' + t.fa + ' (' + t.g + ').');
  if (occ.events.length) lines.push('مناسبت امروز: ' + occ.events.join('، ') + (occ.holiday ? ' (تعطیل)' : '') + '. فقط اگر مرتبط بود، یک اشارهٔ کوتاه بکن.');
  if (occTomorrow.events.length) lines.push('فردا: ' + occTomorrow.fa + ' — ' + occTomorrow.events.join('، ') + '.');
  lines.push('یک پست صبحگاهی برای کانال بنویس با این قواعد:');
  lines.push('• فارسی محاوره‌ایِ تمیز و درست، دوستانه و خودمانی.');
  lines.push('• بین ۵۰۰ تا ۸۰۰ کاراکتر. حداکثر ۳ ایموجی.');
  lines.push('• ساختار: قلاب در خط اول؛ سه تا پنج بند کوتاه؛ در آخر یک «کار کوچک برای امروز» با ایموجی ✅.');
  lines.push('• اگر مناسبت خاصی هست، در همان خط اول یک اشارهٔ دوستانه بکن.');
  lines.push('• هیچ هشتگ، لینک، آمار جعلی و عبارت تبلیغاتی نگذار. برای تأکید فقط از **بولد** استفاده کن.');
  lines.push('• فقط متن پست را بده؛ بدون توضیح و بدون تیتر اضافه.');
  return lines.join('\n');
}
function geminiWrite(prompt) {
  if (!CFG.GEMINI_KEY || CFG.GEMINI_KEY.indexOf('PUT_') === 0) throw new Error('کلید جمنای تنظیم نشده');
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + CFG.GEMINI_KEY;
  var r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.95, maxOutputTokens: 2048 } })
  });
  var txt = r.getContentText();
  var j = JSON.parse(txt);
  if (!j.candidates || !j.candidates.length) throw new Error('پاسخ جمنای خالی: ' + txt.slice(0, 160));
  var parts = j.candidates[0].content.parts || [];
  var out = parts.map(function (p) { return p.text || ''; }).join('').trim();
  if (!out) throw new Error('متن جمنای خالی بود');
  return out;
}

/* ── ۶) زنجیرهٔ اصلی ──────────────────────────────────────────────────── */
function generateMorningPost(force) {
  var t = todayInfo();
  var props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('lastPostKey') === t.key) { Logger.log('امروز قبلاً پست شده (' + t.fa + ') — رد شد.'); return; }

  var occ = occasionsFor(0), occT = occasionsFor(1);
  var post;
  try {
    post = geminiWrite(buildPrompt(t, occ, occT));
  } catch (e) {
    Logger.log('جمنای در دسترس نبود (' + e.message + ') → متن جانشین');
    var hi = occ.events.length ? '\n\n📅 ' + occ.events.join('، ') + (occ.holiday ? ' — تعطیله' : '') : '';
    post = '☀️ صبح بخیر\n\n' + t.fa + hi + '\n\nامیدوارم امروزت پر از چیزهای خوب باشه. یادت باشه لازم نیست همه‌چیز بینقص باشه؛ همین که شروع کنی کافیه.\n\n✅ یه کار کوچیک برای امروزت: پنج دقیقه به خودت وقت بده، بدون گوشی.';
  }
  post = post.replace(/^```[a-z]*\n?|```$/g, '').trim();
  var r = publishToChannel(post, !CFG.WITH_SIGNATURE);
  props.setProperty('lastPostKey', t.key);
  props.setProperty('lastPostLink', r.link || '');
  Logger.log('✅ منتشر شد: ' + (r.link || r.message_id));
  notifyOwner('✅ پست صبح امروز منتشر شد:\n' + (r.link || '') + '\n\n' + post.slice(0, 300));
  return r;
}
function postNow() { return generateMorningPost(true); }          // تست دستی همین حالا
function installDailyTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('generateMorningPost').timeBased().atHour(7).nearMinute(5).everyDays(1).inTimezone('Asia/Tehran').create();
  Logger.log('⏰ فعال شد: هر روز ~۷:۰۵ صبح به وقت تهران.');
}
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (tr) { ScriptApp.deleteTrigger(tr); });
  Logger.log('⛔ همهٔ زمان‌بندی‌ها حذف شد.');
}
function doctor() {
  var t = todayInfo(), occ = occasionsFor(0);
  Logger.log('تاریخ: ' + t.fa + ' | ' + t.g);
  Logger.log('مناسبت امروز: ' + (occ.events.length ? occ.events.join('، ') : 'خاصی نیست'));
  Logger.log('کلید جمنای: ' + (CFG.GEMINI_KEY.indexOf('PUT_') === 0 ? '❌ تنظیم نشده' : '✅ تنظیم شده'));
  Logger.log('کانال مقصد: ' + CFG.CHANNEL + ' | امضا: ' + (CFG.WITH_SIGNATURE ? 'دارد (رایگان)' : 'ندارد (۱ اعتبار)'));
  try { rasaToken(); Logger.log('اتصال به رِسا: ✅'); } catch (e) { Logger.log('اتصال به رِسا: ❌ ' + e.message); }
}

/* ── ۷) شیم اجرای محلی (در Apps Script نادیده گرفته می‌شود) ─────────────── */
if (typeof Utilities === 'undefined' && typeof require === 'function') {
  var __crypto = require('node:crypto');
  var __cp = require('node:child_process');
  var __bytes = function (b) { var a = []; for (var i = 0; i < b.length; i += 1) a.push(b[i] > 127 ? b[i] - 256 : b[i]); return a; };
  globalThis.Utilities = {
    computeHmacSha256Signature: function (value, key) {
      var h = __crypto.createHmac('sha256', typeof key === 'string' ? key : Buffer.from(__bytes(key)));
      return __bytes(h.update(typeof value === 'string' ? value : Buffer.from(__bytes(value))).digest());
    }
  };
  globalThis.UrlFetchApp = {
    fetch: function (url, opts) {
      opts = opts || {};
      var args = ['-sS', '-X', String(opts.method || 'get').toUpperCase()];
      var headers = opts.headers || {};
      if (opts.contentType) headers['content-type'] = opts.contentType;
      Object.keys(headers).forEach(function (k) { args.push('-H', k + ': ' + headers[k]); });
      if (opts.payload) args.push('--data-binary', '@-');
      args.push(url);
      var cmd = 'curl ' + args.map(function (a) { return "'" + String(a).replace(/'/g, "'\\''") + "'"; }).join(' ');
      var out = __cp.execSync(cmd, { input: opts.payload || undefined, encoding: 'utf8', maxBuffer: 1e7 });
      return { getContentText: function () { return out; }, getResponseCode: function () { return 200; } };
    }
  };
  var __props = {};
  globalThis.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return __props[k] || null; }, setProperty: function (k, v) { __props[k] = v; } }; } };
  globalThis.Logger = { log: function () { console.log(Array.prototype.join.call(arguments, ' ')); } };
  globalThis.ScriptApp = { newTrigger: function () { throw new Error('تریگر فقط در Apps Script'); }, getProjectTriggers: function () { return []; } };
  if (process.env.RASA_BOT_TOKEN) CFG.BOT_TOKEN = process.env.RASA_BOT_TOKEN;   // تست محلی
  if (process.env.RASA_CHANNEL) CFG.CHANNEL = process.env.RASA_CHANNEL;
  CFG.NOTIFY = false;                                                            // در تست محلی پیام نده
  var __cmd = process.argv[2];
  if (__cmd === 'doctor') doctor();
  else if (__cmd === 'prompt') { var t0 = todayInfo(); Logger.log(buildPrompt(t0, occasionsFor(0), occasionsFor(1))); }
  else if (__cmd === 'postnow') { CFG.NOTIFY = false; generateMorningPost(true); }
  else if (__cmd === 'publish') { CFG.NOTIFY = false; var r0 = publishToChannel(process.argv[3], false); Logger.log('لینک: ' + r0.link + ' | آیدی: ' + r0.message_id); }
  else Logger.log('دستورها: doctor | prompt | postnow | publish "متن"');
}
