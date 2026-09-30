/* Patch (worker): «همان اموجی‌ای که زدی، همان آرت فرستاده شود».
 *
 * The emoji bar used to paste a raw `<tg-emoji>` tag — unreadable in a form
 * field — and the fallback (plain character) lost the art. Now the mini app
 * stores a tapped emoji as «character + invisible marker + base36 id», which
 * keeps the field clean and lets the worker rebuild the exact premium tag:
 *
 *   • rich body (levels / slideshow / poll)  →  marker becomes a real tag
 *   • poll title, subtitle, table cells      →  the live renderer keeps tags
 *   • poll option buttons                    →  marker becomes the button icon
 *   • anywhere tags cannot work (list titles, plain text, captions) → stripped
 *
 * Nothing here re-dresses emojis the user merely typed: no map-based
 * substitution is involved, only what was tapped on purpose.
 *
 * Idempotent: refuses to run twice. Usage: node patch_emoji_marker.mjs <bundle.js>
 */
import fs from 'node:fs';

const target = process.argv[2];
if (!target) { console.error('usage: node patch_emoji_marker.mjs <bundle.js>'); process.exit(1); }
let src = fs.readFileSync(target, 'utf8');
const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('function markerTags(') === 0, 'already patched');
must(count('function liveTagify(') === 0, 'already patched (renderer)');

/* ── 1) helpers, right after plainEmojis ────────────────────────────────── */
const HELPER_ANCHOR = 'function plainEmojisDeep(state) {';
must(count(HELPER_ANCHOR) === 1, 'plainEmojisDeep anchor not found');
const HELPERS = `/* «کاراکتر + نشانهٔ نامرئی + شناسه base36» = اموجی پرمیومی که کاربر
   خودش از پیکر انتخاب کرده است. تگ فقط جایی معنا دارد که تلگرام ریچ را
   پارس می‌کند؛ همه‌جای دیگر نشانه حذف می‌شود تا متن تمیز بماند. */
var INT_MARK = /(\\p{Extended_Pictographic}\\uFE0F?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)\\u2063([0-9a-z]{1,13})\\u2063/gu;
function markerTags(value) {
  return String(value == null ? "" : value).replace(INT_MARK, (m, em, b36) => {
    const id = parseInt(b36, 36);
    return id ? \`<tg-emoji emoji-id="\${id}">\${em}</tg-emoji>\` : em;
  });
}
function markerStrip(value) {
  return String(value == null ? "" : value).replace(/\\u2063[0-9a-z]{1,13}\\u2063/g, "");
}
__name(markerTags, "markerTags");
__name(markerStrip, "markerStrip");
/* دکمه‌ها نمی‌توانند تگ داشته باشند؛ اموجی انتخاب‌شده می‌شود آیکن پرمیوم دکمه. */
function markerButtons(markup) {
  if (!markup || !markup.inline_keyboard) return markup;
  return { ...markup, inline_keyboard: markup.inline_keyboard.map((row) => row.map((button) => {
    if (!button || typeof button.text !== "string") return button;
    const marker = INT_MARK.exec(button.text);
    INT_MARK.lastIndex = 0;
    if (marker) {
      const id = parseInt(marker[2], 36);
      const text = markerStrip(button.text).trim() || marker[1];
      return id ? { ...button, text, icon_custom_emoji_id: String(id) } : { ...button, text };
    }
    const tag = /^\\s*<tg-emoji[^>]*emoji-id=["']?(\\d+)["']?[^>]*>([\\s\\S]*?)<\\/tg-emoji>/i.exec(button.text);
    if (tag) return { ...button, text: markerStrip(button.text).replace(/<[^>]*>/g, "").trim() || tag[2], icon_custom_emoji_id: String(tag[1]) };
    const clean = markerStrip(button.text);
    return clean === button.text ? button : { ...button, text: clean };
  })) };
}
__name(markerButtons, "markerButtons");
function plainEmojisDeep(state) {`;
src = src.replace(HELPER_ANCHOR, HELPERS);

