/* ─────────────────────────────────────────────────────────────────────────────
   Wave-2 demo sender: one run puts every new surface into the bot's private
   chat with the owner:

     A) three-state post     — one message that opens to short / mid / full
     B) collage              — four photos in one album frame
     C) native slideshow     — Telegram's own tg-slideshow
     D) in-place carousel    — the photo swaps inside the same message
     E) real Instagram render— a 1080x1350 post built by the studio
     F) story render         — a 1080x1920 story
     G) live streamer        — a value the server keeps moving (sparkline)
     H) community post       — the audience builds the post line by line
     I) landing page         — /p/<id>, from the post to the signup form
     J) multi-tab gallery    — text tabs inside one rich message

   Usage: node send_wave2.mjs [chat_id]                                        */
import fs from 'node:fs';

const BOT = fs.readFileSync('/home/user/.cf/bot_token', 'utf8').trim();
const CF = fs.readFileSync('/home/user/.cf/token', 'utf8').trim();
const ACCT = 'ab05b8b5f2822a491ec407585327eb8f';
const KV = { MAIN: '8eff5bd6b33a4a79ba3d869ef373065a', FRESH: '32075883d0054d95ad579888f58ff613', RASA: 'f7714cd6f0e74ae0b55d73107fa8d88e' };
const ORIGIN = 'https://rich-post-bot.4lisarani-1.workers.dev';
const TICK_USER = 999003;

const CHAT = Number(process.argv[2] || 5982315292);
const A = (n) => `${ORIGIN}/assets/${n}`;
const OUT = '/home/user/carousel/out';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── renderers: the very same files the worker embeds ─────────────────────── */
async function loadModule(file, exports, name) {
  const src = fs.readFileSync(file, 'utf8').replace(/if \(typeof module[\s\S]*$/, '');
  const tmp = `/tmp/${name}.mjs`;
  fs.writeFileSync(tmp, src + `\nexport { ${exports.join(', ')} };\n`);
  return await import(tmp);
}
const live = await loadModule('/home/user/cf/live/live_render.js', ['renderLivePost', 'liveKeyboard'], 'lr2');
const car = await loadModule('/home/user/cf/live/carousel_render.js', ['carouselCaption', 'carouselKeyboard'], 'cr2');
const comm = await loadModule('/home/user/cf/live/community_render.js', ['renderCommunityPost', 'communityKeyboard'], 'km2');

/* ── telegram + kv ────────────────────────────────────────────────────────── */
const api = async (method, payload) => (await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
})).json();
const kvPut = async (ns, key, value) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${CF}` }, body: JSON.stringify(value)
  });
  const j = await r.json();
  if (!j.success) throw new Error('KV ' + key + ' failed: ' + JSON.stringify(j.errors));
};
const kvGet = async (ns, key) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${CF}` } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return null; }
};

const report = [];
async function sendRich(label, html, markup, fallback) {
  let res = await api('sendRichMessage', { chat_id: CHAT, rich_message: { html }, ...markup ? { reply_markup: markup } : {} });
  let used = 'rich';
  if (!res.ok && fallback) {
    res = await api('sendRichMessage', { chat_id: CHAT, rich_message: { html: fallback }, ...markup ? { reply_markup: markup } : {} });
    used = 'rich(fallback)';
  }
  if (!res.ok && fallback) {
    res = await api('sendMessage', { chat_id: CHAT, text: fallback.replace(/<[^>]+>/g, ''), ...markup ? { reply_markup: markup } : {} });
    used = 'plain';
  }
  if (!res.ok) {
    report.push([label, 'FAILED: ' + (res.description || JSON.stringify(res))]);
    console.error('✖', label, res.description);
    return null;
  }
  report.push([label, `msg ${res.result.message_id} · ${used}`]);
  await sleep(700);
  return res.result.message_id;
}
async function sendPhotoFile(label, path, caption, markup) {
  const form = new FormData();
  form.append('chat_id', String(CHAT));
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  if (markup) form.append('reply_markup', JSON.stringify(markup));
  form.append('photo', new Blob([fs.readFileSync(path)], { type: 'image/jpeg' }), 'p.jpg');
  const res = await (await fetch(`https://api.telegram.org/bot${BOT}/sendPhoto`, { method: 'POST', body: form })).json();
  if (!res.ok) { report.push([label, 'FAILED: ' + res.description]); console.error('✖', label, res.description); return null; }
  report.push([label, 'msg ' + res.result.message_id]);
  await sleep(700);
  return res.result.message_id;
}

