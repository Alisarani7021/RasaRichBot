#!/usr/bin/env node
/* b47 — «مثل قبل»: استودیو صاحب پیام‌های معمولی است؛ AI فقط با /ai
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
must(count('getStartKeyboard') >= 1, 'study anchors');

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

/* ۳) دروازهٔ ورودی: هر پیام معمولی → استودیو (مثل قبل). فقط «/ai …» → هوش مصنوعی */
const ANCHOR = '  var isVoice = !!(message.voice || message.audio);';
must(count(ANCHOR) === 1, 'commander entry anchor');
src = src.replace(ANCHOR, `  /* b47 — استودیو صاحب متن/عکس/ویس است؛ AI فقط با /ai */
  try { await spCaptureMedia(env, message); } catch (e) { }
  var spTxt = String(message.text || '').trim();
  if (!/^\\/ai(\\s|$)/i.test(spTxt)) return false;
  var spBody = spTxt.replace(/^\\/ai\\s*/i, '').trim();
  if (!spBody) {
    await cmdSay(env, uid, 'بعد از /ai خواسته‌ات را بنویس. مثلاً:\\n/ai قیمت دلار\\n\\n(طراحی پست مثل قبل است — فقط متن را معمولی بفرست.)');
    return true;
  }
  const spFast = await spCmdFast(env, message, user, spBody);
  if (spFast) return true;
  message = Object.assign({}, message, { text: spBody });
` + ANCHOR);

fs.writeFileSync(target, src);
console.log('✅ patched: ' + target + ' (manner)');
