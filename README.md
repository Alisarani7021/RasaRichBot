<div align="center">

<img src="./banner.png" width="100%" alt="Rasa Studio" />

<br/>

<img src="./logo.png" width="96" alt="رِسا" />

# رِسا · Rasa Studio

**استودیوی پست تلگرام — پست‌های ریچ، ایموجی پرمیوم، مینی‌اپ فارسی و لینک شخصی هوش مصنوعی**

یک ربات، یک مینی‌اپ، بدون سرور — همه‌چیز روی Cloudflare Workers.

<a href="https://t.me/RasaRichBot"><img src="https://img.shields.io/badge/ورود%20به%20ربات-@RasaRichBot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" /></a>
<a href="https://rich-post-bot.4lisarani-1.workers.dev/app"><img src="https://img.shields.io/badge/استودیو%20(مینی‌اپ)-Live-2DD4BF?style=for-the-badge&logo=googlechrome&logoColor=white" /></a>

<img src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" />
<img src="https://img.shields.io/badge/Telegram%20Bot%20API-10.3-26A5E4?style=flat-square&logo=telegram&logoColor=white" />
<img src="https://img.shields.io/badge/Storage-3×KV%20+%20Durable%20Objects-7C3AED?style=flat-square" />
<img src="https://img.shields.io/badge/UI-%D9%81%D8%A7%D8%B1%D8%B3%DB%8C%20(RTL)-F59E0B?style=flat-square" />
<img src="https://img.shields.io/badge/License-MIT-10B981?style=flat-square" />

</div>

<div dir="rtl">

## ✨ رِسا چه می‌کند

- **پست ریچ، درست و بی‌نقص** — تیتر، لیست، نقل‌قول، جدول، دکمه و امضای اختصاصی؛ بدون تگ خام، بدون خرابی.
- **ایموجی پرمیوم** — همان آرتی که می‌زنی همان می‌رود؛ تبچر خودکار و یک نقشهٔ ۱۶۰۰+ آیکون.
- **مینی‌اپ کامل** — ساخت و پیش‌نمایش پست، کتابخانه، قالب‌ها، زمان‌بندی، گزارش آمار و اتصال کانال.
- **عکس با هوش مصنوعی** — ساخت تصویر و انتشار همان عکس با کپشن در کانال.
- **ابزارهای روزمره** — قیمت بازار، نرخ طلا و ارز، ترجمه، وب‌خوان، رصد گیت‌هاب و سایت‌ساز HTML.
- **لینک شخصی هوش مصنوعی (MCP)** — هرکس لینک خودش را می‌سازد؛ کلاد و جمنای و گروک به آن وصل می‌شوند و خروجی، اول به **پیوی خودش** می‌آید.

## 🚀 شروع سریع

**۱)** ربات را باز کن: [@RasaRichBot](https://t.me/RasaRichBot) و یک پیام بفرست.

**۲)** استودیو را باز کن: [مینی‌اپ رِسا](https://rich-post-bot.4lisarani-1.workers.dev/app) — یا از منوی ربات.

**۳)** پیامت را بنویس، تیتر و دکمه بگذار، پیش‌نمایش بگیر و در کانالت منتشر کن.

> راهنمای گام‌به‌گام فارسی: [docs/](docs/) — از [اتصال MCP](docs/mcp-connect.md) تا [موتور ایموجی](docs/EMOJI_ENGINE.md).

## 🧠 لینک شخصی (MCP)

در مینی‌اپ → بخش **⚡ نسخهٔ اختصاصی**:

۱. با یک توکن کلادفلر (فقط یک‌بار) یک ورکر شخصی روی حساب خودت ساخته می‌شود.
۲. **لینک شخصی‌ات ساخته و ذخیره می‌شود** — همیشه همان‌جا در دسترس است.
۳. لینک را در **کلاد** (Settings → Connectors) یا **جمنای** (Connected Apps) یا **گروک** (Connectors) اضافه کن.

هرچه از آن لینک بفرستند (متن، عکس، تیتر، دکمه) با ربات رِسا منتشر می‌شود — به پیوی خودت یا به کانالت، هر کدام را که انتخاب کنی.

## 🗂 ساختار

```text
worker/index.js      ورکر اصلی (روی Cloudflare Workers)
miniapp/app.html     مینی‌اپ (تک‌فایل، فارسی، RTL)
docs/                راهنماها و مستندات فنی
patch/ tests/ tools/ اسکریپت‌های ساخت، تست و ابزارها
```

## 🛠 فنی

- **اجرا:** Cloudflare Workers (ESM) — بدون سرور و بدون دیتابیس جدا.
- **داده:** ۳ فضای KV + یک Durable Object + فضای STATE.
- **هوش مصنوعی:** Workers AI (سهمیهٔ خودِ کاربر در نسخهٔ اختصاصی).
- **تلگرام:** Bot API 10.3 — پیام‌های ریچ، دکمه‌های شیشه‌ای و ایموجی پرمیوم.

## 📄 مجوز

MIT — استفاده و تغییر آزاد است. ساختهٔ [@Alisarani7021](https://github.com/Alisarani7021)

</div>
