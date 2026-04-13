import { ModelStore, UiStateStore, Size, ItemReference, Coords } from 'src/types';
import { Scroll } from 'src/types/ui';
import { useScene } from 'src/hooks/useScene';

export interface State {
  model: ModelStore;
  scene: ReturnType<typeof useScene>;
  uiState: UiStateStore;
  rendererRef: HTMLElement;
  rendererSize: Size;
  isRendererInteraction: boolean;
  /**
   * Returns true if the given item can be interacted with.
   * Items on locked layers return false. Items with no layer always return true.
   */
  isItemInteractable: (ref: ItemReference) => boolean;
  /**
   * Mode-aware screen→tile converter injected by useInteractionManager.
   * Interaction mode handlers must use this instead of importing screenToIso directly.
   */
  screenToTile: (args: {
    mouse: Coords;
    zoom: number;
    scroll: Scroll;
    rendererSize: Size;
  }) => Coords;
}

export type ModeActionsAction = (state: State) => void;

export type ModeActions = {
  entry?: ModeActionsAction;
  exit?: ModeActionsAction;
  mousemove?: ModeActionsAction;
  mousedown?: ModeActionsAction;
  mouseup?: ModeActionsAction;
};
