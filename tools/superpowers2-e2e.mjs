#!/usr/bin/env node
/* تست قدرت‌های نامحدود (b44): گیت‌هاب، میزبانی HTML، اپ هوشمند، کد، ابزار HTTP سفارشی
   Usage: node cf/sim/sp2_test.mjs [bundle.mjs]                                  */
import path from 'node:path';
import http from 'node:http';

const BUNDLE = process.argv[2] || 'cf/sim/bundle_v28.mjs';
const OWNER = 5982315292, CHAN = '@xjjsjsjsjji', SECRET = 'TESTSECRET123456';
let results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

/* ── مغز جعلی (HTTP محلی) ── */
const brain = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let text = 'متن پیش‌فرض مغز';
    if (body.includes('سؤال کاربر') || body.includes('سوال کاربر')) text = 'پاسخ-آزمایشی-۱۲۳';
    else if (body.includes('MAKE_HTML_TEST')) text = '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>t</title></head><body><h1>RASA-PAGE-OK</h1></body></html>';
    else if (body.includes('MAKE_APP_TEST')) text = '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head><body><h1>APP-OK</h1><script>fetch("./api",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({q:"x"})})</script></body></html>';
    else if (body.includes('MAKE_CODE_TEST')) text = '// CODE-OK\nconsole.log("hello from rasa");\n';
    else if (body.includes('برگردان')) text = 'ترجمهٔ آزمایشی';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, text }));
  });
});
await new Promise((r) => brain.listen(0, '127.0.0.1', r));
const BRAIN = 'http://127.0.0.1:' + brain.address().port;

/* ── KV جعلی ── */
const kv = new Map([['cmd:chan:shared', JSON.stringify(CHAN)]]);
const makeKV = () => ({
  async get(k, o) { const v = kv.get(k); if (v === undefined) return null; if (o && o.type === 'json') { try { return JSON.parse(v); } catch { return null; } } return v; },
  async put(k, v) { kv.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kv.delete(k); },
  async list() { return { keys: [] }; }
});
const kvGet = (k) => { const v = kv.get(k); try { return v === undefined ? null : JSON.parse(v); } catch { return v; } };
const kvSet = (k, v) => kv.set(k, JSON.stringify(v));

/* ── فیدها و API های جعلی ── */
const gh = {
  commits: [
    { sha: 'aaa1111', title: 'fix: first commit', link: 'https://github.com/o/r/commit/aaa1111', at: '2026-09-30T10:00:00Z', author: 'Ali' },
    { sha: 'bbb2222', title: 'feat: second commit', link: 'https://github.com/o/r/commit/bbb2222', at: '2026-09-30T11:00:00Z', author: 'Ali' }
  ],
  stars: 5, comments: 1
};
const atom = (list) => '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">' + list.map((e) => `<entry><id>tag:github.com,2008:Grit::Commit/${e.sha}</id><title>${e.title}</title><link rel="alternate" type="text/html" href="${e.link}"/><updated>${e.at}</updated><author><name>${e.author}</name></author></entry>`).join('') + '</feed>';

