/**
 * Scene-action session guards, on real providers.
 *
 * - E3/SCN-07: the batch drag updaters are drag-only BY CONTRACT now, not by
 *   comment — called outside a `beginDragTransaction` bracket they no-op with
 *   a dev warning instead of landing a visible, un-undoable edit.
 * - E3/SCN-09: with a dangling `ui.view` (the state a page delete's undo used
 *   to leave), the write facade resolves the SAME fallback view the read
 *   facade renders — an edit lands on the page the user is looking at instead
 *   of throwing "not found".
 * - E3/SCN-11: a dead ITEM ref in a multi-delete is skipped, never fatal —
 *   the live members still delete.
 * - E3/SCN-15: connector-routing rAF batches scheduled for one page are
 *   dropped after a page switch — the old page's paths never land in the new
 *   page's scene.
 *
 * Promoted from the retired exploratory lane (mop-up wave, 2026-08-10).
 * known_issues: "The batch drag updaters are drag-only by convention only",
 * "A dangling active view makes reads and writes disagree", "One stale item
 * reference discards an entire multi-delete", "Switching pages during async
 * connector routing writes the old page's paths into the new page's scene".
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { useSceneData } from 'src/hooks/useSceneData';
import type { PastePayload } from 'src/clipboard/clipboard';

const VIEW_ID = 'view-1';

const Providers = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <SceneProvider>
      <UiStateProvider>{children}</UiStateProvider>
    </SceneProvider>
  </ModelProvider>
);

const useHarness = () => ({
  scene: useScene(),
  data: useSceneData(),
  modelApi: useModelStoreApi(),
  sceneApi: useSceneStoreApi(),
  uiStateApi: useUiStateStoreApi()
});

const seedView = () => ({
  version: '1.0',
  title: 'edit guards',
  icons: [{ id: 'block', name: 'Block', url: '', isIsometric: true }],
  colors: [{ id: 'c1', value: '#0066cc' }],
  items: [
    { id: 'node-A', name: 'A', icon: 'block' },
    { id: 'node-B', name: 'B', icon: 'block' }
  ],
  views: [
    {
      id: VIEW_ID,
      name: 'Page 1',
      items: [
        { id: 'node-A', tile: { x: 0, y: 0 } },
        { id: 'node-B', tile: { x: 5, y: 5 } }
      ],
      connectors: [],
      rectangles: [],
      textBoxes: []
    }
  ]
});

function setup() {
  const { result } = renderHook(useHarness, { wrapper: Providers });
  act(() => {
    result.current.uiStateApi.getState().actions.setView(VIEW_ID);
    result.current.modelApi.getState().actions.set(seedView(), true);
    result.current.sceneApi
      .getState()
      .actions.set({ connectors: {}, textBoxes: {} }, true);
    result.current.modelApi.getState().actions.clearHistory();
    result.current.sceneApi.getState().actions.clearHistory();
  });
  return result;
}

const viewById = (result: ReturnType<typeof setup>, id = VIEW_ID) =>
  result.current.modelApi.getState().views.find((v) => v.id === id)!;

describe('SCN-07 — batch updaters enforce the drag-only contract', () => {
  it('outside a drag bracket the call is a warned no-op: no move, no history', () => {
    const result = setup();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    act(() => {
      result.current.scene.batchUpdateViewItemTiles([
        { id: 'node-A', tile: { x: 9, y: 9 } }
      ]);
    });

    expect(
      viewById(result).items.find((i) => i.id === 'node-A')!.tile
    ).toEqual({ x: 0, y: 0 });
    expect(result.current.modelApi.getState().history.past.length).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('drag-only')
    );
    warn.mockRestore();
  });

  it('inside a bracket the fast path still lands the move as one entry', () => {
    const result = setup();
    act(() => {
      result.current.scene.beginDragTransaction();
      result.current.scene.batchUpdateViewItemTiles([
        { id: 'node-A', tile: { x: 9, y: 9 } }
      ]);
      result.current.scene.commitDragTransaction();
    });
    expect(
      viewById(result).items.find((i) => i.id === 'node-A')!.tile
    ).toEqual({ x: 9, y: 9 });
    expect(result.current.modelApi.getState().history.past.length).toBe(1);
  });
});

describe('SCN-09 — reads and writes resolve the same fallback view', () => {
  it('with a dangling ui.view an edit lands on the view the canvas renders', () => {
    const result = setup();

    // The dangling state: ui.view names a view the model does not have.
    act(() => {
      result.current.uiStateApi.getState().actions.setView('view-that-is-gone');
    });

    // The read facade falls back to views[0]…
    expect(result.current.data.currentView.id).toBe(VIEW_ID);

    // …and the write facade must hit the same page.
    act(() => {
      result.current.scene.createLabel({
        id: 'lbl-1',
        tile: { x: 1, y: 1 },
        text: 'a'
      });
    });
    expect(viewById(result).labels ?? []).toHaveLength(1);
  });
});

describe('SCN-11 — a dead ITEM ref never discards a multi-delete', () => {
  it('the stale ref is skipped and the live item is deleted', () => {
    const result = setup();

    act(() => {
      result.current.scene.deleteSelectedItems([
        { type: 'ITEM', id: 'already-deleted' },
        { type: 'ITEM', id: 'node-A' }
      ]);
    });

    expect(viewById(result).items.map((i) => i.id)).toEqual(['node-B']);
  });
});

describe('SCN-15 — routing batches die with their page', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const flushFrames = (rounds = 10) => {
    for (let i = 0; i < rounds; i += 1) {
      act(() => {
        jest.advanceTimersByTime(20);
      });
    }
  };

  const bigPayload = (count: number): PastePayload =>
    ({
      items: Array.from({ length: count + 1 }, (_, i) => ({
        modelItem: { id: `p-item-${i}`, name: `P${i}`, icon: 'block' },
        viewItem: { id: `p-item-${i}`, tile: { x: 10 + (i % 8), y: 10 + Math.floor(i / 8) } }
      })),
      connectors: Array.from({ length: count }, (_, i) => ({
        id: `p-conn-${i}`,
        color: 'c1',
        anchors: [
          { id: `p-conn-${i}-a1`, ref: { item: `p-item-${i}` } },
          { id: `p-conn-${i}-a2`, ref: { item: `p-item-${i + 1}` } }
        ]
      })),
      rectangles: [],
      textBoxes: [],
      labels: [],
      centroid: { x: 10, y: 10 }
    }) as unknown as PastePayload;

  it('a page switch mid-routing leaves no stale connector paths behind', () => {
    const result = setup();

    act(() => {
      result.current.scene.createView({ name: 'Page 2' });
    });
    const page2Id = result.current.uiStateApi.getState().view!;
    act(() => {
      result.current.scene.switchView(VIEW_ID);
    });

    // >25 connectors = more than one rAF batch.
    act(() => {
      result.current.scene.pasteItems(bigPayload(31));
    });
    act(() => {
      jest.advanceTimersByTime(20); // batch 1 routes 25 and re-schedules
    });

    act(() => {
      result.current.scene.switchView(page2Id);
    });
    flushFrames();

    // Page 2 owns no connectors, so its scene holds none.
    expect(viewById(result, page2Id).connectors ?? []).toHaveLength(0);
    expect(
      Object.keys(result.current.sceneApi.getState().connectors)
    ).toEqual([]);
  });
});
