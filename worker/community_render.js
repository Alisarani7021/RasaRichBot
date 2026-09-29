/* Community post renderer — a post that the audience itself builds, line by
   line. Same rules as the other renderers: dependency-free, embedded into the
   worker bundle, shared by the delivery scripts.                            */

function communityEscape(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function communityLine(line) {
  const name = communityEscape(String(line.name || "").slice(0, 30));
  const text = communityEscape(String(line.text || "").slice(0, 200));
  const clock = line.at ? ' <tg-time unix="' + Math.floor(Number(line.at) / 1000) + '">\u0627\u0644\u0627\u0646</tg-time>' : "";
  return "\u2022 " + text + (name ? " \u2014 <i>" + name + "</i>" : "") + clock;
}
function communityStats(state) {
  const lines = Array.isArray(state.lines) ? state.lines : [];
  const authors = {};
  lines.forEach(function (l) { authors[String(l.uid || "?")] = 1; });
  return { count: lines.length, authors: Object.keys(authors).length };
}
function renderCommunityPost(state, opts) {
  const o = opts || {};
  const lines = Array.isArray(state.lines) ? state.lines : [];
  const s = communityStats(state);
  const open = state.open !== false;
  const head = "<h2>\u{1F9E9} " + communityEscape(state.title || "\u067E\u0633\u062A\u06CC \u06A9\u0647 \u0628\u0627 \u0647\u0645 \u0645\u06CC\u200C\u0633\u0627\u0632\u06CC\u0645") + "</h2>";
  const lead = state.subtitle ? "<p>" + communityEscape(state.subtitle) + "</p>" : "";
  const meta = "<p>\u270D\uFE0F <b>" + s.count + "</b> \u062E\u0637 \u0627\u0632 <b>" + s.authors + "</b> \u0646\u0648\u06CC\u0633\u0646\u062F\u0647" +
    (state.founderName ? " \u00B7 \u0633\u0627\u0632\u0646\u062F\u0647: " + communityEscape(state.founderName) : "") + "</p>";
  const body = lines.length
    ? "<blockquote>" + lines.map(communityLine).join("\n") + "</blockquote>"
    : "<p><i>\u0647\u0646\u0648\u0632 \u062E\u0637\u06CC \u0627\u0636\u0627\u0641\u0647 \u0646\u0634\u062F\u0647 \u2014 \u0627\u0648\u0644\u06CC\u0646 \u062E\u0637 \u0631\u0627 \u062A\u0648 \u0628\u0646\u0648\u06CC\u0633.</i></p>";
  const prog = (function () {
    const goal = Number(state.goal) || 10;
    const filled = Math.max(0, Math.min(10, Math.round((s.count * 10) / goal)));
    return "<p>\u{1F3AF} \u067E\u06CC\u0634\u0631\u0641\u062A: <code>" + "\u2588".repeat(filled) + "\u2591".repeat(10 - filled) + "</code> <b>" + s.count + "/" + goal + "</b></p>";
  })();
  const tail = open
    ? "<footer>\u{1F9E9} \u0627\u06CC\u0646 \u067E\u0633\u062A \u0631\u0627 \u0628\u0627 \u0647\u0645 \u0645\u06CC\u200C\u0633\u0627\u0632\u06CC\u0645" + (o.brand ? " \u00B7 " + communityEscape(o.brand) : "") + "</footer>"
    : "<footer>\u2705 \u067E\u0633\u062A \u06A9\u0627\u0645\u0644 \u0634\u062F \u2014 \u0645\u0645\u0646\u0648\u0646 \u06A9\u0647 \u0646\u0648\u0634\u062A\u06CC\u062F" + (o.brand ? " \u00B7 " + communityEscape(o.brand) : "") + "</footer>";
  return head + lead + meta + body + prog + tail;
}
function communityKeyboard(state) {
  const id = state.id;
  const open = state.open !== false;
  const rows = [];
  if (open) rows.push([{ text: "\u270D\uFE0F \u062E\u0637\u0645 \u0631\u0627 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646", callback_data: "comm:" + id + ":add" }]);
  rows.push([{ text: "\u{1F504} \u062A\u0627\u0632\u0647\u200C\u0633\u0627\u0632\u06CC", callback_data: "comm:" + id + ":refresh" }]);
  if (open) rows.push([{ text: "\u2705 \u06A9\u0627\u0645\u0644\u0634 \u06A9\u0646", callback_data: "comm:" + id + ":close" }]);
  return { inline_keyboard: rows };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderCommunityPost: renderCommunityPost, communityKeyboard: communityKeyboard, communityStats: communityStats };
}
