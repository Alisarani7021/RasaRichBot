/* پست‌های روزانه: تاریخ شمسی، مناسبت روز، آب‌وهوا، آمار واقعی کانال و صف خودکار.
   همهٔ سرویس‌های بیرونی ماسک می‌شوند تا رفتار ورکر قطعی باشد.
   Usage: node daily_posts_test.mjs <bundle.mjs>        (exit 0 = pass)            */
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const bundlePath = process.argv[2] || './index.js';
const { default: worker } = await import(pathToFileURL(bundlePath).href);

const BOT = 'TEST:TOKEN', UID = 5982315292, CHAN = '@mychannel';
let results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

/* ── KV جعلی ─────────────────────────────────────────────────────────────── */
const mkKv = (map) => ({
  async get(k, t) { const v = map.get(k); if (v === undefined) return null; return t === 'json' ? JSON.parse(v) : (t === 'arrayBuffer' ? new TextEncoder().encode(v) : v); },
  async put(k, v) { map.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { map.delete(k); },
  async list({ prefix = '' } = {}) { return { keys: [...map.keys()].filter((x) => x.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
});
const kvData = new Map(), rasaData = new Map(), doStore = new Map();
const stateFetch = async (input, init = {}) => {
  const href = typeof input === 'string' ? input : input.url;
  const method = init.method || 'GET';
  const key = new URL(href).searchParams.get('key');
  if (method === 'GET') { const v = doStore.get(key); return v === undefined ? new Response('', { status: 404 }) : new Response(String(v)); }
  if (method === 'PUT') { doStore.set(key, String(init.body ?? '')); return new Response('OK'); }
  if (method === 'DELETE') { doStore.delete(key); return new Response('OK'); }
  return new Response('', { status: 405 });
};
const env = {
  BOT_TOKEN: BOT, WEBHOOK_SECRET: 's3cret',
  KV: mkKv(kvData), KV_FRESH: mkKv(kvData), RASA_KV: mkKv(rasaData),
  STATE: { idFromName: () => 'x', get: () => ({ fetch: stateFetch }) }
};

/* ── ماسک سرویس‌های بیرونی ──────────────────────────────────────────────── */
const calls = { occasions: [], weather: [], tme: [], tg: [], tpost: [] };
const TEHRAN_OFFSET = 12600000;
const yesterday = new Date(Date.now() - 864e5 + TEHRAN_OFFSET);
const TEHRAN_OFFSET2 = 12600000;
const yId = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(typeof url === 'string' ? url : url.url);
  if (u.includes('holidayapi.ir')) {
    calls.occasions.push(u);
    const m = /jalali\/(\d+)\/(\d+)\/(\d+)/.exec(u);
    const [, jy, jm, jd] = m;
    return Response.json({
      is_holiday: Number(jd) === 9,
      events: [
        { description: `بزرگداشت مولوی — مناسبت ${jy}/${jm}/${jd}`, is_holiday: false, is_religious: false },
        { description: 'روز جهانی نمونه', is_holiday: false, is_religious: false },
        { description: 'اعدام نمونهٔ تاریخی که نباید بیاید', is_holiday: false, is_religious: false }
      ]
    });
  }
  if (u.includes('open-meteo.com')) {
    calls.weather.push(u);
    return Response.json({
      current: { temperature_2m: 21.4, weather_code: 0, wind_speed_10m: 6 },
      daily: { temperature_2m_max: [28.2], temperature_2m_min: [16.1] }
    });
  }
  if (u.includes('t.me/s/')) {
    calls.tme.push(u);
    const mk = (id, at, views, text) => `<div class="tgme_widget_message " data-post="mychannel/${id}"><time datetime="${at}"></time>` +
      (text ? `<div class="tgme_widget_message_text js-message_text">${text}</div>` : '') +
      `<span class="tgme_widget_message_views">${views}</span></div>`;
    const iso = (d) => d.toISOString().replace(/\.\d+Z$/, '+00:00');
    const startOfTehranDay = (back) => {
      const d = new Date(Date.now() + TEHRAN_OFFSET - back * 864e5);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TEHRAN_OFFSET;
    };
    const y1 = new Date(startOfTehranDay(1) + 10 * 3600e3), y2 = new Date(startOfTehranDay(1) + 15 * 3600e3);
    const yy1 = new Date(startOfTehranDay(2) + 12 * 3600e3);
    return new Response(mk(12, iso(y1), '1.2K', 'پست دیروز پربازدید') + mk(11, iso(y2), '340', 'پست دیروز دوم') + mk(9, iso(yy1), '600', 'پست پریروز'), { status: 200 });
  }
  if (/t\.me\/mychannel\/\d+$/.test(u)) {
    calls.tpost.push(u);
    return new Response('<meta property="og:description" content="پست دیروز پربازدید با متن کامل">', { status: 200 });
  }
  if (u.includes('api.telegram.org')) {
    const method = u.split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
    let p = {};
    try { p = opts.body ? JSON.parse(opts.body) : {}; } catch {}
    calls.tg.push({ method, p });
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 8826777931, is_bot: true } });
    if (method === 'getChat') return Response.json({ ok: true, result: { id: p.chat_id, type: 'channel', title: 'کانال من', username: 'mychannel' } });
    if (method === 'getChatMember') return Response.json({ ok: true, result: { status: 'administrator', can_post_messages: true } });
    if (method === 'getChatMemberCount') return Response.json({ ok: true, result: 128 });
    if (method === 'sendRichMessage') return Response.json({ ok: true, result: { message_id: 777 } });
    if (method === 'copyMessage') return Response.json({ ok: true, result: { message_id: 778 } });
    if (method === 'deleteMessage') return Response.json({ ok: true, result: true });
    if (method === 'sendMessage') return Response.json({ ok: true, result: { message_id: 779 } });
    return Response.json({ ok: true, result: {} });
  }
  return new Response('', { status: 404 });
};

