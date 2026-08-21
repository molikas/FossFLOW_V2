---
description: Promote the current branch to master through the repo's PR-only promotion path — pre-flight test gate on both suites, version-coherence check across the five package.json files, then an exact git/gh plan the user confirms before anything mutates. Promotes the branch you are on and nothing else. Does not cut releases, bump versions or edit the CHANGELOG (semantic-release does that from master), and never edits files or commits on your behalf.
disable-model-invocation: true
allowed-tools: Bash, Read
---

# /ship — Promote the working branch to master

End-of-session promotion: take the current branch — whatever is checked out, so to promote `integration` you check it out first — verify it's green, and land it on master through a pull request. Always returns you to the working branch when done. Companion to `/notes` — run `/notes` first to sync prose docs; then `/ship` promotes to master. **The release itself is cut automatically by semantic-release** (CI, after the "Run Tests" workflow passes on master) — `/ship` does not bump versions or edit the CHANGELOG, and neither does `/notes` (see `.releaserc.json`). `/ship` just lands the conventional commits on master; the automation turns them into `vX.Y.Z` + CHANGELOG.

> **Refuse if the current branch is master.** Promoting master to master is meaningless; you almost certainly meant something else. Stop and ask which branch you meant.

## Phase 1 — Pre-flight (no changes)

Fetch first, so every comparison below is against the real master — `/ship` never updates local `master`, so that ref can be arbitrarily stale — then run the rest in parallel:

```bash
git fetch origin --quiet                    # refresh remote-tracking refs (no working-tree change)
git status --short                          # must be clean (or only contain staged work the user named)
git branch --show-current                   # → the branch to promote; always the one you are on
git log origin/<branch>..HEAD --oneline     # → commits not yet on remote
git log origin/master..HEAD --oneline       # → commits on this branch that master does not carry
git diff --shortstat origin/master...HEAD   # → what this branch ADDS to master (merge-base diff)
git diff --shortstat HEAD...origin/master   # → what master has that this branch LACKS
git rev-parse HEAD                          # → working SHA
git rev-parse origin/master                 # → master SHA
git remote get-url origin                   # → for the compare link in Phase 4
```

**Gate on the content delta, not the commit count.** Master is squash-merged, so a commit that already shipped stays unreachable from master and keeps counting in `origin/master..HEAD` — a large count there can be pure history noise. Promote only when `git diff --shortstat origin/master...HEAD` is non-empty: if the commit count is large but that diff is near-empty, this branch has nothing to promote — say so and stop. If `HEAD...origin/master` is large, the branch is behind master; report the gap before proposing anything.

`/ship`'s scope stops at the tree: it reads working-tree state and never changes it. If `git status --short` is not clean, show the user what is uncommitted and let them resolve it — a commit created here would land on master under a message they never wrote. If they name staged work as intentional, say plainly in the Phase 2 survey that it will **not** be shipped (the promotion takes HEAD) so they can decide before confirming.