/* ── upload the four collage frames once, then reuse their file_ids ───────── */
const upForm = new FormData();
upForm.append('chat_id', String(CHAT));
upForm.append('media', JSON.stringify([1, 2, 3, 4].map((i) => ({ type: 'photo', media: `attach://f${i}` }))));
[1, 2, 3, 4].forEach((i) => upForm.append(`f${i}`, new Blob([fs.readFileSync(`${OUT}/c${i}.jpg`)], { type: 'image/jpeg' }), `c${i}.jpg`));
const up = await (await fetch(`https://api.telegram.org/bot${BOT}/sendMediaGroup`, { method: 'POST', body: upForm })).json();
if (!up.ok) { console.error('upload failed', JSON.stringify(up)); process.exit(1); }
const fileIds = up.result.map((m) => (m.photo || []).slice(-1)[0].file_id);
for (const m of up.result) await api('deleteMessage', { chat_id: CHAT, message_id: m.message_id });
console.log('uploaded 4 collage frames');

/* ═══════════════ A) three-state post ═══════════════ */
{
  const id = 'd' + Date.now().toString(36);
  const levels = {
    short: {
      label: '⚡ خلاصهٔ ۳۰ ثانیه',
      html: `<h2>🚀 پست غنی، بدون یک خط کد</h2><p>ربات رِسا پست تلگرام را از «متن» به «مقاله» می‌برد: تیتر، جدول، کلاژ، اسلایدشو و پرسش — همه داخل یک پیام.</p><p>این نسخه، فقط تیتر و جان مطلب است. اگر خواستی عمیق‌تر شوی، دکمهٔ بعدی را بزن: <b>همین پیام</b> برایت باز می‌شود، پیام جدیدی نمی‌آید.</p><footer>نسخهٔ کوتاه · رِسا</footer>`
    },
    mid: {
      label: '📖 نسخهٔ متوسط',
      html: `<h2>🚀 پست غنی، بدون یک خط کد</h2><p>ربات رِسا پست تلگرام را از «متن» به «مقاله» می‌برد: تیتر، جدول، کلاژ، اسلایدشو و پرسش — همه داخل یک پیام.</p><h3>چه چیزهایی داخل پست می‌آید؟</h3><ul><li>تیتر و بندهای واقعی، نه متن تخت</li><li>جدول و چک‌لیست برای داده‌های سخت</li><li>کلاژ و اسلایدشو برای گزارش تصویری</li><li>اموجی پرمیوم و دکمه‌های داخل پیام</li></ul><p>این نسخه برای کسی است که وقت دارد ولی حوصلهٔ خواندن کل مطلب را ندارد.</p><footer>نسخهٔ متوسط · رِسا</footer>`
    },
    full: {
      label: '✅ نسخهٔ کامل',
      html: `<h2>🚀 پست غنی، بدون یک خط کد</h2><p>ربات رِسا پست تلگرام را از «متن» به «مقاله» می‌برد: تیتر، جدول، کلاژ، اسلایدشو و پرسش — همه داخل یک پیام.</p><h3>چه چیزهایی داخل پست می‌آید؟</h3>
<table bordered striped compact><caption>آنچه استودیو می‌سازد</caption><tr><th>بخش</th><th>برای چه کاری</th></tr><tr><td>تیتر و بند</td><td>متن‌های بلند و تحلیلی</td></tr><tr><td>جدول و چک‌لیست</td><td>قیمت، برنامه، مقایسه</td></tr><tr><td>کلاژ و اسلایدشو</td><td>گزارش تصویری و آلبوم</td></tr><tr><td>دکمه و پرسش</td><td>ادامه دادن مخاطب</td></tr></table>
<blockquote>پیام جدید نفرست — همان پیام را باز کن.<cite>قانون کانال‌های تمیز</cite></blockquote>
<details><summary>چرا نسخه‌بندی مهم است؟</summary><p>چون هر مخاطب سطح دیگری دارد؛ بعضی‌ها فقط تیتر می‌خواهند، بعضی‌ها کل تحلیل. با یک پست سه‌حالته، هیچ‌کدام نه می‌روند و نه دلخور می‌شوند.</p></details>
<p>حالا با سه دکمه زیر، همان پیام را ببند و باز کن — ببین چطور برای هر سطح دیگری عوض می‌شود.</p><footer>نسخهٔ کامل · رِسا</footer>`
    }
  };
  const rows = Object.keys(levels).map((k) => [{
    text: (k === 'short' ? '● ' : '') + levels[k].label,
    callback_data: `deep:${id}:${k}`
  }]);
  const msgId = await sendRich('A) پست سه‌حالته', levels.short.html, { inline_keyboard: rows });
  if (msgId) {
    const st = { id, chatId: CHAT, msgId, level: 'short', levels, createdAt: Date.now(), updatedAt: Date.now() };
    for (const ns of [KV.MAIN, KV.FRESH]) await kvPut(ns, `deep:${id}`, st);
  }
}