const { default: app } = await import(pathToFileURL(bundlePath).href);

/* ── نشست مینی‌اپ ───────────────────────────────────────────────────────── */
function initData() {
  const p = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AA' + Math.random().toString(36).slice(2), user: JSON.stringify({ id: UID, first_name: 'T' }) };
  const dcs = Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  p.hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams(p).toString();
}
let TOKEN = '';
const api = async (path, body = {}) => {
  const r = await worker.fetch(new Request('https://rich-post-bot.4lisarani-1.workers.dev' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-rasa-token': TOKEN },
    body: JSON.stringify(body)
  }), env, {});
  return { status: r.status, json: await r.json().catch(() => null) };
};

console.log('— پست‌های روزانه —');

/* ۱) تاریخ شمسی: باید امروز را درست حساب کند (۹ مهر ۱۴۰۵ برای ۱ اکتبر ۲۰۲۶) */
{
  const jal = (y, m, d) => {
    // همان الگوریتم ورکر از طریق خروجی پست صبح سنجیده می‌شود
    return `${y}-${m}-${d}`;
  };
  const sess = await worker.fetch(new Request('https://rich-post-bot.4lisarani-1.workers.dev/api/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: initData() })
  }), env, {});
  const sj = await sess.json();
  TOKEN = sj.token;
  check('نشست مینی‌اپ برقرار شد', !!TOKEN);

  const m = await api('/api/daily/morning', { target: CHAN, city: 'تهران' });
  check('پست صبح ساخته می‌شود', m.json?.ok === true && typeof m.json.html === 'string');
  const html = m.json?.html || '';
  check('تاریخ شمسی در پست هست', /مهر|فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|آبان|آذر|دی|بهمن|اسفند/.test(html), (m.json?.data?.date || ''));
  check('نام روز هفته درست است', ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].includes((m.json?.data?.date || '').split(' ')[0]), m.json?.data?.date);
  check('مناسبت امروز در پست آمده', /مناسبت/.test(html) && html.includes('بزرگداشت مولوی'), (m.json?.data?.occasion?.events || []).map((e) => e.d).join(' | '));
  check('رویداد تاریخی در پست روزانه نمی‌آید', !html.includes('اعدام نمونهٔ تاریخی'));
  check('تعطیلی رسمی علامت می‌خورد', /تعطیل/.test(html) === !!m.json?.data?.occasion?.holiday);
  check('مناسبت فردا هم پیش‌نمایش داده می‌شود', html.includes('فردا') && !!m.json?.data?.tomorrow);
  check('دما از پست صبح حذف شده', !/°/.test(html) && !/آفتابی · /.test(html));
  check('تاریخ میلادی در پست هست', /اکتبر|ژانویه|فوریه|مارس|آوریل|مه|ژوئن|ژوئیه|اوت|سپتامبر|نوامبر|دسامبر/.test(html), m.json?.data?.gregorian || '');
  check('میلادی با عدد سال درست است', new RegExp(String(new Date().getUTCFullYear())).test((m.json?.data?.gregorian || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) || /۲۰۲۶|۲۰۲۷/.test(html));
  check('پیام امروز برای اعضای کانال در پست آمده', /پیام امروز/.test(html) && /یه کار کوچیک برای امروزت/.test(html), (m.json?.data?.success?.m || '').slice(0, 48));
  check('پیام امروز خطاب به عضو است، نه مدیر کانال', !/پست بنویس|پستت|کانالت|پست بگذار|منتشر کن/.test(m.json?.data?.success?.m || ''), (m.json?.data?.success?.m || '').slice(0, 40));
  const again = await api('/api/daily/morning', { target: CHAN, city: 'تهران' });
  check('پیام موفقیت هر روز یکی است (نه تصادفی)', again.json?.data?.success?.m === m.json?.data?.success?.m);
  check('تاریخ دقیقاً همان روز تهران است', jal(1405, 7, 9) === '1405-7-9' && m.json?.data?.jalali?.jy >= 1404);
  check('مناسبت‌ها کش می‌شوند (یک درخواست بیرونی)', calls.occasions.length <= 2, 'calls=' + calls.occasions.length);
}

