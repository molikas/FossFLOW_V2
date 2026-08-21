# Tactical working docs

**Empty is the healthy state here.** Two initiatives are currently in flight:

| In flight | What it is |
|---|---|
| [adr-code-audit.md](adr-code-audit.md) | Verify all 41 ADRs' state + decisions against the code. Scaffolded 2026-07-15; verified findings remediated (see its Disposition block); **419KB — read only that block, never the whole file**. Discharge the remaining rows with **`/docs-sweep gate`**, then wrap. |
| [release-provenance-and-notes.md](release-provenance-and-notes.md) | Fix version drift (deployed shows 3.7 vs released 3.8.3), stamp the version on the boot splash, and make release notes carry per-fix detail without dead issue links. Scaffolded 2026-07-23 — [ADR 0045](../adr/0045-release-version-provenance-and-in-app-surfacing.md) + [ADR 0046](../adr/0046-release-notes-generation-and-reference-integrity.md). |

**Generated output is not a tactical.** The gate's worklist/prefilter/results are regenerable in ~1s and live in gitignored `reports/docs-sweep/` — the same tier as `playwright-report/`. They were briefly committed here (2026-07-15) and removed; a build artifact in a docs folder reads as a doc. See [workflow.md](../workflow.md)'s doc map.

A tactical is a **short-lived working doc** for work that's too large for a single ADR scaffold but too narrow for `PLAN.md` — a checklist with locked decisions, sub-tasks, and a findings register. See [workflow.md](../workflow.md) Design principle 4 and "Tactical-driven sessions".

## The lifecycle

1. **`/feature start <topic>`** scaffolds `docs/tactical/<topic>.md` (the template is inlined in [`.claude/commands/feature.md`](../../.claude/commands/feature.md) Phase 3 — that is the authoritative copy).
2. Each session reads its "Read first" block, picks a workstream, appends evidence-cited findings.
3. Synthesis spawns the durable artifacts — **ADRs**.
4. **`/feature wrap <topic>`** adds a one-line entry to `PLAN.md`, **deletes the file**, and refreshes any memory pointer to it.

**The ADRs are the durable record; a tactical's job ends at the wrap.** So between initiatives this folder is empty — if it isn't, either work is genuinely in flight, or something finished and was never wrapped.

## Don't let them calcify

Tacticals rot faster than any other doc here, because they describe a moment (*"before the rewrite"*, *"the plan for X"*) that stops being true the day the work ships. A tactical that has outlived its work is worse than no doc: it reads as current and it is not.

**2026-07-15 — the folder was cleared of three that had calcified:**

| Retired doc | Where its durable content went |
|---|---|
| `canvas-interaction-baseline.md` | folded → [guidelines/canvas-interaction.md](../guidelines/canvas-interaction.md) |
| `canvas-interaction-behavior-map.md` | folded → [guidelines/canvas-interaction.md](../guidelines/canvas-interaction.md); its divergence register → [known_issues.md](../../known_issues.md) |
| `perf-charter.md` | protocol / tier ladder / LEB60 → [ADR 0020](../adr/0020-engine-perf-harness-and-measurement-protocol.md); the unratified T3 sim mandate → `PLAN.md` ENG-T3 |

All three had shipped their work months earlier and had drifted into asserting things that were no longer true (a superseded render substrate, "open" gaps that were closed, a decision that had been reversed). Full text is in git history — `git log --diff-filter=D --name-only -- docs/tactical/`.
