# Tactical — Exploratory Campaign Remediation (all 220 bugs) & Program Build-out

> **Read first:**
> - [ADR 0047 — Exploratory Testing Program](../adr/0047-exploratory-testing-program.md) — the lane, the flip rule, class gates, the agent contract
> - [docs/exploratory/DECISIONS.md](../exploratory/DECISIONS.md) — the 22 owner rulings this plan implements (incl. the ADR amendments each ruling names)
> - [docs/exploratory/LEDGER.md](../exploratory/LEDGER.md) — per-area bug counts; [known_issues.md](../../known_issues.md) — the 172 filed entries (`Found by: exploratory campaign <ID>`)
>
> **Status:** Wave 0 COMPLETE (campaign closed, 22 rulings, branch cut) · **Owner:** molikas · **Last updated:** 2026-07-30
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

### Wave 1 — Data integrity 🔴 (E1/E3/E4 + A1/A2 clusters, ~86 filed bugs)

**Progress 2026-07-30:** clusters 1 and 2 complete; cluster 3 partially done
(seq-pinning half); cluster 4 partially done (class gate + everything closable at
a write site); cluster 5 half done (the whole A3 project-ZIP block bar ZIP-06/09; the twelve A2
entries remain). Every landed item carries its
promoted regression and its `Fixed in <sha>` annotation — see "Wave 1 landed" below.

