/* ورکر آزمایشی رِسا: دروازهٔ مدل‌های Workers AI برای تست محلی (متن، عکس، صدا) */
const TEXT_CANDIDATES = ['@cf/meta/llama-4-scout-17b-16e-instruct','@cf/meta/llama-4-maverick-17b-128e-instruct','@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/qwen/qwen3-30b-a3b-fp8','@cf/mistralai/mistral-small-3.1-24b-instruct','@cf/google/gemma-3-12b-it','@cf/qwen/qwen2.5-32b-instruct','@cf/deepseek-ai/deepseek-r1-distill-qwen-32b','@cf/meta/llama-3.1-8b-instruct'];
const IMG_CANDIDATES = ['@cf/black-forest-labs/flux-1-schnell','@cf/bytedance/stable-diffusion-xl-lightning','@cf/lykon/dreamshaper-8-lcm','@cf/stabilityai/stable-diffusion-xl-base-1.0'];
const STT_CANDIDATES = ['@cf/openai/whisper-large-v3-turbo','@cf/openai/whisper'];
const SECRET = 'rasa-test-9f2K';

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
};
async function toImageBase64(result) {
  if (result instanceof ReadableStream) return b64(await new Response(result).arrayBuffer());
  if (result instanceof ArrayBuffer) return b64(result);
  if (ArrayBuffer.isView(result)) return b64(result.buffer);
  if (result && typeof result.image === 'string') return result.image;
  if (result && result.body) return b64(await new Response(result.body).arrayBuffer());
  throw new Error('شکل خروجی عکس ناشناخته: ' + (result && result.constructor ? result.constructor.name : typeof result));
}
const textOf = (r) => {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (typeof r.response === 'string') return r.response;
  const c = r.choices && r.choices[0];
  if (c && c.message && typeof c.message.content === 'string') return c.message.content;
  return JSON.stringify(r);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get('k') !== SECRET) return new Response('forbidden', { status: 403 });

    if (url.pathname === '/brain' && request.method === 'POST') {
      const body = await request.json();
      const r = await env.AI.run(body.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: body.messages, max_tokens: body.max_tokens || 700, temperature: body.temperature ?? 0.6
      });
      return Response.json({ ok: true, text: textOf(r), raw_keys: Object.keys(r || {}) });
    }
    if (url.pathname === '/run' && request.method === 'POST') {
      const body = await request.json();
      const r = await env.AI.run(body.model, body.payload || {});
      if (body.as === 'image') { try { return Response.json({ ok: true, b64: await toImageBase64(r) }); } catch (e) { return Response.json({ ok: false, error: String(e.message) }); } }
      return Response.json({ ok: true, text: textOf(r), raw: JSON.stringify(r).slice(0, 500) });
    }
    if (url.pathname === '/stt' && request.method === 'POST') {
      const body = await request.json();
      const audio = body.url ? new Uint8Array(await (await fetch(body.url)).arrayBuffer()) : Uint8Array.from(atob(body.b64 || ''), (c) => c.charCodeAt(0));
      const out = [];
      for (const m of STT_CANDIDATES) {
        try {
          const r = await env.AI.run(m, { audio: [...audio.slice(0, 3_000_000)] });
          out.push({ model: m, ok: true, text: (r.text !== undefined ? r.text : r.response || JSON.stringify(r)).slice(0, 300) });
        } catch (e) { out.push({ model: m, ok: false, error: String(e.message).slice(0, 160) }); }
      }
      return Response.json({ bytes: audio.length, results: out });
    }
    if (url.pathname === '/imgone') {
      const m = url.searchParams.get('m') || IMG_CANDIDATES[0];
      const r = await env.AI.run(m, { prompt: url.searchParams.get('p') || 'golden sunset over Tehran skyline', steps: 4 });
      const data = await toImageBase64(r);
      return new Response(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), { headers: { 'content-type': 'image/jpeg' } });
    }
    if (url.pathname === '/one') {
      const m = url.searchParams.get('m');
      const p = url.searchParams.get('p') || 'سلام';
      try { const r = await env.AI.run(m, { messages: [{ role: 'user', content: p }], max_tokens: 150 }); return Response.json({ ok: true, text: textOf(r) }); }
      catch (e) { return Response.json({ ok: false, error: String(e.message).slice(0, 200) }); }
    }
    // پیش‌فرض: sweep مدل‌های متن
    const out = [];
    for (const m of TEXT_CANDIDATES) {
      const t0 = Date.now();
      try {
        const r = await env.AI.run(m, { messages: [{ role: 'user', content: 'بگو سلام به فارسی' }], max_tokens: 40 });
        out.push({ model: m, ok: true, ms: Date.now() - t0, out: textOf(r).slice(0, 80) });
      } catch (e) { out.push({ model: m, ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 120) }); }
    }
    return Response.json({ hasAI: !!env.AI, text: out });
  }
};
