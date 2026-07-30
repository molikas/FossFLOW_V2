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
- [ ] **Autosave/save cluster (A1):** flush-not-cancel on unmount/disable/reset; failed saves count as unsaved work in both `beforeunload` guards; un-stale the Retry gate. (Thread A-b/A-c in the area files.)
- [ ] **Single-source-of-truth cluster (A1/A2):** active place, diagram title, unsaved-work tri-state — one owner each (thread A-a); STOR-11 config-probe cache-success-only ruling.
- [ ] **Undo integrity cluster (E1/E3):** orphaned `pendingPre`, no-op-set snapshot swallow, seq pinning, per-view resync (D-9/SCN-15/SCN-08 share one per-view-scene fix), HIST-08 delegation ruling.
- [ ] **`validateModel` identity/range gate (E2/E4):** duplicate ids, dangling layer refs, unbounded tiles, colliding layer order, duplicate page names — one validation pass closes ~7 entries; ships as a **class gate** (main-suite contract test).
- [ ] **Storage provider cluster (A2/A3):** remaining STOR/ZIP entries incl. ZIP-09 single-import-flow ruling and the ZIP-01 non-terminating walk.

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