- [x] **Autosave/save cluster (A1):** flush-not-cancel on unmount/disable/reset; failed saves count as unsaved work in both `beforeunload` guards; un-stale the Retry gate. (Thread A-b/A-c in the area files.) — `2b629c6e`, LIFE-01..09.
- [x] **Single-source-of-truth cluster (A1/A2):** active place, diagram title, unsaved-work tri-state — one owner each (thread A-a); STOR-11 config-probe cache-success-only ruling. — `3af90693`, STOR-10/11/12 + LIFE-12 (the unsaved-work tri-state landed with the autosave cluster).
- [ ] **Undo integrity cluster (E1/E3):** orphaned `pendingPre`, no-op-set snapshot swallow, seq pinning, per-view resync (D-9/SCN-15/SCN-08 share one per-view-scene fix), HIST-08 delegation ruling.
  - [x] Seq pinning — HIST-01 (`07c7fa78`): `useLayerActions.commit()` allocates its own logical-action sequence and arms both stores.
  - [ ] Orphaned `pendingPre` (HIST-05) — needs a `withHistory(...)` wrapper around the ~21 mutating bodies in `useSceneActions` so a throwing reducer discards the armed snapshot instead of leaving it for the next `skipHistory` writer.
  - [ ] Per-hook-instance transaction/drag state (HIST-06, HIST-07) **and the HIST-08 delegation ruling** are one change: `transactionInProgress` / `dragInProgress` / `pendingStateRef` must move from per-hook refs to provider-scoped state. Delegating `useHistory.transaction` to a *fresh* `useSceneActions()` instance does **not** satisfy the ruling — the caller's own instance still wouldn't be suppressed.
  - [ ] No-op-set snapshot swallow (HIST-02): the fix is cross-store — a new logical action must invalidate the redo future on BOTH stacks. Note the tension with the MQA #5 comment in `sceneStore.set()` (a transient no-op write must NOT clobber `future`); the discriminator is "new logical action" vs "coordinated write", not "zero patches".
  - [ ] Trim asymmetry (HIST-03) and per-view scene (D-9/SCN-15/SCN-08) both point at the same restructure: one shared history stack, and scene history keyed by view. Size this with HIST-10 (wave 5) rather than patching around it.
  - [ ] **HIST-04 is deliberately deferred to wave 5**: making `createView` undoable while `ui.view` still points at the created page leaves a dangling active view (E3/SCN-09's shape). It needs HIST-10's "always navigate" ruling.
- [~] **`validateModel` identity/range gate (E2/E4):** duplicate ids, dangling layer refs, unbounded tiles, colliding layer order, duplicate page names — one validation pass closes ~7 entries; ships as a **class gate** (main-suite contract test). — `5d6a969b`, partial.
  - [x] Class gate landed: `schemas/__tests__/modelIdentity.contract.test.ts`. It *scans* for the class — the range half derives the bounded fields from `viewItemSchema` via `safeParse`, so a new schema bound without a write-site clamp fails it. Verified it can go red. It found one unfiled instance (`zIndex` declared `int()`, fractional writes accepted); also clamped.
  - [x] RED-04/RED-05 (layer `order` permutation), SCN-13 (page names), CLIP-13 (`iconScale` clamp), RED-03 write-site half.
  - [ ] **Owner call needed before the rest: reject or repair?** CLIP-01 (duplicate ids), CLIP-15 (unbounded tiles) and RED-03's import/paste half all concern violations that are *already in users' saved files* — that is the bug. Adding the check to `validateModel` makes `modelSchema.safeParse` fail, i.e. those files stop opening, which is exactly the harm E4/CLIP-02 is filed for. The alternatives are (a) repair-on-load (dedupe/drop/clamp silently, notify), (b) repair + a one-time report, (c) hard reject. Wave 1 fixed only what could be closed at the write site, where refusing is free. CLIP-14's icon-ref half additionally conflicts with the deliberate "icons may come from packs not in `model.icons`" decision in `validateModelItem` and needs the `requiredPacks` derivation its entry names.
- [~] **Storage provider cluster (A2/A3):** remaining STOR/ZIP entries incl. ZIP-09 single-import-flow ruling and the ZIP-01 non-terminating walk. **Also files the missing A2 known_issues entries** — see the record correction below.
  - [x] **The whole A3 project-ZIP block except ZIP-06/ZIP-09**: ZIP-01 (`cef61900`), ZIP-05/07/11/13/15 (`11cae8e7`), ZIP-03/10 (`e894a593`), ZIP-08 (`96a8bff8`), ZIP-02 (`d195c032`). The lane file is down to the three FALSIFIED rows (`zip-04-12-14.explore.test.ts`).
  - [ ] **ZIP-06 + the ZIP-09 single-import-flow ruling** — one item, not two. ZIP-06 (a single-JSON import can file itself into a folder that does not exist) is a field-whitelist fix on the JSON path, and the ruling reshapes that path anyway: every entry point opens `ImportDialog`, the empty tree preselects root instead of skipping the dialog, and the resolved destination place is named on screen and passed explicitly. Do them together.
  - [ ] **A2/STOR-01..09, 13, 14, 16** — twelve entries, **none of which has a known_issues entry yet** (see the record correction). File each as you fix it. This is now the largest remaining block in wave 1.

**Regression gate (2026-07-30, run against the final state of the commits below):**
`npm test` per package — lib **157 suites / 1753** (+1 skipped), app **30 / 300**,
backend 7 / 102, worker 4 / 124 — and the full Playwright suite **178 passed
(26.2 min)**. `tsc --noEmit` clean in both packages, docs lint OK. This is the
e2e half wave 0 deferred to "the first product-code wave".

*(`npm run test:e2e` does not work on Windows — the script's
`node_modules/.bin/playwright` path is not resolvable by cmd.exe. Use
`npx playwright test --config packages/axoview-e2e/playwright.config.ts`.)*

#### Wave 1 landed (2026-07-30)

| Commit | Closes | Promoted to |
|---|---|---|
| `2b629c6e` | A1/LIFE-01, 02, 03, 04, 05, 06, 07, 08, 09 | `hooks/__tests__/useAutoSave.test.ts`, `providers/__tests__/DiagramLifecycleProvider.save.test.tsx` |
| `3af90693` | A2/STOR-10, 11 (ruling), 12; A1/LIFE-12 | `providers/__tests__/AppStorageContext.place.test.tsx`, `services/storage/__tests__/StorageManager.test.ts`, `hooks/__tests__/useRuntimeConfig.test.ts`, the provider save suite |
| `07c7fa78` | E1/HIST-01 | `hooks/__tests__/useLayerActions.history.test.tsx` |
| `5d6a969b` | E2/RED-03 (write site), RED-04, RED-05; E3/SCN-13; E4/CLIP-13 | `schemas/__tests__/modelIdentity.contract.test.ts` (the class gate) |
| `cef61900` | A3/ZIP-01 | `services/project/__tests__/projectZip.test.ts` |
| `11cae8e7` | A3/ZIP-05, 07, 11, 13, 15 | same, + `utils/__tests__/importSummary.test.ts` |
| `e894a593` | A3/ZIP-03, 10 | `services/project/__tests__/projectZip.test.ts` |
| `96a8bff8` | A3/ZIP-08 | `components/__tests__/ImportErrorDialog.test.tsx` |
| `d195c032` | A3/ZIP-02 | `services/project/__tests__/projectZip.test.ts` |

Two things found while landing it, both recorded where they belong:

- **The CI type-check gate was red on this branch.** `npm run lint` is
  `tsc --noEmit` per workspace and it swept `src/__explore__`, which carries
  ~30 type errors by design (probes are written fast and type-checked per-file
  by ts-jest). ADR 0047 §1 says the lane never reaches CI; both packages'
  `tsconfig.json` now exclude it. Fixed in `2b629c6e` — it had been red since
  wave 0 merged the campaign branch.
- **Area A2's known_issues entries were never filed.** The area file records 13
  confirmed bugs, each ending `known_issues: A2/STOR-nn`, but the register goes
  straight from A1/LIFE-15 to A3/ZIP-01. A record correction sits at the head of
  where they belong (`029a8b47`), with STOR-11 and STOR-12 filed. **Wave 1's
  storage cluster must file the remaining eleven as it fixes them** — do not
  assume an entry exists to annotate.

### Wave 2 — Trust & security 🟠 (S1/S2/S3 + readonly class, ~40 filed bugs)
- [ ] **Readonly enforcement class (F2/I1 subset):** enumerate every mutation surface against the readonly gate (VIEW-11, PTR-01..03, CTX-15); ships the **per-surface-opt-in class gate**.
- [ ] **Auth cluster (S1):** all AUTH entries + AUTH-13 hint ruling (email required; stop persisting empty-email profiles).
- [ ] **Share cluster (S2/S3):** all SHARE/DRV entries + SHARE-10 exemption-pair ruling (+ deployment.md) + DRV-05 refresh-in-catch ruling + **A5/CHR-08 public-base ruling** + **MOP-01** (strip `shareUuid`/`sharedAt` in every copy path: duplicate, project-ZIP import, single-JSON import).
- [ ] **Sanitization edges (F1 subset):** rel=noopener on JSX-built link surfaces outside the sanitizer path.

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
