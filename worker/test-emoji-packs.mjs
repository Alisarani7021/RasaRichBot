/* Emoji registry: the bot writes packs through the state object under
   `map`/`variants_map`/`packs`, while the app used to read only `emoji:packs`
   from KV. This sim seeds both namespaces the way production holds them and
   proves the app now sees every pack, can add/remove packs, and that the live
   preview premiumizes emojis that only exist in the bot's namespace.
   Usage: node test-emoji-packs.mjs [bundle.mjs]        (exit 0 = pass)        */
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

const bundlePath = process.argv[2] || './index.js';
const { default: worker } = await import(pathToFileURL(bundlePath).href);

const BOT = 'TEST:TOKEN', ORIGIN = 'https://rich-post-bot.4lisarani-1.workers.dev';
const kvData = new Map();          // KV layer (what the app used to read)
const doStore = new Map();         // state object layer (what the bot writes)
const kv = {
  async get(k, t) { const v = kvData.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v); },
  async put(k, v) { kvData.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kvData.delete(k); },
  async list({ prefix = '' } = {}) { return { keys: [...kvData.keys()].filter(x => x.startsWith(prefix)).map(name => ({ name })), list_complete: true }; }
};
const stateFetch = async (input, init = {}) => {
  const href = typeof input === 'string' ? input : input.url;
  const method = init.method || (typeof input === 'object' && input.method) || 'GET';
  const key = new URL(href).searchParams.get('key');
  if (method === 'GET') { const v = doStore.get(key); return v === undefined ? new Response('', { status: 404 }) : new Response(String(v)); }
  if (method === 'PUT') { doStore.set(key, String(init.body ?? '')); return new Response('OK'); }
  if (method === 'DELETE') { doStore.delete(key); return new Response('OK'); }
  return new Response('', { status: 405 });
};
const env = { BOT_TOKEN: BOT, WEBHOOK_SECRET: 's3cret', ADMIN_KEY: 'a', KV: kv, RASA_KV: kv, KV_FRESH: kv, STATE: { idFromName: () => 'x', get: () => ({ fetch: stateFetch }) } };

