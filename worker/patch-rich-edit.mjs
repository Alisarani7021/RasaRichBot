/* Patch (worker): edits of rich posts must keep the rich HTML intact.
 *
 * sanitizeTelegramHtml() was written for *classic* messages: it flattens
 * <table> into "cell: cell" lines and demotes <h1..h6> to bold text. Running
 * every rich edit through it means a post looks right the moment it is sent
 * and then loses its table/headings the first time it is edited (a depth tap
 * on a multi-level post, a vote on a live poll, a carousel advance, or an
 * ordinary edit of a studio post).
 *
 * This patch lets editPostMessage render rich_message content verbatim, keeps
 * the old sanitizer as a fallback rung for clients/servers that reject the raw
 * markup, and treats "message is not modified" as success (so a no-op refresh
 * never drops down the ladder and degrades a healthy message).
 *
 * Idempotent: refuses to run twice. Usage: node patch_rich_edit.mjs <bundle.js>
 */
import fs from 'node:fs';

const target = process.argv[2];
if (!target) { console.error('usage: node patch_rich_edit.mjs <bundle.js>'); process.exit(1); }
let src = fs.readFileSync(target, 'utf8');
const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(/editPostMessage\(env, chatId, messageId, \{ text, html, media, replyMarkup, rich \}\)/.test(src) === false, 'already patched');

const EDITS = [
  {
    name: 'editPostMessage signature accepts rich',
    find: 'async function editPostMessage(env, chatId, messageId, { text, html, media, replyMarkup }) {',
    repl: 'async function editPostMessage(env, chatId, messageId, { text, html, media, replyMarkup, rich }) {',
    times: 1
  },
  {
    name: 'rich content skips the classic-path sanitizer, degraded copy kept for the fallback rungs',
    find: '  const sanitized = sanitizeTelegramHtml(content);\n  const captionHtml = sanitized.slice(0, 1024);',
    repl: '  const sanitized = rich ? content : sanitizeTelegramHtml(content);\n  const degraded = rich ? sanitizeTelegramHtml(content) : sanitized;\n  const captionHtml = sanitized.slice(0, 1024);',
    times: 1,
    note: 'anchored on editPostMessage (sendPostMessage has no captionHtml line right after)'
  },
  {
    name: 'rich attempt: "message is not modified" counts as success',
    find: '    if (richRes && richRes.ok) return richRes;\n    if (captionTarget(richRes)) return await editCaption();',
    repl: '    if (richRes && richRes.ok) return richRes;\n    if (richRes && /not modified/i.test(String(richRes.description || ""))) return { ok: true, result: { message_id: messageId }, unchanged: true };\n    if (captionTarget(richRes)) return await editCaption();',
    times: 1
  },
  {
    name: 'classic text rung falls back to the degraded copy',
    find: '        text: sanitized,\n        parse_mode: "HTML",\n        disable_web_page_preview: true,\n        ...replyMarkup ? { reply_markup: effectiveReplyMarkup } : {}\n      });\n      if (res2 && res2.ok) return res2;',
    repl: '        text: degraded,\n        parse_mode: "HTML",\n        disable_web_page_preview: true,\n        ...replyMarkup ? { reply_markup: effectiveReplyMarkup } : {}\n      });\n      if (res2 && res2.ok) return res2;',
    times: 1
  },
  {
    name: 'classic text rung without emoji icons falls back to the degraded copy',
    find: '        text: sanitized,\n        parse_mode: "HTML",\n        disable_web_page_preview: true,\n        ...replyMarkup ? { reply_markup: stripIconIds(effectiveReplyMarkup) } : {}\n      });\n      if (res2b && res2b.ok) return res2b;',
    repl: '        text: degraded,\n        parse_mode: "HTML",\n        disable_web_page_preview: true,\n        ...replyMarkup ? { reply_markup: stripIconIds(effectiveReplyMarkup) } : {}\n      });\n      if (res2b && res2b.ok) return res2b;',
    times: 1
  },
  {
    name: 'live polls keep their chart layout on every vote and tick',
    find: '  return await editPostMessage(env, chatId, msgId, {\n    html: renderLivePost(state),\n    replyMarkup: liveKeyboard(state)\n  }).catch((e) => { console.warn("live edit failed", e?.message); });',
    repl: '  return await editPostMessage(env, chatId, msgId, {\n    html: renderLivePost(state),\n    replyMarkup: liveKeyboard(state),\n    rich: true\n  }).catch((e) => { console.warn("live edit failed", e?.message); });',
    times: 1
  },
  {
    name: 'multi-depth switch keeps tables, headings, folded blocks and premium emoji',
    find: 'await editPostMessage(env, chatId, msgId, { html: st.levels[level].html, replyMarkup: deepKeyboard(st) }).catch((e) => {',
    repl: 'await editPostMessage(env, chatId, msgId, { html: st.levels[level].html, replyMarkup: deepKeyboard(st), rich: true }).catch((e) => {',
    times: 1
  },
  {
    name: 'multi-depth buttons keep their emoji in the icon slot',
    find: 'text: (k === st.level ? "\\u25CF " : "") + (levels[k].label || k),',
    repl: 'text: (levels[k].label || k) + (k === st.level ? " \\u2022" : ""),',
    times: 1
  },
  {
    name: 'carousel / studio text-tab edits keep their rich layout too',
    find: 'await editPostMessage(env, chatId, msgId, { html: view.html || view.caption, ...view.keyboard ? { replyMarkup: view.keyboard } : {} }).catch((e) => {',
    repl: 'await editPostMessage(env, chatId, msgId, { html: view.html || view.caption, rich: true, ...view.keyboard ? { replyMarkup: view.keyboard } : {} }).catch((e) => {',
    times: 1
  }
];

for (const e of EDITS) {
  const t = count(e.find);
  must(t === e.times, `${e.name}: found ${t} occurrences, expected ${e.times}`);
  src = src.replace(e.find, e.repl);
  console.log('✔', e.name);
}

/* sanity: the sanitizer itself must stay in place for classic sends */
must(count('function sanitizeTelegramHtml(html)') === 1, 'sanitizer vanished');
must(count('rich: true') >= 4, 'rich flags missing');
must(count('const degraded = rich ? sanitizeTelegramHtml(content) : sanitized;') === 1, 'degraded copy missing');

fs.writeFileSync(target, src);
console.log('✔ rich-edit patched →', Buffer.byteLength(src), 'bytes');
