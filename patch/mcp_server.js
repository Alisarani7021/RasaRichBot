/* ═══════════════════════════════════════════════════════════════════════════
   دریچهٔ MCP روی ورکر رِسا — برای اتصال مستقیم Gemini / Claude / Cursor
   Transport: Streamable HTTP (spec 2024-11-05 → 2026-07-28), روی /api/mcp/<secret>
   بدون OAuth (کلید دسترسی = خودِ آدرس). ابزارها همان ابزارهای «فرمانده» هستند.
   ═══════════════════════════════════════════════════════════════════════════ */

var MCP_OWNER = 5982315292;
var MCP_SUPPORTED = ['2024-11-05', '2025-03-26', '2025-06-18', '2026-07-28'];
var MCP_LATEST = '2025-06-18';

function mcpToolDefs() {
  return [
    { name: 'make_image', description: 'ساخت عکس با هوش مصنوعی (flux). prompt را دقیق و توصیفی بده (انگلیسی نتیجهٔ بهتری می‌دهد). عکس به تلگرام مالک هم ارسال می‌شود و برای انتشار در همین گفتگو آماده می‌ماند.',
      inputSchema: { type: 'object', properties: { prompt: { type: 'string', description: 'توصیف تصویر' } }, required: ['prompt'] } },
    { name: 'publish_post', description: 'انتشار یک پست ریچ در کانال تلگرام مالک. متن را فارسی، ۵۰۰ تا ۹۰۰ کاراکتر، با مارک‌داون ساده (**بولد**، - برای بولت). اگر قبلاً make_image صدا زده شده، with_image=true بگذار.',
      inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'متن پست' }, with_image: { type: 'boolean', description: 'با عکسِ ساخته‌شدهٔ قبلی منتشر شود؟' } }, required: ['text'] } },
    { name: 'get_stats', description: 'آمار واقعی کانال: تعداد پست و بازدید دیروز/پریروز، پست‌های برتر، آخرین پست‌ها.',
      inputSchema: { type: 'object', properties: {} } },
    { name: 'get_occasions', description: 'مناسبت‌های رسمی امروز و فردا (تقویم هجری شمسی) + تعطیلی. فقط از همین داده استفاده کن؛ مناسبت از خودت نساز.',
      inputSchema: { type: 'object', properties: {} } },
    { name: 'web_fetch', description: 'خواندن متن یک صفحهٔ وب برای خلاصه‌کردن (لینک‌هایی که مالک می‌دهد).',
      inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
    { name: 'poll', description: 'ساخت نظرسنجی در کانال.',
      inputSchema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, description: '۲ تا ۱۰ گزینه' } }, required: ['question', 'options'] } },
    { name: 'schedule_post', description: 'زمان‌بندی انتشار پست در آینده (۱ تا ۱۰۰۸۰ دقیقه بعد).',
      inputSchema: { type: 'object', properties: { text: { type: 'string' }, in_minutes: { type: 'number' } }, required: ['text', 'in_minutes'] } },
    { name: 'delete_last', description: 'حذف آخرین پستی که رِسا در کانال منتشر کرده است.',
      inputSchema: { type: 'object', properties: {} } },
    { name: 'set_channel', description: 'تعیین کانال پیش‌فرض (مثل @mychannel).',
      inputSchema: { type: 'object', properties: { channel: { type: 'string' } }, required: ['channel'] } }
  ];
}

function mcpJson(body, status, extraHeaders, wantsSse) {
  // اگر کلاینت فقط text/event-stream قبول کند، پاسخ را در قالب SSE می‌دهیم (StreamableHTTP)
  if (wantsSse) {
    var data = 'event: message\ndata: ' + JSON.stringify(body) + '\n\n';
    return new Response(data, {
      status: status || 200,
      headers: Object.assign({ 'content-type': 'text/event-stream', 'cache-control': 'no-store' }, extraHeaders || {})
    });
  }
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, extraHeaders || {})
  });
}
function mcpErr(id, code, message) { return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code: code, message: message } }; }
function mcpOk(id, result) { return { jsonrpc: '2.0', id: id, result: result }; }

