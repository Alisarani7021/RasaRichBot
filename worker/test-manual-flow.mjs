/* Regression test for the manual design flow:
   after a media block is added the message becomes a media message, so every later
   edit has to go through the caption path. Before this rule existed the bot tried
   editMessageText three times, Telegram rejected all three with
   "there is no text in the message to edit" and the whole control keyboard went dead.
   Usage: node test-manual-flow.mjs                        (exit 0 = pass)              */
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const bundlePath = process.argv[2] || './index.js';
const { default: worker } = await import(pathToFileURL(bundlePath).href);

/* fake KV + DO (same semantics as the worker) */
const kvData = new Map();
const kv = {
  async get(key, type) { const v = kvData.get(key); if (v === undefined) return null; return type === 'json' ? JSON.parse(v) : v; },
  async put(key, value) { kvData.set(key, typeof value === 'string' ? value : JSON.stringify(value)); },
  async delete(key) { kvData.delete(key); },
  async list({ prefix = '' } = {}) { return { keys: [...kvData.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; }
};
const doStore = new Map();
const stateFetch = async (input, init = {}) => {
  const href = typeof input === 'string' ? input : input.url;
  const method = init?.method || 'GET';
  const key = new URL(href).searchParams.get('key');
  if (!key) return new Response('key required', { status: 400 });
  if (method === 'GET') { const v = doStore.get(key); return v === undefined ? new Response('', { status: 404 }) : new Response(String(v)); }
  if (method === 'PUT') { doStore.set(key, String(init.body ?? '')); return new Response('OK'); }
  if (method === 'DELETE') { doStore.delete(key); return new Response('OK'); }
  return new Response('', { status: 405 });
};
const env = {
  BOT_TOKEN: 'TEST:TOKEN', WEBHOOK_SECRET: 's3cret', ADMIN_KEY: 'admin', WEBHOOK_PATH: '/telegram/webhook',
  KV: kv, RASA_KV: kv, KV_FRESH: kv,
  STATE: { idFromName: () => 'x', get: () => ({ fetch: stateFetch }) }
};

/* Telegram mock: text edits only on text/rich messages, caption edits only on media messages */
const messages = new Map();
let nextId = 100;
let calls = [];
const ok = (result) => new Response(JSON.stringify({ ok: true, result }), { headers: { 'content-type': 'application/json' } });
const err = (code, description) => new Response(JSON.stringify({ ok: false, error_code: code, description }), { headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = u.split('/bot')[1]?.split('/')[1]?.split('?')[0] || '';
  let p = {};
  try { p = opts.body ? JSON.parse(opts.body) : {}; } catch {}
  calls.push(method);
  if (method === 'getMe') return ok({ id: 777, is_bot: true, username: 'RasaRichBot', first_name: 'Rasa' });
  if (method === 'getChat') return ok({ id: p.chat_id, type: 'private' });
  if (method === 'getChatMember') return ok({ status: 'creator' });
  if (method === 'answerCallbackQuery') return ok(true);
  if (method === 'deleteMessage') { messages.delete(p.message_id); return ok(true); }
  if (method === 'sendRichMessage') { const id = ++nextId; messages.set(id, { kind: 'rich', hasMarkup: !!p.reply_markup }); return ok({ message_id: id }); }
  if (method === 'sendMessage') { const id = ++nextId; messages.set(id, { kind: 'text', hasMarkup: !!p.reply_markup }); return ok({ message_id: id }); }
  if (/^send(Photo|Video|Animation|Document|Audio|Voice)$/.test(method)) { const id = ++nextId; messages.set(id, { kind: 'media', hasMarkup: !!p.reply_markup }); return ok({ message_id: id }); }
  if (method === 'editMessageText') {
    const m = messages.get(p.message_id);
    if (!m) return err(400, 'Bad Request: message to edit not found');
    if (m.kind === 'media') return err(400, 'Bad Request: there is no text in the message to edit');
    if (p.reply_markup) m.hasMarkup = true;
    return ok({ message_id: p.message_id });
  }
  if (method === 'editMessageCaption') {
    const m = messages.get(p.message_id);
    if (!m) return err(400, 'Bad Request: message to edit not found');
    if (m.kind !== 'media') return err(400, 'Bad Request: there is no caption in the message to edit');
    if (p.reply_markup) m.hasMarkup = true;
    return ok({ message_id: p.message_id });
  }
  return ok(true);
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

const CHAT = 5982315292;
const origin = 'https://rich-post-bot.4lisarani-1.workers.dev';
let seq = 900;
const post = async (update) => {
  calls = [];
  const req = new Request(`${origin}/telegram/webhook`, {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' }, body: JSON.stringify(update)
  });
  let pending;
  await worker.fetch(req, env, { waitUntil: (x) => { pending = x; } });
  if (pending) await pending.catch(() => {});
  const edited = calls.some((m) => m === 'editMessageText' || m === 'editMessageCaption');
  return { calls: [...calls], edited };
};
const msg = (text) => ({ update_id: ++seq, message: { message_id: ++seq, date: Math.floor(Date.now() / 1000), chat: { id: CHAT, type: 'private' }, from: { id: CHAT, first_name: 'Ali' }, text } });
const photo = () => ({ update_id: ++seq, message: { message_id: ++seq, date: Math.floor(Date.now() / 1000), chat: { id: CHAT, type: 'private' }, from: { id: CHAT, first_name: 'Ali' }, photo: [{ file_id: 'AgACsmall', width: 90, height: 90 }, { file_id: 'AgACbig', width: 1280, height: 720 }] } });
const cb = (data, messageId) => ({ update_id: ++seq, callback_query: { id: 'cb' + (++seq), from: { id: CHAT, first_name: 'Ali' }, message: { message_id: messageId, date: Math.floor(Date.now() / 1000), chat: { id: CHAT, type: 'private' } }, data } });
const readPost = (pid) => JSON.parse(kvData.get(`post:${pid}`) ?? doStore.get(`post:${pid}`));

let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}\n     ${e.message}`); }
};

/* ── the flow ── */
let pid, msgId;
await test('manual design: add a photo, then every button keeps working', async () => {
  kvData.clear(); doStore.clear(); messages.clear();
  await post(msg('/start'));
  await post(cb('act:manual_new', nextId));
  pid = [...doStore.keys()].find((k) => k.startsWith('post:')).slice(5);
  msgId = readPost(pid).msgId;
  assert.ok(pid && msgId, 'manual post created');

  await post(cb(`st:manual_add:${pid}:paragraph`, msgId));
  await post(msg('یک پاراگراف تستی'));
  assert.equal(readPost(pid).manualBlockCount, 1, 'paragraph block appended');

  await post(cb(`st:manual_add:${pid}:photo`, readPost(pid).msgId));
  await post(photo());
  const afterPhoto = readPost(pid);
  assert.equal(afterPhoto.media?.type, 'photo', 'photo attached to the post');
  assert.equal(messages.get(afterPhoto.msgId).kind, 'media', 'post message is a media message now');

  // اینجا باگ قبلی بود: هیچ‌کدام از دکمه‌ها بعد از عکس کار نمی‌کردند
  const addMenu = await post(cb(`st:manual_addmenu:${pid}`, afterPhoto.msgId));
  assert.ok(addMenu.calls.includes('editMessageCaption') || addMenu.calls.includes('editMessageText'), 'add-menu button reacted');

  const heading = await post(cb(`st:manual_add:${pid}:heading`, readPost(pid).msgId));
  assert.ok(heading.calls.includes('editMessageCaption'), `heading button reached the caption path, calls: ${heading.calls.join(',')}`);

  await post(msg('# تیتر تستی'));
  assert.equal(readPost(pid).manualBlockCount, 2, 'heading block appended after the photo');

  const stats = await post(cb(`st:manual_stats:${pid}`, readPost(pid).msgId));
  assert.ok(stats.calls.includes('editMessageCaption'), 'stats button still reacts');

  const finalMsg = messages.get(readPost(pid).msgId);
  assert.equal(finalMsg.kind, 'media', 'photo is still attached to the final message');
  assert.ok(finalMsg.hasMarkup, 'final message still carries its keyboard');
});

await test('manual design: keyboard survives a video block too', async () => {
  kvData.clear(); doStore.clear(); messages.clear();
  await post(msg('/start'));
  await post(cb('act:manual_new', nextId));
  const id = [...doStore.keys()].find((k) => k.startsWith('post:')).slice(5);
  await post(cb(`st:manual_add:${id}:video`, readPost(id).msgId));
  const video = { update_id: ++seq, message: { message_id: ++seq, date: Math.floor(Date.now() / 1000), chat: { id: CHAT, type: 'private' }, from: { id: CHAT, first_name: 'Ali' }, video: { file_id: 'BAACvideo', width: 1280, height: 720, duration: 12 } } };
  await post(video);
  assert.equal(readPost(id).media?.type, 'video', 'video attached');
  const buttons = await post(cb(`st:manual_undo:${id}`, readPost(id).msgId));
  assert.ok(buttons.calls.includes('editMessageCaption'), 'undo button reacted after the video');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
