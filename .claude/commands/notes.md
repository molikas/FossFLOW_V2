---
description: End-of-session doc sync — derives the features/architecture/testing/ux/perf/known-issues/PLAN updates this session's commits actually justify, wraps finished tactical docs, and proposes a commit message. Subject is the docs, not the code (that is /audit). Never commits, never pushes, never edits CHANGELOG.md or a package.json version.
disable-model-invocation: true
---

# /notes — Axoview End-of-Session Doc Sync

Run at the end of any coding session — features, bug fixes, or refactors — to sync all repository documentation with what actually shipped. Derives content from commits and code; asks only for what it cannot infer. Never commits automatically: always stops for user review.

> **UX principles maintenance:** if the session introduced or changed UI patterns (new layout primitive, new keyboard shortcut, new affordance behavior, etc.), check whether [`docs/guidelines/ux-principles.md`](../../docs/guidelines/ux-principles.md) needs an update. The doc is a living reference — it should reflect what actually shipped.
>
> **Linking ADRs:** when summarising the session's durable output (architecture.md cross-refs, README updates), link the relevant ADRs — and read the `**Status:**` header of every ADR you cite. [docs/adr/](../../docs/adr/) is the source of truth and the set grows every wave, so never cite an ADR as shipped on the strength of a list, including any list in this file: hardcoded enumerations here have gone stale three times, the second time inside the very sentence warning against them, which is why this note no longer carries one. Check with `grep -rh '^\*\*Status:\*\*' docs/adr/ | sort | uniq -c`.

> **⚠ Releases are automated — never hand-cut.** This repo uses **semantic-release** (`.releaserc.json` + `.github/workflows/release.yml`). On merge to `master`, after the test workflow passes, it computes the SemVer bump from conventional commits (`feat`→minor · `fix`/`perf`/`refactor`→patch · `BREAKING CHANGE`→major), bumps all 5 `package.json` versions (`update-version`) and regenerates `CHANGELOG.md` inside the CI build, then tags `vX.Y.Z` and publishes a GitHub Release — all automatically. The bump + changelog are **not** committed back to `master` (branch protection blocks the push; `cd2ee147`), so the git tags + GitHub Releases are the canonical record and the in-app version is injected from the tag at build time ([ADR 0045](../../docs/adr/0045-release-version-provenance-and-in-app-surfacing.md)). Therefore `/notes` **never** edits `CHANGELOG.md`, **never** bumps a version, and **never** cuts a release by hand. `CHANGELOG.md` still carries 8 historical `## [YYYY.M.D]` headings from the retired manual-cut era and has no `[Unreleased]` section; both are expected. `/notes` still owns: **README · architecture.md · testing.md · known_issues.md · PLAN.md · ADR statuses · tactical wrap.** Commit-message quality is the release-notes lever — `release-notes-generator` renders the commit subject and body, not the changelog file.

---

## Phase 0 — Survey (automated, no questions)

Run all of the following before asking anything. The survey determines scope — phases that find nothing to update are skipped entirely.

### 0a. Establish the session boundary

```bash
# If on a feature branch: commits since branching from master
git merge-base HEAD master   # → <base-sha>
git log --oneline <base-sha>..HEAD

# If already on master: commits since the last version tag
git describe --tags --abbrev=0   # → last tag, SemVer (e.g. v3.6.0)
git log --oneline <last-tag>..HEAD
```

Save the commit list and the base SHA — every subsequent step references them.

### 0b. Read the change map

```bash
git log --pretty=format:'%h %s%n%b%n---' <base>..HEAD
git diff <base>..HEAD --stat
```

Group commits by conventional-commit prefix and note which doc surface each one feeds — this is what 0d turns into a scope list:
- `feat` / `ux` → `docs/features.md` (+ a README "Highlights" line only if marquee); a UI pattern also feeds `ux-principles.md`
- `fix` / `revert` → `known_issues.md` — a new entry, or an existing one to close
- `security` → `known_issues.md`, and check whether it warrants an ADR
- `perf` → a `perf-troubleshooting.md` case study, if it exercised one of the documented anti-patterns
- `refactor` / `chore` → `architecture.md`, and only if a pattern or invariant changed
- `test` → `testing.md` totals + a dated suite section
- `docs` → skip (already doc work)
- `ci` → usually nothing

### 0c. Read current doc state (in parallel)

The survey reads are independent and read-only — fan them out, and delegate them when the corpus is large enough to pay for it. Everything from Phase 2 on stays in this session: the deliverable is one reviewable diff plus a commit proposal traceable to it, and concurrent editors produce conflicting edits and a summary nobody can check.

