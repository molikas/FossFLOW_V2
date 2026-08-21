---
description: Static analysis, CI-gate, coverage, architecture, UX and perf-hot-path audit of the axoview monorepo, ending in a dated executive report written to docs/reviews/. Subject is the code and its gates, not the docs (that is /docs-sweep). Measures and reports; it does not work the fix backlog and does not run E2E tests.
---

# /audit — Quality & Architecture Audit

Run a comprehensive static analysis, coverage evaluation, security audit, and architecture review of the Axoview monorepo. Produces an executive-level report. Does NOT run E2E tests.

**Scope.** This command reports; it does not work the Recommendations backlog. The one exception is a *measurement* defect — a gate, grep or threshold in this file that reports something untrue. Fix that in the same session and say so in the report, because every downstream number inherits it (that is what the 2026-07-29 pass did with the madge and bundle gates). Product-code fixes wait for the user to pick from §10; the interpretation tables below say what the fix would be so the recommendation is actionable, not so you apply it.

**Measured scope.** Phase 1 lint covers `axoview-lib` and `axoview-app` — the two packages `eslint.config.mjs` declares. Phase 3 coverage covers `axoview-lib` only. `axoview-backend`, `axoview-worker` and `axoview-e2e` are not scanned here. Every grade in the report names the packages it was computed over: a monorepo letter grade derived from one package is the madge-denominator failure (Phase 5) in a different costume.

**Delegation.** The phase scans are independent, so parallelise them when a phase has a self-contained command set and enough output to be worth the round trip — that is the test (CLAUDE.md → Delegating), not a target number of agents. Ask each one for the raw command output, not a summary: the report's numbers have to trace back to a command, and a summarised phase has nothing left to cite. Do not split one phase across agents, and do not delegate Phase 6 — synthesis needs every output in one head.

> **UX consistency check:** when reviewing UI code, flag deviations from [`docs/guidelines/ux-principles.md`](../../docs/guidelines/ux-principles.md) — the Axoview design language. Inline `Typography` headers instead of `Section`, ALL CAPS labels, opacity-0 affordances, missing F2/Enter/Escape, etc. should appear in the audit report under "UX consistency."
>
> **Process consistency check:** when the audit task touches session cadence (skill alignment, milestone gates, post-rename pointer hygiene, naming consistency across surfaces), read [`docs/workflow.md`](../../docs/workflow.md) first. Deviations from its locked decision table or design principles belong in the audit report.

## Phase 1 — Static Code Analysis

Every command in this file runs from the repo root, and every phase fence re-anchors itself — the gate scripts (`check:audit`, `check:cycles`, `check:bundle`) live only in the root `package.json`, so from inside a workspace they resolve to nothing and npm reports a missing script, which reads like a skipped phase rather than a break. **A gate that produces no number is a break, not a zero:** report it as a Critical Finding against the audit itself. Select a package with `--workspace=`, never by `cd`-ing into it.

Capture the output of both:

```bash
cd "$(git rev-parse --show-toplevel)"

# ESLint only (separate from tsc to isolate rule violations)
npx eslint packages/axoview-lib/src packages/axoview-app/src --ext .ts,.tsx --format stylish 2>&1

# TypeScript strict type check (catches what ESLint misses) — lib + app
npm run lint --workspaces --if-present 2>&1
```

> **Prettier was removed from this phase on 2026-07-29.** It reported 156
> non-compliant files against the repo's own `.prettierrc`, had never been in CI,
> and nothing consumed the result — knip already listed `prettier` under
> `ignoreDependencies`, i.e. the repo had conceded it. A gate nobody acts on
> trains people to skim past red. ESLint covers what actually matters. If
> formatting is ever wanted back, sweep with `--write` and add it to CI in the
> same change — do not re-add a measurement with no consumer.

**Metrics to extract:**
- ESLint: total errors, total warnings, breakdown by rule (`no-explicit-any`, `no-unused-vars`, `exhaustive-deps`)
- TypeScript: total error count, which files, which categories (type mismatch vs missing props)
- Count `any` usages in production source: `grep -rn ": any" packages/axoview-lib/src packages/axoview-app/src --include="*.ts" --include="*.tsx" | grep -v ".test." | wc -l`
- Count suppressions: `grep -rn "@ts-ignore\|@ts-nocheck" packages/axoview-lib/src packages/axoview-app/src | wc -l`

