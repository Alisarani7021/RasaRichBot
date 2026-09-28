# 🚢 Deployment

## Wrangler

```bash
wrangler deploy
```

## API Multipart (Recommended — preserves secrets)

```bash
# See worker/wrangler.toml for bindings
# Use FormData with metadata + index.js + rasa-src/*

curl -X PUT https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/rich-post-bot \
  -H "Authorization: Bearer $TOKEN" \
  -F 'metadata={"main_module":"index.js","compatibility_date":"2026-09-28","bindings":[...]};type=application/json' \
  -F "index.js=@worker/index.js;type=application/javascript+module" \
  -F "rasa-src/glue.js=@worker/src/glue.js;type=application/javascript+module"
  # ... etc
```

## Secrets

```bash
wrangler secret put BOT_TOKEN
wrangler secret put WEBHOOK_SECRET
```

## Webhook

```bash
curl -X POST https://api.telegram.org/bot$BOT_TOKEN/setWebhook \
  -d '{"url":"https://rich-post-bot.4lisarani-1.workers.dev/webhook","secret_token":"...","allowed_updates":["message","callback_query","my_chat_member"]}'

curl -X POST https://api.telegram.org/bot$BOT_TOKEN/setChatMenuButton \
  -d '{"menu_button":{"type":"web_app","text":"رِسا","web_app":{"url":"https://rich-post-bot.4lisarani-1.workers.dev/app"}}}'
```

## KV Seeding

Assets are in RASA_KV (f7714cd6...), emoji map in KV (8eff...).

To seed miniapp assets:

```bash
wrangler kv:key put --binding=RASA_KV "asset:app.html" --path=miniapp/app.html
```
