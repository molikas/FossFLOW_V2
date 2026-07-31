/**
 * CONTRACT — the two label hit-proxies handle pointers identically.
 *
 * Why this exists: bug #7 of the ADR 0023 off-grid cluster. `LabelHitLayer`
 * (floating labels) and `NodeLabelHitLayer` (node name chips) are siblings that
 * do the same job over two different paint layers, and they drifted: the node
 * layer swallowed a right-click, so right-clicking a node's label opened nothing
 * while right-clicking a floating label opened its item menu. Sibling drift is
 * invisible unless something tests the two against the SAME expectations — that
 * is this file.
 *
 * Both proxies render `[data-axoview-id="canvas-label-hit"]`, so every case here
 * is written once and run against both layers.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Coords } from 'src/types';

// jsdom has no PointerEvent, and without it RTL falls back to a bare Event —
// which silently drops `button`, so EVERY press would read as `undefined` and
// the button guard under test would appear to hold for the wrong reason.
//
// `pointerType` is copied across for the same reason: `MouseEvent` does not
// carry it, so without this every press would read as `undefined` and the
// touch-vs-mouse split in the long-press cases below would be vacuous — both
// legs would take the same branch and both would still pass.
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;
  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerType = params.pointerType ?? '';
  }
}
(window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;

jest.mock('src/contexts/CanvasModeContext', () => {
  const actual = jest.requireActual('src/utils/coordinateTransforms');
  const strategy = actual.isometricStrategy;
  return {
    useCanvasMode: () => ({
      strategy,
      getTilePosition: actual.makeTilePositionFn(strategy),
      screenToTile: () => ({ x: 0, y: 0 }),
      getProjectionCss: () => ''
    })
  };
});

const actions = {
  setItemControls: jest.fn(),
  setInlineEditLabelId: jest.fn(),
  setViewModeHoveredLabelId: jest.fn(),
  openContextMenu: jest.fn(),
  setLabelMove: jest.fn(),
  clearLabelMove: jest.fn(),
  setLabelDrag: jest.fn(),
  clearLabelDrag: jest.fn()
};

const uiState = {
  zoom: 1,
  editorMode: 'EDITABLE',
  inlineEditLabelId: null as string | null,
  viewModeHoveredLabelId: null as string | null,
  actions
};

jest.mock('src/stores/uiStateStore', () => ({
  useUiStateStore: (selector: (s: unknown) => unknown) => selector(uiState),
  useUiStateStoreApi: () => ({
    getState: () => uiState,
    setState: () => {},
    subscribe: () => () => {}
  })
}));

jest.mock('src/stores/modelStore', () => ({
  useModelStore: (selector: (s: unknown) => unknown) =>
    selector({ items: [{ id: 'n1', name: 'Node one' }] })
}));

jest.mock('src/hooks/useLayerContext', () => ({
  useLayerContext: () => ({
    visibleIds: new Set<string>(),
    lockedIds: new Set<string>(),
    // #81 added a `layers.length` read in LabelHitLayer; empty = all visible.
    layers: []
  })
}));

jest.mock('src/hooks/useSceneActions', () => ({
  useSceneActions: () => ({ updateLabel: jest.fn(), updateViewItem: jest.fn() })
}));

jest.mock('src/hooks/useInlineRename', () => ({
  useInlineRename: () => ({ setRef: () => {}, onKeyDown: () => {} })
}));

/* eslint-disable import/first */
import { LabelHitLayer } from 'src/components/SceneLayers/Labels/LabelHitLayer';
import { NodeLabelHitLayer } from 'src/components/SceneLayers/Nodes/NodeLabelHitLayer';
import { LONG_PRESS_MS } from 'src/config/tapGesture';
/* eslint-enable import/first */

const TILE: Coords = { x: 1, y: 1 };

const LAYERS: {
  name: string;
  /** What the chip's own context menu must target. */
  menuTarget: { type: string; id: string };
  render: () => ReturnType<typeof render>;
}[] = [
  {
    name: 'LabelHitLayer (floating label)',
    menuTarget: { type: 'LABEL', id: 'l1' },
    render: () =>
      render(
        <LabelHitLayer
          labels={
            [
              { id: 'l1', text: 'Floating', tile: TILE, offset: { x: 12, y: -7 } }
            ] as never
          }
        />
      )
  },
  {
    name: 'NodeLabelHitLayer (node name chip)',
    menuTarget: { type: 'ITEM', id: 'n1' },
    render: () =>
      render(
        <NodeLabelHitLayer
          nodes={
            [
              {
                id: 'n1',
                tile: TILE,
                offset: { x: 12, y: -7 },
                showLabel: true,
                labelHeight: 40
              }
            ] as never
          }
        />
      )
  }
];

