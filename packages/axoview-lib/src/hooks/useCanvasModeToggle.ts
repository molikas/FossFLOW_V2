// useCanvasModeToggle — the iso↔2D switch, shared by the editor ToolMenu and
// the view-only present chrome (owner 2026-07-28: viewers need to switch
// projection too). `canvasMode` is a uiState/localStorage concern only — it is
// never written to the document — so a viewer toggling it changes their OWN
// view and nothing else.
//
// The viewport-preservation effect lives here rather than at a call site so
// both surfaces get it: previously it sat inside ToolMenu, which view-only mode
// never mounts, so surfacing the button alone would have made a viewer's zoom
// pop on every switch.
//
// The effect assumes ONE live consumer at a time — two mounted simultaneously
// would each apply the scroll correction. That holds today: EDITOR_MODE_MAPPING
// (UiOverlay) grants TOOL_MENU to EDITABLE only, and the present chrome renders
// only in EXPLORABLE_READONLY.

import { useCallback, useEffect, useRef } from 'react';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import {
  isometricStrategy,
  cartesian2DStrategy,
  getCanvasModeSwitchScroll,
  reprojectOffset
} from 'src/utils/coordinateTransforms';
import { CoordsUtils } from 'src/utils';
import type { CanvasMode } from 'src/types/ui';
import type { CoordinateTransformStrategy } from 'src/utils/coordinateTransforms';
import type { Coords, View } from 'src/types';

/**
 * Re-project every off-grid residual in a view (R1/PROJ-07). Returns the SAME
 * view object when nothing is off-grid, so the caller can skip the write.
 */
const reprojectViewOffsets = (
  view: View,
  from: CoordinateTransformStrategy,
  to: CoordinateTransformStrategy
): View => {
  let touched = false;
  const map = <T extends { offset?: Coords }>(entity: T): T => {
    if (!entity.offset) return entity;
    touched = true;
    return { ...entity, offset: reprojectOffset(from, to, entity.offset) };
  };
  const next: View = {
    ...view,
    items: (view.items ?? []).map(map),
    rectangles: (view.rectangles ?? []).map(map),
    textBoxes: (view.textBoxes ?? []).map(map),
    labels: (view.labels ?? []).map(map)
  };
  return touched ? next : view;
};

export const useCanvasModeToggle = (): {
  canvasMode: CanvasMode;
  toggleCanvasMode: () => void;
} => {
  const canvasMode = useUiStateStore((state) => state.canvasMode);
  const uiStateStoreActions = useUiStateStore((state) => state.actions);
  const uiStateApi = useUiStateStoreApi();
  const modelApi = useModelStoreApi();

  // Iso↔2D switch preserves the user's zoom and viewport center (ADR locked
  // decision #6): re-project the tile under the viewport center and recompute
  // scroll so it stays centered. (The old `fitToView()` force-fit here is what
  // made zoom "pop" — 65%→80%→97% — and recentred the whole diagram.)
  const prevCanvasModeRef = useRef(canvasMode);
  useEffect(() => {
    const prevCanvasMode = prevCanvasModeRef.current;
    if (prevCanvasMode === canvasMode) return;
    prevCanvasModeRef.current = canvasMode;

    const { zoom, scroll, actions } = uiStateApi.getState();
    const fromStrategy =
      prevCanvasMode === '2D' ? cartesian2DStrategy : isometricStrategy;
    const toStrategy =
      canvasMode === '2D' ? cartesian2DStrategy : isometricStrategy;

    actions.setScroll({
      position: getCanvasModeSwitchScroll(fromStrategy, toStrategy, zoom, scroll),
      offset: CoordsUtils.zero()
    });

    // R1/PROJ-07 (ruled 2026-07-30, ADR 0023 addendum E): `offset` is a
    // POST-projection residual, so it does not survive a projection change —
    // carrying it byte-identical drew an item that had been inside its own ISO
    // cell mostly over the neighbouring 2D one, where tile-based collision will
    // let a second item sit. Re-project it with the same map the scroll
    // correction above uses.
    //
    // EDITABLE only, and that is a deliberate contract collision, resolved the
    // way the two rulings rank: this is a MODEL write, and VIEW-08 (ruled the
    // same day) says a viewer's projection toggle may neither dirty nor save the
    // diagram. A viewer therefore keeps the un-re-projected residual — a
    // sub-tile visual imprecision on a read-only rendering — rather than a
    // viewer silently editing someone else's document. Recorded in the entry
    // and in the ADR addendum.
    const { editorMode } = uiStateApi.getState();
    if (editorMode !== 'EDITABLE') return;

    const model = modelApi.getState();
    const activeViewId = uiStateApi.getState().view;
    const views = model.views.map((v) =>
      v.id === activeViewId
        ? reprojectViewOffsets(v, fromStrategy, toStrategy)
        : v
    );
    // Untouched view objects come back by reference, so an all-snapped diagram
    // writes nothing at all — no history entry, no dirty flag, no autosave.
    if (views.some((v, i) => v !== model.views[i])) {
      model.actions.set({ views });
    }
  }, [canvasMode, uiStateApi, modelApi]);

  const toggleCanvasMode = useCallback(() => {
    uiStateStoreActions.setCanvasMode(
      canvasMode === 'ISOMETRIC' ? '2D' : 'ISOMETRIC'
    );
  }, [canvasMode, uiStateStoreActions]);

  return { canvasMode, toggleCanvasMode };
};