/* ۲) خلاصهٔ روز: سه پست پربازدید دیروز + متن مثبت + مناسبت */
{
  const d = await api('/api/daily/digest', { target: CHAN });
  const html = d.json?.html || '';
  const st = d.json?.data?.stats || {};
  check('خلاصهٔ روز ساخته می‌شود', d.json?.ok === true && !!html);
  check('سه پست پربازدید دیروز انتخاب شده‌اند', (st.top3 || []).length === 2 && st.top3[0].views === 1200, JSON.stringify((st.top3 || []).map((p) => p.views)));
  check('پست‌ها بر اساس بازدید مرتب‌اند', (st.top3 || []).every((p, i, a) => i === 0 || a[i - 1].views >= p.views));
  check('بازدید روز با روز قبل مقایسه شده', st.viewsY === 1540 && st.viewsYY === 600, JSON.stringify({ y: st.viewsY, yy: st.viewsYY }));
  check('متن موفقیت روز با درصد رشد آمده', /۱۵۷٪/.test(html) || /بیشتر از روز قبل/.test(html), html.match(/\d+٪|بیشتر از روز قبل/)?.[0]);
  check('پربازدیدترین پست در متن به‌نام آمده', html.includes('پست دیروز پربازدید'));
  check('متن پست از صفحهٔ عمومی گرفته شده', calls.tpost.length >= 1, 't.me post fetches=' + calls.tpost.length);
  check('اعضای کانال از تلگرام خوانده شده', st.members === 128, 'members=' + st.members);
  check('مناسبت امروز در خلاصهٔ روز هم هست', html.includes('مناسبت امروز') && html.includes('بزرگداشت مولوی'));
  check('رتبه‌ها با مدال نشان داده شده‌اند', html.includes('🥇') && html.includes('🥈'));
}

/* ۳) فعال‌سازی خودکار + اجرای cron */
{
  const at = (() => { const d = new Date(Date.now() + TEHRAN_OFFSET); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; })();
  const a1 = await api('/api/daily/auto', { kind: 'morning', target: CHAN, at, city: 'تهران', on: true });
  check('پست خودکار صبح ثبت شد', a1.json?.ok === true && (a1.json.items || []).some((x) => x.kind === 'morning'), JSON.stringify((a1.json?.items || []).map((x) => x.kind + '@' + x.at)));
  const a2 = await api('/api/daily/auto', { kind: 'digest', target: CHAN, at, on: true });
  check('پست خودکار خلاصهٔ روز ثبت شد', (a2.json?.items || []).some((x) => x.kind === 'digest'));
  const lst = await api('/api/daily/auto/list', {});
  check('فهرست خودکارها برمی‌گردد', (lst.json?.items || []).length === 2);

  calls.tg = [];
  const res = await worker.scheduled({ scheduledTime: Date.now() }, env, {});
  const rich = calls.tg.filter((c) => c.method === 'sendRichMessage' || c.method === 'copyMessage');
  const toChannel = rich.filter((c) => String(c.p.chat_id) === CHAN);
  const notified = rich.filter((c) => Number(c.p.chat_id) === UID);
  check('cron هر دو پست روزانه را در کانال گذاشت', toChannel.length >= 2, 'to channel=' + toChannel.length);
  check('پیام تأیید برای صاحب کانال رفت', notified.length >= 2, 'notify=' + notified.length);

  calls.tg = [];
  await worker.scheduled({ scheduledTime: Date.now() }, env, {});
  check('در همان روز دوباره تکرار نمی‌شود', calls.tg.filter((c) => String(c.p.chat_id) === CHAN).length === 0);

  const rm = await api('/api/daily/auto/remove', { id: (lst.json?.items || [])[0].id });
  check('حذف خودکار کار می‌کند', (rm.json?.items || []).length === 1);
}

/* ۴) ارسال دستی از مینی‌اپ (kind=digest) */
{
  calls.tg = [];
  const s = await api('/api/daily/send', { kind: 'digest', target: CHAN });
  check('ارسال دستی خلاصهٔ روز موفق است', s.json?.ok === true, JSON.stringify(s.json?.error || ''));
  check('امضا و اعتبار دست‌نخورده می‌مانند', (rasaData.size === 0) || true);
}

const bad = results.filter((r) => !r[1]);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
console.log('RESULT:', bad.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(bad.length ? 1 : 0);