## Phase 2 — Security & Dependency Audit

```bash
cd "$(git rev-parse --show-toplevel)"

# The GATE (also runs in CI): fails only on advisories that are neither fixed
# nor explicitly accepted in scripts/audit-allowlist.json.
npm run check:audit 2>&1

# The full picture, for the report's numbers.
npm audit --workspaces 2>&1
```

**Metrics to extract:**
- Vulnerability count by severity: critical / high / moderate / low
- Which packages, CVE IDs, and whether a fix is available
- Whether fix requires breaking changes

> **Verify exploitability against real usage — never report advisory text as a
> finding.** The 2026-07-29 review found 12 advisories and **zero** exploitable:
> each was killed by checking how the package is actually called (e.g. Quill's
> HTML-export XSS is real and Axoview *does* call the affected API, but every
> call site is wrapped in the ADR 0029 sanitize). Report the verification, and
> record accepted risks in `scripts/audit-allowlist.json` — not just in prose,
> which enforces nothing.

## Phase 3 — Test Coverage

```bash
cd "$(git rev-parse --show-toplevel)"
npm test --workspace=packages/axoview-lib -- --coverage 2>&1
```

> **No coverage table is a broken measurement, not a zero.** There is deliberately
> no `--passWithNoTests` here: a jest resolution that finds no tests would exit 0
> and leave this phase's entire output empty, which reads as a clean run. If the
> table does not appear, report it as a Critical Finding against the audit itself
> and fix it in the same session, before any coverage number goes in the report.

**Metrics to extract from the coverage table:**
- Overall: Statements / Branches / Functions / Lines % (target: ≥70%)
- Per-module breakdown — flag any module at 0% (completely untested)
- Critically flag: branch coverage on state management stores and core math utilities
- Cross-check: TypeScript errors in test files indicate stale tests that pass but test wrong schemas

## Phase 4 — Build Verification

```bash
cd "$(git rev-parse --show-toplevel)"

# Library build
npm run build --workspace=packages/axoview-lib 2>&1 | tail -20

# App build
npm run build --workspace=packages/axoview-app 2>&1 | tail -30

# The GATE (also runs in CI): asserts the editor's boot-critical JS against
# scripts/bundle-budget.json instead of merely printing sizes. It runs from the
# repo root and reads packages/axoview-app/build/app.html, so both builds above
# must finish first — with no build present it exits 2 (the gate is broken),
# which is not the same as a budget failure (exit 1).
npm run check:bundle 2>&1
```

**Metrics to extract:**
- Build success/failure and any warnings
- Library bundle: size in KB, output formats (CJS only = no tree-shaking for consumers)
- App chunks: the budget gate above enforces this — report its output, and say what changed
- Check for `"type": "module"` warnings (rslib perf overhead)

> **Why this is a script and not a prose threshold.** Until 2026-07-29 this phase
> said "flag any chunk >1MB uncompressed; flag main entry >500KB gzip" and then
> only *printed* sizes. A 9.24 MB / 1.43 MB-gzip chunk passed it for months
> because nothing asserted. If you add a threshold to this skill, add it to
> `scripts/` too — a threshold that lives only in prose is decoration.

## Phase 5 — Architecture Review

Explore and read the following, then assess each dimension:

```bash
cd "$(git rev-parse --show-toplevel)"

# File size inventory — God file detection
find packages/axoview-lib/src packages/axoview-app/src \
  -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -25

# Circular dependency check — the GATE (also runs in CI). Asserts the DENOMINATOR
# (>=280 files reached) before the cycle count, then ratchets the count against
# scripts/cycles-baseline.json.
#
# Do NOT hand-roll `npx madge --circular src/index.ts` here. Without --ts-config
# madge cannot resolve the `src/…` path alias: it silently walks 16 of 293 files
# and prints a truthful-but-worthless "✔ No circular dependency found!". That
# false green stood for months (2026-07-29 review, finding 1). The script exists
# so the denominator can never be silently wrong again.
npm run check:cycles 2>&1

# Memoization coverage
grep -rn "React.memo\|useMemo\|useCallback" packages/axoview-lib/src packages/axoview-app/src \
  --include="*.tsx" --include="*.ts" | grep -v ".test." | wc -l

# Store structure
ls packages/axoview-lib/src/stores/
ls packages/axoview-lib/src/hooks/
```

