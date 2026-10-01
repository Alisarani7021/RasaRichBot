#!/usr/bin/env node
/* b46 — ربات حتی بدون هوش مصنوعی کار می‌کند: پاسخ آماده + خطای فارسی انسانی
   زنجیره: v25 → commander → mcp → superpowers → refinements → installer → manner
   Usage: node patch_manner.mjs <bundle.mjs>                                        */
import fs from 'node:fs';

const target = process.argv[2] || 'cf/sim/bundle_v28.mjs';
let src = fs.readFileSync(target, 'utf8');
const snip = fs.readFileSync(new URL('./snippets/superpowers4.js', import.meta.url), 'utf8');

const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('spCmdFast') === 0, 'already patched');
must(count('spSelfInstall') >= 2, 'installer اول لازم است');

/* ۱) موتور */
const ENG = '\nasync function applyLiveTick(env, job) {';
must(count(ENG) === 1, 'applyLiveTick anchor');
src = src.replace(ENG, '\n' + snip.trimEnd() + '\n' + ENG);

/* ۲) خطای انسانی به‌جای متن خام */
const ERR = `  } catch (e) {
    try { await cmdSay(env, message.chat.id, '⚠️ خطا: ' + String(e && e.message || e).slice(0, 300)); } catch (e2) {}
  }`;
must(count(ERR) === 1, 'error anchor');
src = src.replace(ERR, `  } catch (e) {
    try { await spCmdFallback(env, message, e); } catch (e2) {}
  }`);

/* ۳) پاسخ‌های آمادهٔ بدون AI — قبل از فرستادن به مغز */
const ANCHOR = '  var isVoice = !!(message.voice || message.audio);';
must(count(ANCHOR) === 1, 'commander entry anchor');
src = src.replace(ANCHOR, `  if (!message.voice && !message.audio && String(message.text || '').trim()) {
    const spFast = await spCmdFast(env, message, user, message.text);
    if (spFast) return true;
  }
` + ANCHOR);

fs.writeFileSync(target, src);
console.log('✅ patched: ' + target + ' (manner)');
