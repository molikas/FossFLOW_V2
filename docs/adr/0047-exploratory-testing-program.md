# ADR 0047 — Exploratory Testing Program: Permanent Probe Lane, Promotion Protocol, and Subscription-Run Agent

**Status:** Accepted
**Date:** 2026-07-30
**Supersedes:** none
**Superseded by:** none

## Context

The 2026-07 exploratory campaign ([docs/reviews/exploratory-2026-07.md](../reviews/exploratory-2026-07.md)) probed 362 falsifiable hypotheses across 27 functional areas and confirmed **220 bugs and 22 product gaps** — while all 2,231 unit tests and 76 e2e specs were green. Every finding was, by construction of the campaign's novelty rule, outside existing coverage. The 22 gaps were closed with owner rulings on 2026-07-30 ([rulings table](../reviews/exploratory-2026-07.md#owner-rulings-2026-07-30)); 172 entries were filed to [known_issues.md](../../known_issues.md), each carrying a committed `test.fail()` repro probe in a quarantined test lane.

That result forces three durable decisions: what the probe lane *is* now that the campaign is over (scaffolding to delete, or infrastructure to keep), how probes and findings flow back into the regression suites as fixes land, and whether the exercise repeats — and if so, by whom and on whose bill. The owner decided (2026-07-30): fix **all 220** in risk-ordered waves; keep the harness; rebuild the campaign as a repeatable repo skill; **never depend on paid API access** — everything runs under a Claude subscription via Claude Code.

## Decision

### 1. The exploratory lane is permanent infrastructure

The quarantined probe lane — `packages/axoview-e2e/playwright.explore.config.ts` + `tests-exploratory/`, the four per-package `jest.explore.config.js` + `__explore__/` trees, and the root `explore:*` scripts — is retained indefinitely. Its two invariants are unchanged from the campaign: **never runs in CI or the default suites**, and **never feeds the coverage ratchet**. It exists so that a failing repro can always be committed the day a bug is found, without touching the regression gates.

### 2. Probe promotion protocol (the flip rule)

A campaign probe for a confirmed bug is committed as `test.fail()` / `it.failing` and stays in the lane while the bug is open. **The PR that fixes the bug must, in the same change:**

1. flip the probe to a plain passing test and **move it into the appropriate main suite** (or fold its assertion into an existing suite);
2. annotate the known_issues.md entry `**Status:** Fixed in <sha> (date)` (entries are never deleted — existing convention);
3. update [testing.md](../guidelines/testing.md) when the promotion adds or reshapes a suite.

This is the **only** sanctioned migration out of the lane. A probe that flips to unexpected-pass without its bug being deliberately fixed is a signal to investigate, not to promote.

### 3. Bug-class contract gates

When a campaign (or any review) shows the same defect *shape* recurring across surfaces, the remedy includes a **main-suite contract test** that scans for the class, on the model of [`renderedGeometry.contract.test.ts`](../guidelines/testing.md#adr-0023-hardening-additions--off-grid-rendered-geometry-2026-07-23). Seed classes from this campaign: model identity/range validation (duplicate ids, unbounded values), per-surface readonly opt-in (every panel must enumerate against the readonly gate), app/lib dual implementations of one contract, and layer visible/locked filter re-application in new paint/affordance layers. Each fix wave that closes a class lands its gate in the same wave.

### 4. The recurring agent: a repo skill, run on subscription only

The campaign method (hypothesis ledger, novelty rule, probe tiers, oracles — APPROACH.md, retired to git history with the campaign tree) is repackaged as a versioned project skill, **`.claude/skills/explore.md`**, replacing the hand-carried COLDSTART.md prompt. Properties:

- **Stateless and ledger-driven**, like the campaign: all state in the ledger/area files of the active campaign directory; any Claude Code session can cold-start a wave.
- **Delta-campaign mode is the default:** a new run scopes areas by `git diff` against the last campaign's end commit (plus one cross-pair mop-up wave), regenerating the coverage baseline first so the novelty rule stays honest. Full 27-area sweeps are explicit opt-in.
- **Runtime contract: Claude Code under the user's subscription** — interactively (`/explore` in a session) or headless (`claude -p "/explore …"`), optionally cron'd via Windows Task Scheduler. **Execution paths that bill a metered API key are out of contract.** Cloud-scheduled routines may be adopted later only if verified to run under subscription auth.

### 5. Record lifecycle: method lives in the skill, records freeze as reviews

When remediation begins (campaign closed — all 27 areas DONE), the campaign's *records* — LEDGER.md, areas/, DECISIONS.md, coverage-baseline.md — freeze under **`docs/reviews/exploratory-2026-07/`** per the frozen-review convention, with links from known_issues.md left intact. The *method* docs (APPROACH.md distilled, COLDSTART.md retired) fold into the skill. Each future campaign creates a fresh working directory and archives the same way. `coverage-baseline.md` is a regenerated artifact, never hand-maintained across campaigns.

## Consequences

**Positive:**

- A bug found is a bug pinned: the lane makes committing a red repro free, and the flip rule turns every fix into permanent regression coverage.
- The 0.6-bugs-per-hypothesis yield becomes repeatable at delta cost (~2–4 areas per release) instead of a 27-area one-off.
- No standing API spend; the agent's cost is subscription capacity the owner already pays for.
- Class gates shrink future campaigns: a class killed by a contract test cannot refill the ledger.

**Negative / risks:**

- A permanent quarantined lane can rot silently (probes drifting from product reality). Mitigation: delta campaigns touch the lane every cycle, and the flip rule keeps it draining.
- Headless subscription runs share the owner's rate limits with interactive work; long sweeps must be scheduled accordingly (the campaign's incremental-ledger discipline already tolerates session death).
- "Fix all 220" is a large program; the risk of drift is carried by the tactical (`docs/tactical/exploratory-remediation.md` — retired 2026-08-09 when the program closed; git history is the record), not this ADR.

