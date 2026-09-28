/* رِسا mini app glue for rich-post-bot — additive only; original Post Studio routes untouched.
 * Serves the app shell + brand assets from RASA_KV and routes the rasa JSON API.
 * Collision-safe: every rasa route is a path the original worker never answers. */
import { handleMiniAppApi } from './miniapp.js';

const RASA_API = [
  /^\/api\/session$/,
  /^\/api\/context$/,
  /^\/api\/render$/,
  /^\/api\/publish$/,
  /^\/api\/emoji\/(all|img)$/,
  /^\/api\/draft\//,      // ours: draft/save|load|delete — original uses bare /api/draft
  /^\/api\/template\//,   // ours only
  /^\/api\/channel\//     // ours: channel/add|remove|check — original uses bare /api/channel
];
const RASA_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-rasa-token',
  'access-control-max-age': '86400'
};

const ASSET_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8'
};

/** env shadow so the rasa module sees env.STORE === env.RASA_KV without mutating real env. */
const rasaEnv = (env) => Object.assign(Object.create(Object.getPrototypeOf(env) || Object.prototype), env, { STORE: env.RASA_KV });

/** @returns {Promise<Response|null>} Response when the glue owns the route, else null → original code proceeds. */
export async function tryRasaApp(request, env, ctx, url) {
  const path = url.pathname;
  const isApi = RASA_API.some((re) => re.test(path));

  if (isApi && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: RASA_CORS });

  if (request.method === 'GET' && path === '/app') {
    const data = await env.RASA_KV?.get('asset:app.html', 'arrayBuffer');
    if (!data) return new Response('mini app asset missing — upload asset:app.html', { status: 503 });
    return new Response(data, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
  }

  if (request.method === 'GET' && path.startsWith('/assets/')) {
    const name = path.slice('/assets/'.length).replace(/[^a-z0-9._/-]/gi, '');
    const data = await env.RASA_KV?.get(`asset:${name}`, 'arrayBuffer');
    if (!data) return new Response('not found', { status: 404 });
    const ext = name.slice(name.lastIndexOf('.'));
    return new Response(data, {
      headers: { 'content-type': ASSET_TYPES[ext] || 'application/octet-stream', 'cache-control': 'public, max-age=86400, immutable' }
    });
  }

  if (isApi) {
    const resp = await handleMiniAppApi(request, rasaEnv(env), url);
    const headers = new Headers(resp.headers);
    for (const [k, v] of Object.entries(RASA_CORS)) if (!headers.has(k)) headers.set(k, v);
    return new Response(resp.body, { status: resp.status, headers });
  }
  return null;
}
