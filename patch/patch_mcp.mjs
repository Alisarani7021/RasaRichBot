#!/usr/bin/env node
/* b42 — دریچهٔ MCP: /api/mcp/<MCP_SECRET> روی ورکر (Streamable HTTP)
   برای اتصال مستقیم Gemini (Custom Connected App) / Claude / Cursor.
   Usage: node patch_mcp.mjs <bundle.mjs>                                       */
import fs from 'node:fs';

const target = process.argv[2] || 'cf/sim/bundle_v27.mjs';
let src = fs.readFileSync(target, 'utf8');
const snip = fs.readFileSync(new URL('./snippets/mcp_server.js', import.meta.url), 'utf8');

const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('mcpHandle') === 0, 'already patched');
must(count('maybeCommander') >= 1, 'فرمانده اول باید نصب شود (cmdTool لازم است)');
must(count('async function applyLiveTick(env, job) {') === 1, 'applyLiveTick anchor not found');

/* ── ۱) موتور MCP ─────────────────────────────────────────────────────── */
src = src.replace('\nasync function applyLiveTick(env, job) {', '\n' + snip.trimEnd() + '\n\nasync function applyLiveTick(env, job) {');

/* ── ۲) مسیر /api/mcp قبل از روت‌های مینی‌اپ ──────────────────────────── */
const ANCHOR = `    if (url.pathname.startsWith("/api/")) {`;
must(count(ANCHOR) === 1, '/api/ anchor not found');
src = src.replace(ANCHOR, `    if (url.pathname === "/api/mcp" || url.pathname.startsWith("/api/mcp/")) {
      try {
        return await mcpHandle(env, request, url);
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }
` + ANCHOR);

fs.writeFileSync(target, src);
console.log('✅ patched: ' + target + ' (MCP server)');
