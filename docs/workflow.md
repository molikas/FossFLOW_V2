# Workflow — Canonical session cadence

> **Status:** Authoritative · **Last updated:** 2026-08-21 (prompt-surface audit — `/explore` and `/docs-sweep` folded into the cadence and the router, the commit-subject rule corrected against commitlint, Principle 8 added, the cadence-anomaly register retired to git) · **Audience:** anyone (human or Claude) opening a session against this repo.
>
> This doc names the canonical sequence of a working session: which skill fires when, where the artifacts land, and what the design principles are. It is the single source of truth for "how we work here." Skill bodies cross-reference this doc; this doc does not duplicate skill bodies.

## Read-first

- [docs/guidelines/architecture.md](guidelines/architecture.md) — what the codebase actually contains. Open before any structural decision.
- [docs/guidelines/ux-principles.md](guidelines/ux-principles.md) — design language. Every UI-touching session reads this.
- `MEMORY.md` (in your Claude project memory directory) — the persistent context index (auto-loaded by Claude Code).
- [PLAN.md](../PLAN.md) — phase dashboard. **Read for context; never edit phase content outside `/feature wrap`.**
- [docs/adr/](adr/) — every locked decision. New work starts by reading the relevant ADR header.
- [docs/tactical/](tactical/) — short-lived working docs. Each tactical's "Read first" block names the ADRs it implements.

## The doc map — what lives where, and who maintains it

[docs/README.md](README.md) is the full index; this is the one-screen version. **Docs are grouped by change discipline, not by topic:**

