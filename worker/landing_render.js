/* Landing page renderer — from a post to a small, self-contained page inside
   Telegram: the worker renders it from the post's own content (no site, no
   external tools). Inline CSS only, works in the WebView and as a web link. */

function lpEscape(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function renderLandingPage(page) {
  const p = page || {};
  const accent = /^#[0-9a-f]{3,8}$/i.test(String(p.accent || "")) ? p.accent : "#f0b429";
  const title = lpEscape(p.title || "\u0635\u0641\u062D\u0647\u0654 \u067E\u0633\u062A");
  const subtitle = lpEscape(p.subtitle || "");
  const body = String(p.body || "");
  const blocks = Array.isArray(p.blocks) ? p.blocks : [];
  const assetPath = function (f) { return '/assets/' + String(f).replace(/[^a-z0-9._/-]/gi, ""); };
  const hero = p.image ? assetPath(p.image) : "";
  const photos = Array.isArray(p.photos) ? p.photos.slice(0, 6) : [];
  const cta = p.cta && p.cta.text ? p.cta : null;
  const form = p.form !== false;
  const rows = blocks.map(function (b) {
    return '<tr><td class="k">' + lpEscape(b.k) + '</td><td class="v">' + lpEscape(b.v) + '</td></tr>';
  }).join("");
  const gallery = photos.map(function (f) {
    return '<img src="' + assetPath(f) + '" alt="">';
  }).join("");
  const price = p.price ? '<div class="price">' + lpEscape(p.price) + '</div>' : "";
  const ctaHtml = cta
    ? '<a class="cta" href="' + lpEscape(cta.url || "https://t.me/RasaRichBot") + '">' + lpEscape(cta.text) + '</a>'
    : '';
  const phone = p.phone ? '<a class="ghost" href="tel:' + lpEscape(p.phone) + '">\u{1F4DE} ' + lpEscape(p.phone) + '</a>' : '';
  const formHtml = form ? (
    '<form id="f" autocomplete="off">' +
    '<h3>\u{1F4DD} ' + lpEscape(p.formTitle || "\u062B\u0628\u062A \u062F\u0631\u062E\u0648\u0627\u0633\u062A") + '</h3>' +
    '<input name="name" placeholder="\u0627\u0633\u0645 \u0634\u0645\u0627" required>' +
    '<input name="contact" placeholder="\u0634\u0645\u0627\u0631\u0647 \u06CC\u0627 \u0622\u06CC\u062F\u06CC \u062A\u0644\u06AF\u0631\u0627\u0645" required>' +
    '<textarea name="note" rows="2" placeholder="\u062A\u0648\u0636\u06CC\u062D (\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC)"></textarea>' +
    '<button type="submit">\u0627\u0631\u0633\u0627\u0644</button>' +
    '<p id="ok" hidden>\u2705 \u062B\u0628\u062A \u0634\u062F \u2014 \u0647\u0645\u06CC\u0646 \u0644\u062D\u0638\u0647 \u0628\u0647 \u0645\u06CC\u0632\u0628\u0627\u0646 \u062E\u0628\u0631 \u0645\u06CC\u200C\u0631\u0648\u062F.</p>' +
    '<p id="err" hidden>\u26A0\uFE0F \u0634\u062F \u0646\u0634\u062F\u061B \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646.</p>' +
    '</form>'
  ) : '';
  const pid = lpEscape(p.id || "");
  return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<meta name="color-scheme" content="dark">' +
    '<title>' + title + '</title>' +
    '<script src="https://telegram.org/js/telegram-web-app.js"><\/script>' +
    '<style>' +
    ':root{--a:' + accent + '}' +
    '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
    'body{margin:0;background:#0b0f14;color:#eef2f7;font-family:Vazirmatn,system-ui,"Segoe UI",Tahoma,sans-serif;line-height:1.9}' +
    '.wrap{max-width:560px;margin:0 auto;padding:14px 14px 40px}' +
    '.card{background:linear-gradient(180deg,#131a23,#0e141b);border:1px solid #1f2a36;border-radius:20px;overflow:hidden;box-shadow:0 18px 44px rgba(0,0,0,.45)}' +
    '.hero{height:190px;background:linear-gradient(135deg,var(--a),#2b6cb0);background-size:cover;background-position:center;display:flex;align-items:flex-end}' +
    '.hero img{width:100%;height:100%;object-fit:cover}' +
    '.pad{padding:16px}' +
    'h1{font-size:20px;margin:0 0 6px}' +
    '.sub{color:#9fb0c3;font-size:13px;margin:0 0 12px}' +
    'table{width:100%;border-collapse:collapse;margin:10px 0;font-size:14px}' +
    'td{padding:9px 10px;border-bottom:1px solid #1e2833}' +
    'td.k{color:#9fb0c3;width:38%}' +
    '.price{font-size:18px;font-weight:700;color:var(--a);margin:8px 0}' +
    '.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}' +
    '.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px}' +
    '.cta,.ghost{display:block;text-align:center;text-decoration:none;border-radius:14px;padding:13px;font-weight:700;margin-top:10px}' +
    '.cta{background:var(--a);color:#10161d}' +
    '.ghost{background:#16202b;color:#dbe6f2;border:1px solid #22303d}' +
    'form{margin-top:14px;background:#101821;border:1px solid #1e2833;border-radius:16px;padding:14px}' +
    'form h3{margin:0 0 10px;font-size:15px}' +
    'input,textarea{width:100%;margin-bottom:8px;padding:11px;border-radius:12px;border:1px solid #24313e;background:#0c141c;color:#eef2f7;font-family:inherit;font-size:14px}' +
    'button{width:100%;padding:13px;border:0;border-radius:12px;background:var(--a);color:#10161d;font-weight:800;font-size:15px;font-family:inherit}' +
    '#ok{color:#4ade80;font-size:13px}#err{color:#f87171;font-size:13px}' +
    'footer{margin-top:14px;text-align:center;color:#64748b;font-size:12px}' +
    '</style></head><body><div class="wrap"><div class="card">' +
    '<div class="hero">' + (hero ? '<img src="' + hero + '" alt="">' : '') + '</div>' +
    '<div class="pad"><h1>' + title + '</h1>' + (subtitle ? '<p class="sub">' + subtitle + '</p>' : '') +
    body + price + (gallery ? '<div class="gallery">' + gallery + '</div>' : '') +
    (rows ? '<table>' + rows + '</table>' : '') +
    ctaHtml + phone + formHtml +
    '</div></div><footer>\u{1F3EC} \u0633\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0647 \u0628\u0627 \u0631\u0650\u0633\u0627 \u00B7 \u0635\u0641\u062D\u0647\u0654 \u0641\u0631\u0648\u062F \u062F\u0627\u062E\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645</footer></div>' +
    '<script>(function(){var f=document.getElementById("f");if(!f)return;' +
    'f.addEventListener("submit",function(e){e.preventDefault();var d=Object.fromEntries(new FormData(f).entries());d.page="' + pid + '";' +
    'fetch("/api/landing/submit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)})' +
    '.then(function(r){return r.json()}).then(function(j){if(j&&j.ok){f.querySelector("button").disabled=true;document.getElementById("ok").hidden=false;}else{document.getElementById("err").hidden=false;}}) ' +
    '.catch(function(){document.getElementById("err").hidden=false;});});' +
    'var tg=window.Telegram&&window.Telegram.WebApp;if(tg){try{tg.ready();tg.expand();tg.setHeaderColor&&tg.setHeaderColor("#0b0f14");}catch(e){}}' +
    '})();<\/script></body></html>';
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderLandingPage: renderLandingPage };
}