1. `docs/tactical/` — list the files, then test completeness by grep rather than by reading: `grep -c '^\s*-\s*\[ \]' docs/tactical/<file>.md` (zero unchecked boxes = fully complete). Never read `adr-code-audit.md` whole — its own README says to read only its Disposition block. Flag the fully-complete ones for Phase 1.
2. `docs/guidelines/testing.md` — the totals block at the top only: the `**Last updated:**` line, the per-workspace `| Workspace | Passing | Suites |` table, and the `**End-to-end:**` line.
3. `known_issues.md` — grep it, don't read it: `grep -n '^## '` for the entry titles and `grep -n '\*\*Status:\*\* Open'` for the open set — that exact spelling, because the bare `Status: Open` matches almost nothing. Read in full only the entries whose symptom overlaps this session's commits. This step said "full content" when the file was 54 KB; it is now 528 KB.
4. `PLAN.md` Phase Status Dashboard — note any phases that were `[~]` or `[ ]`.
5. `docs/features.md` — read it (32 KB, 11 sections). You need the section list to place a new feature and the surrounding bullets to match their style in Phase 2. This is the detailed feature inventory; the README carries only a condensed "Highlights" list that changes only for marquee features.

### 0d. Determine scope

Build a checklist of which files actually need updating. Only include a file if the survey found evidence it needs changing:

| File | Update if… |
|---|---|
| `CHANGELOG.md` | **Never** — auto-generated by semantic-release on merge; do not hand-edit |
| `docs/features.md` | `feat` / `ux` commits that add a user-visible feature not covered in existing bullets |
| `README.md` | Only if a marquee capability changes the "Highlights" list or the run-locally commands changed |
| `docs/guidelines/ux-principles.md` | A UI pattern was introduced or changed — new layout primitive, keyboard shortcut, or affordance behavior (the banner above) |
| `docs/guidelines/architecture.md` | A new subsystem, pattern, invariant or gotcha — visible in the diff, not only in a commit body. Open runtime issues go to `known_issues.md` instead |
| `docs/guidelines/testing.md` | Test files added or test counts changed in the diff |
| `docs/guidelines/perf-troubleshooting.md` | A `perf` commit landed AND any of the documented anti-patterns (A-1..A-6) was exercised — append a case-study subsection |
| `known_issues.md` | Bug surfaced or fixed that isn't already tracked |
| `PLAN.md` | A phase that was `[~]` or `[ ]` is now complete |
| **Tactical wrap** | Fully-complete tactical docs identified in 0c |

This table is the sole routing authority: every file it can put in scope has a matching Phase 2 section below, and nothing reaches Phase 2 that is not on it.

Report the scope to the user in one line before Phase 1: *"I'll update: docs/guidelines/architecture.md, docs/guidelines/testing.md, docs/features.md. Skipping: README (no marquee capability), known_issues.md (nothing new), PLAN.md (no phase completed)."*

---

## Phase 1 — Gap analysis (one batched message)

Ask only what the diff and the Phase 0 survey cannot answer, and ask all of it in one message so the user answers once. The axes that usually need a human: which `docs/features.md` section a new user-visible feature belongs under, and whether it earns a README "Highlights" line (marquee only); any non-obvious constraint, invariant or gotcha `architecture.md` should capture (code explains *what*; this captures *why*); bugs surfaced or fixed that `known_issues.md` doesn't track, and entries to mark resolved; whether a UI pattern this session shipped belongs in `ux-principles.md`; any commit subject too vague to render a readable release-notes line (it can't be reworded post-merge without a rebase); whether to wrap any tactical doc 0c flagged as fully complete; and anything decided in conversation that the commits don't capture. Drop the ones the survey already answered with confidence. Adding an axis beyond these takes a specific, session-raised reason — don't broaden the interview by default.

If the user says "you decide", apply these defaults:
- **Features / README:** add to `docs/features.md` only if the feature is genuinely new to that inventory (not a bug fix or internal refactor). Touch the README "Highlights" only for marquee capabilities.
- **Architecture:** record a constraint, invariant or gotcha if the session established one — the diff is evidence for this, not just the commit body; a constraint nobody wrote down is exactly the kind this doc exists to capture. Skip anything already derivable from reading the code.
- **Known issues:** add a known issue only if there's a concrete symptom + workaround.
- **UX principles:** record only a pattern that actually shipped; if an existing principle now looks wrong, flag it rather than editing it.
- **Release notes:** skip — releases are automated (semantic-release on merge).
- **Tactical wrap:** wrap only if every sub-task is `[x]` with no `[ ]` or `[~]` remaining.

