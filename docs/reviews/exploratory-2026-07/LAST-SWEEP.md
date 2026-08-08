# Last sweep — the delta-mode anchor

`/explore`'s default mode scopes a wave by diffing the working branch against the
commit recorded here. **A sweep updates this file as its last act**, so the next
one picks up exactly where it left off. This is the only file in the archive that
is not frozen.

| Field | Value |
|---|---|
| **Anchor commit** | `9fa70364` |
| **Anchor subject** | `chore(explore): land the 2026-07 exploratory campaign record and probe lane` |
| **Anchor date** | 2026-07-30 |
| **Swept by** | the 2026-07 campaign (all 27 areas + a cross-area mop-up) |
| **Branch the anchor lives on** | `remediation/exploratory-campaign` |
| **Recorded** | 2026-08-08, remediation wave 6 |

The anchor is the commit that landed `explore/campaign` into the remediation
branch — the last point at which the whole tree had been swept. Everything after
it is remediation work (waves 1–6: roughly 240 fixes, five design-gated
restructures, and a WebGL canvas merge), and **none of that has been explored.**
It is a large delta and it is the natural first target.

```bash
git diff --stat 9fa70364..HEAD -- 'packages/*/src'
git log --oneline 9fa70364..HEAD
```

## How to update it

At the end of a sweep, replace the table with the commit you swept to, the date,
and one line naming the areas covered. Keep the previous rows below as history —
a two-line-per-sweep log is enough to see the cadence.

## Scheduling notes (headless)

The runtime contract is **Claude Code under the user's subscription** (ADR 0047
§4): interactively via `/explore`, or headless via
`claude -p "/explore"` from the repo root. Execution paths that bill a metered
API key are out of contract.

For a recurring unattended sweep, Windows Task Scheduler is the sanctioned
wiring — a Basic Task on whatever cadence, action `Start a program`:

| Field | Value |
|---|---|
| Program | `claude` (or the absolute path from `where claude`) |
| Arguments | `-p "/explore"` |
| Start in | `c:\mytemp\axoview-minor-fix\axoview` |

Two things to know before relying on it. **Headless runs cannot answer a
question**, so the skill's headless clause applies: pick delta mode, record the
choice in the wave file, and put anything that needed the owner into the report.
And **a scheduled run inherits no interactive OAuth**, so any MCP connector that
authenticates interactively is simply absent — which is fine for a sweep, since
nothing in the method needs one.

## History

| Swept to | Date | By | Scope |
|---|---|---|---|
| `9fa70364` | 2026-07-30 | 2026-07 campaign | all 27 areas + cross-area mop-up |
