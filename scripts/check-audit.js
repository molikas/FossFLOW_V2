#!/usr/bin/env node
/**
 * Dependency-advisory gate.
 *
 * `npm audit` on its own is not a gate — it always exits non-zero while any
 * known-and-accepted advisory is open, so teams stop running it. This turns it
 * into a tripwire: every advisory must be either FIXED or explicitly accepted in
 * scripts/audit-allowlist.json with a written reason. CI then goes red only on
 * something NEW, which is the signal worth interrupting a human for.
 *
 * Added by the 2026-07-29 review, which found 12 advisories, verified each
 * against real usage, and concluded none were exploitable — a conclusion that
 * previously lived only in a markdown file and enforced nothing.
 *
 * Exit 0 = pass. Exit 1 = an unreviewed advisory. Exit 2 = the gate is broken.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ALLOWLIST_PATH = path.join(__dirname, 'audit-allowlist.json');
const ROOT = path.resolve(__dirname, '..');

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

let raw;
try {
  // npm audit exits non-zero whenever anything is found; that is expected here,
  // so read stdout regardless and let JSON.parse be the real validity check.
  // A single fixed command string, not (command, args[]): `npm` is `npm.cmd` on
  // Windows and cannot be spawned without a shell, while passing an args ARRAY
  // through a shell is what DEP0190 deprecates. Nothing here is interpolated, so
  // there is no quoting or injection surface.
  raw = execSync('npm audit --json --workspaces', {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  });
} catch (err) {
  raw = (err && err.stdout) || '';
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  die(2, 'check-audit: could not parse `npm audit --json` output. Is the lockfile intact?');
}
if (!report || typeof report.vulnerabilities !== 'object') {
  die(2, 'check-audit: unexpected `npm audit --json` shape — refusing to report a green.');
}

const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
const allowById = new Map(allowlist.allow.map((a) => [a.id, a]));

// Collect concrete advisories. `via` entries that are plain strings are just
// pointers to a parent package and carry no advisory of their own — the parent's
// entry already covers them.
const found = new Map();
for (const [pkg, v] of Object.entries(report.vulnerabilities)) {
  for (const via of v.via || []) {
    if (typeof via === 'string' || !via.url) continue;
    const id = via.url.split('/').pop();
    if (!found.has(id)) {
      found.set(id, { id, packages: new Set(), title: via.title, severity: via.severity });
    }
    found.get(id).packages.add(pkg);
  }
}

const unreviewed = [];
for (const adv of found.values()) {
  if (!allowById.has(adv.id)) unreviewed.push(adv);
}
const stale = allowlist.allow.filter((a) => !found.has(a.id));

const today = new Date().toISOString().slice(0, 10);
const overdue = allowlist.allow.filter((a) => found.has(a.id) && a.reviewBy && a.reviewBy < today);

console.log(
  `check-audit: ${found.size} advisor${found.size === 1 ? 'y' : 'ies'} present, ` +
    `${allowlist.allow.length} allowlisted, ${unreviewed.length} unreviewed`
);

if (stale.length) {
  console.log(
    '\ncheck-audit: allowlist entries that no longer match any advisory —\n' +
      'these are FIXED; delete them so the list keeps meaning something:'
  );
  for (const s of stale) console.log(`  - ${s.id} (${s.package}) — ${s.title}`);
}

if (overdue.length) {
  console.log('\ncheck-audit: WARNING — accepted risks past their reviewBy date:');
  for (const o of overdue) {
    console.log(`  - ${o.id} (${o.package}) accepted ${o.acceptedOn}, review was due ${o.reviewBy}`);
    console.log(`      tripwire: ${o.tripwire}`);
  }
  console.log('  Re-verify these against current usage and re-date, or fix them.');
}

if (unreviewed.length) {
  const lines = unreviewed
    .map(
      (a) =>
        `  - ${a.id}  [${a.severity || 'unknown'}]  ${a.title || ''}\n` +
        `      packages: ${[...a.packages].join(', ')}\n` +
        `      https://github.com/advisories/${a.id}`
    )
    .join('\n');
  die(
    1,
    `\ncheck-audit FAILED — ${unreviewed.length} advisory(ies) not fixed and not reviewed:\n\n${lines}\n\n` +
      'Either upgrade to clear it, or — if it genuinely cannot bite this codebase —\n' +
      'add an entry to scripts/audit-allowlist.json stating WHY (verified against\n' +
      'actual usage, not the advisory text) and what the tripwire is.\n'
  );
}

console.log('check-audit: OK');
