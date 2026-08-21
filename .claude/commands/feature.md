---
description: Bootstrap and maintain a feature's docs record against the Axoview three-tier convention. Four modes — start (scaffold ADR(s) + an optional tactical plan) · extend (a dated addendum inside an existing ADR) · supersede (a new ADR with reciprocal Supersedes/Superseded-by cross-links) · wrap (retire a shipped tactical into a one-line PLAN.md entry). Owns ADR numbering and the supersession fields. Writes docs, not code — it does not begin implementation, and its subject is a decision being made now, not the existing corpus (that is /docs-sweep).
argument-hint: "start <feature description> | extend <ADR-number> <what to add> | supersede <old-ADR-number> | wrap <tactical-topic>"
---

# /feature — Axoview Feature Bootstrap & ADR/Tactical Maintainer

Bootstrap a new feature against the Axoview docs convention (ADRs in `docs/adr/`, short-lived tactical plans in `docs/tactical/`, strategic phases in `PLAN.md`). Also handles ADR addendums, supersession, and tactical wrap-up.

> **Read first when the feature touches UI:** [`docs/guidelines/ux-principles.md`](../../docs/guidelines/ux-principles.md) — the consolidated design language for Axoview (layout, affordances, keyboard, item-type parity). Mirror existing patterns rather than introducing new ones.

## Modes

The argument selects a mode. If no argument is given, ask the user which one.

| Mode | Trigger | What it does |
|---|---|---|
| `start <short feature description>` | Default starting point for a brand-new feature. | Reads the docs landscape, asks scoping questions, scaffolds new ADR(s) and (optionally) a tactical doc. |
| `extend <ADR-number> <what to add>` | An in-flight feature reveals a new constraint that fits inside an existing ADR. | Drafts a dated addendum block inside the existing ADR — does **not** spawn a new ADR. |
| `supersede <old-ADR-number>` | A new decision replaces an old one. | Creates a new ADR with proper Supersedes/Superseded-by cross-links and flips the old ADR's `Status` to `Superseded`. |
| `wrap <tactical-topic>` | Tactical work is shipped + smoke-tested. | Adds the one-line entry to `PLAN.md`, deletes the tactical doc, refreshes memory pointers. |

## Phase 0 — Read the docs landscape (every mode)

Before doing anything else:

1. Get every ADR's identity and edges in one pass — `grep -n '^# ADR\|^\*\*Status:\|^\*\*Date:\|^\*\*Supersedes:\|^\*\*Superseded by:' docs/adr/*.md`. That is the whole Phase 0 need; read a full ADR body only when the mode targets that ADR.
2. Read `docs/tactical/` index (`ls` + skim the `Status:` line of each).
3. Read `PLAN.md` headings (Phase Status Dashboard) to know which phase a new feature lands under.
4. Read [`docs/workflow.md`](../../docs/workflow.md) — the authoritative session cadence + convention rules, versioned in the repo so it travels with every clone. It is ~8k tokens: read it in full for `start` and `supersede`. For `extend` and `wrap`, read *Tactical-driven sessions* (the wrap contract and the "`docs/tactical/` is empty between initiatives" rule) plus Design principles 4 (ADRs vs PLAN.md vs tacticals), 5 (post-rename pointer policy) and 7 (whole-experience coherence).
5. **Optional accelerator (skip silently if absent):** if a `project_docs_convention.md` memory exists in your project's Claude memory directory (path shown in the auto-loaded `MEMORY.md` header), read it for a pre-digested convention summary plus any decision-pointer memories it references (e.g. `project_2br_decisions.md`). It is a cache, not the source of truth — steps 1–4 (the repo) always win on conflict.

Use this snapshot to pick the next ADR number, detect naming collisions, and answer "does this feature already have a tactical doc?" without asking the user. **The repo (`docs/adr/` + `docs/tactical/`) is the source of truth — never the memory cache.**

## Mode: `start`

### Phase 1 — Scope the feature (ask before scaffolding)

Ask the questions below as one batched prompt — short questions, one round-trip, not an interrogation. Skip any whose answer the description already gives, and don't add extras beyond these.

