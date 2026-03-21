# Regression Test Suite Reference

**Last updated:** 2026-03-20
**Total:** 465 tests · 51 suites · all passing
**Run:** `npm test --workspace=packages/fossflow-lib`

---

## Quick Reference

| Layer | Suites | Tests |
|---|---|---|
| Interaction / Mode System | 5 | 74 |
| Scene / Hooks | 5 | 56 |
| Reducers | 6 | 85 |
| Schemas / Validation | 8 | 38 |
| Components | 11 | 48 |
| Perf / Render Isolation | 8 | 36 |
| Utilities & Config | 8 | 64 |
| Stores & Infrastructure | 3 | 15 |
| **Standalone app config** | **1** | **3** |
| **Total** | **51** | **465** |

---

## Classifications

| Symbol | Meaning |
|---|---|
| ✅ VALID | Tests the real production module directly |
| ⚠️ SEMI-VALID | Tests a manually-maintained local copy of a production constant; contract is tested but divergence is possible |

---

## Layer 1 — Interaction / Mode System

These tests cover the mode state machine, mouse event routing, and keyboard dispatch. They use real module imports with minimal mocking (`src/utils` only).

### [Cursor.modes.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/Cursor.modes.test.ts) · 16 tests · ✅ VALID

**Production target:** `src/interaction/modes/Cursor.ts`

| Group | What's covered |
|---|---|
| `Cursor.mousedown` (4) | isRendererInteraction guard; item-at-tile sets mousedownItem + mousedownHandled; empty canvas clears itemControls |
| `Cursor.mouseup` (7) | mousedownHandled gate — context menu only opens when flag is true; external setMode doesn't open menu; mousedownItem reset after mouseup; item select sets itemControls |
| `Cursor.mousemove` (5) | tile-move with mousedown item → DRAG_ITEMS; tile-move on empty → LASSO; no move → no transition |

**Why this exists:** The `mousedownHandled` flag was introduced to prevent spurious context-menu openings after external `setMode()` calls (e.g. exiting Connector mode). Without this test, any refactor that touches `Cursor.mouseup` risks re-introducing that regression.

---

### [Lasso.modes.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/Lasso.modes.test.ts) · 15 tests · ✅ VALID

**Production target:** `src/interaction/modes/Lasso.ts`

| Group | What's covered |
|---|---|
| `Lasso.mousedown` (5) | isRendererInteraction=false → no-op; canvas click with no selection → CURSOR; click within selection bounds → isDragging=true; click outside selection → CURSOR |
| `Lasso.mouseup` (5) | mouse.mousedown=null (toolbar click) → no-op; mousedown set, no selection → CURSOR; mousedown set, selection with items → stays LASSO, isDragging reset |
| `Lasso.mousemove` (5) | isDragging path; selection bounds update; hasMovedTile gate |

**Why this exists:** Lasso was the last mode to gain the `isRendererInteraction` guard. Before the fix, a ToolMenu click while in LASSO mode propagated to the window listener, triggered `Lasso.mousedown`, and caused a spurious mode switch.

---

### [toolMenu.propagation.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/toolMenu.propagation.test.tsx) · 8 tests · ✅ VALID

**Production targets:** `src/interaction/modes/Lasso.ts`, ToolMenu `onMouseDown` wrapper in `UiOverlay.tsx`

| Group | What's covered |
|---|---|
| Fix A — stopPropagation (2) | mousedown inside ToolMenu Box does NOT reach window; mousedown outside does reach window |
| Fix B — isRendererInteraction guard (3) | Real Lasso.mousedown with isRendererInteraction=false; =true with no selection; non-LASSO mode is no-op |
| Fix C — mouse.mousedown guard (3) | Real Lasso.mouseup with null mousedown; set mousedown no selection → CURSOR; set mousedown with selection → stays LASSO |

**Why this exists:** Pinned as three distinct A/B/C fixes for the toolbar-click-to-context-menu bug (2026-03-20). Each fix can be independently regressed.

---

### [keyboard.dispatch.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/keyboard.dispatch.test.tsx) · 25 tests · ✅ VALID

**Production targets:** `src/interaction/useInteractionManager.ts`, `src/interaction/usePanHandlers.ts`

Covers: keyboard shortcut dispatch, pan key combos, Delete key, Escape key, mode-specific key guards, `INTERACTIONS_DISABLED` early-return, event listener registration/cleanup.