function mcpAuthorized(env, url, request) {
  var secret = String(env.MCP_SECRET || '').trim();
  if (!secret) return false;
  var path = url.pathname.replace(/\/+$/, '');
  var tail = path.indexOf('/api/mcp') === 0 ? path.slice('/api/mcp'.length).replace(/^\//, '') : '';
  var provided = tail || String(request.headers.get('x-rasa-mcp-key') || url.searchParams.get('key') || '');
  return provided === secret;
}

async function mcpCallTool(env, name, args) {
  var store = new Store(rasaEnv(env), cfg(env));
  var chan = await store.get('cmd:chan:' + MCP_OWNER, null) || await store.get('cmd:chan:shared', null) || String(env.CMD_CHANNEL || '').trim();
  if (!chan) return { ok: false, error: 'کانال پیش‌فرض تنظیم نشده؛ از ابزار set_channel استفاده کن.' };
  var tg = createTelegram(env, cfg(env));
  var res = await cmdTool(env, MCP_OWNER, name, args || {}, { tg: tg, chatId: MCP_OWNER, channel: chan });
  if (name === 'publish_post' && res && res.ok && res.link) {
    try { await cmdSay(env, MCP_OWNER, '🔌 از طریق MCP (جمنای/کلاد) منتشر شد: ' + res.link); } catch (e) {}
  }
  return res;
}

async function mcpHandle(env, request, url) {
  // CORS — لازم نیست ولی بی‌ضرر
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, x-rasa-mcp-key, mcp-protocol-version, mcp-session-id', 'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS' } });
  if (!env.MCP_SECRET) return mcpJson({ ok: false, error: 'MCP_SECRET روی ورکر تنظیم نشده است.' }, 503);
  if (!mcpAuthorized(env, url, request)) {
    return mcpJson({ ok: false, error: 'دسترسی ندارید؛ آدرس کامل MCP (همراه با کلید مسیر) را از رِسا بگیرید.' }, 401, { 'www-authenticate': 'Bearer realm="rasa"' });
  }
  if (request.method === 'GET') return mcpJson({ ok: false, error: 'این سرور جریان SSE جدا ندارد؛ از POST استفاده کنید.' }, 405, { allow: 'POST, DELETE, OPTIONS' });
  if (request.method === 'DELETE') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return mcpJson({ ok: false, error: 'method not allowed' }, 405);

  var accept = String(request.headers.get('accept') || '');
  var wantsSse = accept.indexOf('text/event-stream') > -1 && accept.indexOf('application/json') < 0;
  let payload;
  try { payload = await request.json(); } catch { return mcpJson(mcpErr(null, -32700, 'Invalid JSON'), 400, null, wantsSse); }
  var batch = Array.isArray(payload);
  var items = batch ? payload : [payload];
  var out = [];
  for (var i = 0; i < items.length; i += 1) {
    var req = items[i] || {};
    var id = req.id;
    var method = req.method;
    var params = req.params || {};
    if (method === 'initialize') {
      var want = String(params.protocolVersion || '');
      out.push(mcpOk(id, {
        protocolVersion: MCP_SUPPORTED.indexOf(want) > -1 ? want : MCP_LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'rasa', title: 'رِسا — دستیار کانال تلگرام', version: '1.0.0' },
        instructions: 'تو به «رِسا» وصل شده‌ای، دستیار کانال تلگرامی مالک. برای انتشار پست: اول make_image (اگر عکس لازم است) بعد publish_post با with_image=true. مناسبت‌ها را فقط از get_occasions بگیر و از خودت نساز. متن پست: فارسی، ۵۰۰ تا ۹۰۰ کاراکتر، حداکثر ۳ ایموجی.'
      }));
      continue;
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled' || id === undefined) { continue; }
    if (method === 'ping') { out.push(mcpOk(id, {})); continue; }
    if (method === 'tools/list') { out.push(mcpOk(id, { tools: mcpToolDefs() })); continue; }
    if (method === 'resources/list') { out.push(mcpOk(id, { resources: [] })); continue; }
    if (method === 'prompts/list') { out.push(mcpOk(id, { prompts: [] })); continue; }
    if (method === 'logging/setLevel') { out.push(mcpOk(id, {})); continue; }
    if (method === 'tools/call') {
      var name = String(params.name || '');
      var args = params.arguments || params.args || {};
      var known = mcpToolDefs().map(function (t) { return t.name; });
      if (known.indexOf(name) < 0) { out.push(mcpErr(id, -32602, 'ابزار ناشناخته: ' + name)); continue; }
      try {
        var res = await mcpCallTool(env, name, args);
        var content = [{ type: 'text', text: JSON.stringify(res) }];
        if (name === 'make_image' && res && res.b64) content.push({ type: 'image', data: res.b64, mimeType: 'image/jpeg' });
        var clean = Object.assign({}, res); delete clean.b64;
        content[0].text = JSON.stringify(clean);
        out.push(mcpOk(id, { content: content, isError: !res.ok }));
      } catch (e) {
        out.push(mcpOk(id, { content: [{ type: 'text', text: 'خطا: ' + String(e && e.message || e).slice(0, 300) }], isError: true }));
      }
      continue;
    }
    out.push(mcpErr(id, -32601, 'روش پشتیبانی نمی‌شود: ' + method));
  }
  if (!out.length) return new Response(null, { status: 202 });
  return mcpJson(batch ? out : out[0], 200, null, wantsSse);
}