---

## Phase 2 — Execute

Work through the scoped file list from Phase 0d in this order. Read the region you are about to edit immediately before editing it — the Edit tool requires a prior Read of the file, but on the large registers (`known_issues.md`, `PLAN.md`, `docs/tactical/adr-code-audit.md`) read the target section by offset, not the whole file. Never rewrite existing content — only add.

These docs are scanned by humans hunting one fact, and they are additive-only — nothing you over-write here gets trimmed later. Match the length of what's already around your insertion: a features bullet is one line, a PLAN.md summary is one line, an architecture row is a row, a new `### 2x` subsection is a short paragraph and at most a small table. If an insertion is visibly longer than its neighbours, it's wrong.

### docs/features.md (and README "Highlights")

*(only if Phase 1 confirmed additions)*

Insert new bullet(s) under the correct section of `docs/features.md` (the detailed feature inventory). Match the existing bullet style exactly (bold lead term, em-dash, explanation, ADR link where one exists). Never rewrite existing bullets. If a new section is needed, add it at the end of the existing sections with a `##` heading.

Touch the README only if the feature is a marquee capability: add or adjust one line in the "Highlights" list. Do not touch anything else in the README.

### docs/guidelines/ux-principles.md

*(only if 0d flagged a UI-pattern change)*

Add the pattern under the numbered section it belongs to (§1 typography, §4 selection, §9 touch, and so on). It is a living reference — record what shipped, don't restate intent. Never rewrite an existing principle; if one is now wrong, flag it to the user instead of editing it.

### docs/guidelines/architecture.md

*(only if 0d or the diff warrants)*

Re-derive every target section from the file's own Table of Contents before inserting — section numbers move, and any heading or column set quoted below may already be stale. Then make surgical insertions only:

- **`## 1. Feature Inventory`** — add rows to the sub-table that matches the feature's area. The column sets differ per sub-table (`| Feature | Source | Entry Point |`, `| Feature | Source | Entry |`, `| Feature | Source | Notes |`), so copy the header of the table you are inserting into rather than any format quoted here.
- **New `### 2x` subsection** — only if a genuinely new subsystem appeared (new package, new provider, new architectural layer). Append after the last existing `### 2x` block, still inside `## 2. Architecture Map` and before `## 3. Performance Architecture` — **and add it to the Table of Contents §2 line in the same edit.** That index is maintained by hand and falls behind whenever this step is skipped.
- **Architectural lessons** — a new invariant, constraint or gotcha goes under `## 4. Lessons Learned`. Open runtime issues do not: they go in `known_issues.md`. architecture.md has no known-issues section, and re-creating one re-splits a surface that was deliberately consolidated.
- **"Last updated" line** — bump the date, increment the revision number by 1, and **replace** the parenthetical with one clause naming this revision's change. The line carries the current revision, not a chain of them — don't append; `git log --follow docs/guidelines/architecture.md` is the history.

Never rewrite existing sections. Cross-link to ADRs where relevant.

### docs/guidelines/testing.md

*(only if test files changed in the diff)*

- Update the totals block at the top: the per-workspace `| Workspace | Passing | Suites |` rows and the `**Total**` row, the `**Unit / integration totals** (measured <date> …)` line, the `**End-to-end:** N Playwright specs, … (<date>)` line if e2e changed, and `**Last updated:**`.
- If the session's suites are a wave worth recording, the wave note under the totals is **one line** — the per-workspace delta and the rule the suites came in under. Not a paragraph, and not a second telling of what the section below already says.
- Record new suites the way the file currently records them: a dated topical `### <what the suite pins> (<date>)` section at the top of `## Suite history`, with its row in that section's table. If what you are recording is a durable rule rather than a record of one wave, it belongs under `## Contracts the suite depends on` instead — that section sits above the catalogue precisely so a reader hits it without paging through the history. The `### Branch additions (…)` tables are a frozen 2026-05 convention — read them, don't extend them.
- Do not modify the Layer tables or their `**Total: N tests**` footers — those are manually curated.

### docs/guidelines/perf-troubleshooting.md

*(only if 0d flagged a `perf` commit that exercised A-1..A-6)*

Append a case-study subsection after the last existing one, matching the shape of the A-1..A-6 write-ups: which anti-pattern it hit, the measurement before and after, and the fix. Cite the commit SHA.

### known_issues.md

*(only if Phase 1 identified items)*

Add new issues in this format:

```markdown
## <Short symptom title>

**Symptom:** One sentence.

**Workaround:** Concrete steps, or "None known."

**Status:** Open / Fixed in <commit-sha> (date)
```