1. **ADR-worthiness** — Is there a durable architectural decision here, or is it pure UI/wiring? (No ADR for "rename the button to X." Yes ADR for "switch persistence layer from localStorage to IndexedDB.")
2. **Number of ADRs** — One concern per file. If the feature mixes a storage decision and a UI contract, that's two ADRs.
3. **Tactical doc?** — Does the implementation span >1 session, >1 package, or coordinate ≥3 sub-tasks across files? If yes, scaffold a tactical doc; if no, skip it.
4. **PLAN.md phase** — Which phase does this land under? (Default: the most recent active one.)

If the user says "you decide," apply these defaults:
- Spans `axoview-lib` + `axoview-app` → tactical doc.
- Touches a persistence/format/contract surface → at least one ADR.
- Single-file UI tweak → no ADR, no tactical, just do the work.

### Phase 1.5 — Ripple / consequences pass (mandatory before scaffolding)

A per-issue study is coherence-blind by construction. Before scaffolding, run an **experience-level** pass over the proposed changes together (workflow.md Principle 7). For each change, name and resolve:

- **Redundant** — what control / settings section / affordance does this make pointless? (Plan its removal — a dead toggle is debt.)
- **Contradicts** — does it collide with another proposed change or an existing affordance? (Reconcile; don't scaffold both sides of a contradiction.)
- **Orphaned** — does it leave related functionality drifting, or **lean on a surface that doesn't exist?** **Grep to confirm** every surface a plan references ("put it in the X menu / panel / dock") is real — if not, that's a build dependency to call out, not an assumption.

Reconcile against mirroring surfaces: selection two-way sync ([ux-principles §4.1 Two-way panel ↔ canvas sync](../../docs/guidelines/ux-principles.md#41-two-way-panel--canvas-sync)), [item-type parity §5](../../docs/guidelines/ux-principles.md#5-item-type-parity), the edit/view/present split ([§11 Whole-experience coherence](../../docs/guidelines/ux-principles.md#11-whole-experience-coherence)). Surface these findings to the user **unprompted** as part of the study — "if we do X, then Y no longer makes sense / Z has no home" is the expected move. A scaffolded plan that contains an internal contradiction or a phantom surface has failed this phase.

This is a bounded pass, not a study. Once every proposed change has a named disposition — reconciled, removal planned, or flagged as a build dependency — scaffold. Anything still open goes into the ADR as a `> TODO:` block rather than holding up the scaffold.

### Phase 2 — Scaffold ADR(s)

Pick the next sequential number (zero-padded to 4). Create `docs/adr/NNNN-kebab-title.md` using this template. All four `**Field:**` headers are mandatory — `lint:docs` fails the build on a missing or off-vocabulary `**Status:**`. `## Context`, `## Decision` and `## Consequences` are required sections; `## Acceptance criteria` is required whenever the decision is testable at all; `## Implementation notes` may be dropped when genuinely N/A.

```markdown
# ADR NNNN — Title Case Decision

**Status:** Proposed       <!-- Proposed | Accepted | Superseded | Superseded in part (<what> ) -->
**Date:** YYYY-MM-DD
**Supersedes:** none       <!-- or: ADR NNNN | ADR NNNN in part (<which decision/section>) -->
**Superseded by:** none    <!-- or: ADR MMMM | ADR MMMM in part (<which decision/section>) -->

## Context

<Why this decision is needed now. What's broken, missing, or about to change. Link concrete code paths, relative to `docs/adr/`: code is `../../packages/<pkg>/src/…`, sibling ADRs are `NNNN-title.md`, guidelines are `../guidelines/<file>.md`. No `#L<line>` anchors — cite a symbol name, which is grep-stable. `lint:docs` checks ADR-tier links against a shrink-only baseline, so a wrong path fails CI.>

## Decision

<The actual decision, stated declaratively. Include code blocks, JSON shapes, file layouts as needed (see ADR 0001's manifest example).>

## Consequences

**Positive:**
- ...

**Negative / risks:**
- ...

## Implementation notes (non-binding)

<Library choices, file locations, helpers. Marked non-binding so they can drift without invalidating the decision.>

## Acceptance criteria

- **Unit test:** ...
- **Manual verification:** ...
```

**Length.** The corpus runs 28–499 lines, median around 140. Treat ~180 as a soft ceiling and let short decisions stay short: Context and Decision carry the weight, Consequences are bullets rather than essays, and Implementation notes are a short list of pointers. A draft past ~200 lines usually means the ADR is carrying more than one concern — split it (see **One concern per ADR** in the Hard rules). Phase 0 re-reads every ADR's header on every `/feature` invocation, so length written here is charged forward to every later session.

The new ADR file in `docs/adr/` is the durable record. If the optional `project_docs_convention.md` memory exists, also refresh its **Existing ADRs** list (one new bullet, sorted by number; bump the date in its heading) — but never block on it; the repo is authoritative.

### Phase 3 — Scaffold tactical doc (if Phase 1 said yes)

Create `docs/tactical/<topic>.md` (kebab-case topic). Use the template below — it is self-contained and authoritative. Every new tactical's "Read first" block links [docs/workflow.md](../../docs/workflow.md) as a baseline.

```markdown
# Tactical — <Title>

> **Read first:**
> - [ADR NNNN — Title](../adr/NNNN-title.md)
> - <one bullet per related ADR>
>
> **Status:** Not started · **Owner:** <user> · **Last updated:** YYYY-MM-DD
>
> This is a **short-lived working doc.** Delete it after the work merges; ADRs are the durable record. PLAN.md gets a one-line entry referencing the ADRs once shipped — see "Wrap-up" below.

## Session startup checklist

1. Read this file fully.
2. Read each linked ADR.
3. Skim `PLAN.md` Phase Status Dashboard **for context only** — do not modify it during this work.
4. Mark `[x]` as work completes.
5. On completion, follow the "Wrap-up" section to update PLAN.md with a single line.

## Goal

<2-4 sentences. What changes for the user / system. What is explicitly *not* a goal.>

## Scope

### In scope
- ...

### Out of scope
- ...

## Locked decisions (from design discussion YYYY-MM-DD)

| # | Decision |
|---|---|
| 1 | ... |

## Sub-tasks

### A. <First logical group>
- [ ] ...

### B. <Second>
- [ ] ...

## Wrap-up

When all sub-tasks are complete and the smoke checklist passes:

1. Add a single line under `PLAN.md` Phase <X> section:
   ```
   - <Feature> shipped — see docs/adr/NNNN..NNNN and (this file's git history).
   ```
2. Delete this file. The ADRs are the durable record; this checklist's job is done.
3. Update any relevant memory pointer (optional — only if one exists) if decisions here supersede or extend it.

## Notes for Claude

- <Surface-specific traps. E.g. "this touches two packages, build after every section."> 
- <Anything load-bearing about ordering, coupling, or things-that-look-wrong-but-aren't.>
```

Keep the tactical scaffold under ~120 lines. It is a working checklist, not a spec — the reasoning lives in the ADR it links.

The new file in `docs/tactical/` is the record. If the optional `project_docs_convention.md` memory exists, add a matching `**Active tactical docs:**` bullet there too.

### Phase 4 — Hand off

Print a short summary listing exactly what was created/edited and what the user should do next (review the locked-decisions table, fill in sub-tasks, etc.). Do **not** start implementing the feature in the same turn.

## Mode: `extend`

When a small new constraint or follow-up belongs *inside* an existing ADR rather than as a new one (e.g. ADR 0003's `requiredPacks` addendum on 2026-05-02):

1. Read the target ADR fully.
2. Append a dated paragraph to the **Decision** section in this exact shape:
   ```
   **YYYY-MM-DD:** <new constraint, why it was needed, how it interacts with the original decision.>
   ```
3. If the addition introduces new acceptance criteria, append them to the bottom of the existing **Acceptance criteria** list (don't rewrite the originals).
4. Leave Status as `Accepted` — addendums don't supersede.
5. The ADR file is the record; do **not** touch the optional convention memory unless it exists *and* the addendum changes the ADR's one-line summary there.

## Mode: `supersede`

1. Read the old ADR.
2. Create a new ADR via the `start` template, with `**Supersedes:** ADR NNNN` filled in.
3. Edit the old ADR: `**Status:** Superseded` and `**Superseded by:** ADR MMMM`. Leave the rest of the body intact for historical record.
4. The ADR files carry the Supersedes/Superseded-by cross-links — that's the durable record. If the optional convention memory exists, update its ADR list too: the new ADR's bullet replaces the old one's purpose, but keep the old number listed (with `(superseded)` suffix) so cross-references in git history still resolve.

### Partial supersession — and the `none (…prose…)` trap

`npm run lint:docs` (`scripts/lint-docs.js`, gated in `.github/workflows/test.yml`) already enforces the mechanical half: the `Status` vocabulary, the `none (…)` trap below, reciprocal supersession edges, and ADR-tier link integrity. What it cannot judge is *which* sections survive a supersession — that, leaving a partially-superseded ADR's `Status` as `Accepted`, and keeping the parenthetical out of the supersession business are on you.

Most real supersessions here are **partial**: the new ADR takes over *one section* of the old one, which otherwise stands. Spell that in the **fields**, both directions, and **name the section** — "in part" alone makes the next reader diff two ADRs to find out which part:

- New ADR: `**Supersedes:** [ADR NNNN §4](…) (<the decision being retired>)`
- Old ADR: `**Superseded by:** [ADR MMMM](…) (§4 only — <what went>); §1–§3 stand` — and **leave its `Status` as `Accepted`**. Only flip `Status` to `Superseded` when the *whole* ADR is dead. (`Superseded in part` in the Status line is also legal, for when the retired part is the ADR's headline decision — ADR 0019 uses it.)

Naming the surviving sections ("§1–§3, §5, §7 stand") is the part people skip and the part that pays: it tells the next reader what they can still rely on without re-deriving it.

**Never write `**Supersedes:** none` and then describe a real relationship in the parenthetical.** A link written as prose after the word "none" is invisible to the reciprocal check, so the other side never gets updated — that is the mechanical cause of one-way supersession edges, and `lint:docs` fails the build on it.

A parenthetical is for **non-supersession context only** (*"amends ux-principles §5"*, *"interacts with ADR 0018"*, *"codifies existing patterns"*). If the word *supersedes* appears in your parenthetical, it belongs in the field. Both directions, every time.

Target shape for `Superseded by` — each successor, the section it took and what it took, then an explicit list of what stands:

```
**Superseded by:** [ADR NNNN](NNNN-title.md) (§6 only — <what went>) · [ADR MMMM](MMMM-title.md) (§4 only — <what went>); §1–§3, §5, §7 stand
```

[ADR 0036](../../docs/adr/0036-google-drive-storage-provider.md) is a worked example of it; its reciprocals ([0037](../../docs/adr/0037-storage-places-model.md), [0042](../../docs/adr/0042-drive-native-sharing-and-readonly-preview.md)) both point back.

## Mode: `wrap`

1. Read the tactical doc fully and confirm with the user that all sub-tasks are checked off.
2. Identify the relevant `PLAN.md` phase from the doc's "Wrap-up" section. Append the single-line entry under that phase — do not edit anything else in `PLAN.md`.
3. Delete the tactical doc file.
4. Refresh memory **(optional — skip silently if these memories don't exist on this machine):**
   - Remove the `**Active tactical docs:**` bullet for this topic from `project_docs_convention.md`.
   - If the doc had a paired decision-pointer memory (e.g. `project_2br_decisions.md`), check whether any of its content needs to be moved/superseded now that the tactical scaffolding is gone.
5. Print a one-line confirmation with the deleted path and the PLAN.md line that was added.

## Hard rules (every mode)

- **Never edit `PLAN.md` phase content** outside the `wrap` mode's one-line append. PLAN.md is a strategic dashboard, not a feature log.
- **Never edit a retired tactical doc without confirmation.** Check the file's wrap-up status first — deleted tacticals are retired, and a wrapped tactical's durable decisions have already moved into the ADRs, which are the record.
- **One concern per ADR.** If a feature naturally splits, scaffold two ADRs and link them mutually in the **Context** sections.
- **Date everything in absolute form** (`YYYY-MM-DD`), never "today" or "this week" — these docs outlive the conversation.
- **Don't invent decisions.** If the user hasn't decided on something the template asks for (e.g. backward-compat behavior), leave a `> TODO: <question>` block in the section instead of guessing.
- **Don't begin implementation** in the same turn as scaffolding. The point of the skill is to get the docs right *first* so implementation is grounded.
- **Trace the ripple (Phase 1.5 is not optional).** No ADR or tactical ships with an internal contradiction, a redundant-but-unremoved control, or a reference to a surface that doesn't exist. Grep before asserting a home for any command/affordance. Whole-experience coherence is the skill's job, not the user's review. See workflow.md Principle 7.
