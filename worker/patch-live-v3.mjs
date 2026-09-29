/* Build step v3: rewrite the interactive zone (all renderers + worker glue) and
   wire the new surfaces into the bundle:
     · community posts  — the audience builds the post, line by line
     · landing pages    — /p/<id> rendered from the post's own content
     · live flow        — a value that keeps moving on the server's own schedule
   Usage: node patch_live_v3.mjs <bundle.js>                                  */
import fs from 'node:fs';

const target = process.argv[2] || '/home/user/gh/worker/index.js';
const SOURCES = [
  '/home/user/cf/live/live_render.js',
  '/home/user/cf/live/carousel_render.js',
  '/home/user/cf/live/community_render.js',
  '/home/user/cf/live/landing_render.js',
  '/home/user/cf/live/worker_glue.js'
];

function jsEscape(src) {
  let out = '';
  for (const ch of src) {
    const cp = ch.codePointAt(0);
    if (cp < 128) out += ch;
    else if (cp <= 0xffff) out += '\\u' + cp.toString(16).toUpperCase().padStart(4, '0');
    else out += '\\u{' + cp.toString(16).toUpperCase() + '}';
  }
  return out;
}
let src = fs.readFileSync(target, 'utf8');
const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('path === "/api/landing/submit"') === 0, 'bundle already has the landing API — nothing to do');

/* ---------- 1) rewrite the renderer zone ---------- */
const ZONE_START = '/* Live-post renderer';
const ZONE_END = '/* \\u2500\\u2500 live posts \\u2500\\u2500';
must(count(ZONE_START) === 1, 'zone start not unique (' + count(ZONE_START) + ')');
must(count(ZONE_END) === 1, 'zone end not unique (' + count(ZONE_END) + ')');
const a = src.indexOf(ZONE_START), b = src.indexOf(ZONE_END);
must(a > -1 && b > a, 'zone bounds wrong');
const zone = SOURCES.map((p) => jsEscape(fs.readFileSync(p, 'utf8'))).join('\n') + '\n';
src = src.slice(0, a) + zone + src.slice(b);

/* ---------- 2) community taps land next to the other live branches ---------- */
const CAR_BRANCH = '  if (typeof cb.data === "string" && cb.data.indexOf("car:") === 0) {\n    return handleCarouselTap(cb, env, origin);\n  }';
must(count(CAR_BRANCH) === 1, 'carousel branch not unique (' + count(CAR_BRANCH) + ')');
src = src.replace(CAR_BRANCH, CAR_BRANCH + '\n  // community posts: members add their own lines to a post everyone watches\n  if (typeof cb.data === "string" && cb.data.indexOf("comm:") === 0) {\n    return handleCommunityCallback(cb, env, origin);\n  }');
const COMM_BRANCH = '  if (typeof cb.data === "string" && cb.data.indexOf("comm:") === 0) {\n    return handleCommunityCallback(cb, env, origin);\n  }';
must(count(COMM_BRANCH) === 1, 'community branch not unique (' + count(COMM_BRANCH) + ')');
src = src.replace(COMM_BRANCH, COMM_BRANCH + '\n  // three-state posts: the same message opens up to short, mid or full depth\n  if (typeof cb.data === "string" && cb.data.indexOf("deep:") === 0) {\n    return handleDeepCallback(cb, env, origin);\n  }');

/* ---------- 3) a member's line reaches the post before anything else ---------- */
const MSG_HEAD = 'async function handleMessage(msg, env, origin) {';
must(count(MSG_HEAD) === 1, 'handleMessage not unique (' + count(MSG_HEAD) + ')');
src = src.replace(MSG_HEAD, MSG_HEAD + '\n  // community line? consume it before any other text handling\n  if (await communityDispatch(msg, env, origin).catch(() => false)) return;');

/* ---------- 4) /p/<id> — the landing page ---------- */
const RASA_HEAD = 'async function tryRasaApp(request, env, ctx, url) {\n  const path = url.pathname;';
must(count(RASA_HEAD) === 1, 'tryRasaApp head not unique (' + count(RASA_HEAD) + ')');
const LAND_ROUTE = `
  if (request.method === "GET" && path.startsWith("/p/")) {
    const pid = path.slice(3).replace(/[^a-z0-9_-]/gi, "");
    if (!pid) return new Response("not found", { status: 404 });
    const raw = await env.RASA_KV?.get(\`land:\${pid}\`);
    let page = null;
    try {
      page = raw ? JSON.parse(raw) : null;
    } catch {
    }
    if (!page) return new Response("<!doctype html><html lang=\\"fa\\" dir=\\"rtl\\"><meta charset=\\"utf-8\\"><body style=\\"background:#0b0f14;color:#eef2f7;font-family:Tahoma;padding:40px;text-align:center\\">این صفحه پیدا نشد یا حذف شده است.</body></html>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response(renderLandingPage(page), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "x-robots-tag": "noindex" }
    });
  }`;
