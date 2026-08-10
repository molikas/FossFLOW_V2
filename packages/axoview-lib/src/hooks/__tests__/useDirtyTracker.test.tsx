/**
 * useDirtyTracker lifecycle — the save indicator's source of truth.
 *
 * - E4/CLIP-06: an edit is tracked IMMEDIATELY after isReady — the old 100 ms
 *   subscribe defer swallowed a fast first edit, and the beforeunload guard
 *   then let the tab close on unsaved work.
 * - E4/CLIP-05: a new load starts clean — the previous diagram's dirty state
 *   must not leak (the ref short-circuits, so a stale `true` swallowed the
 *   next diagram's first edit).
 * - E4/CLIP-04: the model-store subscription is released on every isReady
 *   toggle — one diagram open used to leak one listener for the life of the
 *   provider.
 *
 * Promoted from the retired exploratory lane (mop-up wave, 2026-08-10).
 * known_issues: "`useDirtyTracker` leaks a subscription per diagram open, and
 * the dirty flag is never reset".
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useDirtyTracker } from 'src/hooks/useDirtyTracker';

const Providers = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <SceneProvider>
      <UiStateProvider>{children}</UiStateProvider>
    </SceneProvider>
  </ModelProvider>
);

const useTracker = (isReady: boolean) => ({
  tracker: useDirtyTracker(isReady),
  modelApi: useModelStoreApi(),
  uiApi: useUiStateStoreApi()
});

describe('useDirtyTracker', () => {
  it('CLIP-06: an edit immediately after isReady is tracked', () => {
    const { result } = renderHook(({ ready }) => useTracker(ready), {
      wrapper: Providers,
      initialProps: { ready: true }
    });

    act(() => {
      result.current.modelApi.getState().actions.set({ title: 'edited' });
    });

    expect(result.current.uiApi.getState().isDirty).toBe(true);
  });

  it('CLIP-05: a diagram opened after a dirty one starts clean and tracks its own first edit', () => {
    const { result, rerender } = renderHook(({ ready }) => useTracker(ready), {
      wrapper: Providers,
      initialProps: { ready: true }
    });

    act(() => {
      result.current.modelApi.getState().actions.set({ title: 'edited' });
    });
    expect(result.current.uiApi.getState().isDirty).toBe(true);

    // Open another diagram: isReady cycles and the model is replaced.
    rerender({ ready: false });
    rerender({ ready: true });

    // Fresh and untouched — the tracker reset both the store flag and its ref.
    expect(result.current.uiApi.getState().isDirty).toBe(false);

    act(() => {
      result.current.modelApi.getState().actions.set({ title: 'second edit' });
    });
    expect(result.current.uiApi.getState().isDirty).toBe(true);
  });

  it('CLIP-04: every isReady cycle releases its subscription', () => {
    const { result, rerender } = renderHook(({ ready }) => useTracker(ready), {
      wrapper: Providers,
      initialProps: { ready: false }
    });

    const unsubscribes: jest.Mock[] = [];
    const subscribeSpy = jest
      .spyOn(result.current.modelApi, 'subscribe')
      .mockImplementation((() => {
        const unsub = jest.fn();
        unsubscribes.push(unsub);
        return unsub;
      }) as never);

    rerender({ ready: true });
    rerender({ ready: false });
    rerender({ ready: true });
    rerender({ ready: false });

    expect(unsubscribes.length).toBe(2);
    expect(unsubscribes.every((u) => u.mock.calls.length === 1)).toBe(true);

    subscribeSpy.mockRestore();
  });

  it('markClean clears both the store flag and the internal ref', () => {
    const { result } = renderHook(({ ready }) => useTracker(ready), {
      wrapper: Providers,
      initialProps: { ready: true }
    });

    act(() => {
      result.current.modelApi.getState().actions.set({ title: 'edited' });
    });
    expect(result.current.uiApi.getState().isDirty).toBe(true);

    act(() => {
      result.current.tracker.markClean();
    });
    expect(result.current.uiApi.getState().isDirty).toBe(false);

    // …and the next edit re-raises it (the ref agreed with the store).
    act(() => {
      result.current.modelApi.getState().actions.set({ title: 'again' });
    });
    expect(result.current.uiApi.getState().isDirty).toBe(true);
  });
});
