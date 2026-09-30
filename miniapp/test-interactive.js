/* Tests the «🧩 قالب‌های تعاملی» section of the mini app: the three template
   forms, the publish calls they make, and the list of what was published.
   node test_interactive.js app.html                                              */
const fs = require('fs');
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }                                   // repo: npm i jsdom
catch { JSDOM = require('/home/user/tools/jsdom-loader.js').loadJsdom(); } // sandbox helper

const html = fs.readFileSync(process.argv[2] || 'app.html', 'utf8');
const UID = 5982315292;
const calls = [];
const channels = [{ chat: '@mychannel', title: 'کانال من', username: 'mychannel' }];
let items = [];
let lastPublish = null, channelDenied = false;

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://rich-post-bot.4lisarani-1.workers.dev/app',
  beforeParse(w) {
    w.__opened = [];
    w.Telegram = { WebApp: { ready() {}, expand() {}, initData: 'user=%7B%22id%22%3A' + UID + '%7D&hash=x&auth_date=1', openLink(u) { w.__opened.push(u); }, openTelegramLink(u) { w.__opened.push(u); }, onEvent() {}, HapticFeedback: { notificationOccurred() {}, impactOccurred() {}, selectionChanged() {} } } };
    w.fetch = (url, opts) => {
      const p = String(url);
      let body = {};
      try { body = opts && opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch {}
      let d = { ok: true };
      if (p.includes('/api/session')) d = { ok: true, token: 'TOK', user: { id: UID, name: 'Ali' } };
      else if (p.includes('/api/context')) d = { ok: true, drafts: [], templates: [], media: [], channels: channels };
      else if (p.includes('/api/interactive/list')) d = { ok: true, items: items };
      else if (p.includes('/api/interactive/poll') && body.target && body.target !== 'me' && channelDenied) d = { ok: false, error: 'permissions', verdict: { ok: false, title: 'کانال من', bot: { admin: false }, user: { admin: true } } };
      else if (p.includes('/api/interactive/poll')) { lastPublish = { route: 'poll', body }; d = { ok: true, id: 'p1', kind: 'poll', message_id: 901, link: 'https://t.me/mychannel/901' }; items = [{ kind: 'poll', id: 'p1', title: body.title, at: Date.now(), votes: 0, link: d.link }].concat(items); }
      else if (p.includes('/api/interactive/levels')) { lastPublish = { route: 'levels', body }; d = { ok: true, id: 'd1', kind: 'levels', message_id: 902, link: null }; items = [{ kind: 'levels', id: 'd1', title: body.title, at: Date.now() }].concat(items); }
      else if (p.includes('/api/interactive/slideshow')) { lastPublish = { route: 'slideshow', body }; d = { ok: true, id: 's1', kind: 'slideshow', message_id: 903, link: null }; }
      else if (p.includes('/api/interactive/end')) d = { ok: true, id: body.id };
      else if (p.includes('/api/interactive/remove')) { items = items.filter((x) => x.id !== body.id); d = { ok: true }; }
      else if (p.includes('/api/media/upload')) d = { ok: true, media: { name: 'p.jpg', kind: 'photo', fileId: 'F' + (calls.length + 1) } };
      calls.push({ p, body, json: d });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d), text: () => Promise.resolve(JSON.stringify(d)) });
    };
  }
});
const { window } = dom, doc = window.document, $ = (s) => doc.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  await wait(350);
  console.log('— بخش «قالب‌های تعاملی» در مینی‌اپ —');

  const section = doc.getElementById('v-inter');
  check('بخش جدید در صفحه هست', !!section);
  if (!section) { console.log('RESULT: FAIL ❌'); process.exit(1); }
  check('سه قالب در بخش هست', !!($('#intLvBtn') && $('#intSlBtn') && $('#intPlBtn')));
  check('فیلدهای هر قالب سرجایشان‌اند', !!($('#intLvShort') && $('#intLvFull') && $('#intSlFiles') && $('#intPlTitle')));

  /* ورود از منوی همبرگری */
  $('#btnMenu').click(); await wait(250);
  const tile = doc.querySelector('.hx-t[data-mv="inter"]');
  check('در منو آیتم «قالب‌های تعاملی» دارد', !!tile);
  if (tile) tile.click(); else window.setView('inter');
  await wait(300);
  check('بخش فعال شد', section.classList.contains('on'));

  /* مقصد */
  const sel = $('#intTarget');
  check('فهرست مقصد از کانال‌های وصل‌شده پر می‌شود', sel && sel.innerHTML.includes('mychannel') && sel.innerHTML.includes('پیوی خودم'));
  check('انتخاب پیش‌فرض «پیوی خودم» است', sel.value === 'me');

  /* قالب ۱: پست چندحالته */
  $('#intLvTitle').value = 'عنوان تست';
  $('#intLvShort').value = 'خلاصه کوتاه';
  $('#intLvFull').value = '<b>کامل</b>';
  $('#intLvBtn').click(); await wait(250);
  check('انتشار پست چندحالته فراخوانی می‌شود', lastPublish && lastPublish.route === 'levels');
  check('متن‌ها درست فرستاده می‌شوند', lastPublish.body.levels.short === 'خلاصه کوتاه' && lastPublish.body.levels.full === '<b>کامل</b>');
  check('مقصد همراه درخواست می‌رود', lastPublish.body.target === 'me');
  check('پیام موفقیت نشان داده می‌شود', /منتشر شد/.test($('#intVerdict').innerHTML));

  /* قالب ۲: نظرسنجی */
  $('#intPlTitle').value = 'سؤال مهم';
  $('#intPlSub').value = 'توضیح';
  const optsBefore = $('#intPlOpts').querySelectorAll('input').length;
  $('#intPlAdd').click(); await wait(60);
  check('دکمهٔ «+ گزینه» گزینه اضافه می‌کند', $('#intPlOpts').querySelectorAll('input').length === optsBefore + 1);
  const inputs = $('#intPlOpts').querySelectorAll('input');
  inputs[0].value = 'گزینه الف'; inputs[1].value = 'گزینه ب';
  $('#intPlMin').value = '60';
  $('#intPlBtn').click(); await wait(250);
  check('انتشار نظرسنجی فراخوانی می‌شود', lastPublish && lastPublish.route === 'poll');
  check('گزینه‌ها و مهلت درست می‌روند', lastPublish.body.options.length === 2 && lastPublish.body.options[0] === 'گزینه الف' && lastPublish.body.minutes === 60);
  check('با کمتر از دو گزینه منتشر نمی‌شود', (() => {
    const before = lastPublish;
    const ins = $('#intPlOpts').querySelectorAll('input');
    for (const i of ins) i.value = '';
    $('#intPlBtn').click();
    return lastPublish === before;
  })());

  /* قالب ۳: اسلایدشو */
  check('آپلود عکس به سرور وصل است', typeof window.fetch === 'function');
  const fileInput = $('#intSlFiles');
  Object.defineProperty(fileInput, 'files', {
    value: [
      new window.File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' }),
      new window.File([new Uint8Array([4, 5, 6])], 'b.jpg', { type: 'image/jpeg' })
    ], configurable: true
  });
  fileInput.dispatchEvent(new window.Event('change'));
  await wait(300);
  const uploads = calls.filter((c) => c.p.includes('/api/media/upload'));
  check('برای هر عکس یک آپلود انجام می‌شود', uploads.length === 2, 'uploads=' + uploads.length);
  check('پس از آپلود وضعیت «آماده شد» نشان داده می‌شود', /آماده/.test($('#intSlThumbs').innerHTML), $('#intSlThumbs').innerHTML.slice(0, 60));
  $('#intSlCaption').value = 'کپشن تست';
  $('#intSlBtn').click(); await wait(250);
  check('انتشار اسلایدشو فراخوانی می‌شود', lastPublish && lastPublish.route === 'slideshow');
  check('fileId های آپلودشده فرستاده می‌شوند', (lastPublish.body.media || []).length === 2 && lastPublish.body.media[0].fileId);

  /* مقصد کانال: پیام خطای فارسی و روشن */
  channelDenied = true;
  sel.value = '@mychannel';
  $('#intPlTitle').value = 'برای کانال';
  const ins2 = $('#intPlOpts').querySelectorAll('input');
  ins2[0].value = 'یک'; ins2[1].value = 'دو';
  $('#intPlBtn').click(); await wait(250);
  check('مقصد کانال بدون دسترسی، خطای روشن فارسی می‌دهد', /ادمین نیست/.test($('#intVerdict').innerHTML), $('#intVerdict').innerHTML.slice(0, 90));
  check('در این حالت چیزی منتشر نمی‌شود', $('#intVerdict').innerHTML.includes('bad'));
  channelDenied = false;
  sel.value = 'me';

  /* فهرست منتشرشده‌ها */
  await wait(200);
  const list = $('#intList');
  check('فهرست منتشرشده‌ها رندر می‌شود', /نظرسنجی|چندحالته/.test(list.innerHTML), list.innerHTML.slice(0, 80));
  check('دکمهٔ «پایان رأی‌گیری» برای نظرسنجی هست', list.innerHTML.includes('data-it="end"'));
  check('دکمهٔ حذف برای همه هست', (list.innerHTML.match(/data-it="rm"/g) || []).length >= 2);
  $('#intRefresh').click(); await wait(150);
  check('تازه‌سازی فهرست درخواست می‌زند', calls.some((c) => c.p.includes('/api/interactive/list')));

  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
  process.exit(failed.length ? 1 : 0);
})();
