---
description: Verify the docs corpus against the code and consolidate it. Four
  exclusive modes — lint (governance metadata; also the CI gate) · consolidate
  (restated facts, calcified tacticals, stale currency claims, dead links) ·
  gate (method for an ADR⇄code conformance register; the 2026-07 one is already
  discharged) · defossilize (superseded-design residue that would lead a rewrite
  back to a retired design — edits source, renames components, touches every
  locale file). The subject is the docs, not the code (that is /audit), and not
  a decision being made now (that is /feature).
argument-hint: "[lint|consolidate|gate|defossilize]"
disable-model-invocation: true
---

# /docs-sweep — docs corpus verification and consolidation

Keep the docs corpus true to the code and consolidated. Distinct from [`/audit`](audit.md), which reviews the *code* (static analysis, security, architecture, UX consistency) — this skill's subject is the docs themselves.

> **Where things live** — do not mix these tiers:
> - Helpers: `.claude/scripts/docs-sweep/*.js` — agent-only tooling. Never referenced by CI.
> - Output: `reports/docs-sweep/` — gitignored (`.gitignore` `reports/`), same tier as `playwright-report/`. Regenerable in ~1s. Never commit it.
> - The CI gate is not this skill: `scripts/lint-docs.js` (`npm run lint:docs`) runs in [test.yml](../../.github/workflows/test.yml). It lives in `scripts/` because CI owns it, and CI must never reach into `.claude/`.

| Mode | Use when |
|---|---|
| `lint` | Quick check — is the governance metadata sound right now? |
| `consolidate` | Docs feel stale/duplicated; a wave just shipped; things drifted. |
| `gate` | A conformance register needs discharging. The 2026-07 one does not — read the mode before running it. |
| `defossilize` | A rewrite or a new contributor would still read the *retired* design out of the repo — deleted-sibling names, orphaned i18n keys, present-tense comments about removed files, a type shaped for a panel that no longer exists. **Edits code — run the regression.** |

Run exactly the mode named in the argument. With no argument, run `lint` and report — do not pick a heavier mode on the user's behalf, and do not chain modes; each is a separate invocation.

`defossilize` edits source, renames components and touches every locale file. Run it only when the user names it, and stay inside the classes in its table: no adjacent refactor, no tidying, no rename the fossil table does not call for. If you find a bug while in it, report it and leave it — that is `/audit`'s.

---

## The one lesson that governs every mode

Every defect the 2026-07-15 conformance audit actually found was *metadata about* a decision — a `Status` header, a supersession field, a currency line — never a wrong decision. Decision text has a feedback loop (agents read it beside the code, so mismatches surface). Metadata has none. That is where drift concentrates, and it is exactly what is mechanically checkable.

So: lint the metadata, leave the prose alone. The audit cost three multi-agent runs and refuted 35% of its own gated findings. `scripts/lint-docs.js` is ~150 lines and found a one-way supersession edge (0018→0027) that 458 traced rows and three adversarial lenses missed. Prefer the mechanical check every time it can answer the question.

---

## Mode: `lint`

```bash
npm run lint:docs
```

Covers permanently, in CI: `Status` enum · the `Supersedes: none (…prose…)` trap · supersession reciprocity · released-version claims vs `package.json` · ADR-tier link integrity (baselined in `scripts/docs-lint-baseline.json`).

If it reports baselined links now resolving, drop those entries — the baseline is a backlog and only shrinks. **Never add to it** to make a failure go away; that is the ratchet running backwards.

---

## Mode: `consolidate`

The recurring failure is not drift — it is duplication. One commit (`987eaaf`) falsified four ADRs at once because ADR 0030's panel shape had been *copy-pasted* into 0004/0012/0027/0031 instead of linked. Docs don't rot independently; they rot together, because one fact had four homes.

Sweep for, in order of value:

