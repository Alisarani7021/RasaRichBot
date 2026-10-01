/* ═══════════════════════════════════════════════════════════════════════════
   قدرت‌های نسل بعد (b43) — رسانه، کنترل کانال، ترجمه، قیمت بازار،
   خبرخوان RSS، تکرارشونده، رصد، صف تأیید، گزارش هفتگی، ایده، آرشیو، تیتر.
   همه از دو مسیر: چت/ویس ربات و MCP (جمنای/کلاد).
   ═══════════════════════════════════════════════════════════════════════════ */

var SP_STYLES = {
  cinematic: 'cinematic film still, dramatic lighting, shallow depth of field, 35mm, highly detailed',
  neon: 'neon cyberpunk lighting, glowing accents, night city, vivid colors, high contrast',
  minimal: 'minimalist composition, generous negative space, soft light, clean aesthetic',
  watercolor: 'watercolor painting, soft washes, paper texture, artistic',
  '3d': '3d render, octane render, soft studio lighting, polished, depth of field',
  retro: 'retro vintage look, film grain, 1970s palette, nostalgic',
  dark: 'moody dark atmosphere, low key lighting, cinematic contrast'
};
var SP_MARKET_FA = {
  dollar: ['price_dollar_rl', 'دلار', '{v} تومان'],
  usd: ['price_dollar_rl', 'دلار', '{v} تومان'],
  'دلار': ['price_dollar_rl', 'دلار', '{v} تومان'],
  euro: ['price_eur', 'یورو', '{v} تومان'],
  'یورو': ['price_eur', 'یورو', '{v} تومان'],
  gold: ['geram18', 'طلای ۱۸عیار (گرم)', '{v} تومان'],
  'طلا': ['geram18', 'طلای ۱۸عیار (گرم)', '{v} تومان'],
  mesghal: ['mesghal', 'مثقال طلا', '{v} تومان'],
  coin: ['sekee', 'سکهٔ امامی', '{v} تومان'],
  'سکه': ['sekee', 'سکهٔ امامی', '{v} تومان'],
  nim: ['nim', 'سکهٔ نیم', '{v} تومان'],
  rob: ['rob', 'سکهٔ ربع', '{v} تومان'],
  btc: ['crypto-bitcoin', 'بیت‌کوین', '{v} دلار'],
  bitcoin: ['crypto-bitcoin', 'بیت‌کوین', '{v} دلار'],
  eth: ['crypto-ethereum', 'اتریوم', '{v} دلار'],
  'اتریوم': ['crypto-ethereum', 'اتریوم', '{v} دلار'],
  doge: ['crypto-dogecoin', 'دوج‌کوین', '{v} دلار'],
  'دوج‌کوین': ['crypto-dogecoin', 'دوج‌کوین', '{v} دلار'],
  xrp: ['crypto-ripple', 'ریپل', '{v} دلار'],
  'ریپل': ['crypto-ripple', 'ریپل', '{v} دلار'],
  sol: ['crypto-solana', 'سولانا', '{v} دلار'],
  'سولانا': ['crypto-solana', 'سولانا', '{v} دلار'],
  ton: ['crypto-toncoin', 'تون‌کوین', '{v} دلار'],
  bnb: ['crypto-binance-coin', 'بایننس‌کوین', '{v} دلار'],
  'یوان': ['price_cny', 'یوان چین', '{v} تومان'],
  ethereum: ['crypto-ethereum', 'اتریوم', '{v} دلار'],
  usdt: ['crypto-tether', 'تتر', '{v} دلار'],
  'تتر': ['crypto-tether', 'تتر', '{v} دلار'],
  'تتر تومانی': ['crypto-tether-irr', 'تتر (تومان)', '{v} تومان'],
  'بیت کوین': ['crypto-bitcoin', 'بیت‌کوین', '{v} دلار'],
  'بیتكوين': ['crypto-bitcoin', 'بیت‌کوین', '{v} دلار'],
  gbp: ['price_gbp', 'پوند', '{v} تومان'],
  'پوند': ['price_gbp', 'پوند', '{v} تومان'],
  aed: ['price_aed', 'درهم امارات', '{v} تومان'],
  'درهم': ['price_aed', 'درهم امارات', '{v} تومان'],
  try_: ['price_try', 'لیر ترکیه', '{v} تومان'],
  'لیر': ['price_try', 'لیر ترکیه', '{v} تومان'],
  'یوان': ['price_cny', 'یوان چین', '{v} تومان'],
  'مثقال': ['mesghal', 'مثقال طلا', '{v} تومان'],
  'طلا 18': ['geram18', 'طلای ۱۸عیار (گرم)', '{v} تومان'],
  'گرم طلا': ['geram18', 'طلای ۱۸عیار (گرم)', '{v} تومان'],
  'سکه امامی': ['sekee', 'سکهٔ امامی', '{v} تومان'],
  'نیم سکه': ['nim', 'سکهٔ نیم', '{v} تومان'],
  'ربع سکه': ['rob', 'سکهٔ ربع', '{v} تومان']
};

function spStripTags(s) {
  return String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); }).replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function spInlineMd(md) {
  return String(md || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n{3,}/g, '\n\n');
}
async function spChannel(env, uid) {
  var store = new Store(rasaEnv(env), cfg(env));
  return await store.get('cmd:chan:' + uid, null) || await store.get('cmd:chan:shared', null) || String(env.CMD_CHANNEL || '').trim();
}
async function spPublish(env, uid, target, markdown) {
  var store = new Store(rasaEnv(env), cfg(env));
  var tg = createTelegram(env, cfg(env));
  var html = HTML_TAG_RE.test(markdown) ? mixedToHtml(markdown) : mdToHtml(markdown);
  var out = await publishNow(tg, target, { html: html }, uid, null, store, false);
  var jr = out && typeof out.json === 'function' ? await out.json() : out;
  if (jr && jr.ok) await store.put('cmd:last:' + uid, { target: target, message_id: jr.message_id, link: jr.link || '', at: Date.now(), kind: 'text' });
  return jr || { ok: false, error: 'publish failed' };
}
async function spNotify(env, uid, text) { try { return await cmdSay(env, uid, text); } catch (e) { return null; } }
function spTehran() { return tehranDate(); }
function spClock(d) { return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); }

