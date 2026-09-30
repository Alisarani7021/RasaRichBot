/* Patch (worker): emoji tags are only meaningful inside a rich message *body*.
 *
 * In a title, a poll option, a caption or a plain-text field `<tg-emoji …>` (or
 * an `<img src="tg://emoji?id=…"/>`) can only ever show up as literal text —
 * Telegram escapes those contexts and never parses tags there. The mini app no
 * longer inserts tags, but anything already stored (and anybody pasting one by
 * hand) still has to be cleaned up before it reaches a message.
 *
 * plainEmojis() turns such tags back into the plain character, and it is applied
 * to every non-body field — including the live-poll state, so a post that is
 * already broken heals on its next edit (a vote, a tick or the refresh button).
 *
 * Idempotent: refuses to run twice. Usage: node patch_plain_emoji.mjs <bundle.js>
 */
import fs from 'node:fs';

const target = process.argv[2];
if (!target) { console.error('usage: node patch_plain_emoji.mjs <bundle.js>'); process.exit(1); }
let src = fs.readFileSync(target, 'utf8');
const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('function plainEmojis(') === 0, 'already patched');

/* ── 1) the helper + the state cleaner, next to the other rich helpers ───── */
const HELPER_ANCHOR = 'async function editPostMessage(env, chatId, messageId, { text, html, media, replyMarkup, rich }) {';
must(count(HELPER_ANCHOR) === 1, 'editPostMessage anchor not found');
const HELPERS = `/* Custom-emoji tags are a rich-body feature. Everywhere else — a button label,
   a table cell, a title typed into a form — they are just text, so they are
   folded back into the plain character they wrap. */
function plainEmojis(value) {
  return String(value == null ? "" : value)
    .replace(/<tg-emoji[^>]*>([\\s\\S]*?)<\\/tg-emoji>/gi, "$1")
    .replace(/&lt;tg-emoji[^>]*&gt;([\\s\\S]*?)&lt;\\/tg-emoji&gt;/gi, "$1")
    .replace(/<img[^>]+src=["']tg:\\/\\/emoji\\?id=\\d+["'][^>]*\\/?>/gi, "")
    .replace(/&lt;img[^>]+src=&quot;tg:\\/\\/emoji\\?id=\\d+&quot;[^&]*&gt;/gi, "");
}
__name(plainEmojis, "plainEmojis");
function plainEmojisDeep(state) {
  if (!state || typeof state !== "object") return state;
  const s = JSON.parse(JSON.stringify(state));
  if (typeof s.title === "string") s.title = plainEmojis(s.title);
  if (typeof s.subtitle === "string") s.subtitle = plainEmojis(s.subtitle);
  if (typeof s.status === "string") s.status = plainEmojis(s.status);
  if (Array.isArray(s.options)) s.options = s.options.map((o) => ({ ...o, label: plainEmojis(o && o.label) }));
  if (Array.isArray(s.entries)) s.entries = s.entries.map((e) => ({ ...e, text: plainEmojis(e && e.text) }));
  if (s.flow && typeof s.flow === "object" && typeof s.flow.label === "string") s.flow = { ...s.flow, label: plainEmojis(s.flow.label) };
  return s;
}
__name(plainEmojisDeep, "plainEmojisDeep");
async function editPostMessage(env, chatId, messageId, { text, html, media, replyMarkup, rich }) {`;
src = src.replace(HELPER_ANCHOR, HELPERS);

/* ── 2) a live post always renders from the cleaned state ───────────────── */
const LIVE_ANCHOR = `async function editLivePost(env, chatId, msgId, state) {
  return await editPostMessage(env, chatId, msgId, {
    html: renderLivePost(state),
    replyMarkup: liveKeyboard(state),
    rich: true
  }).catch((e) => { console.warn("live edit failed", e?.message); });
}`;
must(count(LIVE_ANCHOR) === 1, 'editLivePost anchor not found');
src = src.replace(LIVE_ANCHOR, `async function editLivePost(env, chatId, msgId, state) {
  const clean = plainEmojisDeep(state);
  return await editPostMessage(env, chatId, msgId, {
    html: renderLivePost(clean),
    replyMarkup: liveKeyboard(clean),
    rich: true
  }).catch((e) => { console.warn("live edit failed", e?.message); });
}`);

