/**
 * E4 probes — session-state lifecycle.
 *
 *  CLIP-04  useDirtyTracker never unsubscribes on an isReady toggle
 *  CLIP-05  the dirty flag is not reset when a new diagram loads
 *  CLIP-06  the 100 ms subscribe delay swallows a fast first edit
 *  CLIP-07  the clipboard aliases unfrozen store state written by batchUpdate*
 *  CLIP-08  a preserveViewport load leaves the previous diagram's selection
 *  CLIP-09  deleteLayer leaves the layer id in previewLayerOverrides
 *
 * See docs/reviews/exploratory-2026-07/areas/E4-clipboard-schemas-load.md.
 */
import { renderHook } from '@testing-library/react';
import { installCanvasStub } from '../canvasStub';
import {
  Providers,
  useTestHarness,
  setup,
  act,
  modelView,
  VIEW_ID
} from '../E3/harness';
import { useDirtyTracker } from 'src/hooks/useDirtyTracker';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';

installCanvasStub();

// ---------------------------------------------------------------------------
// CLIP-04 / CLIP-05 / CLIP-06 — useDirtyTracker
// ---------------------------------------------------------------------------
describe('useDirtyTracker lifecycle', () => {
  const useTracker = (isReady: boolean) => ({
    tracker: useDirtyTracker(isReady),
    modelApi: useModelStoreApi(),
    uiApi: useUiStateStoreApi()
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it.failing(
    'CLIP-06 BUG: an edit inside the 100 ms subscribe delay is never tracked',
    () => {
      const { result } = renderHook(({ ready }) => useTracker(ready), {
        wrapper: Providers,
        initialProps: { ready: true }
      });

      // A fast user (or a paste that lands immediately after boot).
      act(() => {
        result.current.modelApi.getState().actions.set({ title: 'edited' });
      });
      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(result.current.uiApi.getState().isDirty).toBe(true);
    }
  );

  it('CLIP-06 characterization: the same edit AFTER the delay is tracked', () => {
    const { result } = renderHook(({ ready }) => useTracker(ready), {
      wrapper: Providers,
      initialProps: { ready: true }
    });

    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => {
      result.current.modelApi.getState().actions.set({ title: 'edited' });
    });

    expect(result.current.uiApi.getState().isDirty).toBe(true);
  });

  it('CLIP-04 characterization: the effect cleanup clears the timer but never unsubscribes', () => {
    const { result, rerender } = renderHook(({ ready }) => useTracker(ready), {
      wrapper: Providers,
      initialProps: { ready: true }
    });

    const subscribeSpy = jest.spyOn(result.current.modelApi, 'subscribe');
    const unsubscribes: jest.Mock[] = [];
    subscribeSpy.mockImplementation(((listener: never) => {
      const real = jest
        .requireActual('zustand')
        .createStore as unknown as never;
      void real;
      void listener;
      const unsub = jest.fn();
      unsubscribes.push(unsub);
      return unsub;
    }) as never);

    rerender({ ready: false });
    rerender({ ready: true });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    rerender({ ready: false });
    rerender({ ready: true });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Two subscriptions were created and NONE was released — the effect's
    // cleanup only does clearTimeout(timer).
    expect(unsubscribes.length).toBe(2);
    expect(unsubscribes.filter((u) => u.mock.calls.length > 0)).toHaveLength(0);

    subscribeSpy.mockRestore();
  });

  it.failing(
    'CLIP-05 BUG: opening a second diagram after editing the first starts clean',
    () => {
      const { result, rerender } = renderHook(({ ready }) => useTracker(ready), {
        wrapper: Providers,
        initialProps: { ready: true }
      });
      act(() => {
        jest.advanceTimersByTime(200);
      });
      act(() => {
        result.current.modelApi.getState().actions.set({ title: 'edited' });
      });
      expect(result.current.uiApi.getState().isDirty).toBe(true);

      // Open another diagram: isReady cycles, the model is replaced.
      rerender({ ready: false });
      act(() => {
        result.current.uiApi.getState().actions.setIsDirty(false);
      });
      rerender({ ready: true });
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // A freshly-opened, untouched diagram must not be dirty — and the
      // tracker's own `isDirtyRef` must agree, or the first real edit will be
      // swallowed (the ref short-circuits `setIsDirty`).
      act(() => {
        result.current.modelApi.getState().actions.set({ title: 'second edit' });
      });
      expect(result.current.uiApi.getState().isDirty).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// CLIP-07 — clipboard aliasing against unfrozen store state
// ---------------------------------------------------------------------------
describe('CLIP-07 — batchUpdate* writes unfrozen objects into the store', () => {
  it('FALSIFIED: state written by the drag fast path is frozen like everything else', () => {
      const result = setup();

      act(() => {
        result.current.scene.beginDragTransaction();
        result.current.scene.batchUpdateViewItemTiles([
          { id: 'node-A', tile: { x: 3, y: 3 } }
        ]);
        result.current.scene.commitDragTransaction();
      });

      const item = modelView(result).items.find((i) => i.id === 'node-A')!;

      // Store state must be frozen — the property the clipboard's
      // live-reference design depends on. The batch updaters build plain
      // objects, but they still hand them to `modelStore.actions.set`, whose
      // `produceWithPatches` freezes the result before it lands.
      expect(Object.isFrozen(item)).toBe(true);
  });

  it('characterization: BOTH write paths land frozen, so the clipboard cannot be aliased', () => {
    const result = setup();

    act(() => {
      result.current.scene.updateViewItem('node-B', { tile: { x: 7, y: 7 } });
    });
    const viaReducer = modelView(result).items.find((i) => i.id === 'node-B')!;
    expect(Object.isFrozen(viaReducer)).toBe(true);

    act(() => {
      result.current.scene.beginDragTransaction();
      result.current.scene.batchUpdateViewItemTiles([
        { id: 'node-A', tile: { x: 3, y: 3 } }
      ]);
      result.current.scene.commitDragTransaction();
    });
    const viaBatch = modelView(result).items.find((i) => i.id === 'node-A')!;
    expect(Object.isFrozen(viaBatch)).toBe(true);

    // A holder of that reference (the clipboard) therefore cannot be mutated
    // out from under itself — the write throws in strict mode rather than
    // silently changing the copied payload.
    expect(() => {
      (viaBatch as { tile: { x: number; y: number } }).tile = { x: 99, y: 99 };
    }).toThrow();
    expect(
      modelView(result).items.find((i) => i.id === 'node-A')!.tile
    ).toEqual({ x: 3, y: 3 });
  });
});

// ---------------------------------------------------------------------------
// CLIP-08 / CLIP-09 — ui-state that no one resets
// ---------------------------------------------------------------------------
describe('CLIP-08 / CLIP-09 — stale ui-state after model changes', () => {
  it.failing(
    'CLIP-09 BUG: deleting a layer leaves its id in previewLayerOverrides',
    () => {
      const { result } = renderHook(useTestHarness, { wrapper: Providers });
      act(() => {
        result.current.uiStateApi.getState().actions.setView(VIEW_ID);
      });

      act(() => {
        result.current.layers.createLayer({ name: 'Layer 1' });
      });
      const layerId = result.current.modelApi
        .getState()
        .views.find((v) => v.id === VIEW_ID)!.layers![0].id;

      act(() => {
        result.current.uiStateApi
          .getState()
          .actions.setPreviewSoloLayer(layerId);
      });
      expect(
        result.current.uiStateApi.getState().previewLayerOverrides.soloLayerId
      ).toBe(layerId);

      act(() => {
        result.current.layers.deleteLayer(layerId);
      });

      // A solo pointing at a layer that no longer exists hides EVERYTHING —
      // `isEntityVisibleInPreview` only shows entities on the solo'd layer.
      expect(
        result.current.uiStateApi.getState().previewLayerOverrides.soloLayerId
      ).toBeNull();
    }
  );
});
