# /explore — Axoview Exploratory Bug Hunt

Run one wave of hypothesis-driven exploratory testing: predict specific failures, probe them cheaply, record a verdict for each. This is the standing form of the 2026-07 campaign (385 hypotheses, 240 bugs), distilled so a cold session can run a wave with no conversational context.

**Use this when** the goal is *finding* defects nobody has reported — after a feature lands, before a release, or on a schedule.
**Don't use this when:** you want a metrics/architecture report (`/audit`), you have a list of known bugs to fix (`/shake-out`), or you want the working diff reviewed (`/code-review`). This skill **finds and files**; it does not fix.

The campaign's record is the single frozen review [`docs/reviews/exploratory-2026-07.md`](../../docs/reviews/exploratory-2026-07.md) — heat map, per-area defect classes, standing threads, owner rulings, delta anchor. The per-hypothesis area files are retired to git history; read the record's paragraph for whatever you are probing before predicting its behaviour, and `git show` a retired area file only when you need its full verdict table.

`$ARGUMENTS`, if given, names the scope: an area id (`R3`), a subsystem (`layers panel`), or a commit range. If empty, use **delta mode** (§2).

---

## 1. The core loop

Every unit of work is one hypothesis through this pipeline:

```
PROPOSE → NOVELTY-CHECK → PROBE → VERDICT → RECORD
```

