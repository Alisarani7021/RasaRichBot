#!/usr/bin/env bash
# بازسازی کامل b43 (فرمانده + دریچهٔ MCP + قدرت‌های نسل بعد) از پایه
# برای وقتی فایل‌ها بین نوبت‌ها عقب می‌افتند. اجرا: bash cf/patch/rebuild.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
# ۱) snippet ها و پچ‌ها (اگر نبودند از gh/patch برگردان)
for f in commander.js mcp_server.js superpowers.js superpowers2.js; do
  [ -f "cf/patch/snippets/$f" ] || { echo "↩️  $f از gh/patch برگردانده شد"; cp "gh/patch/$f" "cf/patch/snippets/$f"; }
done
for f in patch_commander.mjs patch_mcp.mjs patch_superpowers.mjs patch_refinements.mjs; do
  [ -f "cf/patch/$f" ] || { echo "↩️  $f از gh/patch برگردانده شد"; cp "gh/patch/$f" "cf/patch/$f"; }
done
[ -f cf/sim/assets/voice_test.json ] || cp gh/tests/assets/voice_test.json cf/sim/assets/voice_test.json 2>/dev/null || echo "⚠️  cf/sim/assets/voice_test.json نیست"
# ۲) زنجیرهٔ پچ
cp cf/sim/bundle_v25.mjs cf/sim/bundle_v28.mjs
node cf/patch/patch_commander.mjs cf/sim/bundle_v28.mjs
node cf/patch/patch_mcp.mjs cf/sim/bundle_v28.mjs
node cf/patch/patch_superpowers.mjs cf/sim/bundle_v28.mjs
node cf/patch/patch_refinements.mjs cf/sim/bundle_v28.mjs
# ۳) تست‌ها (همه باید صفر خطا باشند)
node cf/sim/mcp_test.mjs cf/sim/bundle_v28.mjs | tail -1
node cf/sim/sp_test.mjs  cf/sim/bundle_v28.mjs | tail -1
node cf/sim/sp2_test.mjs cf/sim/bundle_v28.mjs | tail -1
# ۴) کپی به هر سه محل
cp cf/sim/bundle_v28.mjs gh/worker/index.js
cp cf/sim/bundle_v28.mjs cf/rich-post-bot/index.js
printf 'حجم: %s بایت\n' "$(wc -c < cf/sim/bundle_v28.mjs)"
for s in "api/mcp" maybeCommander mcpHandle spTool spTick spCallback spChatMember spCaptureMedia spTool2 spWebServe spTick2; do printf '%s=%s ' "$s" "$(grep -c "$s" cf/sim/bundle_v28.mjs)"; done; echo
echo "✅ b43 بازسازی شد: cf/sim/bundle_v28.mjs"
