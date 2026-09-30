/* Patch (worker): the interactive templates never re-dress the user's emoji.
 *
 * The studio's long-standing behaviour is to swap every plain emoji it knows for
 * a custom one from the emoji packs. In a template post that is wrong: the pack
 * art does not always look like the character it replaces (a ✅ could come out as
 * any custom art), so a post the user wrote came out with different-looking
 * emoji on every edit. Templates now send exactly what the user typed; only the
 * tags they picked on purpose (<tg-emoji emoji-id="…">, from the picker) stay
 * premium.
 *
 * Studio and carousel paths are untouched.
 *
 * Idempotent: refuses to run twice. Usage: node patch_template_plain.mjs <bundle.js>
 */
import fs from 'node:fs';

const target = process.argv[2];
if (!target) { console.error('usage: node patch_template_plain.mjs <bundle.js>'); process.exit(1); }
let src = fs.readFileSync(target, 'utf8');
const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(/async function editPostMessage\(env, chatId, messageId, \{ text, html, media, replyMarkup, rich, plain \}\)/.test(src) === false, 'already patched');

const EDITS = [
  {
    name: 'editPostMessage takes a «plain» mode',
    find: 'async function editPostMessage(env, chatId, messageId, { text, html, media, replyMarkup, rich }) {\n  const emojiMap = await getJson(env, "map", {});\n  const content = applyEmojiSubs(ensureRichHtmlStructure((html || escapeHtml(text || "")).trim()), {}, emojiMap);\n  const effectiveReplyMarkup = decorateReplyMarkup(replyMarkup, emojiMap);',
    repl: 'async function editPostMessage(env, chatId, messageId, { text, html, media, replyMarkup, rich, plain }) {\n  const emojiMap = plain ? {} : await getJson(env, "map", {});\n  const content = applyEmojiSubs(ensureRichHtmlStructure((html || escapeHtml(text || "")).trim()), {}, emojiMap);\n  const effectiveReplyMarkup = plain ? replyMarkup : decorateReplyMarkup(replyMarkup, emojiMap);',
    times: 1
  },
  {
    name: 'live posts (template polls) render the user\'s own emoji',
    find: '  const clean = plainEmojisDeep(state);\n  return await editPostMessage(env, chatId, msgId, {\n    html: renderLivePost(clean),\n    replyMarkup: liveKeyboard(clean),\n    rich: true\n  }).catch((e) => { console.warn("live edit failed", e?.message); });',
    repl: '  const clean = plainEmojisDeep(state);\n  return await editPostMessage(env, chatId, msgId, {\n    html: renderLivePost(clean),\n    replyMarkup: liveKeyboard(clean),\n    rich: true,\n    plain: true\n  }).catch((e) => { console.warn("live edit failed", e?.message); });',
    times: 1
  },
  {
    name: 'multi-depth posts keep the emoji the user typed on every level switch',
    find: 'await editPostMessage(env, chatId, msgId, { html: st.levels[level].html, replyMarkup: deepKeyboard(st), rich: true }).catch((e) => {',
    repl: 'await editPostMessage(env, chatId, msgId, { html: st.levels[level].html, replyMarkup: deepKeyboard(st), rich: true, plain: true }).catch((e) => {',
    times: 1
  }
];

for (const e of EDITS) {
  const t = count(e.find);
  must(t === e.times, `${e.name}: found ${t}, expected ${e.times}`);
  src = src.replace(e.find, e.repl);
  console.log('✔', e.name);
}

/* the studio's own publish path must stay exactly as it was */
must(count('function decorateReplyMarkup(replyMarkup, map = {})') === 1, 'decorator vanished');
must(count('plain: true') === 2, 'plain mode not wired to both template paths');
must(count('const emojiMap = plain ? {} : await getJson(env, "map", {});') === 1, 'plain mode missing');

fs.writeFileSync(target, src);
console.log('✔ template-plain patched →', Buffer.byteLength(src), 'bytes');