1. Restated facts. A fact stated in two docs will disagree within a wave. Find the one that *owns* it; everywhere else links. If you catch yourself writing "the panel is X" in an ADR that isn't about the panel — link instead.
2. Calcified tacticals. A tactical describes a moment (*"before the rewrite"*). When its work ships, wrap it: durable knowledge becomes a guideline (how-we-build) or an ADR (a decision) — never a permanent tactical. `docs/tactical/` empty is the healthy state.
3. Currency/version claims. The lint covers `released line is vX.Y.Z`. Prose that *implies* a release state is not lintable — this sweep once authored "0042–0043 pending v3.7.0" the day after v3.7.0 shipped. Check it against `git tag --sort=-v:refname | head -3` and the top section of `CHANGELOG.md`, never the whole file: it is one of the grep-first registers in CLAUDE.md's read budget, and the newest tag already answers the question.
4. Hardcoded enumerations in skills. `/notes` twice went stale by listing ADR numbers — the second time inside a sentence *warning against hardcoded enumerations*. Replace lists with the grep that answers them.
5. Dead links. `node .claude/scripts/docs-sweep/prefilter.js` precomputes; the lint covers `docs/adr/`.

Measure, don't copy. Test totals, ADR counts, and statuses in docs are frequently stale — re-derive rather than carry a number forward, with the cheapest command that answers the question: statuses from `grep -rh '^\*\*Status:\*\*' docs/adr/ | sort | uniq -c`, ADR counts from `ls docs/adr/`, test totals from the most recent CI run or a single workspace's suite. Do not run the full monorepo `npm test` to source a number for a doc — and if you do run it, a failure you find there is `/audit`'s or `/shake-out`'s, not this mode's.

When to fan out: one agent per doc tier, or per duplication candidate, each reading its own bytes and returning a verdict — the corpus's big registers (`known_issues.md`, `adr-code-audit.md`, `CHANGELOG.md`, `testing.md`) are exactly what CLAUDE.md's delegation gate is about. Run those in parallel and collect; never spend an agent on what `lint-docs.js` or a grep already answers, and never on a second pass over bytes another agent already read.

Prove the reorg was safe. Moving files silently breaks relative links. Baseline first, compare after:
```bash
git worktree add -f --detach /tmp/base HEAD     # pre-change baseline
# ...run the same link check in both, diff the SETS, not the counts
git worktree remove --force /tmp/base           # always: an orphaned worktree stays registered
```
Counts alone lie: a rename changes every path string, so a naive diff reports the same dead link as both "fixed" and "introduced."

Report in chat, not to a file: what you consolidated, what you left, and what you could not settle. If the sweep produced durable knowledge it becomes a guideline or an ADR through `/feature` — never a new tactical, and never a summary doc committed alongside the edits.

---

## Mode: `gate`

The 2026-07 conformance register (`docs/tactical/adr-code-audit.md`) is discharged. Its `Status:` line reads COMPLETE — all 173 rows gated, and its own next-step block rules that nothing else there is worth resuming, because checks 1–5 of `lint-docs.js` now catch every class that audit found, permanently and for free. There is no open gating work; what survives below is method, not a plan.

Check that in this session rather than trusting this paragraph. `extract-worklist.js` selects rows whose Verdict cell is literally `UNVERIFIED`; the register's `Status:` line records whether the gate already ran. If the Status says COMPLETE while the extractor still reports rows, the cells and the Status disagree — report that and stop. The remedy is `/feature wrap`, not another gate run. **Never read `adr-code-audit.md` beyond its top "Disposition" block (~60 lines)** — reading it whole is a direct cause of both prior gate failures.

### If a new conformance register is ever opened

**DISCOVERY ONLY: do not fix, do not flip any `Status`, do not edit any ADR.**

This mode assumes the Workflow tool. The per-ADR fan-out, the `schema` option on each agent, `resumeFromRunId`, and the `budget.remaining()` stop guard are Workflow script APIs. If the Workflow tool is not available in this session, do not improvise around them: run the ground-truth pass below yourself, then judge ADRs sequentially in-session, appending to `results.jsonl` after each — slower, same output, resumes the same way. Say which path you took in the report.

One agent per ADR, not per row: it reads the ADR and the cited code once and judges all that ADR's rows in one context, carrying only its own slice of `worklist.jsonl` (median 3.5KB, max 9KB) plus its precomputed `facts` from `prefilter.json` inline in its prompt — never the register, and never a re-run of a grep the prefilter already ran. The reason is measured: the earlier design ran three refuter agents per row, each re-reading the ADR and code from scratch and many carrying the 419KB register in context, and the session limit killed 288 of 335 refuters. Re-reading the same bytes is what fails; concurrency is not.

