# Axoview

Isometric diagramming editor. Monorepo: `axoview-lib` (engine + UI), `axoview-app` (shell),
`axoview-backend` (Express + fs adapter), `axoview-worker` (Hono + Cloudflare Pages Functions),
`axoview-e2e` (Playwright).

Session conventions, the command router and the design principles live in
[`docs/workflow.md`](docs/workflow.md) — read it when a session touches cadence, not on every run.

## Read budget

These files are grep-first. Read a section, never the whole file:

| File | Cost | How to read it |
|---|---|---|
| `known_issues.md` | ~132k tokens | `grep -n '^## '` for titles; `grep -n '\*\*Status:\*\* Open'` for the open set |
| `docs/tactical/adr-code-audit.md` | ~105k | its top Disposition block only (~60 lines) |
| `CHANGELOG.md` | ~49k | top section only; `git tag --sort=-v:refname \| head -3` answers "what shipped" |
| `docs/guidelines/testing.md` | ~29k | its `## Sections` index, then the one section you need |
| `PLAN.md` | ~22k | the named phase section |

Reading `known_issues.md` whole costs more than all seven slash-command bodies put together
(~38k tokens), and it is the single most common way a session burns its context before doing any
work. When a command says "read X first", read the part of X that answers the question in front
of you.

## Delegating

Delegate on independence and payoff, not on volume. An agent earns its place when its slice is
independent of every other slice, it must read something large to answer one question, and its
output is a verdict nobody has to re-derive. Run independent agents in parallel and collect them
asynchronously — never spawn one and block on it. An agent never earns a slot for work a grep
already answers, or for a second pass over bytes another agent already read. What has actually
killed runs in this repo is re-reading the same large file, not concurrency.

## Shell

Command bodies in `.claude/commands/` are POSIX — run them through the Bash tool (git-bash).
PowerShell is the default shell here and parses neither `&&` nor `mkdir -p`. The Bash tool's cwd
persists between calls in the main session but **resets between calls in an agent thread**, so
anchor paths at the repo root (`cd "$(git rev-parse --show-toplevel)"`) rather than relying on a
`cd` from an earlier step. Select a package with `--workspace=`, not `cd`.

## Commits

Conventional commits, lower-case subject (commitlint rejects a leading capital — put reference
codes later in the subject). Releases are cut by semantic-release from master; never edit
`CHANGELOG.md` or bump a version by hand. Close with a `Co-Authored-By:` trailer naming the model
you are actually running as — take the name from your own harness, never by copying one out of a
doc.
