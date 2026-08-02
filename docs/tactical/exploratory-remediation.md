# Tactical — Exploratory Campaign Remediation (all 220 bugs) & Program Build-out

> **Read first:**
> - [ADR 0047 — Exploratory Testing Program](../adr/0047-exploratory-testing-program.md) — the lane, the flip rule, class gates, the agent contract
> - [docs/exploratory/DECISIONS.md](../exploratory/DECISIONS.md) — the 22 owner rulings this plan implements (incl. the ADR amendments each ruling names)
> - [docs/exploratory/LEDGER.md](../exploratory/LEDGER.md) — per-area bug counts; [known_issues.md](../../known_issues.md) — the 172 filed entries (`Found by: exploratory campaign <ID>`)
>
> **Status:** Waves 0–4 COMPLETE · Wave 5 IN PROGRESS · **Owner:** molikas · **Last updated:** 2026-08-02
>
> Wave 4 is next. Read the wave 1–3 sections first — between them they carry the
> items deliberately routed forward (HIST-03/04 and RND-13/15 to wave 5, CLIP-14
> and STOR-14's override half to wave 4), the two CI gates the probe lane had
> broken, and the five class gates now in place.
>
> **Two things wave 2 learned, which wave 3 confirmed and wave 4 will need.**
>
> 1. Three entries' recorded "fix direction" turned out to be wrong about the
>    CAUSE while right about the symptom (I5/CTX-15, S1/AUTH-02, F2/VIEW-11's
>    second source of truth). The campaign's evidence is reliable; its
>    diagnoses are hypotheses. Re-derive the cause before implementing the
>    proposed fix, and correct the entry when they differ — all three
>    corrections are recorded in place.
> 2. **Un-deadening a code path is a change to that path.** CTX-15's fix made a
>    dormant `Pan.mouseup` branch reachable for the first time, and the branch
>    had its own latent bug (a window-bound listener with no
>    `isRendererInteraction` check) that nothing had ever been able to expose.
>    The unit gates and the read-only e2e spec both missed it, because both
>    click the canvas; only the **full** suite, where a journey clicks real app
>    chrome, caught it. Budget for the full e2e run when a wave revives dead
>    code — the targeted specs will not tell you.
>
> Wave 3 added a third, which is really the first one turned on the rig:
>
> 3. **A probe can be red for a reason that is not the bug.** Wave 2 found one
>    (a CDP protocol error under `test.fail()`); wave 3 found another (Jest
>    rejects the two-argument `expect` the Playwright specs use). Before
>    implementing, check that the probe fails the way the entry says it does —
>    and when a wave promotes a probe, that check happens for free, which is a
>    second reason the flip rule earns its keep.
>
> This is a **short-lived working doc.** Delete it after the work merges; ADRs are the durable record. PLAN.md gets a one-line entry referencing ADR 0047 once shipped — see "Wrap-up" below.

## Session startup checklist

1. Read this file fully.
2. Read each linked ADR/ruling doc.
3. Skim `PLAN.md` Phase Status Dashboard **for context only** — do not modify it during this work.
4. Use `TodoWrite` to track sub-tasks below.
5. Mark `[x]` as work completes.
6. On completion, follow the "Wrap-up" section to update PLAN.md with a single line.

## Goal

Fix **every** bug the 2026-07 exploratory campaign filed (220 + whatever A4/A5 close-out adds), implement the 22 owner rulings, land the bug-class contract gates, and build the recurring `/explore` agent — in risk order, with each fix promoting its repro probe per the ADR 0047 flip rule. Explicitly *not* goals: performance work, the pre-existing i18n debt entries in known_issues.md, and any fix that isn't traceable to a campaign entry or ruling.

## Scope

### In scope
- Waves 0–5 (must-have MVP): campaign close-out, all campaign-filed bugs, all small/medium rulings, class gates, the two design-gated larges (HIST-10, GPU-13).
- Wave 6 (should-have): `/explore` skill, headless run path, campaign-record archival.

### Out of scope
- Recommendation #5 (delta-campaign cadence) beyond what ADR 0047 already fixes — first delta run is a future session.
- Pre-campaign known_issues entries (default-MUI theming, i18n debt, deferred boot payload).

## Locked decisions (from owner review 2026-07-30)

| # | Decision |
|---|---|
| 1 | **All 220 bugs are in scope** — risk-ordered waves, no triage-to-backlog. Bugs sharing a root cause are fixed as one cluster item. |
| 2 | **A4/A5 finish first** (Wave 0) — same code Wave 1 touches; the record closes clean before fixing begins. |
| 3 | All remediation work happens on a dedicated **`remediation/exploratory-campaign`** branch **cut from `master`** — **never `integration`**, which holds an unrelated MCP POC (as of 2026-07-30). Wave 0 lands `explore/campaign` into it; wave fix branches come off it and merge back; promotion to `master` goes through the normal review gate when the owner calls it (per-wave or at program end). The campaign branch itself never takes product-code fixes. |
| 4 | **Flip rule on every fix PR** (ADR 0047 §2): probe promoted to main suite, known_issues annotated `Fixed in <sha>`, testing.md updated when suite-shaped. |
| 5 | Class gates land **in the wave that closes their class**, in the main suites (ADR 0047 §3) — never in the explore lane. |
| 6 | Agent = **repo skill `.claude/skills/explore.md`**, run via Claude Code interactive or `claude -p` under subscription auth — **no paid-API execution path** (ADR 0047 §4). |
| 7 | Cleanup = **method→skill, record→archive**: campaign records freeze to `docs/reviews/exploratory-2026-07/` when remediation starts; COLDSTART.md retires when the skill lands (ADR 0047 §5). |
| 8 | The 22 rulings ship inside their matching wave; rulings that amend ADRs (0006 SEL-15, 0023 PROJ-07, 0038 GPU-13, 0039 STYL-03) get dated addendums via `/feature extend` **in the same PR** as the code change. |
| 9 | GPU-13 (cross-type z-depth) and HIST-10 (page-stamped history) are **design-gated**: ADR amendment/design pass approved before implementation (Wave 5). |

## Sub-tasks

Per-wave working method: `grep "Found by:.*exploratory campaign" known_issues.md`, filter to the wave's ID prefixes, cluster by root cause, fix cluster-by-cluster. A wave is DONE when every one of its entries is `Fixed`-annotated, every probe is promoted, its class gates are green in CI, and `npm run test:regression` passes.

### Wave 0 — Close the campaign, land the branch ✅ 2026-07-30

- [x] A4: resolved FEX-08..15 — **all eight are bugs**, plus FEX-16 by anomaly capture. Area closed at 16/10, 15 bugs. Probed through the real `FileExplorer` with a react-arborist capture stub (`__explore__/A4/harness.tsx` + `arboristStub.tsx`); its header records the two rig traps this cost.
- [x] A5: closed at 12/10 — 10 bugs, 1 SUSPECT (CHR-08), 1 FALSIFIED (CHR-12). Scoped away from the auth seams (S1/S3 own them) onto the surfaces with zero tests: the quota-full storage escape hatch, boot utilities, deployment sniffing, locale catalogues.
- [x] LEDGER all-DONE (27/27) and the cross-area mop-up wave run: **MOP-01** (a copied diagram carries the original's `shareUuid` — A4 × A3 × S2) and **MOP-02** (S2/SHARE-06 and A4/FEX-02 contradicted each other; the SHARE-06 entry now carries the correction). Seven other pairs examined and found already crossed — listed in the LEDGER.
- [x] Cut `remediation/exploratory-campaign` from `master` and landed `explore/campaign` into it (merge `9fa70364`). `integration` untouched. Quarantine re-verified on the merge result with `--listTests`: app 26 / lib 155 / backend 7 / worker 4 suites and Playwright 178 tests in 75 files, **zero** exploratory files in any. Default suites green and unchanged (app 268 tests, lib 1738).
- [x] Owner triage of the one new SUSPECT — **A5/CHR-08 ruled 2026-07-30**: optional public base URL in the runtime config with page-origin fallback (option b). Recorded as the 22nd row of [DECISIONS.md](../exploratory/DECISIONS.md); implementation rides Wave 2's share cluster.

**Campaign totals after Wave 0:** 385 counted hypotheses, **240 bugs**, 22 product
questions, 190 filed known_issues entries. The wave counts below were written
against the pre-close-out numbers — Wave 4 now also carries A4's nine new
FileExplorer bugs and A5's ten, and Wave 2's share cluster carries MOP-01.

*Note: `npm run test:regression`'s e2e half was not re-run for this wave — Wave 0
lands documentation, quarantined probes and the three config lines only, and the
quarantine check above proves none of it reaches the regression suites. It runs
for the first product-code wave.*

### Wave 1 — Data integrity ✅ 2026-07-30

**Closed.** 46 campaign entries annotated `Fixed` (or `Partially fixed`, with the
remainder named and routed to the wave that owns it), every probe promoted or
retired with its reason recorded in place, two class-gate sections landed, and
`npm run test:regression` green. Three owner decisions were implemented:
STOR-11 (cache success only), ZIP-09 (one import flow), HIST-08 (delegate), plus
the **repair-don't-reject** ruling for identity/range violations already present
in users' files.

**Regression gate (final state):** `npm test` per package — lib **159 suites /
1780** (+1 skipped), app **34 / 356**, backend 7 / 102, worker 4 / 124 — and the
full Playwright suite **178 passed (23.8 min), exit 0**. `tsc --noEmit`,
`npx knip`, `check-cycles` (47, at baseline) and `lint:docs` all clean, and the
quarantine re-verified in both directions: zero `__explore__` /
`tests-exploratory` files discovered by any default config, and the lane itself
still runs (app 25 probe files, lib 34). This is the e2e half wave 0 deferred to
"the first product-code wave".

> **Two tooling traps this wave hit — read before running the gate.**
> `npm run test:e2e` does not work on this machine: the script's
> `node_modules/.bin/playwright` path is not resolvable by cmd.exe. Use
> `npx playwright test --config packages/axoview-e2e/playwright.config.ts`.
> And **do not pipe it through `tail`** — the pipeline's exit code is `tail`'s,
> not Playwright's, so a run with failures reads as exit 0. Three readings in
> this wave were wrong for exactly that reason: the ZIP-09 ruling had broken 13
> e2e journeys that piped runs reported as green. Run it unpiped and read the
> summary line, or use `--reporter=dot` and check the exit code.

- [x] **Autosave/save cluster (A1)** — `2b629c6e`. LIFE-01..09: flush-not-cancel
  on unmount / disable / reset, failed saves count as unsaved work in one
  `beforeunload` owner, the Retry gate reads the flush's own outcome, writes
  serialise.
- [x] **Single-source-of-truth cluster (A1/A2)** — `3af90693`. STOR-10/11/12 +
  LIFE-12: the manager singleton owns the active place, one `applyDiagramName`
  owns the title, `fetchRuntimeConfig` caches success only.
- [x] **Undo integrity cluster (E1/E3)** — `07c7fa78`, `1b916b01`. HIST-01
  (layer ops allocate their own sequence), HIST-05 (`withHistory` discards an
  armed snapshot on a throw), HIST-06 (the keydown dispatcher closes a leaked
  drag bracket), HIST-07 + HIST-08 (the transaction/drag/pending trio moves to
  the scene store's provider-scoped `editSession`; `useHistory.transaction`
  delegates), HIST-02 (a new action clears BOTH futures), and E3/SCN-08 as a
  consequence of the bracket no longer snapshotting the stores at open.
- [x] **`validateModel` identity/range gate (E2/E4)** — `5d6a969b`, `2168faa5`.
  Write sites: RED-03/04/05, SCN-13, CLIP-13. Load path (repair-don't-reject):
  CLIP-01, CLIP-15, RED-03's import half. **Class gate**
  (`schemas/__tests__/modelIdentity.contract.test.ts`) scans for the class in
  three sections — range (derived from `viewItemSchema` via `safeParse`),
  identity, and repair — and was verified able to go red.
- [x] **Storage provider cluster (A2/A3)** — `cef61900`, `11cae8e7`, `e894a593`,
  `96a8bff8`, `d195c032`, `2b0e5f41`, `087f3a8c`. The whole A3 project-ZIP block
  (ZIP-01, 02, 03, 05, 06, 07, 08, 10, 11, 13, 15 + the ZIP-09 ruling) and the
  whole A2 provider block (STOR-01..09, 13, 14, 16). **A2's twelve entries were
  filed to known_issues.md for the first time** — see the record correction.

**Deliberately not in wave 1, with the reason recorded in the entry:**

| Item | Routed to | Why |
|---|---|---|
| E1/HIST-04 (page creation not undoable) | Wave 5 | Undoing a `createView` while `ui.view` points at the created page leaves a dangling active view (E3/SCN-09's shape). Needs HIST-10's "always navigate". |
| E1/HIST-03 (independent 50-entry trimming) | Wave 5 | The two stacks trim independently; making one logical action trim as a unit is the same restructure HIST-10 needs (one shared stack / page-stamped entries). |
| E4/CLIP-14's icon-reference half | Wave 4 | `validateModelItem` leaves icon refs alone on purpose (icons come from packs loaded separately). The real fix is the `requiredPacks` derivation, which belongs with F5/ICON-01/02. |
| A2/STOR-14's override half | Wave 4 | Detecting a user's override of a bundled icon needs the bundled catalog — and the app's half of that catalog is empty, which IS F5/ICON-01/02. |
| A2/STOR-15 | Manual | Needs two live Google accounts; DEFERRED in the area file, never counted. |
| MOP-01 (`shareUuid` on every copy path) | Wave 2 | Copy identity belongs in one change across duplicate + both import paths, not spread across whichever path is touched first. |

**Two CI gates were red on this branch before wave 1 and are green now** — both
the same shape, the quarantined lane leaking into a gate ADR 0047 §1 says it must
never reach:

- `npm run lint` (`tsc --noEmit` per workspace) swept `src/__explore__`, which
  carries ~30 type errors by design. Both tsconfigs exclude it (`2b629c6e`).
- `npx knip` (hard-fail since 2026-06-10) reported every probe file as dead code.
  `knip.json` ignores the lane (`087f3a8c`).

*When adding a gate, check it against the lane as well as against the product.*

#### Wave 1 landed

| Commit | Closes |
|---|---|
| `2b629c6e` | A1/LIFE-01..09 · the tsc gate |
| `3af90693` | A2/STOR-10, 11 (ruling), 12; A1/LIFE-12 |
| `07c7fa78` | E1/HIST-01 |
| `5d6a969b` | E2/RED-03 (write site), 04, 05; E3/SCN-13; E4/CLIP-13 · **class gate** |
| `cef61900` | A3/ZIP-01 |
| `11cae8e7` | A3/ZIP-05, 07, 11, 13, 15 |
| `e894a593` | A3/ZIP-03, 10 |
| `96a8bff8` | A3/ZIP-08 |
| `d195c032` | A3/ZIP-02 |
| `2168faa5` | E4/CLIP-01, E4/CLIP-15, E2/RED-03 (import half) — repair-on-load |
| `1b916b01` | E1/HIST-02, 05, 06, 07, 08 (ruling); E3/SCN-08 |
| `2b0e5f41` | A2/STOR-01..09, 13, 14, 16 |
| `087f3a8c` | A3/ZIP-06, ZIP-09 (ruling) · the knip gate |
| `88394fa9`, `fb7ca596` | the 13 e2e journeys the ZIP-09 ruling changed, onto `helpers/import.ts` |

**Record correction carried out of wave 1:** area A2's thirteen confirmed bugs
each ended `known_issues: A2/STOR-nn` in the area file, but not one had reached
the register — it went straight from A1/LIFE-15 to A3/ZIP-01. All thirteen are
filed now. **Worth checking the same way for the other areas before trusting the
campaign's "190 filed entries" total.**

### Wave 2 — Trust & security ✅ 2026-07-30

**Closed.** **38 filed known_issues entries** annotated `Fixed` — 40 campaign
bug IDs, since the read-only keyboard entry covers PTR-01/02/03 as one — plus
**four owner rulings** (AUTH-13, SHARE-10, DRV-05, CHR-08) and MOP-01's copy
identity. Every probe promoted or retired with its reason recorded in place,
**four** class-gate files landed (each verified able to go red), and
`npm run test:regression` green.

**Regression gate (final state):** `npm test` per package — lib **162 suites /
1834** (+1 skipped), app **39 / 423**, backend **9 / 134**, worker **4 / 129** —
and the full Playwright suite **189 passed (25.3 min), exit 0**. `tsc --noEmit`
per workspace, `npx knip`, `check-cycles` (47, at baseline) and `lint:docs` all
clean, and the quarantine re-verified in both directions: zero `__explore__` /
`tests-exploratory` files discovered by any default config, and the lane itself
still runs (lib 34 probe files, app 13 — down from 34 as S1/S2/S3/MOP retired,
e2e 38).

*Run unpiped, per the wave 1 tooling note. The first full run was red on ONE
journey (J5.3) — see the window-bound-listener note above; that is the run that
earned its keep.*

- [x] **Readonly enforcement class (F2/I1/I5 subset)** — `72989e3a`.
  `readonlyPolicy.ts` gives every keydown surface an explicit `viewer`/`editor`
  access class and the dispatcher asks it; `ItemControlsManager` threads
  `readOnly` to all five element panels and `RightSidebar` derives it
  fail-closed from the prop OR the store. CTX-15 turned out **not** to be the
  pan path swallowing the click — `Pan.mouseup` always had the branch; a
  RAF-throttled mousemove landing after the press wrote `mouse.mousedown` back
  to null, so its "was this a click?" test could never hold. Ships **two**
  class gates (keyboard + panel), both per-surface opt-in. Follow-up
  `44b8dda4`: making that branch reachable exposed a second defect in it — the
  pointer listener is window-bound, so a release over the sidebar dismissed the
  panel and unmounted a link mid-click. Caught by the **full e2e run**, not by
  any unit gate; see the note on wave 3 below.
- [x] **Auth cluster (S1)** — `ded36c6b`. All twelve AUTH entries + the AUTH-13
  ruling. One correction to the record: AUTH-02's cause is not the status —
  fixing AUTH-01 moves the session out of `REFRESHING` while the superseded GIS
  request is still outstanding, so the store tracks that separately now
  (`_silentRequestOutstanding`). The promoted test caught it.
- [x] **Share backend cluster (S2)** — `6878df1c`. All twelve SHARE entries +
  the SHARE-10 ruling + `docs/deployment.md` §D.1. Note the SHARE-03/04 mutex
  is single-process — recorded in the entries rather than left implicit.
- [x] **Drive sharing cluster (S3)** — `1c49e6fa`. All ten DRV entries + the
  DRV-05 and CHR-08 rulings. DRV-09's embedded product question was decided
  (explain, don't suppress — see the S3 area file for why neither offered
  option was taken).
- [x] **MOP-01** — `7206d5e2`. One `stripSourceIdentity` helper across
  duplicate + both import paths, plus a backend-side strip on create.
- [x] **Sanitization edges (F1 subset)** — `798cae63`. Every JSX-built link
  surface and every `window.open` was **already** compliant: the campaign
  finding was a hole in the COVERAGE, not a live defect. Shipped as two class
  gates (lib + app) rather than a fix, so the next surface cannot omit it.

### Wave 3 — Interaction & rendering correctness ✅ 2026-07-31

**Closed.** **51 filed known_issues entries** covering **65 campaign bug IDs**:
**47 annotated `Fixed`**, **4 left open with their scope corrected in place**
(GPU-15, RND-07, RND-13/15, OVL-02 — see below). Five owner rulings implemented
(SEL-15, TCH-06, RND-14, PROJ-06, PROJ-07) with **three dated ADR addendums**
landed in the same PRs as their code: ADR 0006 §10 (additive marquee) and two on
ADR 0023 (PROJ-07 re-projection; PROJ-06 one ratio). Every promoted probe moved
into a main suite and trimmed from the lane, and the **layer-filter class gate**
shipped and was verified able to go red.

Eight commits, `ccb37580..df5e6bbe`:

| Commit | Cluster |
| --- | --- |
| `9b604bc5` | I1 — canvas keydown scoping |
| `132630da` | I2 — one end-of-pointer path, one canvas-drop test |
| `d5a3524d` | I3 — group integrity, additive marquee |
| `29eeb25d` | I4 — the connector tool distrusts its inputs |
| `99e8bed4` | I5 — pan does not disarm the tool; hidden means no chrome |
| `c8e99fb5` | R1 — frame the whole diagram, keep geometry agreeing |
| `3d93357a` | R2/R3 — the GPU substrate stops failing silently |
| `df5e6bbe` | R4/R5 — the DOM overlays agree with the canvas, **+ class gate** |

**Regression gate (final state):** `npm test` per package — lib **175 suites /
2022** (+1 skipped), app **39 / 423**, backend **9 / 134**, worker **4 / 129** —
and the full Playwright suite **250 passed (34.8 min), exit 0**, run unpiped per
the wave 1 tooling note. `npx knip`,
`check-cycles` (47, at baseline) and `lint:docs` clean; `tsc --noEmit` clean for
lib and app. *Backend has no package-root tsconfig and worker's test config has
pre-existing errors in `app.spec.ts`; both pre-date this wave, which touched
neither package.* Quarantine re-verified in both directions: zero `__explore__` /
`tests-exploratory` files discovered by any default config, and the lane still
runs (lib 28 probe files, app 13, e2e 35 — down from 34/13/38 as the promoted
probes retired).

**Four entries deliberately left open, with the analysis sharpened rather than
the work deferred silently.** Each says in `known_issues.md` what the recorded
fix direction got wrong:

- **GPU-15** — the border is four line quads plus join discs, so an SDF fill
  mode is not enough; the alternative changes every rectangle.
- **RND-07** — both directions are new interaction surface (a whole hit-proxy
  layer, or `<a>` resolution in the canvas click path). The finding that carries
  forward: ADR 0034's link feature has **no** end-to-end coverage of the resting
  state, so whichever route is taken must arrive with it.
- **RND-13/15** — a Renderer restructure that interacts with wave 5's GPU-13
  design. Wave 3 did land the neighbouring RND-14 ruling on the same
  `hybridIds` path.
- **OVL-02** — the counter-scale has **three** consumers, not the one the entry
  assumed. Landing a per-node scale on the GPU alone would reintroduce OVL-12,
  which this wave just fixed, from the other side.

**Corrections to the record.** Several recorded "fix directions" were wrong
about the cause — the wave 2 lesson held. GL-05's leak is key churn (so "evict
when content changes" can never fire); PROJ-10's layer order is not available to
`hitDetection` at all; GPU-01 and GPU-03 pull against each other, hence a
bounded attempt count rather than either proposed rule; RND-06's file-explorer
column is a prop, not store state; CONN-13 resolved as by-design. PROJ-04's
off-by-one showed up as a `SizeIndicator` snapshot moving 850 → 849 — a place
nobody had asserted.

**Two rig corrections**, both the same family as wave 2's TCH-14 false red:

1. `Fingers.cancel` dispatched a CDP `TouchCancel` with no remaining touch
   points, which is a protocol error — read as a confirmed bug under
   `test.fail()`. It now dispatches a synthetic per-pointer `pointercancel`
   when others remain.
2. **Jest's `expect` throws `"Expect takes at most one argument."`**, so a probe
   written in the Playwright `expect(value, 'message')` style is red whatever
   the code does. One OVL-14 probe was. A scan of every Jest suite in the repo,
   main and lane, found it to be the **only** occurrence; Playwright's 178 uses
   (including the campaign's e2e invariant fixture) are unaffected — had that
   form not worked there, every explore spec would have failed at the fixture.

**Tooling note carried forward:** the app resolves `axoview` to
`packages/axoview-lib/dist`, so **`npm run build:lib` before every Playwright
run** — otherwise a green fix reads as seven failing new specs.

### Wave 4 — Consistency & decided UX ✅ DONE (F-block + E2 remainder + A4/A5 new)

> **CLOSED 2026-08-02.** Every cluster is committed (`3c5c8a30..cbed965a`) and the
> OVL-02 full Playwright gate is green — see the Gate row. Read the per-cluster
> boxes below — each records what landed, what was corrected in the record, and
> what it learned.
>
> | | |
> |---|---|
> | **Committed** | F3 styling (`3c5c8a30`) · F1 text/label + E2/RED-06 + F4 layers incl. LAY-05/RED-13 + the lane rig gate (`77ced974`) · F5 icons (`9e657cec`) · E2 reference-integrity remainder + CLIP-14 (`e8b6d282`) · F2 annotation/view (`c326a4ff`) · A4 FileExplorer + FEX-01 re-derivation (`a70f1e6f`) · A5 chrome (`da2457ba`) · OVL-02 |
> | **Gate** | **GREEN 2026-08-02** — full Playwright **277 passed, 38.8 min** (every pre-existing spec, incl. `chromium-touch` 25/25); lib **195 suites / 2309**, app **50 / 555**; tsc + lint clean; `check:cycles` **47, OK** (it was red — see below). Earlier: 274 passed, 38.2 min after F2. |
> | **Not started** | — wave 4 is complete; wave 5 is design-gated on the two briefs below |
>
> **It took three full runs to get that green, and no run was red for OVL-02.**
> Worth reading before trusting any single full-suite result:
>
> | run | result | cause |
> |---|---|---|
> | 1 (wave-4 agent) | 252 passed, **25 failed** | the whole `chromium-touch` project failing at the app-boot locator, ~37 min into a 40.7-min run. One cause, not 25. |
> | 2 | 276 passed, **1 failed** | `multi-diagram` J5.2 — `strip-link-button` `disabled` for the full 30 s, i.e. the selection never landed. Touch project **25/25 green**, which settles run 1's diagnosis as run-position instability rather than a regression. |
> | 3 | **277 passed** (+4 expected reds) | green. J5.2 passed; touch 25/25 again. The 4 reds are wave 5's own `undo-page-navigation.spec.ts` against a `dist` that predates its fix. |
>
> Three rig lessons, all queued for the wave-6 appendix:
>
> - **A whole Playwright project can fail wholesale at app boot late in a long
>   run**, and it presents as N product regressions. Check whether the failures
>   share one locator and one project before diagnosing N bugs.
> - **A wave-N gate run sweeps up wave-N+1 spec files sitting in the tree.** Run 3's
>   four reds are wave 5's promoted spec, correct and failing only because
>   `build:lib` had not run. Harmless here because they were attributable at a
>   glance; it would not be if the new spec's name did not say which wave it
>   belongs to.
> - **Playwright wipes `outputDir` at the start of every run**, so a re-run
>   destroys the failure artifacts you were about to read. Copy them out first, or
>   tee the run log somewhere outside `test-results/` (both runs here logged to a
>   scratchpad file for exactly this reason).
>
> **A gate was red at `bfdc19ff` and nothing noticed.** `check:cycles` reported
> **48 vs a baseline of 47** — bisected with a detached worktree to `c326a4ff`
> (F2), where `uiStateStore → utils/annotationOps` closed a loop back through the
> `src/types` barrel. It stayed red for four commits, so the gate was not run after
> F2. Fixed by importing from `src/types/ui` directly. **The gate's own failure
> message is wrong**: it advises `import type`, but `check-cycles.js` runs madge
> with `skipTypeImports: false`, so a type-only edge still counts as one — verified
> experimentally before the real fix was found. Fixing the message belongs with the
> wave-6 gate work.
>
> **Ordering for the remainder (owner, 2026-07-31).** F5 → E2 remainder → F2 →
> A4 → A5 in root-cause cluster order, then **OVL-02 last-but-one** so its full
> Playwright cost merges into the wave-final gate — and **nothing render-touching
> after it**, because it changes rendered output for styled labels.
>
> **Where F5 starts, since it is not where the entry says.** ICON-01/02's
> recorded direction is "have `exportAsJSON` and the project-ZIP export call the
> same `leanIfModel` the storage providers use". That call cannot be made as
> written: `leanIfModel` is APP-side
> (`axoview-app/src/services/storage/leanModel.ts`, and it depends on
> `ALL_ICON_PACK_NAMES`), while `exportAsJSON` is LIB-side
> (`axoview-lib/src/utils/exportOptions.ts`). The lib cannot import from the app.
> So the first decision is *where the one lean-save lives* — move it into the lib
> with the pack list injected, or lean app-side before handing the model to the
> lib's exporter — and the same question decides STOR-14's override half, which
> needs a bundled catalog the app's half of does not have either.
>
> **Two tooling traps this wave added to wave 1's** — both now queued for the
> wave-6 rig-traps appendix, see below: concurrent Playwright runs HANG rather
> than fail, and `build:lib` over a live dev server poisons it into
> `Can't resolve 'axoview'` (which presents as every test failing). And machine
> speed is a confounder: this session ran ~4× slow for a while, which flipped a
> spec racing an internal retry budget to red with no code change.

- [x] **Styling cluster (F3)** — `3c5c8a30`. STYL-01/05/06 + the STYL-02/03/08
  rulings, all one defect seen from four sides: the strip derived every value
  from `bulk.ids[0]` while writing to everyone. Now a toggle asks the whole
  selection (tri-state, `aria-pressed="mixed"`), writes exactly the pressed
  field, and absolute controls show "Mixed". Two dated ADR addendums (0030 the
  bulk read contract, 0039 the no-colour representation) and the
  `bulkStyleFanOut` class gate, verified able to go red.
- [x] **Text/label cluster (F1)** — TXT-01/02, 04, 05, 06, 07 (ruling), 08, 09,
  13, 14, 15, **plus E2/RED-06** which turned out to be blocking TXT-04. ADR
  0034 addendum: the edit session is one history action and one cancel.
  **Three corrections to the record, all found by re-deriving before
  implementing:**
  - **TXT-14's proposed sniff does not fix its own example.** HTML tag names are
    case-insensitive, so `<T>` matches a `[a-z]` tag-shape regex under `/i` and
    would still be eaten by DOMPurify. The discriminator has to be the tag NAME.
  - **TXT-06 had a second cause the entry never named.** Sharing the click-away
    allow-list was necessary and not sufficient: `useInlineRename` committed on
    `blur`, and a plain mousedown on a strip control moves focus. *Focus leaving
    is not the user leaving* — the press-away handler is the authority now.
  - **TXT-13's second option was rejected** on re-derivation: recording the
    wrappers would make the fully-plain state unreachable from the strip and
    make the text box the one type whose toggle is not a toggle.
  - And **un-deadening struck again** (the wave-2 lesson): making cancel roll
    element-level writes back exposed that `finish('commit')` fell through to
    `onCancel()` when the text was untouched — invisible before, silent data
    loss after.
- [x] **Layers cluster (F4), 3 of 4** — LAY-01 (the layer stack keys the Label
  and Rectangle sorts, not `zIndex` alone), LAY-03 (`activeLayerId` in uiState +
  `activeLayerPatch` at the placement chokepoint, with two guards against a
  stale id becoming a RED-03 dangling reference), LAY-11 (`ItemReference[]`
  through to the reducer, which buckets by type — the fixture gives a node, a
  rectangle and a label the same id).
- [x] **LAY-05 + the RED-13 ruling — ONE change, because they are one gesture.**
  Deleting a layer that holds something asks "Keep contents (unassign)" vs
  "Delete contents too"; an EMPTY layer skips the dialog. LAY-05 is the warning
  case the ruling already specifies: visibility derives as
  `!layer || layer.visible`, so unassigning the members of a HIDDEN layer
  inverts their visibility, and the dialog now says so in an Alert instead of
  letting the user find out on the canvas. Six locale keys × 13 files.
  One thing neither entry mentions, which the reducer had to get right:
  "delete contents" also removes connectors **anchored to** a deleted node, or
  they would be left as E2/RED-07 anchors pointing at nothing.
- [x] **Icon cluster (F5) — ICON-01/02, 04, 05, 06 + STOR-14's override half +
  the app/lib dual-implementation class gate.** The ICON-01/02 direction was
  **amended by owner ruling** (ADR 0003 addendum 2026-08-01): the algorithm is
  the lib's, the catalog is a host-injected parameter, and `fixtures/icons.ts`
  is retired. Filling that fixture with the real catalog was the *rejected*
  alternative — it duplicates host data across the package boundary, bloats a
  standalone-published lib under a bundle-size gate, and drifts on every pack
  change. **The empty fixture was a symptom; the defect was a library holding
  an opinion about host data.**

  **There were THREE implementations, not two.** The app's jest mock stubbed
  `stripDefaultIcons` as `(model) => model`, and the lib's own `leanSave.test.ts`
  used the empty fixture as both catalog and data — asserting that `[]` strips
  to `[]`, and *explicitly skipping* the override case as "unreachable in
  production". The one suite whose job was to catch this could not see it. Both
  were rewritten; the mock now re-exports the real lib source.

  **Two corrections to the record.** The project ZIP was never fat — it archives
  stored blobs, which the providers already lean; the claim came from a dead
  import that was re-exported and never called. And the class gate had to be
  tightened after its first red-check: exempting `leanModel.ts` wholesale (the
  obvious thing, since the permitted composition lives there) let a duplicate be
  planted in the very file it used to live in.

  Two things the gate caught that no scan could: an id-keyed composition that
  kept or dropped every icon sharing an id together (E4/CLIP-01's class again),
  and the SAVE/EXPORT divergence on an unloaded pack icon — which is real, is
  host knowledge the lib cannot hold, and is now pinned as such rather than
  papered over.

  Still open in F5: **ICON-08** (a resized icon is only clickable on its
  original tile — a documented trade-off, not an oversight) and **CLIP-14's
  icon-reference half**, which needs the `requiredPacks` derivation and is
  unblocked by the new canonical catalog module.
- [ ] **E2 reducer remainder:** RED-01, 02, 07, 08, 14, 15. The harness is
  already promoted to `reducers/__fixtures__/reducerHarness.ts`.
- [ ] **Annotation/view cluster (F2):** VIEW-01/02, 03, 04, 05, 06, 07, 09 +
  the VIEW-13 (annotation Clear undoable, rides the VIEW-07 op-log) and VIEW-08
  (viewer session-only canvas mode) rulings.
- [ ] Wave 0's A4 (FEX-08..16) and A5 (CHR-01..11) bugs, slotted by root cause.
- [ ] **OVL-02 (from wave 3 — direction ruled 2026-07-31):** one PR, all three counter-scale consumers move together — per-label factor derived once in `config/labelSettings.ts` (effective-font, `max(1, floor/effective)`), consumed by the GL instance buffer (`i_misc.w`) and both hit layers' `--axoview-label-scale`; contract gate forbids counter-scale math outside the derivation; dated ADR 0015 addendum; **full** Playwright run (rendered output changes for styled labels). "Disable for restyled labels" rejected. Details in the known_issues entry.
- [x] **Lane rig gate (ruled 2026-07-31)** — [`jestExpectArity.contract.test.ts`](../../packages/axoview-lib/src/__tests__/jestExpectArity.contract.test.ts).
  Scans every Jest-context test file in all four workspaces, **lane included, as
  data** (the lane stays excluded from execution/tsc/knip). Playwright specs are
  deliberately out of scope — the form is legal there and used ~180 times.

  **It had to be a scanner, not a regex.** `expect(keyIn(layers, 'high'))` has a
  comma and a quote inside its ONE argument; all three hits the naive pattern
  produced on this repo were that shape. The check finds a comma at paren depth
  ZERO, outside strings, template-literal `${…}` and comments. Six pinned
  samples in both directions cover each of those, plus `softExpect(` /
  `this.expect(` which are different functions.

  Two CONTROLs keep it from going vacuously green (a path typo would otherwise
  pass): the sweep must find >150 files, must include `__explore__` ones, and
  must exclude `axoview-e2e`. **Verified red** by planting the trap in
  `R5/scale-ovl-02.explore.test.ts` — reported by file and line — then restored.

> **Inherited lane state (measured 2026-07-31, end of wave 3).** The jest explore
> lane is green except for **four** characterizations, all in wave-4 areas and
> all stale rather than broken: `F4/layers-lay-01-05-07-11` ×2 (LAY-01b, LAY-11)
> and `A4/filetree-fex-01-to-07` ×2 (FEX-01). Wave 1's RED-03/05 fixes changed
> the behaviour these two describe *through a second door* — the probes still
> assert the pre-fix world. Re-derive them as part of the F4/A4 work rather than
> treating them as new findings; they are not evidence of a live defect. The
> e2e lane and every other jest area are green.

### Wave 5 — Design-gated larges (rulings 2026-07-30)

> **RESUME POINT (2026-08-02).** Wave 4 is complete and committed. Both briefs
> are **drafted and awaiting owner sign-off — no implementation has started, by
> instruction.** Read them before writing any code:
>
> - [`wave5-brief-gpu-13-cross-type-depth.md`](wave5-brief-gpu-13-cross-type-depth.md)
> - [`wave5-brief-hist-10-page-stamped-entries.md`](wave5-brief-hist-10-page-stamped-entries.md)
>
> **Two things in the briefs change the shape of the task and should be read as
> findings, not as options:**
>
> 1. **GPU-13's "single canvas vs per-entity depth" is not a choice between two
>    alternatives.** Four separate WebGL contexts do not share a depth buffer, so
>    per-entity depth cannot order across them at all — it is a sub-decision
>    *inside* a merged canvas, not an alternative to merging. The brief
>    recommends the merge, with a draw-call batching measurement as the gate on
>    that recommendation.
> 2. **HIST-10 must land before HIST-04, not beside it.** Making `createView`
>    undoable on its own leaves `uiState.view` pointing at a deleted page
>    (E3/SCN-09's shape); the page stamp is what gives that undo somewhere
>    correct to navigate. HIST-03 stays separate — it is a trimming bug, and
>    pairing it would make either failure hard to attribute.

- [x] **HIST-10 + HIST-04 — DONE 2026-08-02.** §6 steps 1–3 as one change, exactly
  as signed off. Entries carry an optional `viewId`, stamped at the logical
  action's own boundary (`historySequence.ts`, beside `seq`); `useHistory` peeks
  it before stepping and switches pages via `switchView`; `createView` runs inside
  `withHistory`. Promoted: [`useHistory.pageStamp.test.tsx`](../../packages/axoview-lib/src/hooks/__tests__/useHistory.pageStamp.test.tsx)
  (15) + [`undo-page-navigation.spec.ts`](../../packages/axoview-e2e/tests/undo-page-navigation.spec.ts)
  (5). Both probes retired. **HIST-03 is untouched and still open**, strictly
  separate as ruled.

  **Three corrections to the brief, all found by implementing it.**
  - **The stores cannot read `uiState.view`.** They are created by providers that
    sit OUTSIDE `UiStateProvider`, so §3's "both stamped from the same
    `uiState.view` at the same moment" is not implementable as written. Both now
    read one logical-action register instead — which is *stronger*: the halves are
    stamped from a single value and cannot disagree even in principle. (§3 also
    says each store constructs entries at two sites; there is one. The two
    branches it describes are the sequence allocation.)
  - **§4's step 4 `resyncScene()` is wrong on the navigating path.** It is a
    same-page repair closed over the OLD active view; run after a navigation it
    checks the previous page's connectors against the new page's scene. The
    navigating path uses `switchView` — the primitive a tab click uses — whose
    SYNC_SCENE is a full deterministic rebuild that subsumes it. `resyncScene()`
    still runs, unchanged, whenever no navigation happens.
  - **The `model.views has it` guard is nearly unreachable through the public
    API**, because every inverse patch replaces the whole `views` array (HIST-06):
    an undo that steps past a page removal *restores* the page. The reachable case
    is HIST-03's half-step, and the test constructs it deliberately.

  **Unplanned: HIST-09 / D-9 closed as a side effect** — the cross-page phantom
  scene connector cannot form once the step lands on the page the entry belongs to
  and SYNC_SCENEs it. Promoted (orphan-count assertion, red-verified) before the
  probe was retired, since that was the only D-9 coverage in the repo.

- [x] **HIST-03 — DONE 2026-08-02**, its own change after the steps-1–3 commit, as
  scheduled mid-wave. The 50-entry cap becomes a 50-**logical-action** window
  (`retainWithinHistoryWindow`): both stores apply the identical predicate to the
  identical shared counter, so an action's two halves are always retained together
  or dropped together. Simpler than the entry's proposed "when a store evicts seq
  N, drop ≤ N from both stacks", which needs one store to reach into the other.
  Applied on READ as well as write — a store that has stopped writing must age out
  in step, and that lag *was* the bug. Promoted:
  [`useHistory.pairedTrim.test.tsx`](../../packages/axoview-lib/src/hooks/__tests__/useHistory.pairedTrim.test.tsx);
  probe retired.

  **The probe's first `it.failing` could never have flipped**, and did not — it
  asserted the shared seq must still be PRESENT in the model stack ("retain the
  pair") while its own comment allowed either resolution ("evicted together, or
  neither is"). The fix evicts the pair together. That is wave 4's
  over-specified-mechanism trap appearing in a probe nobody had re-read; the
  promoted regression asserts the OUTCOME instead — a text box that survives the
  cap *with* its scene size, and a model stack whose exhaustion leaves the scene
  stack nothing to give.

  **The cap's meaning changed deliberately** from "50 entries per store" to "the
  last 50 logical actions". HIST-15's silent-cap ruling is unchanged and the new
  meaning is closer to what it describes.
- [ ] **GPU-13:** ~~brief drafted → owner sign-off~~ **SIGNED OFF 2026-08-02** — Option A, measurement-first (the measurement selects sorted-draw vs depth-two-pass **inside** the merged context; it never un-merges); selection **order-preserving**; connector labels **out of scope** with the documented inconsistency + follow-up trigger → run §4 measurements → write the dated ADR 0038 §8 amendment → implement.

### Wave 6 — Program build-out (should-have)
- [ ] Write `.claude/skills/explore.md`: APPROACH distilled + COLDSTART flow + rig-traps appendix + delta-mode area selection (`git diff` vs last campaign end commit); regenerate-baseline step; **embed the end-of-session report contract** (Notes for Claude) so every future run ends with the same four-part report.

  **Rig-traps appendix — queued contents (grow this list, don't rediscover it):**
  - The Jest two-argument `expect(value, 'msg')` trap (wave 3) — and note that wave 4 lands a *gate* for it, so the appendix should point at the gate rather than rely on memory.
  - The wave 2/3 "a probe can be red for a reason that is not the bug" checklist (CDP `TouchCancel` protocol error; Jest `expect` arity).
  - **Wave 4: never run two Playwright invocations at once.** They share the dev-server port and the first HANGS rather than failing — an empty log and no error for as long as you let it.
  - **Wave 4: the e2e dev server serves the BUILT lib, so a lib source change is invisible to Playwright until `npm run build:lib` runs.** `prestart` does not build (only `prebuild` does), and `webServer.reuseExistingServer` will happily reuse a server holding a months-old `dist/`. The failure presents as *the element does not exist* / *the behaviour did not happen* — indistinguishable from a real product bug, and it cost a 11.3-minute run of 7 false reds (each burning the full per-test timeout) before the 1.3-minute green. Sequence: **stop the dev server → `build:lib` → let Playwright start a fresh one.** Note the ordering interacts with the trap below — build with the server DOWN, never over a live one.
  - **Wave 4: `npm run build:lib` over a live dev server poisons it** (`Can't resolve 'axoview'`), and it presents as every test failing at `waitForAppReady`, i.e. exactly like a boot-time product crash. **Precedent:** this is the same desync the perf harness has documented since 2026-06-15 — cross-link [testing.md "Engine performance harness → Gotcha"](../guidelines/testing.md#engine-performance-harness-2026-06-15--adr-0020), whose answer (`npm run perf` owns its server lifecycle) is the shape the explore lane should copy.
  - **Wave 4: machine speed is a confounder, not a constant.** 2026-07-31 ran ~4× slower than wave 3; a spec racing an internal retry/timeout budget flips red with no code change. Raise the timeout per-run on the CLI, never in the committed config, and check a suspicious red at a raised timeout before diagnosing it.
  - **Wave 4, GATE AUTHORING: an exemption must name the permitted CALL SITE, never the FILE.** The lean-save class gate exempted `leanModel.ts` from its duplicate scan, because the one permitted composition legitimately lives there — and a duplicate planted in that same file passed clean on the first red-check. A file-level exemption is a hole shaped exactly like the bug, since the duplicate's natural home *is* the file that already owns the concern. Name `applyIconStrip`, not `leanModel.ts`. Corollary: **red-verify a gate by planting the defect where it actually lived**, not in a convenient neighbouring file.
  - **Wave 4, FLIP RULE: promote what the probe PROVED, not what the fix TOUCHED.** Retiring `red-13-15.explore.spec.ts` would have left LAY-05/RED-13 with a reducer test and nothing else — and the ruling was *"the choice must be surfaced to the user"*, which no reducer test can fail on. Before deleting a probe, ask what it covered that the promoted regression does not. Sibling case in the same pass: RED-15's unit test proves the filter, and only the e2e proves the invalidation is *wired* — a unit test cannot fail if the effect is deleted.
  - **Wave 4, PROBE AUTHORING — four flavours of "cannot flip", all found in one wave.** A probe is only a flip detector if it exercises the SHIPPED path with the OUTCOME asserted. These four all passed review and none could ever have gone green:
    1. **Transcribes** the code under test (F2/VIEW-04 copied a `useCallback`'s gate into the test file) — it asserts its own copy. Fix: extract the predicate; the promoted regression then imports what ships.
    2. **Models** the callers instead of calling them (R5/OVL-02 called the pure math helper with the constant the callers pass) — it can only ever restate the bug. Fix: call the consumer, or gate the call sites by source scan.
    3. **Pins a MECHANISM** rather than an outcome (A4/FEX-08 demanded a specific call ordering; A4/FEX-09 demanded a delete; A5/CHR-05 demanded that `ready` settle) — a legitimate alternative fix reads as no fix. Fix: assert what the user sees.
    4. **Depends on a signal the runner cannot produce** (A5/CHR-07 keys off a build-time `NODE_ENV` jest sets to `'test'`). Fix: drive the signal explicitly, and verify where it matters — here, that the production bundle no longer contains the string at all.
  - **Wave 4, PROBE AUTHORING: a probe that pins a MECHANISM cannot flip on a legitimate alternative fix.** Two A4 entries recorded two acceptable fix directions; the fixes took the second one each time, and the probes — which asserted the first one's mechanism (`order` must not contain the canvas reset; the colliding sibling must be deleted) — stayed red as though nothing had been fixed. Assert the OUTCOME the user sees. This is the counterpart to the transcription trap below: one copies the code, the other over-specifies it.
  - **Wave 4, PROBE RIG: a source-scanning probe must resolve paths from `__dirname`, not from the runner's cwd.** `A4/filetree-fex-01-to-07` used repo-root-relative paths, which worked when the lane ran from the root and broke silently when it started running per-package: four probes threw ENOENT and *presented as four findings*. The wave-3 note recorded "two stale characterizations" in this file; it was six, and four were this.
  - **Wave 4, PROMOTION: the lane is tsc-EXCLUDED, the main suite is not.** Promoting a probe verbatim surfaces type errors it never had to satisfy — including the package's es5 traps (`[...nodeList]` is a tsc error; `[...someMap]` compiles and silently yields `[]`). Budget a typecheck pass per promotion, and move any shared harness out of `__explore__` at the same time (wave 6 archives that directory).
  - **Wave 4, PROBE AUTHORING: a probe that TRANSCRIBES the code under test can never flip.** F2/VIEW-04's probe copied `AnnotationLayer.endStroke`'s commit gate into the test file (`// transcribed:`) because the real one was buried in a `useCallback` inside a pointer-driven component. The gate was then fixed and the probe stayed green — it was asserting its own copy. This is the F5 duplicate-implementation class appearing in the LANE rather than in the product. When the real predicate is unreachable, **extract it** (here: `strokeHasExtent` into `utils/annotationOps`) rather than transcribing it; the extraction is usually the right change anyway, and the promoted regression then imports the thing that shipped.
  - **Wave 4, FLIP RULE: a fix can invalidate a NEIGHBOURING probe's premise.** The RED-07/RED-14 sweep removed the only route RED-09's probe had to `unroutable: true`, so that probe went red without RED-09 being fixed or refuted. Those need an explicit disposition in the area file ("no longer reachable via X; the underlying guard is unchanged; re-open if Y"), or the finding evaporates silently. A lane failure is not automatically a flip.
  - **Wave 4, PINS: re-verify a named pin red AFTER the pass that was supposed to keep it green**, not only when it is written. A pin that asserts a symptom class can start passing for a reason unrelated to the mechanism it guards. Revert the write path deliberately and check that the pin — and *only* the pin — goes red.
- [ ] Headless path: verify `claude -p "/explore"` cold-start on this machine (subscription auth, no API key); document optional Task Scheduler wiring in the skill.
- [ ] Archive: `git mv` campaign records → `docs/reviews/exploratory-2026-07/`; retire COLDSTART.md; fix inbound links (docs lint green).
- [ ] Update workflow.md decision table (+ one line in testing.md) so `/explore` is discoverable.

## Wrap-up

When all sub-tasks are complete and `npm run test:regression` passes:

1. Add a single line under the relevant `PLAN.md` phase section:
   ```
   - Exploratory remediation shipped (220+ campaign bugs, 22 rulings, /explore agent) — see docs/adr/0047 and this file's git history.
   ```
2. Delete this file. The ADRs are the durable record.
3. Update the `exploratory-campaign` memory pointer (campaign archived; remediation shipped).

## Notes for Claude

- **End-of-session report contract (owner-mandated 2026-08-02).** The final message of every session has exactly four parts, in this order, and nothing else:
  1. **Shipped:** one line per commit (sha — what).
  2. **Gate:** one line — suites/e2e counts, green or red.
  3. **Next:** ONE sentence — the first action of the successor session. All further detail goes in this file's resume point, not in chat.
  4. **Owner:** the word **"nothing"**, or ONE question with a recommended default so it can be answered in a word. If several questions compete, ask the most blocking one; record the rest in the resume point as "proceeding with X unless overruled".

  Findings, corrections, and lessons are written into their homes (entries, this file, testing.md) and *linked*, never restated in the report. A report the owner cannot act on in under a minute is a defect in the report.
- **`integration` is off-limits for this program** (unrelated MCP POC in flight, 2026-07-30): never base, merge, or rebase remediation work there. The base is `remediation/exploratory-campaign` off `master`.
- **The flip rule is per-PR, not per-wave** — never batch "promote probes later"; a fixed bug with its probe still in the lane is an incomplete fix.
- Fix sessions should read the area file for the bug's ID prefix first: the campaign's rig notes (A1 harness `consumeLoadEcho`, A2 fetch doubles, jsdom canvas stub, `async ({page, app})` fixture trap) are recorded there and cost ~10 wrong verdicts to learn.
- Cluster fixes cross packages (lib + app) — build after every section; e2e runs need `workers: 1` and a dev-build debug bridge.
- Commitlint: lower-case subject start (`fix(explore-w1): …` works; wave-scoped scopes keep the history greppable).
- Bug counts per wave are filed-entry counts, not effort estimates — clusters collapse many entries into one change (the autosave cluster is 5 entries, one defect).