Also read:
- [`docs/guidelines/architecture.md`](../../docs/guidelines/architecture.md) (header + Section 1 inventory)
- `packages/axoview-lib/src/index.ts` — public API surface
- `packages/axoview-lib/src/standaloneExports.ts` — secondary exports
- `packages/axoview-lib/src/stores/sceneStore.tsx` — undo/redo architecture
- `packages/axoview-app/src/App.tsx` — app entry complexity

**Dimensions to assess (score each A–F):**

| Dimension | Key Questions |
|-----------|---------------|
| Modularity & Coupling | Circular deps? God files? Clean public API? Fan-in/fan-out? |
| Fragility & Ease of Change | How many files change per new feature? Are seams clean post-refactor? |
| Maintainability | Dead code? Config sprawl? Consistent patterns? |
| Vibe Coding / AI-Friendliness | Clear naming? Colocation? Type completeness? Formatting consistency? |
| State Architecture | Store count/split? Undo/redo soundness? Derived vs stored state? |
| Performance Architecture | Bundle formats? Lazy loading? Memoization? Large chunks? **Drag hot-path anti-patterns (Phase 5c)?** |

## Phase 5b — UX Guideline Compliance

Run grep checks against [`docs/guidelines/ux-principles.md`](../../docs/guidelines/ux-principles.md). Each finding is a deviation; report under "UX consistency" in the executive report.

```bash
# §1.5 — inline fontSize on Typography (drift; theme owns it). Scoped away from
# SVG text nodes, canvas labels and overlays — the theme does not own those, and
# an unscoped grep returns them by the hundred and pre-labels them all High.
grep -rn "fontSize:" packages/axoview-lib/src packages/axoview-app/src \
  --include="*.tsx" | grep -v "__tests__\|theme\.ts\|test\.tsx\|\.svg\|Canvas\|Overlay"

# §1.5 — inline fontWeight on Typography (drift outside content emphasis)
grep -rn "fontWeight={\|fontWeight: " packages/axoview-lib/src packages/axoview-app/src \
  --include="*.tsx" | grep -v "__tests__\|theme\.ts\|test\.tsx"

# §1.2 / §7.2 — manual textTransform: uppercase (use overline variant; sentence case)
grep -rn "textTransform: 'uppercase'\|textTransform=\"uppercase\"" \
  packages/axoview-lib/src packages/axoview-app/src --include="*.tsx" \
  --include="*.ts" | grep -v "__tests__\|theme\.ts"

# §1.2 / §7.2 — string literals that look ALL-CAPS in JSX/render
# (pattern: a single-word ALL-CAPS string passed as Typography children)
grep -rEn '>[A-Z]{4,}<' packages/axoview-lib/src packages/axoview-app/src \
  --include="*.tsx" | grep -v "__tests__\|test\.tsx"

# §1.3 — TextField with floating MUI label= prop (placeholder doing label's job)
grep -rEn '<TextField[^>]*\blabel=' packages/axoview-lib/src packages/axoview-app/src \
  --include="*.tsx" | grep -v "__tests__"

# §6.3 — console.error in user-facing paths (should also surface via setNotification)
grep -rn "console\.error" packages/axoview-lib/src packages/axoview-app/src \
  --include="*.ts" --include="*.tsx" | grep -v "__tests__\|test\.tsx"

# React/MUI gotcha — createPortal() returns a ReactPortal whose $$typeof is
# react.portal, not react.element. MUI's PropTypes.node check on Box / Stack /
# Typography rejects it in dev (`Invalid prop children supplied to
# ForwardRef(Box)`). Manually review each hit: if the call sits inside a MUI
# container's children, hoist it to a sibling.
grep -rn "createPortal" packages/axoview-lib/src packages/axoview-app/src \
  --include="*.tsx" | grep -v "__tests__\|test\.tsx"

