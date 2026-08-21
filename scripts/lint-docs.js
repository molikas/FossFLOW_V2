#!/usr/bin/env node
/**
 * Docs governance lint.
 *
 * Every defect the 2026-07-15 ADR-vs-code conformance audit actually found was
 * *metadata about* a decision -- a Status header, a supersession field, a
 * currency line -- never a wrong decision. Decision text has a feedback loop
 * (agents read it next to the code and mismatches surface); the fields below
 * have none, so drift concentrates here. That makes them worth linting and the
 * prose worth leaving alone.
 *
 * The audit cost three multi-agent runs and refuted 35% of its own gated
 * findings. These checks are the durable half of its yield, for free, in CI.
 *
 * Checks 7-10 are the same class one tier up: counts, index rows and currency
 * stamps that a doc restates by hand about the corpus around it. Every prose
 * reminder guarding those ("if you add one, keep this line honest", "bump the
 * date above in the same commit") has now failed at least twice, in the files
 * that mandate the discipline. A reminder with no oracle behind it is not a
 * control; these four are the oracle.
 *
 * Run: npm run lint:docs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ADR_DIR = path.join(ROOT, 'docs', 'adr');
const BASELINE_FILE = path.join(__dirname, 'docs-lint-baseline.json');
const errors = [];
const err = (file, msg) => errors.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), msg });

// Known-dead links, recorded on adoption so the lint starts green and ratchets
// down. It is the only baselined check: the link backlog was 51 entries deep on
// adoption, whereas every other violation here is a one-line fix in the doc that
// drifted, so it fails hard rather than joining a ratchet.
// `--update-baseline` rewrites this file.
const baselineRaw = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : { brokenLinks: [] };
const baseline = new Set((baselineRaw.brokenLinks || []).map((e) => (typeof e === 'string' ? e : e.link)));
const seenBaselined = new Set();

const adrFiles = fs
  .readdirSync(ADR_DIR)
  .filter((f) => /^\d{4}-.*\.md$/.test(f))
  .map((f) => path.join(ADR_DIR, f));

const field = (src, name) => {
  const m = src.match(new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};
const adrNum = (file) => path.basename(file).slice(0, 4);
// Only count explicit "ADR NNNN" references. Bare 4-digit numbers appear in
// prose (dates, commit counts) and would produce false edges.
const refs = (s) => [...s.matchAll(/ADR\s+(\d{4})/g)].map((m) => m[1]);

const supersedes = new Map(); // NNNN -> Set(targets it claims to supersede)
const supersededBy = new Map(); // NNNN -> Set(successors it names)

for (const file of adrFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const n = adrNum(file);

  // --- 1. Status enum -------------------------------------------------------
  // A trailing prose qualifier is idiomatic here ("Accepted (shipped 2026-06-14)")
  // and carries real information -- only the leading token is constrained.
  const status = field(src, 'Status');
  if (status === null) {
    err(file, 'missing **Status:** header');
  } else if (!/^(Proposed|Accepted|Superseded in part|Superseded)\b/.test(status)) {
    err(file, `Status must start with Proposed|Accepted|Superseded|Superseded in part -- got "${status.slice(0, 60)}"`);
  }

  // --- 2. The `none (...prose...)` trap ------------------------------------
  // ADR 0030 said "Supersedes: none (... supersedes the connector Style tab
  // decision in ADR 0004 ...)". A relationship written as prose after the word
  // "none" is invisible to check 3, so the other side never gets updated. This
  // was the mechanical cause of every one-way edge in the corpus.
  for (const f of ['Supersedes', 'Superseded by']) {
    const v = field(src, f);
    if (v && /^none\b/i.test(v) && /supersed/i.test(v.replace(/^none/i, ''))) {
      err(file, `**${f}:** says "none" but its prose describes a supersession. Put the edge in the field (see feature.md, "Partial supersession").`);
    }
  }

  // --- 3. Build the supersession graph -------------------------------------
  const sup = field(src, 'Supersedes');
  const supBy = field(src, 'Superseded by');
  supersedes.set(n, new Set(sup && !/^none\b/i.test(sup) ? refs(sup) : []));
  supersededBy.set(n, new Set(supBy && !/^none\b/i.test(supBy) ? refs(supBy) : []));

  // --- 5. ADR-tier link integrity ------------------------------------------
  // Scoped to docs/adr/ deliberately -- the governance tier. The wider docs
  // tree carries ~124 pre-existing dead links (mostly citations to correctly-
  // retired tacticals inside frozen reviews); baselining those is separate work.
  //
  // This starts from a baseline rather than zero: the ADR tier had 51 dead
  // links on adoption. See docs-lint-baseline.json -- it is the backlog, and
  // it should only ever shrink.
  for (const m of src.matchAll(/\]\(([^)]+)\)/g)) {
    const link = m[1].split('#')[0].trim();
    const frag = m[1].includes('#') ? m[1].slice(m[1].indexOf('#') + 1).trim() : '';
    if (!link || /^(https?:|mailto:)/.test(link)) continue;

    // --- 6. No line-number anchors on repo-relative links --------------------
    // `file.ts#L348` drifts on every edit above line 348, can't be machine-
    // verified ("is 348 still right?"), and adds nothing over a symbol name.
    // ~40 PLAUSIBLE rows in the conformance register were exactly this churn.
    // Convention: cite `file.ts` + a `symbolName`, which is grep-stable and
    // human-meaningful. A genuinely-historical citation belongs on a commit-SHA
    // permalink (external https:, exempted above), not a moving branch link.
    if (/^L\d+(-L?\d+)?$/.test(frag)) {
      err(file, `line-number anchor "#${frag}" on ${link} -- drop it and name the symbol instead (line anchors drift; only external commit-SHA permalinks may pin lines)`);
    }

    if (link.includes('NNNN') || link.includes('<')) continue; // template placeholders
    if (!fs.existsSync(path.resolve(path.dirname(file), link))) {
      const key = `${path.relative(ROOT, file).split(path.sep).join('/')} -> ${link}`;
      if (baseline.has(key)) seenBaselined.add(key);
      else err(file, `broken link -> ${link}`);
    }
  }
}

// --- 3 (cont). Reciprocity ---------------------------------------------------
// "A supersedes B" and "B superseded by A" must both be recorded. One-way edges
// are how a reader lands on a retired decision with nothing telling them so.
for (const [n, targets] of supersedes) {
  for (const t of targets) {
    if (!supersededBy.has(t)) {
      err(path.join(ADR_DIR, `${n}-*.md`), `claims to supersede ADR ${t}, which does not exist`);
    } else if (!supersededBy.get(t).has(n)) {
      err(path.join(ADR_DIR, `${n}-*.md`), `supersedes ADR ${t}, but ADR ${t}'s **Superseded by:** does not name ${n} (one-way edge)`);
    }
  }
}
for (const [n, successors] of supersededBy) {
  for (const s of successors) {
    if (!supersedes.has(s)) {
      err(path.join(ADR_DIR, `${n}-*.md`), `names ADR ${s} as successor, which does not exist`);
    } else if (!supersedes.get(s).has(n)) {
      err(path.join(ADR_DIR, `${n}-*.md`), `is superseded by ADR ${s}, but ADR ${s}'s **Supersedes:** does not name ${n} (one-way edge)`);
    }
  }
}

// --- 4. Released-version claims vs package.json ------------------------------
// The 2026-07-15 sweep *authored* "the released line is v3.6.0" the day AFTER
// v3.7.0 shipped, in the index every session is told to read first. semantic-release
// bumps package.json on every release, so it is the cheapest available oracle --
// and unlike `git tag`, it needs no fetch in CI.
const released = require(path.join(ROOT, 'package.json')).version;
const CURRENCY_DOCS = ['docs/README.md', 'docs/guidelines/architecture.md', 'docs/features.md', 'PLAN.md'];
for (const rel of CURRENCY_DOCS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/released line is\s+\**v?(\d+\.\d+\.\d+)\**/gi)) {
    if (m[1] !== released) {
      err(file, `claims the released line is v${m[1]}, but package.json says v${released}`);
    }
  }
}

