#!/usr/bin/env node
/**
 * Bundle-size budget gate for the editor SPA (packages/axoview-app).
 *
 * Measures the BOOT-CRITICAL set: every `<script src>` in `build/app.html` that
 * is not `async`. Today they are all `defer`, which means they do NOT block HTML
 * parsing or first paint — but app.html is an empty SPA shell with a boot
 * splash, so nothing useful exists until this set has downloaded, parsed and
 * executed. This is time-to-interactive, not first-paint, and for this app they
 * amount to the same wait.
 *
 * Async chunks pulled in later by `import()` — the AWS/GCP/Azure/K8s icon packs,
 * for instance — are deliberately NOT counted; they are lazy-loading working as
 * designed, and charging them here would punish the correct pattern.
 *
 * The 2026-07-29 review added this because /audit Phase 4 stated thresholds in
 * prose ("flag any chunk >1MB uncompressed") and then only PRINTED sizes. A
 * 9.24 MB chunk sailed past it for months. Stating a threshold is not enforcing
 * one.
 *
 * Budgets are a RATCHET pinned near measured reality (scripts/bundle-budget.json)
 * — they exist to stop silent growth, not to certify the current size as good.
 * The current numbers are BAD; see docs/reviews/technical-review-2026-07-29.md §3.
 *
 * Exit 0 = pass. Exit 1 = over budget. Exit 2 = the gate itself is broken.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const APP = path.resolve(__dirname, '..', 'packages', 'axoview-app');
const BUILD = path.join(APP, 'build');
const SHELL = path.join(BUILD, 'app.html');
const BUDGET_PATH = path.join(__dirname, 'bundle-budget.json');

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

if (!fs.existsSync(SHELL)) {
  die(
    2,
    `check-bundle-budget: ${path.relative(process.cwd(), SHELL)} not found.\n` +
      'Run `npm run build:app` first (CI does this before invoking the gate).'
  );
}

const budget = JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));
const html = fs.readFileSync(SHELL, 'utf8');

// Boot-critical = a <script src> that is not `async`. `defer` still counts:
// it reorders execution, it does not remove the bytes from the boot path.
const blocking = [];
for (const tag of html.match(/<script\b[^>]*>/gi) || []) {
  const src = (tag.match(/\bsrc="([^"]+)"/i) || [])[1];
  if (!src) continue;
  if (/\basync\b/i.test(tag)) continue;
  blocking.push(src);
}

if (!blocking.length) {
  die(
    2,
    'check-bundle-budget: parsed 0 boot-critical <script src> tags out of app.html.\n' +
      'That is far more likely to be a parser/build-output change than a genuine\n' +
      'zero — refusing to report a green over an empty measurement.'
  );
}

let totalGzip = 0;
const rows = [];
const overSized = [];

for (const src of blocking) {
  const rel = src.replace(/^\//, '');
  const file = path.join(BUILD, rel);
  if (!fs.existsSync(file)) {
    die(2, `check-bundle-budget: app.html references a missing asset: ${rel}`);
  }
  const buf = fs.readFileSync(file);
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  totalGzip += gz;
  rows.push({ rel, raw: buf.length, gz });
  if (gz > budget.maxChunkGzipBytes) overSized.push({ rel, gz });
}

rows.sort((a, b) => b.gz - a.gz);
console.log('check-bundle-budget: boot-critical scripts in build/app.html');
for (const r of rows) {
  console.log(`  ${kb(r.gz).padStart(9)} gzip  ${kb(r.raw).padStart(10)} raw   ${r.rel}`);
}
console.log(
  `  ${'—'.repeat(40)}\n  ${kb(totalGzip).padStart(9)} gzip TOTAL ` +
    `(budget ${kb(budget.maxTotalBlockingGzipBytes)})`
);

const failures = [];
if (totalGzip > budget.maxTotalBlockingGzipBytes) {
  failures.push(
    `  TOTAL over budget: ${kb(totalGzip)} gzip > ${kb(budget.maxTotalBlockingGzipBytes)}.\n` +
      '  This is what a user waits for before the editor renders. Prefer moving\n' +
      '  code behind `import()` over raising the budget.'
  );
}
for (const o of overSized) {
  failures.push(
    `  CHUNK over budget: ${o.rel} is ${kb(o.gz)} gzip > ${kb(budget.maxChunkGzipBytes)}.`
  );
}

if (failures.length) {
  die(1, `\ncheck-bundle-budget FAILED\n\n${failures.join('\n\n')}\n`);
}

const slack = budget.maxTotalBlockingGzipBytes - totalGzip;
if (slack > budget.ratchetSlackBytes) {
  console.log(
    `check-bundle-budget: ${kb(slack)} under budget — ratchet it down in\n` +
      '  scripts/bundle-budget.json so the win cannot silently erode.'
  );
}
console.log('check-bundle-budget: OK');
