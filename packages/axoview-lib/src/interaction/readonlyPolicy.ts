import type { EditorModeEnum } from 'src/types/common';

// ─── Read-only enforcement policy (exploratory campaign wave 2) ──────────────
//
// `EXPLORABLE_READONLY` is the mode the `/display/<diagramId>` viewer route runs
// in. Before this module it was enforced *per surface, by memory*: the pointer
// effect returned early on `INTERACTIONS_DISABLED` (which EXPLORABLE_READONLY
// does not map to — its starting mode is PAN), `handleFunctionKeys` checked
// `editorMode` for F2, and `RightSidebar` passed `readOnly` to exactly one of
// its six panel branches. Everything else was live: tool hotkeys armed drawing
// tools, Delete destroyed items, Ctrl+X/V mutated the model, the z-order and
// arrow-nudge shortcuts wrote, and four of the five element panels rendered
// their full editing surface (I1/PTR-01..03, F2/VIEW-11).
//
// The cure is opt-IN rather than opt-out: every canvas surface that a viewer can
// reach is listed below with an explicit access class, and the dispatchers ask
// this module instead of testing `editorMode` themselves. A surface that is not
// in the table has no access class, so the class gate
// (`__tests__/readonlySurfaces.contract.test.ts`) fails until someone decides
// what it is — a new keyboard shortcut or element panel cannot inherit "live in
// read-only" by omission the way this whole class did.
//
// See ADR 0047 §3 (class gates) and docs/tactical/exploratory-remediation.md.

export type EditorMode = keyof typeof EditorModeEnum;

/**
 * What a surface is allowed to do under a non-EDITABLE `editorMode`.
 *
 *  - `viewer` — read-only by construction: it cannot change the model and
 *    cannot arm a mode that can. A viewer keeps it.
 *  - `editor` — it writes the model, or it arms an interaction mode that
 *    writes the model. Refused unless `editorMode === 'EDITABLE'`.
 *
 * The distinction is about REACHABLE effect, not intent: `selectAll` does not
 * itself write anything, but it switches the canvas into CURSOR — a live
 * editing mode whose drag moves items — so it is an `editor` surface.
 */
export type SurfaceAccess = 'viewer' | 'editor';

/**
 * Every delegate the canvas keydown dispatcher
 * (`useInteractionManager`'s `handleKeyDown`) can reach. The gate cross-checks
 * this table against the dispatcher's source, so adding a delegate there
 * without adding it here is a red test.
 */
export const CANVAS_KEYBOARD_SURFACES = {
  /** Esc: aborts an in-flight gesture, closes the panel, clears the selection. */
  escape: 'viewer',
  /** Delete / Backspace: removes the lasso selection, multi-selection or panel target. */
  delete: 'editor',
  /** Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z: replays model patches in both directions. */
  history: 'editor',
  /** Ctrl+C: reads the selection into the clipboard. */
  copy: 'viewer',
  /** Ctrl+X / Ctrl+V: cut removes, paste inserts. */
  cutPaste: 'editor',
  /** Ctrl+A: selects everything — and switches the canvas to CURSOR to do it. */
  selectAll: 'editor',
  /** F1: opens the help dialog. */
  help: 'viewer',
  /** F2: drops the controlled element into its inline-rename editor. */
  inlineRename: 'editor',
  /** r / c / t / l / n / s / h: arms a placement, drawing or selection tool. */
  toolHotkeys: 'editor',
  /** Ctrl+] / Ctrl+[: writes `zIndex` on the controlled element. */
  zOrder: 'editor',
  /** Arrow keys with a nudge-able selection: moves it by one tile. */
  arrowNudge: 'editor',
  /** Arrow keys with nothing nudge-able selected: scrolls the viewport. */
  arrowPan: 'viewer'
} as const satisfies Record<string, SurfaceAccess>;

export type CanvasKeyboardSurface = keyof typeof CANVAS_KEYBOARD_SURFACES;

/**
 * The element panels `ItemControlsManager` dispatches on `itemControls.type`.
 * Each renders a `readOnly` view of itself when the mode is not EDITABLE —
 * `ITEM` has always done so; the other four rendered their editing surface
 * regardless (VIEW-11). `ADD_ITEM` is the icon picker, which is not an element
 * panel and is not mounted for a viewer at all.
 */
export const ELEMENT_PANEL_SURFACES = {
  ITEM: 'editor',
  CONNECTOR: 'editor',
  TEXTBOX: 'editor',
  LABEL: 'editor',
  RECTANGLE: 'editor'
} as const satisfies Record<string, SurfaceAccess>;

export type ElementPanelSurface = keyof typeof ELEMENT_PANEL_SURFACES;

/** The one place the mode → "may write" question is answered. */
export const canMutate = (editorMode: EditorMode): boolean =>
  editorMode === 'EDITABLE';

export const isSurfaceEnabled = (
  access: SurfaceAccess,
  editorMode: EditorMode
): boolean => access === 'viewer' || canMutate(editorMode);

export const canUseKeyboardSurface = (
  surface: CanvasKeyboardSurface,
  editorMode: EditorMode
): boolean =>
  isSurfaceEnabled(CANVAS_KEYBOARD_SURFACES[surface], editorMode);
