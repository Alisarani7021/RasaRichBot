/* Tests the premium-emoji picker after the namespace merge:
   the picker must show every pack the bot knows (not just the library half),
   let the user add a pack by link and remove one, and always show the totals.
   node test-emoji.js [app.html]                                                      */
const fs = require('fs');
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }                                  // repo: npm i jsdom
catch { JSDOM = require('/home/user/tools/jsdom-loader.js').loadJsdom(); } // sandbox helper

const html = fs.readFileSync(process.argv[2] || 'app.html', 'utf8');
const calls = [];
const UID = 5982315292;

/* two packs first, as the live bot had them, then a third arrives via the UI */
let packs = [
  { name: 'MemeSetEmoji', title: '☆ @emoji1 ★', count: 2, at: 3, items: [{ id: '111', e: '😂' }, { id: '112', e: '😍' }] },
  { name: 'PishiPack', title: 'پیشی', count: 2, at: 2, items: [{ id: '221', e: '😽' }, { id: '222', e: '😹' }] }
];
const stats = () => ({ total: packs.reduce((n, p) => n + p.items.length, 0), packCount: packs.length });

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://rich-post-bot.4lisarani-1.workers.dev/app',
  beforeParse(w) {
    w.Telegram = { WebApp: { ready() {}, expand() {}, initData: 'user=%7B%22id%22%3A' + UID + '%7D&hash=x&auth_date=1', onEvent() {}, HapticFeedback: { notificationOccurred() {}, impactOccurred() {}, selectionChanged() {} } } };
    w.fetch = (url, opts) => {
      const p = String(url), body = opts && opts.body ? JSON.parse(opts.body) : {};
      let d = { ok: true };
      if (p.includes('/api/session')) d = { ok: true, token: 'TOK', user: { id: UID, name: 'Ali' } };
      else if (p.includes('/api/context')) d = { ok: true, drafts: [], templates: [], media: [], channels: [] };
      else if (p.includes('/api/emoji/all')) d = { ok: true, packs: packs, ...stats() };
      else if (p.includes('/api/emoji/pack/add')) {
        const name = String(body.target || '').split('/').pop();
        if (/^addemoji|t\.me/.test(String(body.target)) || /^[A-Za-z0-9_]{4,}$/.test(name)) {
          packs = packs.concat([{ name, title: 'Party Pack', count: 2, at: 9, items: [{ id: '331', e: '🎉' }, { id: '332', e: '🎊' }] }]);
          d = { ok: true, name, title: 'Party Pack', count: 2, emojis: 2 };
        } else d = { ok: false, error: 'لینک معتبر نیست' };
      }
      else if (p.includes('/api/emoji/pack/remove')) { packs = packs.filter(x => x.name !== body.name); d = { ok: true, ...stats() }; }
      else if (p.includes('/api/render')) d = { ok: true, html: '<p>پیش‌نمایش</p>', premium: false };
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
  console.log('— انتخاب‌گر اموجی پرمیوم —');

  /* یک سند تازه بساز تا ویرایشگر فعال شود */
  const scratch = doc.querySelector('[data-h="scratch"]');
  if (scratch) { scratch.click(); await wait(300); }

  const fab = doc.getElementById('fab');
  check('دکمهٔ افزودن در ویرایشگر هست', !!fab);
  fab.click(); await wait(400);
  const sheet = doc.getElementById('sheet');
  check('شیت «افزودن» با بخش اموجی باز شد', !!sheet && !!sheet.querySelector('.emw'));

  const statsEl = sheet.querySelector('#emStats');
  check('شمارندهٔ اموجی و پک نمایش داده می‌شود', !!statsEl && /4 اموجی در 2 پک/.test(statsEl.textContent), statsEl && statsEl.textContent);
  if (!statsEl) { console.log('\nRESULT: FAIL ❌ (نسخهٔ قدیمی — بدون مدیریت پک)'); process.exit(1); }
  check('پک ذخیره‌شده در ربات هم در فهرست است', (sheet.querySelector('#emp').textContent + sheet.querySelector('#emg').textContent).includes('😽'), '');
  check('جستجو روی همهٔ پک‌ها کار می‌کند', (() => {
    const q = sheet.querySelector('#emq');
    q.value = '😽'; q.dispatchEvent(new window.Event('input', { bubbles: true }));
    return sheet.querySelector('#emg').innerHTML.includes('data-id="221"');
  })(), '😽');

  /* مدیریت پک‌ها */
  sheet.querySelector('#emMgBtn').click(); await wait(200);
  const mg = sheet.querySelector('#emMg');
  const mgBtn = sheet.querySelector('#emMgBtn');
  check('دکمهٔ «مدیریت پک‌ها» هست', !!mgBtn);
  if (!mgBtn) { console.log('\nRESULT: FAIL ❌ (بدون پنل مدیریت)'); process.exit(1); }
  check('پنل «مدیریت پک‌ها» باز می‌شود', mg && mg.style.display === 'block' && mg.dataset.open === '1', mg && ('display=' + mg.style.display));
  const rows = sheet.querySelectorAll('#emPkList .empr');
  check('هر پک با تعداد اموجی و دکمهٔ حذف فهرست می‌شود', rows.length === 2 && sheet.querySelector('#emPkList').innerHTML.includes('data-pk="PishiPack"'), `rows=${rows.length}`);

  /* افزودن پک با لینک */
  sheet.querySelector('#emPkIn').value = 'https://t.me/addemoji/PartyPack';
  sheet.querySelector('#emPkAdd').click();
  await wait(500);
  const addCall = calls.find(c => c.p.includes('/api/emoji/pack/add'));
  const addCalls = calls.filter(c => c.p.includes('/api/emoji/pack/add'));
  check('لینک پک به سرور فرستاده شد', !!addCall && /addemoji\/PartyPack/.test(addCall.body.target), addCall && addCall.body.target);
  check('هر کلیک فقط یک درخواست می‌فرستد', addCalls.length === 1, 'calls=' + addCalls.length);
  check('پک تازه در فهرست می‌آید', sheet.querySelectorAll('#emPkList .empr').length === 3, `rows=${sheet.querySelectorAll('#emPkList .empr').length}`);
  check('شمارنده به‌روز می‌شود', /6 اموجی در 3 پک/.test(sheet.querySelector('#emStats').textContent), sheet.querySelector('#emStats').textContent);

  /* حذف پک */
  const delBtn = [...sheet.querySelectorAll('#emPkList [data-pk]')].find(b => b.dataset.pk === 'PishiPack');
  delBtn.click(); await wait(400);
  const rmCall = calls.find(c => c.p.includes('/api/emoji/pack/remove'));
  check('درخواست حذف با نام پک فرستاده شد', !!rmCall && rmCall.body.name === 'PishiPack', rmCall && rmCall.body.name);
  check('پک حذف‌شده از فهرست می‌رود', sheet.querySelectorAll('#emPkList .empr').length === 2);

  /* دو پک با عنوان یکسان باید قابل تفکیک باشند */
  packs = packs.concat([{ name: 'PartyPack2', title: 'Party Pack', count: 1, at: 8, items: [{ id: '441', e: '🐈' }] }]);
  sheet.querySelector('#emRfBtn').click(); await wait(400);
  const labels = [...sheet.querySelectorAll('#emPkList .empr b')].map(b => b.textContent);
  check('دو پک هم‌نام با نام پک تفکیک می‌شوند', labels.filter(l => l.includes('Party Pack')).length === 2 && labels.some(l => l.includes('PartyPack2')), labels.join(' / '));
  const chips = [...sheet.querySelectorAll('#emp .chip')].map(c => c.textContent);
  check('چیپ‌های هم‌نام هم یکتا شده‌اند', new Set(chips).size === chips.length, chips.join(' / '));

  const failed = results.filter(r => !r[1]);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
  process.exit(failed.length ? 1 : 0);
})();
