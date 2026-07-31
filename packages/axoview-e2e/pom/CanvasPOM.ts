/**
 * CanvasPOM — the iso canvas surface.
 *
 * Session 5 ships the hotkey-driven mode-switch surface needed by
 * `shapes.spec.ts` (J3): rectangle draw via the `r` hotkey + drag, textbox
 * creation via the `t` hotkey. The drag-mode-button retrofits
 * (`canvas-tool-*`) stay deferred per ADR 0008 Decision 5 — no spec exercises
 * them in this session, so the attributes don't land yet.
 *
 * Why synthetic mouse-event dispatch on `[data-axoview-id="canvas-interactions"]`
 * instead of `page.mouse.{down,move,up}`: the lib's per-mode handlers gate on
 * `rendererRef.current === e.target` (see useInteractionManager.processMouseUpdate
 * — the `isRendererInteraction` flag). Playwright's page.mouse dispatches a
 * native event whose `e.target` is whatever elementFromPoint resolves to —
 * typically a SceneLayer child stacked above the interactions Box, so the
 * isRendererInteraction guard rejects it and the mode handler is skipped.
 * Dispatching synthetic MouseEvents directly on the interactions Box bypasses
 * the elementFromPoint dance — same pattern as connector.spec.ts#clickCanvasAt.
 *
 * Lazy data-axoview-id retrofits — none this POM-debut commit. The CanvasPOM
 * methods all consume already-landed attributes:
 *   - `canvas-interactions` (lib, Session 3)
 *   - `canvas-icon-grid-item`  (lib, Session 2)
 *
 * Session-6 addition (Commit 4 — canvas-modes spec):
 *   - `canvas-mode-toggle` (lib, ToolMenu.tsx — drives toggle2DMode())
 *     Forwarded to the IconButton's underlying <button> via a new
 *     `dataAxoviewId` pass-through prop on src/components/IconButton/
 *     IconButton.tsx. Existing call sites stay untouched.
 *
 * Pending CanvasPOM retrofits (per `pom/_pending.md`): `canvas-tool-{select,
 * connector,lasso,undo,redo}` lit by future button-driven specs; `canvas-root`
 * replaces lib `data-testid="axoview-canvas"` when a spec needs it (none yet —
 * deferred).
 */
import { Locator, Page } from '@playwright/test';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';

export interface CanvasPoint {
  x: number;
  y: number;
}

export class CanvasPOM {
  constructor(readonly page: Page) {}

  /** The renderer interactions Box. Used as the dispatch target so events
   *  satisfy `e.target === rendererRef.current` (isRendererInteraction). */
  interactionsLayer(): Locator {
    return byAxoviewId(this.page, 'canvas-interactions');
  }

  /** The lib's Renderer canvas. Still uses data-testid pending the
   *  `canvas-root` retrofit (deferred — no current spec drives it). */
  canvas(): Locator {
    return byLibTestId(this.page, 'axoview-canvas');
  }

