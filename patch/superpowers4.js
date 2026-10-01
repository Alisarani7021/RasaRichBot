/* ═══════════════════════════════════════════════════════════════════════════
   b46 — «ربات حتی بدون هوش مصنوعی هم کار می‌کند»
   • پاسخ‌های آماده (سلام/قیمت/آمار/مناسبت/انتشار دستی با /post)
   • خطای فارسی انسانی + منوی دکمه‌ها وقتی مغز از سهمیه افتاد
   ═══════════════════════════════════════════════════════════════════════════ */

function spIsQuotaErr(e) {
  var m = String((e && (e.message || e.error)) || e || '');
  return /neuron|daily free|allocation|quota|rate limit|capacity|4006|1101|1102|429/i.test(m);
}
function spQuotaHuman() {
  return '🧠 سهمیهٔ امروزِ هوش مصنوعی این حساب (کلادفلر) تمام شده — خودش **نیمه‌شب UTC یعنی ۳:۳۰ بامداد تهران** ریست می‌شود.\n\nولی این‌ها همین الان بدون هوش مصنوعی کار می‌کنند:\n• «قیمت دلار» / «قیمت طلا» / «قیمت بیت‌کوین» — قیمت زندهٔ بازار\n• «آمار» — آمار کانال · «مناسبت» — مناسبت امروز\n• «/post متن دلخواه» — انتشار مستقیم متن خودت در کانال\n• دکمه‌های زیر (استودیو، طراحی دستی، پخش زنده)\n\nبرای هوش مصنوعیِ نامحدود هم پلن ۵ دلاری Workers Paid روی حساب خودت قفلش را باز می‌کند.';
}
async function spSendMenu(env, uid, intro) {
  try {
    await cmdTg(env, 'sendMessage', { chat_id: uid, text: intro || '👇 دسترسی سریع:', reply_markup: typeof getStartKeyboard === 'function' ? getStartKeyboard(spBase(env)) : undefined });
  } catch (e) { }
}
async function spCmdFallback(env, message, e) {
  var uid = Number((message.chat && message.chat.id) || 0);
  if (!uid) return;
  var quota = spIsQuotaErr(e);
  var head = quota ? spQuotaHuman() : ('⚠️ یک خطای موقت پیش آمد:\n`' + String((e && e.message) || e).slice(0, 160).replace(/`/g, '') + '`\n\nدوباره امتحان کن؛ اگر تکرار شد بگو «خطا».');
  try { await cmdSay(env, uid, head); } catch (e2) { }
  if (quota) { await spSendMenu(env, uid, '👇 همهٔ کارهای زیر همین الان بدون هوش مصنوعی کار می‌کنند:'); }
}

/* ── پاسخ‌های آماده (بدون هوش مصنوعی) ────────────────────────────────────── */
async function spCmdFast(env, message, user, text) {
  var uid = Number((user && user.id) || 0);
  var raw = String(text || '').trim();
  if (uid && raw) {
    /* /post متن دلخواه → انتشار مستقیم، بدون AI */
    var pm = raw.match(/^\/post\s+([\s\S]+)/);
    if (pm) {
      var body = pm[1].trim();
      if (body.length < 2) { await cmdSay(env, uid, 'بعد از /post متن پست را بنویس. مثال:\n/post سلام به همهٔ اعضای کانال 🌟'); return true; }
      var chan = await spChannel(env, uid);
      if (!chan) { await cmdSay(env, uid, 'اول کانال را ثبت کن: /channel @نام‌کانال'); return true; }
      var jr = await spPublish(env, uid, chan, body);
      await cmdSay(env, uid, jr && jr.ok ? ('✅ منتشر شد' + (jr.link ? ': ' + jr.link : '')) : ('⚠️ منتشر نشد: ' + ((jr && jr.error) || 'نامشخص')));
      return true;
    }
  }
  if (!raw || raw.charAt(0) === '/' || raw.length > 90) return false;
  var norm = raw.replace(/[\u200c\u200f\u200e]/g, ' ').replace(/[؟?!.،]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  /* سلام و احوال‌پرسی */
  if (/^(سلام علیکم|سلام|درود|هی|های|خوبی|چطوری|چه خبر|صبح بخیر|ظهر بخیر|عصر بخیر|شب بخیر|ممنون|مرسی|دستت درد نکنه|thanks|thank you|hi|hello|hey)(?:\s|$)/.test(norm)) {
    await cmdSay(env, uid, 'سلام! 👋 در خدمتم.\n\nهمین حالا میتوانی:\n• «قیمت دلار» یا «قیمت طلا» یا «قیمت بیت‌کوین»\n• «آمار» — وضعیت کانال\n• «مناسبت» — مناسبت امروز\n• «/post متن دلخواه» — مستقیم در کانال منتشر می‌کنم\n• یا از دکمه‌های زیر استفاده کنی');
    await spSendMenu(env, uid, '👇 دسترسی سریع:');
    return true;
  }

  /* قیمت بازار */
  var mq = norm.match(/(?:قیمت|نرخ|چند(?:ه| است)?)\s*(دلار|یورو|پوند|درهم|لیر|یوان|مثقال|گرم طلا|طلا ۱۸|طلا|سکه|نیم سکه|ربع سکه|بیت ?کوین|اتریوم|تتر|دوج ?کوین|ریپل|سولانا|تون ?کوین|usd|eur|btc|eth|usdt|xrp|doge|sol|ton|bnb)/i);
  if (mq) {
    try {
      var res = await spTool(env, uid, 'market', { asset: mq[1] }, { chatId: uid });
      await cmdSay(env, uid, res && res.ok ? ('💹 ' + res.asset + ': **' + res.text + '**' + (res.updated_at ? '  (' + res.updated_at + ')' : '') + '\nمنبع: tgju.org') : ('⚠️ ' + ((res && res.error) || 'قیمت پیدا نشد')));
    } catch (e) { await cmdSay(env, uid, '⚠️ الان قیمت را نگرفتم، یک لحظه بعد دوباره بپرس.'); }
    return true;
  }

  /* آمار کانال */
  if (/^(آمار|آمار کانال|وضعیت کانال|گزارش|وضعیت)\s*$/.test(norm)) {
    try {
      var st = await cmdTool(env, uid, 'get_stats', {}, { tg: createTelegram(env, cfg(env)), chatId: uid, channel: await spChannel(env, uid) });
      var s2 = (st && st.stats) || {};
      await cmdSay(env, uid, '📊 کانال ' + ((st && st.channel) || '') + '\n• امروز: ' + (s2.posts || 0) + ' پست، ' + (s2.views || 0) + ' بازدید\n• دیروز: ' + (s2.postsY || 0) + ' پست، ' + (s2.viewsY || 0) + ' بازدید\n• بهترین پست: #' + ((s2.top3 && s2.top3[0] && s2.top3[0].id) || '—'));
    } catch (e) { await cmdSay(env, uid, '⚠️ آمار الان در دسترس نیست.'); }
    return true;
  }

  /* مناسبت */
  if (/^(مناسبت|مناسبت امروز|مناسبت فردا|امروز چه روزیه|today)\s*$/.test(norm)) {
    try {
      var oc = await cmdTool(env, uid, 'get_occasions', {}, { tg: createTelegram(env, cfg(env)), chatId: uid, channel: await spChannel(env, uid) });
      var list = (oc && (oc.today || oc.occasions)) || [];
      var names = (Array.isArray(list) ? list : []).map(function (x) { return (x && (x.title || x.d || x.name)) || ''; }).filter(Boolean).slice(0, 5);
      await cmdSay(env, uid, names.length ? ('🎉 مناسبت‌ها: ' + names.join('، ')) : 'امروز مناسبت خاصی پیدا نکردم.');
    } catch (e) { await cmdSay(env, uid, '⚠️ مناسبت‌ها الان در دسترس نیست.'); }
    return true;
  }
  return false;
}
