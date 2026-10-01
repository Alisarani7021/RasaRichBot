#!/usr/bin/env node
/* b41 — «فرمانده»: چت با ربات (تایپ/ویس) = اجرا در کانال.
   مغز: Workers AI داخل ورکر (بایندینگ AI) یا دروازهٔ تستی یا کلید جمنای.
   Usage: node patch_commander.mjs <bundle.mjs>                                  */
import fs from 'node:fs';

const target = process.argv[2] || 'cf/sim/bundle_v26.mjs';
let src = fs.readFileSync(target, 'utf8');
const snip = fs.readFileSync(new URL('./snippets/commander.js', import.meta.url), 'utf8');

const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('maybeCommander') === 0, 'already patched');

/* ── ۰) پیش‌نیازها: توابع موتور روزانه باید وجود داشته باشند ─────────── */
for (const fn of ['function jalaliOf', 'function tehranDate', 'async function occasionsFor', 'async function channelDayStats', 'function occRank']) {
  must(count(fn) >= 1, 'پیش‌نیاز پیدا نشد: ' + fn);
}

/* ── ۱) موتور فرمانده قبل از تیک‌های زنده (هم‌جوار با موتور روزانه) ───── */
const ENG = '\nasync function applyLiveTick(env, job) {';
must(count(ENG) === 1, 'applyLiveTick anchor not found');
src = src.replace(ENG, snip.trimEnd() + '\n\n' + ENG);

/* ── ۲) قلاب در onUpdate: پیام‌های پیوی مالک ────────────────────────────── */
const HOOK = `          } else if (update.message) {
            await handleMessage(update.message, env, origin);`;
must(count(HOOK) === 1, 'handleMessage anchor not found');
src = src.replace(HOOK, `          } else if (update.message) {
            const cmdrSeen = update.message.chat && update.message.chat.type === 'private'
              ? await maybeCommander(env, update.message, update.message.from, origin)
              : false;
            if (!cmdrSeen) await handleMessage(update.message, env, origin);`);

fs.writeFileSync(target, src);
console.log('✅ patched: ' + target + ' (+' + (src.length - 0) + ' bytes, commander)');
