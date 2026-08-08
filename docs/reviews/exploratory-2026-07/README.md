# Exploratory testing campaign — 2026-07 (frozen record)

**Status:** CLOSED 2026-07-30 · **Archived** 2026-08-08 (remediation wave 6) · **Owner:** molikas

A hypothesis-and-verification exploratory campaign over all 27 functional areas of Axoview. Everything here is **frozen**: it records what was hypothesised, probed and ruled on between 2026-07-29 and 2026-07-30, and it is not maintained forward.

**The method is not frozen — it lives on as the [`/explore`](../../../.claude/commands/explore.md) skill.** Start a new sweep there, not here.

## Results

| | |
|---|---|
| Counted hypotheses | 385 |
| Bugs confirmed | 240 |
| Product questions raised | 22 (21 ruled, all in [DECISIONS.md](DECISIONS.md)) |
| Entries filed in `known_issues.md` | 190 |
| Areas | 27, all DONE, plus a cross-area mop-up wave |

Every confirmed bug carried a committed `it.failing` / `test.fail()` repro in the quarantined probe lane. Remediation ran as waves 0–6 on `remediation/exploratory-campaign` under [ADR 0047](../../adr/0047-exploratory-testing-program.md); each fixed entry is annotated in place in `known_issues.md`, with its probe promoted to a main suite or retired with a recorded reason.

## What is in here

| File | What it is |
|---|---|
| [LEDGER.md](LEDGER.md) | Campaign index — the 27-area inventory, per-area counts and status. The area inventory is what `/explore`'s delta mode maps changed files onto. |
| [areas/](areas/) | One file per area: scope, code paths, seed seams, matched invariants, known coverage gaps, and the full hypothesis table with verdicts and evidence. **Read the file whose ID prefix matches a bug before predicting that area's behaviour** — the rig notes in them cost about ten wrong verdicts to learn. |
| [DECISIONS.md](DECISIONS.md) | The 22 product questions and the owner's rulings, each naming the ADR amendment it required. |
| [coverage-baseline.md](coverage-baseline.md) | The existing-test coverage map and invariants harvest used as the novelty-rule dedupe reference (~110 KB — read sections). A **regenerated** artifact: a future sweep re-derives it for the areas in scope rather than hand-maintaining it. Two of its harvested invariants were stale; verify one against source before building a probe on it. |
| [APPROACH.md](APPROACH.md) | The campaign's method document. Superseded by the `/explore` skill and kept only because the area files and the probe lane cite its section numbers throughout. **Do not follow it for a new sweep** — where it and the skill disagree, the skill wins. |
| [LAST-SWEEP.md](LAST-SWEEP.md) | The delta-mode anchor: which commit was last swept, and by whom. The one file here that a new sweep **does** update. |

`COLDSTART.md` — the verbatim prompt that started each wave — was **retired**, not archived. It was a purely operational artifact and the skill replaces it whole; keeping a second cold-start prompt in the tree would only invite the two to drift.

## Standing threads

The campaign's durable output is not the bug list — it is the recurring *shapes*, each of which closed several bugs at once and each of which a new area should ask about rather than re-derive:

- **One fact stored twice with different lifetimes**, and only one writer updates it.
- **Sibling drift** — two implementations of one contract, and only one of them is maintained. The single highest-yield generator in the campaign.
- **A per-surface opt-in that nothing enumerates**, so each new surface starts in the wrong state.
- **One geometry, two derivations** — the second re-derives what a shared helper already knows, and drifts.
- **The exit ramps are one function written several times**, each forgetting a different part of the ritual.
- **Identity and range integrity are unvalidated** — reference integrity is checked, identity and bounds are not.
- **Implemented but reachable from nowhere** — a capability wired at every layer with no caller.

Each is written up with its evidence in the area files and in LEDGER.md; the `/explore` skill carries them forward as generators.
