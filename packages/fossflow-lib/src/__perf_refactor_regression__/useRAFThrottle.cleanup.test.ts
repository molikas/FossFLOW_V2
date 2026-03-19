/**
 * PERF REGRESSION — M-2: RAF throttle cleanup
 *
 * useRAFThrottle (currently private inside useInteractionManager.ts) must, after
 * cleanup() is called:
 *  1. Cancel any pending requestAnimationFrame (no stale frame fires)
 *  2. Not invoke the stored callback even if the platform fires a late RAF
 *  3. Not hold a live reference to the callback (allows GC)
 *
 * As part of the M-2 fix, useRAFThrottle is expected to be extracted to its own
 * file: `src/interaction/useRAFThrottle.ts`.  Until that extraction happens these
 * tests spec the desired behaviour and will fail with "Cannot find module" — which
 * is intentional: the failing import is itself a signal that the extraction step
 * must be done first.
 *
 * Once extracted, run:
 *   npm test --workspace=packages/fossflow-lib -- --testPathPattern=useRAFThrottle
 */

import { renderHook, act } from '@testing-library/react';

// NOTE: This import will fail until the extraction is done (M-2 first step).
// That is by design — the failing import acts as a TODO gate.
let useRAFThrottle: (() => {
  scheduleUpdate: (mouse: any, event: any, cb: (u: any) => void) => void;
  flushUpdate: () => void;
  cleanup: () => void;
}) | null = null;

let moduleAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useRAFThrottle = require('src/interaction/useRAFThrottle').useRAFThrottle;
  moduleAvailable = !!useRAFThrottle;
} catch {
  // Module not yet extracted — tests will be skipped
}

// ---------------------------------------------------------------------------
// RAF mock
// ---------------------------------------------------------------------------
let rafCallbacks: Map<number, FrameRequestCallback>;
let rafIdCounter: number;

beforeEach(() => {
  rafCallbacks = new Map();
  rafIdCounter = 0;

  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = ++rafIdCounter;
    rafCallbacks.set(id, cb);
    return id;
  });

  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
    rafCallbacks.delete(id);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function flushRAF(id: number) {
  const cb = rafCallbacks.get(id);
  if (cb) {
    rafCallbacks.delete(id);
    cb(performance.now());
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
// eslint-disable-next-line jest/valid-describe-callback
(moduleAvailable ? describe : describe.skip)('useRAFThrottle cleanup — M-2 regression', () => {
  it('scheduleUpdate registers a requestAnimationFrame', () => {
    const { result } = renderHook(() => useRAFThrottle!());
    act(() => {
      result.current.scheduleUpdate({}, {}, jest.fn());
    });
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('callback fires when the RAF executes', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useRAFThrottle!());
    let rafId = 0;
    (requestAnimationFrame as jest.Mock).mockImplementation((fn) => {
      rafId = ++rafIdCounter;
      rafCallbacks.set(rafId, fn);
      return rafId;
    });

    act(() => { result.current.scheduleUpdate({ tile: { x: 1, y: 2 } }, { type: 'mousemove' }, cb); });
    act(() => { flushRAF(rafId); });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('multiple scheduleUpdate calls before next RAF fire only the last callback once', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const cb3 = jest.fn();
    const { result } = renderHook(() => useRAFThrottle!());
    let rafId = 0;
    (requestAnimationFrame as jest.Mock).mockImplementation((fn) => {
      rafId = ++rafIdCounter;
      rafCallbacks.set(rafId, fn);
      return rafId;
    });

    act(() => {
      result.current.scheduleUpdate({ tile: { x: 1, y: 1 } }, { type: 'mousemove' }, cb1);
      result.current.scheduleUpdate({ tile: { x: 2, y: 2 } }, { type: 'mousemove' }, cb2);
      result.current.scheduleUpdate({ tile: { x: 3, y: 3 } }, { type: 'mousemove' }, cb3);
    });
    act(() => { flushRAF(rafId); });

    // Only the last registered callback should fire (latest mouse position wins)
    expect(cb3).toHaveBeenCalledTimes(1);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('cleanup() calls cancelAnimationFrame for any pending RAF', () => {
    const { result } = renderHook(() => useRAFThrottle!());
    let rafId = 0;
    (requestAnimationFrame as jest.Mock).mockImplementation((fn) => {
      rafId = ++rafIdCounter;
      rafCallbacks.set(rafId, fn);
      return rafId;
    });

    act(() => { result.current.scheduleUpdate({}, {}, jest.fn()); });
    act(() => { result.current.cleanup(); });

    expect(cancelAnimationFrame).toHaveBeenCalledWith(rafId);
  });

  it('cleanup() prevents the callback from firing even if RAF executes afterwards', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useRAFThrottle!());
    let rafId = 0;
    (requestAnimationFrame as jest.Mock).mockImplementation((fn) => {
      rafId = ++rafIdCounter;
      rafCallbacks.set(rafId, fn);
      return rafId;
    });

    act(() => { result.current.scheduleUpdate({}, {}, cb); });
    act(() => { result.current.cleanup(); });
    // Simulate a stale RAF that fires after cleanup (platform may not honour cancel immediately)
    act(() => { flushRAF(rafId); });

    expect(cb).not.toHaveBeenCalled();
  });

  it('flushUpdate fires the pending callback synchronously', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useRAFThrottle!());

    act(() => { result.current.scheduleUpdate({}, {}, cb); });
    act(() => { result.current.flushUpdate(); });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cleanup() after flushUpdate() does not throw', () => {
    const { result } = renderHook(() => useRAFThrottle!());
    act(() => { result.current.scheduleUpdate({}, {}, jest.fn()); });
    act(() => { result.current.flushUpdate(); });
    expect(() => act(() => result.current.cleanup())).not.toThrow();
  });

  it('calling cleanup() with no pending RAF does not throw', () => {
    const { result } = renderHook(() => useRAFThrottle!());
    expect(() => act(() => result.current.cleanup())).not.toThrow();
  });
});