---

### [interactionManager.depStability.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/interactionManager.depStability.test.tsx) · 2 tests · ✅ VALID

**Production target:** `src/interaction/useInteractionManager.ts`

Pins that `useCallback`/`useMemo` dependency arrays in `useInteractionManager` do not reference unstable values (guards the M-1 render hotspot fix).

---

## Layer 2 — Scene / Hooks

These tests cover the public API of `useScene`, view operations, clipboard history, and the initialization sequence.

### [useScene.listShape.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/useScene.listShape.test.tsx) · 17 tests · ✅ VALID

**Production target:** `src/hooks/useScene.ts`

Covers: `currentView` shape contract (items, connectors, rectangles, textBoxes arrays); `allViews` list; `DEFAULTS` merging; empty-view edge cases.

---

### [useScene.referenceStability.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/useScene.referenceStability.test.tsx) · 7 tests · ✅ VALID

**Production target:** `src/hooks/useScene.ts`

Covers: `currentView` reference stability — object identity must not change when unrelated store data changes; guards the C-2 render hotspot where every store write caused a full scene re-render.

---

### [viewOps.integration.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/viewOps.integration.test.tsx) · 16 tests · ✅ VALID

**Production target:** `src/stores/reducers/view.ts`

Covers: `createView`, `updateView`, `deleteView`, `setActiveView` full lifecycle including edge cases (delete active view, rename to same name, delete only view).

---

### [useHistory.test.tsx](packages/fossflow-lib/src/hooks/__tests__/useHistory.test.tsx) · 16 tests · ✅ VALID

**Production target:** `src/hooks/useHistory.ts`

Covers: `saveToHistory`/`undo`/`redo` round-trip; `canUndo`/`canRedo` flags; history overflow at 50 entries (oldest dropped); `transaction()` creates exactly one checkpoint; nested transaction guard.

---

### [useInitialDataManager.test.tsx](packages/fossflow-lib/src/hooks/__tests__/useInitialDataManager.test.tsx) · 8 tests · ✅ VALID

**Production target:** `src/hooks/useInitialDataManager.ts`

Covers: orphaned connector filtering on load (connectors referencing non-existent items are removed); `isReady` flag lifecycle; initial data merging with defaults.

---

## Layer 3 — Reducers

All reducer tests use real Immer-based functions with no mocking of the reducer logic itself. They verify immutability (input state unchanged), return-value correctness, and cascade behavior.

### [connector.test.ts](packages/fossflow-lib/src/stores/reducers/__tests__/connector.test.ts) · 21 tests · ✅ VALID

**Production target:** `src/stores/reducers/connector.ts`

Covers: `createConnector`, `updateConnector`, `deleteConnector`, `syncConnector` (including error path — empty path on `getConnectorPath` throw, connector NOT deleted). All use the correct `ConnectorAnchor[]` array schema.

> **Note:** This suite was rewritten from scratch (2026-03-20) after the original had stale `{ from, to }` anchor format that never matched the real `anchorSchema`.

---

### [modelItem.test.ts](packages/fossflow-lib/src/stores/reducers/__tests__/modelItem.test.ts) · 8 tests · ✅ VALID

**Production target:** `src/stores/reducers/modelItem.ts`

| Group | What's covered |
|---|---|
| Core CRUD (3) | create, update, delete basic correctness |
| Double-write regression (3) | Item appears exactly once; stored value equals input; input state not mutated |
| Sparse array pin (2) | Deleted item not findable; `array.length` unchanged after `delete` — documents the §10 known sparse-array behavior so a future `splice` fix changes this assertion intentionally |

---

### [viewItem.test.ts](packages/fossflow-lib/src/stores/reducers/__tests__/viewItem.test.ts) · 21 tests · ✅ VALID

**Production target:** `src/stores/reducers/viewItem.ts`

Covers: `createViewItem`, `updateViewItem`, `deleteViewItem` with connector cascade (item referenced by connector at both anchors → connector deleted once); batch-delete cascade; not-found throws.

---

### [view.test.ts](packages/fossflow-lib/src/stores/reducers/__tests__/view.test.ts) · 13 tests · ✅ VALID

**Production target:** `src/stores/reducers/view.ts`

Covers: view CRUD, action dispatcher, rename idempotency, delete-with-items cascade.

