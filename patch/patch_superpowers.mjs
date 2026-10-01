#!/usr/bin/env node
/* b43 — «قدرت‌های نسل بعد»: رسانه، کنترل، ترجمه، بازار، RSS، تکرار، رصد، تأیید…
   Usage: node patch_superpowers.mjs <bundle.mjs>                                 */
import fs from 'node:fs';

const target = process.argv[2] || 'cf/sim/bundle_v28.mjs';
let src = fs.readFileSync(target, 'utf8');
const snip = fs.readFileSync(new URL('./snippets/superpowers.js', import.meta.url), 'utf8');

const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('spTick') === 0, 'already patched');
must(count('maybeCommander') >= 1, 'فرمانده لازم است');
must(count('mcpToolDefs') >= 1, 'دریچهٔ MCP لازم است');

/* ── ۱) موتور قدرت‌ها ──────────────────────────────────────────────────── */
const ENG = '\nasync function applyLiveTick(env, job) {';
must(count(ENG) === 1, 'applyLiveTick anchor');
src = src.replace(ENG, '\n' + snip.trimEnd() + '\n' + ENG);

/* ── ۲) قلاب ابزارها در cmdTool ────────────────────────────────────────── */
const TOOL = 'async function cmdTool(env, uid, name, args, ctx) {\n  var store = new Store(rasaEnv(env), cfg(env));';
must(count(TOOL) === 1, 'cmdTool anchor');
src = src.replace(TOOL, 'async function cmdTool(env, uid, name, args, ctx) {\n  { const spRes = await spTool(env, uid, name, args, ctx); if (spRes !== null) return spRes; }\n  var store = new Store(rasaEnv(env), cfg(env));');

/* ── ۳) ضبط رسانهٔ ارسالی مالک در پیوی ─────────────────────────────────── */
const MEDIA = `  var isVoice = !!(message.voice || message.audio);
  var text = String(message.text || '').trim();
  if (!isVoice) {
    if (!text || text.charAt(0) === '/') return false;
    if (text.length < 2) return false;
    if (CMD_BLOCK_TEXT.indexOf(text) > -1) return false;
  }`;
must(count(MEDIA) === 1, 'media anchor');
src = src.replace(MEDIA, `  var isVoice = !!(message.voice || message.audio);
  var text = String(message.text || message.caption || '').trim();
  var captured = null;
  try { captured = await spCaptureMedia(env, message); } catch (e) { captured = null; }
  if (captured && !text) {
    var mbox = await new Store(rasaEnv(env), cfg(env)).get('sp:media:' + uid, { items: [] });
    await cmdSay(env, uid, '📥 دریافت شد (' + (captured.kind === 'photo' ? 'عکس' : captured.kind === 'video' ? 'ویدیو' : 'فایل') + '). الان ' + ((mbox.items || []).length) + ' رسانه در صف است. بگو: «این رو با کپشن … بذار تو کانال» یا «آلبوم بساز».');
    return true;
  }
  if (captured && text) {
    try { await cmdSay(env, uid, '📥 رسانه ذخیره شد؛ با همین دستور منتشرش می‌کنم.'); } catch (e) {}
  }
  if (!isVoice) {
    if (!text || text.charAt(0) === '/') return false;
    if (text.length < 2) return false;
    if (CMD_BLOCK_TEXT.indexOf(text) > -1) return false;
  }`);

/* ── ۴) فهرست ابزارها در پرامپت مغز ───────────────────────────────────── */
const PROMPT_ANCHOR = `    '• set_channel {channel} — تعیین کانال پیش‌فرض (مثل @mychannel).',`;
must(count(PROMPT_ANCHOR) === 1, 'prompt tools anchor');
src = src.replace(PROMPT_ANCHOR, PROMPT_ANCHOR + `
    '• publish_media {caption} — انتشار عکس/ویدیو/فایلی که مالک در پیوی فرستاده (آخرین رسانه).',
    '• album {caption} — آلبوم ۲ تا ۱۰ عکسی از رسانه‌های فرستاده‌شده.',
    '• replace_last {text} — پاک‌کردن آخرین پست و انتشار نسخهٔ تازه (با همان عکس).',
    '• delete_post {message_id} · pin_post {} · unpin_post {} — حذف/سنجاق.',
    '• mute_user {user_id, minutes} · ban_user {user_id} — مدیریت مزاحم.',
    '• translate {text, to} — ترجمه (fa/en/ar/tr/ru/de/fr).',
    '• market {asset} — قیمت واقعی: دلار/طلا/سکه/یورو/بیت‌کوین/اتریوم/همه — حتماً قبل از نوشتن پست قیمتی این را صدا بزن.',
    '• make_image {prompt, style} — style از: cinematic/neon/minimal/watercolor/3d/retro/dark.',
    '• make_voice {text} — صدای گویندهٔ انگلیسی (TTS).',
    '• draft_post {text, with_image} — پیش‌نویس با دکمهٔ تأیید در پیوی مالک (وقتی مالک گفت «اول ببینم»).',
    '• weekly_report {} — گزارش هفتگی: بازدید، پست برتر، بهترین ساعت.',
    '• suggest {topic} — ایدهٔ پست. · search_archive {query} — جست‌وجو در آرشیو کانال.',
    '• rss_add {url, every_minutes, rewrite} · rss_list · rss_remove {id} — خبرخوان خودکار.',
    '• recurring_add {at, text, kind:text|ai} · recurring_list · recurring_remove {id} — پست تکرارشونده.',
    '• watch_add {url, kind:changed|contains, value, note, post} · watch_list · watch_remove {id} — رصد صفحه.',
    '• welcome_set {text, chat, off} — پیام خوش‌آمد عضو جدید ({name}).',`);