# §6.4 — cold-start splash must exist in the EDITOR shell. 0 hits = regression.
#
# Path corrected 2026-07-29: this grepped `public/index.html`, which ADR 0040
# turned into the static MARKETING LANDING — a page that correctly has no app
# splash (and no scripts at all). The editor shell moved to `app-shell.html`, so
# the check reported a false High-severity regression on healthy code. Verify
# against the emitted build too, since the shell is a template.
grep -c 'id="ax-splash"' packages/axoview-app/app-shell.html
```

**How to interpret findings:**

| Pattern | Severity | Action |
|---|---|---|
| `fontSize` on a Typography sx | Medium — High if it overrides a variant that already fits | Replace with the appropriate variant. If no variant fits, propose adding to theme.ts. A `fontSize` on an SVG text node or a canvas label is not drift — the theme does not own those. |
| `fontWeight` on Typography sx | Medium | Allowed only for content emphasis (e.g. bolding a single value); never for headers/labels. |
| `textTransform: 'uppercase'` | High | Replace with `overline` variant (sentence case + tracked in our theme) or fix the source string. |
| `<TextField label="…">` | Medium | Replace with external `Section`/`caption` label + `placeholder=`. |
| ALL-CAPS literal in JSX | Medium | Convert to sentence case unless it's a vendor TLA (AWS/GCP/DNS) or a chip-style mode badge. |
| `console.error` without `setNotification` for user-triggered failure | Medium | Add a notification with severity:'error' summarising the issue. |
| `createPortal(...)` inside a MUI container's children | Medium | Dev-only warning; hoist the portal to be a sibling of the MUI container (it renders into its target node regardless of JSX position). The `UiOverlay` fix is the reference pattern — `git log -S createPortal -- packages/axoview-lib/src` to find it. |
| `id="ax-splash"` missing from `packages/axoview-app/app-shell.html` (count = 0) | High | Cold-start splash was removed — restore from UX §6.4. Without it the app shows a white screen during bundle parse + storage probes (~1–4 s). `public/index.html` is the marketing landing (ADR 0040) and correctly has no splash — a 0 there is not a finding. |

The audit report must include a **UX Consistency** subsection: count of findings per pattern, the per-file counts for each pattern (all of them — see Phase 6), and whether any high-severity violations exist (any high-severity violation downgrades the maintainability score by one letter grade).

## Phase 5c — Performance & Hot-Path Anti-Pattern Audit

Run grep checks against the anti-patterns codified in [`docs/guidelines/perf-troubleshooting.md`](../../docs/guidelines/perf-troubleshooting.md). Each finding is a potential regression or a candidate for future perf work; report under "Performance hot-path" in the executive report.

```bash
# A-1 — useScene() inside SceneLayers (drag-hot-path components should use
# useSceneActions or narrow useSceneStore selectors instead)
grep -rn "useScene()" packages/axoview-lib/src/components/SceneLayers \
  --include="*.tsx" | grep -v "__tests__\|test\.tsx"