// --- corpus indexes: shared setup for checks 7-9 -----------------------------
// Same class as check 4 and the same reason: a number or a list restated by hand
// in a doc has no feedback loop, so it drifts silently. The three checks below
// are scoped to the living reference surface -- a count inside docs/reviews/ is
// frozen on purpose, and docs/tactical/ prose says things like "restated in 4
// ADRs", which is a pattern count, not a corpus size.
const GUIDELINES_DIR = path.join(ROOT, 'docs', 'guidelines');
const guidelineFiles = fs.existsSync(GUIDELINES_DIR)
  ? fs.readdirSync(GUIDELINES_DIR).filter((f) => f.endsWith('.md')).sort()
  : [];
const LIVING_DOCS = [...new Set([...CURRENCY_DOCS, 'docs/workflow.md', ...guidelineFiles.map((f) => `docs/guidelines/${f}`)])];

const README = path.join(ROOT, 'docs', 'README.md');
const WORKFLOW = path.join(ROOT, 'docs', 'workflow.md');
const readmeSrc = fs.existsSync(README) ? fs.readFileSync(README, 'utf8') : null;

// --- 7. "N ADRs" count claims vs docs/adr/ -----------------------------------
// docs/README.md said "41 ADRs" while the directory held 45, in a sentence whose
// own parenthetical narrates having already been stale once at 35 rows. An
// honour-system count that has failed twice is a count that wants an oracle, and
// adrFiles is already one.
for (const rel of LIVING_DOCS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/(\d+)\s+ADRs\b/g)) {
    if (Number(m[1]) !== adrFiles.length) {
      err(file, `says "${m[1]} ADRs" -- docs/adr/ holds ${adrFiles.length}. Better than correcting the number: point at \`ls docs/adr/\` and stop restating a count.`);
    }
  }
}

