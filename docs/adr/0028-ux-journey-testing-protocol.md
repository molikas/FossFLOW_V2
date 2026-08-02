# ADR 0028 — UX Journey-Testing Protocol

**Status:** Accepted (in force — [workflow.md](../workflow.md) names this the governing protocol for UX journey tests, and the 2026-06-21 persona run followed it. Status corrected 2026-07-15: it had sat `Proposed` while already governing.)
**Date:** 2026-06-21
**Supersedes:** none
**Superseded by:** none

## Context

We validate the **engine** with a repeatable harness and a written protocol —
[ADR 0020 (engine perf harness & measurement protocol)](0020-engine-perf-harness-and-measurement-protocol.md)
plus a `workflow.md` slot. We had **no
equivalent for usability**. UX regressions (discoverability, accessibility, localisation, mode clarity)
are exactly the class that type-checks, jest, and code review do not catch, and the canvas-ux-overhaul
(ADRs 0022–0027) is the kind of broad surface change that warrants a usability pass.

In 2026-06 we ran an ad-hoc, persona-driven journey test of the live app using the **Claude for Chrome**
agent, then cross-checked every severe finding against the code. Two lessons made the case for a written
protocol:

1. **The method works.** The run surfaced real, otherwise-invisible bugs — a caption rendering literal
   `&nbsp;` on the Canvas2D layer (the bulk canvas — `NodesCanvas.tsx` then, [`SceneCanvas.tsx`](../../packages/axoview-lib/src/components/SceneLayers/SceneCanvas.tsx) since the ADR 0038 §8 merge),
   click-to-arm icon placement landing under the panel ([PlaceIcon.ts](../../packages/axoview-lib/src/interaction/modes/PlaceIcon.ts)),
   Esc failing to cancel an action-bar-started connector, a chrome-wide hardcoded-English i18n gap, and
   two genuine accessibility blockers (no focus ring, keyboard-unreachable icon grid).
2. **The agent manufactures false blockers.** Its two loudest "S1" findings were **artifacts** — a
   claimed *350px hit-test coordinate mismatch* (it queried `data-axoviewId` instead of the real
   `data-axoview-id`; no offset exists) and a *data-corruption blank-page crash* (tile anchors are valid
   and load-failure already surfaces an error toast per [ADR 0011](0011-error-ux-contract.md) / UX §6.3).
   Without a mandatory code-verification step those would have headed a fix plan.

The decision: make persona-driven journey testing a **first-class, on-demand capability** with a
disciplined verification gate — the usability analog of the perf harness.

The first stale-input failure is itself instructive: the initial run was steered by a **capability map
copied from a stale README** (it promised double-click-to-add and "no context menu" — both wrong after
ADR 0022/0027), which produced cascading false findings. The protocol therefore forbids a frozen
capability map (see Decision §4).

## Decision

**1. When we run it.** On-demand, not every session — the perf-harness cadence: before a release,
after a broad UX-surface change (e.g. an overhaul like ADRs 0022–0027), or when usability is in
question. It is a periodic validation, listed in [workflow.md](../workflow.md) alongside `/audit`.

**2. Target & driver.** The **integration preview** (`https://integration.axoview.pages.dev/`, the build
under test — newer than the public `master` demo), driven by the **Claude for Chrome** agent on a
Sonnet-class model. The preview is storage-less (session/localStorage); server-only features
(share links, server persistence) are out of scope on it and must not be filed as defects — for full
view-mode/share coverage, run against a local/Docker build with `ENABLE_SERVER_STORAGE=true`.

**3. Personas.** A fixed set spanning two axes — *experience level* × *usage mode* — so the sweep is
comprehensive rather than five author journeys. One persona per run (sharper than one marathon). Briefs
in Implementation notes:

