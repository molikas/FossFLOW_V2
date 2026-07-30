# ADR 0047 — Exploratory Testing Program: Permanent Probe Lane, Promotion Protocol, and Subscription-Run Agent

**Status:** Accepted
**Date:** 2026-07-30
**Supersedes:** none
**Superseded by:** none

## Context

The 2026-07 exploratory campaign ([docs/exploratory/](../exploratory/APPROACH.md)) probed 362 falsifiable hypotheses across 27 functional areas and confirmed **220 bugs and 22 product gaps** — while all 2,231 unit tests and 76 e2e specs were green. Every finding was, by construction of the campaign's novelty rule, outside existing coverage. The 22 gaps were closed with owner rulings on 2026-07-30 ([DECISIONS.md](../exploratory/DECISIONS.md)); 172 entries were filed to [known_issues.md](../../known_issues.md), each carrying a committed `test.fail()` repro probe in a quarantined test lane.

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

The campaign method (hypothesis ledger, novelty rule, probe tiers, oracles — [APPROACH.md](../exploratory/APPROACH.md)) is repackaged as a versioned project skill, **`.claude/skills/explore.md`**, replacing the hand-carried COLDSTART.md prompt. Properties:

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
- "Fix all 220" is a large program; the risk of drift is carried by the tactical ([exploratory-remediation.md](../tactical/exploratory-remediation.md)), not this ADR.

## Implementation notes (non-binding)

- The skill distills COLDSTART.md §"Rig traps" and the reusable rigs (A1 harness, A2 fetch doubles, canvas stub) into a traps appendix — that knowledge cost ~10 wrong verdicts to learn.
- Headless entry: `claude -p "/explore" --permission-mode acceptEdits` from the repo root; Task Scheduler examples belong in the skill, not here.
- Archive move is `git mv` so history follows the files.

## Acceptance criteria

- **Contract:** default `npm test` per package and the main Playwright config discover zero files from `__explore__/` / `tests-exploratory/` (quarantine holds — re-verify with `--listTests` after any config change).
- **Flip rule:** at least one fixed campaign bug demonstrates the full path: probe promoted to a main suite, known_issues entry annotated Fixed, lane copy gone.
- **Skill:** `/explore` cold-starts a delta wave in a fresh session with no conversational context and no API key configured.
- **Archive:** after remediation starts, `docs/exploratory/` no longer exists; `docs/reviews/exploratory-2026-07/` carries the frozen record and docs lint stays green.
