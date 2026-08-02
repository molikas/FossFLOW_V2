# Wave-5 design brief — HIST-10: page-stamped history entries

**Status:** SIGNED OFF 2026-08-02 — entry shape (§3) and sequencing (§6) approved
as drafted; all four §5 questions answered as recommended, see "Owner sign-off"
at the end of this file.

**Ruling being served (DECISIONS.md, 2026-07-30):** *always navigate* — each
history entry is stamped with the active page; undo/redo switches to that page
when it targets a non-active one. Rationale on file: undo must make its effect
visible (PowerPoint selects the restored slide; Figma navigates on undo).

---

## 1. Why this is design-gated and not a two-line fix

The obvious implementation — "in `undo()`, after stepping the stacks, call
`setView(entry.viewId)`" — needs a `viewId` that does not exist on an entry
today:

```ts
// modelStore.tsx:17 and sceneStore.tsx:16 — the SAME shape, declared twice
type HistoryEntry = { patches: Patch[]; inversePatches: Patch[]; seq: number };
```

Adding a field to it touches:

- **both stores' `set()`**, which construct entries at two sites each (the
  standalone-action branch that allocates its own `seq`, and the coordinated
  branch that inherits the coordinator's);
- **both stores' trim**, which is independent and already produces HIST-03's
  asymmetry;
- **`useHistory.undo`/`redo`**, which pair the two stacks by `max(seq)`/`min(seq)`
  and step whichever halves match — so the navigation decision has to be made
  *once* for a logical action, not once per store;
- **`resyncScene`**, which runs after a step and writes `SYNC_SCENE` with
  `skipHistory`.

And it interacts with two held bugs, which is the real reason wave 1 deferred it.

## 2. The interaction with HIST-03 and HIST-04

Both were explicitly held for this wave "because they need the same restructure".

**HIST-04 — creating a page is not undoable.** `createView` never calls
`saveToHistoryBeforeChange()` and writes both stores with `skipHistory=true`, so
no entry exists. The recorded fix direction is to add the call, matching
`deleteView`. **But doing that alone makes things worse**, and that is why it is
held: because every entry's inverse patch replaces the whole `views` array, an
undo that removes the just-created page leaves `uiState.view` pointing at a
deleted id — a dangling active view that every reader papers over by falling back
to `views[0]`. That is E3/SCN-09's shape. Page-stamping is what makes the fix
safe: the entry knows which page was active *before* the create, so the undo has
somewhere correct to navigate.

→ **Ordering: HIST-10's entry shape lands first, then HIST-04 rides it.**

**HIST-03 — asymmetric 50-entry trimming.** The two stacks trim independently,
so the model half of a shared `seq` can be evicted while the scene half survives;
the next Ctrl+Z steps the scene alone. A page stamp does not fix that, but it
**changes the failure**: today a half-stepped action produces silent state
divergence; with navigation it also *moves the user to a page* on the strength of
half an action. Worth deciding explicitly (§5, Q3) rather than discovering.

## 3. Proposed entry shape

```ts
type HistoryEntry = {
  patches: Patch[];
  inversePatches: Patch[];
  seq: number;
  /**
   * The page that was active when this entry's action was performed — the page
   * on which its effect is visible. `undo`/`redo` navigates here when it is not
   * the active page, so the effect of a step is never off-screen.
   *
   * Undefined for entries recorded before this field existed and for actions
   * with no page context (title, description, colours, icons — the model-level
   * document fields). Undefined means "do not navigate", never "navigate to
   * views[0]".
   */
  viewId?: string;
};
```

Three properties of that declaration are the actual design content:

1. **Optional, and `undefined` means "stay put".** A required field would force
   every document-level action (rename the diagram, edit the palette) to invent a
   page, and would make an in-flight history stack from a previous session
   un-steppable. "Do not navigate" is the safe reading; "navigate to `views[0]`"
   is the reading that would produce a jump on a title edit.
2. **It is the page active at RECORD time, not the page the patch touches.** A
   patch can touch several pages (a cross-page paste) or none (a colour change).
   The question the ruling answers is *"where was the user when they did this"*,
   because that is where the effect will be visible when it is reverted. This is
   also what covers the ruling's second case — "the invisible cross-page content
   undo" — without any patch analysis.