/* ═══════════════ B) collage ═══════════════ */
{
  const media = fileIds.map((fid, i) => ({
    type: 'photo', media: fid,
    ...i === 0 ? { caption: '<b>🖼 کلاژ — چهار عکس، یک قاب</b>\nدر کانال، این می‌شود یک پست تصویری تمیز با کپشن، نه چهار پیام پشت‌سرهم.\n<i>رِسا · گزارش تصویری</i>', parse_mode: 'HTML' } : {}
  }));
  const res = await api('sendMediaGroup', { chat_id: CHAT, media });
  if (res.ok) report.push(['B) کلاژ', `album of ${res.result.length} (msg ${res.result[0].message_id})`]);
  else { report.push(['B) کلاژ', 'FAILED: ' + res.description]); console.error('✖ collage', res.description); }
  await sleep(700);
}

/* ═══════════════ C) native slideshow ═══════════════ */
{
  const html = `<h2>🎞 اسلایدشوی نیتیو تلگرام</h2><p>اینجا راه دیگری جز کلاژ است: خودِ تلگرام بین عکس‌ها می‌چرخد و کپشن هر اسلاید سر جایش می‌ماند.</p>` +
    `<tg-slideshow><img src="${A('collab/c1.jpg')}"/><img src="${A('collab/c2.jpg')}"/><img src="${A('collab/c3.jpg')}"/><img src="${A('collab/c4.jpg')}"/><figcaption>چهار قاب از ایران — رِسا</figcaption></tg-slideshow>` +
    `<footer>اسلایدشوی نیتیو · بدون پیام اضافه</footer>`;
  const fallback = `<h2>🎞 اسلایدشوی نیتیو تلگرام</h2><p>اسلایدشو با عکس‌های آنلاین ساخته می‌شود؛ اگر تلگرام اجازه نداد، این نسخهٔ متنی می‌ماند.</p><footer>اسلایدشو · رِسا</footer>`;
  await sendRich('C) اسلایدشوی نیتیو', html, null, fallback);
}

/* ═══════════════ D) in-place carousel ═══════════════ */
{
  const id = 'c' + Date.now().toString(36);
  const state = {
    id, slides: [
      { fileId: fileIds[0], title: '🏔 دماوند، بام ایران', caption: 'دکمه‌های ◀️ و ▶️ را بزن — عکس همین پیام عوض می‌شود.' },
      { fileId: fileIds[1], title: '🌿 باغ ایرانی؛ هندسهٔ آب', caption: 'هیچ پیام جدیدی ساخته نمی‌شود؛ فقط همین قاب.' },
      { fileId: fileIds[2], title: '🏜 یزد؛ شهر بادگیرها', caption: 'با دکمه‌های شماره‌دار، مستقیم به هر اسلاید بپر.' },
      { fileId: fileIds[3], title: '🌫 جادهٔ جنگلی شمال', caption: 'پخش خودکار روشن است؛ هر دقیقه خودش جلو می‌رود.' }
    ],
    idx: 0, auto: true, createdAt: Date.now(), updatedAt: Date.now()
  };
  for (const ns of [KV.MAIN, KV.FRESH]) await kvPut(ns, `car:${id}`, state);
  const res = await api('sendPhoto', { chat_id: CHAT, photo: fileIds[0], caption: car.carouselCaption(state), parse_mode: 'HTML', reply_markup: car.carouselKeyboard(state) });
  if (res.ok) {
    const msgId = res.result.message_id;
    report.push(['D) کاروسل درجا', 'msg ' + msgId]);
    const jobs = [];
    for (let i = 1; i <= 6; i++) jobs.push({ id: `adv${id}_${i}`, kind: 'live_tick', advance: true, liveId: id, target: CHAT, messageId: msgId, scheduledAt: Date.now() + i * 60000 + 15000, status: 'pending', createdAt: Date.now() });
    await seedJobs(jobs);
  } else { report.push(['D) کاروسل درجا', 'FAILED: ' + res.description]); console.error('✖ carousel', res.description); }
  await sleep(700);
}