// --- 8. Every ADR has a row in the docs/README.md index ----------------------
// The stale count above was the symptom; the defect was four ADRs (0044-0047)
// that never got a row. Both target models read an index as exhaustive and will
// not `ls` to check a table that presents itself as the map.
if (readmeSrc) {
  const rows = new Set([...readmeSrc.matchAll(/^\|\s*\[(\d{4})\]/gm)].map((m) => m[1]));
  const nums = new Set(adrFiles.map(adrNum));
  for (const n of [...nums].sort()) {
    if (!rows.has(n)) err(README, `ADR ${n} has no row in the ADR index table`);
  }
  for (const n of [...rows].sort()) {
    if (!nums.has(n)) err(README, `ADR index table has a row for ADR ${n}, which is not in docs/adr/`);
  }
}

// --- 9. Every guideline is named in both indexes -----------------------------
// workflow.md's doc-map row named five of the six files in docs/guidelines/ for
// a month. The omission was canvas-interaction.md -- the canvas input contract --
// in the row /feature points a session at on every run. Checked against both
// indexes, because either one alone reads as the whole map.
const docMapRow = fs.existsSync(WORKFLOW)
  ? fs.readFileSync(WORKFLOW, 'utf8').split('\n').find((l) => l.startsWith('|') && l.includes('](guidelines/)'))
  : null;
