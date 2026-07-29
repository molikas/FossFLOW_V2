/**
 * E3 probes — read/write facade mismatches and delete-path robustness.
 *
 *  SCN-09  useSceneData.currentView falls back to views[0]; useSceneActions
 *          keys off the raw currentViewId → reads and writes can disagree
 *  SCN-10  useModelItem's index throws on the RED-01 hole
 *  SCN-11  deleteSelectedItems does not guard stale ITEM refs
 *  SCN-12  an invalid paste is abandoned silently
 *  SCN-13  page names are derived from views.length
 *
 * See docs/exploratory/areas/E3-scene-actions-paste.md.
 */
import { renderHook } from '@testing-library/react';
import { installCanvasStub } from '../canvasStub';
import {
  Providers,
  useTestHarness,
  setup,
  act,
  modelView,
  historyDepths,
  makePastePayload,
  VIEW_ID
} from './harness';
import { useSceneData } from 'src/hooks/useSceneData';
import { useModelItem } from 'src/hooks/useModelItem';
import { deleteModelItem } from 'src/stores/reducers/modelItem';

installCanvasStub();

// ---------------------------------------------------------------------------
// SCN-09 — read facade vs write facade under a dangling active view
// ---------------------------------------------------------------------------
describe('SCN-09 — currentView fallback vs currentViewId', () => {
  const useSplit = () => ({ ...useTestHarness(), data: useSceneData() });

  it.failing(
    'BUG: with a dangling ui.view the read facade shows page 1 while writes go nowhere',
    () => {
      const { result } = renderHook(useSplit, { wrapper: Providers });

      act(() => {
        result.current.uiStateApi.getState().actions.setView(VIEW_ID);
        result.current.modelApi.getState().actions.set(
          {
            version: '1.0',
            title: 'E3',
            icons: [{ id: 'block', name: 'B', url: 'x', isIsometric: true }],
            colors: [{ id: 'c1', value: '#0066cc' }],
            items: [{ id: 'node-A', name: 'A', icon: 'block' }],
            views: [
              {
                id: VIEW_ID,
                name: 'Page 1',
                items: [{ id: 'node-A', tile: { x: 0, y: 0 } }],
                connectors: [],
                rectangles: [],
                textBoxes: []
              }
            ]
          } as never,
          true
        );
      });

      // The exact state HIST-04's undo leaves behind: ui.view names a view the
      // model does not have.
      act(() => {
        result.current.uiStateApi.getState().actions.setView('view-that-is-gone');
      });

      // The read facade silently pretends page 1 is current…
      expect(result.current.data.currentView.id).toBe(VIEW_ID);

      // …so a component reading `currentView` and then writing must hit the
      // same page. Either both resolve, or both refuse.
      act(() => {
        result.current.scene.createLabel({
          id: 'lbl-1',
          tile: { x: 1, y: 1 },
          text: 'a'
        });
      });
      expect(modelView(result as never).labels ?? []).toHaveLength(1);
    }
  );

  it('characterization: the read falls back, the write throws', () => {
    const { result } = renderHook(useSplit, { wrapper: Providers });

    act(() => {
      result.current.uiStateApi.getState().actions.setView(VIEW_ID);
      result.current.modelApi.getState().actions.set(
        {
          version: '1.0',
          title: 'E3',
          icons: [{ id: 'block', name: 'B', url: 'x', isIsometric: true }],
          colors: [{ id: 'c1', value: '#0066cc' }],
          items: [{ id: 'node-A', name: 'A', icon: 'block' }],
          views: [
            {
              id: VIEW_ID,
              name: 'Page 1',
              items: [{ id: 'node-A', tile: { x: 0, y: 0 } }],
              connectors: [],
              rectangles: [],
              textBoxes: []
            }
          ]
        } as never,
        true
      );
    });
    act(() => {
      result.current.uiStateApi.getState().actions.setView('view-that-is-gone');
    });

    expect(result.current.data.currentView.id).toBe(VIEW_ID);
    expect(() => {
      act(() => {
        result.current.scene.createLabel({
          id: 'lbl-1',
          tile: { x: 1, y: 1 },
          text: 'a'
        });
      });
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SCN-10 — useModelItem's index over a holed items array
// ---------------------------------------------------------------------------
describe('SCN-10 — useModelItem over the deleteModelItem hole', () => {
  it.failing(
    'BUG: every subscriber throws at once instead of one lookup returning null',
    () => {
      const { result: harness } = renderHook(useTestHarness, {
        wrapper: Providers
      });
      act(() => {
        harness.current.uiStateApi.getState().actions.setView(VIEW_ID);
      });

      // Apply the RED-01 corruption to the live store.
      act(() => {
        const model = harness.current.modelApi.getState();
        const holed = deleteModelItem('node-A', {
          model: {
            version: model.version,
            title: model.title,
            description: model.description,
            colors: model.colors,
            icons: model.icons,
            items: model.items,
            views: model.views
          },
          scene: { connectors: {}, textBoxes: {} }
        });
        harness.current.modelApi.getState().actions.set(holed.model, true);
      });

      // A component asking about a DIFFERENT, perfectly healthy item.
      expect(() =>
        renderHook(() => useModelItem('node-B'), { wrapper: Providers })
      ).not.toThrow();
    }
  );
});

// ---------------------------------------------------------------------------
// SCN-11 — deleteSelectedItems and a stale ITEM ref
// ---------------------------------------------------------------------------
describe('SCN-11 — a stale ITEM ref in the delete set', () => {
  it.failing(
    'BUG: one dead ref throws and discards the whole multi-delete',
    () => {
      const result = setup();

      // The exact shape HIST-13 / RED-15 leave behind: a selection naming an
      // item that is already gone, alongside live ones.
      act(() => {
        result.current.scene.deleteSelectedItems([
          { type: 'ITEM', id: 'already-deleted' },
          { type: 'ITEM', id: 'node-A' }
        ]);
      });

      // node-A must still be deleted — a dead ref should be skipped, not fatal.
      expect(modelView(result).items.map((i) => i.id)).toEqual(['node-B']);
    }
  );

  it('characterization: nothing is deleted and the throw escapes to the caller', () => {
    const result = setup();

    expect(() => {
      act(() => {
        result.current.scene.deleteSelectedItems([
          { type: 'ITEM', id: 'already-deleted' },
          { type: 'ITEM', id: 'node-A' }
        ]);
      });
    }).toThrow();

    expect(modelView(result).items.map((i) => i.id)).toEqual([
      'node-A',
      'node-B'
    ]);
  });

  it('control: the other ref types ARE guarded against stale ids', () => {
    const result = setup();

    expect(() => {
      act(() => {
        result.current.scene.deleteSelectedItems([
          { type: 'CONNECTOR', id: 'gone' },
          { type: 'TEXTBOX', id: 'gone' },
          { type: 'RECTANGLE', id: 'gone' },
          { type: 'LABEL', id: 'gone' }
        ]);
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SCN-12 — an invalid paste is abandoned with no user-facing signal
// ---------------------------------------------------------------------------
describe('SCN-12 — silent paste abort', () => {
  it('characterization: an invalid payload pastes nothing and notifies nobody', () => {
    const result = setup();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    // A view item whose model item is absent — validateView rejects the
    // assembled view, so `pasteItems` warns and skips.
    const payload = makePastePayload(0);
    (payload as unknown as { items: unknown[] }).items = [
      {
        modelItem: { id: 'x-1', name: 'X', icon: 'block' },
        viewItem: { id: 'DIFFERENT-ID', tile: { x: 1, y: 1 } }
      }
    ];

    const before = historyDepths(result).modelPast;
    act(() => {
      result.current.scene.pasteItems(payload);
    });

    expect(modelView(result).items.map((i) => i.id)).toEqual([
      'node-A',
      'node-B'
    ]);
    expect(historyDepths(result).modelPast).toBe(before);
    expect(warn).toHaveBeenCalled();
    expect(result.current.uiStateApi.getState().notification ?? null).toBeNull();

    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// SCN-13 — page names derived from views.length
// ---------------------------------------------------------------------------
describe('SCN-13 — duplicate page names after a delete', () => {
  it.failing(
    'BUG: create 3 pages, delete the middle one, create another → two pages share a name',
    () => {
      const result = setup();

      act(() => {
        result.current.scene.createView();
      });
      act(() => {
        result.current.scene.createView();
      });
      const names1 = result.current.modelApi
        .getState()
        .views.map((v) => v.name);
      expect(new Set(names1).size).toBe(names1.length);

      const middle = result.current.modelApi.getState().views[1].id;
      act(() => {
        result.current.scene.deleteView(middle);
      });
      act(() => {
        result.current.scene.createView();
      });

      const names = result.current.modelApi.getState().views.map((v) => v.name);
      expect(new Set(names).size).toBe(names.length);
    }
  );
});