/* ── 1ب) the inlined live renderer: markers become tags, buttons get icons ─ */
const LIVE_ESC = `function liveEscape(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}`;
must(count(LIVE_ESC) === 1, 'liveEscape anchor not found');
src = src.replace(LIVE_ESC, `var LIVE_MARK = /(\\p{Extended_Pictographic}\\uFE0F?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)\\u2063([0-9a-z]{1,13})\\u2063/gu;
function liveTagify(s) {
  return String(s == null ? "" : s)
    .replace(LIVE_MARK, function (m, em, b36) {
      const id = parseInt(b36, 36);
      return id ? '<tg-emoji emoji-id="' + id + '">' + em + "</tg-emoji>" : em;
    })
    .replace(/&lt;tg-emoji[^&]*emoji-id=&quot;(\\d+)&quot;[^&]*&gt;([\\s\\S]*?)&lt;\\/tg-emoji&gt;/gi,
      function (m, id, inner) { return '<tg-emoji emoji-id="' + id + '">' + inner + "</tg-emoji>"; });
}
__name(liveTagify, "liveTagify");
function liveRich(v) { return liveTagify(liveEscape(v)); }
__name(liveRich, "liveRich");
function livePlainText(v) { return String(v == null ? "" : v).replace(/\\u2063[0-9a-z]{1,13}\\u2063/g, ""); }
__name(livePlainText, "livePlainText");
function liveButton(b) {
  if (!b || typeof b.text !== "string") return b;
  const marker = LIVE_MARK.exec(b.text);
  LIVE_MARK.lastIndex = 0;
  if (marker) {
    const id = parseInt(marker[2], 36);
    const text = livePlainText(b.text).trim() || marker[1];
    return id ? { ...b, text, icon_custom_emoji_id: String(id) } : { ...b, text };
  }
  const tag = /^\\s*<tg-emoji[^>]*emoji-id=["']?(\\d+)["']?[^>]*>([\\s\\S]*?)<\\/tg-emoji>/i.exec(b.text);
  if (tag) return { ...b, text: livePlainText(b.text).replace(/<[^>]*>/g, "").trim() || tag[2], icon_custom_emoji_id: String(tag[1]) };
  return { ...b, text: livePlainText(b.text) };
}
__name(liveButton, "liveButton");
${LIVE_ESC}`);

const LIVE_SITES = [
  ['const head = "<h2>" + liveEscape(state.title', 'const head = "<h2>" + liveRich(state.title'],
  ['const lead = state.subtitle ? "<p>" + liveEscape(state.subtitle)', 'const lead = state.subtitle ? "<p>" + liveRich(state.subtitle)'],
  ['const status = state.status ? "<p><b>" + liveEscape(state.status)', 'const status = state.status ? "<p><b>" + liveRich(state.status)'],
  ['return "<tr><td>" + liveEscape(opt.label)', 'return "<tr><td>" + liveRich(opt.label)'],
  ['return "<p>\\u2022 " + liveEscape(e.text || "")', 'return "<p>\\u2022 " + liveRich(e.text || "")'],
  ['? "<h3>" + liveEscape(state.flow.emoji || "\\u{1F30A}") + " " + liveEscape(state.flow.label || "")', '? "<h3>" + liveRich(state.flow.emoji || "\\u{1F30A}") + " " + liveRich(state.flow.label || "")'],
  ['return { text: opt.label, callback_data: "vote:" + id + ":" + opt.key };', 'return liveButton({ text: opt.label, callback_data: "vote:" + id + ":" + opt.key });']
];
for (const [a, b] of LIVE_SITES) {
  must(count(a) === 1, 'live site anchor not unique: ' + a.slice(0, 52));
  src = src.replace(a, b);
}

/* ── 2) list titles / captions never carry the invisible marker ─────────── */
/* plainEmojis (تعریف‌شده در patch_plain_emoji) تگ‌ها را به کاراکتر ساده برمی‌گرداند
   ولی نشانهٔ اموجی انتخاب‌شده را دست نمی‌زند — وضعیت پست باید نشانه را نگه دارد تا
   رندرر ریچ آن را به آرت تبدیل کند. برای متن‌های نمایشی، نسخهٔ دیگری که نشانه را هم
   حذف می‌کند اضافه می‌شود. */
const PLAIN_FN = `function plainEmojis(value) {`;
must(count(PLAIN_FN) === 1, 'plainEmojis anchor not found');
src = src.replace(PLAIN_FN, `function plainEmojisText(value) { return markerStrip(plainEmojis(value)); }
__name(plainEmojisText, "plainEmojisText");
function plainEmojis(value) {`);

/* ── 3) rich body: markers become tags ─────────────────────────────────── *//* ── 3) rich body: markers become tags ──────────────────────────────────── */
const SEND_ANCHOR = '      const mapped = String(ensureRichHtmlStructure(String(html))).replace(';
must(count(SEND_ANCHOR) === 1, 'sendAny body anchor not found');
src = src.replace(SEND_ANCHOR, '      const mapped = String(markerTags(ensureRichHtmlStructure(String(html)))).replace(');