/* ── تلگرام جعلی ── */
const sent = [];
let mid = 900;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/')) {
    const method = u.split('/').pop();
    let body = {};
    try { body = typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch { body = {}; }
    mid += 1;
    const rec = { method, chat: body.chat_id, text: body.text, caption: body.caption, html: body.html || (body.rich_message && body.rich_message.html) || (body.rich && body.rich.html) || '', markup: body.reply_markup };
    sent.push(rec);
    let result = { message_id: mid };
    if (method === 'getChat') result = { id: -100, title: 'ch', username: CHAN.replace('@', ''), type: 'channel' };
    if (method === 'getChatMember') result = { status: 'creator' };
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://github.com/o/r/commits/')) return new Response(atom(gh.commits), { status: 200 });
  if (u.startsWith('https://github.com/o/r/releases.atom')) return new Response(atom([{ sha: 'v1', title: 'v1.0.0', link: 'https://github.com/o/r/releases/tag/v1.0.0', at: '2026-09-29T09:00:00Z', author: 'Ali' }]), { status: 200 });
  if (u.startsWith('https://api.github.com/repos/o/r/issues/12')) {
    return new Response(JSON.stringify({ title: 'باگ عجیب', state: 'open', comments: gh.comments, updated_at: '2026-09-30T12:00:00Z', html_url: 'https://github.com/o/r/issues/12', labels: [{ name: 'bug' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://api.github.com/repos/o/r')) {
    return new Response(JSON.stringify({ full_name: 'o/r', stargazers_count: gh.stars, open_issues_count: 2, pushed_at: '2026-09-30T12:00:00Z' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://api.example.com/echo')) return new Response(JSON.stringify({ echoed: u }), { status: 200, headers: { 'content-type': 'application/json' } });
  return realFetch(url, opts);
};

/* ── محیط ── */
const env = {
  BOT_TOKEN: '1:T', KV: makeKV(), KV_FRESH: makeKV(), RASA_KV: makeKV(), STORE: makeKV(),
  MCP_SECRET: SECRET, CMD_CHANNEL: CHAN, COMMANDER_ON: '1', COMMANDER_OWNERS: String(OWNER),
  CMDR_BRAIN_URL: BRAIN, CMDR_BRAIN_KEY: 'k'
};
const { default: worker } = await import(path.resolve(BUNDLE));
const mcp = async (method, params, id = 1) => {
  const res = await worker.fetch(new Request('https://x/api/mcp/' + SECRET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }), env, {});
  return res.json();
};
const callTool = async (name, args) => { const r = await mcp('tools/call', { name, arguments: args }); return JSON.parse(r.result.content[0].text); };
const tick = async () => { const pend = []; await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: (p) => pend.push(p) }); await Promise.all(pend.map((p) => Promise.resolve(p).catch(() => {}))); };
const getUrl = async (u) => { const r = await worker.fetch(new Request(u), env, {}); return { status: r.status, text: await r.text(), ct: r.headers.get('content-type') }; };
const forceRun = (key) => { const b = kvGet(key); if (!b) return; b.items.forEach((x) => { x.lastRun = 0; }); kvSet(key, b); };

console.log('\n🚀 تست قدرت‌های نامحدود (b44)\n');

/* ۱) فهرست ابزارها */
const tl = await mcp('tools/list', {});
const names = tl.result.tools.map((t) => t.name);
const NEED = ['github_watch', 'github_check', 'github_list', 'github_remove', 'issue_watch', 'issue_list', 'issue_remove', 'make_page', 'make_app', 'page_list', 'page_delete', 'app_delete', 'site_create', 'site_add_file', 'make_code', 'code_list', 'code_get', 'api_tool_add', 'api_tool_list', 'api_tool_remove', 'api_tool_call'];
check('MCP → ۵۷ ابزار (۳۶ + ۲۱ تازه)', names.length >= 57 && NEED.every((n) => names.includes(n)), 'count=' + names.length);

/* ۲) github_check */
let gc = await callTool('github_check', { repo: 'o/r', kind: 'commits' });
check('github_check → آخرین کامیت‌ها', gc.ok === true && gc.items.length === 2, gc.items && gc.items[0] && gc.items[0].sha);

/* ۳) رصد کامیت */
let gw = await callTool('github_watch', { repo: 'https://github.com/o/r', kind: 'commits', every_minutes: 10, post: true, translate: true });
check('github_watch → ثبت + اتصال فید', gw.ok === true && /اتصال/.test(gw.check || ''), gw.id || '');
forceRun('sp:gh:5982315292');
sent.splice(0);
await tick();                                  /* اولین تیک: فقط seed */
check('تیک اول → ساکت (فقط seed)', !sent.some((x) => x.method === 'sendRichMessage' || x.method === 'sendMessage'), 'seen=' + ((kvGet('sp:gh:5982315292').items[0].seen || []).length));
gh.commits.push({ sha: 'ccc3333', title: 'feat: brand new thing', link: 'https://github.com/o/r/commit/ccc3333', at: '2026-09-30T13:00:00Z', author: 'Ali' });
forceRun('sp:gh:5982315292');
sent.splice(0);
await tick();
const posted = sent.filter((x) => x.method === 'sendRichMessage' && String(x.chat).includes('xjjsjsjsjji'));
const notified = sent.find((x) => x.method === 'sendMessage' && /تازه در o\/r/.test(x.text || ''));
if (!(posted.length === 1 && /ترجمهٔ آزمایشی/.test(posted[0].html || ''))) console.log('   🔍 posts:', JSON.stringify(sent.map((x) => [x.method, String(x.chat || '').slice(-8), (x.html || x.text || '').slice(0, 50)])));
check('کامیت تازه → انتشار در کانال', posted.length === 1 && /ترجمهٔ آزمایشی/.test(posted[0].html || ''), (posted[0] && (posted[0].html || '').slice(0, 60)) || '');
check('کامیت تازه → خبر در پیوی مالک', !!notified);

/* ۴) رصد ستاره‌ها */
let gs = await callTool('github_watch', { repo: 'o/r', kind: 'stars', every_minutes: 10, post: false });
check('github_watch stars → ثبت', gs.ok === true);
forceRun('sp:gh:5982315292');
await tick();
gh.stars = 6;
forceRun('sp:gh:5982315292');
sent.splice(0);
await tick();
check('ستاره ۵→۶ → خبر', sent.some((x) => /⭐ تازه در o\/r/.test(x.text || '')));

/* ۵) رصد ایشو */
let iw = await callTool('issue_watch', { url: 'https://github.com/o/r/issues/12', every_minutes: 5 });
check('issue_watch → ثبت + عکس وضعیت', iw.ok === true && iw.snapshot && iw.snapshot.comments === 1, iw.id || '');
gh.comments = 3;
forceRun('sp:wiss:5982315292');
sent.splice(0);
await tick();
check('کامنت تازهٔ ایشو → خبر', sent.some((x) => /ایشو #12/.test(x.text || '')));

/* ۶) صفحهٔ HTML ساختهٔ AI + میزبانی */
let mp = await callTool('make_page', { title: 'تست', prompt: 'MAKE_HTML_TEST' });
check('make_page → ساخت و میزبانی', mp.ok === true && /\/s\/\d+\//.test(mp.url || ''), mp.url || '');
let pg = await getUrl(mp.url);
check('صفحهٔ ساخته‌شده واقعاً سرو می‌شود', pg.status === 200 && pg.text.includes('RASA-PAGE-OK'), 'status=' + pg.status);

/* ۷) اپ هوشمند + نقطهٔ پایانی api */
let ma = await callTool('make_app', { name: 'دستیار تست', goal: 'MAKE_APP_TEST' });
check('make_app → آدرس اپ', ma.ok === true && /\/s\/\d+\/[a-z0-9-]+\/$/.test(ma.url || ''), ma.url || '');
let appPage = await getUrl(ma.url);
check('صفحهٔ اپ سرو می‌شود', appPage.status === 200 && appPage.text.includes('APP-OK'));
const apiRes = await worker.fetch(new Request(ma.url + 'api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: 'سلام؟' }) }), env, {});
const apiJson = (apiRes.headers.get('content-type') || '').includes('json') ? await apiRes.json() : { ok: false, error: 'html/' + apiRes.status };
check('نقطهٔ پایانی api → پاسخ زندهٔ مغز', apiJson.ok === true && /پاسخ-آزمایشی/.test(apiJson.answer || ''), (apiJson.answer || '').slice(0, 30));

/* ۸) آپلود دقیق فایل (سایت چندصفحه‌ای) */
let sf = await callTool('site_add_file', { slug: 'demo', path: 'index.html', content: '<!doctype html><html><body><h1>EXACT-FILE-OK</h1></body></html>' });
check('site_add_file → فایل زنده', sf.ok === true && /\/s\/\d+\/demo\/index\.html/.test(sf.url || ''), sf.url || '');
let d1 = await getUrl(sf.url);
let d2 = await getUrl(sf.url.replace('/index.html', '/'));
check('فایل دقیق سرو می‌شود', d1.text.includes('EXACT-FILE-OK') && d2.text.includes('EXACT-FILE-OK'));

/* ۹) کد */
let mc = await callTool('make_code', { name: 'hello.js', prompt: 'MAKE_CODE_TEST' });
check('make_code → کد + لینک', mc.ok === true && /CODE-OK/.test(mc.preview || ''), mc.url || '');
let cf1 = await getUrl(mc.url);
check('فایل کد از /w سرو می‌شود', cf1.text.includes('CODE-OK') && (cf1.ct || '').includes('javascript'));

/* ۱۰) ابزار HTTP سفارشی (بدون دیپلوی، همان لحظه) */
let at = await callTool('api_tool_add', { name: 'echo', url: 'https://api.example.com/echo?q={q}', method: 'GET', desc: 'اکوی تست' });
check('api_tool_add → ثبت ابزار تازه', at.ok === true && at.call_as === 'api_echo');
const tl2 = await mcp('tools/list', {});
check('ابزار تازه در فهرست MCP/جمنای', tl2.result.tools.map((t) => t.name).includes('api_echo'));
const ec = await callTool('api_echo', { q: 'hi' });
check('فراخوانی api_echo → پاسخ سرویس', ec.ok === true && JSON.stringify(ec.json || {}).includes('hi'), JSON.stringify(ec.json || {}).slice(0, 60));

/* ۱۱) صفحهٔ پرسش‌وپاسخ ساده */
let ap = await callTool('make_page', { title: 'پرسش‌ها', prompt: 'هر چی بپرسی جواب می‌دم', agent: true });
check('make_page agent → صفحهٔ پرسش‌وپاسخ', ap.ok === true && ap.mode === 'agent', ap.url || '');
const apApi = await worker.fetch(new Request(ap.url + 'api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: 'سلام' }) }), env, {});
const apJson = (apApi.headers.get('content-type') || '').includes('json') ? await apApi.json() : { ok: false, error: 'html/' + apApi.status };
check('پاسخ زندهٔ صفحهٔ agent', apJson.ok === true && /پاسخ-آزمایشی/.test(apJson.answer || ''));

/* ۱۲) فهرست صفحه‌ها */
let pl = await callTool('page_list', {});
check('page_list → صفحه‌ها و پروژه‌ها', pl.ok === true && pl.pages.length >= 1 && pl.sites.length >= 2, 'pages=' + pl.pages.length + ' sites=' + pl.sites.length);

/* ۱۳) حذف */
let pd = await callTool('page_delete', { slug: mp.slug });
check('page_delete → حذف', pd.ok === true);
let gone = await getUrl(mp.url);
check('صفحهٔ حذف‌شده → ۴۰۴', gone.status === 404);

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
brain.close();
process.exit(failed ? 1 : 0);
