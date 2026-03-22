# Future Features

Ideas and feature requests for future consideration. These are not scheduled for implementation — the primary purpose is to inform architectural decisions and avoid painting ourselves into corners.

## Feature entry structure

Each feature must have the following sections:

| Section | Contents |
|---|---|
| **Header** | ID (`FF-NNN`), title, Status, Priority, Area |
| **Summary** | One paragraph — what the feature is and why the current behaviour falls short |
| **Desired behaviour** | User-facing description of the new behaviour, broken into named sub-cases where applicable |
| **Inspiration** | Reference implementations, design patterns, or prior art that informed the request |
| **Architecture notes** | Current design constraints that affect the feature; viable approaches with trade-offs; impact on existing subsystems (stores, mode system, interaction manager, UI layer, etc.) |
| **Implementation notes** | Concrete code-level changes: which functions, hooks, types, and call sites need to change |
| **Regression risk** | Which existing tests encode behaviour that would change; which invariants must still hold after the change |

---

## FF-001 — Right-click pan: transient vs. sticky mode

**Status:** Implemented (2026-03-22)
**Priority:** Medium
**Area:** Interaction / Pan system

### Summary

Rework right-click pan to distinguish between *transient* pan (hold right-click while in another tool) and *sticky* pan (user has explicitly selected the Pan tool). Currently right-click always toggles pan mode as a persistent state change, which means releasing the mouse button does not automatically return the user to their previous tool.

### Desired behaviour

**Transient pan (right-click while in any non-Pan tool):**
- User is in any tool (Select, Connector, Lasso, etc.)
- User holds right-click and drags — canvas pans normally
- On right-click release, the tool reverts to whichever tool was active before the pan started (or falls back to Select if no prior tool is recorded)
- No mode indicator change visible to the user — the tool badge never switches away from the active tool during the transient pan

**Sticky pan (user explicitly selects the Pan tool from the toolbar):**
- User clicks the Pan tool button in the toolbar
- Right-click (or any configured pan trigger) pans the canvas
- Releasing the mouse does NOT revert the tool — the user stays in Pan mode
- The user must explicitly select a different tool to leave Pan mode

### Inspiration

Transport Tycoon Deluxe (and most isometric/strategy games): right-click scrolls the viewport while held; releasing immediately returns to the cursor/build tool. Selecting the dedicated scroll tool locks it on.

### Architecture notes

#### Current mode system design

The mode system is a flat discriminated union: `ModeState` is `{ type: 'CURSOR' | 'PAN' | 'LASSO' | 'CONNECTOR' | ... }`. There is no concept of mode *ownership* or *depth* — any call to `setMode()` unconditionally replaces the current mode with no memory of what came before.

This works fine for tool switching (explicit user intent) but breaks down for transient, modifier-key-style overrides like right-click-to-pan, where the intent is "temporarily borrow a capability then return to where I was". The flat union has no slot for "return address".

#### The missing primitive: previous-mode memory

The core architectural gap is that `uiStateStore` holds only `mode: ModeState` — a single present-tense value. There is no `previousMode` or mode stack. Without it, `usePanHandlers` cannot know what to restore on pan exit, so the current implementation side-steps this by making right-click pan a toggle (stays in PAN until another explicit action).

Two viable approaches:

**Option A — Extend `PAN` mode with a `previousMode` field (narrow change)**
```
type PanMode = {
  type: 'PAN';
  sticky: boolean;
  previousMode?: Exclude<ModeState, PanMode>;
}
```
- `sticky: true` when entered via toolbar; `sticky: false` + `previousMode` captured when entered via right-click shortcut
- On right-click release, `usePanHandlers.handleMouseUp` checks `sticky`; if false, calls `setMode(previousMode ?? CURSOR_MODE)`
- Contained change: only `PAN` mode gains new fields; the rest of the union is untouched
- Risk: `previousMode` can only be one level deep — a user right-clicking while already in a transient state would lose the original mode (acceptable for v1)

**Option B — Introduce a shallow mode stack in `uiStateStore` (broader change)**
```
modeStack: ModeState[]   // top of stack = active mode
```
- `pushMode(mode)` for transient overrides; `popMode()` on release
- `setMode(mode)` replaces the entire stack (for intentional tool switches)
- Cleaner semantics, naturally supports future nested transient overrides (e.g. right-click pan while drawing a connector)
- Higher cost: all `setMode` call sites become `setMode` vs `pushMode` decisions; the interaction manager and all mode handlers need to be aware of the distinction

Option A is the lower-risk path and sufficient for this feature alone. Option B becomes worthwhile if a second transient-override use case emerges (e.g. space-bar-to-pan, common in design tools).

#### Interaction manager bypass path

`usePanHandlers.handleMouseDown` is the *bypass path* — when it returns `true`, `processMouseUpdate` is skipped entirely. This is the right place to capture `previousMode` at pan start: the `uiState` is read inside `handleMouseDown` at the moment of the right-click, so the mode value is guaranteed to be the correct pre-pan value.

The symmetrical exit path is `handleMouseUp`. Currently, right-click release does not call `endPan()` (the toggle design). With this feature it would: `if (!sticky) { endPan(); setMode(previousMode) }`. The bypass return value on `handleMouseUp` should remain `true` for the transient exit so `processMouseUpdate` is not invoked on the release event.

#### UI layer considerations

The toolbar Pan tool button needs to distinguish between "entering sticky pan" and "entering transient pan". Currently it calls `setMode({ type: 'PAN' })` directly. With this change it would call `startPan('toolbar')` (or equivalent), which sets `sticky: true` and does NOT capture a `previousMode`. This keeps the toolbar button as the single authoritative entry point for sticky pan, rather than embedding the sticky/transient logic in the toolbar component itself.

The tool-badge visual (the active tool indicator in the toolbar) should remain on the *previous* tool during transient pan — the user never "left" their tool, they temporarily borrowed the pan. This means the toolbar's active-tool selector should read `mode.previousMode?.type ?? mode.type` when `mode.type === 'PAN' && !mode.sticky`, rather than `mode.type` directly.

### Implementation notes

- `usePanHandlers.startPan()` would need to accept entry context: `{ sticky: boolean, previousMode?: ModeState }`
- `usePanHandlers.handleMouseUp()` on right-button release: if `!sticky`, call `endPan()` and restore `previousMode` via `setMode`
- `isPanningRef` logic remains unchanged — it still gates the `endPan` path
- The `mousedownHandled` flag on `CursorMode` (added 2026-03-20 to prevent spurious context-menu) must be reviewed — transient pan exit must not re-trigger the context menu on the release event
- `PAN` mode type gains optional `sticky: boolean` and `previousMode?: ModeState` fields (Option A path)

### Regression risk

- `usePanHandlers.test.ts` — the "right-click pan is a toggle" test (`handleMouseUp` on right button stays in pan) directly encodes the current behaviour and must be updated to reflect the new transient exit
- `Cursor.modes.test.ts` — context-menu gate tests must still pass after the mode-restore path is added; the `mousedownHandled` flag must survive the `setMode(previousMode)` call
- Right-click → pan → release must not open the right-click context menu (removed 2026-03-20 to prevent exactly this)
- Any test that asserts `mode.type === 'PAN'` without checking `sticky` may need a fixture update