const SEND_BTN = `      try {
        return await tg.sendRich(chatId, rich, markup ? { reply_markup: markup } : {});
      } catch (e) {
        const why = String(e?.description || e?.message || e);
        if (!markup || !/icon|emoji|custom/i.test(why)) throw e;
        return await tg.sendRich(chatId, rich, { reply_markup: stripMediaIcons(markup) });
      }`;
must(count(SEND_BTN) === 1, 'sendAny markup anchor not found');
src = src.replace(SEND_BTN, `      const buttons = markup ? markerButtons(markup) : null;
      try {
        return await tg.sendRich(chatId, rich, buttons ? { reply_markup: buttons } : {});
      } catch (e) {
        const why = String(e?.description || e?.message || e);
        if (!buttons || !/icon|emoji|custom/i.test(why)) throw e;
        return await tg.sendRich(chatId, rich, { reply_markup: stripMediaIcons(buttons) });
      }`);

/* edit path (levels switch, poll edits): same treatment */
const EDIT_CONTENT = '  const emojiMap = plain ? {} : await getJson(env, "map", {});\n  const content = applyEmojiSubs(ensureRichHtmlStructure((html || escapeHtml(text || "")).trim()), {}, emojiMap);';
must(count(EDIT_CONTENT) === 1, 'edit content anchor not found');
src = src.replace(EDIT_CONTENT, '  const emojiMap = plain ? {} : await getJson(env, "map", {});\n  const content = markerTags(applyEmojiSubs(ensureRichHtmlStructure((html || escapeHtml(text || "")).trim()), {}, emojiMap));');

const EDIT_BTN = '  const effectiveReplyMarkup = plain ? replyMarkup : decorateReplyMarkup(replyMarkup, emojiMap);';
must(count(EDIT_BTN) === 1, 'edit markup anchor not found');
src = src.replace(EDIT_BTN, '  const effectiveReplyMarkup = markerButtons(plain ? replyMarkup : decorateReplyMarkup(replyMarkup, emojiMap));');

/* ── 4) live poll: title/subtitle/cells keep the tag, buttons get the icon ─ */
const LIVE_ANCHOR = `  const clean = plainEmojisDeep(state);
  return await editPostMessage(env, chatId, msgId, {
    html: renderLivePost(clean),
    replyMarkup: liveKeyboard(clean),
    rich: true,
    plain: true
  }).catch((e) => { console.warn("live edit failed", e?.message); });`;
must(count(LIVE_ANCHOR) === 1, 'editLivePost anchor not found');
src = src.replace(LIVE_ANCHOR, `  const clean = plainEmojisDeep(state);
  return await editPostMessage(env, chatId, msgId, {
    html: renderLivePost(clean),
    replyMarkup: liveKeyboard(clean),
    rich: true,
    plain: true
  }).catch((e) => { console.warn("live edit failed", e?.message); });`);
/* renderLivePost/liveKeyboard already convert markers via liveRich/liveButton
   in the patched renderer block; nothing else to do here. */

/* ── 4ب) عنوان آیتم‌های فهرست بدون نشانهٔ نامرئی ─────────────────────────── */
const ENTRY_WRAPS = [
  ['const entry = { kind: "poll", id, title, at: Date.now(),', 'const entry = { kind: "poll", id, title: plainEmojisText(title), at: Date.now(),'],
  ['const entry = { kind: "levels", id, title: title ||', 'const entry = { kind: "levels", id, title: plainEmojisText(title) ||']
];
for (const [a, b] of ENTRY_WRAPS) {
  must(count(a) === 1, 'entry anchor not unique: ' + a.slice(0, 46));
  src = src.replace(a, b);
}
must(count('title: plainEmojisText(title) ||') === 1, 'levels title wrap failed');

/* ── 5) sanity ──────────────────────────────────────────────────────────── */
must(count('function markerTags(') === 1, 'markerTags missing');
must(count('function markerButtons(') === 1, 'markerButtons missing');
must(count('markerTags(ensureRichHtmlStructure(String(html)))') === 1, 'sendAny not wired');
must(count('markerTags(applyEmojiSubs') === 1, 'edit path not wired');
must(count('function liveTagify(') === 1, 'live renderer not patched (run the renderer patch first)');
must(count('function plainEmojisText(') === 1, 'plainEmojisText missing');
must(count('title: plainEmojisText(title)') === 2, 'entry titles not wrapped');
fs.writeFileSync(target, src);
console.log('✔ emoji-marker patched →', Buffer.byteLength(src), 'bytes');
