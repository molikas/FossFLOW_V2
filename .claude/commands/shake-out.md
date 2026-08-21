---
description: Iterative bug-fix and polish loop for already-shipped UI — triage a list of bugs, paper-cuts or rough edges, fix them one at a time with the user re-testing each fix before the next, then ship one release-ready commit. Fixes bugs the user already knows about; does not hunt for new ones (/explore), does not audit quality or architecture (/audit), does not promote to master (/ship).
argument-hint: "[issue list — bugs, paper-cuts, rough edges; empty = triage from recent commits and open known_issues.md entries]"
disable-model-invocation: true
---

# /shake-out — Iterative Bug-Fix & Polish Loop

A workflow for sessions where the goal is **smoothing what's already shipped**, not building new features. Use this when handed a list of UI bugs, paper-cuts, or rough edges to clean up before a release.

> **Read when fixing UI:** [`docs/guidelines/ux-principles.md`](../../docs/guidelines/ux-principles.md) — the Axoview design language. Read the sections that cover the surface you're touching (its headings name them: §1 Layout, §4 Selection model, §8 Layout regions and overlays, §9 Touch & pointer interaction, plus §11 Whole-experience coherence for anything spanning surfaces), not the whole document for a single paper-cut. A "polish" fix that violates the principles is a regression, not a polish.
>
> **Surface vocabulary is locked:** when a polish fix introduces or renames an overlay or full-area surface, pick the term whose visual contract matches it — **Dialog** (centred, focus-trapped, Escape-dismissible, backdrop dims the canvas), **Popover** (anchored to a trigger, dismisses on outside click, no backdrop), **Panel** (persistent or toggle-revealed region inside the existing chrome, not focus-trapped), **Banner** (inline full-width advisory, not interactive), **Screen** (full-area placeholder or empty state). Don't coin a new one, and don't reach for `Modal` — [ADR 0008 Decision 2](../../docs/adr/0008-naming-convention.md) reserves it as a transition-only synonym for `Dialog` and forbids new `*Modal` names. Its table carries the full visual-contract test for borderline calls.

The `$ARGUMENTS` text (if any) should be the issue list. If none is given, build the candidate list without reading the whole register: `git log --oneline -15`, plus `grep -n '\*\*Status:\*\* Open' known_issues.md` — that file is ~8,400 lines and keeps resolved entries in place, so grep the Open marker and read only the entries it points at. Present the candidates and ask the user to pick.

## Posture

- **Reversible bias.** Edits are local and recoverable. Don't ask permission for each file edit. Do ask before destructive actions (force push, branch delete, dependency removal).
- **One issue at a time — unless the user batches.** Default is per-issue verification: each fix gets confirmed before you move on. If the user explicitly bundles ("fix all three", "do them together"), you may verify them as a group and ship one commit covering the bundle.
- **Honest about what didn't work.** If a fix fails, say what you tried, what the evidence now shows, and what you're doing next — then do it. Don't paper over a failure with a second guess, and don't expand the correction into a retrospective: the person reading it is waiting to re-test, not to review your reasoning.
- **No proactive refactoring.** This is polish, not architecture. If a fix tempts you to rename a file or extract a helper, resist unless the user asks.
- **Sub-agents: diagnosis yes, the loop no.** The fix → build → hand-off cycle is serialized on the user's confirmation, and a sub-agent can't take that hand-off — the loop itself stays in this session. Independent, read-only work does parallelise well: tracing three unrelated symptoms through the code at once, or reproducing one bug while you read another. Gate on whether the work is independent and read-only, not on how long the issue list is.

## The loop

### 1. Triage (do this first, before any code reads)

If the user handed you a clear, ordered list, restate it in one line, write the todos, and start — ask only what you actually can't infer. The round-trip below is for a list that is vague, long, or one you suspect they've already attempted a fix on.

Otherwise, restate each issue back to the user as a one-line bullet, in your own words, and ask:

- Have they already attempted a fix? (Avoid redoing failed work.)
- Is each one in scope for this session, or should some be deferred to `known_issues.md`?
- Any priority order, or just go top-down?