/* ── ۵) ابزارهای دریچهٔ MCP ────────────────────────────────────────────── */
const MCP_ANCHOR = `    { name: 'set_channel', description: 'تعیین کانال پیش‌فرض (مثل @mychannel).',
      inputSchema: { type: 'object', properties: { channel: { type: 'string' } }, required: ['channel'] } }
  ];`;
must(count(MCP_ANCHOR) === 1, 'mcp defs anchor');
const NEW_DEFS_RAW = [
  { n: 'publish_media', d: 'انتشار عکس/ویدیو/فایلی که مالک در پیوی ربات یا چت به ربات فرستاده است (آخرین رسانه).', p: { caption: { type: 'string' }, index: { type: 'number' } }, r: [] },
  { n: 'album', d: 'ساخت و انتشار آلبوم ۲ تا ۱۰ عکسی از رسانه‌های فرستاده‌شده یا چند URL.', p: { caption: { type: 'string' }, count: { type: 'number' }, urls: { type: 'array', items: { type: 'string' } } }, r: [] },
  { n: 'delete_post', d: 'حذف یک پیام از کانال با شماره.', p: { message_id: { type: 'number' }, last: { type: 'boolean' } }, r: [] },
  { n: 'replace_last', d: 'حذف آخرین پست و انتشار نسخهٔ اصلاح‌شده (عکس قبلی حفظ می‌شود).', p: { text: { type: 'string' } }, r: ['text'] },
  { n: 'pin_post', d: 'سنجاق آخرین پست (یا پیام مشخص) در کانال.', p: { message_id: { type: 'number' }, silent: { type: 'boolean' } }, r: [] },
  { n: 'unpin_post', d: 'برداشتن سنجاق.', p: {}, r: [] },
  { n: 'mute_user', d: 'بی‌صدا کردن کاربر مزاحم برای N دقیقه.', p: { user_id: { type: 'number' }, minutes: { type: 'number' } }, r: ['user_id'] },
  { n: 'ban_user', d: 'بن کردن کاربر.', p: { user_id: { type: 'number' }, delete_messages: { type: 'boolean' } }, r: ['user_id'] },
  { n: 'unban_user', d: 'رفع بن کاربر.', p: { user_id: { type: 'number' } }, r: ['user_id'] },
  { n: 'translate', d: 'ترجمهٔ متن بین فارسی/انگلیسی/عربی و چند زبان دیگر.', p: { text: { type: 'string' }, to: { type: 'string' }, from: { type: 'string' } }, r: ['text'] },
  { n: 'market', d: 'قیمت واقعی بازار: دلار، یورو، طلا (گرم ۱۸)، سکه، مثقال، بیت‌کوین، اتریوم، تتر — یا asset=همه برای همه.', p: { asset: { type: 'string' } }, r: ['asset'] },
  { n: 'make_voice', d: 'ساخت صدای گوینده از متن (فقط انگلیسی) و ارسال به پیوی مالک.', p: { text: { type: 'string' }, caption: { type: 'string' } }, r: ['text'] },
  { n: 'draft_post', d: 'به‌جای انتشار، پیش‌نویس را با دکمهٔ تأیید به مالک بفرست.', p: { text: { type: 'string' }, with_image: { type: 'boolean' } }, r: ['text'] },
  { n: 'publish_draft', d: 'انتشار یک پیش‌نویس تأییدنشده با شناسهٔ آن.', p: { draft_id: { type: 'string' } }, r: ['draft_id'] },
  { n: 'weekly_report', d: 'گزارش هفتگی کانال: تعداد پست، بازدید، پست برتر، بهترین ساعت انتشار.', p: {}, r: [] },
  { n: 'suggest', d: 'پنج ایدهٔ پست برای کانال (با توجه به مناسبت‌ها).', p: { topic: { type: 'string' } }, r: [] },
  { n: 'search_archive', d: 'جست‌وجو در پست‌های کانال.', p: { query: { type: 'string' } }, r: ['query'] },
  { n: 'rss_add', d: 'خبرخوان خودکار: از یک فید RSS هر N دقیقه خبر تازه را بازنویسی و منتشر می‌کند.', p: { url: { type: 'string' }, every_minutes: { type: 'number' }, rewrite: { type: 'boolean' }, max_per_run: { type: 'number' }, target: { type: 'string' } }, r: ['url'] },
  { n: 'rss_list', d: 'فهرست فیدهای فعال.', p: {}, r: [] },
  { n: 'rss_remove', d: 'حذف یک فید.', p: { id: { type: 'string' } }, r: ['id'] },
  { n: 'recurring_add', d: 'پست تکرارشوندهٔ روزانه: ساعت HH:MM + متن ثابت یا پرامپت هوش مصنوعی (kind=ai).', p: { at: { type: 'string' }, text: { type: 'string' }, kind: { type: 'string' }, target: { type: 'string' } }, r: ['at', 'text'] },
  { n: 'recurring_list', d: 'فهرست پست‌های تکرارشونده.', p: {}, r: [] },
  { n: 'recurring_remove', d: 'حذف یک تکرارشونده.', p: { id: { type: 'string' } }, r: ['id'] },
  { n: 'watch_add', d: 'رصد یک صفحه: اگر عوض شد (changed) یا عبارت ظاهر شد (contains) خبر می‌دهد و در صورت post=true منتشر می‌کند.', p: { url: { type: 'string' }, kind: { type: 'string' }, value: { type: 'string' }, note: { type: 'string' }, post: { type: 'boolean' }, target: { type: 'string' } }, r: ['url'] },
  { n: 'watch_list', d: 'فهرست رصدها.', p: {}, r: [] },
  { n: 'watch_remove', d: 'حذف یک رصد.', p: { id: { type: 'string' } }, r: ['id'] },
  { n: 'welcome_set', d: 'پیام خوش‌آمد عضو جدید در کانال/گروه ({name} = نام عضو). off=true خاموش می‌کند.', p: { text: { type: 'string' }, chat: { type: 'string' }, off: { type: 'boolean' } }, r: ['text'] }
];// build
const NEW_DEFS = NEW_DEFS_RAW.map(function (x) {
  return "    { name: '" + x.n + "', description: '" + x.d + "',\n      inputSchema: { type: 'object', properties: " + JSON.stringify(x.p) + ", required: [" + x.r.map(function (q) { return "'" + q + "'"; }).join(', ') + "] } }";
}).join(',\n');
src = src.replace(MCP_ANCHOR, `    { name: 'set_channel', description: 'تعیین کانال پیش‌فرض (مثل @mychannel).',
      inputSchema: { type: 'object', properties: { channel: { type: 'string' } }, required: ['channel'] } },
${NEW_DEFS}
  ];`);