---

### [rectangle.test.ts](packages/fossflow-lib/src/stores/reducers/__tests__/rectangle.test.ts) · 20 tests · ✅ VALID

**Production target:** `src/stores/reducers/rectangle.ts`

Covers: CRUD, sync with scene store, immutability, not-found throws.

---

### [textBox.test.ts](packages/fossflow-lib/src/stores/reducers/__tests__/textBox.test.ts) · 23 tests · ✅ VALID

**Production target:** `src/stores/reducers/textBox.ts`

Covers: CRUD with scene sync contract, content update, immutability.

---

## Layer 4 — Schemas / Validation

All schema tests use Zod's `.parse()` / `.safeParse()` directly. They act as living documentation of the data model contracts.

| File | Production target | Tests | What's pinned |
|---|---|---|---|
| [colors.test.ts](packages/fossflow-lib/src/schemas/__tests__/colors.test.ts) | `schemas/colors.ts` | 4 | colorSchema fields, colorsSchema array |
| [connector.test.ts](packages/fossflow-lib/src/schemas/__tests__/connector.test.ts) | `schemas/connector.ts` | 4 | anchorSchema (exactly one ref key), connectorSchema minimum 2 anchors |
| [icons.test.ts](packages/fossflow-lib/src/schemas/__tests__/icons.test.ts) | `schemas/icons.ts` | 4 | iconSchema, iconsSchema |
| [modelItems.test.ts](packages/fossflow-lib/src/schemas/__tests__/modelItems.test.ts) | `schemas/modelItems.ts` | 10 | modelItemSchema including `headerLink` optional URL field |
| [rectangle.test.ts](packages/fossflow-lib/src/schemas/__tests__/rectangle.test.ts) | `schemas/rectangle.ts` | 2 | rectangleSchema required fields |
| [textBox.test.ts](packages/fossflow-lib/src/schemas/__tests__/textBox.test.ts) | `schemas/textBox.ts` | 2 | textBoxSchema required fields |
| [validation.test.ts](packages/fossflow-lib/src/schemas/__tests__/validation.test.ts) | `schemas/validation.ts` | 10 | Full model validation, Zod coercion, invalid model rejection |
| [views.test.ts](packages/fossflow-lib/src/schemas/__tests__/views.test.ts) | `schemas/views.ts` | 6 | viewItemSchema, viewSchema, viewsSchema |

**Total: 42 tests**

---

## Layer 5 — Components

### [uiOverlay.editorModes.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/uiOverlay.editorModes.test.ts) · 19 tests · ⚠️ SEMI-VALID

**Production target:** `src/components/UiOverlay/UiOverlay.tsx` (`EDITOR_MODE_MAPPING`)

Covers: tool visibility per editor mode (EDITABLE, EXPLORABLE_READONLY, NON_INTERACTIVE); VIEW_TITLE/VIEW_TABS mutual exclusion; ITEM_CONTROLS only in EDITABLE; ZOOM_CONTROLS in every non-empty mode.

> **Limitation:** `EDITOR_MODE_MAPPING` is a private module-level constant in `UiOverlay.tsx`. The full component cannot be imported in Jest without pulling in MUI's `createTheme` at module load time (incompatible with jsdom). The local constant in this test was **manually verified** against production on 2026-03-20.
> **To make VALID:** Extract `EDITOR_MODE_MAPPING` to `src/config/editorModeMapping.ts` with no MUI/React dependencies.

---

### [RichTextEditor.formats.test.ts](packages/fossflow-lib/src/components/RichTextEditor/__tests__/RichTextEditor.formats.test.ts) · 4 tests · ✅ VALID

**Production target:** `src/components/RichTextEditor/RichTextEditor.tsx` (`formats` export)

Covers: `'bullet'` absent (Quill unregistered alias); `'list'` present; all 9 expected formats present; count pin.

---

### [ColorSelector.test.tsx](packages/fossflow-lib/src/components/ColorSelector/__tests__/ColorSelector.test.tsx) · 14 tests · ✅ VALID
### [CustomColorInput.test.tsx](packages/fossflow-lib/src/components/ColorSelector/__tests__/CustomColorInput.test.tsx) · 11 tests · ✅ VALID

**Production targets:** `ColorSelector`, `CustomColorInput`