if (fs.existsSync(WORKFLOW) && !docMapRow) {
  err(WORKFLOW, 'the doc-map row for docs/guidelines/ is gone -- check 9 has nothing to compare against');
}
const readmeGuidelineRows = new Set(
  readmeSrc ? [...readmeSrc.matchAll(/^\|\s*\[[^\]]*\]\(guidelines\/([^)#]+)\)/gm)].map((m) => m[1]) : []
);
for (const base of guidelineFiles) {
  const stem = base.replace(/\.md$/, '');
  // Word-boundary-ish so `canvas-interaction` is not satisfied by a longer name
  // containing it, and so the row can name the files however it likes.
  if (docMapRow && !new RegExp(`(^|[^a-z0-9-])${stem}([^a-z0-9-]|$)`).test(docMapRow)) {
    err(WORKFLOW, `docs/guidelines/${base} is missing from the doc-map row (\`ls docs/guidelines/\` is the authority)`);
  }
  if (readmeSrc && !readmeGuidelineRows.has(base)) {
    err(README, `docs/guidelines/${base} has no row in the guidelines table`);
  }
}

// --- 10. Stale `**Last updated:**` stamps ------------------------------------
// Three of these files carry a prose reminder to bump the stamp in the same
// commit, two of them narrating the drift that motivated it -- and workflow.md,
// which calls itself Authoritative and mandates pointer hygiene, still went 26
// days stale. Three reminders, three drifts; this is the enforce-in-code half.
// A day of slack, so a same-day follow-up commit isn't a failure.
//
// Degrades to a skip, never a crash: a fresh clone, a shallow CI checkout or a
// not-yet-committed file has no date to compare against, and a lint that fails
// on missing history is a lint people turn off. Skips are reported, not silent.
const STAMPED_DOCS = [
  'docs/workflow.md',
  'docs/guidelines/architecture.md',
  'docs/guidelines/ux-principles.md',
  'docs/guidelines/testing.md',
  'docs/guidelines/canvas-interaction.md',
  'docs/guidelines/perf-troubleshooting.md',
];
const lastCommitDate = (rel) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%ad', '--date=short', '--', rel], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return ''; // no git binary, or no repo -- treat as "cannot answer"
  }
};
const stampSkips = [];
for (const rel of STAMPED_DOCS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const stamp = fs.readFileSync(file, 'utf8').match(/\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  if (!stamp) {
    err(file, 'no **Last updated:** date in the header -- this is a living reference and its currency is load-bearing');
    continue;
  }
  const committed = lastCommitDate(rel);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(committed)) {
    stampSkips.push(rel);
    continue;
  }
  const daysBehind = (Date.parse(committed) - Date.parse(stamp[1])) / 86400000;
  if (daysBehind > 1) {
    err(file, `**Last updated:** ${stamp[1]}, but its last commit is ${committed} (${Math.round(daysBehind)} days later) -- bump the stamp in the commit that changes the file`);
  }
}

// --- baseline bookkeeping ----------------------------------------------------
// A baselined link that now resolves is progress -- surface it so the entry gets
// removed and the ratchet actually tightens. Not a failure: it would fire on an
// unrelated PR that happened to restore a file.
const fixed = [...baseline].filter((k) => !seenBaselined.has(k));

// --- report ------------------------------------------------------------------
if (errors.length === 0) {
  console.log(`docs lint: OK (${adrFiles.length} ADRs, released line v${released})`);
  if (baseline.size) {
    console.log(`  ${seenBaselined.size} known-dead link(s) still baselined -- see ${path.relative(ROOT, BASELINE_FILE).split(path.sep).join('/')}`);
  }
  if (stampSkips.length) {
    console.log(`  ${stampSkips.length} stamp check(s) skipped -- no commit date for: ${stampSkips.join(', ')}`);
  }
  if (fixed.length) {
    console.log(`  ${fixed.length} baselined link(s) now resolve -- drop them from the baseline:`);
    fixed.forEach((k) => console.log(`    - ${k}`));
  }
  process.exit(0);
}
console.error(`docs lint: ${errors.length} problem(s)\n`);
const byFile = new Map();
for (const e of errors) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e.msg);
}
for (const [f, msgs] of byFile) {
  console.error(`  ${f}`);
  for (const m of msgs) console.error(`    - ${m}`);
}
if (stampSkips.length) {
  console.error(`
  ${stampSkips.length} stamp check(s) skipped -- no commit date for: ${stampSkips.join(', ')}`);
}
console.error('');
process.exit(1);
