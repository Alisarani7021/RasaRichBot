#!/usr/bin/env node
/* b44 — «قدرت‌های نامحدود»: گیت‌هاب + میزبانی HTML + کد + ابزارهای HTTP سفارشی
   زنجیره: v25 → commander → mcp → superpowers → refinements
   Usage: node patch_refinements.mjs <bundle.mjs>                                  */
import fs from 'node:fs';

const target = process.argv[2] || 'cf/sim/bundle_v28.mjs';
let src = fs.readFileSync(target, 'utf8');
const snip = fs.readFileSync(new URL('./snippets/superpowers2.js', import.meta.url), 'utf8');

const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('spTool2') === 0, 'already patched');
must(count('spTick') >= 2, 'superpowers اول لازم است');
must(count('mcpToolDefs') >= 1, 'دریچهٔ MCP لازم است');

/* ۱) موتور قدرت‌های نامحدود */
const ENG = '\nasync function applyLiveTick(env, job) {';
must(count(ENG) === 1, 'applyLiveTick anchor');
src = src.replace(ENG, '\n' + snip.trimEnd() + '\n' + ENG);

/* ۲) قلاب ابزارها در spTool */
const A2 = '  var chan = ctx.channel || await spChannel(env, uid);';
must(count(A2) === 1, 'spTool anchor');
src = src.replace(A2, A2 + '\n  { var spR2 = await spTool2(env, uid, name, args, ctx, store, tg, chan); if (spR2 !== null) return spR2; }');

/* ۳) ابزارهای پویا در فهرست MCP */
const A3 = 'if (method === \'tools/list\') { out.push(mcpOk(id, { tools: mcpToolDefs() })); continue; }';
must(count(A3) === 1, 'tools/list anchor');
src = src.replace(A3, 'if (method === \'tools/list\') { var tdList = mcpToolDefs(); try { tdList = tdList.concat(await spExtraTools(env)); } catch (e) {} out.push(mcpOk(id, { tools: tdList })); continue; }');

/* ۴) پذیرش ابزارهای پویا در tools/call */
const A4 = 'var known = mcpToolDefs().map(function (t) { return t.name; });';
must(count(A4) === 1, 'tools/call anchor');
src = src.replace(A4, 'var known = mcpToolDefs().map(function (t) { return t.name; }); try { var dynDefs = await spExtraTools(env); for (var di = 0; di < dynDefs.length; di += 1) known.push(dynDefs[di].name); } catch (e) {}');

/* ۵) توضیح ابزارها برای مغز چت */
const A5 = "    '• welcome_set {text, chat, off} — پیام خوش‌آمد عضو جدید ({name}).',";
must(count(A5) === 1, 'prompt anchor');
src = src.replace(A5, A5 + `
    '• github_watch {repo, kind:commits|releases|tags|issues|stars, every_minutes, post, translate} · github_check {repo} · issue_watch {url} — رصد گیت‌هاب.',
    '• make_page {title, prompt, agent} · make_app {name, goal} · site_add_file {slug, path, content} — ساخت HTML و میزبانی زنده.',
    '• make_code {name, prompt} — نوشتن کد. · api_tool_add — تبدیل هر API به ابزار تازه.',`);

/* ۶) مسیر میزبانی /p و /w */
const A6 = '    const origin = url.origin;';
must(count(A6) === 1, 'origin anchor');
src = src.replace(A6, '    if (url.pathname === "/s" || url.pathname.startsWith("/s/") || url.pathname.startsWith("/w/")) {\n      try { const spWeb = await spWebServe(env, request, url); if (spWeb) return spWeb; } catch (e) { return new Response("web error: " + String(e && e.message || e), { status: 500 }); }\n    }\n' + A6);

/* ۷) تیک‌های ب43/ب44 — یک‌بار، و قبل از موتور روزانهٔ قدیمی */
const A7a = 'await runAutoPosts(env).catch((e) => console.warn("auto posts", e && e.message));';
const A7b = 'try { await spTick(env); } catch (e) { console.warn("sp tick", e && e.message); }';
must(count(A7a) === 1 && count(A7b) === 1, 'tick anchors');
src = src.replace(A7a + '\n      ' + A7b, A7b + '\n      try { await spTick2(env); } catch (e) { console.warn("sp tick2", e && e.message); }\n      ' + A7a);