/* ═══════════════ E) + F) instagram post and story renders ═══════════════ */
await sendPhotoFile('E) رندر اینستاگرام', `${OUT}/insta_post.jpg`, '<b>📸 رندر اینستاگرام — ۱۰۸۰×۱۳۵۰</b>\nاستودیو همین را از متن پست ساخت: تیتر فارسی، بند، امضای برند. همان قابی که در اینستاگرام می‌گذاری، اینجا با یک کلیک آماده است.');
await sendPhotoFile('F) رندر استوری', `${OUT}/story.jpg`, '<b>📱 رندر استوری — ۱۰۸۰×۱۹۲۰</b>\nنسخهٔ عمودی با تیتر بزرگ؛ مناسب استوری و کانال موبایل.');

/* ═══════════════ G) live streamer (self-moving value) ═══════════════ */
{
  const id = 's' + Date.now().toString(36);
  const now = Date.now();
  const state = {
    id,
    title: '🌊 استریمر: کمپین ثبت‌نام',
    subtitle: 'این عدد را کسی دستی عوض نمی‌کند؛ سرور هر دقیقه خودش جلو می‌برد و نمودارش را می‌کشد.',
    status: '🟢 زنده — هر دقیقه خودش به‌روز می‌شود',
    image: A('insta/insta_post.jpg'),
    flow: { label: 'ثبت‌نام تا این لحظه', emoji: '📈', unit: ' نفر', value: 412, series: [210, 260, 300, 345, 380, 412] },
    entries: [],
    updatedAt: now,
    createdAt: now
  };
  for (const ns of [KV.MAIN, KV.FRESH]) await kvPut(ns, `live:${id}`, state);
  const msgId = await sendRich('G) استریمر زنده', live.renderLivePost(state), live.liveKeyboard(state),
    `<h2>🌊 استریمر: کمپین ثبت‌نام</h2><p>عددی که سرور هر دقیقه جلو می‌برد.</p><footer>استریمر · رِسا</footer>`);
  if (msgId) {
    const jobs = [];
    for (let i = 1; i <= 8; i++) jobs.push({
      id: `fl${id}_${i}`, kind: 'live_tick', liveId: id, target: CHAT, messageId: msgId,
      flow: { label: 'ثبت‌نام تا این لحظه', emoji: '📈', unit: ' نفر', step: 38, jitter: 16, min: 0, max: 5000, status: '🟢 زنده — هر دقیقه خودش به‌روز می‌شود' },
      scheduledAt: Date.now() + i * 60000 + 20000, status: 'pending', createdAt: Date.now()
    });
    await seedJobs(jobs);
  }
}

/* ═══════════════ H) community post ═══════════════ */
{
  const id = 'm' + Date.now().toString(36);
  const now = Date.now();
  const state = {
    id, chatId: CHAT, msgId: null,
    title: '🧩 پست با هم: اولین تجربه‌ات با رِسا',
    subtitle: 'هر عضو فقط یک خط اضافه می‌کند؛ پست زنده بالا می‌رود. دکمهٔ زیر را بزن و خطت را در پیوی ربات بنویس — همین پیام به‌روز می‌شود.',
    founder: CHAT, founderName: 'صاحب کانال', goal: 10, open: true,
    lines: [
      { uid: 'seed1', name: 'مهمان ۱', at: now - 300000, text: 'اولین پست جدولی‌ام را همین امروز منتشر کردم؛ خواندنش راحت‌تر شد.' },
      { uid: 'seed2', name: 'مهمان ۲', at: now - 120000, text: 'کلاژ چهار عکسی، جای پست‌های پراکنده را گرفت.' }
    ],
    updatedAt: now, createdAt: now
  };
  const msgId = await sendRich('H) پست جمعی', comm.renderCommunityPost(state), comm.communityKeyboard(state));
  if (msgId) {
    state.msgId = msgId;
    for (const ns of [KV.MAIN, KV.FRESH]) await kvPut(ns, `comm:${id}`, state);
  }
}