Ground truth before any agent runs. `git fetch --tags && git log --oneline -3 && git status --porcelain` — audit the working tree; `git tag` lies until you fetch. `npm run lint:docs` must be green. Then regenerate the inputs, in this order:

```bash
node .claude/scripts/docs-sweep/extract-worklist.js
node .claude/scripts/docs-sweep/prefilter.js
```

Both are idempotent (~1s) and default to gitignored `reports/docs-sweep/`; both take `--out <path>`, but `prefilter.js` reads the *default* worklist path and exits 1 without it, so redirect both or neither. `extract-worklist.js` exiting 1 on a parse error means a register edit broke the tables' pipe alignment — a broken input, not an empty worklist. Take every count from their stdout (they print the batches, 1–9 rows each, and recompute in ~1s), and fold in the rows they resolved with no agent: `AUTO_CONFIRMED` is sound by construction — the ADR still *links* a path that does not exist — while `LIKELY_ALREADY_FIXED` needs a `git log` check before it is recorded, as the script's own rationale says.

Resume by ROW, never by ADR: skip every row already in `results.jsonl` with a real verdict, and re-queue every row recorded `UNVERIFIED` — that is a dead agent, not a result, and skipping its ADR would strand exactly the rows that failed. An agent returning `null` records its rows `UNVERIFIED` and the run continues; never infer a verdict from a dead agent. Append to `results.jsonl` as each ADR completes rather than at the end — `resumeFromRunId` is same-session only, so disk is the only thing that survives the failure mode that killed both prior runs. The stop rule belongs in the script rather than in your head: it guards on `budget.remaining()` and checkpoints per ADR, and your job is to keep that checkpointing continuous — a banked partial run resumes, an unbanked long one does not. Do not track a token count yourself.

Each agent returns a verdict plus a confidence for every row, in `schema` output. A row it cannot settle comes back `PLAUSIBLE` with the evidence that would settle it — not `REFUTED`, which is for rows it can show to be wrong. A row killed for uncertainty has to stay distinguishable from a row killed on the merits, or the measured refutation rate every future cost decision depends on is inflated by first-pass caution; `PLAUSIBLE` costs no refuter and is reported as unresolved.

Then refute the survivors, and only the survivors. The cost lever rests on an asymmetry:

> A false `CONFIRMED` puts a wrong fix in the repo — acting on the audit's "0004↔0032 missing edge" would have linked two decisions ADR 0032 explicitly records as unrelated. A false `REFUTED` merely misses a finding, which the lint now catches for every mechanical class anyway.
>
> Budget goes on rows that SURVIVE, never on rows that died.