For issues now fixed: append `**Status:** Fixed in <sha> (date)` to the existing entry — do not delete it. Closed issues are still useful for searchability.

### PLAN.md

*(only if a phase completed)*

- Flip the phase row from `[ ]`/`[~]` → `[x]` in the Phase Status Dashboard.
- Append a one-line summary under the relevant phase section: `- <What shipped> — see <ADR or file links> (date)`.
- Touch nothing else. PLAN.md is a strategic dashboard, not a feature log.

---

## Phase 3 — Release cut (automated — nothing to do by hand)

**There is no manual release cut.** semantic-release cuts the release when the branch reaches `master` (CI, after the test workflow passes):

- `commit-analyzer` picks the SemVer bump (`feat`→minor · `fix`/`perf`/`refactor`/`revert`→patch · `BREAKING CHANGE`→major · `docs`/`test`/`chore`/`style`/`build`/`ci`→no release).
- `update-version` bumps all 5 `package.json` files and `@semantic-release/changelog` regenerates `CHANGELOG.md` **inside the CI build (not committed back — branch protection, `cd2ee147`)**; a `vX.Y.Z` tag + GitHub Release land automatically. The in-app version is injected from the tag at build time (ADR 0045).

Do **not** bump any `package.json` version and do **not** edit `CHANGELOG.md`. If the user asks to "cut a release," the answer is: land the conventional commits on `master` (via `/ship` or a PR) and the automation cuts it. You *may* state the version that will result — read the latest release from the git tags (`git describe --tags --abbrev=0`; the committed `package.json` is frozen), apply the bump rule to the session's commit types — but never write it into a file.

---

## Phase 4 — Tactical wrap-up (only if Phase 1 approved a wrap)

For each approved tactical doc:

1. Read the doc's Wrap-up section for its specific PLAN.md one-liner text.
2. Append that line under the correct PLAN.md phase (same rule as Phase 2 PLAN.md above).
3. Delete the tactical doc file.
4. **Memory sync:** if a `project_docs_convention.md` memory is reachable from this session, remove this topic's bullet from its `**Active tactical docs:**` list. Look under every Claude memory directory available to you, not only the one derived from the current path — the memory key for this repo still uses the pre-rename `FossFLOW` project name. If you find none, say so in the Phase 5 summary rather than skipping silently. The deleted file + the PLAN.md line are the durable record; the memory is only a cache.
5. If the tactical doc referenced a decision-pointer memory (e.g. `project_2br_decisions.md`) and it exists, check whether that memory is now stale and update or retire it.

---

## Phase 5 — Review & commit

**Do not run `git commit` automatically.**

1. Run `git diff --stat` and show the user the summary. Nothing is staged and nothing should be — `/notes` never runs `git add`; the user stages and commits.
2. Propose a commit message in this format, one bullet per file the Phase 0d scope list actually touched. Every bullet must name a change you can point to in the diff you just printed — if a file isn't in that diff, its line reads "no changes". Never describe an edit you intended, planned, or believe you made.

```
docs(notes): end-of-session sync — YYYY-MM-DD

- README: <what was added, or "no changes">
- docs/guidelines/architecture.md: <what was added, rev N→N+1, or "no changes">
- docs/guidelines/testing.md: <count update, or "no changes">
- known_issues.md: <what was added/closed, or "no changes">
- PLAN.md: <phase update, or "no changes">
- ADR statuses: <flips, or "no changes">
[- Tactical wrap: <topic>]

Co-Authored-By: <the trailer naming the model you are actually running as — see CLAUDE.md>
```

Use the `docs(notes):` type so semantic-release treats this as a non-releasing doc commit (the release is cut from the `feat`/`fix` commits, not this sync).

3. Tell the user: *"Review the diff above. Run `git commit` when ready, or let me know what to adjust."*

Stop here. Do not push.

---

## Hard rules

- **Read before write** — every file is read in Phase 0 or immediately before editing; on the large registers that means the region you are editing, not the whole file. Never blind-append.
- **Additive only** — never rewrite existing content in any file. Add bullets, add rows, add sections. Existing prose stays intact.
- **Never commit automatically** — Phase 5 always stops for user review.
- **Scope to the session** — if the survey found nothing changed in a file, don't touch it. Don't pad.
- **One concern, one file** — if a change touches both README and architecture.md, update both correctly rather than consolidating into one.
- **`PLAN.md` is a dashboard** — only the Phase Status Dashboard checkboxes and the one-line phase summary. Never touch phase content blocks.