Covers: color picker render, hex input validation, EyeDropper API integration, onChange callbacks, cancel handling.

---

### Smaller component suites

| File | Production target | Tests |
|---|---|---|
| [DebugUtils.test.tsx](packages/fossflow-lib/src/components/DebugUtils/__tests__/DebugUtils.test.tsx) | `DebugUtils` | 2 |
| [LineItem.test.tsx](packages/fossflow-lib/src/components/DebugUtils/__tests__/LineItem.test.tsx) | `LineItem` | 2 |
| [SizeIndicator.test.tsx](packages/fossflow-lib/src/components/DebugUtils/__tests__/SizeIndicator.test.tsx) | `SizeIndicator` | 2 |
| [Value.test.tsx](packages/fossflow-lib/src/components/DebugUtils/__tests__/Value.test.tsx) | `Value` | 2 |
| [Icon.test.tsx](packages/fossflow-lib/src/components/ItemControls/IconSelectionControls/__tests__/Icon.test.tsx) | `IconSelectionControls/Icon` | 2 |
| [Label.test.tsx](packages/fossflow-lib/src/components/Label/__tests__/Label.test.tsx) | `Label` | 4 |

---

## Layer 6 — Perf / Render Isolation

These tests pin the fixes from the performance refactoring session. They primarily use source-code analysis (regex on file contents) to enforce structural contracts that can't be expressed as runtime behavior tests.

| File | Production target | Tests | What's pinned |
|---|---|---|---|
| [connector.renderIsolation.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/connector.renderIsolation.test.tsx) | `Connectors.tsx`, `Connector.tsx` | 5 | N-2/N-3: `Connector` is `React.memo`; `Connectors` passes stable selector |
| [expandableLabel.selectorConsolidation.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/expandableLabel.selectorConsolidation.test.tsx) | `ExpandableLabel.tsx` | 3 | N-4: single `useUiStateStore` call (was two — caused double re-render) |
| [exportImageDialog.memo.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/exportImageDialog.memo.test.ts) | `ExportImageDialog.tsx` | 2 | H-3: component is wrapped in `React.memo` |
| [grid.backgroundFormula.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/grid.backgroundFormula.test.ts) | `Grid.tsx` | 14 | C-1: CSS background-size formula, tile size, zoom scaling |
| [gsap.dependency.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/gsap.dependency.test.ts) | `package.json`, source files | 2 | N-5: GSAP removed from dependencies; no remaining imports |
| [rendererSize.sharedObserver.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/rendererSize.sharedObserver.test.tsx) | `uiStateStore.tsx` | 4 | N-1: single ResizeObserver writes `rendererSize`; all other components read from store |
| [useRAFThrottle.cleanup.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/useRAFThrottle.cleanup.test.ts) | `src/interaction/useRAFThrottle.ts` | 8 | M-2: RAF handle cancelled on unmount; no stale callbacks; throttle contract |
| [useResizeObserver.lifecycle.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/useResizeObserver.lifecycle.test.ts) | `src/hooks/useResizeObserver.ts` | 10 | H-2: observer registered on mount, disconnected on unmount, reconnected on ref change |

---

## Layer 7 — Utilities & Config

### [svgOptimizer.test.ts](packages/fossflow-lib/src/utils/svgOptimizer.test.ts) · 30 tests · ✅ VALID

**Production target:** `src/utils/svgOptimizer.ts`

Covers all three SVG export optimization phases:
- Phase 1 — `stripIrrelevantProperties`: removes vendor prefixes, animation, transition, scroll, print props; preserves layout props
- Phase 2 — `roundNumbers` / `roundStyleDeclarations`: 2 decimal place rounding, skips width/height/font-size
- Phase 3 — `pruneHiddenElements`: removes `display:none` subtrees before serialization

---

### [keyboard.dispatch.test.tsx](packages/fossflow-lib/src/__perf_refactor_regression__/keyboard.dispatch.test.tsx) · 25 tests · ✅ VALID

(See Layer 1 — listed here also as it covers utility-level keyboard routing.)

---

### [shortcuts.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/shortcuts.test.ts) · 7 tests · ✅ VALID

**Production target:** `src/config/shortcuts.ts`

Pins all `FIXED_SHORTCUTS` constant values (Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+Y, Delete, Escape). Any accidental rename or value change is immediately caught.

---

