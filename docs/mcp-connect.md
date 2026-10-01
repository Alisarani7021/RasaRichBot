# 🔌 اتصال مستقیم Gemini به رِسا (MCP)

> **بله، شدنی است.** همان صفحه‌ای که دیدی — Gemini → Settings → Connected Apps → **«Custom apps»** → «Set up a custom connected app» —
> برای همین است. رِسا حالا یک دریچهٔ **MCP** دارد و جمنای می‌تواند ابزارهایش را مستقیم صدا بزند:
> آمار بگیرد، عکس بسازد، در کانال منتشر کند، مناسبت بپرسد، نظرسنجی بگذارد…

## آدرسی که در آن کادر باید بزنی
```
https://rich-post-bot.4lisarani-1.workers.dev/api/mcp/<MCP_SECRET>
```
- `<MCP_SECRET>` کلید اختصاصی توست (در پیوی ربات برایت فرستادم؛ در فایل محلی `.cf/mcp_secret` هم هست).
- **حتماً با `https://` شروع شود** — پیام خطایی که گرفتی («Please enter a valid URL starting with https://») برای همین بود.
- Client ID / Client secret در بخش Additional settings را **خالی بگذار** — رِسا احراز هویت جدا ندارد؛ کلید داخل خود آدرس است.

## قدم‌به‌قدم در Gemini (گوشی یا وب)
1. `gemini.google.com/apps` → بخش **Custom apps for Spark** (یا با همان مسیر Settings → Connected Apps).
2. **Add a custom app** → آدرس بالا را پیست کن → **Next**.
3. اگر پرسید کلید OAuth → **خالی بگذار** و Next.
4. تیک «I understand and accept…» را بزن (اسکرول کن تا دکمه فعال شود).
5. صفحهٔ «Save your custom app» → اسم: **رِسا** → ذخیره.
6. تمام. حالا در چت جمنای بنویس:
```
آمار دیروز کانالم چطور بود؟
یه عکس از غروب تهران بساز و تو کانال بذار
مناسبت فردا چیه؟
```
جمنای خودش ابزارهای رِسا را صدا می‌زند و کار واقعاً انجام می‌شود.

> ⚠️ شرط‌های گوگل: اشتراک **Google AI Pro/Ultra** (داری ✅)، رابط انگلیسی، و روشن‌بودن Activity.
> همان‌طور که دیدی، این بخش در اکانت تو فعال است.

## ابزارهایی که جمنای می‌بیند (۳۶ ابزار — بعد از b43)
| ابزار | کار |
|---|---|
| `make_image` | ساخت عکس (flux) + نمایش تصویر به جمنای و ارسال به پیوی تو |
| `publish_post` | انتشار پست ریچ در کانال (با عکس اختیاری) |
| `get_stats` | آمار واقعی: دیروز/پریروز، بازدید، پست‌های برتر |
| `get_occasions` | مناسبت رسمی امروز/فردا (شمسی) |
| `web_fetch` | خواندن یک لینک برای خلاصه‌کردن |
| `poll` | نظرسنجی در کانال |
| `schedule_post` | زمان‌بندی انتشار (۱ تا ۱۰۰۸۰ دقیقه بعد) |
| `delete_last` | حذف آخرین پستِ منتشرشده |
| `set_channel` | تعیین کانال پیش‌فرض |

## فنی (برای توسعه)
- مسیر: `POST /api/mcp/<MCP_SECRET>` — **StreamableHTTP**، بدون نیاز به OAuth (سرور هرگز 401 با WWW-Authenticate نمی‌دهد تا کلاینت در OAuth گیر نکند).
- پروتکل‌ها: `2024-11-05` تا `2026-07-28`؛ پاسخ‌ها هم `application/json` و هم (اگر Accept فقط SSE باشد) `text/event-stream`.
- متدها: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `resources/list`, `prompts/list`, `logging/setLevel`, `DELETE` (پایان نشست)؛ `GET` → 405.
- امنیت: بدون `<MCP_SECRET>` → 401. کلید = خودِ مسیر آدرس یا هدر `x-rasa-mcp-key`.
- هر انتشار از مسیر MCP، یک پیام تأیید «🔌 از طریق MCP منتشر شد» در پیوی مالک می‌فرستد.
- بایندینگ‌ها در `deploy_metadata.json`: `AI` (مغز/عکس)، `MCP_SECRET`، `CMD_CHANNEL` (کانال پیش‌فرض)، `COMMANDER_ON`.

## تست
```bash
node cf/sim/mcp_test.mjs cf/sim/bundle_v27.mjs     # ۱۷ بررسی (initialize/tools/list/tools/call/خطاها)
node cf/sim/commander_test.mjs all                 # ۶ سناریوی چت/ویس فرمانده
```