describe.each(LAYERS)(
  'label pointer contract — $name',
  ({ render: mount, menuTarget }) => {
  let addSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    addSpy = jest.spyOn(window, 'addEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
  });

  const proxy = (container: HTMLElement): HTMLElement => {
    const el = container.querySelector<HTMLElement>(
      '[data-axoview-id="canvas-label-hit"]'
    );
    expect(el).not.toBeNull();
    return el!;
  };

  const movesArmed = () =>
    addSpy.mock.calls.some(([type]) => type === 'pointermove');

  it('a PRIMARY press arms the label move gesture', () => {
    const { container } = mount();
    fireEvent.pointerDown(proxy(container), { button: 0 });
    expect(movesArmed()).toBe(true);
  });

  it('a RIGHT press does NOT arm the move gesture (menu owns it)', () => {
    const { container } = mount();
    fireEvent.pointerDown(proxy(container), { button: 2 });
    expect(movesArmed()).toBe(false);
  });

  it('a MIDDLE press does NOT arm the move gesture', () => {
    const { container } = mount();
    fireEvent.pointerDown(proxy(container), { button: 1 });
    expect(movesArmed()).toBe(false);
  });

  // The proxy swallows every press, so the window-level right-tap handler can
  // never resolve the chip. A layer that swallows the press without owning the
  // menu leaves its chip un-right-clickable — that WAS the node label's bug.
  it('owns its own context menu (the press never reaches the canvas)', () => {
    const { container } = mount();
    const el = proxy(container);

    fireEvent.pointerDown(el, { button: 2 });
    // Swallowed, so usePanHandlers never sees it.
    expect(
      addSpy.mock.calls.some(([type]) => type === 'pointermove')
    ).toBe(false);

    fireEvent.contextMenu(el, { clientX: 210, clientY: 130 });
    expect(actions.openContextMenu).toHaveBeenCalledTimes(1);
    expect(actions.openContextMenu).toHaveBeenCalledWith({
      anchor: { x: 210, y: 130 },
      variant: 'item',
      target: menuTarget
    });
  });

  it('its context menu preventDefaults the native menu', () => {
    const { container } = mount();
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    });
    fireEvent(proxy(container), event);
    expect(event.defaultPrevented).toBe(true);
  });

  // Promoted from the exploratory lane (I2/TCH-09). A finger has no right
  // button, so the touch equivalent of the case above is a HOLD — and the canvas
  // gesture machine cannot supply it: chips are outside the tile hit-test (ADR
  // 0031 §4) AND the proxy swallows the press, so the window pointerdown the
  // machine listens on never fires. A long press on a floating Label produced
  // nothing at all: no menu, and not even the hold-on-empty lasso fallback.
  describe('the touch long-press opens the same menu (TCH-09)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('a held touch press opens the item menu at the press point', () => {
      const { container } = mount();
      fireEvent.pointerDown(proxy(container), {
        button: 0,
        pointerType: 'touch',
        clientX: 210,
        clientY: 130
      });
      expect(actions.openContextMenu).not.toHaveBeenCalled();

      jest.advanceTimersByTime(LONG_PRESS_MS);

      expect(actions.openContextMenu).toHaveBeenCalledWith({
        anchor: { x: 210, y: 130 },
        variant: 'item',
        target: menuTarget
      });
    });

    it('a MOUSE press never arms the hold (right-click owns that path)', () => {
      const { container } = mount();
      fireEvent.pointerDown(proxy(container), {
        button: 0,
        pointerType: 'mouse',
        clientX: 210,
        clientY: 130
      });
      jest.advanceTimersByTime(LONG_PRESS_MS * 2);
      expect(actions.openContextMenu).not.toHaveBeenCalled();
    });

    it('a touch press that travels past slop is a move, not a hold', () => {
      const { container } = mount();
      fireEvent.pointerDown(proxy(container), {
        button: 0,
        pointerType: 'touch',
        clientX: 210,
        clientY: 130
      });
      // The layers listen on `window` for the move, so drive it there.
      fireEvent.pointerMove(window, { clientX: 260, clientY: 190 });
      jest.advanceTimersByTime(LONG_PRESS_MS * 2);
      expect(actions.openContextMenu).not.toHaveBeenCalled();
    });

    it('a quick tap releases before the hold fires', () => {
      const { container } = mount();
      fireEvent.pointerDown(proxy(container), {
        button: 0,
        pointerType: 'touch',
        clientX: 210,
        clientY: 130
      });
      jest.advanceTimersByTime(LONG_PRESS_MS - 50);
      fireEvent.pointerUp(window);
      jest.advanceTimersByTime(LONG_PRESS_MS);
      expect(actions.openContextMenu).not.toHaveBeenCalled();
    });
  });
  }
);
