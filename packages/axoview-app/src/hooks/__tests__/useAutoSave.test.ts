/**
 * `useAutoSave` — the debounced write path in BOTH modes (`handleModelUpdated`
 * schedules through it for the remote branch and for the session branch
 * whenever a diagram is open).
 *
 * Promoted from the 2026-07 exploratory campaign's probe lane
 * (`__explore__/A1/autosave-life-01-05-06-07-08`) with the bugs fixed —
 * A1/LIFE-01, 05, 06, 07, 08 and the flush half of LIFE-09. Each block states
 * the defect it pins.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';
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
// LIFE-01 — a failed write used to discard the model it could not send:
// `executeSave` nulled `pendingRef` before awaiting, so nothing was left to
// retry and the edit survived only if the user edited again.
// ---------------------------------------------------------------------------
describe('a failed save keeps the model it could not write', () => {
  it('retries the unsaved model on the next flush', async () => {
    const rec = makeManualStorage();
    const { result } = renderHook(() =>
      useAutoSave({ storage: rec.storage, enabled: true, onError: () => {} })
    );

    act(() => result.current.scheduleSave('d1', MODEL('edit-1')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    expect(rec.calls).toHaveLength(1); // precondition: the write really fired

    await act(async () => {
      rec.settle[0].reject(new Error('network down'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.saveStatus).toBe('error'));

    // The outage is over: flushing re-sends the model that never landed.
    const flush = act(async () => {
      const outcome = await result.current.saveNow();
      expect(outcome).toBe('saved');
    });
    await act(async () => { rec.settle[1].resolve(); });
    await flush;

    expect(rec.calls).toEqual([
      { id: 'd1', title: 'edit-1' },
      { id: 'd1', title: 'edit-1' }
    ]);
    expect(result.current.saveStatus).toBe('idle');
  });

  it('reports the failure through hasUnsavedWork(), not just through the status', async () => {
    const rec = makeManualStorage();
    const { result } = renderHook(() =>
      useAutoSave({ storage: rec.storage, enabled: true, onError: () => {} })
    );
    act(() => result.current.scheduleSave('d1', MODEL('precious')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    await act(async () => {
      rec.settle[0].reject(new Error('network down'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.saveStatus).toBe('error'));

    expect(result.current.hasUnsavedWork()).toBe(true);
  });

  it('does not resurrect a superseded model over a newer edit', async () => {
    const rec = makeManualStorage();
    const { result } = renderHook(() =>
      useAutoSave({ storage: rec.storage, enabled: true, onError: () => {} })
    );
    act(() => result.current.scheduleSave('d1', MODEL('v1')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    // A newer edit arrives while v1 is on the wire, then v1 fails.
    act(() => result.current.scheduleSave('d1', MODEL('v2')));
    await act(async () => {
      rec.settle[0].reject(new Error('network down'));
      await Promise.resolve();
    });

    const flush = act(async () => { await result.current.saveNow(); });
    await act(async () => { rec.settle[1]?.resolve(); });
    await flush;
    expect(rec.calls.map((c) => c.title)).toEqual(['v1', 'v2']);
  });
});

// ---------------------------------------------------------------------------
// LIFE-05 — the cleanup cleared the debounce timer without flushing, and
// `EditorPage` is the element of every route, so an in-app navigation dropped
// the last two seconds of edits.
// ---------------------------------------------------------------------------
describe('teardown', () => {
  it('flushes the pending save on unmount', () => {
    const { storage, calls } = makeOkStorage();
    const { result, unmount } = renderHook(() => useAutoSave({ storage, enabled: true }));

    act(() => result.current.scheduleSave('d1', MODEL('unflushed')));
    expect(jest.getTimerCount()).toBeGreaterThan(0); // precondition: armed, unwritten
    expect(calls).toHaveLength(0);

    unmount();

    expect(calls).toEqual([{ id: 'd1', title: 'unflushed' }]);
  });

  it('leaves the timer disarmed after unmount (no double write)', () => {
    const { storage, calls } = makeOkStorage();
    const { result, unmount } = renderHook(() => useAutoSave({ storage, enabled: true }));
    act(() => result.current.scheduleSave('d1', MODEL('unflushed')));
    unmount();
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS * 5); });
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LIFE-06 — `saveNow()` short-circuited past a live write, so callers that
// treat its resolution as "the old place is flushed" (`handleGoogleSignedOut`
// before revoking the token, `openDiagramById` before swapping the place)
// raced the write they were waiting for.
// ---------------------------------------------------------------------------
describe('saveNow()', () => {
  it('waits for a write already in flight', async () => {
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
    const pending = act(async () => {
      await result.current.saveNow();
      flushed = true;
    });
    await act(async () => { await Promise.resolve(); });
    expect(flushed).toBe(false); // still waiting on the wire

    await act(async () => { rec.settle[0].resolve(); });
    await pending;

    expect(flushed).toBe(true);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('reports "nothing-pending" when there is nothing to do', async () => {
    const { storage } = makeOkStorage();
    const { result } = renderHook(() => useAutoSave({ storage, enabled: true }));
    await act(async () => {
      expect(await result.current.saveNow()).toBe('nothing-pending');
    });
  });
});

// ---------------------------------------------------------------------------
// LIFE-07 — only `scheduleSave` consulted `enabled`, so a save armed a moment
// before autosave was switched off still landed.
// ---------------------------------------------------------------------------
describe('enabled:false', () => {
  it('disarms an already-armed timer', () => {
    const { storage, calls } = makeOkStorage();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAutoSave({ storage, enabled }),
      { initialProps: { enabled: true } }
    );

    act(() => result.current.scheduleSave('d1', MODEL('armed')));
    expect(jest.getTimerCount()).toBeGreaterThan(0); // precondition

    rerender({ enabled: false });
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });

    expect(calls).toHaveLength(0);
  });

  it('keeps the queued model so an explicit flush can still write it', async () => {
    const { storage, calls } = makeOkStorage();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAutoSave({ storage, enabled }),
      { initialProps: { enabled: true } }
    );
    act(() => result.current.scheduleSave('d1', MODEL('armed')));
    rerender({ enabled: false });
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    expect(calls).toHaveLength(0); // precondition: nothing landed automatically

    await act(async () => { await result.current.saveNow(); });
    expect(calls).toEqual([{ id: 'd1', title: 'armed' }]);
  });
});

// ---------------------------------------------------------------------------
// LIFE-08 — two writes could be on the wire at once, and the older one
// resolving last wrote `lastSaved` + 'idle' over a live write: the status bar
// and the unload guard both claimed saved while it was not. (Out-of-order
// arrival also means the older payload can win in storage.)
// ---------------------------------------------------------------------------
describe('overlapping saves', () => {
  it('serialises writes and stays "saving" until the newest one lands', async () => {
    const rec = makeManualStorage();
    const { result } = renderHook(() => useAutoSave({ storage: rec.storage, enabled: true }));

    act(() => result.current.scheduleSave('d1', MODEL('v1')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    act(() => result.current.scheduleSave('d1', MODEL('v2')));
    act(() => { jest.advanceTimersByTime(DEBOUNCE_MS); });

    // v2's timer fired while v1 is still on the wire: it queues behind it
    // instead of racing it.
    expect(rec.calls.map((c) => c.title)).toEqual(['v1']);

    await act(async () => { rec.settle[0].resolve(); });

    // v1 landed, v2 has not — the hook must not report a clean, saved state.
    expect(result.current.saveStatus).toBe('saving');
    expect(result.current.hasUnsavedWork()).toBe(true);
    expect(rec.calls.map((c) => c.title)).toEqual(['v1', 'v2']);

    await act(async () => { rec.settle[1].resolve(); });
    await waitFor(() => expect(result.current.saveStatus).toBe('idle'));
    expect(result.current.lastSaved).not.toBeNull();
    expect(result.current.hasUnsavedWork()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LIFE-09 (hook half) — `resetStatus` is called when a new diagram is adopted.
// It used to drop the previous diagram's queued edit on the floor.
// ---------------------------------------------------------------------------
describe('resetStatus()', () => {
  it('flushes queued work instead of discarding it', async () => {
    const { storage, calls } = makeOkStorage();
    const { result } = renderHook(() => useAutoSave({ storage, enabled: true }));

    act(() => result.current.scheduleSave('d1', MODEL('queued')));
    expect(calls).toHaveLength(0); // precondition

    await act(async () => { result.current.resetStatus(); });

    expect(calls).toEqual([{ id: 'd1', title: 'queued' }]);
    expect(result.current.saveStatus).toBe('idle');
  });
});
