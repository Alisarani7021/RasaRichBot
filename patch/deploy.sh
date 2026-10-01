#!/usr/bin/env bash
# دیپلوی ورکر زنده + بازبینی سورس (اگر 0 برگرداند یعنی کد اشتباه آپلود شده)
set -euo pipefail
cd "$(dirname "$0")/../.."
TOK=$(cat .cf/token); ACC=ab05b8b5f2822a491ec407585327eb8f
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/scripts/rich-post-bot" \
  -H "Authorization: Bearer $TOK" \
  -F 'metadata=@cf/rich-post-bot/deploy_metadata.json;type=application/json' \
  -F 'index.js=@cf/rich-post-bot/index.js;filename=index.js;type=application/javascript+module' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('دیپلوی:', '✅' if d.get('success') else '❌ '+json.dumps(d.get('errors'),ensure_ascii=False)[:200])"
sleep 8
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/scripts/rich-post-bot" -H "Authorization: Bearer $TOK" -o /tmp/live_check.js
printf 'حجم زنده: %s بایت\n' "$(wc -c < /tmp/live_check.js)"
for s in "api/mcp" maybeCommander mcpHandle spTool spTick spCaptureMedia; do printf '%s=%s ' "$s" "$(grep -c "$s" /tmp/live_check.js)"; done; echo
S=$(cat .cf/mcp_secret)
curl -s --max-time 30 -X POST "https://rich-post-bot.4lisarani-1.workers.dev/api/mcp/$S" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' \
  | python3 -c "import sys,json;r=json.load(sys.stdin).get('result') or {};print('MCP زنده:', '✅' if r.get('serverInfo') else '❌')"
curl -s --max-time 30 -X POST "https://rich-post-bot.4lisarani-1.workers.dev/api/mcp/$S" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | python3 -c "
import sys,json
d=json.load(sys.stdin); ts=d.get('result',{}).get('tools',[])
names=[t['name'] for t in ts]
need=['publish_media','album','market','translate','rss_add','recurring_add','watch_add','draft_post','weekly_report','welcome_set']
print('ابزارها:', len(names), '✅' if len(names)>=35 and all(n in names for n in need) else '❌ ناقص: '+str([n for n in need if n not in names]))"
