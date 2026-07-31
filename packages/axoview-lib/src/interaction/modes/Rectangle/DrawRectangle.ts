import { ModeActions } from 'src/types';
import { activeLayerPatch } from 'src/utils/resolvePlacement';
import { produce } from 'immer';
import { generateId, hasMovedTile, setWindowCursor } from 'src/utils';

export const DrawRectangle: ModeActions = {
  entry: () => {
    setWindowCursor('crosshair');
  },
  exit: ({ scene }) => {
    setWindowCursor('default');
    // Safety net: close any open draw transaction if the draw is abandoned via
    // a programmatic mode change / escape rather than a normal mouseup. No-op
    // when the transaction was already committed on mouseup.
    scene.commitDragTransaction();
  },
  mousemove: ({ uiState, scene }) => {
    if (
      uiState.mode.type !== 'RECTANGLE.DRAW' ||
      !hasMovedTile(uiState.mouse) ||
      !uiState.mode.id ||
      !uiState.mouse.mousedown
    )
      return;

    // Immer-free per-frame resize while drawing. The `from` corner is fixed at
    // the mousedown tile (read from the model); only `to` tracks the cursor.
    // Writing through the batch path (no full-state immer produce per frame) is
    // what keeps the draw smooth; it lands inside the open draw transaction so
    // the whole draw is a single undo entry.
    const rectangleId = uiState.mode.id;
    const rectangle = scene.rectangles.find((r) => r.id === rectangleId);
    if (!rectangle) return;

    scene.batchUpdateRectangles([
      {
        id: rectangleId,
        from: rectangle.from,
        to: uiState.mouse.position.tile
      }
    ]);
  },
  mousedown: ({ uiState, scene, isRendererInteraction }) => {
    if (uiState.mode.type !== 'RECTANGLE.DRAW' || !isRendererInteraction)
      return;

    const newRectangleId = generateId();

    // Open one history entry for the whole create→draw→release; the per-frame
    // batch writes skip history while the transaction is open.
    scene.beginDragTransaction();
    scene.createRectangle({
      id: newRectangleId,
      color: scene.colors[0].id,
      from: uiState.mouse.position.tile,
      to: uiState.mouse.position.tile,
      // F4/LAY-03: join the layer the panel has selected, if any.
      ...activeLayerPatch(uiState.activeLayerId, scene.currentView?.layers)
    });

    const newMode = produce(uiState.mode, (draft) => {
      draft.id = newRectangleId;
    });

    uiState.actions.setMode(newMode);
  },
  mouseup: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'RECTANGLE.DRAW' || !uiState.mode.id) return;

    scene.commitDragTransaction();
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