For each ADR with ≥1 `CONFIRMED` row, spawn 2 refuters (not 3 — the third lens changed no outcome in the prior run's headline set), each judging all that ADR's confirmed rows in one context:
- Lens A — premise: *is the claim's stated fact true in the tree today?*
- Lens B — sanction: *does a convention permit this?* (`feature.md`'s addendum rule, ADR 0020's retention policy, a deliberate historical citation, the tactical-wrap lifecycle.)

Both default to refuted. A row survives only if both fail to refute; otherwise `REFUTED`/`PLAUSIBLE`.

#### Verdicts (use exactly these)

| Verdict | Meaning |
|---|---|
| `CONFIRMED` | Real, present today, refutation attempted and failed. |
| `ALREADY_FIXED` | Was real; a commit fixed it. Cite the commit. |
| `REFUTED` | The finding is wrong — premise false, or a convention sanctions it. |
| `PLAUSIBLE` | Could not be settled either way. Record the evidence that would settle it. |
| `SUPERSEDED_BY_LINT` | Substance is a class `lint-docs.js` now enforces. Don't spend an agent. |
| `NEEDS_OWNER` | Real, but the remedy is a product/architecture decision. |

**`ALREADY_FIXED` is not `REFUTED`.** Collapsing them blames the audit for being *correct* and corrupts the refutation rate every future cost decision depends on. This is not hypothetical: `prefilter.js`'s first version auto-refuted rows 135/136/139 because their links resolved — they resolve *because the remediation de-linked them*. Those findings were right. When the tree looks clean, run `git log -S'<thing>' -- <file>` before concluding the finding was wrong.

#### The report

Write `reports/docs-sweep/report.md` (≤150 lines) — a decision aid for the owner, not a narrative of the run. It carries exactly: the tally, posted verbatim from `node .claude/scripts/docs-sweep/tally.js` (counts by verdict plus the measured refutation rate) and never a hand count; `CONFIRMED` rows most-severe first, each with file + symbol (line numbers drift within a month) and the refutation that failed; split-lens rows as `PLAUSIBLE`, never `CONFIRMED`; and what you did not reach, because silence reads as "covered everything." Nothing else — no per-agent transcript, no method recap, no restatement of this file. Post the tally and the confirmed list in chat.

Then stop. The owner decides what to remediate and `/feature wrap`s the register.

---

## Mode: `defossilize`

A fossil is residue of a superseded design that is still *readable* — so a from-scratch rewrite reads it and rebuilds the design the code already abandoned. This mode was born from exactly that: asked to "rewrite the app," an agent reproduced the retired monolithic node panel (color / font / icon / link / delete stacked in one right-deck) because the split into *deck = identity* + *top-bar strip = styling* (ADR 0030 / 0034) survived in the running app but not in the names, strings, comments, types, git history, and frozen docs the agent actually read.

A fossil is not dead code. `knip` was green the entire time. Fossils hide where static analysis cannot look: string-keyed i18n, component / folder / POM names, code comments, the shape of a persisted type, and git history. Rank every candidate on one axis only: how strongly would it lead a from-scratch rewrite back to the retired design? Tidiness is not the axis.

### Where fossils hide (descending pull), and the check for each

| Class | Why it misleads | Find it |
|---|---|---|
| Git-retrievable deleted components | `git log -p <live-file>` / `git show <old>:<deleted>` returns a complete working old UI to copy-paste | `git log --diff-filter=D --all -- '<dir>/**'`; on a *surviving* file, `git log --follow -p` reaches its tabbed/monolithic past |
| Frozen reviews / dated CHANGELOG | `docs/reviews/*` file-inventories list deleted components as *present source*, hundreds of lines below the one "frozen" banner | grep the corpus for the deleted symbol; forward-pointer, never rewrite the artifact |
| Fossil names on live code | a `*Tab` / `*Panel` / `*Sidebar` / `*POM` named for a deleted sibling implies that sibling still exists (e.g. `NodeInfoTab` with no tab, ex-sibling `NodeStyleTab` deleted) | grep component / folder / POM names against the deleted set; rename to what the code *does now*; move a file to its real owner's folder |
| Orphaned i18n namespaces / keys | a `deleteButton` / `nodeInfoTab` namespace with zero consumers tells a reader that surface exists | for each key prove zero non-i18n refs — mind substring traps (`openLink` ⊂ `openLinkedDiagram`) |
| Misleading type shape | a model hanging color / font / icon / link on a node with no marker that styling moved invites a type-driven panel that rebuilds the monolith | read the schema against the *actual edit locus*; add an ADR-cited comment naming where each field is edited |
| Present-tense stale comments | a live comment "mirrors NodeStyleTab" points at a deleted file as a peer | `grep <deleted-symbol> src` — any hit outside a *past-tense* migration note is a fossil |

### How to work it

Ground truth is the ACCEPTED ADRs plus the running render path — never the docs; everything else is measured against that. Work the classes in the table above, ranked by pull rather than tidiness: a git-retrievable monolith and an orphaned i18n namespace outrank a duplicated helper, because the helper won't rebuild the old UI. Plan the search however the tree suggests; the constraints are the classes, the ranking axis, and the boundary at the end of this section.

The classes are independent, so one finder per class runs in parallel, then one adversarial pass over the survivors — the same shape as the gate method above (`/audit` has no agent lane; it is six phases of shell and grep tables). Each finder defaults to *no finding*: to file one it must name the live artifact and say which retired design a reader would rebuild from it. A candidate it cannot settle comes back as a maybe with the evidence that would settle it, not as a finding. Seed the static lane with `knip` + `madge --circular --extensions ts,tsx` — they are the floor, not the ceiling.

Neutralize per class — deletion is only one tool:
- dead code / orphaned keys / unreachable branches → delete (prove zero consumers first).
- fossil names → rename to current behaviour; relocate the file to its real owner.
- stale comments → reword to past tense. A past-tense migration note ("moved to the strip", "replaces the former LabelColorPicker") is an asset — it tells a rewriter where a control went. Never scrub those; only present-tense peer references mislead.
- frozen docs (`docs/reviews/*`, dated `CHANGELOG`) → forward-pointer only (same immutability rule as `consolidate`).
- misleading types → ADR-cited comment at the declaration, not a deletion (the field still round-trips).

**Regression is mandatory** — unlike the other modes, this one edits code. The i18n **locale-completeness** test guards the 13-locale surgery; `tsc --noEmit` per workspace guards renames/moves; then full unit + `build:lib`. e2e renames: the strict-tsc noise is pre-existing (stash-and-compare to prove your files are clean) — Playwright transpiles per file.

### Traps (`defossilize`)

- `knip` green ≠ fossil-free. It cannot see i18n keys, names, comments, type *intent*, or git history — where every fossil in the founding case lived. Don't quote a clean `knip` as an all-clear.
- Substring false-positives. `grep openLink` matches the live `openLinkedDiagram`; add the trailing `:` (or `-w`) before declaring a key dead.
- Past-tense migration comments are the cure, not the disease. Deleting "Replaces the former X" re-opens the gap it closes.
- You cannot de-fossilize git history. The rewrite *brief* — not a repo edit — must forbid reconstructing UX from deleted components and name the current ADRs as the sole source of truth. That is the only fix for the top-pull class.
- Boundary vs `/audit`: this mode overlaps `/audit`'s dead-code lane, but it is organized around rewrite-misleading residue, not correctness/security. If a finding is a *bug*, it's `/audit`'s; if it's *a true statement about a design that no longer exists*, it's this mode's.

Report in chat: each neutralized fossil as one line — class, artifact, remedy — plus the regression result. Do not write a migration document; the past-tense comments you leave in the code ARE the record, and a second narrative of them is another fossil in waiting.

---

## Traps (all observed, all real)

1. The register is stale on itself. Its Priors said ADRs 0042/0043 were unreleased; v3.7.0 shipped 2026-07-14. Re-derive.
2. Row duplication inflates counts. Rows 20/21/22/24 were four `CONFIRMED` badges for one defect. Count defects, not rows.
3. "One fact, three verdicts." The 0012→0030 edge was gated three times under different framings → `CONFIRMED`, `PLAUSIBLE` and `REFUTED`. Dedupe by (file, claim) before believing a count — the tally is a row count; only you can turn it into a defect count.
4. Frozen `docs/reviews/*`, `PLAN.md`, and memory are NOT evidence of current behaviour. Code is.
5. Two spellings minimum before claiming absence. ADR 0007 was nearly filed a placeholder because `DiagnosticsOverlay.tsx` lives in `app`, not `lib`.
6. A moved symbol is not a defect unless the ADR's *claim* is now false.
7. Pattern count ≠ defect count. The audit filed the `Supersedes: none (…prose…)` anti-pattern against 10 ADRs; only one (0030) had a parenthetical contradicting its field. The rest read "interacts with"/"relates to"/"amends" — sanctioned.

## Verified negatives — read before filing, append before finishing

The list lives in [`docs/guidelines/docs-verified-negatives.md`](../../docs/guidelines/docs-verified-negatives.md): it is this skill's memory across sessions and it only grows, which is why it is not in a command body that loads on every invocation. Read it before filing anything in `consolidate` or `gate` — a claim already there is settled and does not get re-raised. When a sweep refutes a finding for a reason that will recur, append one line in the form *claim → why it is false → the evidence that shows it*, with no date: the reason is the durable part, not when you learned it.
