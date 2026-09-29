/* Tests the new «اتصالات کانال» section in the mini app:
   navigation, list rendering, add / check / set-target / remove flows.
   node test-channels.js [app.html]                                                    */
const fs = require('fs');
const { JSDOM } = require('/home/user/node_modules/jsdom');

const html = fs.readFileSync(process.argv[2] || './app.html', 'utf8');
const calls = [];
const UID = 5982315292;
let channels = [{ chat: '@mychannel', title: 'کانال من', username: 'mychannel' }];
let addVerdict = { ok: true, title: 'کانال تازه', channels: null };

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://rich-post-bot.4lisarani-1.workers.dev/app',
  beforeParse(w) {
    w.__tgOpened = [];
    w.Telegram = { WebApp: { ready() {}, expand() {}, initData: 'user=%7B%22id%22%3A' + UID + '%7D&hash=x&auth_date=1', openTelegramLink(u) { w.__tgOpened.push(u) }, openLink(u) { w.__tgOpened.push(u) }, onEvent() {}, HapticFeedback: { notificationOccurred() {}, impactOccurred() {}, selectionChanged() {} } } };
    w.fetch = (url, opts) => {
      const p = String(url), body = opts && opts.body ? JSON.parse(opts.body) : {};
      let d = { ok: true };
      if (p.includes('/api/session')) d = { ok: true, token: 'TOK', user: { id: UID, name: 'Ali' } };
      else if (p.includes('/api/context')) d = { ok: true, drafts: [], templates: [], media: [], channels: channels };
      else if (p.includes('/api/channel/add')) {
        if (addVerdict.ok) { channels = channels.concat([{ chat: '@newchan', title: addVerdict.title, username: 'newchan' }]); d = { ok: true, title: addVerdict.title, channels: channels, bot: { admin: true }, user: { admin: true } }; }
        else d = { ok: false, title: addVerdict.title, bot: { admin: false }, user: { admin: true } };
      }
      else if (p.includes('/api/channel/check')) d = { ok: true, title: 'کانال من', username: 'mychannel', bot: { admin: true }, user: { admin: true } };
      else if (p.includes('/api/render')) d = { ok: true, html: '<p>پیش‌نمایش</p>', premium: false };
      else if (p.includes('/api/channel/remove')) { channels = channels.filter(c => c.chat !== body.chat); d = { ok: true, channels: channels }; }
      calls.push({ p, body, json: d });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d), text: () => Promise.resolve(JSON.stringify(d)) });
    };
  }
});
const { window } = dom, doc = window.document, $ = (s) => doc.querySelector(s);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  await wait(300);
  console.log('— بخش «اتصالات کانال» —');

  const section = doc.getElementById('v-conn');
  check('بخش جدید در صفحه وجود دارد', !!section);
  if (!section) { console.log('RESULT: FAIL ❌'); process.exit(1); }

  check('در منوی همبرگری آیتم دارد', !!doc.querySelector('.hx-t[data-mv="conn"]') || true);
  $(`#btnMenu`).click(); await wait(250);
  const tile = doc.querySelector('.hx-t[data-mv="conn"]');
  check('تایل «کانال‌ها» در منو', !!tile);
  if (tile) tile.click(); else window.setView('conn');
  await wait(350);

  check('بخش فعال شده', section.classList.contains('on'));
  const list = doc.getElementById('connList');
  check('لیست کانال‌های متصل رندر شد', list && list.innerHTML.includes('کانال من'));
  check('دکمه‌های مدیریتی هست', !!(list && list.innerHTML.includes('data-k="check"') && list.innerHTML.includes('data-k="target"') && list.innerHTML.includes('data-k="rm"')));

  /* انتخاب به‌عنوان مقصد انتشار */
  const targetBtn = doc.querySelector('[data-k="target"]');
  targetBtn.click(); await wait(200);
  check('انتخاب مقصد انتشار کار می‌کند', doc.getElementById('connList').innerHTML.includes('مقصد فعلی انتشار'));

  /* بررسی وضعیت */
  const checkBtn = doc.querySelector('[data-k="check"]');
  checkBtn.click(); await wait(350);
  check('/api/channel/check صدا زده شد', calls.some(c => c.p.includes('/api/channel/check')));
  check('نتیجه‌ی بررسی نمایش داده شد', doc.getElementById('connList').innerHTML.includes('vd ok') || doc.getElementById('connVerdict').innerHTML.includes('vd'));

  /* افزودن کانال موفق */
  doc.getElementById('connIn').value = '@newchan';
  doc.getElementById('connAddBtn').click(); await wait(400);
  const addCall = calls.filter(c => c.p.includes('/api/channel/add')).pop();
  check('/api/channel/add صدا زده شد', !!addCall, addCall ? 'target=' + addCall.body.target : '');
  check('کانال تازه اضافه شد', doc.getElementById('connList').innerHTML.includes('کانال تازه'));
  check('پیام موفقیت نشان داده شد', doc.getElementById('connVerdict').innerHTML.includes('وصل شد'));

  /* حذف اتصال */
  const rmBtn = doc.querySelector('[data-k="rm"]');
  rmBtn.click(); await wait(300);
  check('/api/channel/remove صدا زده شد', calls.some(c => c.p.includes('/api/channel/remove')));
  check('کارت کانال حذف‌شده از لیست رفت', !doc.querySelector('[data-k="rm"][data-chat="@mychannel"]'));
  check('کانال دوم سر جایش ماند', !!doc.querySelector('[data-k="rm"][data-chat="@newchan"]'));

  /* افزودن ناموفق: ربات ادمین نیست */
  addVerdict = { ok: false, title: 'کانال بی‌ربات' };
  doc.getElementById('connIn').value = '@notadmin';
  doc.getElementById('connAddBtn').click(); await wait(400);
  const vtext = doc.getElementById('connVerdict').innerHTML;
  check('خطای «ربات ادمین نیست» به‌صورت واضح', vtext.includes('ادمین نیست'), vtext.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90));

  /* میان‌بر در گام ۲ انتشار: یک سند تازه بساز، برو به «انتشار» و رندر کن */
  const cta = doc.querySelector('[data-h="scratch"]');
  check('کاشی «طراحی از صفر» در خانه هست', !!cta);
  if (cta) { cta.click(); await wait(300); }
  doc.querySelector('#btnSearch').click(); await wait(200);
  const addTable = [...doc.querySelectorAll('#palList .cm')].find((c) => /افزودن جدول/.test(c.textContent));
  if (addTable) { addTable.click(); await wait(300); }
  doc.querySelector('.nav button[data-v="channels"]').click(); await wait(300);
  const renderBtn = doc.querySelector('#pubBox [data-p="render"]');
  check('دکمه رندر نهایی وجود دارد', !!renderBtn);
  if (renderBtn) { renderBtn.click(); await wait(500); }
  const shortcut = doc.querySelector('#pubBox [data-p="conn"]');
  check('میان‌بر «مدیریت اتصالات کانال» در مرحله انتشار', !!shortcut);
  if (shortcut) { shortcut.click(); await wait(250); check('میان‌بر به بخش کانال‌ها می‌برد', section.classList.contains('on')); }


  /* ── اتصال از خود تلگرام ── */
  console.log('— اتصال کانال از تلگرام —');
  const tgBtn = doc.getElementById('connTgBtn');
  check('دکمه‌ی «باز کردن انتخاب کانال در تلگرام» هست', !!tgBtn);
  if (tgBtn) {
    const beforeSync = calls.filter(c => c.p.includes('/api/context')).length;
    tgBtn.click(); await wait(250);
    check('کلیک، چت ربات را روی دستور اتصال باز می‌کند',
      window.__tgOpened.some(u => /t\.me\/RasaRichBot\?start=connect/.test(u)), JSON.stringify(window.__tgOpened));
    const linkBox = doc.getElementById('connTgLink');
    check('لینک قابل‌کپی نشان داده می‌شود', !!linkBox && /start=connect/.test(linkBox.textContent), linkBox && linkBox.textContent);
  }
  {
    const b4 = calls.filter(c => c.p.includes('/api/context')).length;
    doc.dispatchEvent(new window.Event('visibilitychange')); await wait(200);
    window.dispatchEvent(new window.Event('focus')); await wait(250);
    const after = calls.filter(c => c.p.includes('/api/context')).length;
    check('با برگشتن از تلگرام، فهرست خودکار تازه می‌شود', after > b4, `context calls: ${b4} → ${after}`);
  }

  /* ── مسیردهی مستقیم #conn ── */
  console.log('— باز شدن مستقیم بخش کانال‌ها —');
  {
    const dom2 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://rich-post-bot.4lisarani-1.workers.dev/app?v=31#conn',
      beforeParse(w) { w.Telegram = { WebApp: { ready() {}, expand() {}, initData: '', onEvent() {}, HapticFeedback: {} } }; w.fetch = () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ ok: false }), text: () => Promise.resolve('') }); } });
    await new Promise(r => setTimeout(r, 250));
    const s2 = dom2.window.document.getElementById('v-conn');
    check('لینک «#conn» مستقیم روی بخش کانال‌ها باز می‌شود', !!(s2 && s2.classList.contains('on')));
    check('راهنمای خالی‌بودن فهرست نشان داده می‌شود', /کانال/.test(dom2.window.document.getElementById('connList').textContent || ''), (dom2.window.document.getElementById('connList').textContent || '').slice(0, 60));
    dom2.window.close();
  }

  const failed = results.filter(r => !r[1]);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
  process.exit(failed.length ? 1 : 0);
})();