/* ۸) تعریف ابزارهای تازه در MCP */
const A8 = "required: ['text'] } }\n  ];";
must(count(A8) === 1, 'mcp defs anchor');
const DEFS = [
  { n: 'github_watch', d: 'رصد یک ریپوی گیت‌هاب: هر وقت چیز تازه‌ای منتشر شد (کامیت، ریلیز، تگ، ایشو یا تعداد ستاره) خودکار خبر می‌دهد و در صورت post=true در کانال منتشر می‌کند. kind: commits|releases|tags|issues|stars (پیش‌فرض commits) — translate=true تیتر انگلیسی را فارسی می‌کند.', p: { repo: { type: 'string' }, kind: { type: 'string' }, every_minutes: { type: 'number' }, post: { type: 'boolean' }, translate: { type: 'boolean' }, branch: { type: 'string' }, template: { type: 'string' } }, r: ['repo'] },
  { n: 'github_check', d: 'همین حالا آخرین موارد یک ریپو را بگیر (بدون انتظار): commits/releases/tags/issues/stars.', p: { repo: { type: 'string' }, kind: { type: 'string' }, branch: { type: 'string' } }, r: ['repo'] },
  { n: 'github_list', d: 'فهرست رصدهای گیت‌هاب با وضعیت آخرین بررسی.', p: {}, r: [] },
  { n: 'github_remove', d: 'حذف یک رصد گیت‌هاب با id یا نام ریپو.', p: { id: { type: 'string' } }, r: ['id'] },
  { n: 'issue_watch', d: 'رصد یک ایشو/PR مشخص: کامنت تازه، بسته/باز شدن، تغییر عنوان یا برچسب را خبر می‌دهد.', p: { url: { type: 'string' }, every_minutes: { type: 'number' }, post: { type: 'boolean' } }, r: ['url'] },
  { n: 'issue_list', d: 'فهرست ایشوهای رصدشده.', p: {}, r: [] },
  { n: 'issue_remove', d: 'حذف رصد ایشو.', p: { id: { type: 'string' } }, r: ['id'] },
  { n: 'make_page', d: 'ساخت یک صفحهٔ HTML فارسی و میزبانی زندهٔ آن روی دامنهٔ خودمان (لینک برمی‌گرداند). با agent=true به‌جای صفحهٔ ثابت، صفحهٔ پرسش‌وپاسخ هوشمند می‌سازد.', p: { title: { type: 'string' }, prompt: { type: 'string' }, slug: { type: 'string' }, agent: { type: 'boolean' } }, r: ['prompt'] },
  { n: 'make_app', d: 'ساخت اپ وب هوشمند تک‌فایلی: صفحه + نقطهٔ پایانی ./api که سرِ درخواست از مغز پاسخ می‌گیرد (مثل ماشین‌حساب هوشمند، دستیار، داشبورد پرسشی).', p: { name: { type: 'string' }, goal: { type: 'string' }, slug: { type: 'string' } }, r: ['goal'] },
  { n: 'page_list', d: 'فهرست صفحه‌ها، اپ‌ها و پروژه‌های میزبانی‌شده با لینک.', p: {}, r: [] },
  { n: 'page_delete', d: 'حذف یک صفحه یا اپ با slug.', p: { slug: { type: 'string' } }, r: ['slug'] },
  { n: 'app_delete', d: 'حذف یک اپ/پروژه با slug.', p: { slug: { type: 'string' } }, r: ['slug'] },
  { n: 'site_create', d: 'ساخت پروژهٔ چندصفحه‌ای (سایت) با صفحهٔ اولیهٔ تولیدشده؛ بعد با site_add_file فایل اضافه کن.', p: { name: { type: 'string' }, goal: { type: 'string' }, slug: { type: 'string' } }, r: ['name'] },
  { n: 'site_add_file', d: 'افزودن/جایگزینی دقیق یک فایل در پروژه (index.html، style.css، script.js، عکس SVG و…). محتوا را خودت می‌نویسی و همان لحظه زنده می‌شود.', p: { slug: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' } }, r: ['slug', 'path', 'content'] },
  { n: 'make_code', d: 'نوشتن کد برای هر کاری (پایتون، جاوااسکریپت، اسکریپت، هوک…) و تحویل فایل به پیوی مالک + لینک زنده.', p: { name: { type: 'string' }, prompt: { type: 'string' } }, r: ['prompt'] },
  { n: 'code_list', d: 'فهرست فایل‌های کد ساخته‌شده با لینک.', p: {}, r: [] },
  { n: 'code_get', d: 'گرفتن متن یک فایل کد ساخته‌شده.', p: { name: { type: 'string' } }, r: ['name'] },
  { n: 'api_tool_add', d: 'قدرت نامحدود: هر وب‌سرویس https را به ابزار تازهٔ همان لحظه تبدیل کن. بعد از ثبت، با نام api_<name> صدا زده می‌شود و در فهرست ابزارهای جمنای/کلاد هم می‌آید. در url و body از {پارامتر} استفاده کن.', p: { name: { type: 'string' }, url: { type: 'string' }, method: { type: 'string' }, headers: { type: 'string' }, body: { type: 'string' }, desc: { type: 'string' } }, r: ['name', 'url'] },
  { n: 'api_tool_list', d: 'فهرست ابزارهای HTTP سفارشی.', p: {}, r: [] },
  { n: 'api_tool_remove', d: 'حذف ابزار HTTP سفارشی.', p: { name: { type: 'string' } }, r: ['name'] },
  { n: 'api_tool_call', d: 'صدا زدن ابزار HTTP سفارشی با پارامترها (args).', p: { name: { type: 'string' }, args: { type: 'object' } }, r: ['name'] },
  { n: 'state_get', d: 'خواندن وضعیت داخلی ربات (عیب‌یابی): مقدار یک کلید مثل sp:gh:5982315292 یا sp:tick2.', p: { key: { type: 'string' }, limit: { type: 'number' } }, r: ['key'] }
];
const NEW = DEFS.map(function (x) {
  return "    { name: '" + x.n + "', description: '" + x.d.replace(/'/g, "\\'") + "',\n      inputSchema: { type: 'object', properties: " + JSON.stringify(x.p) + ", required: [" + x.r.map(function (q) { return "'" + q + "'"; }).join(', ') + "] } }";
}).join(',\n');
src = src.replace(A8, "required: ['text'] } },\n" + NEW + "\n  ];");

fs.writeFileSync(target, src);
console.log('✅ patched: ' + target + ' (+' + NEW.length + ' chars of tool defs, refinements)');