  /**
   * Dispatches a sequence of synthetic mouse events on the interactions Box.
   * Each entry's `clientX/clientY` is `interactions.getBoundingClientRect()
   * .{left,top} + point`. Caller picks the event types; events bubble to the
   * window-level listener (where useInteractionManager binds), and `e.target`
   * is deterministically the interactions Box so isRendererInteraction is true.
   *
   * Awaits one `requestAnimationFrame` tick AFTER EACH dispatched event so the
   * lib's RAF-throttled mouse-update scheduler (`interaction/useRAFThrottle.ts`)
   * has actually flushed its snapshot to `uiState.mouse` before the next event
   * lands. Session 5 (commit `f502a62`) discovered the RAF race and addressed
   * it by dispatching each event in a separate `page.evaluate` so the Playwright
   * client→server roundtrip would let RAF tick between dispatches. That holds
   * locally (~50–100 ms roundtrip on Windows + browser IPC) but breaks on
   * headless Linux CI where the roundtrip is <16 ms (sub-frame), the snapshot
   * stays stale, and the next event's mode handler reads the wrong
   * `mouse.position.tile`. Session 8 (commit `0c5f7dc` instrumentation)
   * confirmed: post-placeIcon mode = PLACE_ICON, but its mousedown handler at
   * the existing item's tile read a stale position, so `getItemAtTile` returned
   * nothing, `mousedownItem` was null, and the drag had no target. Awaiting RAF
   * inside the evaluate makes the dispatch synchronous w.r.t. the lib's
   * observable state regardless of CI vs local roundtrip latency.
   */
  async dispatchAt(
    events: Array<'mousemove' | 'mousedown' | 'mouseup'>,
    point: CanvasPoint
  ) {
    await this.interactionsLayer().evaluate(
      async (el, args: { types: string[]; x: number; y: number }) => {
        const rect = el.getBoundingClientRect();
        const raf = () =>
          new Promise<void>((r) => requestAnimationFrame(() => r()));
        // ADR 0018 rewrite: the lib binds Pointer Events on the container now.
        // Dispatch synthetic PointerEvents with pointerType:'mouse' so the mouse
        // branch runs (press-drag-release, unchanged). The caller API still uses
        // the mouse-event vocabulary — mapped here so no spec changes (the zero-
        // assertion-change migration is the proof the mouse path is unchanged).
        const POINTER_TYPE: Record<string, string> = {
          mousedown: 'pointerdown',
          mousemove: 'pointermove',
          mouseup: 'pointerup'
        };
        for (const type of args.types) {
          el.dispatchEvent(
            new PointerEvent(POINTER_TYPE[type] ?? type, {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + args.x,
              clientY: rect.top + args.y,
              button: 0,
              buttons: type === 'mousedown' ? 1 : 0,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true
            })
          );
          await raf();
        }
      },
      { types: events, x: point.x, y: point.y }
    );
  }

  /** Single click on the canvas via synthetic mousemove+down+up at one point. */
  async clickAt(point: CanvasPoint) {
    await this.dispatchAt(['mousemove', 'mousedown', 'mouseup'], point);
  }

  /**
   * Synthetic drag from `from` to `to` on the canvas. The lib's
   * DrawRectangle.mousemove gates on `hasMovedTile` AND `uiState.mouse.mousedown`,
   * so we dispatch an intermediate mousemove with the down state implied by
   * the preceding mousedown — the lib's processMouseUpdate writes mousedown
   * into uiState on the synthetic mousedown event.
   */
  async dragFromTo(from: CanvasPoint, to: CanvasPoint) {
    // Land mouse at start tile.
    await this.dispatchAt(['mousemove'], from);
    // Begin the drag.
    await this.dispatchAt(['mousedown'], from);
    // Walk to the end tile through a few intermediate steps so DrawRectangle's
    // hasMovedTile gate trips on each pixel-band crossing. Two points is
    // usually enough; we pick three for safety on small drags.
    const midA = {
      x: from.x + (to.x - from.x) / 3,
      y: from.y + (to.y - from.y) / 3
    };
    const midB = {
      x: from.x + ((to.x - from.x) * 2) / 3,
      y: from.y + ((to.y - from.y) * 2) / 3
    };
    await this.dispatchAt(['mousemove'], midA);
    await this.dispatchAt(['mousemove'], midB);
    await this.dispatchAt(['mousemove'], to);
    await this.dispatchAt(['mouseup'], to);
  }

  /**
   * Enters RECTANGLE.DRAW mode via the `r` hotkey (default profile = smnrct,
   * see config/hotkeys.ts; the rectangle binding is `r` in all non-`none`
   * profiles, so this is stable across qwerty/smnrct). useInteractionManager's
   * keydown filters INPUT/TEXTAREA/contenteditable targets — after a canvas
   * interaction, focus sits on the document body which passes the filter.
   */
  async switchToRectangleMode() {
    await this.page.keyboard.press('r');
  }

  /**
   * Triggers textbox creation via the `t` hotkey. The keydown handler in
   * useInteractionManager reads `uiState.mouse.position.tile` and creates a
   * textbox at that tile, then transitions to TEXTBOX mode (id = the new
   * textbox). Callers MUST land the synthetic mouse at the desired tile
   * (via dispatchAt(['mousemove'], …)) BEFORE pressing the hotkey so the
   * store's mouse position is current.
   *
   * The TextBox mode's mouseup gates on isRendererInteraction — caller
   * commits the textbox by dispatching a mouseup on the interactions Box
   * (clickAt handles the move+down+up sequence; placeTextBoxAt below wraps
   * the canonical flow).
   *
   * Note: hotkey is `t` in `smnrct` profile and `y` in `qwerty`. The lib's
   * test bootstrap defaults to `smnrct` (see DEFAULT_HOTKEY_PROFILE) and the
   * e2e suite never switches profiles — so the bare `t` press is correct for
   * every spec until a profile-switch spec lands.
   */
  async pressTextBoxHotkey() {
    await this.page.keyboard.press('t');
  }