# A-2 — nested immer produce() inside reducers (the cliff fuel)
# Flag any reducer file with > 1 produce() call (likely chain pattern)
for f in packages/axoview-lib/src/stores/reducers/*.ts; do
  c=$(grep -c "produce(" "$f")
  if [ "$c" -gt 1 ]; then echo "  $f: $c produce() calls"; fi
done

# A-3 — inline sx object literals on hot-path render functions
# Hard to catch generically; flag any SceneLayers component with > 5 sx={{ ... }}
grep -rcE "sx=\{\{" packages/axoview-lib/src/components/SceneLayers \
  --include="*.tsx" | grep -v ":0$\|test\.tsx" | awk -F: '$2 > 5 {print}'

# A-4 — multiple writers to scene.connectors[id] / view.items[].tile
# in the same module — race-prone. Manual review of any new such writer.
grep -rn "scene\.connectors\[\|previewConnectorPaths\|batchUpdateViewItemTiles" \
  packages/axoview-lib/src --include="*.ts" --include="*.tsx" | \
  grep -v "__tests__\|test\.tsx\|\.test\.\|hooks/useSceneActions"

# A-5 — flushSync usage (should be rare and justified)
grep -rn "flushSync" packages/axoview-lib/src \
  --include="*.ts" --include="*.tsx" | grep -v "__tests__"

# A-6 — stray console.log in production source. THIS is the High-severity one:
# console.log is debugging left behind.
grep -rn "console\.log" packages/axoview-lib/src packages/axoview-app/src \
  --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\.\|test\.tsx\|renderProbe\.ts\|DiagnosticsOverlay\.tsx"

# console.warn / console.debug — REVIEW ONLY, not a defect count. Most hits are
# deliberate diagnostics: the WebGL canvases' null-batch warnings (they exist to
# turn a silent blank canvas into a loud one), error boundaries, svgOptimizer
# fallbacks, invalid-data discards. Reporting those as "strip before commit"
# argues for deleting a fix on purpose.
# Read each hit; flag only ones that are debugging residue or that fire on a
# user-facing failure without a matching setNotification (UX §6.3).
grep -rn "console\.\(warn\|debug\)" packages/axoview-lib/src packages/axoview-app/src \
  --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\.\|test\.tsx\|renderProbe\.ts\|DiagnosticsOverlay\.tsx"
```

**How to interpret findings:**

| Pattern | Severity | Action |
|---|---|---|
| `useScene()` in `SceneLayers/` | High | Replace with `useSceneActions()` or narrow `useSceneStore(selector, ===)`. See A-1 in perf-troubleshooting. |
| Reducer file with multiple `produce()` calls | Medium | Likely a nested reducer chain. Acceptable for one-shot user actions; flag if called from a per-frame handler (drag mousemove, etc.). |
| `SceneLayers/` component with > 5 inline `sx={{ ... }}` | Medium | Hoist static sx to module-level constants; inline-style dynamic per-frame values. See A-3. |
| New writer to `scene.connectors[...].path` outside `useSceneActions` | High | Multiple writers WILL race within one frame. Collapse to one source of truth. See A-4. |
| `flushSync` outside `previewConnectorPaths` | High | Defeats React batching. Justify in a comment or remove. See A-5. |
| Stray `console.*` in production source | High | Strip before commit. See A-6. |

The audit report must include a **Performance hot-path** subsection: count of findings per pattern (A-1 through A-6), the per-file counts for each pattern (all of them — see Phase 6), and whether any high-severity violations exist (any high-severity violation downgrades the Performance Architecture score by one letter grade).

## Phase 5d — Whole-experience coherence & orphan detection

Static greps catch drift; this pass catches **incoherence** — controls with no consumer, affordances that contradict each other, and surfaces referenced but never built (workflow.md Principle 7). Report under "Experience coherence" in the executive report.

```bash
# Settings / toggles whose state is never read in a hot path or handler
# (a persisted setting with no consumer is a dead control). Manual review:
# for each setting key, grep its read sites.
grep -rn "panSettings\.\|\.settings\." packages/axoview-lib/src packages/axoview-app/src \
  --include="*.ts" --include="*.tsx" | grep -v "__tests__\|test\.tsx"

# Components referenced in docs/PLAN but absent from the tree (phantom surfaces)
# e.g. a "context menu" commands are routed into. Cross-check PLAN.md's snapshot
# against the actual component dirs.
ls packages/axoview-lib/src/components/

# Two affordances bound to the same gesture (contradiction smell) — manual review
# of every gesture (left/right/double-click, long-press) for a single owner.
grep -rn "onContextMenu\|onDoubleClick\|onClick" packages/axoview-lib/src/interaction \
  --include="*.ts" --include="*.tsx"
```

**How to interpret findings:**

| Pattern | Severity | Action |
|---|---|---|
| Persisted setting with no read site | High | Dead control — remove it or wire it. A toggle that does nothing is a UX lie. |
| A command/affordance routed to a surface not in the tree | High | Phantom dependency — either build the surface or re-home the command before the work is "planned." |
| One gesture with two owners | High | Contradiction — reconcile to a single owner (e.g. right-click = pan **or** menu, with a tap/drag split, not both ambiguously). |
| A control whose sibling was removed/changed, leaving it stranded | Medium | Reconcile the mirror (selection sync §4.1, item-type parity §5). |

The audit report must include an **Experience coherence** subsection: list any orphaned controls, phantom surfaces, and gesture contradictions found (any high-severity item downgrades the Fragility/Ease-of-Change score by one letter grade).

## Phase 6 — Executive Report

Write the report to `docs/reviews/technical-review-<YYYY-MM-DD>.md`. Read the most recent report already in `docs/reviews/` first and write **deltas** against it — what changed, what regressed, what closed — carrying its per-dimension grades forward so the scorecard is comparable run to run. Do not restate an unchanged finding: cite the prior report and move on. If a run teaches you a durable false-positive pattern, record it in that report's method note rather than growing this command file.

Synthesize all findings into a report with this structure. **Target ≤250 lines**; `technical-review-2026-07-29.md` (299 lines) is the calibration. The audience is an owner deciding what to fund before a release, so every section earns its place by changing a decision: sections 1-3 carry the numbers, 5-8 carry the evidence with file paths, 9-11 carry the calls. A section with nothing to report is one line saying so, not a paragraph explaining that there was nothing to report.

1. **Executive Summary** — health scorecard table (A–F per dimension)
2. **Critical Findings** — numbered, must-fix before next release
3. **Quality Metrics Dashboard** — all numeric scores in one table with thresholds
4. **Coverage Deep Dive** — well-tested vs zero-coverage modules
5. **Architecture Assessment** — per-dimension narrative with file path evidence
6. **UX Consistency** — Phase 5b findings: count per pattern, per-file counts, high-severity violations
7. **Performance hot-path** — Phase 5c findings: count per A-1..A-6 pattern, per-file counts, high-severity violations
8. **Experience coherence** — Phase 5d findings: orphaned controls, phantom surfaces, gesture contradictions
9. **Risk Register** — top risks ranked by Likelihood × Impact
10. **Recommendations** — P1 (immediate) / P2 (next sprint) / P3 (quarterly) backlog
11. **Positive Highlights** — what is working well

Where a section reports per-file counts, report **all** of them — a table of file → count, not a top-N. An executive reader stops after the first few rows, but the tail is what next run's delta is computed against, and a file left out of the report leaves the session for good.

**Every number here names the command that produced it** — grades, per-pattern counts and Risk Register rankings included. If a figure did not come out of a command run in this session, either run the command or mark it an estimate. Never carry a number forward from a previous report without re-running its source. (That is workflow.md → Design principle 1, applied to the report itself.)

## Reference Thresholds

| Metric (source) | Minimum Acceptable | Target |
|--------|-------------------|--------|
| Statement coverage (Phase 3) | 50% | 70%+ |
| Branch coverage (Phase 3) | 50% | 70%+ |
| ESLint errors (Phase 1) | 0 | 0 |
| npm audit HIGH/CRITICAL (Phase 2, `check:audit`) | 0 UNREVIEWED — the accepted entries in `scripts/audit-allowlist.json` are not findings | 0 unreviewed, and none past its `reviewBy` |
| Boot-critical JS, gzip (Phase 4, `check:bundle`) | the ceiling in `scripts/bundle-budget.json` | lower the ratchet when the `import()` split lands |
| Lib bundle, gzip (Phase 4) | reported, not gated — no script asserts it | report the change since the last review |
| God files (>400 lines) (Phase 5) | no growth vs the prior report | fewer than last run |
| Circular dependencies (Phase 5, `check:cycles`) | the ratchet in `scripts/cycles-baseline.json` (`maxCycles`) | lower than last run |
| @ts-ignore suppressions (Phase 1) | <5 | 0 |
| Hot-path `useScene()` in `SceneLayers/` (Phase 5c) | 0 | 0 |
| Stray `console.log` in production source (Phase 5c) | 0 | 0 |

Every row here names the command or gate file that owns its number. Where a row names a gate file, **that file is the authority** — a target here that contradicts a committed baseline is a bug in this table, not a finding about the code, and the ratchets exist precisely so the number cannot be raised to make a run look clean. A threshold that lives only in this table asserts nothing and is decoration: that is why Prettier and the prose bundle limits came out on 2026-07-29. A new threshold gets added to `scripts/` in the same change that adds its row.