/* ═══════════════ I) landing page ═══════════════ */
{
  const id = 'p' + Date.now().toString(36);
  const page = {
    id, owner: CHAT,
    title: 'کارگاه عکاسی در نور طبیعی',
    subtitle: 'سه جلسهٔ عملی · ظرفیت محدود · تهران',
    hero: A('lhero.jpg'),
    image: 'lhero.jpg',
    photos: ['collab/c1.jpg', 'collab/c2.jpg', 'collab/c3.jpg'],
    blocks: [
      { k: 'شهریه', v: '۹۸۰ هزار تومان' },
      { k: 'ظرفیت', v: '۱۲ نفر' },
      { k: 'زمان', v: 'پنجشنبه‌ها ۱۸:۰۰ — از هفتهٔ آینده' },
      { k: 'مکان', v: 'خیابان کریم‌خان، استودیو رِسا' }
    ],
    cta: { text: '💬 پرسیدن سؤال در تلگرام', url: 'https://t.me/RasaRichBot' },
    phone: '',
    price: '',
    accent: '#f0b429',
    form: true,
    formTitle: 'ثبت‌نام در کارگاه',
    body: '<p>یک قاب درست، نصف کار عکاسی است. در این کارگاه با نور طبیعی، ترکیب‌بندی و ویرایش رنگ کار می‌کنیم.</p>'
  };
  await kvPut(KV.RASA, `land:${id}`, page);
  const url = `${ORIGIN}/p/${id}`;
  const html = `<img src="${A('lhero.jpg')}"/><h2>🏬 صفحهٔ فرود داخل تلگرام</h2>` +
    `<p>از پست تا ثبت‌نام، بدون سایت. این پیام دکمه‌ای دارد که صفحهٔ زیر را باز می‌کند — همان صفحه از محتوای همین پست ساخته شده است.</p>` +
    `<table bordered striped compact><caption>صفحه شامل چه چیزی است</caption><tr><th>بخش</th><th>کارش</th></tr><tr><td>عکس، متن، جدول</td><td>اطلاعات کامل و خوانا</td></tr><tr><td>فرم ثبت‌نام</td><td>اسم و شماره، همین‌جا</td></tr><tr><td>دکمهٔ تماس</td><td>رفتن به گفت‌وگو</td></tr></table>` +
    `<p>وقتی کسی در صفحه فرم پر می‌کند، <b>همان لحظه در پیوی تو</b> به‌عنوان «ثبت جدید» می‌رسد.</p>` +
    `<footer>${url}</footer>`;
  await sendRich('I) صفحهٔ فرود', html, { inline_keyboard: [[{ text: '🏬 باز کردن صفحهٔ فرود', url }]] },
    `<h2>🏬 صفحهٔ فرود</h2><p>${url}</p>`);
}

/* ═══════════════ J) multi-tab gallery ═══════════════ */
{
  const id = 'g' + Date.now().toString(36);
  const state = {
    id, rich: true,
    slides: [
      { title: '🏔 دماوند', html: `<img src="${A('collab/c1.jpg')}"/><p>بلندترین قلهٔ ایران؛ صورتیِ طلوع را سالی چند هفته می‌شود دید.</p>` },
      { title: '🌿 باغ ایرانی', html: `<img src="${A('collab/c2.jpg')}"/><p>هندسهٔ آب و درخت؛ قنات زیر کویر، باغ روی زمین.</p>` },
      { title: '🏜 یزد', html: `<img src="${A('collab/c3.jpg')}"/><p>بادگیرها بدون یک وات برق، هوا را خنک می‌کنند.</p>` },
      { title: '🌫 جادهٔ شمال', html: `<img src="${A('collab/c4.jpg')}"/><p>مِه صبحگاهی چالوس؛ رانندگی در ابرها.</p>` }
    ],
    idx: 0, createdAt: Date.now(), updatedAt: Date.now()
  };
  for (const ns of [KV.MAIN, KV.FRESH]) await kvPut(ns, `car:${id}`, state);
  await sendRich('J) گالری چندتبی', car.carouselCaption(state), car.carouselKeyboard(state),
    `<b>🏔 دماوند</b>\nبلندترین قلهٔ ایران.\n۱ / ۴ ● ○ ○ ○`);
}

/* ── seed the tick queue ──────────────────────────────────────────────────── */
async function seedJobs(jobs) {
  const cur = (await kvGet(KV.RASA, `sched:${TICK_USER}`)) || { jobs: [] };
  cur.jobs = [...(cur.jobs || []).filter((j) => j.status === 'pending'), ...jobs].slice(-200);
  await kvPut(KV.RASA, `sched:${TICK_USER}`, cur);
  const g = (await kvGet(KV.RASA, 'sched_global')) || { ids: [] };
  const ids = [...jobs.map((j) => ({ id: j.id, uid: TICK_USER, at: j.scheduledAt })), ...(g.ids || [])].slice(0, 500);
  await kvPut(KV.RASA, 'sched_global', { ids });
}

console.log('\n────────────── گزارش ارسال ──────────────');
for (const [k, v] of report) console.log(`  ${k.padEnd(24)} ${v}`);
console.log(`\n${report.filter(([, v]) => !/FAILED/.test(v)).length}/${report.length} delivered`);