  /**
   * Canonical textbox-placement flow:
   *   1. land mouse at the target tile (sets uiState.mouse.position.tile)
   *   2. press `t` hotkey (arms TEXTBOX mode — no box created yet)
   *   3. mouseup at the same tile (the single create site; commits via
   *      isRendererInteraction = true)
   *
   * Place-and-type (ADR 0034) drops the new box straight into the on-canvas
   * Quill edit session, which holds keyboard focus — a subsequent hotkey press
   * would type INTO the box instead of arming a tool. A new box is EMPTY and a
   * session that ends empty discards the box (ADR 0034 addendum 2026-07-03),
   * so by default this helper types probe content (`opts.text`, default
   * 'Text') and commits — leaving a persisted, still-selected box, like the
   * old default-content placement did. Pass `keepEditing: true` when the spec
   * wants the live (empty) editor.
   */
  async placeTextBoxAt(
    point: CanvasPoint,
    opts?: { keepEditing?: boolean; text?: string }
  ) {
    await this.dispatchAt(['mousemove'], point);
    await this.pressTextBoxHotkey();
    await this.dispatchAt(['mouseup'], point);
    if (opts?.keepEditing) return;
    const editor = this.textBoxInlineEditor();
    await editor.waitFor({ state: 'visible', timeout: 5_000 });
    await editor.click();
    await this.page.keyboard.type(opts?.text ?? 'Text', { delay: 5 });
    await this.commitTextBoxEditor();
  }

  /** The on-canvas rich-text editor of the text box being edited (ADR 0034). */
  textBoxInlineEditor(): Locator {
    return byAxoviewId(this.page, 'textbox-inline-editor').locator('.ql-editor');
  }