/* ── رسانهٔ ارسالی مالک (عکس/ویدیو/فایل) ─────────────────────────────────── */
function spMediaFromMessage(message) {
  if (message.photo && message.photo.length) {
    var ps = message.photo[message.photo.length - 1];
    return { kind: 'photo', fid: ps.file_id, w: ps.width, h: ps.height };
  }
  if (message.video) return { kind: 'video', fid: message.video.file_id, w: message.video.width, h: message.video.height };
  if (message.document) return { kind: 'document', fid: message.document.file_id, name: message.document.file_name || 'file' };
  return null;
}
async function spCaptureMedia(env, message) {
  var m = spMediaFromMessage(message);
  if (!m) return null;
  var store = new Store(rasaEnv(env), cfg(env));
  var uid = Number(message.from && message.from.id || 0);
  var box = await store.get('sp:media:' + uid, { items: [] });
  m.at = Date.now();
  m.cap = String(message.caption || '').slice(0, 900);
  box.items = [m].concat(box.items || []).slice(0, 10);
  await store.put('sp:media:' + uid, box, 30 * 86400);
  return m;
}

/* ── RSS ─────────────────────────────────────────────────────────────────── */
function spXmlItems(xml) {
  var out = [];
  var blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (var i = 0; i < blocks.length; i += 1) {
    var b = blocks[i];
    var t = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    var l = (b.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i) || [])[1] || (b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '';
    var d = (b.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || (b.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] || '';
    var g = (b.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] || l;
    var title = spStripTags(t);
    if (!title) continue;
    out.push({ title: title, link: spStripTags(l) || String(l).trim(), desc: spStripTags(d).slice(0, 800), guid: spStripTags(g).slice(0, 200) || title });
    if (out.length >= 15) break;
  }
  return out;
}
async function spFetchText(url, ms) {
  var ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, ms || 9000);
  try {
    var r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; RasaBot/1.0)' } });
    return { ok: r.ok, status: r.status, text: (await r.text()).slice(0, 400000) };
  } catch (e) { return { ok: false, status: 0, text: '', error: String(e && e.message || e) }; }
  finally { clearTimeout(timer); }
}
async function spHash(text) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text).slice(0, 100000)));
  return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, 24);
}

