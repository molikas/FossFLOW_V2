import { produce } from 'immer';
import { CoordsUtils, setWindowCursor, getItemAtTile } from 'src/utils';
import { ModeActions, ModelItem } from 'src/types';

// True iff an HTML rich-text string contains a visible (non-whitespace) char
// outside any tag span. Scans char-by-char rather than regex-stripping tags: a
// strip like `.replace(/<[^>]*>/g, '')` leaves a partial/unclosed tag (e.g.
// `<script`) in the output, which CodeQL flags as incomplete sanitization
// (js/incomplete-multi-character-sanitization). Treating an unclosed `<` as an
// open tag span means no `<` ever survives.
const htmlHasVisibleText = (value: string | undefined): boolean => {
  if (!value) return false;
  let inTag = false;
  for (const ch of value) {
    if (ch === '<') {
      inTag = true;
    } else if (ch === '>') {
      inTag = false;
    } else if (!inTag && !/\s/.test(ch)) {
      return true;
    }
  }
  return false;
};

// M2: in EXPLORABLE_READONLY a left-press is a click (opens the read-only
// node popover), so a slight wobble during that press must NOT pan — otherwise
// a click flings the diagram off-screen. Require this much left-button travel
// (from the press point) before the pan engages. Matches the right-button
// RIGHT_DRAG_THRESHOLD in usePanHandlers.
const READONLY_LEFT_DRAG_THRESHOLD_PX = 4;

// MQA #22 / #25 (3rd pass): in EXPLORABLE_READONLY the default cursor is the
// normal arrow (not grab). Right-click drag is the pan affordance — left-click
// opens the read-only details panel for the clicked node. EDITABLE mode keeps
// the historic grab/grabbing cursor.
const cursorForState = (editorMode: string | undefined): string =>
  editorMode === 'EXPLORABLE_READONLY' ? 'default' : 'grab';

// A node opens the read-only details panel only when it carries something to
// show: a link, a header link, or non-empty (HTML-stripped) notes. The
// `description` check is a legacy no-op — `description` is folded into `notes`
// at load (foldNodeDescription) and never written, so it can't hold visible
// text for real data; kept only as a belt-and-braces guard for unfolded blobs.
const nodeHasReadonlyContent = (modelItem: ModelItem | undefined): boolean =>
  !!modelItem &&
  (!!modelItem.link ||
    !!modelItem.headerLink ||
    htmlHasVisibleText(modelItem.description) ||
    htmlHasVisibleText(modelItem.notes));

// EXPLORABLE_READONLY left-click on a node opens the read-only details panel
// (NodePanel readOnly). Click on empty area — or on a node with no content —
// dismisses the panel. Treated as a click only when the up tile equals the
// down tile (no drag). Right-click drag is handled by usePanHandlers.
const handleReadonlyClick: ModeActions['mouseup'] = ({
  uiState,
  scene,
  model,
  isRendererInteraction
}) => {
  // The pointer listener is WINDOW-bound (ADR 0018), so this sees mouseups over
  // the right sidebar, the toolbar and every portaled overlay too — and a tile
  // is resolvable for any screen point, so an off-canvas release looks exactly
  // like a click on empty canvas and would dismiss the panel. That is not
  // hypothetical: it unmounted the read-only NodePanel's linked-diagram link
  // mid-click, so the link's own handler never ran (J5.3).
  //
  // This branch only became reachable when I5/CTX-15 stopped a stale RAF
  // mousemove from clearing `mouse.mousedown` — before that, the guard below
  // returned early on every release and the whole path was dead. `Pan.mousedown`
  // has always checked `isRendererInteraction`; the mouseup half needs it too.
  if (!isRendererInteraction) return;

  const mousedownTile = uiState.mouse.mousedown?.tile;
  const currentTile = uiState.mouse.position.tile;
  if (!mousedownTile || !CoordsUtils.isEqual(mousedownTile, currentTile)) return;

  const item = getItemAtTile({ tile: currentTile, scene });
  if (item?.type !== 'ITEM') {
    uiState.actions.setItemControls(null);
    return;
  }

  const modelItem = model.items.find((i) => i.id === item.id);
  if (nodeHasReadonlyContent(modelItem)) {
    uiState.actions.setItemControls({ type: 'ITEM', id: item.id });
  } else {
    uiState.actions.setItemControls(null);
  }
};

export const Pan: ModeActions = {
  entry: ({ uiState }) => {
    setWindowCursor(cursorForState(uiState.editorMode));
  },
  exit: () => {
    setWindowCursor('default');
  },
  mousemove: ({ uiState }) => {
    if (uiState.mode.type !== 'PAN') return;

    if (uiState.mouse.mousedown !== null) {
      // M2: in read-only view mode, absorb sub-threshold left-button travel so a
      // click-wobble pins the popover instead of flinging the diagram. Once the
      // press has travelled past the slop the pan engages for the rest of the
      // drag (total travel only grows). EDITABLE pan is unchanged.
      if (uiState.editorMode === 'EXPLORABLE_READONLY') {
        const down = uiState.mouse.mousedown.screen;
        const here = uiState.mouse.position.screen;
        const travel = Math.hypot(here.x - down.x, here.y - down.y);
        if (travel < READONLY_LEFT_DRAG_THRESHOLD_PX) return;
      }

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
    // Only flip to the grabbing cursor when we're in a mode where panning is
    // the primary left-click action (EDITABLE). In EXPLORABLE_READONLY the
    // left-click is reserved for opening the details panel.
    if (uiState.editorMode !== 'EXPLORABLE_READONLY') {
      setWindowCursor('grabbing');
    }
  },
  mouseup: (state) => {
    const { uiState } = state;
    if (uiState.mode.type !== 'PAN') return;
    setWindowCursor(cursorForState(uiState.editorMode));

    // The panel shows the description, notes, and an action header with
    // external-link + open-linked-diagram buttons.
    if (uiState.editorMode === 'EXPLORABLE_READONLY') {
      handleReadonlyClick(state);
    }
  }
};
