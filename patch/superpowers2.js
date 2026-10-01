/* ═══════════════════════════════════════════════════════════════════════════
   b44 — «قدرت‌های نامحدود»: گیت‌هاب، میزبانی HTML، اپ هوشمند، ابزار HTTP سفارشی
   ═══════════════════════════════════════════════════════════════════════════ */

async function spTouchUid(store, uid) {
  var idx = await store.get('sp:ids', { uids: [] });
  if ((idx.uids || []).indexOf(uid) < 0) {
    idx.uids = [uid].concat(idx.uids || []).slice(0, 200);
    await store.put('sp:ids', idx, 400 * 86400);
  }
}
function spBase(env) { return String(env.PUBLIC_BASE || 'https://rich-post-bot.4lisarani-1.workers.dev').replace(/\/+$/, ''); }
function spSlugOf(s, fb) {
  var x = String(s || '').toLowerCase().trim().replace(/\s+/g, '-');
  x = x.replace(/[^a-z0-9\u0600-\u06FF-]/g, '');
  x = x.replace(/[\u0600-\u06FF]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!x) x = String(fb || 'page').replace(/[^a-z0-9-]/g, '') + '-' + String(Date.now()).slice(-5);
  return x.slice(0, 40);
}
function spEscHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function spOut(ct, body, status) {
  return new Response(body, { status: status || 200, headers: { 'content-type': ct, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
function spJsonOut(o, status) { return spOut('application/json; charset=utf-8', JSON.stringify(o), status); }
var SP_MIME = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'application/javascript; charset=utf-8', mjs: 'application/javascript; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', xml: 'application/xml', ics: 'text/calendar' };
function spMimeOf(p) { var e = String(p || '').split('.').pop().toLowerCase(); return SP_MIME[e] || 'application/octet-stream'; }
function spWrapDoc(title, body, css) {
  return '<!doctype html>\n<html lang="fa" dir="rtl">\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width,initial-scale=1"/>\n<title>' + spEscHtml(title) + '</title>\n<style>' + (css || 'body{font-family:Tahoma,"Segoe UI",sans-serif;background:#0f1115;color:#e8eaf0;margin:0;padding:24px;line-height:1.9}a{color:#7cc4ff}.card{background:#171a21;border:1px solid #242833;border-radius:14px;padding:18px;margin:12px 0}') + '</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>';
}
function spCleanHtml(text) {
  var t = String(text || '');
  var fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1];
  var lo = t.toLowerCase();
  var i = lo.indexOf('<!doctype');
  if (i < 0) i = lo.indexOf('<html');
  if (i > 0) t = t.slice(i);
  if (lo.indexOf('<!doctype') < 0 && lo.indexOf('<html') < 0) t = spWrapDoc('صفحهٔ رسا', t);
  t = t.trim();
  if (t.length > 300000) t = t.slice(0, 300000);
  return t;
}

/* ── گیت‌هاب ─────────────────────────────────────────────────────────────── */
function spAtomItems(xml) {
  var out = [];
  var blocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (var i = 0; i < blocks.length && out.length < 20; i += 1) {
    var b = blocks[i];
    var id = (b.match(/<id[^>]*>([\s\S]*?)<\/id>/i) || [])[1] || '';
    var title = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    var link = (b.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) || [])[1] || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
    var author = (b.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/i) || [])[1] || '';
    var upd = (b.match(/<updated>([\s\S]*?)<\/updated>/i) || [])[1] || (b.match(/<published>([\s\S]*?)<\/published>/i) || [])[1] || '';
    var t = spStripTags(title);
    if (!t || !link) continue;
    var sha = spStripTags(id).split('/').pop();
    out.push({ id: spStripTags(id).slice(0, 120) || link, title: t.slice(0, 220), link: spStripTags(link), author: spStripTags(author).slice(0, 60), updated: spStripTags(upd), sha: String(sha || '').slice(0, 12) });
  }
  return out;
}
function spGhUrl(repo, kind, branch) {
  var r = String(repo || '').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  if (kind === 'releases') return 'https://github.com/' + r + '/releases.atom';
  if (kind === 'tags') return 'https://github.com/' + r + '/tags.atom';
  if (kind === 'issues') return 'https://github.com/' + r + '/issues.atom';
  if (kind === 'stars') return 'https://api.github.com/repos/' + r;
  return 'https://github.com/' + r + '/commits/' + (branch || 'main') + '.atom';
}
function spRepoOf(x) { return String(x || '').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '').split('/').slice(0, 2).join('/'); }
async function spGhFetch(repo, kind, branch) {
  var url = spGhUrl(repo, kind, branch);
  var got = await spFetchText(url, 12000);
  if (kind === 'stars') {
    /* مسیر اول: خود صفحهٔ گیت‌هاب (API از کلادفلر معمولاً ۴۰۳ می‌دهد) */
    var page = await spFetchText('https://github.com/' + repo, 12000);
    if (page.ok && page.text) {
      var mSt = page.text.match(/id="repo-stars-counter-star"[^>]*title="([\d,]+)"/i) || page.text.match(/stargazers[^\d]{0,80}([\d,]{1,15})\s*</i);
      var mIs = page.text.match(/id="issues-repo-tab-count"[^>]*title="([\d,]+)"/i) || page.text.match(/id="repo-issues-counter"[^>]*>([\d,]+)/i);
      if (mSt) {
        var stars = String(mSt[1]).replace(/[^0-9]/g, '') || '0';
        var issN = mIs ? String(mIs[1]).replace(/[^0-9]/g, '') : '';
        return { ok: true, items: [{ id: 'stars:' + stars, title: '⭐ ' + stars + ' ستاره' + (issN ? ' · ' + issN + ' ایشو باز' : ''), link: 'https://github.com/' + repo, author: '', updated: '', sha: '' }] };
      }
    }
    if (!got.ok || !got.text) return { ok: false, note: 'HTTP ' + got.status + (got.error ? ' ' + got.error.slice(0, 60) : '') };
    var j = null; try { j = JSON.parse(got.text); } catch (e) { return { ok: false, note: 'پاسخ نامعتبر' }; }
    if (!j || j.stargazers_count === undefined) return { ok: false, note: j && j.message ? String(j.message).slice(0, 80) : 'بدون داده' };
    return { ok: true, items: [{ id: 'stars:' + j.stargazers_count, title: '⭐ ' + j.stargazers_count + ' ستاره · ' + (j.open_issues_count || 0) + ' ایشو باز', link: 'https://github.com/' + j.full_name, author: '', updated: j.pushed_at || '', sha: '' }] };
  }
  if ((!got.ok && !(got.text && got.text.indexOf('<') > -1)) || !got.text) {
    if (kind === 'commits' && (branch || 'main') !== 'master') {
      var retry = await spFetchText(spGhUrl(repo, 'commits', 'master'), 12000);
      if (retry.ok && retry.text && retry.text.indexOf('<entry') > -1) return { ok: true, items: spAtomItems(retry.text) };
    }
    return { ok: false, note: 'HTTP ' + got.status + (got.error ? ' ' + got.error.slice(0, 60) : '') };
  }
  var items = spAtomItems(got.text);
  if (!items.length) return { ok: false, note: kind === 'commits' ? 'کامیتی در این شاخه پیدا نشد' : 'هنوز چیزی در این بخش منتشر نشده (مثلاً ریلیز یا تگی نداشته)' };
  return { ok: true, items: items };
}
function spRepoTpl(tpl, repo, it) {
  return String(tpl || '🆕 **{repo}** — {title}\n{link}')
    .replace(/\{repo\}/g, repo).replace(/\{title\}/g, it.title).replace(/\{link\}/g, it.link)
    .replace(/\{author\}/g, it.author || '—').replace(/\{time\}/g, it.updated || '').replace(/\{sha\}/g, it.sha || '')
    .replace(/\{kind\}/g, it.kind || '');
}
async function spGhTranslate(env, title) {
  try {
    var out = await cmdBrain(env, [{ role: 'user', content: 'این تیتر انگلیسی را کوتاه و روان به فارسی برگردان. فقط خودِ ترجمه، بدون توضیح:\n' + title }], 120);
    return String(out || '').trim().slice(0, 220) || title;
  } catch (e) { return title; }
}
async function spGhPollOne(env, store, uid, f, chan) {
  var repo = spRepoOf(f.repo);
  if (!repo || repo.indexOf('/') < 0) { f.lastErr = 'نام ریپو نامعتبر (مثل owner/repo)'; return; }
  if (Date.now() - (f.lastRun || 0) < (f.every || 30) * 60000) return;
  f.lastRun = Date.now();
  var res = await spGhFetch(repo, f.kind || 'commits', f.branch);
  if (!res.ok) {
    f.lastErr = res.note || 'خطا';
    f.errN = (f.errN || 0) + 1;
    if (f.errN === 3) await spNotify(env, uid, '⚠️ رصد گیت‌هاب ' + repo + ' چند بار پشت‌سرهم خطا داد: ' + f.lastErr);
    return;
  }
  f.errN = 0; f.lastErr = '';
  var ids = res.items.map(function (x) { return x.id; });
  if (!(f.seen || []).length) { f.seen = ids.slice(0, 20); f.seeded = true; return; }
  var fresh = res.items.filter(function (x) { return (f.seen || []).indexOf(x.id) < 0; }).slice(0, f.max || 3);
  for (var i = 0; i < fresh.length; i += 1) {
    var it = fresh[i];
    it.kind = f.kind || 'commits';
    var title = it.title;
    if (f.translate && /[a-zA-Z]/.test(title)) title = await spGhTranslate(env, title);
    var body = spRepoTpl(f.template, repo, { title: title, link: it.link, author: it.author, updated: it.updated, sha: it.sha, kind: it.kind });
    var posted = null;
    if (!f.quiet) posted = await spPublish(env, uid, f.target || chan, body);
    var head = f.kind === 'stars' ? '⭐' : f.kind === 'releases' ? '🚀' : f.kind === 'tags' ? '🏷' : f.kind === 'issues' ? '📋' : '🆕';
    await spNotify(env, uid, head + ' تازه در ' + repo + ':\n' + title + '\n' + it.link + (posted && posted.ok ? '\nمنتشر شد: ' + (posted.link || '') : (posted && !posted.ok ? '\n⚠️ انتشار نشد: ' + (posted.error || '') : '')));
    f.seen = [it.id].concat((f.seen || []).filter(function (x) { return x !== it.id; })).slice(0, 60);
    f.lastEvent = { title: title, link: it.link, at: Date.now() };
  }
  f.lastFound = fresh.length;
  f.lastChecked = Date.now();
}

