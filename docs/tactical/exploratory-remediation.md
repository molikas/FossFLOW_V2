# Tactical — Exploratory Campaign Remediation (all 220 bugs) & Program Build-out

> **Read first:**
> - [ADR 0047 — Exploratory Testing Program](../adr/0047-exploratory-testing-program.md) — the lane, the flip rule, class gates, the agent contract
> - [docs/exploratory/DECISIONS.md](../exploratory/DECISIONS.md) — the 22 owner rulings this plan implements (incl. the ADR amendments each ruling names)
> - [docs/exploratory/LEDGER.md](../exploratory/LEDGER.md) — per-area bug counts; [known_issues.md](../../known_issues.md) — the 172 filed entries (`Found by: exploratory campaign <ID>`)
>
> **Status:** Waves 0, 1 and 2 COMPLETE · **Owner:** molikas · **Last updated:** 2026-07-30
>
> Wave 3 is next. Read the wave 1 and wave 2 sections first — between them they
> carry the items deliberately routed forward (HIST-03/04 to wave 5, CLIP-14 and
> STOR-14's override half to wave 4), the two CI gates the probe lane had broken,
> and the four class gates now in place.
>
> **Two things wave 2 learned that wave 3 will need.**
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
1833** (+1 skipped), app **39 / 423**, backend **9 / 134**, worker **4 / 129** —
and the full Playwright suite (see the run recorded at the end of this section).
`tsc --noEmit` per workspace, `npx knip`, `check-cycles` and `lint:docs` all
clean.

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

### Wave 3 — Interaction & rendering correctness 🟡 (I1–I5, R1–R5, ~67 filed bugs)
- [ ] **Gesture/mode state machines (I-block):** cancel/interrupt leaks incl. TCH-06+TCH-14 shared `endPointer`; SEL-15 additive marquee (+ ADR 0006 addendum).
- [ ] **Projection cluster (R1):** PROJ-06 exact ratio, PROJ-07 offset re-projection (+ ADR 0023 addendum), remaining PROJ entries.
- [ ] **Renderer/overlay cluster (R2–R5):** RND-14 reveal-then-act (cull bypass for promoted ids), layer-filter omissions (ships the **layer-filter class gate**), parity and invalidation entries.

### Wave 4 — Consistency & decided UX 🟡 (F-block + E2 remainder + A4/A5 new, ~40 filed bugs)
- [ ] **Styling cluster (F3):** STYL-01/06 fixes + STYL-02/03/08 rulings (+ ADR 0039 addendum).
- [ ] **Text/label cluster (F1):** TXT-07 lifecycle parity + remaining TXT entries; **app/lib dual-implementation class gate** (dead lean-save half, ICON-01/02/05).
- [ ] **Layers/annotation/view cluster (F2/F4/E2):** RED-13 confirm dialog, VIEW-07+VIEW-13 op-log, VIEW-08 session-only viewer toggle, LAY structural entries, ICON remainder.
- [ ] Wave 0's A4/A5 bugs, slotted by root cause.

### Wave 5 — Design-gated larges (rulings 2026-07-30)
- [ ] **HIST-10:** design note for page-stamped history entries (entry shape touches both stores) → implement always-navigate undo.
- [ ] **GPU-13:** ADR 0038 amendment + design pass for cross-type z-depth (single canvas vs per-entity depth) → owner sign-off → implement.

### Wave 6 — Program build-out (should-have)
- [ ] Write `.claude/skills/explore.md`: APPROACH distilled + COLDSTART flow + rig-traps appendix + delta-mode area selection (`git diff` vs last campaign end commit); regenerate-baseline step.
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

- **`integration` is off-limits for this program** (unrelated MCP POC in flight, 2026-07-30): never base, merge, or rebase remediation work there. The base is `remediation/exploratory-campaign` off `master`.
- **The flip rule is per-PR, not per-wave** — never batch "promote probes later"; a fixed bug with its probe still in the lane is an incomplete fix.
- Fix sessions should read the area file for the bug's ID prefix first: the campaign's rig notes (A1 harness `consumeLoadEcho`, A2 fetch doubles, jsdom canvas stub, `async ({page, app})` fixture trap) are recorded there and cost ~10 wrong verdicts to learn.
- Cluster fixes cross packages (lib + app) — build after every section; e2e runs need `workers: 1` and a dev-build debug bridge.
- Commitlint: lower-case subject start (`fix(explore-w1): …` works; wave-scoped scopes keep the history greppable).
- Bug counts per wave are filed-entry counts, not effort estimates — clusters collapse many entries into one change (the autosave cluster is 5 entries, one defect).
