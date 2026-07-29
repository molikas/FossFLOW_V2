#!/usr/bin/env node
/**
 * Circular-dependency gate for packages/axoview-lib.
 *
 * Two assertions, and the first one matters more than the second:
 *
 *   1. DENOMINATOR — the module graph must contain at least `minFilesProcessed`
 *      files. This is the guard the 2026-07-29 review added after finding that
 *      the previous invocation had been reporting "no cycles" over 16 of 293
 *      files for months (missing --ts-config → the `src/…` path alias does not
 *      resolve → most of the graph silently vanishes). Without this check the
 *      gate is structurally incapable of failing.
 *
 *   2. RATCHET — the cycle count must not exceed the recorded baseline. Same
 *      idiom as jest.config.js coverageThreshold: pinned at measured reality so
 *      it can only improve.
 *
 * Exit 0 = pass. Exit 1 = regression. Exit 2 = the gate itself is broken.
 */

const path = require('path');
const fs = require('fs');

const LIB = path.resolve(__dirname, '..', 'packages', 'axoview-lib');
const ENTRY = path.join(LIB, 'src', 'index.ts');
const TSCONFIG = path.join(LIB, 'tsconfig.json');
const BASELINE_PATH = path.join(__dirname, 'cycles-baseline.json');

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

let madge;
try {
  madge = require('madge');
} catch {
  die(
    2,
    'check-cycles: `madge` is not installed. It is a pinned devDependency —\n' +
      'run `npm ci` at the repo root. (Do NOT fall back to `npx madge`: an\n' +
      'ad-hoc fetch is unpinned and offline-fragile in CI.)'
  );
}

if (!fs.existsSync(ENTRY)) die(2, `check-cycles: entry not found: ${ENTRY}`);
if (!fs.existsSync(TSCONFIG)) die(2, `check-cycles: tsconfig not found: ${TSCONFIG}`);

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

madge(ENTRY, {
  fileExtensions: ['ts', 'tsx'],
  tsConfig: TSCONFIG,
  detectiveOptions: { ts: { skipTypeImports: false } }
})
  .then((res) => {
    const filesProcessed = Object.keys(res.obj()).length;
    const cycles = res.circular();

    console.log(
      `check-cycles: ${filesProcessed} files, ${cycles.length} circular ` +
        `dependencies (baseline: >=${baseline.minFilesProcessed} files, ` +
        `<=${baseline.maxCycles} cycles)`
    );

    const failures = [];

    if (filesProcessed < baseline.minFilesProcessed) {
      failures.push(
        `  RESOLUTION REGRESSION: only ${filesProcessed} files entered the graph,\n` +
          `  below the floor of ${baseline.minFilesProcessed}. This almost always means module\n` +
          `  resolution broke (a moved tsconfig, a changed path alias, a madge\n` +
          `  upgrade) — NOT that the codebase shrank. The cycle count below is\n` +
          `  therefore meaningless. Fix resolution before trusting any green here.`
      );
    }

    if (cycles.length > baseline.maxCycles) {
      const preview = cycles
        .slice(0, 10)
        .map((c, i) => `    ${i + 1}) ${c.join(' > ')}`)
        .join('\n');
      failures.push(
        `  NEW CYCLES: ${cycles.length} > baseline ${baseline.maxCycles}.\n` +
          `  Break the cycle rather than raising the baseline. If the new edge is\n` +
          `  type-only, make it explicit with \`import type\` — that erases it at\n` +
          `  compile time and drops it from this graph.\n` +
          `  First ${Math.min(10, cycles.length)}:\n${preview}`
      );
    }

    if (failures.length) {
      die(1, `\ncheck-cycles FAILED\n\n${failures.join('\n\n')}\n`);
    }

    if (cycles.length < baseline.maxCycles) {
      console.log(
        `check-cycles: cycles are BELOW baseline (${cycles.length} < ${baseline.maxCycles}).\n` +
          `  Ratchet it down — set "maxCycles": ${cycles.length} in scripts/cycles-baseline.json\n` +
          `  so the improvement cannot silently regress.`
      );
    }
    console.log('check-cycles: OK');
  })
  .catch((err) => die(2, `check-cycles: madge failed to build the graph: ${err && err.message}`));