/* ── رصد ایشوی مشخص ─────────────────────────────────────────────────────── */
function spIssueRef(x) {
  var s = String(x || '');
  var m = s.match(/github\.com\/([^\/\s]+)\/([^\/\s]+)\/(?:issues|pull)\/(\d+)/i);
  if (m) return { repo: m[1] + '/' + m[2], num: Number(m[3]) };
  var m2 = s.match(/^([^\/\s]+)\/([^\/\s#]+)[#\/](\d+)$/);
  if (m2) return { repo: m2[1] + '/' + m2[2], num: Number(m2[3]) };
  return null;
}
async function spIssuePollOne(env, store, uid, w, chan) {
  if (Date.now() - (w.lastRun || 0) < (w.every || 10) * 60000) return;
  w.lastRun = Date.now();
  var got = await spFetchText('https://api.github.com/repos/' + w.repo + '/issues/' + w.num, 12000);
  if (!got.ok || !got.text) {
    /* پشتیبان: فید اتمیک ایشوها (وقتی API از کلادفلر محدود شده) */
    var feed = await spFetchText('https://github.com/' + w.repo + '/issues.atom', 12000);
    if (feed.ok && feed.text) {
      var ent = spAtomItems(feed.text).filter(function (x) { return new RegExp('/issues/' + w.num + '(?:$|[?#])').test(x.link); })[0];
      if (ent) {
        w.lastErr = '';
        var snapF = { title: ent.title, state: '', comments: -1, updated: ent.updated, label: '' };
        if (!w.snap) { w.snap = snapF; return; }
        if (w.snap.updated !== snapF.updated || w.snap.title !== snapF.title) {
          var chF = [];
          if (w.snap.title !== snapF.title) chF.push('✏️ عنوان عوض شد: ' + snapF.title);
          if (w.snap.updated !== snapF.updated) chF.push('✍️ به‌روزرسانی تازه (کامنت/تغییر وضعیت)');
          var bF = '📋 **' + w.repo + ' #' + w.num + '**\n' + snapF.title + '\n' + chF.join(' · ') + '\n' + ent.link;
          var pF = null;
          if (w.post) pF = await spPublish(env, uid, w.target || chan, bF);
          await spNotify(env, uid, '🔔 ایشو #' + w.num + ' در ' + w.repo + ':\n' + chF.join('\n') + '\n' + ent.link + (pF && pF.ok ? '\nمنتشر شد: ' + (pF.link || '') : ''));
          w.snap = snapF;
          w.lastEvent = { at: Date.now(), changes: chF };
        }
        return;
      }
    }
    w.lastErr = 'HTTP ' + got.status;
    return;
  }
  var j = null; try { j = JSON.parse(got.text); } catch (e) { w.lastErr = 'پاسخ نامعتبر'; return; }
  if (!j || !j.title) { w.lastErr = (j && j.message) ? String(j.message).slice(0, 70) : 'بدون داده'; return; }
  w.lastErr = '';
  var snap = { title: j.title, state: j.state, comments: j.comments || 0, updated: j.updated_at, label: (j.labels && j.labels[0] && j.labels[0].name) || '' };
  if (!w.snap) { w.snap = snap; return; }
  var prev = w.snap;
  var changes = [];
  if (prev.state !== snap.state) changes.push(snap.state === 'closed' ? '✅ بسته شد' : '🔄 باز شد');
  if (prev.comments !== snap.comments) changes.push('💬 ' + (snap.comments - prev.comments > 0 ? '+' : '') + (snap.comments - prev.comments) + ' کامنت (کل: ' + snap.comments + ')');
  if (prev.title !== snap.title) changes.push('✏️ عنوان عوض شد: ' + snap.title);
  if (prev.label !== snap.label) changes.push('🏷 برچسب: ' + (snap.label || '—'));
  if (!changes.length) return;
  var link = j.html_url || ('https://github.com/' + w.repo + '/issues/' + w.num);
  var body = '📋 **' + w.repo + ' #' + w.num + '**\n' + snap.title + '\n' + changes.join(' · ') + '\n' + link;
  var posted = null;
  if (w.post) posted = await spPublish(env, uid, w.target || chan, body);
  await spNotify(env, uid, '🔔 ایشو #' + w.num + ' در ' + w.repo + ':\n' + changes.join('\n') + '\n' + link + (posted && posted.ok ? '\nمنتشر شد: ' + (posted.link || '') : ''));
  w.snap = snap;
  w.lastEvent = { at: Date.now(), changes: changes };
}

/* ── تولید با هوش مصنوعی ─────────────────────────────────────────────────── */
async function spGen(env, kind, args) {
  var sys = '';
  if (kind === 'page') {
    sys = 'یک صفحهٔ وب کامل و مستقل به زبان فارسی بساز. خروجی فقط HTML باشد (بدون توضیح و بدون ```).\nقواعد: lang="fa" dir="rtl"، CSS درون خود فایل (تگ style)، بدون فایل/فونت/تصویر بیرونی، موبایل‌فرست و شیک، رنگ‌بندی هماهنگ، تیتر و بخش‌بندی خوانا، اگر جدول یا کارت لازم بود بساز. هیچ منبع بیرونی لود نکن.';
  } else if (kind === 'app') {
    sys = 'یک اپ وب تک‌فایلی فارسی بساز. خروجی فقط HTML (بدون توضیح و بدون ```).\nالزامات: lang="fa" dir="rtl"، CSS و JS داخل خود فایل، موبایل‌فرست. اپ یک کادر پرسش دارد؛ با ارسال، این کد را صدا بزن:\nfetch("./api",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({q:question})}).then(r=>r.json()).then(d=>show(d.answer))\nپاسخ سرور متنی است؛ با textContent نمایش بده (نه innerHTML). حالت «در حال فکر کردن» و خطا هم نشان بده.';
  } else if (kind === 'code') {
    sys = 'فقط کد بنویس (بدون توضیح و بدون ```). تمیز، کوتاه، با کامنت فارسی کوتاه در جاهای لازم.';
  }
  var ask = sys + '\n\nخواستهٔ کاربر: ' + String(args.prompt || args.goal || '').slice(0, 1200);
  if (kind === 'page' && args.title) ask += '\nعنوان صفحه: ' + String(args.title).slice(0, 120);
  if (kind === 'code' && args.name) ask += '\nنام فایل: ' + String(args.name).slice(0, 60);
  var out = await cmdBrain(env, [{ role: 'user', content: ask }], kind === 'code' ? 1800 : 3600);
  return String(out || '').trim();
}
async function spAiOk(env) {
  if (env.AI && typeof env.AI.run === 'function') return true;
  var C = cmdConfig(env);
  return !!(C.brain || C.gemini);
}

/* ── ابزارهای HTTP سفارشی ───────────────────────────────────────────────── */
function spFillVars(tpl, args) {
  return String(tpl || '').replace(/\{([a-zA-Z0-9_]+)\}/g, function (m, k) {
    var v = args && args[k] !== undefined ? args[k] : '';
    if (typeof v === 'object') v = JSON.stringify(v);
    var sv = String(v);
    return /^[A-Za-z0-9._~\/-]*$/.test(sv) ? sv : encodeURIComponent(sv);
  });
}
async function spApiToolCall(env, uid, def, args) {
  var a = args || {};
  var url = spFillVars(def.url, a);
  if (def.method === 'GET') {
    var qs = [];
    for (var k in a) { if (def.url.indexOf('{' + k + '}') < 0) qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(typeof a[k] === 'object' ? JSON.stringify(a[k]) : String(a[k]))); }
    if (qs.length) url += (url.indexOf('?') > -1 ? '&' : '?') + qs.join('&');
  }
  var headers = { 'user-agent': 'RasaBot/1.0' };
  try { if (def.headers) Object.assign(headers, JSON.parse(def.headers)); } catch (e) {}
  var init = { method: def.method === 'POST' ? 'POST' : 'GET', headers: headers };
  if (def.method === 'POST') {
    var body = def.body || '';
    var raw = String(body).replace(/\{([a-zA-Z0-9_]+)\}/g, function (m, k) { var v = a[k]; if (v === undefined) return m; return typeof v === 'object' ? JSON.stringify(v) : String(v); });
    init.body = raw;
    if (!headers['content-type'] && !headers['Content-Type']) headers['content-type'] = 'application/json';
  }
  var r = await fetch(url, init);
  var text = (await r.text()).slice(0, 30000);
  var out = { ok: r.ok, status: r.status, url: url.slice(0, 300) };
  try { out.json = JSON.parse(text); out.body = out.json; } catch (e) { out.body = text; }
  return out;
}

/* ── چند‌صفحه‌ای‌ها ──────────────────────────────────────────────────────── */
async function spSiteBox(store, uid) { return await store.get('sp:web:' + uid, { sites: {} }); }
async function spPageBox(store, uid) { return await store.get('sp:dyn:' + uid, { pages: {} }); }

async function spWebReply(env, request, url) {
  var parts = url.pathname.split('/').filter(function (x) { return x !== ''; });
  var uid = Number(parts[1] || 0);
  if (!uid) return spOut('text/html; charset=utf-8', spWrapDoc('رسا', '<div class="card"><h2>میزبان صفحات رسا</h2><p>آدرس یک صفحه: <code>/s/&lt;شمارهٔ مالک&gt;/&lt;نام صفحه&gt;</code></p></div>'), 404);
  var slug = String(parts[2] || '').toLowerCase().replace(/[^a-z0-9-_]/g, '');
  var rest = parts.slice(3).map(function (x) { return String(x).replace(/\.{2,}/g, '.'); }).join('/');
  var store = new Store(rasaEnv(env), cfg(env));
  if (!slug) {
    var sb0 = await spSiteBox(store, uid);
    var pb0 = await spPageBox(store, uid);
    var rows = [];
    for (var s0 in (sb0.sites || {})) rows.push('<li><a href="/s/' + uid + '/' + s0 + '/">/s/' + uid + '/' + s0 + '/</a> — ' + spEscHtml(sb0.sites[s0].name || s0) + (sb0.sites[s0].app ? ' <b>(اپ هوشمند)</b>' : '') + '</li>');
    for (var p0 in (pb0.pages || {})) rows.push('<li><a href="/s/' + uid + '/' + p0 + '">/s/' + uid + '/' + p0 + '</a> — ' + spEscHtml(pb0.pages[p0].title || p0) + '</li>');
    return spOut('text/html; charset=utf-8', spWrapDoc('رسا — صفحه‌ها', '<h2>صفحه‌ها و اپ‌های این ربات</h2>' + (rows.length ? '<ul>' + rows.join('') + '</ul>' : '<div class="card">هنوز صفحه‌ای ساخته نشده. از ابزارهای make_page / make_app / site_add_file استفاده کن.</div>')));
  }
  var site = null, page = null;
  try { var sb = await spSiteBox(store, uid); site = (sb.sites || {})[slug] || null; } catch (e) {}
  try { var pb = await spPageBox(store, uid); page = (pb.pages || {})[slug] || null; } catch (e) {}
  if (!site && !page) return spOut('text/html; charset=utf-8', spWrapDoc('یافت نشد', '<div class="card"><h2>صفحه پیدا نشد</h2><p>' + spEscHtml(slug) + ' وجود ندارد یا حذف شده است.</p></div>'), 404);

  if (site && site.app && rest === 'api') {
    if (request.method === 'GET') return spJsonOut({ ok: false, error: 'از POST با {"q":"سوالت"} استفاده کن' }, 405);
    var body = {}; try { body = await request.json(); } catch (e) {}
    var q = String((body && (body.q || body.question)) || '').slice(0, 1500);
    if (!q) return spJsonOut({ ok: false, error: 'سؤالی نرسید' }, 400);
    var rc = await store.get('sp:apirc:' + uid, { hour: '', n: 0 });
    var hr = new Date().toISOString().slice(0, 13);
    if (rc.hour !== hr) { rc = { hour: hr, n: 0 }; }
    if (rc.n >= 200) return spJsonOut({ ok: false, error: 'سهمیهٔ این ساعت تمام شد' }, 429);
    rc.n += 1; await store.put('sp:apirc:' + uid, rc, 7200);
    var ans = '';
    try { ans = await cmdBrain(env, [{ role: 'user', content: 'تو دستیار این اپ هستی: ' + (site.goal || site.name || '') + '\nپاسخ کوتاه، دقیق و فارسی بده. بدون HTML و بدون مارک‌داون سنگین.\n\nسؤال کاربر: ' + q }], 700); } catch (e) { return spJsonOut({ ok: false, error: 'مغز در دسترس نبود: ' + String(e && e.message || e).slice(0, 120) }, 500); }
    return spJsonOut({ ok: true, answer: String(ans || '').slice(0, 4000) });
  }
  if (site) {
    var files = site.files || {};
    var path = rest || 'index.html';
    var f = files[path] || (rest === '' ? files['index.html'] : null) || (path.indexOf('/') < 0 && files[path + '/index.html']) || null;
    if (f && f.c) return spOut(spMimeOf(path), f.c);
    if (!rest) {
      var links = Object.keys(files).map(function (k) { return '<li><a href="/s/' + uid + '/' + slug + '/' + k + '">' + spEscHtml(k) + '</a></li>'; }).join('');
      return spOut('text/html; charset=utf-8', spWrapDoc(site.name || slug, '<h2>' + spEscHtml(site.name || slug) + '</h2><div class="card">فایل index.html نیست. فایل‌ها:<ul>' + links + '</ul></div>'), 404);
    }
    return spOut('text/html; charset=utf-8', spWrapDoc('یافت نشد', '<div class="card"><h2>فایل پیدا نشد</h2><p>' + spEscHtml(path) + '</p></div>'), 404);
  }
  if (page && !rest) return spOut('text/html; charset=utf-8', page.html);
  if (page && rest) {
    var pfiles = page.files || {};
    if (pfiles[rest] && pfiles[rest].c) return spOut(spMimeOf(rest), pfiles[rest].c);
  }
  return spOut('text/html; charset=utf-8', spWrapDoc('یافت نشد', '<div class="card">مسیر پیدا نشد.</div>'), 404);
}
async function spWebServe(env, request, url) {
  if (url.pathname === '/s' || url.pathname.startsWith('/s/')) return await spWebReply(env, request, url);
  if (url.pathname.startsWith('/w/')) {
    var parts = url.pathname.split('/').filter(Boolean);
    var uid = Number(parts[1] || 0);
    var name = String(parts[2] || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!uid || !name) return spOut('text/plain; charset=utf-8', 'نام فایل نامعتبر', 404);
    var store = new Store(rasaEnv(env), cfg(env));
    var box = await store.get('sp:code:' + uid, { items: [] });
    var hit = (box.items || []).filter(function (x) { return x.name === name; })[0];
    if (!hit) return spOut('text/plain; charset=utf-8', 'فایل پیدا نشد', 404);
    return spOut(spMimeOf(name), hit.code);
  }
  return null;
}

/* ── ابزارهای پویا برای MCP ─────────────────────────────────────────────── */
async function spExtraTools(env) {
  var out = [];
  try {
    var store = new Store(rasaEnv(env), cfg(env));
    var box = await store.get('sp:api:' + MCP_OWNER, { items: [] });
    (box.items || []).forEach(function (d) {
      out.push({
        name: 'api_' + d.name,
        description: 'ابزار HTTP سفارشی «' + d.name + '»' + (d.desc ? ' — ' + d.desc : '') + ' (' + d.method + ' ' + String(d.url).slice(0, 90) + '). پارامترها را با همان نام‌های داخل آدرس/بدنه بده.',
        inputSchema: { type: 'object', additionalProperties: true }
      });
    });
  } catch (e) { /* بی‌صدا */ }
  return out;
}

/* ── تیک هر دقیقه: گیت‌هاب و ایشوها ─────────────────────────────────────── */
async function spTick2(env) {
  var store = new Store(rasaEnv(env), cfg(env));
  try { await store.put('sp:tick2', { at: Date.now() }, 3600); } catch (e) {}
  var idx = await store.get('sp:ids', { uids: [] });
  var uids = (idx.uids || []).slice(0, 200);
  if (!uids.length) return;
  for (var u = 0; u < uids.length; u += 1) {
    var uid = uids[u];
    var chan = await spChannel(env, uid);
    try {
      var gb = await store.get('sp:gh:' + uid, { items: [] });
      var touched = false;
      for (var i = 0; i < (gb.items || []).length; i += 1) {
        var f = gb.items[i];
        if (f.off) continue;
        await spGhPollOne(env, store, uid, f, chan);
        touched = true;
      }
      if (touched) await store.put('sp:gh:' + uid, gb, 400 * 86400);
    } catch (e) { console.warn('gh tick', e && e.message); }
    try {
      var wb = await store.get('sp:wiss:' + uid, { items: [] });
      var touched2 = false;
      for (var w = 0; w < (wb.items || []).length; w += 1) {
        var wi = wb.items[w];
        if (wi.off) continue;
        await spIssuePollOne(env, store, uid, wi, chan);
        touched2 = true;
      }
      if (touched2) await store.put('sp:wiss:' + uid, wb, 400 * 86400);
    } catch (e) { console.warn('issue tick', e && e.message); }
  }
}

/* ── ابزارها (بخش دوم) ─────────────────────────────────────────────────── */
async function spTool2(env, uid, name, args, ctx, store, tg, chan) {
  args = args || {};

  /* ═══ گیت‌هاب ═══ */
  if (name === 'github_watch') {
    var repo = spRepoOf(args.repo || args.url);
    if (!repo || repo.indexOf('/') < 0) return { ok: false, error: 'نام ریپو لازم است، مثل: Alisarani7021/RasaRichBot' };
    var kind = ['commits', 'releases', 'tags', 'issues', 'stars'].indexOf(String(args.kind || '').toLowerCase()) > -1 ? String(args.kind).toLowerCase() : 'commits';
    var box = await store.get('sp:gh:' + uid, { items: [] });
    var every = Math.max(10, Number(args.every_minutes || 30));
    var existing = (box.items || []).filter(function (x) { return x.repo === repo && x.kind === kind; })[0];
    if (existing) {
      existing.every = every;
      if (args.post !== undefined) existing.quiet = !args.post;
      if (args.translate !== undefined) existing.translate = !!args.translate;
      if (args.template) existing.template = String(args.template).slice(0, 400);
      if (args.branch) existing.branch = String(args.branch).slice(0, 40);
      await store.put('sp:gh:' + uid, box, 400 * 86400);
      return { ok: true, updated: true, id: existing.id, repo: repo, kind: kind, every_minutes: every, note: 'قبلاً بود؛ به‌روز شد' };
    }
    if ((box.items || []).length >= 30) return { ok: false, error: 'حداکثر ۳۰ رصد گیت‌هاب' };
    var it = { id: 'gh' + String(Date.now()).slice(-8) + Math.floor(Math.random() * 90 + 10), repo: repo, kind: kind, every: every, quiet: !!(args.post === false), translate: !!args.translate, template: String(args.template || '').slice(0, 400), branch: String(args.branch || '').slice(0, 40), target: args.target || '', at: Date.now(), seen: [] };
    box.items = (box.items || []).concat([it]);
    await store.put('sp:gh:' + uid, box, 400 * 86400);
    await spTouchUid(store, uid);
    /* اولین بررسی همین حالا تا مطمئن شویم فید کار می‌کند */
    var chk = await spGhFetch(repo, kind, it.branch);
    var note = chk.ok ? ('اتصال ✅ — ' + chk.items.length + ' مورد دیده شد؛ از این به بعد جدیدها را پست می‌کنم') : ('⚠️ فید نخواند: ' + chk.note);
    return { ok: chk.ok, id: it.id, repo: repo, kind: kind, every_minutes: every, post: !it.quiet, translate: it.translate, check: note };
  }
  if (name === 'github_list') {
    var gb2 = await store.get('sp:gh:' + uid, { items: [] });
    return { ok: true, count: (gb2.items || []).length, items: (gb2.items || []).map(function (x) { return { id: x.id, repo: x.repo, kind: x.kind, every_minutes: x.every, post: !x.quiet, translate: x.translate, lastErr: x.lastErr || '', lastChecked: x.lastChecked || 0, lastEvent: x.lastEvent || null }; }) };
  }
  if (name === 'github_remove') {
    var gb3 = await store.get('sp:gh:' + uid, { items: [] });
    var idR = String(args.id || '');
    var before = (gb3.items || []).length;
    gb3.items = (gb3.items || []).filter(function (x) { return x.id !== idR && String(x.repo) !== idR; });
    await store.put('sp:gh:' + uid, gb3, 400 * 86400);
    return { ok: before !== gb3.items.length, removed: before - gb3.items.length, left: gb3.items.length };
  }
  if (name === 'github_check') {
    var repo4 = spRepoOf(args.repo || args.url);
    if (!repo4 || repo4.indexOf('/') < 0) return { ok: false, error: 'نام ریپو لازم است' };
    var kind4 = ['commits', 'releases', 'tags', 'issues', 'stars'].indexOf(String(args.kind || 'commits').toLowerCase()) > -1 ? String(args.kind).toLowerCase() : 'commits';
    var g5 = await spGhFetch(repo4, kind4, args.branch);
    if (!g5.ok) return { ok: false, error: g5.note, repo: repo4, kind: kind4 };
    return { ok: true, repo: repo4, kind: kind4, count: g5.items.length, items: g5.items.slice(0, 5).map(function (x) { return { title: x.title, link: x.link, author: x.author, at: x.updated, sha: x.sha }; }) };
  }
  if (name === 'issue_watch') {
    var ref = spIssueRef(args.url || args.issue || (args.repo && args.number ? args.repo + '#' + args.number : ''));
    if (!ref) return { ok: false, error: 'نشانی ایشو لازم است، مثل: https://github.com/owner/repo/issues/12' };
    var ib = await store.get('sp:wiss:' + uid, { items: [] });
    var ex = (ib.items || []).filter(function (x) { return x.repo === ref.repo && x.num === ref.num; })[0];
    if (ex) { ex.every = Math.max(5, Number(args.every_minutes || 10)); if (args.post !== undefined) ex.post = !!args.post; await store.put('sp:wiss:' + uid, ib, 400 * 86400); return { ok: true, updated: true, repo: ref.repo, num: ref.num }; }
    if ((ib.items || []).length >= 30) return { ok: false, error: 'حداکثر ۳۰ ایشو' };
    var iw = { id: 'iw' + String(Date.now()).slice(-8) + Math.floor(Math.random() * 90 + 10), repo: ref.repo, num: ref.num, every: Math.max(5, Number(args.every_minutes || 10)), post: !!args.post && !!chan, target: args.target || '', at: Date.now(), snap: null };
    ib.items = (ib.items || []).concat([iw]);
    await store.put('sp:wiss:' + uid, ib, 400 * 86400);
    await spTouchUid(store, uid);
    await spIssuePollOne(env, store, uid, iw, chan);
    await store.put('sp:wiss:' + uid, ib, 400 * 86400);
    return { ok: true, id: iw.id, repo: ref.repo, num: ref.num, every_minutes: iw.every, snapshot: iw.snap || null, note: 'از این به بعد هر تغییری (کامنت، بسته/باز شدن، عنوان، برچسب) را خبر می‌دهم' };
  }
  if (name === 'issue_list') {
    var ib2 = await store.get('sp:wiss:' + uid, { items: [] });
    return { ok: true, count: (ib2.items || []).length, items: (ib2.items || []).map(function (x) { return { id: x.id, repo: x.repo, num: x.num, every_minutes: x.every, state: (x.snap && x.snap.state) || '', comments: (x.snap && x.snap.comments) || 0, lastErr: x.lastErr || '' }; }) };
  }
  if (name === 'issue_remove') {
    var ib3 = await store.get('sp:wiss:' + uid, { items: [] });
    var idI = String(args.id || '');
    var b3 = (ib3.items || []).length;
    ib3.items = (ib3.items || []).filter(function (x) { return x.id !== idI; });
    await store.put('sp:wiss:' + uid, ib3, 400 * 86400);
    return { ok: b3 !== ib3.items.length, removed: b3 - ib3.items.length, left: ib3.items.length };
  }

  /* ═══ HTML / میزبانی ═══ */
  if (name === 'make_page') {
    if (args.agent) {
      var slugA = spSlugOf(args.slug || args.title, 'ask');
      var sbA = await spSiteBox(store, uid);
      var nameA = String(args.title || args.prompt || 'دستیار').slice(0, 80);
      (sbA.sites || {})[slugA] = { name: nameA, goal: String(args.prompt || args.goal || '').slice(0, 600), app: true, files: { 'index.html': { c: spAskPage(nameA, slugA), t: Date.now() } }, at: Date.now() };
      await store.put('sp:web:' + uid, sbA, 400 * 86400);
      await spTouchUid(store, uid);
      var urlA = spBase(env) + '/s/' + uid + '/' + slugA + '/';
      return { ok: true, mode: 'agent', url: urlA, slug: slugA, note: 'صفحهٔ پرسش‌وپاسخ زنده ساخته شد' };
    }
    if (!(await spAiOk(env))) return { ok: false, error: 'مغز هوش مصنوعی در دسترس نیست' };
    var html = spCleanHtml(await spGen(env, 'page', args));
    var slug = spSlugOf(args.slug || args.title, 'page');
    var pb = await spPageBox(store, uid);
    (pb.pages || {})[slug] = { title: String(args.title || args.prompt || slug).slice(0, 120), html: html, at: Date.now() };
    await store.put('sp:dyn:' + uid, pb, 400 * 86400);
    await spTouchUid(store, uid);
    var url = spBase(env) + '/s/' + uid + '/' + slug;
    return { ok: true, url: url, slug: slug, bytes: html.length, note: 'صفحه ساخته و میزبانی شد' };
  }
  if (name === 'make_app') {
    if (!(await spAiOk(env))) return { ok: false, error: 'مغز هوش مصنوعی در دسترس نیست' };
    var goal = String(args.goal || args.prompt || '').slice(0, 800);
    if (!goal) return { ok: false, error: 'هدف اپ را بگو (goal)' };
    var html2 = spCleanHtml(await spGen(env, 'app', { prompt: goal, name: args.name }));
    if (html2.toLowerCase().indexOf('./api') < 0) { /* اگر مدل صدا نزد، خودمان تزریق می‌کنیم */
      html2 = html2.replace(/<\/body>/i, '<script>window.__rasaAsk=function(q){return fetch("./api",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({q:String(q)})}).then(function(r){return r.json()})};</script></body>');
    }
    var slug2 = spSlugOf(args.slug || args.name, 'app');
    var sb2 = await spSiteBox(store, uid);
    (sb2.sites || {})[slug2] = { name: String(args.name || args.goal || slug2).slice(0, 80), goal: goal, app: true, files: { 'index.html': { c: html2, t: Date.now() } }, at: Date.now() };
    await store.put('sp:web:' + uid, sb2, 400 * 86400);
    await spTouchUid(store, uid);
    var url2 = spBase(env) + '/s/' + uid + '/' + slug2 + '/';
    return { ok: true, url: url2, slug: slug2, api: url2 + 'api', bytes: html2.length, note: 'اپ هوشمند زنده؛ پاسخ‌ها سرِ درخواست از مغز می‌آید' };
  }
  if (name === 'page_list') {
    var pb2 = await spPageBox(store, uid);
    var pb2b = await spSiteBox(store, uid);
    var outP = [];
    for (var k3 in (pb2.pages || {})) outP.push({ slug: k3, title: pb2.pages[k3].title, url: spBase(env) + '/s/' + uid + '/' + k3, bytes: (pb2.pages[k3].html || '').length });
    var outS = [];
    for (var k4 in (pb2b.sites || {})) outS.push({ slug: k4, name: pb2b.sites[k4].name, app: !!pb2b.sites[k4].app, files: Object.keys(pb2b.sites[k4].files || {}), url: spBase(env) + '/s/' + uid + '/' + k4 + '/' });
    return { ok: true, pages: outP, sites: outS };
  }
  if (name === 'page_delete' || name === 'app_delete') {
    var slugD = spSlugOf(args.slug, '');
    if (!slugD) return { ok: false, error: 'نام (slug) لازم است' };
    var done = false;
    if (name === 'page_delete') {
      var pb3 = await spPageBox(store, uid);
      if ((pb3.pages || {})[slugD]) { delete pb3.pages[slugD]; await store.put('sp:dyn:' + uid, pb3, 400 * 86400); done = true; }
    }
    var sb3 = await spSiteBox(store, uid);
    if ((sb3.sites || {})[slugD]) { delete sb3.sites[slugD]; await store.put('sp:web:' + uid, sb3, 400 * 86400); done = true; }
    return { ok: done, slug: slugD };
  }
  if (name === 'site_add_file') {
    var slug5 = spSlugOf(args.slug || args.site, 'site');
    var path = String(args.path || 'index.html').replace(/^\/+/, '').replace(/\.{2,}/g, '.').slice(0, 120);
    if (!path) return { ok: false, error: 'مسیر فایل لازم است' };
    var content = String(args.content || '');
    if (!content) return { ok: false, error: 'محتوای فایل خالی است' };
    if (content.length > 300000) return { ok: false, error: 'فایل بزرگ‌تر از حد (۳۰۰ کیلوبایت)' };
    var sb4 = await spSiteBox(store, uid);
    var st4 = (sb4.sites || {})[slug5] || { name: String(args.name || slug5).slice(0, 80), files: {}, at: Date.now() };
    st4.files = st4.files || {};
    if (Object.keys(st4.files).length >= 20 && !st4.files[path]) return { ok: false, error: 'هر پروژه حداکثر ۲۰ فایل' };
    st4.files[path] = { c: content, t: Date.now() };
    st4.at = Date.now();
    (sb4.sites || {})[slug5] = st4;
    await store.put('sp:web:' + uid, sb4, 400 * 86400);
    await spTouchUid(store, uid);
    var u5 = spBase(env) + '/s/' + uid + '/' + slug5 + '/' + path;
    return { ok: true, url: u5, site: slug5, path: path, bytes: content.length, live: '/s/' + uid + '/' + slug5 + '/' + (path === 'index.html' ? '' : path) };
  }
  if (name === 'site_create') {
    var slug6 = spSlugOf(args.slug || args.name, 'site');
    var sb6 = await spSiteBox(store, uid);
    var st6 = { name: String(args.name || args.slug || 'پروژه').slice(0, 80), goal: String(args.goal || args.prompt || '').slice(0, 600), files: {}, at: Date.now() };
    var seed = null;
    if (st6.goal && (await spAiOk(env))) { try { seed = spCleanHtml(await spGen(env, 'page', { prompt: st6.goal, title: st6.name })); } catch (e) { seed = null; } }
    if (!seed) seed = spWrapDoc(st6.name, '<div class="card"><h2>' + spEscHtml(st6.name) + '</h2><p>' + spEscHtml(st6.goal || 'پروژهٔ تازه') + '</p></div>');
    st6.files['index.html'] = { c: seed, t: Date.now() };
    (sb6.sites || {})[slug6] = st6;
    await store.put('sp:web:' + uid, sb6, 400 * 86400);
    await spTouchUid(store, uid);
    var u6 = spBase(env) + '/s/' + uid + '/' + slug6 + '/';
    return { ok: true, url: u6, slug: slug6, note: 'پروژه ساخته شد' + (seed ? ' با صفحهٔ اولیه' : '') };
  }

  /* ═══ کد ═══ */
  if (name === 'make_code') {
    if (!(await spAiOk(env))) return { ok: false, error: 'مغز هوش مصنوعی در دسترس نیست' };
    var nm = String(args.name || 'code.js').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60) || 'code.js';
    var code = String(await spGen(env, 'code', { prompt: args.prompt || args.goal || '', name: nm })).slice(0, 120000);
    var fenceC = code.match(/```([a-zA-Z0-9+]*)\s*([\s\S]*?)```/);
    if (fenceC) code = fenceC[2];
    var cb = await store.get('sp:code:' + uid, { items: [] });
    cb.items = (cb.items || []).filter(function (x) { return x.name !== nm; }).concat([{ name: nm, code: code, at: Date.now() }]).slice(-30);
    await store.put('sp:code:' + uid, cb, 400 * 86400);
    await spTouchUid(store, uid);
    try {
      var bytes3 = new TextEncoder().encode(code);
      var fd = new FormData();
      fd.append('chat_id', String(ctx.chatId || uid));
      fd.append('document', new Blob([bytes3], { type: 'text/plain' }), nm);
      fd.append('caption', '📄 فایل ' + nm + '\n' + spBase(env) + '/w/' + uid + '/' + nm);
      await cmdTg(env, 'sendDocument', fd);
    } catch (e) { /* فایل نرسید، مهم نیست */ }
    return { ok: true, name: nm, url: spBase(env) + '/w/' + uid + '/' + nm, bytes: code.length, preview: code.slice(0, 1500) };
  }
  if (name === 'code_list') {
    var cb2 = await store.get('sp:code:' + uid, { items: [] });
    return { ok: true, count: (cb2.items || []).length, items: (cb2.items || []).map(function (x) { return { name: x.name, bytes: (x.code || '').length, at: x.at, url: spBase(env) + '/w/' + uid + '/' + x.name }; }) };
  }
  if (name === 'code_get') {
    var cb3 = await store.get('sp:code:' + uid, { items: [] });
    var want = String(args.name || '').toLowerCase().slice(0, 60);
    var hit3 = (cb3.items || []).filter(function (x) { return x.name === want; })[0];
    if (!hit3) return { ok: false, error: 'فایلی با این نام نیست' };
    return { ok: true, name: hit3.name, url: spBase(env) + '/w/' + uid + '/' + hit3.name, code: String(hit3.code).slice(0, 12000) };
  }

  /* ═══ عیب‌یابی ═══ */
  if (name === 'state_get') {
    var kk = String(args.key || '').trim();
    if (!/^(sp|cmd|auto|land):/.test(kk)) return { ok: false, error: 'فقط کلیدهای sp: / cmd: / auto: / land:' };
    var raw = await store.get(kk, null);
    var txt = raw === null ? '(خالی)' : (typeof raw === 'string' ? raw : JSON.stringify(raw));
    return { ok: raw !== null, key: kk, bytes: txt.length, value: txt.slice(0, Number(args.limit || 3000)) };
  }
  if (name === 'state_keys') {
    var pref = String(args.prefix || 'sp:');
    var list = await store.list ? await store.list(pref, 50).catch(function () { return { keys: [] }; }) : { keys: [] };
    return { ok: true, prefix: pref, keys: (list.keys || []).map(function (x) { return x.name; }) };
  }

  /* ═══ ابزار HTTP سفارشی ═══ */
  if (name === 'api_tool_add') {
    var an = String(args.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
    if (an.length < 2) return { ok: false, error: 'نام ابزار لازم است (حروف انگلیسی و _)' };
    if (!/^https:\/\//i.test(String(args.url || ''))) return { ok: false, error: 'آدرس باید https باشد' };
    var ab = await store.get('sp:api:' + uid, { items: [] });
    var def = { name: an, url: String(args.url).slice(0, 400), method: String(args.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET', headers: String(args.headers || '').slice(0, 600), body: String(args.body || '').slice(0, 1500), desc: String(args.desc || '').slice(0, 200), at: Date.now() };
    ab.items = (ab.items || []).filter(function (x) { return x.name !== an; }).concat([def]).slice(-30);
    await store.put('sp:api:' + uid, ab, 400 * 86400);
    await spTouchUid(store, uid);
    return { ok: true, tool: 'api_' + an, call_as: 'api_' + an, note: 'همین حالا در فهرست ابزارهای جمنای/کلاد ظاهر می‌شود (یک بار برنامه را باز/ذخیره کن). در چت هم با api_' + an + ' صدا زده می‌شود.' };
  }
  if (name === 'api_tool_list') {
    var ab2 = await store.get('sp:api:' + uid, { items: [] });
    return { ok: true, count: (ab2.items || []).length, items: (ab2.items || []).map(function (x) { return { call_as: 'api_' + x.name, method: x.method, url: x.url, desc: x.desc }; }) };
  }
  if (name === 'api_tool_remove') {
    var ab3 = await store.get('sp:api:' + uid, { items: [] });
    var an3 = String(args.name || '').toLowerCase().replace(/^api_/, '');
    var b6 = (ab3.items || []).length;
    ab3.items = (ab3.items || []).filter(function (x) { return x.name !== an3; });
    await store.put('sp:api:' + uid, ab3, 400 * 86400);
    return { ok: b6 !== ab3.items.length, removed: b6 - ab3.items.length };
  }
  if (name === 'api_tool_call' || name.indexOf('api_') === 0) {
    var callName = name === 'api_tool_call' ? String(args.name || '').toLowerCase().replace(/^api_/, '') : name.slice(4);
    var ab4 = await store.get('sp:api:' + uid, { items: [] });
    var def4 = (ab4.items || []).filter(function (x) { return x.name === callName; })[0];
    if (!def4) return { ok: false, error: 'ابزار «' + callName + '» تعریف نشده (اول api_tool_add)' };
    var pas = args || {};
    if (name === 'api_tool_call' && args.args && typeof args.args === 'object') pas = args.args;
    try { return await spApiToolCall(env, uid, def4, pas); }
    catch (e) { return { ok: false, error: 'درخواست ناموفق: ' + String(e && e.message || e).slice(0, 160) }; }
  }

  return null;
}
function spAskPage(name, slug) {
  return spWrapDoc(name, '<div class="card"><h2>' + spEscHtml(name) + '</h2><p>هر چه می‌خواهی بپرس؛ همین‌جا جواب می‌گیری.</p><textarea id="q" rows="3" placeholder="سؤالت..."></textarea><button id="b">بپرس</button><div id="a" class="card" style="white-space:pre-wrap"></div></div>',
    'body{font-family:Tahoma,sans-serif;background:#0f1115;color:#e8eaf0;margin:0;padding:20px;line-height:1.9}textarea{width:100%;box-sizing:border-box;background:#0b0d11;color:#e8eaf0;border:1px solid #2a2f3a;border-radius:10px;padding:10px}button{margin-top:10px;background:#2563eb;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-size:15px}.card{background:#171a21;border:1px solid #242833;border-radius:14px;padding:16px;margin:10px 0}')
    + '<script>var q=document.getElementById("q"),a=document.getElementById("a"),b=document.getElementById("b");function go(){var v=q.value.trim();if(!v)return;a.textContent="⏳ در حال فکر کردن...";b.disabled=true;fetch("./api",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({q:v})}).then(function(r){return r.json()}).then(function(d){a.textContent=d.ok?d.answer:("خطا: "+(d.error||""))}).catch(function(e){a.textContent="خطای شبکه: "+e.message}).then(function(){b.disabled=false})}b.onclick=go;q.addEventListener("keydown",function(e){if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))go()});</script>';
}