## Implementation notes (non-binding)

- The skill distills COLDSTART.md §"Rig traps" and the reusable rigs (A1 harness, A2 fetch doubles, canvas stub) into a traps appendix — that knowledge cost ~10 wrong verdicts to learn.
- Headless entry: `claude -p "/explore" --permission-mode acceptEdits` from the repo root; Task Scheduler examples belong in the skill, not here.
- Archive move is `git mv` so history follows the files.

## Addendum — 2026-07-30, campaign close-out

This ADR was written while two areas were still open (A4 at 7/10, A5 at 0/10).
Wave 0 of the remediation tactical (`docs/tactical/exploratory-remediation.md`,
retired 2026-08-09) closed both and ran the mop-up wave, so the Context's figures are superseded by:
**385 counted hypotheses across 27 areas + 1 cross-area mop-up wave, 240
confirmed bugs, 22 product questions, 190 filed known_issues entries.** The
decisions themselves are unchanged — the close-out reinforced two of them:

- **§3 (bug-class contract gates).** A5/CHR-11 found the app/lib
  dual-implementation class at *five* copies of one download helper, and
  A5/CHR-09/10 found a class with no gate at all (locale catalogues drifting from
  `en-US` in both directions, with no key-set check anywhere). Both belong to the
  seed class list.
- **§5 (records freeze, method lives on).** The mop-up wave's second finding
  (MOP-02) was a *contradiction between two filed entries* — S2/SHARE-06 assumed
  a UI delete path that A4/FEX-02 later proved has no caller. Frozen records go
  stale against the code; the correction is recorded in the entry itself, and the
  skill's delta mode (which re-derives the coverage baseline each run) is what
  keeps this from accumulating.

One new product question (A5/CHR-08 — which origin a share link should be
anchored to) is recorded in the A5 area file with an industry-practice analysis
and a recommendation, awaiting an owner ruling like the other 21.

## Addendum — 2026-08-09, program closed

All seven waves are shipped and the tactical is retired; this ADR and
[docs/reviews/exploratory-2026-07.md](../reviews/exploratory-2026-07.md) are
the durable record, with the per-wave detail in git history.

**Every acceptance criterion below is met.** The lane's quarantine holds and is
now green on *both* its CI gates for the first time — wave 6 found `npx knip` had
been failing since wave 4 moved a harness out of `__explore__`, two waves after
`tsc --noEmit` had been fixed the same way. The pattern is worth naming: **a gate
this ADR excludes the lane from is a gate nobody watches.** Check exit codes, not
output, at every wave boundary.

**What the program actually cost and returned:** 240 confirmed bugs fixed across
waves 1–6, 22 owner rulings implemented, a dozen recorded root causes *corrected*
while being fixed, ~15 class gates landed (each verified able to go red), and one
substrate restructure (the four-canvas merge) that a bug cluster justified but no
performance argument would have. The final sweep closed the picker's half of that
merge. Full regression at close: lib 199 suites / 2346, app 50 / 555, backend
9 / 134, worker 4 / 129, Playwright 286 / 38.4 min, tsc + knip + cycles + docs
lint clean.

## Addendum — 2026-08-08, the skill lands and the record freezes