| | Persona | Axis it stresses |
|---|---|---|
| **P1** | absolute beginner, non-technical | first-run discoverability, empty state, save/persistence trust |
| **P2** | intermediate (ex-draw.io/Lucid/Miro) | convention transfer, the common edit loop |
| **P3** | expert cloud architect | depth, keyboard, icon packs, layers/pages, styling, export, perf feel |
| **P4** | presenter / consumer | present/view mode, annotation, reading detail, mode clarity |
| **P5** | keyboard-first & international | keyboard reachability, focus visibility, contrast, localisation |
| P6 *(optional)* | touch / pen | direct-manipulation gestures — **needs real devices**, desktop emulation is hint-only |

**4. The shared brief is regenerated, never frozen.** Each run assembles one prompt = a **shared brief**
+ **one persona card**. The shared brief's *capability map* and *do-not-report* list MUST be
re-derived from the current build at run time:

- **Capability map** — derive from the in-app **Help dialog** (its keyboard + mouse-interaction tables
  are the canonical, code-driven interaction model:
  [HelpDialog.tsx](../../packages/axoview-lib/src/components/HelpDialog/HelpDialog.tsx)) plus a quick
  read of the relevant interaction modes — **never** paste a prior map. It is an answer key for grading
  discoverability, not a click script: the persona discovers first, then the map judges "X exists but I
  never found it unaided."
- **Do-not-report list** — refresh from [known_issues.md](../../known_issues.md) + the documented
  intended-behaviour set, so the agent doesn't re-file tracked items. **Never** suppress i18n or a11y
  reporting — those are the high-value yields.

The brief also carries: think-aloud protocol; **"driving the app reliably"** gesture tips (the canvas is
real — press-move-release to draw, right-*tap* not synthetic `contextmenu`, Esc leaves connector mode,
judge *rendered* text not raw HTML, the 2D/iso toggle persists); the 13-heuristic rubric (H1–H13);
the S1–S4 + DELIGHT severity scale; and the structured output (journey log · findings table · scorecard).

**5. Mandatory verification gate.** Every **S1/S2** finding is cross-checked against current code
(`file:line`) before it enters a plan — the usability analog of perf's anti-cheat discipline. Run it as
a fan-out (one verifier per finding-cluster) returning a verdict: `REAL` / `PARTIAL` / `ARTIFACT` /
`BY_DESIGN` / `NEEDS_MANUAL_REPRO`, with root cause + fix + effort. **An unverified severe finding does
not get a fix task.** Record confirmed artifacts as cautionary examples (the two above) so they aren't
re-raised.

**6. Output.** A short-lived **tactical bug backlog** in `docs/tactical/` (the implementation handover),
prioritised, each row carrying the verified root cause + fix + effort. The first run produced
`docs/tactical/ux-retest-fixes.md` (since shipped + wrapped — its decisions are folded into the
ADR 0019/0022/0023/0025 addenda; the backlog itself lives in git history).

## Consequences

**Positive:**
- A repeatable, disciplined way to catch the regression class code review misses — discoverability,
  a11y, i18n, mode clarity — keyed to real personas.
- The verification gate converts agentic-browser noise into a trustworthy, code-grounded backlog.
- Mirrors the perf harness, so the cadence is familiar and lives in `workflow.md`.

**Negative / risks:**
- **Agentic-browser variance** — a single pass walks past issues; re-run a thin persona. Findings are
  signal, not proof, until verified.
- **False findings are inherent** — mitigated by the mandatory verification gate, not by trusting the
  agent.
- **Stale inputs poison the run** — mitigated by §4 (regenerate the capability map / do-not-report each
  run; never freeze).
- **Preview is storage-less** — server-mode surfaces need a self-hosted build; note the gap rather than
  filing it.

## Implementation notes (non-binding)

These are the durable, runnable assets — assemble the paste-ready prompt from here; there are **no
standalone prompt files** (the earlier `docs/ux-prompts/` + `docs/ux-journey-test-protocol.md` were
retired into this ADR).

### Persona cards (condensed; expand to first-person briefs at run time)

- **P1 "Maya" — beginner, non-technical.** Never used a diagram tool; clicks and reads labels, no
  shortcuts; fears losing work. *Goal:* three labelled boxes + arrows, then "save" it. *Focus:* H10/H1/H6/H8/H11.
