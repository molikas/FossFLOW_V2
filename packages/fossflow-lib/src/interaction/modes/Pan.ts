import { produce } from 'immer';
import { CoordsUtils, setWindowCursor, getItemAtTile } from 'src/utils';
import { ModeActions } from 'src/types';

export const Pan: ModeActions = {
  entry: () => {
    setWindowCursor('grab');
  },
  exit: () => {
    setWindowCursor('default');
  },
  mousemove: ({ uiState }) => {
    if (uiState.mode.type !== 'PAN') return;

    if (uiState.mouse.mousedown !== null) {
      const newScroll = produce(uiState.scroll, (draft) => {
        draft.position = uiState.mouse.delta?.screen
          ? CoordsUtils.add(draft.position, uiState.mouse.delta.screen)
          : draft.position;
      });

      uiState.actions.setScroll(newScroll);
    }
  },
  mousedown: ({ uiState, isRendererInteraction }) => {
    if (uiState.mode.type !== 'PAN' || !isRendererInteraction) return;

    setWindowCursor('grabbing');
  },
  mouseup: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'PAN') return;
    setWindowCursor('grab');
    // Note: Mode switching is now handled by usePanHandlers

    // In read-only mode, a left-click on a node opens the NoteDrawer
    if (uiState.editorMode === 'EXPLORABLE_READONLY') {
      const mousedownTile = uiState.mouse.mousedown?.tile;
      const currentTile = uiState.mouse.position.tile;
      if (
        mousedownTile &&
        CoordsUtils.isEqual(mousedownTile, currentTile)
      ) {
        const item = getItemAtTile({ tile: currentTile, scene });
        if (item?.type === 'ITEM') {
          uiState.actions.setItemControls({ type: 'ITEM', id: item.id });
        } else {
          uiState.actions.setItemControls(null);
        }
      }
    }
  }
};
