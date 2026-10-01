#!/usr/bin/env node
/* e2e واقعی b48: نصب از مسیر مینی‌اپ (initData) → ورکر شخصی → پل رسا → پاک‌سازی
   اجرا: node work/e2e48.mjs install|verify|cleanup                                   */
import fs from 'node:fs';
import crypto from 'node:crypto';

const HOST = 'https://rich-post-bot.4lisarani-1.workers.dev';
const ACC = 'ab05b8b5f2822a491ec407585327eb8f';
const cfTok = fs.readFileSync('.cf/token', 'utf8').trim();
const botTok = fs.readFileSync('.cf/bot_token', 'utf8').trim();
const UID = 5982315292;
const NAME = 'rasa-e2e4';
const CHAN = '@xjjsjsjsjji';
const stateFile = 'work/.e2e48.json';

function initData() {
  const params = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AA' + Date.now(), user: JSON.stringify({ id: UID, first_name: 'Ali' }) };
  const dataCheck = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(botTok).digest();
  const hash = crypto.createHmac('sha256', key).update(dataCheck).digest('hex');
  return new URLSearchParams({ ...params, hash }).toString();
}
const cfApi = async (method, path, body) => {
  const init = { method, headers: { authorization: 'Bearer ' + cfTok } };
  if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch('https://api.cloudflare.com/client/v4' + path, init);
  return await r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cmd = process.argv[2] || 'install';

if (cmd === 'install') {
  console.log('── نصب واقعی از مسیر مینی‌اپ ──');
  const r = await fetch(HOST + '/api/selfinstall', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ consent: 'yes', cf_token: cfTok, channel: CHAN, name: NAME, initData: initData() })
  });
  const j = await r.json();
  if (!j.ok) { console.log('❌ نصب نشد:', j.error); process.exit(1); }
  fs.writeFileSync(stateFile, JSON.stringify({ mcp: j.mcp_url, base: j.base, name: j.name, at: Date.now() }, null, 2));
  console.log('✅ نصب موفق:', j.name, '—', j.base);
  (j.log || []).forEach((x) => console.log('   ', x.ok === false ? '❌' : '✅', x.t, x.x ? '— ' + x.x : ''));
  console.log('🔗 لینک شخصی:', j.mcp_url);
  console.log('📣 کانال پل‌شده:', j.channel || '(ثبت نشده)');
}

if (cmd === 'verify') {
  const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  console.log('── بررسی ورکر شخصی (چند لحظه صبر برای فعال شدن مسیر) ──');
  await sleep(40000);
  let ok = false, tries = 0;
  while (!ok && tries < 5) {
    tries += 1;
    try {
      const r = await fetch(st.mcp, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }) });
      const j = await r.json();
      ok = !!(j.result && j.result.serverInfo);
      if (!ok) await sleep(15000);
    } catch (e) { await sleep(15000); }
  }
  console.log(ok ? '✅ MCP ورکر شخصی جواب داد' : '❌ ورکر شخصی جواب نداد');
  const list = await (await fetch(st.mcp, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) })).json();
  console.log('ابزارهای ورکر شخصی:', (list.result?.tools || []).length);

  /* ابزار خواندنی از پل رد شود (بدون پست زدن در کانال) */
  const call = async (name, args) => {
    const r = await fetch(st.mcp, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }) });
    const j = await r.json();
    try { return JSON.parse(j.result.content[0].text); } catch (e) { return j; }
  };
  const gs = await call('get_stats', {});
  console.log('پل (get_stats روی کانال خودم):', JSON.stringify(gs).slice(0, 220));
  const mk = await call('market', { asset: 'طلا' });
  console.log('هوش مصنوعی/ابزار روی حساب خودم (market طلا):', JSON.stringify(mk).slice(0, 160));
}

if (cmd === 'cleanup') {
  console.log('── پاک‌سازی ──');
  const st = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  const del = await cfApi('DELETE', `/accounts/${ACC}/workers/scripts/${NAME}?force=true`);
  console.log('worker:', del.success ? '✅ حذف شد' : 'ℹ️ ' + JSON.stringify(del.errors || del.messages || '').slice(0, 120));
  const kv = await cfApi('GET', `/accounts/${ACC}/storage/kv/namespaces?per_page=100`);
  let killed = 0;
  for (const ns of (kv.result || [])) {
    if (String(ns.title || '').startsWith(NAME + '-kv')) {
      const d = await cfApi('DELETE', `/accounts/${ACC}/storage/kv/namespaces/${ns.id}`);
      if (d.success) killed += 1;
    }
  }
  console.log('KV های آزمایشی حذف‌شده:', killed);
  /* پاک‌سازی ردیف‌های رسا: کلید پل + دفتر نصب */
  const RNS = 'f7714cd6f0e74ae0b55d73107fa8d88e';
  const keys = await cfApi('GET', `/accounts/${ACC}/storage/kv/namespaces/${RNS}/keys?prefix=bridge:&limit=100`);
  let removed = 0;
  for (const k of (keys.result || [])) {
    const v = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${RNS}/values/${encodeURIComponent(k.name)}`, { headers: { authorization: 'Bearer ' + cfTok } })).text();
    if (v.includes(NAME)) {
      const d = await cfApi('DELETE', `/accounts/${ACC}/storage/kv/namespaces/${RNS}/values/${encodeURIComponent(k.name)}`);
      if (d.success) removed += 1;
    }
  }
  console.log('کلیدهای پل حذف‌شده:', removed);
  const led = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${RNS}/values/installs`, { headers: { authorization: 'Bearer ' + cfTok } })).json();
  if (led && Array.isArray(led.items)) {
    const keep = led.items.filter((x) => x.worker !== NAME);
    await cfApi('PUT', `/accounts/${ACC}/storage/kv/namespaces/${RNS}/values/installs`, keep);
    console.log('دفتر نصب: ردیف آزمایشی حذف شد →', keep.length, 'ردیف باقی‌مانده');
  }
  try { fs.unlinkSync(stateFile); } catch (e) { }
}