Then **verify version coherence** — the committed `package.json` versions are **not** bumped on release (semantic-release runs `update-version` only inside the CI build, and the bump is not committed back to `master` — branch protection blocks the push, see commit #77), so all 5 stay frozen and equal between releases. The check just asserts they are all equal; a mismatch means someone hand-edited one — stop and report it as a bug rather than shipping a split version. Read the `"version"` line in all 5 and assert equality:

- `package.json`
- `packages/axoview-app/package.json`
- `packages/axoview-lib/package.json`
- `packages/axoview-backend/package.json`
- `packages/axoview-worker/package.json`

**Test gate (strict).** Run both suites and require zero failures:

```bash
npm test --workspace=packages/axoview-lib
npm test --workspace=packages/axoview-app
```

If any test fails, stop and report. Do not propose tolerance lists — broken tests are either real regressions (fix them) or stale (delete or repair them). Direct the user to fix and re-run `/ship`.

## Phase 2 — Plan + confirm

Before any git mutation, output a single user-facing block with two parts:

Every value in the blocks below — here and in Phase 4 — is copied from a command that actually ran this session: SHAs from `git rev-parse`, the commit and diff lines from the Phase 1 block, suite counts from the jest summary lines, the version from the five files you read, the merge result from the `gh` output. If a command did not run, or its output is not in front of you, write `not run` or `unknown` in that slot rather than the expected value. Never infer success from having issued the command — the user confirms the promotion on the strength of the Phase 2 survey, and reads Phase 4 as the record of what actually landed.

**Part 1 — survey (what /ship found):**

```
Working branch: <branch>
  HEAD: <sha> <subject line>
  Unpushed: <N> commit(s)
  Versions: <X.Y.Z> (all 5 package.json files match)

To merge into master:
  <N commits since origin/master>
  Adds <shortstat of origin/master...HEAD> · lacks <shortstat of HEAD...origin/master>
  - <sha> <subject>
  - <sha> <subject>
  ...

Test gate: lib <N>/<N> suites · app <N>/<N> suites · all passing
```

**Part 2 — plan (what /ship is about to do):**

Spell out the exact ordered git commands. Substitute real branch name + commit subjects so the user can spot a wrong-branch ship in the plan, not after.

```
Plan (master is PR-only — the master ruleset requires a pull request, so a direct
`git push origin master` is rejected with GH013; it is the same protection that
killed the release commit-back, see commit #77):
  1. git push origin <branch>                        # publish unpushed commits (if any)
  2. gh pr create --base master --head <branch> \
       --title "<type>(<scope>): <subject>" --body "<what this promotion lands>"
     → the title must be a conventional commit. Under a squash merge semantic-release
       sees nothing but this title, and a non-conventional one silently cuts NO
       release. promotion-title-lint only fires on PRs whose head is `integration`,
       so from any other branch nothing catches a bad title but you.
  3. gh pr checks --watch                            # required checks must be green first
                                                     # (long-running — give it a generous timeout)
  4. gh pr merge --merge                             # a merge commit is the preferred strategy
                                                     # here; a squash is permitted and the
                                                     # conventional title carries it
  5. git fetch origin --quiet                        # refresh origin/master for the Phase 4 SHAs
  6. git checkout <branch>                           # always return here (this path never leaves it)
  7. git pull origin <branch>                        # confirm the branch is in sync with origin

On merge conflict: abort, return to <branch>, surface conflict files.
If `git push origin <branch>` fails, stop and report the error verbatim. Never
  force-push, never retry.
If `gh pr create`, `gh pr checks` or `gh pr merge` fails, stop and report the error
  verbatim. Do not fall back to `git push origin master` — the ruleset rejects it, and
  the attempt strands a commit on local master that origin does not have, which then
  breaks every later comparison against master. If local master is already diverged
  from origin/master, say so and print — do not run — the one command that clears it:
      git checkout master; git reset --hard origin/master; git checkout <branch>
  Executing it is the user's call.
If step 7 fails, the local branch has diverged from origin/<branch>. Stop. Do not
  reset and do not force anything — the divergence is a fact the user needs to see.
  Report it and leave the branch as it is.
```

Then a single confirmation prompt: *"Proceed with this plan? Yes / No."* Skill stops if not yes.

## Phase 3 — Promote

Execute the plan exactly as printed in Phase 2. Don't deviate, don't optimize, don't combine. The user reviewed those exact commands. Phase 3 is silent: run the commands and go straight to the Phase 4 block. The user has already read the plan — running commentary between the confirmation and the report is noise, and if something fails, the report is where they need to read about it, not a stream of intermediate reasoning.

If the merge cannot proceed — `gh pr merge` reports the PR is not mergeable, or a merge you were asked to run locally returns a conflict:

1. `git merge --abort` if a merge is in progress locally (there is nothing to abort when GitHub refused the merge)
2. `git checkout <working-branch>` — always return the user to their working branch
3. Report the conflict files (`gh pr view --json mergeable,mergeStateStatus`). Do not attempt auto-resolution.

## Phase 4 — Report

```
Shipped:
  origin/master: <sha-before> → <sha-after>  (PR #<N>, merge commit <sha>)
  <branch>: still at <sha>
  origin/<branch> pushed · PR #<N> merged into master

Diff shipped:
  <git diff --shortstat origin/master~..origin/master output>

Subjects merged:
  - <sha> <subject>
  - ...

You're back on <branch>.
```

If `git remote get-url origin` returned a GitHub URL, append a compare link: `https://github.com/<owner>/<repo>/compare/<sha-before>...<sha-after>`.

## Hard rules

- **Always print the plan before mutating.** Phase 2 part 2 is non-optional. The user must see the exact commands before confirming.
- **Never force-push.** Plain `git push` only.
- **Never amend or rebase.** Merge workflow only.
- **Never skip hooks** (`--no-verify`).
- **Never auto-resolve merge conflicts.** Always abort + return + report.
- **Always restore the working branch** at the end, even on partial failure.
- **Refuse on master.** The skill is meaningless from master.
- **No manual tags.** Never create git tags by hand — semantic-release tags `vX.Y.Z` (and regenerates `CHANGELOG.md`) automatically when the merge lands on master; a hand-made tag would desync the automation's version math.
- **Strict test gate.** Any test failure aborts. Don't propose tolerance lists.