Write the agreed list as TodoWrite items. One todo per issue.

If the session crosses a context-summary boundary, **resume from the existing TodoWrite list and the most recent commit** — don't re-triage. The user already decided priorities; the boundary doesn't reset them.

### 2. Scope-narrow before reading code

Default search scope is **uncommitted local changes**, not full git history:

```bash
git status --short
git diff
git diff --staged
```

Only widen to recent commits (`git log --oneline -10`) or full repo if the symptom predates the local diff — say which scope you picked so the user can redirect before you read.

**Pre-existing failures are out of scope.** A test already failing on the base SHA before any session work is not evidence about your fix and doesn't belong in the shake-out loop. To settle whether it is pre-existing, grep `known_issues.md` for the failing test's name and ask the user if that's inconclusive — don't `git stash` a tree this loop is mid-edit in (a failed `stash pop` costs exactly the uncommitted changes that are this loop's default scope), and don't run the full suite to settle it (`npm test` fans out across all four Jest workspaces). File it in `known_issues.md` if it isn't already there. Don't try to fix it unless the user explicitly asks — chasing one costs the user a reproduce cycle and buries whether your actual fix worked.

### 3. Diagnose-then-fix per issue

For each issue, in order:

1. **Read** the relevant files. Don't grep blindly — use file paths the user gave you, or trace from the symptom (event handler → store action → reducer).
2. **Hypothesize or propose** before editing — pick the right one for the issue:
   - **Diagnosis (single root cause):** one sentence — *"I think X is happening because Y."* Then go.
   - **Design choice (multiple reasonable answers — UX wording, API shape, which-of-several-approaches):** write a brief proposal and **wait for the user's nod** before coding. Cheaper to course-correct in prose than after a build. **If the user rejects the first design, the second attempt is also a design choice — write another proposal before coding, don't just iterate.** Three rejected designs in a row = stop and ask the user to describe their target UX in concrete steps (cursor shape, click target, panel anchor, trigger event, etc.) before proposing again. Iterating on code after a rejected design is how a "polish fix" turns into a four-pass redesign.
3. **Edit.** Make the fix.
4. **Build if necessary.** This monorepo's app consumes built artifacts of `axoview-lib`. After editing anything under `packages/axoview-lib/src/`, run `npm run build:lib` so the app picks up the change. Skip the build only when the edit is purely under `packages/axoview-app/src/` (rsbuild HMR handles those).
5. **Hand off to user** for verification. Don't move on until they confirm "fixed" or "still broken."

### 4. Add diagnostics on attempt #2

If the first fix didn't land, **don't throw a second guess at it**. Add console.log diagnostics to the relevant code path:

- Log entry to the handler with key state (`isEditing`, `selectedId`, etc.)
- Log inside async callbacks / `requestAnimationFrame` to catch state-after-yield
- Wrap suspect calls in try/catch and log the result

Ask the user to reproduce and paste the console output. Use that to drive attempt #3.

**When verification fails, treat your diagnosis as a hypothesis, not a fact.** Diagnostics on attempt #2 should focus on *falsifying* the original diagnosis, not confirming it. If the output exposes a different shape of bug than you guessed, write a new diagnosis sentence before you write more code — even if the new one feels like a refinement.

**The green-test trap:** if your unit test for the bug passes but the user still reports the bug in the live app, **your test is wrong** — it doesn't reproduce the live condition. Don't use the green test as a falsifier ("can't repro, must be elsewhere"). Instead: write a test that *fails first* against the user's symptom, then fix. A passing test that exercises the same buggy code path without asserting the user-visible failure is worse than no test — it gives false confidence and delays the round-trip with the user.

If attempt #3 still doesn't fix it, propose moving the bug to `known_issues.md` rather than spinning further.

**Strip the diagnostics once they've done their job.** The logs stay in for the reproduce round-trip; they come out in the same commit as the fix, or earlier if the data has already landed. `no-console` is only a warning in `eslint.config.mjs` and the only git hook here is `commit-msg` (commitlint), so no pre-commit lint gate will catch a stray log before it ships in the published lib.

### 5. Document the trail at the end

**Default to skipping this step.** Bug fixes alone live in the commit message — that's enough. Only touch the artifacts below if a fix changed an invariant an ADR documents, relates to an in-flight tactical plan, or you're parking a bug as known/unresolved. Don't ceremonially update docs for the sake of it.

If artifacts do need updating, **do it in one batch at the end of the session, not after every fix.**

| Artifact | When to touch |
|---|---|
| [docs/tactical/`<plan>`.md](../../docs/tactical/) | If the fix relates to an in-flight tactical plan: mark sub-tasks `[x]`, update the Status header, add a "Polish on top of scope" section for fixes that landed outside original scope. |
| [docs/adr/`<n>`-*.md](../../docs/adr/) | Only if a fix changed an invariant the ADR documents. Add a dated note inside the existing decision section — don't write a new ADR for a bug fix. |
| [known_issues.md](../../known_issues.md) | Append an unresolved bug as symptom / workaround / a literal `**Status:** Open` line — the register is grepped on that exact marker. Resolved entries stay in place annotated `**Status:** Fixed in <sha> (date)`; don't delete them. |
| `MEMORY.md` (auto-memory) | Add a feedback memory only if the user gave durable preference guidance (e.g. "always strip secrets before commit", "never amend"). Skip for one-off task context. |

Keep every entry short — a few lines for a `known_issues.md` bug, one or two sentences for an ADR dated note, a bullet for a tactical sub-task. `/notes`, `/audit` and `/explore` read these files on every run, so length you add here is paid back on each of them.

Project doc conventions (see [docs/workflow.md](../../docs/workflow.md); the `project_docs_convention.md` memory, if present, is an optional cache): ADRs in `docs/adr/`, tactical plans in `docs/tactical/`, both lifecycle-aware (tactical doc gets deleted at merge time per its own wrap-up section).

### 6. Commit and push

Single coherent commit covering all fixes from the session.

- Stage explicit paths, not `git add -A`.
- Message style matches recent `git log` here: lowercase prefix (`feat:` / `fix:` / `chore:` / `docs:`), short title. The **body** must carry a user-facing, per-fix bullet list (one plain-language line per fix): the release-notes generator renders the commit body into the GitHub Release and `CHANGELOG.md` ([ADR 0046](../../docs/adr/0046-release-notes-generation-and-reference-integrity.md) §1), so keep it release-ready — no internal scratch notes. Every bullet must correspond to a fix the user actually confirmed this session (or verified as a group, if they batched it). The body ships verbatim, so an unconfirmed bullet becomes a public claim: leave it out, or say plainly that it is unverified.
- Co-author trailer: name the model you are actually running as, taken from your own harness — never by copying a model name out of a doc (`CLAUDE.md` states the rule; this repo's history already spans several models). No `Closes #N` / issue-reference footers — the project uses no issue tracker (issues are triaged in chat), so there is nothing to close ([ADR 0046](../../docs/adr/0046-release-notes-generation-and-reference-integrity.md) §3).
- Push to the current branch. Don't open a PR unless the user asks.

If multiple unrelated bug-classes were fixed, ask the user whether to split into multiple commits.

## What's deliberately not in this loop

- **Tests** — unless the bug class warrants one (e.g. an ADR invariant slipped). Tactical fixes don't always need tests; over-testing slows the loop.
- **Refactors / cleanup** — this is polish, not architecture. If you spot a god-file or circular dep, mention it once and move on. Use `/audit` for that work.
- **PR / release prep** — ship to branch; release flow is a separate concern.

## Reference

- Slash command lives at `.claude/commands/shake-out.md` — **tracked in git** (`.claude/commands/` is exempted from the `.claude` `.gitignore` rule), so edits are versioned and shared with collaborators. If this loop taught you something durable about this codebase's bug classes or about the loop itself — a diagnosis path that keeps paying off, a build step this file gets wrong — edit this file in the same commit rather than only saying it in chat. Same for a durable user preference: write it to the project memory, and read what's already there rather than rediscovering it.
- Sibling: [`/audit`](audit.md) — the heavy quality/architecture sweep. Use that one when you need depth, not the shake-out loop.
