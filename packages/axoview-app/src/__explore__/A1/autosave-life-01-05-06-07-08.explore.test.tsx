/**
 * A1 — useAutoSave hook probes (LIFE-01, 05, 06, 07, 08).
 *
 * `useAutoSave` has zero unit tests (coverage-baseline: "App utils, runtime
 * config & shell components/dialogs" → useAutoSave.ts zero tests) and it is on
 * the hot path in BOTH modes: `handleModelUpdated` calls `scheduleSave` for the
 * remote branch AND for the session branch whenever a diagram is open.
 *
 * Rig rules honoured here (COLDSTART "Rig traps"):
 *  - every `it.failing` is paired with a passing characterization test that
 *    positively asserts the observed end state;
 *  - every probe asserts its PRECONDITION (the save actually ran / the timer
 *    was actually armed) before drawing a conclusion.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutoSave } from '../../hooks/useAutoSave';
import type { StorageProvider } from '../../services/storage/types';
import type { DiagramData } from '../../diagramUtils';

const DEBOUNCE_MS = 2000;

const MODEL = (title: string): DiagramData =>
  ({ title, icons: [], colors: [], items: [], views: [], fitToScreen: true }) as DiagramData;

interface Recorder {
  storage: StorageProvider;
  calls: Array<{ id: string; title: string }>;
  /** Resolve/reject the Nth in-flight saveDiagram by hand. */
  settle: Array<{ resolve: () => void; reject: (e: Error) => void }>;
}

/** Storage double whose `saveDiagram` never settles until the test says so. */
function makeManualStorage(): Recorder {
  const calls: Recorder['calls'] = [];
  const settle: Recorder['settle'] = [];
  const storage = {
    saveDiagram: (id: string, model: unknown) => {
      calls.push({ id, title: (model as DiagramData).title as string });
      return new Promise<void>((resolve, reject) => {
        settle.push({ resolve: () => resolve(), reject });
      });
    }
  } as unknown as StorageProvider;
  return { storage, calls, settle };
}

