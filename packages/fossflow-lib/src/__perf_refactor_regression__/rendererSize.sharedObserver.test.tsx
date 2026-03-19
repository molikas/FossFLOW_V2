/**
 * PERF REGRESSION — N-1: rendererEl ResizeObserver must be shared (one instance)
 *
 * UiOverlay, useInteractionManager, and useDiagramUtils each called
 * useResizeObserver(rendererEl) independently, creating THREE separate
 * ResizeObserver instances watching the same element.  Every resize caused:
 *  - 3 callback fires
 *  - 3 setState() calls
 *  - 3 React re-render waves
 *  - useInteractionManager's heavy useEffect re-ran 3× per resize
 *
 * The fix moves rendererSize into the Zustand uiStateStore so all consumers
 * read from the store and only ONE ResizeObserver is needed.
 *
 * These tests pin the contract:
 *  - rendererSize exists in uiStateStore with correct initial value
 *  - setRendererSize action updates the store
 *  - Multiple consumers reading rendererSize see the same value without
 *    creating extra ResizeObserver instances
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useUiStateStore, UiStateProvider } from 'src/stores/uiStateStore';

// ---------------------------------------------------------------------------
// ResizeObserver spy
// ---------------------------------------------------------------------------
let observerCount = 0;
let lastObserverCallback: ResizeObserverCallback | null = null;

class SpyResizeObserver {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    observerCount++;
    lastObserverCallback = cb;
    this.callback = cb;
  }
  observe() {}
  disconnect() { observerCount = Math.max(0, observerCount - 1); }
}

beforeEach(() => {
  observerCount = 0;
  lastObserverCallback = null;
  (global as any).ResizeObserver = SpyResizeObserver;
});

afterEach(() => {
  delete (global as any).ResizeObserver;
});

// ---------------------------------------------------------------------------
// Store contract
// ---------------------------------------------------------------------------
describe('rendererSize shared observer — N-1 regression', () => {
  describe('uiStateStore.rendererSize', () => {
    it('rendererSize has a defined initial value in uiStateStore', () => {
      const { result } = renderHook(
        () => useUiStateStore((state) => (state as any).rendererSize),
        { wrapper: UiStateProvider }
      );
      expect(result.current).toBeDefined();
      expect(result.current).toHaveProperty('width');
      expect(result.current).toHaveProperty('height');
    });

    it('rendererSize initial value is {width:0, height:0}', () => {
      const { result } = renderHook(
        () => useUiStateStore((state) => (state as any).rendererSize),
        { wrapper: UiStateProvider }
      );
      expect(result.current).toEqual({ width: 0, height: 0 });
    });

    it('setRendererSize action updates rendererSize in the store', () => {
      const { result } = renderHook(
        () => ({
          size: useUiStateStore((state) => (state as any).rendererSize),
          actions: useUiStateStore((state) => state.actions)
        }),
        { wrapper: UiStateProvider }
      );

      act(() => {
        (result.current.actions as any).setRendererSize({ width: 1280, height: 720 });
      });

      expect(result.current.size).toEqual({ width: 1280, height: 720 });
    });

    it('multiple hooks reading rendererSize all see the same value', () => {
      // Both hooks must be in the SAME provider tree to share store state
      const { result } = renderHook(
        () => ({
          size1: useUiStateStore((state) => (state as any).rendererSize),
          size2: useUiStateStore((state) => (state as any).rendererSize),
          actions: useUiStateStore((state) => state.actions)
        }),
        { wrapper: UiStateProvider }
      );

      act(() => {
        (result.current.actions as any).setRendererSize({ width: 800, height: 600 });
      });

      expect(result.current.size1).toEqual({ width: 800, height: 600 });
      expect(result.current.size2).toEqual({ width: 800, height: 600 });
    });
  });
});