/* ── ابزارها ─────────────────────────────────────────────────────────────── */
async function spTool(env, uid, name, args, ctx) {
  var store = new Store(rasaEnv(env), cfg(env));
  var tg = ctx.tg || createTelegram(env, cfg(env));
  var chan = ctx.channel || await spChannel(env, uid);

  /* — عکس با استایل — */
  if (name === 'make_image') {
    var st = String(args.style || '').toLowerCase().trim();
    var prompt = String(args.prompt || '').slice(0, 500);
    if (st && SP_STYLES[st]) prompt += ', ' + SP_STYLES[st];
    var b64 = '';
    try { b64 = await cmdAiImage(env, prompt); }
    catch (e) { return { ok: false, error: (typeof spQuotaErr === 'function' && spQuotaErr(e)) || ('عکس ساخته نشد: ' + String(e && e.message || e).slice(0, 120)) }; }
    var fid2 = '';
    try { var up = await cmdSendPhoto(env, ctx.chatId || uid, b64, '🖼 پیش‌نمایش عکس' + (st && SP_STYLES[st] ? ' (استایل: ' + st + ')' : '') + ' — اگر خوبه بگو بذارم تو کانال'); fid2 = up.file_id || ''; } catch (e) {}
    if (fid2) await store.put('cmd:img:' + uid, { file_id: fid2, at: Date.now(), prompt: prompt.slice(0, 200) });
    return { ok: true, file_id: fid2, b64: b64, style: st || 'none', prompt: prompt.slice(0, 200) };
  }

  /* — انتشار رسانهٔ مالک — */
  if (name === 'publish_media') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var box = await store.get('sp:media:' + uid, { items: [] });
    var items = box.items || [];
    var pick = null;
    if (args.url && /^https?:\/\//.test(String(args.url))) pick = { kind: 'photo', fid: String(args.url), fromUrl: true };
    else if (args.index !== undefined) pick = items[Number(args.index) || 0] || null;
    else pick = items[0] || null;
    if (!pick) return { ok: false, error: 'رسانه‌ای پیدا نشد؛ اول عکس/ویدیو را در پیوی ربات بفرست' };
    var caption = String(args.caption || pick.cap || '').trim();
    var ip = {}; if (caption) { ip.caption = spInlineMd(caption).slice(0, 1000); ip.parse_mode = 'HTML'; }
    var method = pick.kind === 'video' ? 'sendVideo' : pick.kind === 'document' ? 'sendDocument' : 'sendPhoto';
    var field = pick.kind === 'video' ? 'video' : pick.kind === 'document' ? 'document' : 'photo';
    var payload = { chat_id: chan }; payload[field] = pick.fid;
    Object.assign(payload, ip);
    var sent = await cmdTg(env, method, payload);
    await store.put('cmd:last:' + uid, { target: chan, message_id: sent.message_id, at: Date.now(), kind: 'media' });
    return { ok: true, kind: pick.kind, message_id: sent.message_id, link: 'https://t.me/' + String(chan).replace('@', '') + '/' + sent.message_id };
  }
  if (name === 'album') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var boxA = await store.get('sp:media:' + uid, { items: [] });
    var list = (boxA.items || []).filter(function (x) { return x.kind !== 'document'; }).slice(0, Number(args.count || 10));
    var urls = Array.isArray(args.urls) ? args.urls.filter(function (u) { return /^https?:\/\//.test(String(u)); }) : [];
    var media = urls.length ? urls.map(function (u) { return { type: 'photo', media: u }; })
      : list.map(function (x) { return { type: x.kind === 'video' ? 'video' : 'photo', media: x.fid }; });
    if (media.length < 2) return { ok: false, error: 'برای آلبوم حداقل ۲ عکس لازم است (در پیوی ربات بفرست)' };
    var cap = String(args.caption || '').trim();
    if (cap) { media[0].caption = spInlineMd(cap).slice(0, 1000); media[0].parse_mode = 'HTML'; }
    var grp = await cmdTg(env, 'sendMediaGroup', { chat_id: chan, media: media });
    var firstId = Array.isArray(grp) && grp[0] ? grp[0].message_id : 0;
    if (firstId) await store.put('cmd:last:' + uid, { target: chan, message_id: firstId, at: Date.now(), kind: 'album' });
    return { ok: true, count: media.length, message_id: firstId };
  }

  /* — کنترل کانال — */
  if (name === 'delete_post') {
    var mid = Number(args.message_id || (args.last ? ((await store.get('cmd:last:' + uid, {}) || {}).message_id || 0) : 0));
    if (!mid) return { ok: false, error: 'شمارهٔ پیام لازم است' };
    await tg.deleteMessage(chan, mid);
    return { ok: true, deleted: mid };
  }
  if (name === 'replace_last') {
    var last = await store.get('cmd:last:' + uid, null);
    var md2 = String(args.text || '').trim();
    if (!md2) return { ok: false, error: 'متن تازه لازم است' };
    if (last && last.message_id) { try { await tg.deleteMessage(last.target || chan, last.message_id); } catch (e) {} }
    var img = await store.get('cmd:img:' + uid, null);
    var html2 = HTML_TAG_RE.test(md2) ? mixedToHtml(md2) : mdToHtml(md2);
    if (args.keep_image !== false && img && img.file_id) html2 = '<img src="tg://photo?id=' + img.file_id + '"/>' + html2;
    var out2 = await publishNow(tg, chan, { html: html2 }, uid, null, store, false);
    var jr2 = out2 && typeof out2.json === 'function' ? await out2.json() : out2;
    if (jr2 && jr2.ok) await store.put('cmd:last:' + uid, { target: chan, message_id: jr2.message_id, link: jr2.link || '', at: Date.now() });
    return jr2 || { ok: false, error: 'جایگزینی ناموفق' };
  }
  if (name === 'pin_post') {
    var pmid = Number(args.message_id || ((await store.get('cmd:last:' + uid, {}) || {}).message_id || 0));
    if (!pmid) return { ok: false, error: 'شمارهٔ پیام لازم است' };
    await cmdTg(env, 'pinChatMessage', { chat_id: chan, message_id: pmid, disable_notification: args.silent === true });
    return { ok: true, pinned: pmid };
  }
  if (name === 'unpin_post') {
    var umid = Number(args.message_id || ((await store.get('cmd:last:' + uid, {}) || {}).message_id || 0));
    if (umid) await cmdTg(env, 'unpinChatMessage', { chat_id: chan, message_id: umid });
    else await cmdTg(env, 'unpinAllChatMessages', { chat_id: chan });
    return { ok: true };
  }
  if (name === 'mute_user') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var tuid = Number(args.user_id || 0);
    if (!tuid) return { ok: false, error: 'user_id لازم است' };
    var mins = Number(args.minutes || 60);
    await cmdTg(env, 'restrictChatMember', {
      chat_id: chan, user_id: tuid,
      permissions: { can_send_messages: false, can_send_audios: false, can_send_documents: false, can_send_photos: false, can_send_videos: false, can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false },
      until_date: Math.floor(Date.now() / 1000) + mins * 60
    });
    return { ok: true, user_id: tuid, minutes: mins };
  }
  if (name === 'ban_user') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var buid = Number(args.user_id || 0);
    if (!buid) return { ok: false, error: 'user_id لازم است' };
    await cmdTg(env, 'banChatMember', { chat_id: chan, user_id: buid, revoke_messages: args.delete_messages === true });
    return { ok: true, banned: buid };
  }
  if (name === 'unban_user') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    await cmdTg(env, 'unbanChatMember', { chat_id: chan, user_id: Number(args.user_id || 0), only_if_banned: true });
    return { ok: true };
  }

  /* — ترجمه — */
  if (name === 'translate') {
    var txt = String(args.text || '').slice(0, 4000);
    if (!txt) return { ok: false, error: 'متن خالی است' };
    var to = ({ fa: 'fa', farsi: 'fa', فارسی: 'fa', en: 'en', english: 'en', انگلیسی: 'en', ar: 'ar', عربی: 'ar', tr: 'tr', ru: 'ru', de: 'de', fr: 'fr' })[String(args.to || 'fa').toLowerCase()] || 'fa';
    var src = ({ fa: 'fa', en: 'en' })[String(args.from || '').toLowerCase()] || 'en';
    var tr = null; var trErr = '';
    try {
      if (env.AI && typeof env.AI.run === 'function') tr = await env.AI.run('@cf/meta/m2m100-1.2b', { text: txt, source_lang: src, target_lang: to });
      else if (cmdConfig(env).brain) {
        var g = await fetch(cmdConfig(env).brain + '/run?k=' + encodeURIComponent(cmdConfig(env).brainKey), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: '@cf/meta/m2m100-1.2b', payload: { text: txt, source_lang: src, target_lang: to } })
        });
        var gj = null; try { gj = await g.json(); } catch (e3) { trErr = 'HTTP ' + g.status; }
        if (gj && gj.ok) { try { tr = JSON.parse(gj.text); } catch (e2) { tr = { translated_text: String(gj.text) }; } }
        else if (gj) trErr = String(gj.text || gj.error || 'خطای دروازه');
      }
    } catch (e) { tr = null; trErr = String(e && e.message || e); }
    var outTxt = tr && (tr.translated_text || tr.response || (typeof tr === 'string' ? tr : '')) || '';
    if (!outTxt) return { ok: false, error: (typeof spQuotaErr === 'function' && spQuotaErr({ message: trErr })) || ('ترجمه در دسترس نبود' + (trErr ? ': ' + trErr.slice(0, 100) : '')) };
    return { ok: true, to: to, from: src, text: String(outTxt).slice(0, 4000) };
  }

  /* — قیمت بازار — */
  if (name === 'market') {
    var want = String(args.asset || 'دلار').trim().toLowerCase();
    var g2 = await spFetchText('https://call1.tgju.org/ajax.json', 9000);
    if (!g2.ok || !g2.text) return { ok: false, error: 'منبع قیمت در دسترس نیست' };
    var data = null; try { data = JSON.parse(g2.text); } catch (e) { data = null; }
    if (!data || !data.current) return { ok: false, error: 'پاسخ منبع قیمت ناخوانا بود' };
    function pick2(key) {
      var row = data.current[key];
      if (row && row.p) return { raw: String(row.p), at: String(row.t_en || row.t || '') };
      var alt = data.current[key + '-sell'] || data.current[key + '-buy'];
      return alt && alt.p ? { raw: String(alt.p), at: String(alt.t_en || alt.t || '') } : null;
    }
    if (want === 'all' || want === 'همه') {
      var many = ['price_dollar_rl', 'price_eur', 'geram18', 'sekee', 'crypto-bitcoin', 'crypto-ethereum', 'crypto-tether', 'mesghal', 'nim', 'rob', 'price_gbp', 'price_aed'];
      var rows = [];
      for (var i2 = 0; i2 < many.length; i2 += 1) {
        var p2 = pick2(many[i2]);
        if (p2) rows.push({ asset: many[i2], value: p2.raw, at: p2.at });
      }
      return { ok: true, updated_at: (rows[0] && rows[0].at) || '', rows: rows, source: 'tgju.org' };
    }
    var map = SP_MARKET_FA[want];
    if (!map) {
      var nrm = function (x) { return String(x || '').replace(/[\u200c\u200e\u200f\sـ]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase(); };
      var nw = nrm(want);
      for (var kk in SP_MARKET_FA) { if (nrm(kk) === nw) { map = SP_MARKET_FA[kk]; break; } }
      if (!map) {
        var cands = [nw, nw.replace(/^قیمت/, ''), nw.replace(/^(قیمت|نرخ)/, '')];
        for (var ci = 0; ci < cands.length && !map; ci += 1) {
          for (var kk2 in SP_MARKET_FA) { if (nrm(kk2).indexOf(cands[ci]) > -1 && cands[ci].length > 2) { map = SP_MARKET_FA[kk2]; break; } }
        }
      }
    }
    var key2 = map ? map[0] : String(args.asset || '').trim();
    var hit = pick2(key2) || pick2('crypto-' + want) || pick2(want + '-irr') || pick2('price_' + want);
    if (!hit) return { ok: false, error: 'برای «' + args.asset + '» قیمتی پیدا نکردم (مثل: دلار، طلا، سکه، یورو، بیتکوین)' };
    var label = map ? map[1] : want;
    var fmt = map ? map[2] : '{v}';
    var nice = String(hit.raw).replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    return { ok: true, asset: label, value: String(hit.raw), text: fmt.replace('{v}', nice), updated_at: hit.at, source: 'tgju.org' };
  }

  /* — صدا (انگلیسی) — */
  if (name === 'make_voice') {
    var vt = String(args.text || '').slice(0, 600);
    if (!vt) return { ok: false, error: 'متن خالی است' };
    var audioB64 = ''; var vErr = '';
    try {
      var vr = null;
      if (env.AI && typeof env.AI.run === 'function') vr = await env.AI.run('@cf/myshell-ai/melotts', { prompt: vt, lang: 'en' });
      else if (cmdConfig(env).brain) {
        var vg = await fetch(cmdConfig(env).brain + '/run?k=' + encodeURIComponent(cmdConfig(env).brainKey), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: '@cf/myshell-ai/melotts', payload: { prompt: vt, lang: 'en' } }) });
        var vj = null; try { vj = await vg.json(); } catch (e4) { vErr = 'HTTP ' + vg.status; }
        if (vj && vj.ok) { try { vr = JSON.parse(vj.text); } catch (e3) { vr = { audio: vj.text }; } }
        else if (vj) vErr = String(vj.error || vj.text || 'خطای دروازه');
      }
      audioB64 = vr && (vr.audio || '') || '';
      if (!audioB64 && vr && typeof vr === 'string') audioB64 = vr;
    } catch (e) { audioB64 = ''; vErr = String(e && e.message || e); }
    if (!audioB64) return { ok: false, error: (typeof spQuotaErr === 'function' && spQuotaErr({ message: vErr })) || ('ساخت صدا در دسترس نبود' + (vErr ? ': ' + vErr.slice(0, 90) : '')) };
    var bytes = Uint8Array.from(atob(audioB64), function (c) { return c.charCodeAt(0); });
    var fd2 = new FormData();
    fd2.append('chat_id', String(ctx.chatId || uid));
    if (args.caption) fd2.append('caption', String(args.caption).slice(0, 900));
    fd2.append('voice', new Blob([bytes], { type: 'audio/ogg' }), 'voice.ogg');
    await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/sendVoice', { method: 'POST', body: fd2 });
    return { ok: true, note: 'صدا ساخته و به پیوی فرستاده شد (فقط انگلیسی)' };
  }

  /* — صف تأیید — */
  if (name === 'draft_post') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var dtext = String(args.text || '').trim();
    if (!dtext) return { ok: false, error: 'متن خالی است' };
    var did = 'd' + Date.now().toString(36);
    var useImg = args.with_image === true;
    await store.put('sp:draft:' + uid + ':' + did, { text: dtext, target: chan, with_image: useImg, at: Date.now() }, 3 * 86400);
    var preview = await cmdSay(env, ctx.chatId || uid, '📝 <b>پیش‌نویس آماده است</b>\n\n' + spInlineMd(dtext).slice(0, 3000));
    try {
      await cmdTg(env, 'editMessageReplyMarkup', { chat_id: ctx.chatId || uid, message_id: preview.message_id, reply_markup: { inline_keyboard: [[{ text: '✅ تأیید و انتشار', callback_data: 'sp:ok:' + did }, { text: '❌ رد', callback_data: 'sp:no:' + did }]] } });
    } catch (e) { /* دکمه لازم نیست؛ brain می‌تواند publish_post بزند */ }
    return { ok: true, draft_id: did, note: 'پیش‌نویس به پیوی مالک رفت؛ با دکمهٔ ✅ منتشر می‌شود (اگر دکمه نبود، بگو منتشر کن)' };
  }
  if (name === 'publish_draft') {
    var pid = String(args.draft_id || '');
    var d2 = pid ? await store.get('sp:draft:' + uid + ':' + pid, null) : null;
    if (!d2) return { ok: false, error: 'پیش‌نویس پیدا نشد' };
    var img2 = await store.get('cmd:img:' + uid, null);
    var htmlD = HTML_TAG_RE.test(d2.text) ? mixedToHtml(d2.text) : mdToHtml(d2.text);
    if (d2.with_image && img2 && img2.file_id) htmlD = '<img src="tg://photo?id=' + img2.file_id + '"/>' + htmlD;
    var outD = await publishNow(tg, d2.target || chan, { html: htmlD }, uid, null, store, false);
    var jrD = outD && typeof outD.json === 'function' ? await outD.json() : outD;
    if (jrD && jrD.ok) await store.put('sp:draft:' + uid + ':' + pid, null);
    return jrD || { ok: false, error: 'انتشار ناموفق' };
  }

  /* — گزارش هفتگی — */
  if (name === 'weekly_report') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var username = String(chan).replace('@', '');
    var st2 = await channelDayStats(env, tg, chan, username);
    var posts = await tgPublicPosts(username, 3);
    var week = (posts || []).filter(function (p) { return Date.now() - (p.at || 0) < 7 * 864e5; });
    var totalViews = week.reduce(function (a, p) { return a + (p.views || 0); }, 0);
    var best = week.slice().sort(function (a, b) { return (b.views || 0) - (a.views || 0); })[0] || null;
    var byHour = {};
    week.forEach(function (p) { var h = new Date((p.at || 0) + 126e5).getUTCHours(); byHour[h] = (byHour[h] || 0) + (p.views || 0); });
    var bestHour = Object.keys(byHour).sort(function (a, b) { return byHour[b] - byHour[a]; })[0];
    var cnt = (st2 && (st2.postsY || 0)) + (st2 && (st2.postsYY || 0)) || 0;
    return {
      ok: true, channel: chan, week_posts: week.length, week_views: totalViews, scan_limit: (posts || []).length,
      best_post: best ? { id: best.id, views: best.views, title: String(best.title || best.snippet || '').slice(0, 90) } : null,
      best_hour_tehran: bestHour !== undefined ? bestHour + ':00' : null,
      yesterday: st2 ? { posts: st2.postsY, views: st2.viewsY } : null,
      tip: bestHour !== undefined ? 'بهترین ساعت انتشار ~' + bestHour + ':00 به وقت تهران است' : 'هنوز داده کافی نیست'
    };
  }

  /* — ایده — */
  if (name === 'suggest') {
    var topic = String(args.topic || '').slice(0, 120);
    var occ = await occasionsFor(env, jalaliOf(tehranDate()));
    var ranked = occRank(occ, 3).map(function (e) { return e.d; });
    var prompt = 'برای کانال تلگرامی من ' + (topic ? 'با موضوع «' + topic + '» ' : '') + 'پنج ایدهٔ پست بده. ' +
      (ranked.length ? 'مناسبت امروز: ' + ranked.join('، ') + '. ' : '') +
      'هر ایده: یک تیتر جذاب + یک خط توضیح + نوع پست (متنی/عکس‌دار). فارسی، خلاصه، شماره‌دار. بدون مقدمه.';
    var ideas = await cmdBrain(env, [{ role: 'user', content: prompt }], 700);
    return { ok: true, ideas: String(ideas).slice(0, 3000), occasions: ranked };
  }

  /* — جست‌وجو در آرشیو — */
  if (name === 'search_archive') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var q = String(args.query || '').trim();
    if (!q) return { ok: false, error: 'عبارت جست‌وجو لازم است' };
    var posts2 = await tgPublicPosts(String(chan).replace('@', ''), 4);
    var hits = (posts2 || []).filter(function (p) { return (p.snippet || '').indexOf(q) > -1; }).slice(0, 5);
    return { ok: true, query: q, found: hits.length, results: hits.map(function (p) { return { id: p.id, views: p.views, text: String(p.snippet || '').slice(0, 140) }; }) };
  }

  /* — خبرخوان RSS — */
  if (name === 'rss_add') {
    var url = String(args.url || '').trim();
    if (!/^https?:\/\//.test(url)) return { ok: false, error: 'آدرس فید نامعتبر' };
    var tgt = String(args.target || chan || '').trim();
    if (!tgt) return { ok: false, error: 'کانال مقصد لازم است' };
    var rb = await store.get('sp:rss:' + uid, { items: [] });
    var item = {
      id: 'r' + Date.now().toString(36), url: url, target: tgt,
      every: Math.max(10, Math.min(1440, Number(args.every_minutes || 120))),
      rewrite: args.rewrite !== false, max: Math.max(1, Math.min(3, Number(args.max_per_run || 2))),
      lastRun: 0, lastErr: '', seen: 0
    };
    rb.items = [item].concat((rb.items || []).filter(function (x) { return x.url !== url; })).slice(0, 10);
    await store.put('sp:rss:' + uid, rb, 400 * 86400);
    var idx = await store.get('sp:ids', { uids: [] });
    idx.uids = Array.from(new Set((idx.uids || []).concat([uid]))).slice(0, 200);
    await store.put('sp:ids', idx, 400 * 86400);
    return { ok: true, id: item.id, every_minutes: item.every, rewrite: item.rewrite, note: 'از این به بعد هر ' + item.every + ' دقیقه خبرهای تازه منتشر می‌شود' };
  }
  if (name === 'rss_list') {
    var rl = await store.get('sp:rss:' + uid, { items: [] });
    return { ok: true, feeds: (rl.items || []).map(function (x) { return { id: x.id, url: x.url, every_minutes: x.every, rewrite: x.rewrite, lastErr: x.lastErr || null }; }) };
  }
  if (name === 'rss_remove') {
    var rr = await store.get('sp:rss:' + uid, { items: [] });
    var before = (rr.items || []).length;
    rr.items = (rr.items || []).filter(function (x) { return x.id !== String(args.id || ''); });
    await store.put('sp:rss:' + uid, rr);
    return { ok: true, removed: before - rr.items.length };
  }

  /* — تکرارشونده — */
  if (name === 'recurring_add') {
    var at = String(args.at || '07:00');
    if (!/^\d{1,2}:\d{2}$/.test(at)) return { ok: false, error: 'ساعت را مثل 07:30 بده' };
    var kind = args.kind === 'ai' ? 'ai' : 'text';
    var bodyT = String(args.text || args.prompt || '').trim();
    if (!bodyT) return { ok: false, error: 'متن یا پرامپت لازم است' };
    var rc = await store.get('sp:rec:' + uid, { items: [] });
    var ritem = { id: 'c' + Date.now().toString(36), at: at, kind: kind, text: bodyT.slice(0, 2000), target: String(args.target || chan || '').trim(), lastDay: '' };
    rc.items = [ritem].concat(rc.items || []).slice(0, 10);
    await store.put('sp:rec:' + uid, rc, 400 * 86400);
    var idx2 = await store.get('sp:ids', { uids: [] });
    idx2.uids = Array.from(new Set((idx2.uids || []).concat([uid]))).slice(0, 200);
    await store.put('sp:ids', idx2, 400 * 86400);
    return { ok: true, id: ritem.id, at: at, kind: kind, note: kind === 'ai' ? 'هر روز آن ساعت یک پست تازه با هوش مصنوعی نوشته و منتشر می‌شود' : 'هر روز آن ساعت همان متن منتشر می‌شود' };
  }
  if (name === 'recurring_list') {
    var rcl = await store.get('sp:rec:' + uid, { items: [] });
    return { ok: true, items: rcl.items || [] };
  }
  if (name === 'recurring_remove') {
    var rcr = await store.get('sp:rec:' + uid, { items: [] });
    var b2 = (rcr.items || []).length;
    rcr.items = (rcr.items || []).filter(function (x) { return x.id !== String(args.id || ''); });
    await store.put('sp:rec:' + uid, rcr);
    return { ok: true, removed: b2 - rcr.items.length };
  }

  /* — رصد — */
  if (name === 'watch_add') {
    var wurl = String(args.url || '').trim();
    if (!/^https?:\/\//.test(wurl)) return { ok: false, error: 'آدرس نامعتبر' };
    var wkind = args.kind === 'contains' ? 'contains' : 'changed';
    var wb = await store.get('sp:watch:' + uid, { items: [] });
    var witem = { id: 'w' + Date.now().toString(36), url: wurl, kind: wkind, value: String(args.value || '').slice(0, 200), note: String(args.note || '').slice(0, 400), post: args.post === true, target: String(args.target || chan || '').trim(), hash: '', lastRun: 0, hits: 0 };
    wb.items = [witem].concat(wb.items || []).slice(0, 10);
    await store.put('sp:watch:' + uid, wb, 400 * 86400);
    var idx3 = await store.get('sp:ids', { uids: [] });
    idx3.uids = Array.from(new Set((idx3.uids || []).concat([uid]))).slice(0, 200);
    await store.put('sp:ids', idx3, 400 * 86400);
    return { ok: true, id: witem.id, kind: wkind, note: 'هر ~۱۰ دقیقه چک می‌شود و اگر تغییر/شرط رخ داد خبرت می‌کنم' };
  }
  if (name === 'watch_list') {
    var wl = await store.get('sp:watch:' + uid, { items: [] });
    return { ok: true, items: (wl.items || []).map(function (x) { return { id: x.id, url: x.url, kind: x.kind, value: x.value, hits: x.hits, post: x.post }; }) };
  }
  if (name === 'watch_remove') {
    var wr = await store.get('sp:watch:' + uid, { items: [] });
    var b3 = (wr.items || []).length;
    wr.items = (wr.items || []).filter(function (x) { return x.id !== String(args.id || ''); });
    await store.put('sp:watch:' + uid, wr);
    return { ok: true, removed: b3 - wr.items.length };
  }

  /* — خوش‌آمد — */
  if (name === 'welcome_set') {
    var wtext = String(args.text || '').trim();
    if (!wtext && args.off !== true) return { ok: false, error: 'متن خوش‌آمد لازم است' };
    var wchat = String(args.chat || chan || '').trim();
    if (!wchat) return { ok: false, error: 'کانال/گروه لازم است' };
    if (args.off === true) {
      await store.put('sp:welcome:' + wchat, null);
      return { ok: true, off: true };
    }
    await store.put('sp:welcome:' + wchat, { text: wtext.slice(0, 1500), at: Date.now() }, 400 * 86400);
    return { ok: true, chat: wchat, note: 'از این به بعد عضو جدید که بیاید، این پیام فرستاده می‌شود ({name} = اسم عضو)' };
  }

  return null;
}

/* — دکمه‌های تأیید در پیوی مالک — */
async function spCallback(env, cb) {
  var data = String(cb && cb.data || '');
  if (data.indexOf('sp:') !== 0) return false;
  var parts = data.split(':');
  var action = parts[1], did = parts[2] || '';
  var uid = Number(cb.from && cb.from.id || 0);
  var store = new Store(rasaEnv(env), cfg(env));
  try {
    if (action === 'ok') {
      var d = await store.get('sp:draft:' + uid + ':' + did, null);
      if (!d) { await cmdTg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'پیش‌نویس منقضی شد' }); return true; }
      var tg = createTelegram(env, cfg(env));
      var img = await store.get('cmd:img:' + uid, null);
      var html = HTML_TAG_RE.test(d.text) ? mixedToHtml(d.text) : mdToHtml(d.text);
      if (d.with_image && img && img.file_id) html = '<img src="tg://photo?id=' + img.file_id + '"/>' + html;
      var out = await publishNow(tg, d.target, { html: html }, uid, null, store, false);
      var jr = out && typeof out.json === 'function' ? await out.json() : out;
      await store.put('sp:draft:' + uid + ':' + did, null);
      await cmdTg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: jr && jr.ok ? 'منتشر شد ✅' : 'خطا در انتشار' });
      try { await cmdTg(env, 'editMessageText', { chat_id: uid, message_id: cb.message && cb.message.message_id, text: (jr && jr.ok ? '✅ منتشر شد: ' + (jr.link || '') : '⚠️ انتشار ناموفق') }); } catch (e) {}
      if (jr && jr.ok) await store.put('cmd:last:' + uid, { target: d.target, message_id: jr.message_id, link: jr.link || '', at: Date.now() });
      return true;
    }
    if (action === 'no') {
      await store.put('sp:draft:' + uid + ':' + did, null);
      await cmdTg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'رد شد' });
      try { await cmdTg(env, 'editMessageText', { chat_id: uid, message_id: cb.message && cb.message.message_id, text: '❌ پیش‌نویس رد شد.' }); } catch (e) {}
      return true;
    }
  } catch (e) {
    try { await cmdTg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'خطا: ' + String(e.message || e).slice(0, 60) }); } catch (e2) {}
    return true;
  }
  return false;
}