### [settings.defaults.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/settings.defaults.test.ts) · 14 tests · ✅ VALID

**Production targets:** `src/config/hotkeys.ts`, `src/config/panSettings.ts`, `src/config/zoomSettings.ts`

Pins: `DEFAULT_HOTKEY_PROFILE = 'smnrct'`; all pan toggle defaults (middleClick, rightClick, ctrlClick, altClick, emptyAreaClick); zoom min/max/step defaults; keyboard pan speed.

---

### [i18n.config.test.ts](packages/fossflow-lib/src/__perf_refactor_regression__/i18n.config.test.ts) · 3 tests · ✅ VALID

**Production target:** `packages/fossflow-app/src/i18n.ts`

Pins `load: 'currentOnly'` (prevents short-code `en` 404) and `fallbackLng: 'en-US'`.

---

### Utility unit suites

| File | Production target | Tests | What's covered |
|---|---|---|---|
| [renderer.test.ts](packages/fossflow-lib/src/utils/__tests__/renderer.test.ts) | `utils/renderer.ts` | 9 | Grid subset, bounds checking, screen-to-isometric coordinate conversion |
| [common.test.ts](packages/fossflow-lib/src/utils/__tests__/common.test.ts) | `utils/common.ts` | 1 | `clamp()` function |
| [immer.test.ts](packages/fossflow-lib/src/utils/__tests__/immer.test.ts) | Immer (third-party) | 2 | Array reference stability with Immer drafts |

---

## Layer 8 — Stores & Infrastructure

### [zustand.deprecation.test.ts](packages/fossflow-lib/src/stores/__tests__/zustand.deprecation.test.ts) · 4 tests · ✅ VALID

**Production targets:** `stores/uiStateStore.tsx`, `stores/modelStore.tsx`, `stores/sceneStore.tsx`

Covers: no `[DEPRECATED]` console.warn fired when loading any of the 3 stores; source-file assertion that `useStoreWithEqualityFn` is used (not the deprecated `useStore`).

---

### [clipboard.test.ts](packages/fossflow-lib/src/clipboard/__tests__/clipboard.test.ts) · 7 tests · ✅ VALID

**Production target:** `src/clipboard/clipboard.ts`

Covers: `setClipboard` / `getClipboard` round-trip; null/undefined handling; clipboard payload shape contract.

---

## Known Coverage Gaps

The following critical paths have **no regression tests** yet. See `current_architecture.md §4` for full detail.

### High priority (complex operations, highest regression risk)

| Gap | Why it matters |
|---|---|
| `useCopyPaste.handlePaste` | Most complex operation — ID remapping, anchor detachment, centroid, collision avoidance. No test at all. |
| `useCopyPaste.handleCopy` | Centroid calculation, LASSO vs itemControls selection paths. |
| `useScene.deleteSelectedItems` | Cascade across mixed item types in one transaction. |
| `useScene.pasteItems` | Requires all 3 Providers + real model data; transaction atomicity. |
| `useHistory` undo/redo with real stores | Current history tests use mocked stores; real-data round-trip untested. |
| History overflow at 50 entries | 51st `saveToHistory` should drop oldest — not tested. |
| `transaction()` single-checkpoint guarantee | That N operations inside `transaction()` produce exactly 1 undo step. |

### Medium priority

| Gap | Why it matters |
|---|---|
| `usePanHandlers.handleMouseDown` | Pan bypass path (returns early from `processMouseUpdate`) — all 6 pan-trigger conditions untested |
| `CURSOR → DRAG_ITEMS` transition | mousemove while mousedown on item — real-module test missing |
| `CURSOR → LASSO` transition | mousemove while mousedown on empty canvas — real-module test missing |
| `anchorSchema` multi-key guard | Schema rejects anchor with both `item` and `tile` set — untested |
| Zoom boundary enforcement | `MIN_ZOOM = 0.1`, `MAX_ZOOM = 1` respected by `incrementZoom`/`decrementZoom` — untested |

---

## How to Run

```bash
# All tests
npm test --workspace=packages/fossflow-lib

# Specific suite
npx jest <pattern> --no-coverage          # e.g. Cursor.modes
npx jest __perf_refactor_regression__ --no-coverage   # regression suite only
npx jest stores/reducers --no-coverage    # reducer layer only

# With coverage
npx jest --coverage
```

Run from `packages/fossflow-lib/`.