Wave 6 built §4 and executed §5. Three notes where the build differs from the
plan, each recorded here rather than silently:

- **The skill is `.claude/commands/explore.md`, not `.claude/skills/explore.md`.**
  §4 named a path this repo does not use: its six existing project commands
  (`/audit`, `/docs-sweep`, `/feature`, `/notes`, `/shake-out`, `/ship`) all live
  in `.claude/commands/`, and that is the directory Claude Code resolves a
  project `/name` from. A skill in the named path would not have been invocable,
  which defeats the acceptance criterion below. Everything else about §4 stands.
- **APPROACH.md was archived, not deleted.** §5 puts it with COLDSTART.md in
  "method docs fold into the skill", and its content did. But the frozen area
  files and ~24 probe-lane files cite its section numbers throughout
  (`APPROACH.md §7`, `§4`), and deleting it would break every one of those
  citations inside a record whose whole value is being readable years later. It
  sits in the archive marked superseded, with the README stating that the skill
  wins where the two disagree. COLDSTART.md **was** deleted as §5 says: it was
  purely operational, and two cold-start prompts in one tree would drift.
- **The delta anchor needed a home.** §4's "diff against the last campaign's end
  commit" has no meaning unless something records which commit that was, so the
  archive carries a LAST-SWEEP record (since 2026-08-09: the
  [delta-anchor section](../reviews/exploratory-2026-07.md#delta-anchor--last-sweep)
  of the single-file review) —
  the one part of a frozen record that a sweep updates. Anchor is `9fa70364`,
  the commit that landed the campaign record; everything after it is the
  remediation program's own ~240 fixes, which no sweep has ever explored.

## Addendum — 2026-08-09, record lifecycle amended: one frozen doc per campaign

Applied while slimming PR #86 for review, on the owner's ruling that the
program's **mechanism stays** (lane, configs, oracles, named rigs, `/explore`,
class gates, promoted regressions) and its **execution residue goes**. Three
policies, all already executed for the 2026-07 campaign:

1. **§5 is amended: a closed campaign freezes to ONE file, not a directory.**
   The record compresses to `docs/reviews/exploratory-<YYYY-MM>.md` in the
   frozen-review style — heat map (area × hypotheses × bugs × dominant defect
   classes), one paragraph per area, the owner rulings verbatim, the program
   lessons, and the delta anchor a future sweep updates. The working tree
   (ledger, area files, method doc, coverage baseline) is **deleted — git
   history is the archive**. This supersedes the 2026-08-08 addendum's
   "APPROACH.md archived, not deleted" note: with the area files gone, the
   citations that justified keeping it went with them, and it is deleted too.
   The 2026-07 campaign's tree was compressed to
   [exploratory-2026-07.md](../reviews/exploratory-2026-07.md) on 2026-08-09;
   the `/explore` skill's close-out step now produces this format directly, so
   no future campaign rebuilds the tree.
2. **Between campaigns the lane holds only open-bug repros and the named
   reusable rigs.** Probes for Fixed entries are deleted when the flip rule
   promotes their regression (§2 already implied this; now explicit), and
   FALSIFIED characterizations are deleted at campaign close — a curated few
   may be promoted to a main suite instead, never left in the lane. An empty
   per-package lane is the normal resting state and must not read as red
   (`passWithNoTests` in the explore configs).
3. **The review series keeps the latest assessment plus landmark records**
   (owner ruling, recorded in [docs/README.md](../README.md)). Superseded
   per-wave snapshots retire to git history; load-bearing fragments migrate
   into the living docs before deletion.

One consequence of the 2026-08-09 lane sweep worth recording: two kept probes
(GPU-15, ICON-08) had gone red not because their bugs moved but because they
still addressed the pre-merge per-type canvases — a merge closes neighbouring
probes' premises *by construction* (§ the skill's flip-rule notes), and a
frozen lane rots against a moving substrate exactly the way §"Negative /
risks" predicted. Delta sweeps touching the lane every cycle remain the
mitigation.

## Acceptance criteria

- **Contract:** default `npm test` per package and the main Playwright config discover zero files from `__explore__/` / `tests-exploratory/` (quarantine holds — re-verify with `--listTests` after any config change).
- **Flip rule:** at least one fixed campaign bug demonstrates the full path: probe promoted to a main suite, known_issues entry annotated Fixed, lane copy gone.
- **Skill:** `/explore` cold-starts a delta wave in a fresh session with no conversational context and no API key configured.
- **Archive:** after remediation starts, `docs/exploratory/` no longer exists; `docs/reviews/exploratory-2026-07/` carries the frozen record and docs lint stays green.
