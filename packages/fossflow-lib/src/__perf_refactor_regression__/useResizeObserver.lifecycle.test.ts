/**
 * PERF REGRESSION — H-2: useResizeObserver lifecycle
 *
 * The H-2 fix adds debouncing to the ResizeObserver callback and deduplicates
 * the renderer-size observation.  The observable contract that must not change:
 *  - size is {0,0} before an element is observed
 *  - disconnect() is called before re-observing a new element (no leaked observers)
 *  - disconnect() is called on unmount (no leaked observers after component removal)
 *  - setState is NOT called after the hook has been unmounted
 *  - a single resize event always produces a state update (debounce must not suppress it)
 */

import { renderHook, act } from '@testing-library/react';
import { useResizeObserver } from 'src/hooks/useResizeObserver';

// ---------------------------------------------------------------------------
// ResizeObserver mock
// ---------------------------------------------------------------------------
type ROCallback = (entries: ResizeObserverEntry[]) => void;

class MockResizeObserver {
  callback: ROCallback;
  observedElements: HTMLElement[] = [];
  static instances: MockResizeObserver[] = [];

  constructor(cb: ROCallback) {
    this.callback = cb;
    MockResizeObserver.instances.push(this);
  }

  observe(el: Element) {
    this.observedElements.push(el as HTMLElement);
  }

  disconnect() {
    this.observedElements = [];
  }

  // Test helper — trigger the callback as if a resize occurred.
  // The real hook reads element.clientWidth / clientHeight, so we set those
  // on every currently-observed element before invoking the callback.
  fire(width: number, height: number) {
    this.observedElements.forEach((el) => {
      Object.defineProperty(el, 'clientWidth',  { value: width,  configurable: true });
      Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
    });
    this.callback([
      { contentRect: { width, height } } as unknown as ResizeObserverEntry
    ]);
  }
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  (global as any).ResizeObserver = MockResizeObserver;
});

afterEach(() => {
  delete (global as any).ResizeObserver;
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
describe('useResizeObserver — H-2 regression', () => {
  it('returns {width:0, height:0} before any element is observed', () => {
    const { result } = renderHook(() => useResizeObserver(null));
    expect(result.current.size).toEqual({ width: 0, height: 0 });
  });

  // ---------------------------------------------------------------------------
  // Observer setup
  // ---------------------------------------------------------------------------
  it('creates a ResizeObserver and calls observe() when an element is provided', () => {
    const el = document.createElement('div');
    renderHook(() => useResizeObserver(el));
    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0].observedElements).toContain(el);
  });

  it('calls disconnect() on the previous observer before creating a new one (no leak)', () => {
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    const { rerender } = renderHook(({ el }) => useResizeObserver(el), {
      initialProps: { el: el1 }
    });

    const firstObserver = MockResizeObserver.instances[0];
    expect(firstObserver.observedElements).toContain(el1);

    rerender({ el: el2 });

    // The first observer must have been disconnected
    expect(firstObserver.observedElements).toHaveLength(0);
    // A new observer watches the new element
    const latestObserver = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
    expect(latestObserver.observedElements).toContain(el2);
  });

  // ---------------------------------------------------------------------------
  // Size updates
  // ---------------------------------------------------------------------------
  it('updates size when the ResizeObserver fires', () => {
    const el = document.createElement('div');
    const { result } = renderHook(() => useResizeObserver(el));

    act(() => {
      MockResizeObserver.instances[0].fire(640, 480);
    });

    expect(result.current.size).toEqual({ width: 640, height: 480 });
  });

  it('updates size on subsequent resize events', () => {
    const el = document.createElement('div');
    const { result } = renderHook(() => useResizeObserver(el));

    act(() => { MockResizeObserver.instances[0].fire(640, 480); });
    act(() => { MockResizeObserver.instances[0].fire(1280, 720); });

    expect(result.current.size).toEqual({ width: 1280, height: 720 });
  });

  it('a single resize event always produces a size update (debounce must not suppress it)', () => {
    const el = document.createElement('div');
    const { result } = renderHook(() => useResizeObserver(el));

    act(() => { MockResizeObserver.instances[0].fire(100, 200); });

    expect(result.current.size.width).toBe(100);
    expect(result.current.size.height).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------
  it('calls disconnect() on unmount', () => {
    const el = document.createElement('div');
    const { unmount } = renderHook(() => useResizeObserver(el));

    const observer = MockResizeObserver.instances[0];
    unmount();

    expect(observer.observedElements).toHaveLength(0);
  });

  it('does not update size after unmount (no setState on unmounted hook)', () => {
    const el = document.createElement('div');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useResizeObserver(el));

    const observer = MockResizeObserver.instances[0];
    unmount();

    // Fire after unmount — should not trigger a React setState warning
    act(() => { observer.fire(999, 999); });

    // size should not have changed from its last value before unmount
    expect(result.current.size).toEqual({ width: 0, height: 0 });
    // No React "update on unmounted component" error
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Manual observe / disconnect API
  // ---------------------------------------------------------------------------
  it('expose disconnect() that can be called manually without error', () => {
    const el = document.createElement('div');
    const { result } = renderHook(() => useResizeObserver(el));
    expect(() => act(() => result.current.disconnect())).not.toThrow();
  });

  it('after manual disconnect(), a resize event does not update size', () => {
    const el = document.createElement('div');
    const { result } = renderHook(() => useResizeObserver(el));
    const observer = MockResizeObserver.instances[0];

    act(() => result.current.disconnect());
    act(() => observer.fire(500, 500));

    expect(result.current.size).toEqual({ width: 0, height: 0 });
  });
});
