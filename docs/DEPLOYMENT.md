# 🚢 استقرار — Deployment

> این سند فرض می‌کند حساب Cloudflare و ربات تلگرام را داری. هیچ مقدار واقعی سکرتی در این فایل نیست.

---

## ۰. پیش‌نیازها

| مورد | توضیح |
|---|---|
| Cloudflare account | پلن رایگان کافی است |
| ربات تلگرام | از [@BotFather](https://t.me/BotFather) |
| Node + Wrangler | `npm i -g wrangler` |

---

## ۱. بایندینگ‌ها

```toml
# worker/wrangler.toml
name = "rich-post-bot"
main = "index.js"
compatibility_date = "2026-09-28"

[[kv_namespaces]]
binding = "KV"          # دیتابیس اموجی و داده‌ی کم‌تغییر
id = "<KV_ID>"

[[kv_namespaces]]
binding = "KV_FRESH"    # پست‌ها، پیش‌نویس‌ها، رسانه
id = "<KV_FRESH_ID>"

[[kv_namespaces]]
binding = "RASA_KV"     # دارایی‌های مینی‌اپ
id = "<RASA_KV_ID>"

[[durable_objects.bindings]]
name = "STATE"
class_name = "State"

[vars]
WEBHOOK_PATH = "/telegram/webhook"
```

---

## ۲. سکرت‌ها

```bash
wrangler secret put BOT_TOKEN         # توکن ربات
wrangler secret put WEBHOOK_SECRET    # رشته‌ی تصادفی (۲۴ بایت hex)
wrangler secret put ADMIN_KEY         # اختیاری: توکن اپراتور
```

> 🔒 مقادیر واقعی را فقط در `.dev.vars` یا سکرت‌های Cloudflare نگه دار. `.dev.vars` در `.gitignore` هست و نباید هرگز کامیت شود.

---

## ۳. دیپلوی

### الف) با Wrangler

```bash
cd worker
npx wrangler deploy
```

### ب) با API چندبخشی (سکرت‌ها حفظ می‌شوند)

```bash
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/rich-post-bot" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F 'metadata={
        "main_module": "index.js",
        "compatibility_date": "2026-09-28",
        "keep_bindings": ["secret_text"],
        "bindings": [
          { "name": "KV",        "type": "kv_namespace", "namespace_id": "<KV_ID>" },
          { "name": "KV_FRESH",  "type": "kv_namespace", "namespace_id": "<KV_FRESH_ID>" },
          { "name": "RASA_KV",   "type": "kv_namespace", "namespace_id": "<RASA_KV_ID>" },
          { "name": "STATE",     "type": "durable_object_namespace", "class_name": "State", "namespace_id": "<DO_ID>" },
          { "name": "WEBHOOK_PATH", "type": "plain_text", "text": "/telegram/webhook" }
        ]
      };type=application/json' \
  -F "index.js=@worker/index.js;type=application/javascript+module"
```

**نکات مهمی که تجربه‌ی عملی ثابت کرده:**

1. `keep_bindings: ["secret_text"]` لازم است، وگرنه هر آپدیت `BOT_TOKEN`، `WEBHOOK_SECRET` و `ADMIN_KEY` را پاک می‌کند.
2. اگر بایندینگ سکرت را در `bindings` بیاوری ولی مقدارش را ندهی، آپلود با خطای `invalid or missing text property` رد می‌شود — پس یا در `keep_bindings` بماند، یا مقدارش را بده.
3. ورکرهایی که Durable Object دارند، **نباید** در آپلودهای بعدی فیلد `migrations` تکراری بفرستند؛ ارسال مکرر همان تگ، خطای `Actor migration tag precondition failed` می‌دهد.

---

## ۴. ثبت وبهوک

```bash
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
        "url": "https://<worker-domain>/telegram/webhook",
        "secret_token": "<WEBHOOK_SECRET>",
        "allowed_updates": ["message", "callback_query", "my_chat_member"],
        "drop_pending_updates": false
      }'
```

بررسی وضعیت:

```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

---

## ۵. دارایی‌های مینی‌اپ

پوسته و فایل‌های استاتیک از KV خوانده می‌شوند:

```bash
NS=<RASA_KV_ID>
ACCT=<ACCOUNT_ID>

# پوسته‌ی مینی‌اپ
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCT/storage/kv/namespaces/$NS/values/asset%3Aapp.html" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" --data-binary @miniapp/app.html

# فونت، لوگو، تصویر و صدای برند
for f in fonts/vazirmatn-regular.woff2 fonts/vazirmatn-bold.woff2 logo-mark.png brand-hero.jpg brand-audio.mp3; do
  key=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote('asset:'+sys.argv[1],safe=''))" "$f")
  curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCT/storage/kv/namespaces/$NS/values/$key" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" --data-binary "@miniapp/assets/$f"
done
```

---

## ۶. چک‌لیست سلامت

```bash
curl -I  "https://<worker-domain>/"                 # 200 صفحه‌ی استودیو
curl -I  "https://<worker-domain>/app"              # 200 مینی‌اپ
curl -X POST "https://<worker-domain>/api/session"  # 401 (احراز هویت فعال)
curl -X POST -H "x-telegram-bot-api-secret-token: wrong" \
     "https://<worker-domain>/telegram/webhook"     # 403 (سکرت بررسی می‌شود)
```

اگر مورد سوم ۲۰۰ داد و نه ۴۰۱، یعنی مسیر `/api/*` اشتباه ثبت شده است. اگر مورد چهارم ۲۰۰ داد، یعنی `WEBHOOK_SECRET` روی ورکر ست نشده.

---

## ۷. برگرداندن نسخه (Rollback)

هر انتشار یک بسته‌ی مستقل است؛ برگشت یعنی همان فایل قبلی را دوباره آپلود کنی:

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/rich-post-bot" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F 'metadata=@deploy_metadata.json;type=application/json' \
  -F "index.js=@backup/index.previous.js;type=application/javascript+module"
```

برای مینی‌اپ هم کافی است همان مقدار قبلی `asset:app.html` را دوباره در KV بنویسی.

---

## ۸. اگر سکرتی لو رفت

1. توکن ربات را در BotFather با `/revoke` باطل کن و توکن تازه بگیر.
2. `BOT_TOKEN` را دوباره ست کن:
   ```bash
   curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/rich-post-bot/secrets" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
     -d '{"name":"BOT_TOKEN","text":"<NEW_TOKEN>","type":"secret_text"}'
   ```
3. `WEBHOOK_SECRET` تازه بساز، آن را روی ورکر بنشان و وبهوک را با همان مقدار دوباره ثبت کن.
4. اگر سکرت در گیت‌هاب پابلیک مانده، آن را از فایل حذف کن — ولی بدان **پاک کردن فایل کافی نیست**؛ تا وقتی توکن باطل نشده، هر کسی از تاریخچه هم می‌تواند برش دارد. ابطال، اصل کار است.
