#!/usr/bin/env node
/* رانر تست‌های رِسا — بدون هیچ وابستگی بیرونی.
   هر تست، ورکر را با ماسک تلگرام و KV جعلی اجرا می‌کند و رفتار واقعی روت‌ها را
   می‌سنجد. مسیر فایل ورکر به‌عنوان آرگومان به تست داده می‌شود.
   Usage:  node tests/run.mjs [path/to/worker.js]                                  */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workerArg = process.argv[2] || path.join(here, '..', 'worker', 'index.js');
const worker = path.resolve(workerArg);

if (!fs.existsSync(worker)) {
  console.error('✖ worker file not found:', worker);
  process.exit(1);
}

const suite = fs.readdirSync(here)
  .filter((f) => f.endsWith('_test.mjs'))
  .sort();

console.log(`— تست‌های رِسا — ${suite.length} مجموعه · ورکر: ${path.relative(process.cwd(), worker)}\n`);

let failed = 0;
const rows = [];
for (const file of suite) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(here, file), worker], { encoding: 'utf8', timeout: 120000 });
  const out = `${run.stdout || ''}${run.stderr || ''}`.trim();
  const summary = (out.match(/^\s*\d+ passed, \d+ failed.*$/m) || out.split('\n').slice(-1))[0] || '';
  const ok = run.status === 0;
  if (!ok) failed += 1;
  rows.push({ file, ok, ms: Date.now() - started, summary: summary.trim().slice(0, 90) });
  console.log(`${ok ? '✅' : '❌'} ${file.padEnd(26)} ${String(Date.now() - started).padStart(6)}ms  ${summary.trim()}`);
  if (!ok) {
    console.log('   ── خروجی تست ──');
    console.log(out.split('\n').filter((l) => /❌|Error|error:/.test(l)).slice(0, 8).map((l) => '   ' + l).join('\n'));
  }
}

const passed = rows.length - failed;
console.log(`\n${passed}/${rows.length} مجموعه سبز ${failed ? '❌' : '✅'}`);
process.exit(failed ? 1 : 0);
