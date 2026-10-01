/* ═══════════════════════════════════════════════════════════════════════════
   فرمانده (Commander) — چت با ربات = اجرا در کانال
   مالک در پیوی ربات تایپ می‌کند یا ویس می‌فرستد؛ مغز (Workers AI یا جمنای)
   تصمیم می‌گیرد کدام ابزار را صدا بزند: آمار، مناسبت، ساخت عکس، انتشار،
   حذف، خواندن لینک، ساخت نظرسنجی، زمان‌بندی.
   ═══════════════════════════════════════════════════════════════════════════ */

var CMD_DEFAULT_OWNERS = [5982315292, 8795596928];
var CMD_BLOCK_TEXT = ['HTML', 'Open', 'Confirm', 'Cancel', 'yes', 'no', 'ok', 'باشه'];

function cmdEnabled(env) {
  var v = String(env.COMMANDER_ON === undefined ? '0' : env.COMMANDER_ON).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
function cmdOwners(env) {
  try {
    var raw = String(env.COMMANDER_OWNERS || '').trim();
    if (raw) return raw.split(/[,\s]+/).map(function (x) { return Number(x); }).filter(Boolean);
  } catch (e) {}
  return CMD_DEFAULT_OWNERS;
}
function cmdConfig(env) {
  return {
    text: env.CMDR_TEXT_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    fast: env.CMDR_FAST_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8',
    image: env.CMDR_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell',
    stt: env.CMDR_STT_MODEL || '@cf/openai/whisper',
    brain: env.CMDR_BRAIN_URL || '',
    brainKey: env.CMDR_BRAIN_KEY || '',
    gemini: env.GEMINI_API_KEY || ''
  };
}
function cmdTextOf(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (typeof r.response === 'string') return r.response;
  var c = r.choices && r.choices[0];
  if (c && c.message && typeof c.message.content === 'string') return c.message.content;
  return JSON.stringify(r);
}
function cmdToB64(r) {
  if (r instanceof ReadableStream) return new Response(r).arrayBuffer().then(cmdB64);
  if (r instanceof ArrayBuffer) return Promise.resolve(cmdB64(r));
  if (ArrayBuffer.isView(r)) return Promise.resolve(cmdB64(r.buffer));
  if (r && typeof r.image === 'string') return Promise.resolve(r.image);
  if (r && r.body) return new Response(r.body).arrayBuffer().then(cmdB64);
  return Promise.reject(new Error('شکل خروجی عکس ناشناخته'));
}
function cmdB64(buf) {
  var bytes = new Uint8Array(buf), s = '', chunk = 32768;
  for (var i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
/* ── مغز: اول Workers AI داخل ورکر، بعد دروازهٔ تستی، بعد جمنای ─────────── */
async function cmdBrain(env, messages, maxTokens) {
  var C = cmdConfig(env);
  if (env.AI && typeof env.AI.run === 'function') {
    var r = await env.AI.run(C.text, { messages: messages, max_tokens: maxTokens || 700, temperature: 0.6 });
    return cmdTextOf(r);
  }
  if (C.brain) {
    var res = await fetch(C.brain + '/brain?k=' + encodeURIComponent(C.brainKey), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: messages, max_tokens: maxTokens || 700 })
    });
    var j = await res.json();
    if (!j || !j.ok) throw new Error('brain: ' + ((j && j.text) || 'خطا'));
    return j.text || '';
  }
  if (C.gemini) return cmdGemini(env, messages, C.gemini, maxTokens);
  throw new Error('مغز در دسترس نیست (نه AI بایندینگ، نه دروازه، نه کلید جمنای)');
}
async function cmdGemini(env, messages, key, maxTokens) {
  var sys = messages.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n');
  var contents = messages.filter(function (m) { return m.role !== 'system'; }).map(function (m) {
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] };
  });
  var body = { contents: contents, generationConfig: { maxOutputTokens: maxTokens || 700, temperature: 0.6 } };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body)
  });
  var j = await res.json();
  if (j.error) throw new Error('جمنای: ' + (j.error.message || 'خطا').slice(0, 120));
  var parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  return parts.map(function (p) { return p.text || ''; }).join('');
}
async function cmdAiImage(env, prompt) {
  var C = cmdConfig(env);
  if (env.AI && typeof env.AI.run === 'function') return cmdToB64(await env.AI.run(C.image, { prompt: prompt, steps: 4 }));
  if (C.brain) {
    var res = await fetch(C.brain + '/run?k=' + encodeURIComponent(C.brainKey), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: C.image, payload: { prompt: prompt, steps: 4 }, as: 'image' })
    });
    var j = await res.json();
    if (!j.ok) throw new Error(j.error || 'ساخت عکس ناموفق');
    return j.b64;
  }
  throw new Error('عکس‌ساز در دسترس نیست');
}
async function cmdStt(env, bytes) {
  var C = cmdConfig(env), arr = [];
  for (var i = 0; i < bytes.length; i += 1) arr.push(bytes[i]);
  if (env.AI && typeof env.AI.run === 'function') {
    var r = await env.AI.run(C.stt, { audio: arr });
    return (r && (r.text || r.response)) || '';
  }
  if (C.brain) {
    var res = await fetch(C.brain + '/stt?k=' + encodeURIComponent(C.brainKey), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ b64: cmdB64(bytes.buffer) })
    });
    var j = await res.json();
    var hit = (j.results || []).filter(function (x) { return x.ok && x.text; })[0];
    return hit ? hit.text : '';
  }
  throw new Error('تشخیص گفتار در دسترس نیست');
}
/* ── ابزارهای تلگرام ────────────────────────────────────────────────────── */
async function cmdTg(env, method, payload) {
  return createTelegram(env, cfg(env)).call(method, payload);
}
async function cmdSay(env, chatId, text) {
  return cmdTg(env, 'sendMessage', { chat_id: chatId, text: String(text).slice(0, 3800), link_preview_options: { is_disabled: true } });
}
async function cmdSendPhoto(env, chatId, b64, caption) {
  var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
  var fd = new FormData();
  fd.append('chat_id', String(chatId));
  if (caption) fd.append('caption', String(caption).slice(0, 1000));
  fd.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'rasa.jpg');
  var res = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/sendPhoto', { method: 'POST', body: fd });
  var j = await res.json();
  if (!j.ok) throw new Error(j.description || 'ارسال عکس ناموفق');
  var sizes = (j.result && j.result.photo) || [];
  return { file_id: sizes.length ? sizes[sizes.length - 1].file_id : '', message_id: j.result.message_id };
}
/* ── پارس JSON خروجی مغز ───────────────────────────────────────────────── */
function cmdExtractJson(text) {
  var s = String(text || '').replace(/```json/gi, '```');
  for (var i = 0; i < s.length; i += 1) {
    if (s.charAt(i) !== '{') continue;
    var depth = 0, inStr = false, esc = false;
    for (var k = i; k < s.length; k += 1) {
      var ch = s.charAt(k);
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') { depth -= 1; if (depth === 0) { try { return JSON.parse(s.slice(i, k + 1)); } catch (e) { break; } } }
    }
  }
  return null;
}
/* ── پرامپت سیستمی ─────────────────────────────────────────────────────── */
async function cmdSystemPrompt(env, uid, historyHint) {
  if (env.CMDR_DEBUG) console.log('[cmdr] p1');
  var store = new Store(rasaEnv(env), cfg(env));
  if (env.CMDR_DEBUG) console.log('[cmdr] p2');
  var chan = await store.get('cmd:chan:' + uid, null) || await store.get('cmd:chan:shared', null) || '';
  if (env.CMDR_DEBUG) console.log('[cmdr] p3 chan=' + chan);
  var t = faDate(tehranDate());
  if (env.CMDR_DEBUG) console.log('[cmdr] p5 date=' + t);
  var lines = [
    'تو «رِسا» هستی؛ دستیار فارسی و مدیر کانال تلگرامی مالک. مالک با تو حرف می‌زند و تو کارها را واقعاً انجام می‌دهی (نه راهنمایی).',
    'امروز: ' + t + (chan ? ' | کانال پیش‌فرض: ' + chan : ' | هنوز کانالی تنظیم نشده'),
    'قواعد: فارسی محاوره‌ای تمیز و کوتاه. بی‌تعارف. تصمیم بگیر و انجام بده؛ فقط اگر واقعاً مبهم بود یک سؤال کوتاه بپرس.',
    'در هر نوبت فقط و فقط یک JSON بده، بدون هیچ متن اضافه:',
    '  {"tool":"نام ابزار","args":{...},"say":"جملهٔ کوتاه فارسی برای مالک که چه می‌کنی"}',
    '  یا  {"reply":"پاسخ نهایی فارسی"}',
    'وقتی کار تمام شد حتماً با {"reply":"..."} جمع‌بندی کن.',
    'ابزارها:',
    '• make_image {prompt} — ساخت عکس. prompt را توصیفی و دقیق بده (انگلیسی بهتر جواب می‌دهد).',
    '• publish_post {text, with_image} — انتشار در کانال. text فارسی با مارک‌داون ساده (**بولد**). with_image=true فقط اگر همین حالا عکس ساختیم.',
    '• get_stats {} — آمار دیروز/پریروز، بازدید پست‌ها، پست‌های برتر.',
    '• get_occasions {} — مناسبت امروز و فردا (شمسی).',
    '• web_fetch {url} — خواندن متن یک صفحهٔ وب (برای خلاصه‌کردن لینک‌هایی که مالک می‌دهد).',
    '• poll {question, options} — نظرسنجی در کانال (۲ تا ۱۰ گزینه).',
    '• schedule_post {text, in_minutes} — انتشار در آینده (۱ تا ۱۰۰۸۰ دقیقه).',
    '• delete_last {} — حذف آخرین پستی که خودت در کانال گذاشتی.',
    '• set_channel {channel} — تعیین کانال پیش‌فرض (مثل @mychannel).',
    'قواعد نوشتن پست: ۵۰۰ تا ۹۰۰ کاراکتر، حداکثر ۳ ایموجی، خط اول قلاب، پایان جمع‌بندی. آمار/خبر جعلی نساز.',
    'دقت: هر مناسبت/عدد/خبری که در پست می‌آوری باید دقیقاً از خروجی ابزارها آمده باشد. اسم مناسبت را حرف‌به‌حرف از primary/events بردار؛ اگر مناسبت خاصی نبود، پست تبریک نساز.',
    'نمونه: کاربر می‌گوید «یه عکس از غروب تهران بساز بذار تو کانال» → اول {"tool":"make_image","args":{"prompt":"cinematic golden sunset over Tehran skyline, photorealistic"},"say":"دارم عکس غروب تهران را می‌سازم"} و در نوبت بعد publish_post با with_image=true.'
  ];
  if (historyHint) lines.push('یادآوری: ' + historyHint);
  return lines.join('\n');
}
/* ── ابزارها: اجرا ─────────────────────────────────────────────────────── */
async function cmdTool(env, uid, name, args, ctx) {
  var store = new Store(rasaEnv(env), cfg(env));
  var tg = ctx.tg;
  var chan = ctx.channel;
  if (name === 'make_image') {
    var b64 = await cmdAiImage(env, String(args.prompt || '').slice(0, 600));
    var fid = '';
    try {
      var up = await cmdSendPhoto(env, ctx.chatId, b64, '🖼 پیش‌نمایش عکس — اگر خوبه بگو بذارم تو کانال');
      fid = up.file_id || '';
    } catch (e) { /* اگر تلگرام در دسترس نبود، عکس برای انتشار می‌ماند */ }
    if (fid) await store.put('cmd:img:' + uid, { file_id: fid, at: Date.now(), prompt: String(args.prompt || '').slice(0, 200) });
    return { ok: true, file_id: fid, b64: b64, prompt: String(args.prompt || '').slice(0, 200), note: 'عکس ساخته شد؛ برای انتشار در پست، publish_post با with_image=true' };
  }
  if (name === 'publish_post') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده؛ اول set_channel' };
    var text = String(args.text || '').trim();
    if (!text) return { ok: false, error: 'متن خالی است' };
    if (text.length > 3900) text = text.slice(0, 3900);
    var html = HTML_TAG_RE.test(text) ? mixedToHtml(text) : mdToHtml(text);
    if (args.with_image === true) {
      var img = await store.get('cmd:img:' + uid, null);
      if (img && img.file_id) html = '<img src="tg://photo?id=' + img.file_id + '"/>' + html;
    }
    var out = await publishNow(tg, chan, { html: html }, uid, null, store, args.unsigned === true);
    var jr = out && typeof out.json === 'function' ? await out.json() : out;
    if (!jr || !jr.ok) return { ok: false, error: (jr && jr.error) || 'انتشار ناموفق', verdict: jr && jr.verdict };
    await store.put('cmd:last:' + uid, { target: chan, message_id: jr.message_id, link: jr.link || '', at: Date.now() });
    return { ok: true, link: jr.link || '', message_id: jr.message_id, signed: jr.signed };
  }
  if (name === 'get_stats') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var uname = String(chan).replace(/^@/, '').trim();
    var stats = await channelDayStats(env, tg, chan, uname);
    return { ok: true, channel: chan, stats: stats };
  }
  if (name === 'get_occasions') {
    var dToday = tehranDate(), dTmr = tehranDate(Date.now() + 864e5);
    var o1 = await occasionsFor(env, jalaliOf(dToday)), o2 = await occasionsFor(env, jalaliOf(dTmr));
    var clean = function (o, d) {
      var evs = occRank(o, 4).map(function (e) { return e.d; });
      return { date: faDate(d), holiday: !!o.holiday, primary: evs[0] || null, events: evs };
    };
    return { ok: true, today: clean(o1, dToday), tomorrow: clean(o2, dTmr), rule: 'در پست‌ها فقط و فقط از «primary/events» همین ابزار استفاده کن؛ هیچ مناسبت یا نامی از خودت نساز.' };
  }
  if (name === 'web_fetch') {
    var url = String(args.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'آدرس نامعتبر' };
    var r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; RasaCommander/1.0)' } });
    var htmlRaw = (await r.text()).slice(0, 240000);
    var body = htmlRaw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    return { ok: true, url: url, chars: body.length, text: body.slice(0, 3500) };
  }
  if (name === 'poll') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var q = String(args.question || '').slice(0, 250);
    var opts = (args.options || []).map(function (o) { return String(o).slice(0, 90); }).slice(0, 10);
    if (!q || opts.length < 2) return { ok: false, error: 'سؤال یا گزینه‌ها ناقص است' };
    var pr = await cmdTg(env, 'sendPoll', { chat_id: chan, question: q, options: opts, is_anonymous: true });
    return { ok: true, message_id: pr.message_id };
  }
  if (name === 'schedule_post') {
    if (!chan) return { ok: false, error: 'کانالی تنظیم نشده' };
    var mins = Number(args.in_minutes || 0);
    if (!(mins >= 1 && mins <= 10080)) return { ok: false, error: 'زمان نامعتبر (۱ تا ۱۰۰۸۰ دقیقه)' };
    var when = Date.now() + mins * 60000;
    var body2 = String(args.text || '').trim();
    if (!body2) return { ok: false, error: 'متن خالی است' };
    var shtml = HTML_TAG_RE.test(body2) ? mixedToHtml(body2) : mdToHtml(body2);
    var data = await store.get('sched:' + uid, { jobs: [] });
    var job = { id: 'c' + Date.now(), target: chan, html: shtml, scheduledAt: when, deleteAfter: 0, status: 'pending', createdAt: Date.now() };
    data.jobs = [job].concat(data.jobs || []).slice(0, 50);
    await store.put('sched:' + uid, data);
    var g = await store.get('sched_global', { ids: [] });
    g.ids = [{ id: job.id, uid: uid, at: when }].concat((g.ids || []).filter(function (x) { return x.id !== job.id; })).slice(0, 200);
    await store.put('sched_global', g);
    return { ok: true, at: when, in_minutes: mins, note: 'زمان‌بندی شد' };
  }
  if (name === 'delete_last') {
    var last = await store.get('cmd:last:' + uid, null);
    if (!last || !last.message_id) return { ok: false, error: 'آخرین پست من را پیدا نکردم' };
    await tg.deleteMessage(last.target || chan, last.message_id);
    await store.put('cmd:last:' + uid, null);
    return { ok: true, deleted: last.message_id };
  }
  if (name === 'set_channel') {
    var c = String(args.channel || '').trim();
    if (!/^@[A-Za-z0-9_]{4,}$/.test(c)) return { ok: false, error: 'کانال را مثل @mychannel بده' };
    await store.put('cmd:chan:' + uid, c);
    return { ok: true, channel: c };
  }
  return { ok: false, error: 'ابزار ناشناخته: ' + name };
}
/* ── حلقهٔ اصلی ────────────────────────────────────────────────────────── */
async function cmdHandle(env, message, user, text, isVoice, origin) {
  var uid = user.id, chatId = message.chat.id;
  if (env.CMDR_DEBUG) console.log('[cmdr] t1 store…');
  var store = new Store(rasaEnv(env), cfg(env));
  var tg = createTelegram(env, cfg(env));
  if (env.CMDR_DEBUG) console.log('[cmdr] t2 kv…');
  var chan = await store.get('cmd:chan:' + uid, null) || await store.get('cmd:chan:shared', null) || '';
  var hist = await store.get('cmd:hist:' + uid, { items: [] });
  if (env.CMDR_DEBUG) console.log('[cmdr] t3 chan=' + chan);
  if (env.CMDR_DEBUG) console.log('[cmdr] t4 prompt…');
  var msgs = [{ role: 'system', content: await cmdSystemPrompt(env, uid, '') }].concat((hist.items || []).slice(-8));
  if (env.CMDR_DEBUG) console.log('[cmdr] t5 brain…');
  var userLine = text;
  if (isVoice) userLine = 'پیام صوتی مالک (رونویسی): ' + text;
  msgs.push({ role: 'user', content: userLine });
  var ctx = { tg: tg, chatId: chatId, channel: chan };
  var finalText = '', published = null, steps = 0, lastToolResult = null;
  for (var step = 0; step < 5; step += 1) {
    var raw = await cmdBrain(env, msgs, 800);
    if (env.CMDR_DEBUG) console.log('[cmdr] brain step ' + step + ': ' + String(raw).slice(0, 160));
    var obj = cmdExtractJson(raw);
    if (!obj) { finalText = String(raw || '').trim(); break; }
    if (obj.reply) { finalText = String(obj.reply).trim(); break; }
    if (obj.tool) {
      steps += 1;
      if (obj.say) { try { await cmdSay(env, chatId, '🛠 ' + String(obj.say).slice(0, 300)); } catch (e) {} }
      var res;
      try { res = await cmdTool(env, uid, obj.tool, obj.args || {}, ctx); }
      catch (e) { res = { ok: false, error: String(e && e.message || e).slice(0, 300) }; }
      if (obj.tool === 'publish_post' && res.ok) published = res;
      lastToolResult = { tool: obj.tool, result: res };
      msgs.push({ role: 'assistant', content: raw });
      msgs.push({ role: 'user', content: 'نتیجهٔ ابزار ' + obj.tool + ': ' + JSON.stringify(res).slice(0, 1200) + '\nادامه بده؛ اگر کار تمام شد با {"reply":"..."} جمع‌بندی کن.' });
      continue;
    }
    finalText = String(obj.say || raw).trim();
    break;
  }
  if (!finalText) {
    finalText = published ? 'انجام شد.' : (steps ? 'کار را انجام دادم.' : 'متوجه نشدم؛ یک بار دیگر و واضح‌تر بگو.');
  }
  if (published) {
    var hasLink = published.link && finalText.indexOf(published.link) > -1;
    finalText = hasLink ? finalText : ('✅ منتشر شد' + (published.link ? ': ' + published.link : '') + '\n\n' + finalText);
  }
  if (isVoice) finalText = '🗣 شنیدم: «' + text.slice(0, 160) + '»\n\n' + finalText;
  if (env.CMDR_DEBUG) console.log('[cmdr] t6 say: ' + finalText.slice(0, 80));
  try { await cmdSay(env, chatId, finalText); } catch (e) { if (env.CMDR_DEBUG) console.log('[cmdr] say error: ' + String(e && e.message || e)); }
  if (env.CMDR_DEBUG) console.log('[cmdr] t7 sent');
  hist.items = (hist.items || []).concat([
    { role: 'user', content: userLine.slice(0, 800) },
    { role: 'assistant', content: finalText.slice(0, 800) }
  ]).slice(-10);
  await store.put('cmd:hist:' + uid, hist);
  return true;
}
async function maybeCommander(env, message, user, origin) {
  if (!cmdEnabled(env)) return false;
  var uid = Number(user && user.id || 0);
  if (env.CMDR_DEBUG) console.log('[cmdr] enter uid=' + uid + ' voice=' + !!(message.voice || message.audio) + ' text=' + String(message.text || '').slice(0, 40));
  if (cmdOwners(env).indexOf(uid) < 0) return false;
  var isVoice = !!(message.voice || message.audio);
  var text = String(message.text || '').trim();
  if (!isVoice) {
    if (!text || text.charAt(0) === '/') return false;
    if (text.length < 2) return false;
    if (CMD_BLOCK_TEXT.indexOf(text) > -1) return false;
  }
  if (env.CMDR_DEBUG) console.log('[cmdr] accepted, handling…');
  try {
    if (isVoice) {
      var media = message.voice || message.audio;
      var file = await cmdTg(env, 'getFile', { file_id: media.file_id });
      var url = 'https://api.telegram.org/file/bot' + env.BOT_TOKEN + '/' + file.file_path;
      var buf = await (await fetch(url)).arrayBuffer();
      if (buf.byteLength > 5 * 1024 * 1024) { await cmdSay(env, message.chat.id, 'ویس طولانی است؛ کوتاه‌ترش کن.'); return true; }
      var heard = await cmdStt(env, new Uint8Array(buf));
      if (!heard || !heard.trim()) { await cmdSay(env, message.chat.id, 'صدایت را نفهمیدم؛ یک بار دیگر بفرست.'); return true; }
      await cmdHandle(env, message, user, heard.trim(), true, origin);
      return true;
    }
    await cmdHandle(env, message, user, text, false, origin);
  } catch (e) {
    try { await cmdSay(env, message.chat.id, '⚠️ خطا: ' + String(e && e.message || e).slice(0, 300)); } catch (e2) {}
  }
  return true;
}