3. **It is stamped per store, but consumed per logical action.** Both stores
   record it (they construct entries independently), and `useHistory` reads it
   from whichever half it stepped, preferring the model half when both stepped.
   They agree by construction because both are stamped from the same
   `uiState.view` at the same moment; a mismatch is a bug and is worth an
   assertion in the promoted test.

## 4. Where the navigation happens

In `useHistory.undo`/`redo`, **after** the stacks step and **before**
`resyncScene()`:

```
1. compute target seq (unchanged: max for undo, min for redo)
2. step the matching halves (unchanged)
3. if performed:
     targetView = (model half's entry ?? scene half's entry).viewId
     if (targetView && targetView !== uiState.view && model.views has it)
        setView(targetView)
4. resyncScene()
```

`resyncScene()` last matters: it re-routes connectors whose path is empty and is
already the step's settle point. Navigating first means the newly-active page's
connectors are resynced in the same pass rather than on a later `changeView`.

The `model.views has it` guard is not defensive padding — it is the HIST-04 case:
a redo that re-creates a page and a stamp naming a page an undo has since removed
are both reachable, and navigating to a missing id is exactly the dangling
`uiState.view` this brief is trying to stop producing.

**`setView` must not itself record history.** It is a ui-state change and
ui-state has no stack, so this is true today — but it is worth a test, because
the failure mode (undo pushes a new entry) is a loop.

## 5. Open questions for the owner

1. **Does navigation count as part of the undone action for a SECOND undo?**
   Press Ctrl+Z twice quickly: the first navigates to page 2 and reverts, the
   second reverts an action recorded on page 1 and navigates back. That is the
   consistent reading and I would implement it, but it means rapid undo can move
   the viewport repeatedly. PowerPoint behaves this way; worth confirming.
2. **Redo symmetry.** The ruling says "undo/redo". A redo's stamp is the page the
   action was originally performed on, which is right — confirming there is no
   separate "page I was on when I pressed undo" to return to.
3. **HIST-03 half-stepped actions:** navigate on a half-stepped action, or
   suppress navigation when only one stack stepped for a `seq` that should have
   had two halves? Suppressing is more conservative but hides the divergence;
   navigating surfaces it. My inclination is to navigate and let HIST-03's own
   fix remove the case, but this is a product call about a bug that is still open.
4. **Scope of "page context".** Are layer operations page-scoped for stamping
   purposes? They are stored per view, so yes by construction — confirming there
   is no intent to treat them as document-level.

## 6. Suggested sequencing for the implementation PR(s)

1. Entry shape + stamping in both stores, no consumer. Pure addition; existing
   tests must stay green untouched.
2. `useHistory` navigation + the `views has it` guard. Promoted regression: the
   `hist-09-10.explore.spec.ts` probe (delete the active page → Ctrl+Z → the
   canvas shows the restored page, not just the tab).
3. **HIST-04** rides it: `saveToHistoryBeforeChange()` in `createView`, now safe
   because the entry knows where to go back to. Its probe
   (`hist-01-04.explore.test.tsx`) flips.
4. HIST-03 separately — it is a trimming bug, not a navigation one, and pairing
   them would make either failure hard to attribute.

Steps 1–3 are one reviewable change; step 4 should not be in it.

---

## Owner sign-off (2026-08-02)

Entry shape approved on all three §3 properties (optional record-time `viewId`,
`undefined` = stay put; per-store stamp / per-action consume with the agreement
assertion). §5 answers:

1. **Yes — each undo step navigates**, including rapid sequences that move the
   viewport back and forth (PowerPoint behaviour; the consistent reading).
2. **Confirmed** — a redo stamps the page the action was originally performed
   on; there is no separate "page I pressed undo from".
3. **Navigate on a half-stepped action** — fail-visible beats fail-silent;
   HIST-03's own fix retires the case. Do not suppress.
4. **Confirmed** — layer operations are page-scoped by construction.

§6 sequencing approved: steps 1–3 one PR (HIST-04 rides it), HIST-03 strictly
separate.
