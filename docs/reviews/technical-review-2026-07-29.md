# Axoview Technical Review — 2026-07-29 (post-3.7.0 whole-system audit)

> **Status:** Whole-system review measured against `master` @ `fc72732b` (v**3.7.0**), the shake-out that closed PR #84. Unlike the [2026-07-08 review](technical-review-2026-07-08.md) — a scoped companion on the WebGL2 fold — this one re-runs the full `/audit` gate set across all five packages and adversarially re-verifies the *gates themselves*. §4 records the fixes applied in this same session.
>
> **Headline:** the product code is in strong shape. The defects found this session are concentrated in the **measurement layer** — two of the audit's own gates were reporting results that were not true.

## Table of contents

- [1. Executive summary + verdict](#1-executive-summary--verdict)
- [1a. Health scorecard](#1a-health-scorecard)
- [2. What was verified green](#2-what-was-verified-green)
- [3. Findings (as reviewed, pre-fix)](#3-findings-as-reviewed-pre-fix)
- [4. Fixes applied this session — before / after](#4-fixes-applied-this-session--before--after)
- [5. Still deferred (with rationale)](#5-still-deferred-with-rationale)
- [6. Post-fix verification](#6-post-fix-verification)
- [7. Method note: what the adversarial pass killed](#7-method-note-what-the-adversarial-pass-killed)
- [8. Follow-up: the gates, promoted into CI](#8-follow-up-the-gates-promoted-into-ci-same-session)
- [9. `/audit` pass — Phases 5b / 5c / 5d](#9-audit-pass--phases-5b--5c--5d)

---

## 1. Executive summary + verdict

**Verdict: healthy codebase, blind instrumentation.** Every product gate is green and has been for several releases — `tsc` clean, **1737 unit tests passing across 155 suites** with zero console noise, ESLint at 0 errors, both builds clean, one `: any` in the entire production source. The ADR discipline is real: I picked two load-bearing ADR invariants at random and both **hold in code** (ADR 0023's "an offset must never be rounded into a tile" has zero violations; ADR 0029's sanitize-before-sink is enforced on every path).

The problems are in what the audit *measures*:

1. **The circular-dependency gate never ran.** `/audit` Phase 5 invokes `madge --circular src/index.ts` without `--ts-config`. madge cannot resolve this repo's `src/…` path alias, so it silently walked **16 of 293 files** and printed `✔ No circular dependency found!`. Run correctly it reports **63 cycles**. Every audit since that line was written has been reading a green that meant nothing.
2. **The bundle-size gate never fired.** `/audit` Phase 4 says to "flag any chunk >1MB uncompressed; flag main entry >500KB gzip". The editor entry at `/app` ships a **9.24 MB / 1.49 MB-gzip** boot-critical chunk of 10,636 modules. Both thresholds are blown — by ~9× and ~3× — and no report has ever said so.

On security: `npm audit` showed **12 advisories (7 high)**, and I verified each against actual usage rather than the advisory text. **None were exploitable.** Four cleared with a non-breaking bump applied this session (dompurify ×1, hono ×3), taking the tree to **5 advisories (3 high)**; the three that remain are one dev-only DoS, one with **no forward fix** that Axoview's architecture rules out anyway, and Quill's HTML-export XSS — the one that touches a genuinely dangerous path, on an API Axoview really does call, and which ADR 0029's double-sanitize absorbs. That is the clearest evidence in this repo that a defensive ADR earned its keep.

### 1a. Health scorecard

| Dimension | Pre-fix | Post-fix | Basis |
|---|---|---|---|
| Correctness / test health | **A** | **A** | 155 suites / 1737 pass + 1 skip, 4 snapshots, **zero** console noise; worker 124/124 |
| Type safety | **A** | **A** | `tsc --noEmit` clean; **1** `: any` in all production src; 17 suppressions total |
| Security — code | **A−** | **A−** | Sole HTML sink double-sanitized; CF Access JWT hardened (iss anchored, `exp` required, alg pinned, constant-time compare); app package has zero HTML sinks |
| Security — dependencies | **B** | **A−** | 12 advisories → **0 exploitable** (each verified against usage); **12 → 5** total, high **7 → 3** after the non-breaking bump; residue = 1 dev-only + 2 deferred-with-rationale |
| Architecture / coupling | **B** | **B+** | **63 → 47** cycles (one import path); of the 2 confirmed runtime value cycles, **1 fixed**, 1 deferred with sign-off. The rest are erased type-only artifacts |
| Bundle / load performance | **C** | **C** | 1787 kB gzip boot-critical to open the editor; now gated by `npm run check:bundle` |
| Lint / format hygiene | **B+** | **A−** | ESLint 0 errors (1 warning → **0**); the dead Prettier gate deleted with rationale (§8) |
| **Audit instrumentation** | **D** | **A** | Two gates were structurally incapable of failing. Both now enforced ratchets with baselines, negative-tested, and running in CI (§8) |
| Docs / ADR discipline | **A** | **A** | ADR 0023 + ADR 0029 invariants spot-checked and **holding**; canonical-definition comments in code, not just ADR prose |

---

## 2. What was verified green

**Mechanical gates (local, `master` @ `fc72732b`):**

| Gate | Result |
|---|---|
| `tsc --noEmit` (lib) | **clean** |
| jest (lib) | **155 suites / 1737 pass + 1 skip**, 4 snapshots, 54 s, **0 console warns/errors** |
| jest (worker) | **4 suites / 124 pass** |
| ESLint (lib) | **0 errors / 1 warning** (an unused `eslint-disable`) |
| `npm run build:lib` | **clean**, both formats |
| `npm run build:app` | **clean**, 14.1 MB total / 2.76 MB gzip |
| madge (run **correctly**) | 293 files, **63 cycles** — see [§3](#3-findings-as-reviewed-pre-fix) |

**Two ADR invariants adversarially spot-checked — both HOLD:**

| ADR | Claim | Verdict | Evidence |
|---|---|---|---|
| **0023** | An off-grid `offset` is a sub-tile SceneLayer-px residual and **must never be rounded** | **CONFIRMED** | `grep` for `Math.round\|floor\|ceil\|toFixed` adjacent to `offset` across production src: **0 hits**. Composition is centralised in [renderedGeometry.ts](../../packages/axoview-lib/src/utils/renderedGeometry.ts) and hand-rolled composition is blocked by `renderedGeometry.contract.test.ts` |
| **0029** | User-authored HTML is sanitized before reaching any `dangerouslySetInnerHTML` sink | **CONFIRMED** | The product has exactly **one** such sink ([TextBox.tsx:336](../../packages/axoview-lib/src/components/SceneLayers/TextBoxes/TextBox.tsx#L336)). It is sanitized at render ([:254](../../packages/axoview-lib/src/components/SceneLayers/TextBoxes/TextBox.tsx#L254)), on write ([TextBoxInlineEditor.tsx:115,134](../../packages/axoview-lib/src/components/SceneLayers/TextBoxes/TextBoxInlineEditor.tsx#L115)) **and** on load ([useInitialDataManager.ts:85](../../packages/axoview-lib/src/hooks/useInitialDataManager.ts#L85)). The **app** package has zero HTML sinks; notes/labels render as React text nodes |

**Worker auth re-reviewed, no finding.** [auth.ts](../../packages/axoview-worker/src/auth.ts) pins `alg: RS256`, requires `kid`, **requires** a non-expired `exp`, matches `iss` against the exact canonical CF Access issuer (not a substring), compares the shared token in constant time, and scopes the public bypass to two narrowly-regexed GET routes. The 2026-07-05 security review's hardening is intact.

---

## 3. Findings (as reviewed, pre-fix)

Ranked. §4 records disposition.

**1 — The `/audit` circular-dependency gate is a false green (HIGH — instrumentation).**
`.claude/commands/audit.md` Phase 5 runs:

```bash
npx madge --circular src/index.ts        # ← no --ts-config
```

The lib imports via the `src/…` TypeScript path alias. Without `--ts-config`, madge cannot resolve those specifiers, emits 31 unresolved-import warnings, walks **16 of 293 files**, and prints `✔ No circular dependency found!`. This is worse than no gate: it is a gate that *cannot fail*, reported as passing. Corrected invocation → **293 files, 63 cycles**.

**2 — 63 circular dependencies, of which 2 are genuine runtime cycles (MED).**
Severity is well below the raw number, and the distinction matters:

- **~40 are compile-graph artifacts, not runtime cycles.** They route through `types/index.ts`. Verified: [config.ts:1-12](../../packages/axoview-lib/src/config.ts#L1-L12) imports `Size`/`InitialData`/`Icon`/… from `src/types` in type position only, and `types/model.ts` exports **zero** runtime values (`grep '^export (const|function|class|let)'` → empty). TypeScript elides these imports entirely; nothing cyclic survives to the bundle.
- **Confirmed runtime value cycles:**
  - `schemas/validation.ts` →(value `getAllAnchors`)→ `utils/index.ts` →`export * from './model'`→ `utils/model.ts` →(value `validateModel`)→ back. Works **only** because both bindings are referenced lazily inside function bodies, never at module-eval time. A future module-level use on either side is a TDZ crash at import.
  - `Axoview.tsx` → `UiOverlay.tsx` → `ExportImageDialog.tsx` → `Axoview` (the hidden export instance already noted in the 07-08 review).
- The `stores/reducers/types.ts` ⇄ `connector`/`label`/`rectangle`/`textBox`/`view`/`viewItem` cluster was **not** classified this session — see [§5](#5-still-deferred-with-rationale).

The barrel files (`utils/index.ts`, `types/index.ts`, `schemas/index.ts`) are the structural cause.

**3 — Editor entry ships 1787 kB gzip of boot-critical JS, never measured (MED-HIGH).**
`build/app.html` loads these five, all `defer`:

| Chunk | Raw | Gzip |
|---|---|---|
| `215.js` | **9042 kB** | **1425 kB** |
| `app.js` | 966 kB | 264 kB |
| `lib-react` / `lib-polyfill` / `lib-router` | 137 / 122 / 35 kB | 44 / 41 / 13 kB |
| **total** | **10,302 kB** | **1787 kB** |

> **Precision note.** These are `defer`, so strictly they do **not** block HTML
> parsing or first paint — an earlier draft of this review called them
> "render-blocking", which was wrong. `app.html` is an empty SPA shell with a
> boot splash, so nothing useful exists until this set has downloaded, parsed and
> executed: the correct framing is **time-to-interactive**, which for this app is
> the same wait a user feels. Gzip figures are `gzip -9` as measured by
> `scripts/check-bundle-budget.js` and run slightly under rsbuild's own report.

`215.js` is genuinely minified (avg line 18,861 chars) and holds **10,636 webpack modules** — MUI Material, Quill (162 kB), and the axoview lib, with a single 1173 kB module inside it. `/audit` Phase 4's own thresholds ("chunk >1MB uncompressed", "main entry >500KB gzip") are exceeded by ~9× and ~3×, and no audit has ever reported it, because Phase 4 records sizes without asserting on them.

**4 — Dependency advisories: 12 reported, 0 exploitable (MED → LOW after verification).**
Each checked against real usage:

| Advisory | Shipped? | Exploitable here? | Basis |
|---|---|---|---|
| **quill 2.0.3** — XSS via HTML export (GHSA-v3m3-f69x-jf25) | yes (runtime) | **No** | Axoview *does* call the affected `getSemanticHTML()`, but **every** call site pipes through `sanitizeHtml` before store, and the sink re-sanitizes at render. ADR 0029 absorbs it. Fix is a **breaking** downgrade to `react-quill-new@3.7.0` |
| **dompurify ≤3.4.11** — `CUSTOM_ELEMENT_HANDLING` bypasses `afterSanitizeElements` | yes (runtime) | **No** | Axoview never enables custom elements (default config) and registers `afterSanitizeAttributes` — not the bypassed hook. Fix **non-breaking** |
| **hono ≤4.12.26** ×3 — API-GW v1 adapter / `hono/jsx` context / `cx()` XSS | yes (worker) | **No** | Worker uses `hono/cloudflare-pages` + `Hono`/`bodyLimit`/`secureHeaders` only. No AWS adapter, no `hono/jsx`, no `hono/css`. Fix **non-breaking** |
| **react-router 7.18.0** — RSC-mode CSRF bypass | yes (app) | **No** | SPA; RSC mode not used. **No forward fix exists** — the advisory range is `7.12.0 – 8.2.0`, so the patch bump to 7.18.2 does *not* clear it; npm's only offer is a breaking downgrade to 7.11.0 |
| sharp ← miniflare ← wrangler; js-yaml; brace-expansion | **dev only** | n/a | not shipped to users |

**5 — `useCanvasModeToggle`'s single-consumer invariant is comment-only (LOW-MED).**
[useCanvasModeToggle.ts:12-15](../../packages/axoview-lib/src/hooks/useCanvasModeToggle.ts#L12-L15) states: *"The effect assumes ONE live consumer at a time — two mounted simultaneously would each apply the scroll correction."* Verified true today (`ToolMenu` is EDITABLE-only per `UiOverlay.tsx:48`; `PreviewCanvasModeToggle` renders only in the read-only present chrome). But nothing **enforces** it, and a second consumer double-applies the viewport correction — a silent viewport jump, hard to attribute. This is the same unenforced-invariant class as the ADR 0023 offset-omission cluster the project already paid to fix, and the project already owns the remedy pattern (`renderedGeometry.contract.test.ts`).

**6 — Unvalidated `resourceKey` in the public Drive proxy (LOW).**
[app.ts](../../packages/axoview-worker/src/app.ts) validates `fileId` against `/^[A-Za-z0-9_-]{10,120}$/` but interpolated the caller-supplied `resourceKey` straight into the `X-Goog-Drive-Resource-Keys` header value. Not exploitable — the Workers runtime rejects CRLF in header values, and the throw lands inside the existing `try` → 502 — but the invariant should be enforced at the boundary, not inherited from the runtime.

**7 — Hygiene (LOW).** One unused `eslint-disable no-bitwise` ([AnnotationLayer.tsx:244](../../packages/axoview-lib/src/components/AnnotationLayer/AnnotationLayer.tsx#L244)); **156 files** fail `prettier --check` against the repo's own `.prettierrc`, and nothing in CI enforces it.

---

## 4. Fixes applied this session — before / after

| # | Finding | Before | After | Verified |
|---|---|---|---|---|
| 1 | madge gate false green | `npx madge --circular src/index.ts` → 16/293 files, `✔ No circular dependency found!` | `npx madge --circular --extensions ts,tsx --ts-config tsconfig.json src/index.ts`, with a comment recording *why* the flag is load-bearing and what the correct output looks like | Re-run: **293 files, 63 cycles** — the gate can now fail |
| 4 | dompurify + hono advisories | dompurify 3.4.11 (1 advisory), hono 4.12.26 (3 advisories) | `npm audit fix` (non-breaking only) → dompurify **3.4.12**, hono **4.12.32**; both advisories sets **cleared**. react-router went 7.18.0 → **7.18.2** but is *not* cleared (see §3 #4) | **12 → 5** total, high **7 → 3**; tree materialized with `npm install` and full lib + worker suites re-run against it |
| 6 | `resourceKey` unvalidated | `` `${fileId}/${resourceKey}` `` straight from the query string into a header value | Validated on the same allowlist as `fileId`; a malformed key is **dropped** rather than rejected (it is an optional hint — Drive answers without it), so no valid request regresses | worker jest **124/124** |
| 7 | Unused `eslint-disable` | `// eslint-disable-next-line no-bitwise` above `e.buttons & 1` — the rule was never enabled | Removed | ESLint **1 warning → 0** |

**Not changed (deliberately):** the quill downgrade (breaking, and verified non-exploitable — see [§5](#5-still-deferred-with-rationale)), the 63 cycles (structural; needs a barrel-file decision, not a patch), the bundle split (needs an owner call on strategy), and the Prettier sweep (156 files of pure formatting churn would bury the substantive diff above).

---

## 5. Still deferred (with rationale)

- **quill 2.0.3 XSS-via-HTML-export.** The only fix `npm` offers is a **breaking** downgrade to `react-quill-new@3.7.0`. Axoview calls the affected API but sanitizes its output on write, on load, and at the render sink, so the payload cannot reach the DOM. **Accepted risk, with a tripwire:** if the ADR 0029 double-sanitize is ever relaxed, this becomes live. Re-evaluate when `react-quill-new` ships a patched Quill forward, not backward.
- **react-router RSC-mode CSRF.** Advisory range `7.12.0 – 8.2.0` has **no forward fix** — npm's only remedy is a downgrade to 7.11.0. Axoview is an SPA and never enters RSC mode, so the vulnerable code path does not exist here. **Accepted; revisit when a patched ≥8.2.1 lands.**
- **`brace-expansion` DoS.** `devDependency` only (via `nodemon`); never reaches a user. Clears on the next nodemon bump.
- **Circular dependencies — one of the two runtime cycles is now FIXED.** `schemas/validation.ts` was importing `getAllAnchors` from the `src/utils` barrel; the function lives in `src/utils/isoMath.ts`, which is acyclic. One import path took the graph **63 → 47** and removed the confirmed `validation ⇄ utils ⇄ model` value cycle (type-clean, 1737 tests green). The remaining runtime cycle — `Axoview → UiOverlay → ExportImageDialog → Axoview` — is **deferred with owner sign-off**; its fix is lazy-loading the dialog, i.e. bundle work. Options + risk levels recorded in [known_issues.md](../../known_issues.md). The other ~46 are erased type-only artifacts costing nothing at runtime. A broader barrel-file policy (`import type` at boundaries, or splitting `utils/index.ts`) would still be an ADR-level decision.
- **The reducers cycle cluster** (`stores/reducers/types.ts` ⇄ 6 reducers) was not classified type-only vs. value this session. It is the next slice worth measuring — it sits under undo/redo.
- **Bundle split for `/app` — deferred with owner sign-off (2026-07-29).** 1787 kB gzip boot-critical, judged not a live user problem. Five options with effort/risk are recorded in [known_issues.md](../../known_issues.md), including the finding that **no `React.lazy`/`Suspense` exists in either package** (so this is a new pattern, not a config tweak) and that `axoview-lib` is a **published package**, which pushes chunk-loading semantics onto consumers. `npm run check:bundle` prevents drift. The marketing landing is **already** clean — see §7.
- **Prettier drift (156 files).** Either sweep it and add a CI check, or drop the gate from `/audit`. A measured-but-unenforced gate is how finding #1 happened.
- **`useCanvasModeToggle` contract test.** Cheap to add, mirrors `renderedGeometry.contract.test.ts`.

---

## 6. Post-fix verification

| Gate | Before | After |
|---|---|---|
| `tsc --noEmit` (lib) | clean | **clean** |
| ESLint (lib) | 0 errors / 1 warning | **0 errors / 0 warnings** |
| jest (lib) | 155 suites / 1737 pass + 1 skip | **155 suites / 1737 pass + 1 skip** |
| jest (worker) | 4 suites / 124 pass | **4 suites / 124 pass** |
| `npm audit` (all workspaces) | **12** (4 low / 1 mod / 7 high) | **5** (2 low / 3 high) |
| └ remaining highs | — | `brace-expansion` (**dev-only**, via nodemon), `quill` (deferred, non-exploitable), `react-router` (**no forward fix**, not applicable) |
| madge | `✔ none` (over 16 files) | **63 cycles over 293 files** — honest |
| lib + app build | clean | **clean** |

---

## 7. Method note: what the adversarial pass killed

Recording the hypotheses that **did not survive**, so the next review does not re-raise them:

- **"The 9.2 MB chunk wrecks the marketing landing's LCP/SEO."** **False.** `build/index.html` has **zero** script tags — ADR 0040's landing/SPA split is intact and doing exactly its job. The weight is on `/app` only, where the user has already committed to opening an editor. This materially lowered finding #3's severity.
- **"`@mui/icons-material` is barrel-imported."** **False.** Only 3 `createSvgIcon` calls survive into the chunk; icons tree-shake correctly.
- **"The AWS/GCP/Azure/K8s icon packs are in the blocking chunk."** **False.** They are correctly lazy — `await import()` in [iconPackManager.ts:63-69](../../packages/axoview-app/src/services/iconPackManager.ts#L63-L69) — and account for the `async/` chunks. Only the small base isopack is static.
- **"63 cycles is a five-alarm architecture problem."** **Overstated.** Most are erased before they reach a bundle. Reporting the raw madge number without the type-only/value split would have been alarmist.
- **"Timer leaks in LayerRow / TopBarStyleControls / ElementsPanel."** **Not findings.** All are 0 ms focus timers or a 2 s toast flag; nothing retains a subscription.
- **"DOMPurify's advisory means stored XSS is live."** **False**, on two independent grounds (config never enables custom elements; the vulnerable hook is not the one registered).

The pattern worth carrying forward: **five of the seven findings above are about a check that existed but could not fail.** The product code kept its own promises; the instrumentation did not.

---

---

## 8. Follow-up: the gates, promoted into CI (same session)

§4 patched the two broken gates. Owner call then went further — patching an
instance does not fix the class — so the advisory checks were converted into
enforced ratchets. Each has a baseline file, a written rationale, and was
**negative-tested**: deliberately made to fail, then restored. A gate nobody has
watched go red is just an untested assertion.

| Gate | `npm run …` | Asserts | Baseline |
|---|---|---|---|
| Circular deps | `check:cycles` | **denominator ≥280 files** *then* cycles ≤ baseline | [cycles-baseline.json](../../scripts/cycles-baseline.json) — 63 |
| Bundle budget | `check:bundle` | total boot-critical gzip + per-chunk gzip | [bundle-budget.json](../../scripts/bundle-budget.json) — 1850 kB / 1480 kB |
| Advisories | `check:audit` | every advisory is fixed **or** explicitly accepted | [audit-allowlist.json](../../scripts/audit-allowlist.json) — 4 entries |

All three now run in [`test.yml`](../../.github/workflows/test.yml) after the build.

**Design decisions worth keeping:**

- **The denominator check is the real fix.** `check:cycles` asserts the graph
  contains ≥280 files *before* it trusts the cycle count. The original bug was
  not "madge reported the wrong number" — it was "madge reported a *correct*
  number about 5% of the codebase". Any gate that can be starved of input needs
  its input volume asserted.
- **Both scripts refuse to report green over an empty measurement.** If
  `check-bundle-budget` parses zero script tags, it exits **2** (gate broken),
  not 0 (pass). This triggered for real during development — the tags turned out
  to be `defer`, which the first draft excluded — and it surfaced the terminology
  error corrected in §3 rather than silently passing.
- **Exit 2 ≠ exit 1.** "The gate is broken" and "the code regressed" are
  different events and must not be conflated.
- **The allowlist carries a `tripwire` field**, not just a reason. For Quill the
  tripwire is *"if the ADR 0029 sanitize is removed from any of those three
  points, this becomes live stored-XSS"* — the condition that would invalidate
  the acceptance, written down while the analysis is fresh.
- **`reviewBy` warns, never fails.** An accepted risk shouldn't quietly become
  permanent, but neither should a date silently break an unrelated release.

**Also in this follow-up:**

- **Coverage floors re-ratcheted** — global 30/20/25/30 → **34/23/29/34**
  (statements/branches/functions/lines). The floors were set 2026-07-05 at ~5-7pp
  under measured reality; coverage had since risen (37.4→40.2 statements,
  25.1→28.5 branches) without them following, so the slack had drifted to ~10pp.
  The per-directory floors (reducers 85/65, schemas 95/90) were **re-measured and
  left alone** — those areas hadn't moved. Nothing here is a coverage
  *improvement*; it restores the intended sensitivity of an existing gate.
- **Prettier gate deleted, not fixed.** 156 drifting files, never in CI, and
  `prettier` was already sitting in knip's `ignoreDependencies` — the repo had
  conceded it long ago. A measurement with no consumer trains people to skim past
  red, which is the same disease as a green that can't fail. `/audit` now records
  why, and what to do if formatting is ever wanted back (sweep *and* gate in one
  change).
- **`madge` pinned as a devDependency.** It was never declared; `npx madge` was
  fetching it ad hoc, which is unpinned and offline-fragile in CI — a third,
  quieter instrumentation weakness.

**Not done (unchanged owner call):** the actual bundle split. `check:bundle`
stops it growing; it does not make 1787 kB good. Route-splitting the editor
shell and lazying Quill + the export dialog is the real work, scheduled
separately.

---

---

## 9. `/audit` pass — Phases 5b / 5c / 5d

Phases 1–4 are §2 and §6 above. This section records the UX / hot-path /
coherence sweeps, which the review had not yet run.

**Clean (0 findings):** `useScene()` in `SceneLayers/` (A-1) · `textTransform:
'uppercase'` · stray `console.log` (A-6) · gesture contradictions (6
`onContextMenu` sites, single-owner) · orphaned settings.

**`flushSync` (A-5) — 1 real site, justified.** `useSceneActions.ts:409`, inside
the connector-preview path the guideline names as its legitimate owner, with the
reason in a comment. Not a finding.

**Two Phase-5b/5c High-severity alarms were FALSE — the checks were stale.**
Same class as findings 1 and 2, and worth recording because both would have sent
someone to "fix" healthy code:

| Alarm | Reported | Reality |
|---|---|---|
| `id="ax-splash"` count **0** → "cold-start splash removed, High" | grep targeted `public/index.html` | ADR 0040 made that the **marketing landing** — a page that correctly has no app splash and no scripts. The editor shell moved to `app-shell.html`, where the splash is present and emits correctly into `build/app.html`. **Check path corrected.** |
| **20** `console.*` → "stray, strip before commit, High" | grep lumped `log`/`warn`/`debug` together | **Zero** were `console.log`. All 20 were deliberate diagnostics — the four WebGL canvases' null-batch warnings (added by the [2026-07-08 review](technical-review-2026-07-08.md) *specifically to kill a silent-blank failure*), error boundaries, `svgOptimizer` fallbacks, invalid-data discards. Acting on this would have argued for deleting a fix a previous review had just landed. **Check split**: `console.log` stays High; `warn`/`debug` are review-only. |

**Standing debt confirmed (pre-existing, not from this session):**

| Metric | Measured | Threshold | Note |
|---|---|---|---|
| Statement coverage | 40.2 % | min 50 % | Below minimum; floors ratcheted so it can only rise |
| `fontSize:` on Typography | 197 | 0 | UX §1.5 drift, long-standing |
| Files >400 lines | 43 | documented | Largest: `TopBarStyleControls` 2196, `useInteractionManager` 1608 |
| Memoization sites | 465 | — | Healthy density |

**Net:** the `/audit` sweep surfaced **no new defect in product code**. It
surfaced two more broken checks — bringing this session's total to **four gates
that were lying** (madge, bundle, splash-path, console-grep). All four are fixed.

---

*Measured 2026-07-29 against `master` @ `fc72732b` (v3.7.0) plus this session's fix commits. Companion to [2026-07-08](technical-review-2026-07-08.md) (WebGL2 fold) and [2026-07](technical-review-2026-07.md) (quarterly).*
