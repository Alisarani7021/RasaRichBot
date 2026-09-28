# 🏗 Architecture — معماری رِسا

## Overview

RasaRichBot is a **dual-app Cloudflare Worker** that preserves the original Post Studio 100% while additively mounting Rasa Mini App.

## Entry Point

```js
// index.js — only 2 additive lines
import { tryRasaApp } from "./rasa-src/glue.js"; // LINE 1

// inside fetch handler after new URL(request.url)
const rasaResponse = await tryRasaApp(request, env, ctx, url)
  .catch(e => new Response('rasa app error: '+e.message, {status:500}));
if (rasaResponse) return rasaResponse; // LINE 2

// ... rest is original Post Studio bundle (2,517,846B) untouched
```

## Storage

| Binding | ID | Purpose | Size |
|---------|----|---------|------|
| KV | 8eff5bd6... | Emoji map/packs/variants | 44KB + 12KB + 112KB |
| KV_FRESH | 320758... | Posts, drafts, channels | Dynamic |
| RASA_KV | f7714cd6... | Mini App assets | 93KB + 500KB |
| STATE | c191ec21... | Durable Object global | - |

## Request Flow

```
Telegram Update → /webhook (secret check 403) → handleCallback/handleMessage
User opens Mini App → /app (from RASA_KV) → /api/session (HMAC) → token
Mini App → /api/context (token) → channels/drafts/templates
Publish → /api/publish → validateRich → sanitize URLs → sendRichMessage to DM → copyMessage to channel
```

## Security

- Webhook: `X-Telegram-Bot-Api-Secret-Token` must equal `WEBHOOK_SECRET`
- Mini App: `WebAppData` HMAC with BOT_TOKEN
- Rasa Token: HMAC of payload with `BOT_TOKEN::rasa-app`, 32 hex, 1h expiry
- Admin: Optional `ADMIN_KEY` bearer or `ADMINS_ID` whitelist
