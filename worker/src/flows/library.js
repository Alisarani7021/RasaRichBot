/* lite: templates slice used by the rasa mini app (flows/library.js) */
import { block } from '../rich/kit.js';

export const BUILTIN_TEMPLATES = [
  { key: 'welcome', fa: 'خوش‌آمد کانال', en: 'Channel welcome' },
  { key: 'promo', fa: 'پست تبلیغاتی', en: 'Promo post' },
  { key: 'howto', fa: 'آموزش گام‌به‌گام', en: 'How-to' },
  { key: 'report', fa: 'گزارش با جدول', en: 'Report + table' },
  { key: 'buttons', fa: 'همه‌ی دکمه‌ها', en: 'Every button' },
  { key: 'media', fa: 'پست مدیا', en: 'Media post' }
];

export function builtinTemplate(key, lang = 'fa') {
  const fa = lang === 'fa';
  switch (key) {
    case 'welcome':
      return {
        html: [
          block.h(1, fa ? '👋 به کانال ما خوش آمدی' : '👋 Welcome to our channel'),
          block.p(fa ? 'اینجا هر هفته یک آموزش کوتاه و کاربردی می‌گذریم.' : 'A short, practical lesson every week.'),
          block.h(3, fa ? 'چه چیزی یاد می‌گیری؟' : 'What you get'),
          block.ul([fa ? '✅ آموزش‌های ۵ دقیقه‌ای' : '✅ 5-minute lessons', fa ? '✅ نمونه‌کد آماده' : '✅ Ready-to-use snippets', fa ? '✅ پاسخ به سؤال‌ها' : '✅ Answers to your questions']),
          block.quote(fa ? 'یادگیری وقتی ساده است که هر روز کمی باشد.' : 'Learning is easy when it is a little every day.')
        ].join('\n'),
        is_rtl: fa
      };
    case 'promo':
      return {
        html: [
          block.h(1, fa ? '🚀 نسخه‌ی جدید منتشر شد' : '🚀 The new version is out'),
          block.p(fa ? 'همه‌ی آن‌چه خواسته بودید، یک‌جا و سه برابر سریع‌تر.' : 'Everything you asked for, three times faster.'),
          block.tasks([{ text: fa ? 'رابط تازه' : 'New interface', done: true }, { text: fa ? 'همگام‌سازی خودکار' : 'Auto sync', done: true }, { text: fa ? 'حالت شب' : 'Dark mode', done: false }]),
          block.p(fa ? 'همین حالا امتحان کن و <mark>۷ روز رایگان</mark> داشته باش.' : 'Try it now with <mark>7 days free</mark>.'),
          block.btnRow([{ label: fa ? 'شروع کن ↗' : 'Start ↗', type: 'url', style: 'success', value: 'https://t.me' }], 'center')
        ].join('\n'),
        is_rtl: fa
      };
    case 'howto':
      return {
        html: [
          block.h(1, fa ? '🧪 ساخت پیام ریچ در ۳ قدم' : '🧪 Rich message in 3 steps'),
          block.ol([fa ? 'متن را بنویس' : 'Write the text', fa ? 'مارک‌آپ بزن' : 'Add markup', fa ? 'ارسال کن' : 'Send it']),
          block.h(3, fa ? 'نمونه‌ی کد' : 'Code sample'),
          block.pre(fa ? 'sendRichMessage({ rich_message: { html } })' : 'sendRichMessage({ rich_message: { html } })', 'javascript'),
          block.quote(fa ? 'نکته: هر تگ باید بسته شود.' : 'Tip: close every tag.', { expandable: true })
        ].join('\n'),
        is_rtl: fa
      };
    case 'report':
      return {
        html: [
          block.h(1, fa ? '📊 گزارش هفتگی' : '📊 Weekly report'),
          block.table([
            [{ text: fa ? 'شاخص' : 'Metric', header: true }, { text: fa ? 'مقدار' : 'Value', header: true, align: 'center' }, { text: fa ? 'تغییر' : 'Change', header: true, align: 'right' }],
            [{ text: fa ? 'کاربران' : 'Users' }, { text: '12,480', align: 'center' }, { text: '+8%', align: 'right' }],
            [{ text: fa ? 'درآمد' : 'Revenue' }, { text: '$2,140', align: 'center' }, { text: '+12%', align: 'right' }]
          ], { bordered: true, striped: true, caption: fa ? 'هفته‌ی ۳۹' : 'Week 39' }),
          block.footer(fa ? 'منبع: پنل داخلی' : 'Source: internal dashboard')
        ].join('\n'),
        is_rtl: fa
      };
    case 'buttons':
      return {
        html: [
          block.h(2, fa ? '🔘 انواع دکمه‌ی ریچ' : '🔘 Rich button types'),
          block.btnRow([
            { label: 'URL', type: 'url', style: 'success', value: 'https://t.me' },
            { label: 'callback', type: 'callback_data', style: 'link', value: 'demo' },
            { label: 'copy', type: 'copy_text', value: 'COPIED-1234' }
          ], 'left'),
          block.btnRow([
            { label: 'search', type: 'switch_inline_query', style: 'primary', value: 'rich' },
            { label: 'disabled', type: 'disabled' }
          ], 'center')
        ].join('\n'),
        is_rtl: fa
      };
    case 'media':
    default:
      return {
        html: [
          block.h(2, fa ? '🖼 پست مدیا' : '🖼 Media post'),
          block.p(fa ? 'عکس‌ها را از کتابخانه‌ی رسانه اضافه کن: به ربات عکس بفرست، بعد در طراح دستی «افزودن بخش → عکس» را بزن.' : 'Add photos from the media library: send one to the bot, then use “Add → Photo”.'),
          block.hr(),
          block.footer(fa ? 'نمونه‌ی چیدمان' : 'Layout sample')
        ].join('\n'),
        is_rtl: fa
      };
  }
}
