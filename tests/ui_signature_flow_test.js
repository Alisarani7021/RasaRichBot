/* جریان «حذف امضا» در مینی‌اپ: تیک زدن در گام ۱ باید تا لحظهٔ انتشار زنده بماند.
   The publish wizard re-renders its own DOM on every step, so the checkbox the
   user ticks on step 1 no longer exists when /api/publish is called on step 3.
   This test drives the real flow and asserts what actually leaves the client.
   node test_sig_flow.js app.html                                                       */
const fs = require('fs');
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch { JSDOM = require('/home/user/tools/jsdom-loader.js').loadJsdom(); }

const html = fs.readFileSync(process.argv[2] || 'app.html', 'utf8');
const UID = 8795596928;
const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(credits) {
  const calls = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://rich-post-bot.4lisarani-1.workers.dev/app',
    beforeParse(w) {
      w.Telegram = { WebApp: { ready() {}, expand() {}, mainButton: { hide() {}, show() {} }, initData: 'user=%7B%22id%22%3A' + UID + '%7D&hash=x&auth_date=1', openLink() {}, openTelegramLink() {}, onEvent() {}, HapticFeedback: { notificationOccurred() {}, impactOccurred() {}, selectionChanged() {} } } };
      w.fetch = (url, opts) => {
        const p = String(url);
        let body = {};
        try { body = opts && opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch {}
        let d = { ok: true };
        if (p.includes('/api/session')) d = { ok: true, token: 'TOK', user: { id: UID, name: 'Ali' } };
        else if (p.includes('/api/context')) d = { ok: true, drafts: [], templates: [], media: [], channels: [{ chat: '@mychannel', title: 'کانال من', username: 'mychannel' }] };
        else if (p.includes('/api/invite/status')) d = { ok: true, credits, total: credits, used: 0, sigKept: 0, invited: [], forwards: [] };
        else if (p.includes('/api/render')) d = { ok: true, html: '<p>' + String(body.text || 'سلام') + '</p>', plain: String(body.text || 'سلام'), premium: false };
        else if (p.includes('/api/publish')) d = { ok: true, link: 'https://t.me/mychannel/900', message_id: 900, notices: [] };
        else if (p.includes('/api/brand/list')) d = { ok: true, brands: [] };
        else if (p.includes('/api/emoji/all')) d = { ok: true, packs: [], total: 0 };
        calls.push({ p, body });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d), text: () => Promise.resolve(JSON.stringify(d)) });
      };
    }
  });
  return { dom, calls, window: dom.window, doc: dom.window.document };
}

async function reachStep3(ctx) {
  const { window, doc } = ctx;
  const $ = (s) => doc.querySelector(s);
  await wait(450);
  doc.querySelector('[data-v="build"]').click();
  await wait(300);
  const ta = doc.querySelector('.blk textarea[data-f="t"]');
  ta.value = 'سلام';
  ta.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(120);
  doc.querySelector('[data-v="channels"]').click();
  await wait(400);
  return { $, window, doc };
}

(async () => {
  console.log('— جریان حذف امضا در مینی‌اپ —');

  /* ۱) کاربر تیک می‌زند: خروجی انتشار باید بدون امضا باشد */
  {
    const ctx = boot(1);
    const { $, window, doc } = await reachStep3(ctx);
    const tog = $('#sigToggle');
    check('گام ۱ چک‌باکس «بدون امضای رِسا» دارد', !!tog);
    if (tog) {
      check('با اعتبار، چک‌باکس روشن‌شدنی است', !tog.disabled);
      tog.checked = true;
      tog.dispatchEvent(new window.Event('change', { bubbles: true }));
      await wait(50);
    }
    doc.querySelector('[data-p="render"]').click();
    await wait(500);
    const pick = doc.querySelector('[data-p="pick"]');
    check('گام ۲ کانال را نشان می‌دهد', !!pick);
    if (pick) pick.click();
    await wait(80);
    doc.querySelector('[data-p="s3"]').click();
    await wait(200);
    const go = doc.querySelector('[data-p="go"]');
    check('گام ۳ دکمهٔ انتشار دارد', !!go);
    if (go) { go.click(); await wait(600); }
    const pub = ctx.calls.filter((c) => c.p.includes('/api/publish')).pop();
    check('درخواست انتشار فرستاده شد', !!pub);
    check('انتشار انتخاب «بدون امضا» را می‌برد', pub && pub.body && pub.body.unsigned === true,
      pub ? 'unsigned=' + JSON.stringify(pub.body.unsigned) : '');
  }

  /* ۲) کاربر تیک نمی‌زند: باید با امضا برود */
  {
    const ctx = boot(1);
    const { $, window, doc } = await reachStep3(ctx);
    const tog = $('#sigToggle');
    check('پیش‌فرض چک‌باکس خاموش است', tog && tog.checked === false);
    doc.querySelector('[data-p="render"]').click();
    await wait(500);
    doc.querySelector('[data-p="pick"]').click();
    await wait(80);
    doc.querySelector('[data-p="s3"]').click();
    await wait(200);
    doc.querySelector('[data-p="go"]').click();
    await wait(600);
    const pub = ctx.calls.filter((c) => c.p.includes('/api/publish')).pop();
    check('بدون انتخاب کاربر، پست با امضا می‌رود', pub && pub.body && pub.body.unsigned === false,
      pub ? 'unsigned=' + JSON.stringify(pub.body.unsigned) : '');
  }

  /* ۳) گام ۳ هم باید انتخاب را نشان بدهد و قابل تغییر باشد */
  {
    const ctx = boot(1);
    const { $, window, doc } = await reachStep3(ctx);
    doc.querySelector('[data-p="render"]').click();
    await wait(500);
    doc.querySelector('[data-p="pick"]').click();
    await wait(80);
    doc.querySelector('[data-p="s3"]').click();
    await wait(200);
    const late = doc.querySelector('#sigToggle3');
    check('گام ۳ هم کلید «بدون امضا» دارد', !!late);
    if (late) {
      late.checked = true;
      late.dispatchEvent(new window.Event('change', { bubbles: true }));
      await wait(60);
    }
    doc.querySelector('[data-p="go"]').click();
    await wait(600);
    const pub = ctx.calls.filter((c) => c.p.includes('/api/publish')).pop();
    check('تیک زدن در گام ۳ هم اعمال می‌شود', pub && pub.body && pub.body.unsigned === true,
      pub ? 'unsigned=' + JSON.stringify(pub.body.unsigned) : '');
  }

  /* ۴) نشانگر نسخه باید عدد واقعی را نشان بدهد، نه متن خام */
  {
    const ctx = boot(1);
    await wait(500);
    const el = ctx.doc.querySelector('#appVer');
    check('نشانگر نسخهٔ مینیاپ عدد را نشان می‌دهد', !!el && /^\d/.test((el.textContent || '').trim()), el ? 'text=' + el.textContent : 'missing');
  }

  /* ۵) بدون اعتبار: کلید باید خاموش و قفل باشد */
  {
    const ctx = boot(0);
    const { $, doc } = await reachStep3(ctx);
    const tog = $('#sigToggle');
    check('بدون اعتبار، کلید قفل است', !!tog && tog.disabled === true && tog.checked === false);
  }

  const bad = results.filter((r) => !r[1]);
  console.log(`RESULT: ${bad.length ? 'FAIL ❌ ' + bad.length + '/' + results.length : 'PASS ✅ ' + results.length + '/' + results.length}`);
  process.exit(bad.length ? 1 : 0);
})();