src = src.replace(RASA_HEAD, RASA_HEAD + LAND_ROUTE);

/* ---------- 5) the public submit endpoint (no auth: the page is public) ---------- */
const MAPI_HEAD = 'const store2 = new Store(env, config);\n  const path = url.pathname;';
must(count(MAPI_HEAD) === 1, 'handleMiniAppApi head not unique (' + count(MAPI_HEAD) + ')');
const LAND_API = `
  if (path === "/api/landing/submit" || path === "/api/landing/count") {
    const pidOf = (v) => String(v || "").replace(/[^a-z0-9_-]/gi, "");
    if (request.method === "GET" && path === "/api/landing/count") {
      const pid = pidOf(url.searchParams.get("page"));
      const subs = pid ? await store2.get(\`landsubs:\${pid}\`, { items: [] }) : { items: [] };
      return json({ ok: true, count: (subs.items || []).length });
    }
    if (request.method !== "POST") return bad("method", 405);
    let body2 = {};
    try {
      body2 = await request.json();
    } catch {
      return bad("body");
    }
    const pid = pidOf(body2?.page);
    const page = pid ? await store2.get(\`land:\${pid}\`, null) : null;
    if (!page || !page.owner) return bad("page", 404);
    const item = {
      at: Date.now(),
      name: String(body2?.name || "").slice(0, 80),
      contact: String(body2?.contact || "").slice(0, 80),
      note: String(body2?.note || "").slice(0, 300)
    };
    if (!item.name && !item.contact) return bad("empty");
    const subs = await store2.get(\`landsubs:\${pid}\`, { items: [] });
    subs.items = [...(subs.items || []), item].slice(-200);
    await store2.put(\`landsubs:\${pid}\`, subs, 90 * 86400);
    if (subs.items.length <= 50) {
      await tgCall(env, "sendMessage", {
        chat_id: page.owner,
        text: \`\u{1F4E5} ثبت جدید در «\${page.title || ""}»\\n\u{1F464} \${item.name || "—"}\\n\u{1F4DE} \${item.contact || "—"}\\n\u{1F4DD} \${item.note || "—"}\\n\\nمجموع ثبت‌ها: \${subs.items.length}\`
      }).catch(() => {
      });
    }
    return json({ ok: true, count: subs.items.length });
  }`;
src = src.replace(MAPI_HEAD, MAPI_HEAD + LAND_API);

/* ---------- 6) let the router through for /api/landing/* ---------- */
const API_TAIL = '  /^\\/api\\/ai\\//\n];';
must(count(API_TAIL) === 1, 'RASA_API tail not unique (' + count(API_TAIL) + ')');
src = src.replace(API_TAIL, '  /^\\/api\\/ai\\//,\n  /^\\/api\\/landing\\//\n];');

/* ---------- 7) sanity ---------- */
must(count('renderCommunityPost') >= 2, 'community renderer missing');
must(count('renderLandingPage') >= 2, 'landing renderer missing');
must(count('handleCommunityCallback') === 2, 'community callback wiring wrong (' + count('handleCommunityCallback') + ')');
must(count('communityDispatch') === 2, 'community dispatch wiring wrong (' + count('communityDispatch') + ')');
must(count('path === "/api/landing/submit"') === 1, 'landing submit route missing');
must(count('api/landing/submit') >= 2, 'landing submit reference missing from the page');
must(count('/^\\/api\\/landing\\//') === 1, 'router entry missing');
must(count('path.startsWith("/p/")') === 1, 'landing page route missing');
must(count('job.flow') >= 1, 'flow tick missing');
must(count('handleDeepCallback') === 2, 'deep-tab wiring wrong (' + count('handleDeepCallback') + ')');
fs.writeFileSync(target, src);
console.log('✔ v3 patched', target, '→', Buffer.byteLength(src), 'bytes');