/* استایل در تعریف make_image */
src = src.replace(`{ name: 'make_image', description: 'ساخت عکس با هوش مصنوعی (flux). prompt را دقیق و توصیفی بده (انگلیسی نتیجهٔ بهتری می‌دهد). عکس به تلگرام مالک هم ارسال می‌شود و برای انتشار در همین گفتگو آماده می‌ماند.',
      inputSchema: { type: 'object', properties: { prompt: { type: 'string', description: 'توصیف تصویر' } }, required: ['prompt'] } }`,
`{ name: 'make_image', description: 'ساخت عکس با هوش مصنوعی (flux). prompt را دقیق و توصیفی بده (انگلیسی نتیجهٔ بهتری می‌دهد). عکس به تلگرام مالک هم ارسال می‌شود و برای انتشار در همین گفتگو آماده می‌ماند.',
      inputSchema: { type: 'object', properties: { prompt: { type: 'string', description: 'توصیف تصویر' }, style: { type: 'string', description: 'cinematic | neon | minimal | watercolor | 3d | retro | dark' } }, required: ['prompt'] } }`);

/* ── ۶) تیک هر دقیقه ───────────────────────────────────────────────────── */
const CRON = 'await runAutoPosts(env).catch((e) => console.warn("auto posts", e && e.message));';
must(count(CRON) === 1, 'cron anchor');
src = src.replace(CRON, CRON + '\n      try { await spTick(env); } catch (e) { console.warn("sp tick", e && e.message); }');

/* ── ۷) دکمه‌های تأیید ─────────────────────────────────────────────────── */
const CBB = 'async function handleCallback(cb, env, origin) {';
must(count(CBB) === 1, 'handleCallback anchor');
src = src.replace(CBB, CBB + '\n  { const spDone = await spCallback(env, cb); if (spDone) return; }');

/* ── ۸) ورود عضو جدید ──────────────────────────────────────────────────── */
const CM = `          } else if (update.message) {
            const cmdrSeen`;
must(count(CM) === 1, 'chat_member anchor');
src = src.replace(CM, `          } else if (update.chat_member) {
            await spChatMember(env, update.chat_member);
          } else if (update.message) {
            const cmdrSeen`);

fs.writeFileSync(target, src);
console.log('✅ patched: ' + target + ' (superpowers)');