/* ── 3) button labels: a leading tag becomes a real premium icon ────────── */
const DECO_ANCHOR = `      const match = String(button.text).match(emojiRe);
      if (!match) return button;
      const clean = match[2].replace(/\\uFE0F/g, "");
      const icon = map[clean] || map[match[2]];
      if (!icon) return button;
      return { ...button, text: String(button.text).slice(match[0].length).trim() || match[2], icon_custom_emoji_id: String(icon) };`;
must(count(DECO_ANCHOR) === 1, 'decorateReplyMarkup anchor not found');
src = src.replace(DECO_ANCHOR, `      const text = plainEmojis(button.text);
      const tagMatch = /^\\s*<tg-emoji[^>]*emoji-id=["']?(\\d+)["']?[^>]*>([\\s\\S]*?)<\\/tg-emoji>/i.exec(String(button.text));
      if (tagMatch) {
        return { ...button, text: plainEmojis(String(button.text)).trim() || tagMatch[2], icon_custom_emoji_id: tagMatch[1] };
      }
      const match = text.match(emojiRe);
      if (!match) return { ...button, text: text.trim() || button.text };
      const clean = match[2].replace(/\\uFE0F/g, "");
      const icon = map[clean] || map[match[2]];
      if (!icon) return { ...button, text };
      return { ...button, text: text.slice(match[0].length).trim() || match[2], icon_custom_emoji_id: String(icon) };`);

/* ── 4) anything the mini app types into a form is cleaned too ──────────── */
const FORM_ANCHORS = [
  { find: '      const title = String(body?.title || "").trim().slice(0, 120) || "\\u{1F5F3} \\u0646\\u0638\\u0631\\u0633\\u0646\\u062C\\u06CC \\u0632\\u0646\\u062F\\u0647";\n      const subtitle = String(body?.subtitle || "").trim().slice(0, 300);',
    repl: '      const title = plainEmojis(String(body?.title || "").trim()).slice(0, 120) || "\\u{1F5F3} \\u0646\\u0638\\u0631\\u0633\\u0646\\u062C\\u06CC \\u0632\\u0646\\u062F\\u0647";\n      const subtitle = plainEmojis(String(body?.subtitle || "").trim()).slice(0, 300);' },
  { find: '        .map((x) => String(x || "").trim().slice(0, 60)).filter(Boolean).slice(0, 6);',
    repl: '        .map((x) => plainEmojis(String(x || "").trim()).slice(0, 60)).filter(Boolean).slice(0, 6);' },
  { find: '      const title = String(body?.title || "").trim().slice(0, 120);\n      const lv = body?.levels || {};',
    repl: '      const title = plainEmojis(String(body?.title || "").trim()).slice(0, 120);\n      const lv = body?.levels || {};' },
  { find: '      const caption = String(body?.caption || "").trim().slice(0, 600);',
    repl: '      const caption = plainEmojis(String(body?.caption || "").trim()).slice(0, 600);' }
];
for (const a of FORM_ANCHORS) {
  const t = count(a.find);
  must(t === 1, `form anchor not unique (${t}): ${a.find.slice(0, 48)}`);
  src = src.replace(a.find, a.repl);
}

/* ── 5) sanity ──────────────────────────────────────────────────────────── */
must(count('function plainEmojis(') === 1, 'helper missing');
must(count('function plainEmojisDeep(') === 1, 'deep helper missing');
must(count('plainEmojis(') >= 8, 'helper not wired everywhere');
fs.writeFileSync(target, src);
console.log('✔ plain-emoji normalisation patched →', Buffer.byteLength(src), 'bytes');