/* — ورود عضو جدید — */
async function spChatMember(env, cm) {
  try {
    var st = cm && cm.new_chat_member && cm.new_chat_member.status;
    var old = cm && cm.old_chat_member && cm.old_chat_member.status;
    if (!st || (st !== 'member' && st !== 'restricted')) return false;
    if (old && old !== 'left' && old !== 'kicked') return false;
    var chat = cm.chat || {};
    var key = chat.username ? '@' + chat.username : String(chat.id);
    var store = new Store(rasaEnv(env), cfg(env));
    var cfgW = await store.get('sp:welcome:' + key, null) || await store.get('sp:welcome:' + chat.id, null);
    if (!cfgW || !cfgW.text) return false;
    var name = (cm.new_chat_member.user && (cm.new_chat_member.user.first_name || cm.new_chat_member.user.username)) || 'دوست تازه';
    await cmdTg(env, 'sendMessage', { chat_id: chat.id, text: spInlineMd(cfgW.text.replace(/\{name\}/g, name)) });
    return true;
  } catch (e) { return false; }
}

/* — تیک هر دقیقه: تکرارشونده + RSS + رصد ─────────────────────────────── */
async function spTick(env) {
  var store = new Store(rasaEnv(env), cfg(env));
  var idx = await store.get('sp:ids', { uids: [] });
  var uids = (idx.uids || []).slice(0, 200);
  if (!uids.length) return;
  var now = spTehran();
  var clock = spClock(now);
  var dayKey = now.getUTCFullYear() + '-' + pad2(now.getUTCMonth() + 1) + '-' + pad2(now.getUTCDate());

  for (var u = 0; u < uids.length; u += 1) {
    var uid = uids[u];
    var chan = await spChannel(env, uid);
    var tg = createTelegram(env, cfg(env));

    /* تکرارشونده‌ها */
    try {
      var rc = await store.get('sp:rec:' + uid, { items: [] });
      var touched = false;
      for (var i = 0; i < (rc.items || []).length; i += 1) {
        var it = rc.items[i];
        if (!it.on === false) continue;
        if (it.lastDay === dayKey) continue;
        if (it.at !== clock) continue;
        var target = it.target || chan;
        if (!target) continue;
        var text = it.text;
        if (it.kind === 'ai') {
          var occ2 = await occasionsFor(env, jalaliOf(now));
          var ranked2 = occRank(occ2, 3).map(function (e) { return e.d; });
          text = await cmdBrain(env, [{ role: 'user', content: 'برای کانال تلگرامی من یک پست بنویس: ' + it.text + (ranked2.length ? '\nمناسبت امروز: ' + ranked2.join('، ') : '') + '\nفارسی، ۵۰۰ تا ۹۰۰ کاراکتر، حداکثر ۳ ایموجی، پایان با یک جمع‌بندی. فقط متن پست.' }], 900);
        }
        var jr = await spPublish(env, uid, target, String(text));
        it.lastDay = dayKey;
        touched = true;
        await spNotify(env, uid, (jr && jr.ok ? '⏰ پست زمان‌بندی‌شدهٔ ' + it.at + ' منتشر شد' + (jr.link ? ': ' + jr.link : '') : '⚠️ انتشار زمان‌بندی‌شده ناموفق: ' + ((jr && jr.error) || '')));
      }
      if (touched) await store.put('sp:rec:' + uid, rc, 400 * 86400);
    } catch (e) { /* نگذار تیک بخوابد */ }

    /* RSS */
    try {
      var rb = await store.get('sp:rss:' + uid, { items: [] });
      var rTouched = false;
      for (var j = 0; j < (rb.items || []).length; j += 1) {
        var f = rb.items[j];
        if (!f.url || (f.target || chan) === '') continue;
        if (Date.now() - (f.lastRun || 0) < (f.every || 120) * 60000) continue;
        f.lastRun = Date.now();
        rTouched = true;
        var got = await spFetchText(f.url, 9000);
        if ((!got.ok && !(got.text && got.text.indexOf('<') > -1)) || !got.text) { f.lastErr = 'HTTP ' + got.status + (got.error ? ' ' + got.error.slice(0, 60) : ''); continue; }
        var items = spXmlItems(got.text);
        if (!items.length) { f.lastErr = 'فید خالی یا ناخوانا'; continue; }
        var seenBox = await store.get('sp:rss:seen:' + f.id, { guids: [] });
        var seen = seenBox.guids || [];
        if (!seen.length) { // اولین اجرا: فقط علامت بزن، چیزی منتشر نکن
          seenBox.guids = items.slice(0, 12).map(function (x) { return x.guid; });
          await store.put('sp:rss:seen:' + f.id, seenBox, 200 * 86400);
          f.seen = seenBox.guids.length;
          f.lastErr = '';
          continue;
        }
        var fresh = items.filter(function (x) { return seen.indexOf(x.guid) < 0; }).slice(0, f.max || 2);
        for (var k = 0; k < fresh.length; k += 1) {
          var news = fresh[k];
          var postText;
          if (f.rewrite) {
            try {
              postText = await cmdBrain(env, [{ role: 'user', content: 'این خبر را برای کانال تلگرامی من به فارسیِ روان بازنویسی کن (نه کپی):\nعنوان: ' + news.title + '\nخلاصه: ' + news.desc + '\n\nقواعد: ۴۰۰ تا ۷۰۰ کاراکتر، لحن خبری-خودمانی، حداکثر ۲ ایموجی، ته پست منبع را به شکل «منبع: ' + news.link + '» بگذار. فقط متن پست.' }], 700);
            } catch (e) { postText = null; }
          }
          if (!postText) postText = '📰 **' + news.title + '**\n\n' + (news.desc ? news.desc.slice(0, 400) + '\n\n' : '') + 'منبع: ' + news.link;
          var jr2 = await spPublish(env, uid, f.target || chan, String(postText));
          seenBox.guids = Array.from(new Set([news.guid].concat(seenBox.guids))).slice(0, 60);
          if (jr2 && jr2.ok) await spNotify(env, uid, '📰 خبر تازه منتشر شد' + (jr2.link ? ': ' + jr2.link : ''));
        }
        await store.put('sp:rss:seen:' + f.id, seenBox, 200 * 86400);
        f.seen = (seenBox.guids || []).length;
        f.lastErr = '';
      }
      if (rTouched) await store.put('sp:rss:' + uid, rb, 400 * 86400);
    } catch (e) { /* ادامه */ }

    /* رصد */
    try {
      var wb2 = await store.get('sp:watch:' + uid, { items: [] });
      var wTouched = false;
      for (var w = 0; w < (wb2.items || []).length; w += 1) {
        var wi = wb2.items[w];
        if (Date.now() - (wi.lastRun || 0) < 10 * 60000) continue;
        wi.lastRun = Date.now();
        wTouched = true;
        var page = await spFetchText(wi.url, 9000);
        if (!page.text || page.text.length < 40) continue;
        if (wi.kind === 'contains') {
          var has = wi.value && page.text.indexOf(wi.value) > -1;
          if (has) {
            wi.hits = (wi.hits || 0) + 1;
            var msg = '👁 در «' + wi.url + '» عبارت «' + wi.value + '» پیدا شد.' + (wi.note ? '\n' + wi.note : '');
            if (wi.post && wi.target) { var jr3 = await spPublish(env, uid, wi.target, (wi.note || 'به‌روزرسانی: ' + wi.url)); if (jr3 && jr3.link) msg += '\nمنتشر شد: ' + jr3.link; }
            await spNotify(env, uid, msg);
            wi.url = wi.url; // ماندگار
          }
        } else {
          var h = await spHash(page.text);
          if (!wi.hash) { wi.hash = h; }
          else if (wi.hash !== h) {
            wi.hash = h;
            wi.hits = (wi.hits || 0) + 1;
            var msg2 = '🔔 صفحه عوض شد: ' + wi.url + (wi.note ? '\n' + wi.note : '');
            if (wi.post && wi.target) { var jr4 = await spPublish(env, uid, wi.target, (wi.note || 'به‌روزرسانی: ' + wi.url)); if (jr4 && jr4.link) msg2 += '\nمنتشر شد: ' + jr4.link; }
            await spNotify(env, uid, msg2);
          }
        }
      }
      if (wTouched) await store.put('sp:watch:' + uid, wb2, 400 * 86400);
    } catch (e) { /* ادامه */ }
  }
}
