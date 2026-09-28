/* Integration tests: original rich-post-bot behaviour must stay bit-identical,
   while the rasa mini app layer answers its own routes with all the new rules. */
import assert from 'node:assert/strict';
import worker from '../rpb-int/index.js';
import crypto from 'node:crypto';

const USER = '5982315292';
const CHAT = '@mychannel';

class MockKV {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  async get(k, type) {
    const v = this.map.get(k) ?? null;
    if (v === null) return null;
    if (type === 'arrayBuffer') {
      if (v instanceof ArrayBuffer) return v;
      return new TextEncoder().encode(String(v)).buffer;
    }
    if (type === 'json') return JSON.parse(v);
    return typeof v === 'string' ? v : Buffer.from(v).toString('binary');
  }
  async put(k, v) { this.map.set(k, v); }
  async delete(k) { this.map.delete(k); }
}

function makeHarness() {
  let msgId = 1000;
  const calls = [];
  const chats = { '@mychannel': { id: -1001234567890, type: 'channel', username: 'mychannel', title: 'My Channel' } };
  const memberMap = {
    [`8802353527:@mychannel`]: { status: 'administrator', can_post_messages: true },
    [`${USER}:@mychannel`]: { status: 'creator' }
  };
  const answer = (result) => new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = typeof url === 'string' ? url : url.url;
    if (!href.includes('api.telegram.org')) return realFetch(url, init);
    const method = href.replace(/^.*\/bot[^/]+\//, '');
    let payload = {};
    try { payload = init?.body ? JSON.parse(init.body) : {}; } catch { payload = {}; }
    calls.push({ method, payload });
    switch (method) {
      case 'getMe': return answer({ id: 8802353527, is_bot: true, first_name: 'NEXUS', username: 'Guts_game_bot' });
      case 'getChat': {
        const chat = chats[payload.chat_id] || chats['@' + String(payload.chat_id).replace(/^@/, '')];
        if (chat) return answer(chat);
        if (String(payload.chat_id) === String(USER)) return answer({ id: Number(USER), type: 'private', first_name: 'Ali' });
        return new Response(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }), { status: 400 });
      }
      case 'getChatMember': {
        const key = `${payload.user_id}:${payload.chat_id}`;
        return answer({ user: { id: payload.user_id }, ...(memberMap[key] || { status: 'member' }) });
      }
      case 'sendRichMessage':
      case 'sendMessage':
      case 'editMessageText':
        return answer({ message_id: ++msgId, chat: { id: payload.chat_id }, rich_message: payload.rich_message });
      case 'copyMessage':
      case 'forwardMessage':
        return answer({ message_id: ++msgId, chat: { id: payload.chat_id } });
      case 'deleteMessage': return answer(true);
      default: return answer(true);
    }
  };
  return {
    calls,
    env: {
      BOT_TOKEN: 'TEST-BOT-TOKEN', ADMIN_KEY: 'TEST-ADMIN', WEBHOOK_SECRET: 'TEST-SECRET',
      KV: new MockKV(), KV_FRESH: new MockKV(),
      RASA_KV: new MockKV({
        'asset:app.html': '<html lang="fa"><body>رِسا مینی‌اپ اموجی پرمیوم</body></html>',
        'asset:fonts/vazirmatn-regular.woff2': new Uint8Array([1, 2, 3, 4]).buffer
      }),
      STATE: { idFromName: () => ({}), get: () => ({ fetch: async () => new Response('{}') }) }
    },
    restore() { globalThis.fetch = realFetch; }
  };
}
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} };
const tgHeaders = (initData, extra = {}) => ({ 'content-type': 'application/json', ...(initData ? { 'x-telegram-init-data': initData } : {}), ...extra });
function fakeInitData(env, userId = USER) {
  const rawUser = JSON.stringify({ id: Number(userId), first_name: 'فرنار', language_code: 'fa' });
  const authDate = String(Math.floor(Date.now() / 1000));
  const dcs = ['auth_date=' + authDate, 'user=' + rawUser].sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return 'user=' + encodeURIComponent(rawUser) + '&auth_date=' + authDate + '&hash=' + hash;
}
function rasaToken(env, userId = USER) {
  const body = JSON.stringify({ uid: Number(userId), name: 'تست', user: '', exp: Date.now() + 12 * 3600 * 1000 });
  const payload = Buffer.from(body, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = crypto.createHmac('sha256', Buffer.from(env.BOT_TOKEN + '::rasa-app', 'utf8')).update(payload).digest('hex').slice(0, 32);
  return payload + '.' + sig;
}
const post = (env, path, body, headers = {}) => worker.fetch(new Request('https://rpb' + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, CTX);

const tests = [];
const test = (n, fn) => tests.push([n, fn]);

test('original Post Studio routes stay bit-identical', async () => {
  const h = makeHarness();
  try {
    const root = await worker.fetch(new Request('https://rpb/'), h.env, CTX);
    assert.equal(root.status, 200);
    assert.ok((await root.text()).includes('Post Studio'), 'their own mini app still served at /');
    const wjs = await worker.fetch(new Request('https://rpb/worker.js'), h.env, CTX);
    assert.ok(wjs.status === 200 && (await wjs.text()).includes('Post Studio'), 'their embedded worker.js still served');
    const mine = await post(h.env, '/api/send', { chat_id: '1', rich_message: { html: '<p>x</p>' } });
    assert.equal(mine.status, 400, 'their api rejects unauthenticated calls as before');
    const mj = await mine.json();
    assert.ok(mj.ok === false && /init|Telegram bot|ADMIN/i.test(mj.description || ''), 'their own auth error, untouched');
    const wh = await worker.fetch(new Request('https://rpb/webhook', { method: 'POST', body: '{}' }), h.env, CTX);
    assert.equal(wh.status, 403, 'their webhook secret guard intact');
    const nf = await worker.fetch(new Request('https://rpb/nope'), h.env, CTX);
    assert.equal(nf.status, 404);
  } finally { h.restore(); }
});

test('rasa app shell + assets + session/context serve from RASA_KV', async () => {
  const h = makeHarness();
  try {
    const app = await worker.fetch(new Request('https://rpb/app'), h.env, CTX);
    assert.equal(app.status, 200);
    assert.ok((await app.text()).includes('اموجی پرمیوم'), 'rasa mini app served at /app');
    const font = await worker.fetch(new Request('https://rpb/assets/fonts/vazirmatn-regular.woff2'), h.env, CTX);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    const bad = await post(h.env, '/api/session', { initData: 'garbage' }, tgHeaders());
    assert.equal(bad.status, 401, 'rasa session rejects junk initData');
    const ses = await post(h.env, '/api/session', { initData: fakeInitData(h.env) }, tgHeaders());
    const sj = await ses.json();
    assert.ok(sj.ok && sj.token && sj.user.name === 'فرنار', 'rasa session issued');
    const ctxRes = await worker.fetch(new Request('https://rpb/api/context', { headers: { 'x-rasa-token': sj.token } }), h.env, CTX);
    const ctx = await ctxRes.json();
    assert.ok(Array.isArray(ctx.channels) && Array.isArray(ctx.drafts) && ctx.templates.length >= 6, 'context payload, templates from library lite');
    const noTok = await worker.fetch(new Request('https://rpb/api/emoji/all'), h.env, CTX);
    assert.equal(noTok.status, 401, 'emoji feed requires rasa token');
  } finally { h.restore(); }
});

test('premium channel publish routes DM→copy (all tonight’s rules ride along)', async () => {
  const h = makeHarness();
  try {
    const token = rasaToken(h.env);
    const doc = '<p>با <tg-emoji emoji-id="5337109903142037414">🤡</tg-emoji> پرمیوم</p><tg-button-row><tg-button type="url" url="https://t.me/Guts_game_bot">ورود</tg-button></tg-button-row>';
    const res = await worker.fetch(new Request('https://rpb/api/publish', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-rasa-token': token },
      body: JSON.stringify({ target: CHAT, rich: { html: doc } })
    }), h.env, CTX);
    const j = await res.json();
    assert.ok(j.ok && j.via === 'premium-dm-copy', JSON.stringify(j));
    const dm = h.calls.find(c => c.method === 'sendRichMessage' && String(c.payload.chat_id) === String(USER));
    assert.ok(dm && dm.payload.rich_message.html.includes('<tg-emoji'), 'full premium doc went to the DM');
    const copy = h.calls.find(c => c.method === 'copyMessage');
    assert.ok(copy && copy.payload.chat_id === CHAT, 'copied to the channel');
    assert.ok(!h.calls.some(c => c.method === 'sendRichMessage' && c.payload.chat_id === CHAT), 'no unicode echo on the channel');
    assert.ok(j.notices.some(n => n.includes('پرمیوم')), 'sparkly notice');
  } finally { h.restore(); }
});

test('publish ladder: rotten urls sanitized; mixed md→rich conversion rides along', async () => {
  const h = makeHarness();
  try {
    const token = rasaToken(h.env);
    const mix = '## تیتر لایو\n> نقل\n\n- الف\n- ب\n<tg-button-row><tg-button type="url" url="BADURL">خراب</tg-button><tg-button type="url" url="https://t.me/Guts_game_bot">رسا</tg-button></tg-button-row>';
    const res = await worker.fetch(new Request('https://rpb/api/publish', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-rasa-token': token },
      body: JSON.stringify({ target: CHAT, rich: { html: mix } })
    }), h.env, CTX);
    const j = await res.json();
    assert.ok(j.ok && j.message_id, 'published');
    const sent = [...h.calls].reverse().find(c => c.method === 'sendRichMessage')?.payload?.rich_message?.html || '';
    assert.ok(!sent.includes('## تیتر') && !sent.includes('BADURL'), 'md converted + rotten url dropped before telegram');
    assert.ok(Array.isArray(j.notices) && j.notices.some(n => n.includes('دکمه')), 'honest drop notice');
  } finally { h.restore(); }
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (error) { failed++; console.log(`  ❌ ${name}\n     ${error.message}`); }
}
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
process.exit(failed ? 1 : 0);