- **P2 "Devin" — intermediate.** Built diagrams in draw.io/Lucid/Miro; expects right-click menus,
  double-click, drag-from-sidebar, marquee, Ctrl+Z. *Goal:* Web→API→DB with labelled connectors, then
  tidy. *Focus:* convention transfer + the edit loop (H2/H4/H7).
- **P3 "Priya" — expert architect.** Lives in diagram tools; keyboard-driven; wants real cloud icons,
  layers, multiple pages, connector styling, clean export. *Goal:* a credible 3-tier cloud diagram +
  export. *Focus:* depth, keyboard ergonomics, fine-control precision, perf feel (H7/H6/H4/H1).
- **P4 "Tomás" — presenter/consumer.** Mostly receives & presents; wants to annotate live, toggle
  detail, read item info effortlessly. *Goal:* assemble a small diagram, then present/explore it.
  *Focus:* edit-vs-present clarity, annotation safety, overview legibility (H12/H11/H1/H13).
- **P5 "Sam" — keyboard-first & international.** RSI; minimises mouse; runs a non-English UI; cares about
  focus rings, contrast, legibility. *Goal:* drive the app keyboard-first in a non-English locale.
  *Focus:* keyboard reachability, focus visibility, contrast, localisation completeness (H13/H7/H8).

### Rubric (H1–H13)

H1 system status · H2 match real world & prior tools · H3 user control & freedom (undo/escape/reversible)
· H4 consistency & standards · H5 error prevention & recovery · H6 recognition over recall · H7
flexibility & efficiency · H8 aesthetic & minimalist · H9 help & docs · H10 discoverability of canvas
affordances · H11 feedback on save/destructive ops · H12 mode clarity (edit/view/present) · H13
accessibility & inclusivity (keyboard reach, focus visibility, contrast, legibility, localisation).

### Severity & output

`S1` blocker · `S2` major · `S3` minor · `S4` polish · `DELIGHT`. Output per run: **(A)** narrated
journey log + a one-line "first 5 minutes" read; **(B)** findings table
`ID | Severity | Heuristic(s) | Where | Expected | Happened | Suggested fix | Screenshot`; **(C)**
scorecard — goal completion, 1–7 sentiment, top-3 friction, top delights, the one change that matters most.

### Driving the app reliably (anti-artifact tips for the agent)

Press-move-release to draw a rectangle (a no-move click creates nothing); drag or click-then-click to
place an icon; right-button **press-release without moving** to open the context menu (a synthetic
`contextmenu` event is swallowed; movement = pan); **Esc** cancels connector mode (don't keep clicking
empty canvas); judge captions by **rendered** canvas text, not raw HTML (`&nbsp;` renders as a space);
confirm edit vs present mode before judging; a flat-2D grid is a persisted toggle, not the default; give
async actions (paste, connector routing) a frame before the next click.

### Future skill

`/ux-journey-test` (assemble the persona prompts → run → verification cross-check) is a **deferred skill
candidate** — sibling to `/audit`/`/shake-out`, and a relative of the deferred `/ux-baseline`
([workflow.md Process debt #8](../workflow.md)). Documented-only for now per the 2026-06-21 decision.

## Acceptance criteria

- **Process:** a UX journey-test run produces a `docs/tactical/` backlog in which **every S1/S2 finding
  carries a code-verified root cause** (`file:line`) and a `REAL/PARTIAL/ARTIFACT/BY_DESIGN/NEEDS_REPRO`
  verdict; confirmed artifacts are recorded, not actioned.
- **Discoverability:** the capability map and do-not-report list are regenerated from the current build
  (Help dialog + `known_issues.md`), not copied from a prior run.
- **Workflow:** [workflow.md](../workflow.md) references this ADR as the on-demand usability-validation
  step.
- **Manual verification:** the first run (`docs/tactical/ux-retest-fixes.md`, now wrapped into the
  ADR 0019/0022/0023/0025 addenda + git history) demonstrated the full loop end-to-end.
