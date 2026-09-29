/* Live-post renderer — the single source of truth for how an interactive post
   looks. The worker bundle embeds this exact file (build-time injection), and
   the delivery script uses it too, so the first message and every later edit
   are byte-identical.  Keep it dependency-free plain JS. */

var LIVE_BAR_SLOTS = 10;
var LIVE_BAR_FULL = "\u2588";
var LIVE_BAR_EMPTY = "\u2591";

function liveEscape(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function liveTally(state) {
  const votes = state.votes || {};
  const tally = {};
  (state.options || []).forEach(function (o) { tally[o.key] = 0; });
  Object.keys(votes).forEach(function (uid) {
    const k = votes[uid];
    if (tally[k] !== undefined) tally[k] += 1;
  });
  return { tally: tally, total: Object.keys(votes).length };
}
function liveBar(n, total) {
  const pct = total > 0 ? (n * 100) / total : 0;
  const filled = Math.max(0, Math.min(LIVE_BAR_SLOTS, Math.round((pct / 100) * LIVE_BAR_SLOTS)));
  return LIVE_BAR_FULL.repeat(filled) + LIVE_BAR_EMPTY.repeat(LIVE_BAR_SLOTS - filled);
}
function liveClock(ms) { return Math.max(0, Math.floor(Number(ms || 0) / 1000)); }
function renderLivePost(state, opts) {
  const o = opts || {};
  const t = liveTally(state);
  const over = !!(state.endsAt && Date.now() > state.endsAt);
  const head = "<h2>" + liveEscape(state.title || "\u0646\u0638\u0631\u0633\u0646\u062c\u06cc \u0632\u0646\u062f\u0647") + "</h2>";
  const lead = state.subtitle ? "<p>" + liveEscape(state.subtitle) + "</p>" : "";
  const clock = state.endsAt
    ? "<p>\u23F3 " + (over ? "\u0645\u0647\u0644\u062a \u062a\u0645\u0627\u0645 \u0634\u062f \u2014 \u062f\u0631 " : "\u0645\u0647\u0644\u062a \u062f\u0627\u0631\u062f: ") +
      "<tg-time unix=\"" + liveClock(state.endsAt) + "\">" + (over ? "\u0645\u0647\u0644\u062a \u062a\u0645\u0627\u0645" : "\u062f\u0631 \u062d\u0627\u0644 \u0634\u0645\u0631\u0634") + "</tg-time>" +
      (over ? " \u0628\u0633\u062a\u0647 \u0634\u062f" : "") + "</p>"
    : "";
  const rows = (state.options || []).map(function (opt) {
    const n = t.tally[opt.key] || 0;
    const pct = t.total > 0 ? Math.round((n * 100) / t.total) : 0;
    return "<tr><td>" + liveEscape(opt.label) + "</td><td>" + pct + "%</td><td><code>" + liveBar(n, t.total) + "</code></td><td><b>" + n + "</b></td></tr>";
  }).join("");
  const table = rows
    ? "<table bordered striped compact><tr><th>\u06AF\u0632\u06cc\u0646\u0647</th><th>\u0633\u0647\u0645</th><th>\u0646\u0645\u0648\u062f\u0627\u0631</th><th>\u0631\u0623\u06cc</th></tr>" + rows + "</table>"
    : "";
  const foot = "<p>\u{1F465} \u0645\u062c\u0645\u0648\u0639 \u0622\u0631\u0627: <b>" + t.total + "</b>" +
    (state.updatedAt ? " \u00B7 \u0622\u062e\u0631\u06cc\u0646 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc: <tg-time unix=\"" + liveClock(state.updatedAt) + "\">\u0627\u0644\u0627\u0646</tg-time>" : "") +
    "</p>" +
    "<footer>\u26A1\uFE0F \u067E\u0633\u062A \u0632\u0646\u062F\u0647 \u2014 \u0647\u0631 \u0631\u0623\u06cc \u0628\u0644\u0627\u0641\u0627\u0635\u0644\u0647 \u0628\u0631\u0627\u06CC \u0647\u0645\u0647 \u062f\u06cc\u062f\u0647 \u0645\u06cc\u200C\u0634\u0648\u062f" + (o.brand ? " \u00B7 " + liveEscape(o.brand) : "") + "</footer>";
  return head + lead + clock + table + foot;
}
function liveKeyboard(state, origin) {
  const id = state.id;
  const over = !!(state.endsAt && Date.now() > state.endsAt);
  const btns = (state.options || []).map(function (opt) {
    return { text: opt.label, callback_data: "vote:" + id + ":" + opt.key };
  });
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  if (over) {
    rows.push([{ text: "\u{1F3C1} \u0646\u062a\u06cc\u062c\u0647 \u0646\u0647\u0627\u06cc\u06cc", callback_data: "vote:" + id + ":__refresh" }]);
  } else {
    rows.push([{ text: "\u267B\uFE0F \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0646\u0645\u0648\u062f\u0627\u0631", callback_data: "vote:" + id + ":__refresh" }]);
  }
  return { inline_keyboard: rows };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderLivePost: renderLivePost, liveKeyboard: liveKeyboard, liveTally: liveTally };
}