  /**
   * Commits the on-canvas edit session without touching the canvas: a
   * pointerdown on document.body trips the editor's capture-phase click-away
   * listener (body is outside editor/strip/portals) but never reaches the
   * canvas-interactions element — so the box stays selected and no other
   * element is hit, whatever the spec's layout.
   */
  async commitTextBoxEditor() {
    const editor = this.textBoxInlineEditor();
    await this.page.evaluate(() => {
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true })
      );
    });
    await editor.waitFor({ state: 'detached', timeout: 5_000 });
  }

  /**
   * Ends an on-canvas text-box edit session via Escape (cancel — the STORED
   * content is left as-is; a box that was never committed is discarded, per
   * the ADR 0034 empty-box lifecycle). Clicks the editor first so Escape
   * reliably targets it rather than the window's own Escape handler.
   */
  async dismissTextBoxEditor() {
    const editor = this.textBoxInlineEditor();
    await editor.waitFor({ state: 'visible', timeout: 5_000 });
    await editor.click();
    await this.page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached', timeout: 5_000 });
  }

  /**
   * Floating-Label placement (ADR 0031). The Label has no hotkey — the Common
   * deck arms the LABEL mode — so arm it via the store, then drop on mouseup
   * (mirrors placeTextBoxAt's land → arm → release flow).
   *
   * Placement seeds EMPTY text and drops into the inline editor (TXT-07 ruling,
   * 2026-07-31: the literal "Label" placeholder is gone, and a Label whose
   * first edit session ends without text is discarded — the text box's
   * contract). So, exactly like `placeTextBoxAt`, this helper types probe text
   * and commits by default, leaving a persisted chip; pass `keepEditing: true`
   * when the spec wants to drive the live session itself.
   */
  async placeLabelAt(
    point: CanvasPoint,
    opts?: { keepEditing?: boolean; text?: string }
  ) {
    await this.dispatchAt(['mousemove'], point);
    await this.page.evaluate(() => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setMode({ type: 'LABEL', showCursor: true, id: null });
    });
    await this.dispatchAt(['mouseup'], point);
    if (opts?.keepEditing) return;
    const editor = this.page.getByTestId('label-inline-editor');
    await editor.waitFor({ state: 'visible', timeout: 5_000 });
    await editor.click();
    await this.page.keyboard.type(opts?.text ?? 'Label', { delay: 5 });
    await this.page.keyboard.press('Enter');
    await editor.waitFor({ state: 'detached', timeout: 5_000 });
  }

  canvasModeToggleButton(): Locator {
    return byAxoviewId(this.page, 'canvas-mode-toggle');
  }

  /**
   * Clicks the ToolMenu's canvas-mode toggle. Flips
   * `uiState.canvasMode` between ISOMETRIC ↔ 2D. The toggle preserves the
   * user's zoom and viewport center across the projection swap (ToolMenu's
   * prevCanvasModeRef effect → getCanvasModeSwitchScroll); it no longer
   * fit-to-views the diagram (ADR locked decision #6).
   */
  async toggleCanvasMode() {
    await this.canvasModeToggleButton().click();
  }

  /**
   * Iso (or 2D) projection: tile coords → interactions-box screen pixels
   * suitable for `clickAt` / `dispatchAt` / `dragFromTo`.
   *
   * Mirrors the lib's canonical `toScreen` math from
   * `packages/axoview-lib/src/utils/coordinateTransforms.ts:94-105` (ISO) /
   * `:132-141` (2D). Constants come from `packages/axoview-lib/src/config.ts:16-24`
   * (`UNPROJECTED_TILE_SIZE`, `TILE_PROJECTION_MULTIPLIERS`).
   *
   * Forward derivation (inverse of `coordinateTransforms.ts:108-121`
   * `fromScreen`): the SceneLayer applies `translate(rendererSize/2 + scroll)`
   * then `scale(zoom)`, so for canvas-space `(canvas_x, canvas_y)` the
   * interactions-box pixel is
   *   screenX = rendererSize.width  / 2 + scroll.position.x + canvas_x * zoom
   *   screenY = rendererSize.height / 2 + scroll.position.y + canvas_y * zoom.
   * The interactions Box and Renderer share the same bbox
   * (Renderer.tsx:216-225 — `width:100% height:100%` over the canvas
   * container), so the interactions-box origin is the rendererSize origin.
   *
   * Note: the lib's debug bridge does not expose `getTilePosition` directly
   * (it's bound inside `CanvasModeContext` via `makeTilePositionFn`), so
   * this helper mirrors the math. If the iso math ever changes in the lib,
   * this helper diverges silently — the smoke spec
   * `iso-helper-smoke.spec.ts` is the load-bearing canary.
   */
  async tileToScreen(tile: { x: number; y: number }): Promise<CanvasPoint> {
    return this.page.evaluate((args: { tileX: number; tileY: number }) => {
      const ui = (window as any).__axoview__.ui.getState();
      const canvasMode: 'ISOMETRIC' | '2D' = ui.canvasMode ?? 'ISOMETRIC';
      const rendererSize: { width: number; height: number } = ui.rendererSize;
      const zoom: number = ui.zoom;
      const scroll: { position: { x: number; y: number } } = ui.scroll;

      // Mirrors src/config.ts:16-24 — UNPROJECTED_TILE_SIZE=100,
      // TILE_PROJECTION_MULTIPLIERS={width:1.415, height:0.819}.
      const UNPROJECTED_TILE_SIZE = 100;
      const halfW =
        canvasMode === 'ISOMETRIC'
          ? (UNPROJECTED_TILE_SIZE * 1.415) / 2
          : UNPROJECTED_TILE_SIZE / 2;
      const halfH =
        canvasMode === 'ISOMETRIC'
          ? (UNPROJECTED_TILE_SIZE * 0.819) / 2
          : UNPROJECTED_TILE_SIZE / 2;

      let canvasX: number;
      let canvasY: number;
      if (canvasMode === 'ISOMETRIC') {
        canvasX = halfW * args.tileX - halfW * args.tileY;
        canvasY = -(halfH * args.tileX + halfH * args.tileY);
      } else {
        canvasX = args.tileX * UNPROJECTED_TILE_SIZE;
        canvasY = -args.tileY * UNPROJECTED_TILE_SIZE;
      }

      const screenX =
        rendererSize.width / 2 + scroll.position.x + canvasX * zoom;
      const screenY =
        rendererSize.height / 2 + scroll.position.y + canvasY * zoom;
      return { x: screenX, y: screenY };
    }, { tileX: tile.x, tileY: tile.y });
  }
}
