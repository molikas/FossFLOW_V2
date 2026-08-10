/**
 * pasteItems assembly guards, on real providers.
 *
 * - E3/SCN-06: the single validateView call covers the COMPLETE pasted
 *   content — rectangles, text boxes and labels included. A pasted rectangle
 *   carrying a colour the target model lacks used to land unchecked (the
 *   check ran before those types were layered on) and left a view that
 *   validateView rejects.
 * - E3/SCN-12: pasteItems reports whether the paste committed, and a
 *   rejected paste commits NOTHING (no items, no history entry).
 * - E3/SCN-14: a pasted entity's `layerId` is stripped when the target view
 *   has no such layer — pasting across pages used to plant a dangling layer
 *   ref that visibility/locking silently ignored.
 *
 * Promoted from the retired exploratory lane (mop-up wave, 2026-08-10).
 * known_issues: "Paste validates the view before rectangles, text boxes and
 * labels are added", "An invalid paste is abandoned silently", "Pasting onto
 * another page carries the source page's layer assignment".
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { useLayerActions } from 'src/hooks/useLayerActions';
import { validateView } from 'src/schemas/validation';
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
  layers: useLayerActions(),
  modelApi: useModelStoreApi(),
  sceneApi: useSceneStoreApi(),
  uiStateApi: useUiStateStoreApi()
});

const seedView = () => ({
  version: '1.0',
  title: 'paste guards',
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

const makePayload = (count = 0, prefix = 'p'): PastePayload =>
  ({
    items: Array.from({ length: count }, (_, i) => ({
      modelItem: { id: `${prefix}-item-${i}`, name: `P${i}`, icon: 'block' },
      viewItem: { id: `${prefix}-item-${i}`, tile: { x: 10 + i, y: 10 } }
    })),
    connectors: [],
    rectangles: [],
    textBoxes: [],
    labels: [],
    centroid: { x: 10, y: 10 }
  }) as unknown as PastePayload;

describe('SCN-06 — the paste validates everything it pastes', () => {
  it('a pasted rectangle with a dangling colour ref rejects the whole paste', () => {
    const result = setup();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const payload = makePayload(1);
    (payload as unknown as { rectangles: unknown[] }).rectangles = [
      {
        id: 'rect-1',
        from: { x: 1, y: 1 },
        to: { x: 3, y: 3 },
        color: 'colour-that-does-not-exist'
      }
    ];

    let applied: boolean | undefined;
    act(() => {
      applied = result.current.scene.pasteItems(payload);
    });

    // Atomic: neither the rectangle nor the (valid) item landed…
    expect(applied).toBe(false);
    expect(viewById(result).rectangles ?? []).toHaveLength(0);
    expect(viewById(result).items.map((i) => i.id)).toEqual([
      'node-A',
      'node-B'
    ]);
    // …no history entry burned…
    expect(result.current.modelApi.getState().history.past.length).toBe(0);
    // …and the committed view stays valid.
    expect(
      validateView(viewById(result), {
        model: result.current.modelApi.getState()
      })
    ).toEqual([]);
    warn.mockRestore();
  });

  it('a fully valid payload still pastes and reports true', () => {
    const result = setup();
    let applied: boolean | undefined;
    act(() => {
      applied = result.current.scene.pasteItems(makePayload(2));
    });
    expect(applied).toBe(true);
    expect(viewById(result).items).toHaveLength(4);
  });
});

describe('SCN-14 — layerId does not cross pages', () => {
  it('pasting onto a page without the layer strips the assignment', () => {
    const result = setup();

    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });
    const layerId = viewById(result).layers![0].id;

    act(() => {
      result.current.scene.createView({ name: 'Page 2' });
    });
    const page2Id = result.current.uiStateApi.getState().view!;
    expect(page2Id).not.toBe(VIEW_ID);
    expect(viewById(result, page2Id).layers ?? []).toHaveLength(0);

    const payload = makePayload(1);
    (payload as unknown as { items: { viewItem: { layerId?: string } }[] })
      .items[0].viewItem.layerId = layerId;

    act(() => {
      result.current.scene.pasteItems(payload);
    });

    const pasted = viewById(result, page2Id).items.find(
      (i) => i.id === 'p-item-0'
    )!;
    expect(pasted.layerId).toBeUndefined();
  });

  it('pasting onto the page that HAS the layer keeps the assignment', () => {
    const result = setup();

    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });
    const layerId = viewById(result).layers![0].id;

    const payload = makePayload(1);
    (payload as unknown as { items: { viewItem: { layerId?: string } }[] })
      .items[0].viewItem.layerId = layerId;

    act(() => {
      result.current.scene.pasteItems(payload);
    });

    const pasted = viewById(result).items.find((i) => i.id === 'p-item-0')!;
    expect(pasted.layerId).toBe(layerId);
  });
});