1. **Propose.** A hypothesis is a *falsifiable prediction of a specific failure*, not a test wish. Template: *"under conditions C, operation O produces incorrect result R / violates invariant I."* "Connectors work correctly" is not a hypothesis; *"a connector anchored to a node keeps pointing at the node's old tile after an arrow-key nudge, because the sync path is only wired for drag"* is. Write every hypothesis into the wave file as `PROPOSED` **before** probing any of them — proposing after you have seen a probe's output is how a wave drifts into confirming what it already found.
2. **Novelty-check.** A hypothesis counts only if no existing test already asserts the behaviour. Grep `packages/axoview-e2e/tests/` and `**/__tests__/`, and check the coverage baseline for the areas in scope (a regenerated artifact — the campaign's `coverage-baseline.md` is retired to git history; §2 says when to re-derive it). Record the 1–3 nearest existing tests and one line on why they miss it. Covered already → `DUPLICATE`, does not count.
3. **Probe.** The cheapest executable check that could falsify it (§5). Timebox ~45 min; past that, record `DEFERRED` with the blocker. Breadth beats depth.
4. **Verdict.** `BUG` (file it, §8) · `SUSPECT` (questionable, no ADR says which way — goes to product questions, counts) · `FALSIFIED` (disproven; counts — a genuinely-probed wrong guess is paid-for knowledge) · `DUPLICATE` (does not count) · `DEFERRED` (does not count until probed).
5. **Record.** Update the wave file **after every verdict**, not at session end. Sessions die; unrecorded work is lost work.

**Standing rule — anomaly capture.** Anything odd noticed *while* probing (console warning, flicker, wrong cursor, stale panel) becomes a new `PROPOSED` row immediately, even mid-probe. The ledger is allowed to grow faster than it shrinks.

**Standing rule — don't fix while hunting.** Confirmed bugs are filed, not fixed. Exception: a trivial issue blocking further probing of the same area. A fix is a separate session on a separate branch.

**Quota.** ≥10 counted hypotheses (BUG/SUSPECT/FALSIFIED) per area, each backed by an executed probe. Aim to propose ~15 to count 10. Do not inflate: an unprobed prediction is not a verdict.

---

## 2. Scope selection

**Delta mode (the default, and the one that makes this repeatable).** The campaign covered all 27 areas once; a standing sweep should hunt where the code has *changed* since.

1. Read the anchor in the [delta-anchor section](../../docs/reviews/exploratory-2026-07.md#delta-anchor--last-sweep) of the frozen review — the commit the previous sweep ran to.
2. `git diff --stat <anchor>..HEAD -- packages/*/src` and `git log --oneline <anchor>..HEAD`.
3. Map the changed files onto the area inventory (the frozen review's heat map lists all 27 areas with their scope). Pick the 1–3 areas with the most churn, and prefer a **seam** — a change that lands in two areas at once is where the campaign's bugs clustered.
4. At the end, update the frozen review's delta-anchor section with the new anchor, the date, and the areas covered (append the old row to its sweep history).

**Full-area mode.** `$ARGUMENTS` names an area or subsystem: read its paragraph in the frozen review, then `git show` its retired area file (scope, seed seams, matched invariants, known coverage gaps, and every hypothesis already ruled on there) and propose only *novel* ones. The retired table is the dedupe reference — an ID that already carries a verdict is not available for reuse.

**Regenerate the baseline** when the delta is large (say >150 changed source files) or the last sweep is more than a quarter old: re-derive the coverage map for the areas in scope — which files have direct tests, which are only exercised transitively, which invariants the ADRs state — and write it as `coverage-baseline.md` in the campaign's own working directory (it is a regenerated artifact; the previous campaign's copy is retired with its tree, never hand-maintained forward). **Verify a harvested invariant against the source before building a probe on it**; two in the original harvest were stale, and one named a function with no caller at all.

---

## 3. Read first

1. This file.
2. The frozen review's paragraph for whatever you are probing (and, when you need the verdict detail, its retired area file via git history) — the rig notes cost ~10 wrong verdicts to learn.
3. `known_issues.md` — an entry already at `Status: Open` is not a new finding. Confirming one is fine; re-filing it is not.
4. `docs/guidelines/testing.md` for the lane's place in the suite; `docs/adr/` for the contract a hypothesis claims is violated.

---

## 4. Branch & commits

Work on a dedicated branch off `master` (`explore/<date>-<scope>`), never on `master`. **`integration` is off-limits** — an unrelated MCP POC lives there. Commit after every area, mid-area commits welcome. Never push unless asked.

**Commitlint rejects a subject starting with an upper-case token**, so `test(explore): R3 wave — …` fails. Start lower-case and put the area id later: `test(explore): probe GPU-01 and GPU-04 — 2 bugs filed`.

---

## 5. Probe tiers — the cheapest tool that can falsify

| Tier | Harness | Use for | Cost |
|------|---------|---------|------|
| **T1** unit/integration | Jest, real providers/stores | reducers, stores, schemas, utils, hooks, history, serialization | seconds |
| **T2** bridge-driven e2e | Playwright + `window.__axoview__` + POMs | UI flows where DOM and store must agree; cross-store invariants | 10–30 s |
| **T3** real-input e2e | Playwright real `page.mouse` / CDP | hit-testing, pointer capture, drag thresholds, paint order — anything where synthetic dispatch lies | 10–30 s |

**Tier discipline:** hypotheses about event routing, hit-testing or gestures **must** use T3. This repo has shipped a regression that synthetic-event tests structurally could not see ([ADR 0022 addendum](../../docs/adr/0022-canvas-pointer-interaction-model.md)). Everything else takes the cheapest tier that can falsify.

**Where probes live** (each config's `testMatch` is exact — a misnamed file is not an error, it is simply never run):

| Package | Path | Run |
|---|---|---|
| lib | `src/**/__explore__/**/*.explore.test.{ts,tsx}` | `npm run explore:unit` |
| app | same pattern | `npm run explore:unit:app` |
| backend | `src/**/__explore__/**/*.explore.spec.js` | `npm run explore:unit:backend` |
| worker | `src/**/__explore__/**/*.explore.spec.ts` | `npm run explore:unit:worker` |
| e2e | `packages/axoview-e2e/tests-exploratory/<area>/*.explore.spec.ts` | `npm run explore:e2e` |

Single file: `npm run explore:unit:app -- --testPathPattern "<slug>"`, or `npx playwright test --config packages/axoview-e2e/playwright.explore.config.ts tests-exploratory/<area>/<file>`. `-g "<ID>"` re-runs one hypothesis. **Pick the script for the package the code under test lives in** — `explore:unit` is rooted in the lib and silently finds nothing for an app probe.

The lane is **quarantined**: not in CI, not in the default suites, excluded from `tsc --noEmit` and from knip. A red probe never blocks a gate. That exclusion is also why **promotion is a typecheck event** (§8).

---

## 6. Oracles — how a probe knows something is wrong

1. **Crash/console oracle (automatic).** The e2e fixture fails a probe on any uncaught error or `console.error`, whatever it was hunting.
2. **Cross-store consistency.** `expectStoreInvariants(page)` (INV-1…INV-11). **Grow the list** whenever an area confirms a new cross-store invariant.
3. **Schema oracle.** After the mutations, the exported model must `modelSchema.safeParse` clean — catches writes the loader would later reject.
4. **Round-trips.** save→load, export→import (JSON and ZIP), undo→redo→undo, copy→paste, iso↔2D↔iso, reload. A round trip that is not the identity (modulo documented ID rewriting) is a finding.
5. **Differential / parity.** The same logical operation through different routes must produce the same model delta: mouse vs keyboard vs touch vs context menu; on-grid vs off-grid; GPU vs DOM; edit mode vs inert-in-view-mode.
6. **Metamorphic.** Order and framing shouldn't matter: op-then-zoom ≡ zoom-then-op; move A then B ≡ move B then A (disjoint).
7. **Pixel read-back.** The rendering block is **not** pixel-blind — the bulk canvas is `preserveDrawingBuffer: true`, so `drawImage` into a 2D canvas + `getImageData` answers "what did the GPU paint?". Helpers: `packages/axoview-e2e/helpers/sceneCanvas.ts`, `tests-exploratory/_rig/glOracles.ts`. **Prefer a per-type counter (`data-connectors-drawn` and friends) to a pixel count** whenever the question is "did THIS entity type draw?" — since the canvas merge, "which canvas has pixels?" cannot answer it.

---

## 7. Hypothesis generators — the "no stone unturned" engine

Apply per area until the quota is comfortably exceeded:

1. **ADR-contract violations.** Each ADR states contracts; hypothesize concrete *silent* violations.
2. **Bug-class recurrence** — every class this repo has already shipped, applied to a surface it hasn't been checked on:
   - *offset-omission* — a consumer of item geometry ignores ADR 0023's `offset`
   - *sibling drift* — two parallel implementations of one contract diverge, and only one is maintained (the single highest-yield generator in the campaign)
   - *mode-transition race* — tool/mode switched mid-gesture leaves stale state
   - *synthetic-vs-real input* — behaviour differs under real hit-testing
   - *dual-stack skew* — model vs scene history desync
   - *unthemed-surface / missing-i18n* — new app surfaces skip theme or locale wiring
   - *stale derived cache* — a memo or index not invalidated
   - *implemented-but-unreachable* — a capability wired at every layer with no caller. **Grep for the CALLER before predicting behaviour in an app-shell area**; three whole capabilities were reachable from nowhere.
3. **Interleaving matrix.** {drag, lasso, connector-draw, resize, rotate, inline-edit, placement} × {Escape, tool hotkey, Delete, undo, context menu, layer toggle, view switch, mode toggle, tab blur, reload}.
4. **Boundary & degenerate inputs.** Zero-size/negative rects, 1-tile and self-referencing connectors, empty/whitespace/10k-char/RTL/emoji text, clamped zoom, coincident items, 0/1/many layers, empty diagram for every bulk op.
5. **Cross-feature pairs.** Features shipped in different waves rarely got tested *together*.
6. **Persistence sweep.** Every schema field a recent wave added × lean-save × zip × share/display path.
7. **Anomaly capture** (§1).

**Standing cross-area threads.** The campaign's durable findings — "one fact stored twice with different lifetimes", "a per-surface opt-in that nothing enumerates", "one geometry, two derivations", "the exit ramps are one function written several times", "identity and range integrity are unvalidated" — are recorded in the frozen review's standing-threads section. A new area should ask whether its surface reproduces them rather than re-deriving them.

---

## 8. Filing, and the flip rule

- **`BUG`** → an entry in `known_issues.md` in its existing Symptom / Root cause / Workaround / Status format, tagged `**Found by:** exploratory <ID>`, after checking it is not already registered.
- The repro stays in the lane as **`it.failing`** (Jest) / **`test.fail()`** (Playwright), so the lane is green while the bug is red and flips to unexpected-pass the day someone fixes it.
- **`SUSPECT`** → the wave file's product-questions list, with a recommendation. When the code is self-consistent and no ADR picks a side, that is a question, not a bug.
- **`FALSIFIED`** probes with real regression value may be promoted into the main suite — curated, never automatic.

**The flip rule is per-PR, not per-wave.** A fixed bug with its probe still in the lane is an incomplete fix. When a fix lands:

- **Promote what the probe PROVED, not what the fix TOUCHED.** Before deleting a probe, ask what it covered that the promoted regression does not.
- **Promotion is a typecheck event.** The lane is tsc-excluded and the main suite is not, so a promoted probe surfaces type errors it never had to satisfy. Move any shared harness out of `__explore__` in the same change.
- **A probe that characterises the defect's STRUCTURE can only be retired, not repaired** — "four canvases at one CSS zIndex" was true of the broken world and meaningless afterwards. Assert the claim from the other side instead.
- **A fix can invalidate a NEIGHBOURING probe's premise**, and a merge closes neighbours *by construction*. Those need an explicit disposition in the record ("no longer reachable via X; the underlying guard is unchanged; re-open if Y"), or the finding evaporates silently. **A lane failure is not automatically a flip.**

**Out of scope / not a finding:** performance (the perf harness owns it, ADR 0020); flake in the *existing* suites; visual taste with no contract behind it; anything already `Status: Open`; anything an existing test asserts.

---

## 9. Rig traps — read before writing a probe

**The one that matters most: `it.failing` / `test.fail()` distinguish only pass from fail, so a probe whose body throws — or whose SETUP never happened — reports as a confirmed bug.** Two rules catch it:

> **Pair every `it.failing` with a passing characterization that positively asserts the observed end state.** If you can't write the characterization, you don't understand the failure yet.
>
> **Assert the PRECONDITION, not just the outcome.** Did the pan actually move `scroll`? Did the selector match? Is the entity you acted on the one you resolved? Five wrong verdicts in one block before this was written down.

### 9a. A probe that cannot flip

Four flavours, all found in one wave, all passing review. A probe is a flip detector only if it exercises the **shipped path** with the **outcome** asserted.

1. **Transcribes** the code under test (a `useCallback`'s gate copied into the test file) — it asserts its own copy. Fix: *extract* the predicate; the promoted regression then imports what ships.
2. **Models** the callers instead of calling them (a pure helper called with the constant its callers pass). Fix: call the consumer, or gate the call sites by source scan.
3. **Pins a MECHANISM** rather than an outcome (demanding a specific call ordering, or that a particular sibling be deleted) — a legitimate alternative fix then reads as no fix. Fix: assert what the user sees.
4. **Depends on a signal the runner cannot produce** (a build-time `NODE_ENV` Jest sets to `'test'`). Fix: drive the signal explicitly.

Also: **an assertion written "either way" is a tautology.** `expect(x).toEqual(cond ? a : b)` passes without establishing anything. Assert the observed value explicitly.

### 9b. A probe can be red for a reason that is not the bug

- **Jest's `expect` takes exactly ONE argument.** `expect(value, 'message')` throws `"Expect takes at most one argument."`, so a probe written in the Playwright style is red whatever the code does. Playwright's two-argument form *is* supported. A source gate for this exists in the lane — point at it rather than relying on memory.
- **A CDP protocol error** (e.g. an unsupported `TouchCancel` shape) is red for a rig reason.
- **Machine speed is a confounder, not a constant.** A spec racing an internal retry budget flips red with no code change. Raise the timeout on the CLI for the run, never in the committed config, and re-check a suspicious red at a raised timeout before diagnosing it.
- **A full-suite red whose specs pass in isolation is a claim about the RUN, not the code — and an A/B settles it in ten minutes.** Wave 6 took 14 failures (11 timeouts, 3 assertions) out of 286 on a run that took 1.1 h against a 38 min baseline, five of them in connector specs that genuinely do touch the code under change. Reverting *only* the changed source files to the previous commit, rebuilding, and running the affected spec files gave 31 passed / 5.0 min; restoring and re-running gave 31 passed / 4.8 min. Identical arms, so the suspicion was retired on evidence rather than on the argument that the change "should be" inert. **Revert the files, not the branch** — it keeps the docs and the test edits in place, so the only variable is the one under test.
- **`net::ERR_NETWORK_IO_SUSPENDED` means the host slept mid-run.** Environment, not evidence. Re-run.
- **A source-scanning probe must resolve paths from `__dirname`, not the runner's cwd.** The lane runs per-package now; repo-root-relative paths throw ENOENT and *present as findings*. This was four of the six "stale characterizations" one wave inherited.

### 9c. Setup-throw traps

- **Playwright fixtures are LAZY — an e2e probe must destructure `app`, not just `page`.** `async ({ page })` boots no diagram, so `window.__axoview__` is undefined and every locator times out — indistinguishable from evidence. Write `async ({ page, app })` even when `app` is unused.
- **jsdom has no canvas 2D context.** `getTextBoxDimensions` throws, so any T1 probe touching text boxes needs `installCanvasStub()` from `src/__explore__/canvasStub.ts`. **A PROMOTED test cannot use it** (it lives in the lane) — give the main suite its own local stub.
- **`installCanvasStub()` is not enough for anything that DRAWS** — use `installDrawing2DStub()` from `src/__explore__/R2/glStub.ts`.
- **`useCopyPaste` needs `<ClipboardProvider>`** — use `ClipboardProviders` from `E3/harness.tsx`.
- **`jest.mock` drops the classes a component `instanceof`-checks**, and only on the failure path — which is the path the probe is testing. Re-export the real class via `jest.requireActual`.
- **`jest.spyOn` returns the EXISTING spy on a second call**, so calls accumulate across tests in one file. `mockClear()` right after acquiring it.
- **`jest.doMock` + `jest.resetModules()` leaks across tests in one file**, and re-importing a React component through a reset registry yields a null dispatcher. One such probe per file.
- **`axoview-backend` is native ESM, so the `jest` global is not injected** — `jest.setTimeout` throws. Pass the timeout as `test()`'s third argument.
- **`axoview-app` targets es5 with no `downlevelIteration`.** `[...someMap]` silently evaluates to `[]` and `for (const x of someMap)` iterates zero times; `class extends Error` loses its prototype so `instanceof` fails (`.name`/`.code` survive); `new Set` is broken in `leanModel.ts` specifically. Use `Array.from(...)` / `.forEach(...)`. `[...nodeList]` is fine.
- **A synchronous infinite loop cannot be probed with a timeout** — Jest's timeout never fires because the loop never yields. Cap a method the loop calls per step and compare against an acyclic control of the same size.

### 9d. Silent-precondition traps

- **The active view's `items` array order is NOT the placement order** and shifts as items are added. Resolve entities by id, never by index.
- **Focus stays in the Elements icon grid after placing a node**, and the grid consumes arrow keys — a keyboard pan then silently does nothing. Click empty canvas first. Likewise **F2 is filtered by focus origin**: `blur()` first, and pair the assertion with an on-screen control showing F2 working.
- **`uiState.mouse.mousedown` survives a completed gesture**, and the hover path is skipped while a press is live. Clear it with a plain click before measuring hover.
- **A freshly created connector label is empty and is discarded on Escape.** Type and commit first. Same for a text box placed with the tool — use `CanvasPOM.placeTextBoxAt(point, { text })`.
- **A connector's `name` alone renders NO label chip** — seed `labels: [{ id, text, position: 50, line: '1' }]`.
- **A blank diagram has NO layers**, and every layer filter's escape hatch keys on `layers.length === 0`. Seed a layer before hiding one.
- **`getModelItemCount` reads `model.items`, which leaks deleted nodes.** For "was it deleted?" use `getViewItemCount`.
- **A wrong selector reads as "0 elements", which looks exactly like "the feature is absent".** Verify the hook exists before concluding anything from a zero count.
- **A pure-math sweep can be right and still be inert.** Pair "the arithmetic reaches this value" with "and here is the consumer that breaks on it".
- **Ask the browser before filing a measurement drift.** One predicted font-weight gap was 0 px in the shipped stack. A declaration containing `var()` always round-trips whatever you assigned — `getComputedStyle` is the only valid oracle for "did the browser accept this?".
- **`model.actions.set({ views })` seeds any scene shape directly** and is far cheaper than driving the panels — **but a bridge-seeded CONNECTOR is not routed.** Draw those through real input if the scene path matters.

### 9e. E2E environment

- **`npm run test:e2e` does not work on this machine** — the script's `node_modules/.bin/playwright` path is not resolvable by cmd.exe. Use `npx playwright test --config packages/axoview-e2e/playwright.config.ts`.
- **Never pipe Playwright through `tail`** — the pipeline's exit code is `tail`'s, so a run with failures reads as exit 0. Three runs were read as green while 13 journeys were broken. Run unpiped with `--reporter=dot` and check the exit code.
- **Never run two Playwright invocations at once.** They share the dev-server port and the first HANGS rather than failing — an empty log and no error for as long as you let it.
- **The dev server serves the BUILT lib.** `prestart` does not build (only `prebuild` does) and `reuseExistingServer` will reuse a stale one, so a lib source change is invisible to Playwright until `npm run build:lib`. It presents as *the element does not exist* — indistinguishable from a product bug, and it cost an 11.3-minute run of 7 false reds. **And `build:lib` over a LIVE dev server poisons it** (`Can't resolve 'axoview'`), presenting as every test failing at `waitForAppReady`. Sequence: **stop the dev server → `build:lib` → let Playwright start a fresh one.**
- **Aborting a Playwright run ORPHANS its dev server** — killing the test process does not take the `webServer` child with it, and the listener survives on :3000. Every trap above then fires on the next run: `reuseExistingServer` adopts the orphan, and a `build:lib` in between has already poisoned it. The failure is a wall of instant `F`s from the very first test. **After any aborted run, check the port before rebuilding:** `Get-NetTCPConnection -LocalPort 3000 -State Listen` → `Stop-Process -Force`, and compare the listener's `StartTime` against your last build — an owner older than the build is the tell.
- **`window.__axoview__` exists only in dev builds, and ANY Axoview unmount deletes it.** The Export-as-image dialog mounts a *second* Axoview, so opening and closing it destroys the main bridge for the rest of the page's life — and while it is open the bridge points at the hidden export instance. Do bridge work before the first open, or drive state through `page.route`.
- **`keyboard.press` sends the UNSHIFTED character for a shifted punctuation chord** — `press('Control+Shift+]')` yields `']'` where a real keyboard sends `'}'`. Drive such chords through CDP `Input.dispatchKeyEvent` with `modifiers` (ctrl=2, shift=8, alt=1, meta=4).
- **`page.mouse` needs PAGE coordinates; `CanvasPOM.tileToScreen` returns interactions-box-relative ones.** Add the interactions layer's `boundingBox()` origin, and close the Elements dock first or it swallows the press.
- **Children of a `<SceneLayer>` are positioned in CANVAS px; `boundingBox()` returns SCREEN px.** Divide by `uiState.zoom` before comparing against a `measureText` result.
- **A DOM `<Node>`'s `[data-drag-id]` shell is ZERO-SIZED** (children absolutely positioned), so `elementFromPoint` never returns it and `boundingBox()` times out. Read `textContent` (not `innerText`) for label copy; use painted-bbox read-back for drawn extent.
- **A full-area e2e run takes 2–6 minutes** — run it in the background, and re-check the whole wave file once at the end.

### 9f. DOM selectors for surfaces with no hooks

- **ViewTabs** has no `data-axoview-id` and no accessible names (MUI `Tooltip` titles the wrapper): `button:has(svg[data-testid="AddIcon"])`, `…"CloseIcon"`, `…"DeleteOutlineOutlinedIcon"`.
- **Context-menu items** likewise: `li:has(svg[data-testid="NewLabelOutlinedIcon"])`. `.MuiMenu-paper li` + `allTextContents()` dumps the menu.
- **Strip controls** have no accessible name, and `getByRole('button', {name:'Bold'})` also matches the Quill toolbar. Scope to `[data-axoview-strip]`.
- **Transform handles:** `[data-axoview-id="canvas-transform-anchor"]`, `canvas-rotate-handle`, `canvas-resize-readout`.
- **The left dock shows ONE panel at a time** — opening Layers closes Elements.
- **The renderer's bounding rect spans the whole window** and the docks render inside it, so rect-containment "is this on the canvas?" is wrong. Use `document.elementFromPoint`.
- `tests-exploratory/_rig/dom-probe.explore.spec.ts` is a skipped DOM-dump helper — unskip locally to find a new hook.

### 9g. Writing the record

- **Writing verdicts into a markdown table with `node -e` + `String.replace` is a trap** and has bitten three times. A `$1` backreference in a bash double-quoted string prepends every replacement to the top of the file; a `||` in evidence text splits the row into extra cells. **Use the Write/Edit tools for the campaign markdown**; reserve `node -e` for pure appends. If you must script it, use a line-oriented `.js` file (match the row prefix, slice the trailing `| PROPOSED | |`, no regex replacement string), escape `|` as `&#124;`, and verify by counting cells per row. **Never emit a literal NUL** — write the escape sequence, never the character.
- **`git checkout -- <file>` during a red-check reverts the WHOLE file**, including the fix under test. Back up to a scratchpad path and restore from there.
- **Two agents can share this working tree.** Before editing `known_issues.md` or the root `package.json`, run `git status` on them; prefer surgical single-line edits and append at the tail only.

---

## 10. Gate authoring

When a wave's finding is a *class* rather than an instance, the fix wave will want a gate. Two rules, both learned by a gate failing to catch its own bug:

- **A class gate should SCAN, not enumerate** — derive the surfaces from the source or the schema, and **assert the discovery found something** so it cannot rot into a vacuous green. A source-scanning gate must **strip comments and import statements first**: one passed with the code deleted because `import { useLayerContext }` still contained the word.
- **An exemption must name the permitted CALL SITE, never the FILE.** A file-level exemption is a hole shaped exactly like the bug, since a duplicate's natural home *is* the file that already owns the concern.
- **Red-verify every gate by planting the defect where it actually lived**, and re-verify a named pin red *after* the pass that was supposed to keep it green. A "can this comparison detect a difference at all" CONTROL earns its place — one caught an es5 trap that had been reporting twelve perfectly-translated catalogues.

---

## 11. Campaign close-out — the archive step (ADR 0047 §5, as amended 2026-08-09)

A **wave** ends by updating the frozen review's delta-anchor section (§2). A
**campaign** (a full multi-area program with its own working directory of
ledger + area files) ends by compressing, never by freezing the tree:

1. Write ONE file, `docs/reviews/exploratory-<YYYY-MM>.md`, in the
   frozen-review style of [exploratory-2026-07.md](../../docs/reviews/exploratory-2026-07.md):
   the **heat map** (area × hypotheses counted × bugs × known_issues entries ×
   dominant defect classes — derive entry counts from `grep "Found by:"
   known_issues.md`), one short paragraph per area naming its bug **classes**
   (not per-bug detail — known_issues.md carries that) plus any record
   corrections, the owner rulings **verbatim**, the program lessons, and the
   **delta anchor** with its sweep history (this section a future sweep
   updates).
2. **Delete the working tree** — ledger, area files, method notes, the
   regenerated coverage baseline. Git history is the archive; do not move
   files into `docs/reviews/`, and do not keep APPROACH-style method docs (the
   method lives in this skill).
3. Repoint every inbound link (known_issues.md, testing.md, the ADRs, this
   skill) to the new doc or de-link to plain text, in the same change.
4. Sweep the lane to its standing state: probes for **Fixed** entries deleted
   (the flip rule already promoted their regressions), **FALSIFIED**
   characterizations deleted (promote a curated few to a main suite if they
   have regression value — never leave them in the lane), **Open** repros
   stay, plus the named rigs (§9's stubs/harnesses and `_rig/`) and anything a
   kept probe imports. Re-verify quarantine in both directions, tsc, knip, and
   that every explore script exits 0 (an empty per-package lane passes via
   `passWithNoTests`).

## Notes for Claude

**End-of-session report contract (owner-mandated).** The final message of every session has exactly four parts, in this order, and nothing else:

1. **Shipped:** one line per commit (sha — what).
2. **Gate:** one line — suites/e2e counts, green or red.
3. **Next:** ONE sentence — the first action of the successor session. All further detail goes in the wave file's resume point, not in chat.
4. **Owner:** the word **"nothing"**, or ONE question with a recommended default so it can be answered in a word. If several compete, ask the most blocking one and record the rest as "proceeding with X unless overruled".

Findings, corrections and lessons are written into their homes (the wave file, `known_issues.md`, `docs/guidelines/testing.md`) and *linked*, never restated in the report. **A report the owner cannot act on in under a minute is a defect in the report.**

**Two standing lessons about the record itself:**

- **The evidence is reliable; the DIAGNOSES are hypotheses.** The remediation waves corrected a dozen recorded root causes while fixing them. Re-derive the cause, then correct the entry in place.
- **A frozen record and the register drift.** One area's thirteen confirmed bugs each ended `known_issues: <ID>` in the area file and not one had reached `known_issues.md`. Check both ends before trusting a count.

**Headless.** This skill runs under `claude -p "/explore"` with no interactive input. In that mode: never ask a clarifying question — pick delta mode, record the choice in the wave file, and put anything that needed an owner into the report's part 4. See the frozen review's delta-anchor section for the scheduling notes.