| Where | What | Who writes it |
|---|---|---|
| [docs/guidelines/](guidelines/) | Durable **how-we-build** references, kept true to the code: `architecture` · `ux-principles` · `canvas-interaction` · `canvas-rendering-guidelines` · `testing` · `perf-troubleshooting` · `docs-verified-negatives` (`ls docs/guidelines/` is the authority if this list disagrees) | Whoever changes the behaviour, in the same commit. `/notes` sweeps at end-of-session |
| [docs/reviews/](reviews/) | **Frozen** reviewer-grade snapshots (`technical-review-*`) — immutable once cut, true only as of their freeze date | Cut deliberately at a ship boundary; never edited afterwards |
| [docs/adr/](adr/) | One durable **decision** each | `/feature start\|extend\|supersede` |
| [docs/tactical/](tactical/) | Short-lived working docs | `/feature start`, deleted at `/feature wrap` |
| [reports/](../reports/) · `perf-results/raw/` | **Generated output — gitignored, regenerable, never committed.** Audit registers, gate worklists, static-analysis reports. Same tier as `playwright-report/`: a build artifact, not a doc. *(Exceptions are explicit and few: `perf-results/decision-log.md` + `baseline.md` are DURABLE by [ADR 0020](adr/0020-engine-perf-harness-and-measurement-protocol.md)'s retention policy, and a cut `docs/reviews/` report is a doc.)* | Whatever emits it (`/audit`, `/docs-sweep`, `npm run perf`) |
| [docs/features.md](features.md) | The durable **feature inventory** — what this fork adds vs upstream, with ADR links. Tracks the working branch, so it can list features ahead of the released line. The root README carries only the condensed Highlights | **`/notes`**, from `feat`/`ux` commits |
| [docs/deployment.md](deployment.md) · [docs/manual-test-baseline.md](manual-test-baseline.md) | Deploy walkthrough · point-in-time manual walk record | Whoever changes the target · re-walked on demand |
| [PLAN.md](../PLAN.md) · [known_issues.md](../known_issues.md) | Roadmap dashboard · open-issues register | `/feature wrap` · `/notes` + `/shake-out` |

**Don't confuse `/feature` (the skill, singular) with [docs/features.md](features.md) (the inventory, plural).** They never touch each other: `/feature` owns ADRs + tacticals + PLAN.md; `features.md` is owned solely by `/notes`.

## Stages of a session

A session moves left-to-right through the stages below. Most sessions skip stages — that's normal. The diagram is the **canonical sequence**, not a mandatory walkthrough.

```
                     ┌─────────────────────────────────────────────┐
                     │  Session start                              │
                     │  - Read PLAN.md / relevant tactical         │
                     │  - Pick the unit of work                    │
                     └────────────────────────────┬────────────────┘
                                                  │
                          ┌───────────────────────┴───────────────────────┐
                          ▼                                               ▼
              ┌─────────────────────────┐                  ┌─────────────────────────┐
              │  Feature scaffolding    │                  │  Direct work            │
              │  (ADR-worthy new work)  │                  │  (most sessions)        │
              │                         │                  │                         │
              │  /feature start         │                  │  Reads + edits + builds │
              │  /feature extend        │                  │  Dev server + browser   │
              │  /feature supersede     │                  │  for UI work            │
              └────────────┬────────────┘                  └────────────┬────────────┘
                           │                                            │
                           └────────────────────┬───────────────────────┘
                                                ▼
                              ┌──────────────────────────────────┐
                              │  Verify                          │
                              │  - tsc --noEmit / build          │
                              │  - jest (per-package)            │
                              │  - manual UI check               │
                              └────────────────┬─────────────────┘
                                               │
                          ┌────────────────────┼────────────────────┐
                          ▼                    ▼                    ▼
                  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
                  │  /audit       │    │  /explore     │    │  /shake-out   │
                  │  (heavy       │    │  (predict &   │    │  (iterative   │
                  │   sweep)      │    │   probe —     │    │   polish)     │
                  │               │    │   files,      │    │               │
                  │               │    │   never fixes)│    │               │
                  └───────┬───────┘    └───────┬───────┘    └───────┬───────┘
                          │                    │                    │
                          └─────────────┬──────┴────────────────────┘
                                        ▼
                              ┌──────────────────────┐
                              │  code-review or      │   (built-in skills,
                              │  /security-review    │    plugin-provided)
                              └─────────┬────────────┘
                                        ▼
                              ┌──────────────────────────┐
                              │  /notes                  │   (/docs-sweep runs in
                              │  CHANGELOG + docs sync   │    this band too, on
                              │  (optional release cut)  │    demand — docs ⇄ code)
                              └─────────┬────────────────┘
                                        ▼
                              ┌──────────────────────────┐
                              │  /feature wrap           │
                              │  (only for tactical docs │
                              │   that fully completed)  │
                              └─────────┬────────────────┘
                                        ▼
                              ┌──────────────────────────┐
                              │  /ship                   │
                              │  integration → master    │
                              └──────────────────────────┘
```

**Cadence anchors (in order):** Session start · Feature scaffolding · Direct work · Verify · Polish · Review · Doc sync · Tactical wrap · Promotion.

## Decision table — which skill when

| Situation | Skill | Why |
|---|---|---|
| Opening a new ADR-worthy decision | `/feature start <topic>` | Scaffolds ADR + tactical with the canonical template. |
| Modifying an accepted ADR | `/feature extend <NNNN>` | Adds a dated addendum without touching prose. |
| Replacing an accepted ADR | `/feature supersede <NNNN>` | New ADR with the cross-link; old one marked superseded. |
| Tactical doc finished | `/feature wrap <topic>` | Adds PLAN.md line, deletes the tactical, retires its memory pointer. |
| End-of-session doc sync | `/notes` | README · architecture.md · testing.md · known_issues.md · PLAN.md · ADR statuses · tactical wrap. **Releases are auto-cut by semantic-release on merge as a tag + GitHub Release — never hand-cut. The in-repo `CHANGELOG.md`/versions are not committed back (GitHub Releases is canonical); the in-app version is injected from the tag at build ([ADR 0045](adr/0045-release-version-provenance-and-in-app-surfacing.md)).** |
| Heavy multi-dimension review | `/audit` | Static analysis + security + coverage + build + architecture + UX/perf greps. Pre-release or quarterly. **Subject = the code.** |
| Docs feel stale, duplicated, or drifted from the code | `/docs-sweep` | **Subject = the docs.** `lint` (governance metadata, also a CI gate) · `consolidate` (restated facts, calcified tacticals, stale currency claims) · `gate` (discharge the ADR⇄code conformance register — long-running, resumable) · `defossilize` (residue of a superseded design — fossil names, dead strings, stale comments and types that would lead a from-scratch rewrite back to the retired design; **edits code, so run the regression**). |
| Iterative bug-fix / polish loop on shipped surfaces | `/shake-out` | Per-issue verification loop; one coherent commit per bundle, whose **body** carries the user-facing per-fix bullet list that the release notes render ([ADR 0046](adr/0046-release-notes-generation-and-reference-integrity.md)). |
| Hunting defects nobody has reported yet | `/explore` | Hypothesis-driven exploratory sweep ([ADR 0047](adr/0047-exploratory-testing-program.md)): predict specific failures, probe them in the quarantined lane, file each verdict. **Delta mode by default** — scopes areas by `git diff` against the last-swept commit. **Finds and files; never fixes.** Runs headless (`claude -p "/explore"`) for a scheduled sweep. |
| Pre-merge code or security review | `code-review` / `/security-review` | Built-in skills; fire just before `/ship`. |
| Promote `integration` → `master` | `/ship` | Test gate + version-coherence check + interactive plan. Doesn't bump versions. |
| Periodic usability validation (pre-release / post-UX-overhaul) | UX journey test — [ADR 0028](adr/0028-ux-journey-testing-protocol.md) | Persona-driven Chrome-agent run + **mandatory code-verification** of severe findings → a `docs/tactical/` backlog. On-demand, not a slash command yet. |

**Boundaries that have caused confusion before:**

- `/audit` vs `/shake-out` — both "find and fix." `/audit` is the heavy sweep that produces an executive report; `/shake-out` is the per-issue polish loop. Pick `/audit` when the problem isn't named yet; pick `/shake-out` when the issues are listed.
- `/audit` vs `/explore` — both look for trouble in the code, and they look with different instruments. `/audit` reads: static analysis, coverage, architecture, security greps, and it reports on the *state* of the codebase. `/explore` **predicts and probes**: it writes a falsifiable hypothesis, builds the cheapest executable check that could disprove it, and records a verdict either way. `/audit` finds what a rule can see; `/explore` finds what only a specific guess could have found — the 2026-07 campaign confirmed 240 bugs while every suite was green. Pick `/audit` for a health report, `/explore` when the suites are green and you don't believe them. Neither fixes: `/audit` reports, `/explore` files, `/shake-out` fixes.
- `/audit` vs `/docs-sweep` — **the subject differs.** `/audit` reviews the *code* (and flags where it deviates from the docs' principles). `/docs-sweep` reviews the *docs* (and asks whether the code still bears them out). If the finding's remedy is a code change, it was `/audit`'s; if it's a doc edit, it was `/docs-sweep`'s.
- **`scripts/lint-docs.js` is not part of `/docs-sweep`,** even though the skill invokes it. It is a **CI gate** (`npm run lint:docs`, wired into `test.yml`) and therefore lives in `scripts/` with the other CI-owned tooling. CI must never depend on `.claude/` — that directory is agent tooling and is not guaranteed to exist in a checkout. Agent-only helpers live in `.claude/scripts/docs-sweep/`; their output goes to gitignored `reports/`.
- `/notes` vs `/ship` — **neither cuts the release.** semantic-release cuts it in CI on merge to `master` (`.releaserc.json` + `release.yml`): it reads the conventional commits, computes the SemVer bump, bumps all 5 `package.json` versions and regenerates `CHANGELOG.md` **inside the CI build (not committed back — branch protection blocks the push, see commit #77)**, then tags `vX.Y.Z` + publishes a GitHub Release (the canonical record). The in-app version is injected from that tag at build time ([ADR 0045](adr/0045-release-version-provenance-and-in-app-surfacing.md)). `/notes` syncs prose docs (README/architecture/testing/known_issues/PLAN + ADR statuses + tactical wrap); `/ship` promotes `integration`→`master`. `/ship`'s version-coherence check just asserts the 5 committed package.jsons are equal (they stay frozen and equal — `update-version` only runs in CI), so a mismatch signals an illegal hand-edit. **The old date-based `YYYY.M.D` manual-cut convention is retired.**
- `/feature start` (convention-memory write) vs `/notes` Phase 4 (convention-memory edit). `/feature` owns writes during scaffolding; `/notes` Phase 4 only deletes bullets during wrap. Don't run both back-to-back on the same convention-memory entry.

## Verify — what to run before committing

Build/test scope by change class:

| Change class | Required | Optional |
|---|---|---|
| `axoview-lib/src/` | `npm test --workspace=packages/axoview-lib`, `npm run build` (both libs) | `tsc --noEmit` in lib root |
| `axoview-app/src/` | `npm run build`, dev server + browser walkthrough | `npm test --workspace=packages/axoview-app` (where coverage exists) |
| `axoview-backend/` | `npm run build`, manual backend smoke (curl `/api/config`) | (no jest config today — gap tracked in C.8) |
| `axoview-worker/` | `npx wrangler dev` smoke | (no jest config today — gap tracked in C.8) |
| Cross-package | Both lib + app builds; full test suite | `/audit` Phase 4 |
| Docs only | None | None |
| Deployment artifacts (Dockerfile / compose / nginx / wrangler) | Manual deploy smoke against the affected target | `/deploy-check` (deferred per A.9.4 #3) |

**UI verification is mandatory** for any change touching `packages/axoview-*/src/components/` — start the dev server, exercise the feature in a browser, monitor for regressions in neighbouring surfaces. Type-check + test suite verify code correctness; the browser is the only thing that verifies feature correctness.

**Commit subject convention** — `@commitlint/config-conventional`'s `subject-case` rule rejects a subject that *starts* with an upper-case token, and reference codes are **not** exempt: `fix(canvas): ADR 0011 pass` is rejected. Start lower-case and put the reference code later in the subject — mid-subject capitals are fine, so `test(explore): probe GPU-01 and GPU-04` passes. Narrative phrases inside the subject stay lower-case (`locked decision #16` rather than `Locked Decision #16`). The 18 historical `feat(ux): MQA #NN` subjects in git predate the hook; do not copy them. The convention is enforced locally by simple-git-hooks (G8) and in CI by commitlint (T2 G3). **No issue footers:** while the project uses no issue tracker (issues are triaged in chat), commits carry no `Closes #N` / `Fixes #N` issue footers — there is nothing to close, and the release-notes generator suppresses issue-reference links so stray `#tokens` never render as dead links ([ADR 0046](adr/0046-release-notes-generation-and-reference-integrity.md)); revisit if a tracker is ever adopted. A `/shake-out` bundle commit's **body** must carry a user-facing, per-fix bullet list, which the notes generator renders beneath the subject into the GitHub Release and `CHANGELOG.md`.

## Tactical-driven sessions

Some work is too large for a single ADR scaffold but too narrow for PLAN.md. That's a tactical doc.

**Tacticals are deliberately short-lived — the wrap deletes them, so worked examples do not persist.** The canonical exemplars this section used to link (`productization-audit.md`, `layout-revamp.md`) were both wrapped and deleted, exactly as designed; their decisions live in ADRs 0005/0007–0010 and their process history in git. **The template is not an exemplar file — it is inlined in [`/feature` Phase 3](../.claude/commands/feature.md), which is the authoritative copy.** To read a real one, `git log --diff-filter=D --name-only -- docs/tactical/` and check out a deleted file.

[docs/tactical/](tactical/) is **empty between initiatives, by design.** If you find a doc sitting there whose work has shipped, it has calcified — wrap it. Knowledge worth keeping is a **guideline** (durable how-we-build) or an **ADR** (a decision), never a permanent tactical. Three docs were folded out on 2026-07-15 for exactly that reason; see [tactical/README.md](tactical/README.md).

**The tactical-driven session pattern:**

1. `/feature start <topic>` scaffolds the tactical (and any ADRs it forks off).
2. Each working session reads the tactical's "Read first" block, picks a workstream, appends to its Findings register.
3. Discovery hygiene rule (see Design principle 1): every Findings register row cites `file:line` or a grep result. No theory without evidence.
4. Synthesis happens once discovery is "definition of done" complete. Cross-workstream themes go in a `## Synthesis` section.
5. Synthesis spawns the durable artifacts (ADRs) and the downstream cleanup tacticals.
6. `/feature wrap <topic>` retires the tactical once every downstream artifact has shipped.

The productization audit (wrapped; git history) is the reference shape. Future audits or large initiatives should reproduce it: Phase A discovery → Phase A synthesis → Phase C artifact authoring → wrap.

## Design principles

### 1. Discovery hygiene — every claim is grounded

**Rule:** every Findings register row, every theme, every observation cites a file path with line number, a grep result, or a runtime artifact. No "I think" without "here's where I'm looking."

**Why:** the audit's value is reproducibility. If a finding can't be re-walked by a fresh reader running the same grep, it isn't a finding — it's an intuition. The discrepancies between intuition and code are where bugs hide.

**Practiced version:** when a session falls into "I keep reading the same file and the answer isn't there," the move is to instrument (logging, a script, a screenshot) and let the runtime answer. See the `feedback_diagnose_with_logs` memory for it.

### 2. Screenshot-driven, not theory-driven

**Rule:** when working on a visible surface, the screenshot or the live browser is the source of truth. Theories about what code "should" do are subordinate to what the user sees.

**Why:** the browser is the only thing that verifies *feature* correctness — the type-check and the test suite verify *code* correctness. That is the same reason UI verification is mandatory under "Verify" above.

### 3. Intent verification — stop signs

**Rule:** a why-question from the user about a chosen approach is a stop. A visual/words mismatch in the user's request is a question, not a decision to pick a side. See the `feedback_intent_verification` memory.

### 4. Decisions live in ADRs; status lives in PLAN.md; details live in tacticals

The three-tier doc convention is the project's most-used pattern. See the `project_docs_convention` memory.

- **ADRs** — durable. One concern per ADR. Status: Proposed → Accepted → Superseded.
- **Tacticals** — short-lived. Deleted at wrap; PLAN.md gets a one-line entry pointing to the ADRs.
- **PLAN.md** — strategic dashboard. Never edited outside `/feature wrap`.

### 5. Post-rename memory-pointer policy

When a file is retired (deleted, renamed, or absorbed), the memory pointer that references it MUST be updated in the same commit. Two consequences:

- **Skill bodies that reference retired files are stale references.** Fix them at the retirement boundary, not at the next session's discovery.
- **Memory entries that point to retired files must be removed or rewritten.** A memory entry that points at a non-existent file degrades all future agents that load it.

This is why C.9.2 (skill stale-ref pass) ran together with C.9.1 (this doc) — the retirement of `flare_plan.md`, `session-ux-revamp.md`, and `current_architecture.md` left pointers in three skill bodies that this audit identified and closed.

### 6. Bash idioms are the lingua franca

Skill bodies use `cd packages/...`, `npm run ...`, `grep`. Claude Code's harness translates `cd` cleanly across Windows/PowerShell + Bash, so the pattern works on the active dev platform. **A strict-PowerShell-only environment would trip.** This is documented friction, not a rewrite target.

### 7. Whole-experience coherence — trace the ripple

**Rule:** every proposed change states what it makes **redundant**, what it **contradicts**, and what it **orphans** — and reconciles or explicitly flags each *before* it ships. A fix that lands cleanly in isolation but leaves a sibling control stranded, duplicates an affordance, or depends on a surface that doesn't exist is **not done**. Grep to confirm any surface a plan leans on actually exists — *"put it in the X menu"* requires that X menu to be real, or scoped as a build dependency.

**Why:** a per-issue study is well-grounded (Principle 1) yet coherence-blind *by construction* — isolating issues is exactly where cross-issue contradictions hide. The 2026-06-18 canvas-ux-overhaul scaffold routed a command into a context menu that doesn't exist while a sibling ADR reassigned that menu's trigger (right-click) to pan. This is the **opposite** failure from Principle 8's "stop at the delivered artifact" — hold both at once: **minimal moves, maximal coherence.** See the `feedback_whole_experience_coherence` memory.

**Practiced version:** `/feature` (Phase 1.5) and `/audit` (Phase 5d) run a mandatory consequences pass that names the redundant/contradicted/orphaned surfaces per change and reconciles against mirroring surfaces — selection two-way sync ([ux-principles §4.1](guidelines/ux-principles.md#41-two-way-panel--canvas-sync)), item-type parity (§5), the edit/view/present split (§11).

### 8. Stop at the delivered artifact

**Rule:** when the requested change is delivered and verified, stop. Do not bundle adjacent refactors, tidying, or a second improvement the user did not ask for — offer them instead and let the user pick.

**Why:** see the `feedback_be_serious_not_eager` memory. Multiple past sessions piled extra moves onto a delivered artifact because the agent felt eager; that pattern degrades trust and burns context. **Plans aren't fixes.** This is the **opposite** failure from Principle 7 (trace the ripple) — hold both at once: **minimal moves, maximal coherence.** It is also why `/audit` and `/shake-out` both emphasize "verify, don't pile on" — the design didn't accidentally converge there; the memory was the driver.

## Review gate

`code-review` and `/security-review` (built-in plugin skills) fire **between `/notes` doc sync and `/ship` promotion**. Both are surfaced by the Claude Code system reminder when relevant. The cadence diagram shows the slot; the skills themselves are plugin-provided and not in `.claude/commands/`.

**File `/audit`'s findings in the same session.** `/audit`'s raw run output is ephemeral — it produces no persistent artifact of its own, so high-value findings go through `/notes` immediately after the run or they are lost with the session.

## UX journey testing

The usability analog of the perf harness ([ADR 0020](adr/0020-engine-perf-harness-and-measurement-protocol.md)): an **on-demand**, persona-driven journey test of the live UI,
governed by [ADR 0028 — UX Journey-Testing Protocol](adr/0028-ux-journey-testing-protocol.md). Run it
**periodically** — before a release, after a broad UX-surface change (an overhaul like ADRs 0022–0027), or
when usability is in question — **not** every session.

- **Driver:** a browser-driving agent against a preview build of the branch under test (storage-less;
  server-mode surfaces need a self-hosted build).
- **Personas:** five fixed personas — beginner · intermediate · expert · presenter · keyboard/i18n — one per run.
- **Discipline:** the capability map + do-not-report list are **regenerated from the current build each
  run** (the in-app Help dialog is the canonical interaction model), never copied — a stale map poisons the
  run (it did on the first attempt).
- **Mandatory verification gate:** every S1/S2 finding is cross-checked against current code (`file:line`)
  before it earns a fix task — the agent manufactures false blockers (the first run's two loudest "S1s"
  were both artifacts). Confirmed artifacts are recorded, not actioned.
- **Output:** a short-lived `docs/tactical/` backlog (the implementation handover) — the first run was
  `ux-retest-fixes.md` (shipped + wrapped; decisions in the ADR 0019/0022/0023/0025 addenda + git history).

## Skills deliberately not built

The productization audit (§A.9.4; wrapped — see git history) catalogued nine missing-skill candidates. The triage:

| # | Candidate | Disposition | Gate |
|---|---|---|---|
| 1 | `/release-check` (pre-M10 ship gate) | **defer** | Build after the first productized release ships. |
| 2 | `/trace` (Phase B verification harness) | **defer** | Gated on ADR 0007 acceptance + `trace.ts` landing in `axoview-lib`. |
| 3 | `/deploy-check` (verify Dockerfile/compose/wrangler against ADRs) | **defer** | Build alongside C.8 git-automation tactical; gated on ADRs 0009/0010 accepted. |
| 4 | `/regression-snapshot` (behavioural baseline pre-cleanup) | **defer** | Gated on M9 (Playwright suite live). |
| 5 | `/spawn-tactical` (scaffold tactical from register row) | **reject** | `/feature start` covers the canonical path; the row→tactical translation resists templating. |
| 6 | `/cwd-rename` (one-shot folder rename + memory rewrite) | **reject** | One-shot ops task; encoding it adds maintenance load for zero future value. |
| 7 | `/workflow-check` (print cadence + decision table) | **defer** | Fold into a "Quick reference" section here instead of a skill; saves skill-list bloat. |
| 8 | `/ux-baseline` (Phase 5b grep extract) | **defer** | Fold into `/shake-out` as an optional first-step flag. |
| 9 | `/perf-baseline` (Phase 5c grep extract) | **defer** | Same fold-into-/shake-out treatment as #8. |

**2026-06-21 addition — `/ux-journey-test`:** assemble persona prompts → run the Chrome-agent journey test
→ verification cross-check. A new deferred candidate from [ADR 0028](adr/0028-ux-journey-testing-protocol.md),
sibling to the deferred `/ux-baseline` (#8). Documented-only for now (the protocol lives in ADR 0028); build
the command if on-demand UX runs become frequent enough to be worth templating.

## See also

- [docs/README.md](README.md) — the map of the `docs/` tree: which doc is a living reference, a frozen review, an ADR, or a tactical, and where each lives.
- The productization audit §A.9 — the pass that produced this doc. Wrapped and deleted per the tactical lifecycle; see git history.
- `MEMORY.md` (Claude project memory) — memory index. Every design principle above links to its memory backing.
- [.claude/commands/](../.claude/commands/) — the in-scope skill bodies. Each one's behaviour is its own source of truth; this doc references but does not duplicate.