/* ── Telegram mock: four packs, each with n custom emoji ── */
const PACKS = {
  MemeSetEmoji: { title: '☆ @emoji1 ★', emojis: ['😂', '😍', '🥰'] },
  MeowieQ:      { title: '🐱 ᴍᴇᴏᴡɪᴇ', emojis: ['🐱', '😻', '🙀'] },
  PishiPack:    { title: 'پیشی', emojis: ['😽', '😹', '🐈'] },      // bot-only (legacy keys)
  PartyTime:    { title: 'Party', emojis: ['🎉', '🎊', '🥳'] },      // bot-only
  CupidPack:    { title: 'Cupid', emojis: ['💘', '💖', '💝'] }       // library-only (KV)
};
let emojiSeq = 7000000000;
const IDS = {};
for (const [name, p] of Object.entries(PACKS)) IDS[name] = p.emojis.map(() => String(++emojiSeq));
globalThis.fetch = async (u) => {
  const m = String(u).split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  if (m === 'getMe') return Response.json({ ok: true, result: { id: 8826777931, is_bot: true, username: 'RasaRichBot' } });
  if (m === 'getStickerSet') {
    let name = ''; try { name = JSON.parse(arguments[1]?.body || '{}').name; } catch {}
    if (!name) { try { name = JSON.parse((await Promise.resolve()).toString()); } catch {} }
    return Response.json({ ok: true, result: { name, title: PACKS[name]?.title || name, sticker_type: 'custom_emoji', stickers: (PACKS[name]?.emojis || []).map((e) => ({ custom_emoji_id: IDS[name][PACKS[name].emojis.indexOf(e)], emoji: e })) } });
  }
  return Response.json({ ok: true, result: { message_id: 1 } });
};
/* the mock needs the request body → wrap fetch properly */
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  const m = String(u).split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  if (m === 'getStickerSet') {
    const body = JSON.parse(o.body || '{}');
    const name = String(body.name || '');
    return Response.json({ ok: true, result: { name, title: PACKS[name]?.title || name, sticker_type: 'custom_emoji', stickers: (PACKS[name]?.emojis || []).map((e, i) => ({ custom_emoji_id: IDS[name][i], emoji: e })) } });
  }
  return realFetch(u, o);
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
const signInitData = (user) => {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'q', user: JSON.stringify(user) });
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  params.set('hash', hmac(hmac(Buffer.from('WebAppData'), BOT), check).toString('hex'));
  return params.toString();
};
const call = async (path, body, token, method = 'POST') => {
  const r = await worker.fetch(new Request(`${ORIGIN}${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-rasa-token': token || '' }, body: method === 'GET' ? undefined : JSON.stringify(body || {})
  }), env, { waitUntil: () => {} });
  return { status: r.status, body: await r.json() };
};

/* ── seed the two namespaces exactly like production ── */
const UID = 5982315292;
const legMap = {}, legVar = {}, legPacks = {};
for (const name of ['MemeSetEmoji', 'MeowieQ', 'PishiPack', 'PartyTime']) {
  legPacks[name] = { title: PACKS[name].title, name, count: PACKS[name].emojis.length, stickers: PACKS[name].emojis.length, at: Date.now() };
  PACKS[name].emojis.forEach((e, i) => { legMap[e] = IDS[name][i]; (legVar[e] = legVar[e] || []).push(IDS[name][i]); });
}
doStore.set('map', JSON.stringify(legMap));
doStore.set('variants_map', JSON.stringify(legVar));
doStore.set('packs', JSON.stringify(legPacks));
/* library half in KV, as the live namespace holds it */
kvData.set('emoji:packs', JSON.stringify({ MemeSetEmoji: { title: PACKS.MemeSetEmoji.title, count: 3, ts: Date.now() }, MeowieQ: { title: PACKS.MeowieQ.title, count: 3, ts: Date.now() }, CupidPack: { title: PACKS.CupidPack.title, count: 3, ts: Date.now() } }));

const results = [];
const check = (name, cond, extra) => { results.push([name, !!cond]); console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const sess = await call('/api/session', { initData: signInitData({ id: UID, first_name: 'Ali' }) });
const TOK = sess.body.token;

console.log('— فهرست پک‌ها در مینی‌اپ —');
const all = await call('/api/emoji/all', null, TOK, 'GET');
const names = (all.body.packs || []).map((p) => p.name);
check('پک‌های ذخیره‌شده در خود ربات هم دیده می‌شوند', names.includes('PishiPack') && names.includes('PartyTime'), names.join(', '));
check('پک‌های کتابخانه هم سرجایشان هستند', names.includes('CupidPack') && names.includes('MeowieQ'));
check('هر پک آیتم‌هایش را دارد', (all.body.packs || []).every((p) => p.items && p.items.length === 3), JSON.stringify((all.body.packs || []).map((p) => p.count)));
check('جمع اموجی درست گزارش می‌شود', all.body.total === 15, 'total=' + all.body.total);
check('تعداد پک‌ها درست است', all.body.packCount === 5, 'packCount=' + all.body.packCount);

console.log('— افزودن پک از مینیاپ —');
const add = await call('/api/emoji/pack/add', { target: 'https://t.me/addemoji/PartyTime' }, TOK);
check('لینک addemoji پذیرفته می‌شود', add.body.ok === true, JSON.stringify(add.body).slice(0, 80));
const add2 = await call('/api/emoji/pack/add', { target: '@CupidPack' }, TOK);
check('نام کاربری پک هم پذیرفته می‌شود', add2.body.ok === true);
const addBad = await call('/api/emoji/pack/add', { target: 'سلام' }, TOK);
check('ورودی نامعتبر رد می‌شود', addBad.body.ok === false);
const after = await call('/api/emoji/all', null, TOK, 'GET');
check('پک تازه بلافاصله در فهرست می‌آید', (after.body.total || 0) >= 15, 'total=' + after.body.total);

console.log('— همگام‌سازی دو فضای نام —');
const syncTarget = (k) => JSON.parse(doStore.get(k) || '{}');
check('map در لایهٔ state هم نوشته شد', Object.keys(syncTarget('map')).length >= 15, 'entries=' + Object.keys(syncTarget('map')).length);
check('emoji:map هم به‌روز شد', Object.keys(JSON.parse(kvData.get('emoji:map') || '{}')).length >= 15);
check('registry در هر دو کلید یکسان است', JSON.stringify(Object.keys(syncTarget('packs')).sort()) === JSON.stringify(Object.keys(JSON.parse(kvData.get('emoji:packs') || '{}')).sort()));

console.log('— سبک ماندن رجیستری —');
const reg = JSON.parse(doStore.get('packs') || '{}');
check('رجیستری فهرست استیکرها را در خودش نگه نمی‌دارد', Object.values(reg).every((r) => !r.items && !r.bases), 'sizes=' + Object.values(reg).map((r) => JSON.stringify(r).length).join(','));
check('آیتم‌های هر پک کلید جداگانه دارند', ['MemeSetEmoji','PishiPack','CupidPack'].every((n) => !!JSON.parse(doStore.get('emoji:pack:' + n) || 'null')), 'keys=' + [...doStore.keys()].filter((k) => k.startsWith('emoji:pack:')).length);
check('کلید آیتم‌ها در لایهٔ KV هم هست', [...kvData.keys()].some((k) => k.startsWith('emoji:pack:')));

console.log('— پیش‌نمایش زندهٔ مینیاپ —');
const rendered = await call('/api/render', { text: 'پیشی 😽 دوست‌داشتنی' }, TOK);
check('اموجی‌ای که فقط ربات می‌شناخت، پریمیوم می‌شود', rendered.body.html.includes(IDS.PishiPack[0]) || rendered.body.premium === true, rendered.body.html.slice(0, 90));

console.log('— حذف پک —');
const rm = await call('/api/emoji/pack/remove', { name: 'PartyTime' }, TOK);
check('پک حذف می‌شود', rm.body.ok === true);
const afterRm = await call('/api/emoji/all', null, TOK, 'GET');
check('پکِ حذف‌شده در فهرست نمی‌ماند', !(afterRm.body.packs || []).some((p) => p.name === 'PartyTime'));
check('اموجی‌های پک حذف‌شده برای رندر می‌مانند', Object.keys(syncTarget('variants_map')).length >= 10);

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log('RESULT:', failed.length ? 'FAIL ❌' : 'PASS ✅');
process.exit(failed.length ? 1 : 0);
