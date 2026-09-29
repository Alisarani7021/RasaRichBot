/* Live carousel renderer — one message whose photo changes *in place*.
   Same rules as live_render.js: dependency-free, embedded into the worker
   bundle by the build script, and reused by the delivery script so the first
   message and every later edit are byte-identical.                          */

var CAR_DOT_ON = "\u25CF";
var CAR_DOT_OFF = "\u25CB";
var CAR_DIGITS = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";

function carouselEscape(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function carouselFa(n) {
  return String(n).replace(/[0-9]/g, function (d) { return CAR_DIGITS.charAt(Number(d)); });
}
function carouselIndex(state) {
  const n = (state.slides || []).length;
  if (!n) return 0;
  let i = Number(state.idx || 0);
  if (!isFinite(i)) i = 0;
  i = Math.round(i);
  return Math.max(0, Math.min(n - 1, i));
}
function carouselSlide(state) { return (state.slides || [])[carouselIndex(state)] || {}; }
function carouselCaption(state) {
  const slides = state.slides || [];
  const n = slides.length;
  const i = carouselIndex(state);
  const s = slides[i] || {};
  const dots = slides.map(function (_, k) { return k === i ? CAR_DOT_ON : CAR_DOT_OFF; }).join(" ");
  const head = "<b>" + carouselEscape(s.title || "") + "</b>";
  const body = s.caption ? "\n" + carouselEscape(s.caption) : "";
  const counter = "\n" + carouselFa(i + 1) + " / " + carouselFa(n) + "   " + dots;
  const hint = state.auto === true
    ? "\n\u25B6\uFE0F \u067E\u062E\u0634 \u062E\u0648\u062F\u06A9\u0627\u0631 \u0631\u0648\u0634\u0646 \u2014 \u0647\u0631 \u062F\u0642\u06CC\u0642\u0647 \u064A\u06A9 \u0627\u0633\u0644\u0627\u064A\u062F \u062C\u0644\u0648 \u0645\u06CC\u200C\u0631\u0648\u0645"
    : "";
  const tail = "\n\u{1F3A0} \u06A9\u0627\u0631\u0648\u0633\u0644 \u0632\u0646\u062F\u0647 \u00B7 \u064A\u06A9 \u067E\u06CC\u0627\u0645\u060C " + carouselFa(n) + " \u0639\u06A9\u0633";
  return head + body + counter + hint + tail;
}
function carouselKeyboard(state) {
  const id = state.id;
  const slides = state.slides || [];
  const n = slides.length;
  const i = carouselIndex(state);
  const rows = [];
  rows.push([
    { text: "\u25C0\uFE0F", callback_data: "car:" + id + ":p" },
    { text: carouselFa(i + 1) + " / " + carouselFa(n), callback_data: "car:" + id + ":x" },
    { text: "\u25B6\uFE0F", callback_data: "car:" + id + ":n" }
  ]);
  const jump = [];
  for (let k = 0; k < n; k++) {
    jump.push({ text: (k === i ? CAR_DOT_ON + " " : "") + carouselFa(k + 1), callback_data: "car:" + id + ":" + k });
  }
  for (let r = 0; r < jump.length; r += 5) rows.push(jump.slice(r, r + 5));
  rows.push([state.auto === true
    ? { text: "\u23F8 \u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0646 \u067E\u062E\u0634 \u062E\u0648\u062F\u06A9\u0627\u0631", callback_data: "car:" + id + ":pause" }
    : { text: "\u25B6\uFE0F \u067E\u062E\u0634 \u062E\u0648\u062F\u06A9\u0627\u0631", callback_data: "car:" + id + ":play" }]);
  return { inline_keyboard: rows };
}
function carouselView(state) {
  return { fileId: carouselSlide(state).fileId || null, caption: carouselCaption(state), keyboard: carouselKeyboard(state) };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { carouselView: carouselView, carouselCaption: carouselCaption, carouselKeyboard: carouselKeyboard, carouselIndex: carouselIndex, carouselFa: carouselFa };
}
