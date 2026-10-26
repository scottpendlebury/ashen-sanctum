#!/usr/bin/env node
// Resource-budget check: repo size (git-tracked) and production build size.
// Fails (exit 1) when thresholds are exceeded.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MB = 1024 * 1024;
const LIMITS = { repoTrackedMB: 100, buildMB: 50, initialMB: 10 };

function du(dir, filter = null) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const st = fs.statSync(p);
        if (!filter || filter(p, st.size)) total += st.size;
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return total;
}

let tracked = 0;
try {
  const out = execSync('git ls-files -z', { cwd: process.cwd() });
  for (const f of out.toString().split('\0')) {
    if (!f) continue;
    try { tracked += fs.statSync(f).size; } catch { /* deleted */ }
  }
} catch { console.warn('warning: not a git repo (or git missing); skipping tracked size'); }

const build = du('dist');
// initial download: index.html + JS chunks + css (everything in dist/assets)
const assets = du('dist/assets');

console.log(`Git-tracked source size : ${(tracked / MB).toFixed(2)} MB (limit ${LIMITS.repoTrackedMB} MB)`);
console.log(`Production build (dist) : ${(build / MB).toFixed(2)} MB (limit ${LIMITS.buildMB} MB)`);
console.log(`Initial download bundle : ${(assets / MB).toFixed(2)} MB (limit ${LIMITS.initialMB} MB)`);

let fail = false;
if (tracked > LIMITS.repoTrackedMB * MB) { console.error(`FAIL: repo size exceeds ${LIMITS.repoTrackedMB} MB`); fail = true; }
if (build > LIMITS.buildMB * MB) { console.error(`FAIL: build size exceeds ${LIMITS.buildMB} MB`); fail = true; }
if (assets > LIMITS.initialMB * MB) { console.error(`FAIL: initial download exceeds ${LIMITS.initialMB} MB`); fail = true; }
if (fs.existsSync('node_modules') && tracked > 0) {
  const nm = execSync('git check-ignore node_modules && echo yes || echo no').toString().trim();
  if (nm !== 'yes') { console.error('FAIL: node_modules is not gitignored'); fail = true; }
}
if (fail) process.exit(1);
console.log('OK: all size budgets met.');