/** Storage double that resolves immediately. */
function makeOkStorage() {
  const calls: Array<{ id: string; title: string }> = [];
  const storage = {
    saveDiagram: async (id: string, model: unknown) => {
      calls.push({ id, title: (model as DiagramData).title as string });
    }
  } as unknown as StorageProvider;
  return { storage, calls };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// LIFE-01 — a failed auto-save discards the pending model.
// `executeSave` sets `pendingRef.current = null` BEFORE awaiting the write, so
// once the write rejects there is nothing left to retry: `saveNow()` returns
// immediately and the edit only survives if the user edits again.
// ---------------------------------------------------------------------------
describe('LIFE-01 — a failed auto-save drops the pending model', () => {
  it('characterization: after a rejected save, saveNow() performs no write at all', async () => {
    const rec = makeManualStorage();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useAutoSave({ storage: rec.storage, enabled: true, onError })
    );

    act(() => result.current.scheduleSave('d1', MODEL('edit-1')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });

    // PRECONDITION: the debounced write actually fired.
    expect(rec.calls).toEqual([{ id: 'd1', title: 'edit-1' }]);

    await act(async () => {
      rec.settle[0].reject(new Error('network down'));
      await Promise.resolve();
    });
    // PRECONDITION: the failure was observed by the hook.
    await waitFor(() => expect(result.current.saveStatus).toBe('error'));
    expect(onError).toHaveBeenCalledTimes(1);

    // The observed end state: flushing does nothing — no second write.
    await act(async () => { await result.current.saveNow(); });
    expect(rec.calls).toHaveLength(1);
    expect(result.current.saveStatus).toBe('error');
  });

  it.failing('LIFE-01: a flush after a failed save re-attempts the write', async () => {
    const rec = makeManualStorage();
    const { result } = renderHook(() =>
      useAutoSave({ storage: rec.storage, enabled: true, onError: () => {} })
    );

    act(() => result.current.scheduleSave('d1', MODEL('edit-1')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    expect(rec.calls).toHaveLength(1); // precondition

    await act(async () => {
      rec.settle[0].reject(new Error('network down'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.saveStatus).toBe('error'));

    await act(async () => { await result.current.saveNow(); });
    // Expected: the unsaved model is retried. Actual: pendingRef was nulled
    // before the failed write, so there is nothing left to send.
    expect(rec.calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// LIFE-05 — a pending debounced save is dropped on unmount.
// ---------------------------------------------------------------------------
describe('LIFE-05 — unmount drops the pending debounced save', () => {
  it('characterization: unmounting inside the debounce window writes nothing, ever', () => {
    const { storage, calls } = makeOkStorage();
    const { result, unmount } = renderHook(() =>
      useAutoSave({ storage, enabled: true })
    );

    act(() => result.current.scheduleSave('d1', MODEL('unflushed')));
    // PRECONDITION: a timer is armed and nothing has been written yet.
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);

    unmount();
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS * 5); });
    expect(calls).toHaveLength(0);
  });

  it.failing('LIFE-05: unmount flushes the pending save', () => {
    const { storage, calls } = makeOkStorage();
    const { result, unmount } = renderHook(() =>
      useAutoSave({ storage, enabled: true })
    );
    act(() => result.current.scheduleSave('d1', MODEL('unflushed')));
    expect(jest.getTimerCount()).toBeGreaterThan(0); // precondition
    unmount();
    // Expected: the last 2 s of edits survive teardown. Actual: the cleanup
    // clears the timer and never calls executeSave.
    expect(calls).toEqual([{ id: 'd1', title: 'unflushed' }]);
  });
});

// ---------------------------------------------------------------------------
// LIFE-06 — saveNow() does not await a save already in flight.
// Callers (`handleGoogleSignedOut` before revoking the token,
// `openDiagramById` before swapping the active place) treat its resolution as
// "the old place is flushed".
// ---------------------------------------------------------------------------
describe('LIFE-06 — saveNow() resolves while a write is still in flight', () => {
  it('characterization: saveNow() resolves before the in-flight write settles', async () => {
    const rec = makeManualStorage();
    const onSaved = jest.fn();
    const { result } = renderHook(() =>
      useAutoSave({ storage: rec.storage, enabled: true, onSaved })
    );

    act(() => result.current.scheduleSave('d1', MODEL('in-flight')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    // PRECONDITION: the write started and has NOT settled.
    expect(rec.calls).toHaveLength(1);
    expect(onSaved).not.toHaveBeenCalled();

    let flushed = false;
    await act(async () => {
      await result.current.saveNow();
      flushed = true;
    });
    // saveNow() came back...
    expect(flushed).toBe(true);
    // ...while the write is still outstanding.
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('saving');
  });

  it.failing('LIFE-06: saveNow() awaits the in-flight write before resolving', async () => {
    const rec = makeManualStorage();
    const onSaved = jest.fn();
    const { result } = renderHook(() =>
      useAutoSave({ storage: rec.storage, enabled: true, onSaved })
    );
    act(() => result.current.scheduleSave('d1', MODEL('in-flight')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    expect(rec.calls).toHaveLength(1); // precondition

    await act(async () => { await result.current.saveNow(); });
    // Expected: "flushed" means the bytes landed. Actual: pendingRef was
    // already null, so saveNow() short-circuits past the live promise.
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// LIFE-07 — flipping `enabled` to false does not disarm an armed timer.
// ---------------------------------------------------------------------------
describe('LIFE-07 — disabling autosave leaves an armed timer live', () => {
  it('characterization: a save armed while enabled still lands after enabled goes false', () => {
    const { storage, calls } = makeOkStorage();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAutoSave({ storage, enabled }),
      { initialProps: { enabled: true } }
    );

    act(() => result.current.scheduleSave('d1', MODEL('armed')));
    expect(jest.getTimerCount()).toBeGreaterThan(0); // precondition

    rerender({ enabled: false });
    // PRECONDITION: the hook really is disabled now — a NEW schedule is ignored.
    act(() => result.current.scheduleSave('d1', MODEL('ignored')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });

    expect(calls).toEqual([{ id: 'd1', title: 'armed' }]);
  });

  it.failing('LIFE-07: disabling autosave cancels the armed save', () => {
    const { storage, calls } = makeOkStorage();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAutoSave({ storage, enabled }),
      { initialProps: { enabled: true } }
    );
    act(() => result.current.scheduleSave('d1', MODEL('armed')));
    expect(jest.getTimerCount()).toBeGreaterThan(0); // precondition
    rerender({ enabled: false });
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    // Expected: `enabled:false` means no writes. Actual: only scheduleSave
    // checks the flag; the already-armed timeout is never cleared.
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// LIFE-08 — overlapping saves report out of order.
// ---------------------------------------------------------------------------
describe('LIFE-08 — an older save resolving last reports "saved" over a live write', () => {
  it('characterization: status flips to idle while the newer write is outstanding', async () => {
    const rec = makeManualStorage();
    const { result } = renderHook(() =>
      useAutoSave({ storage: rec.storage, enabled: true })
    );

    act(() => result.current.scheduleSave('d1', MODEL('v1')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    act(() => result.current.scheduleSave('d1', MODEL('v2')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });

    // PRECONDITION: two writes are genuinely in flight, newest last.
    expect(rec.calls.map((c) => c.title)).toEqual(['v1', 'v2']);
    expect(rec.settle).toHaveLength(2);

    // The OLDER one settles last — the ordering the network does not guarantee.
    await act(async () => {
      rec.settle[0].resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.saveStatus).toBe('idle'));
    // v2 has still not landed, yet the hook reports a clean, saved state —
    // which is exactly what the beforeunload guard reads.
    expect(result.current.lastSaved).not.toBeNull();
  });

  it.failing('LIFE-08: status stays "saving" until the newest write settles', async () => {
    const rec = makeManualStorage();
    const { result } = renderHook(() =>
      useAutoSave({ storage: rec.storage, enabled: true })
    );
    act(() => result.current.scheduleSave('d1', MODEL('v1')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    act(() => result.current.scheduleSave('d1', MODEL('v2')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    expect(rec.settle).toHaveLength(2); // precondition

    await act(async () => {
      rec.settle[0].resolve();
      await Promise.resolve();
    });
    // Expected: one write outstanding ⇒ still saving. Actual: the first
    // resolution unconditionally writes 'idle' + lastSaved.
    await waitFor(() => expect(result.current.saveStatus).toBe('saving'));
  });
});
