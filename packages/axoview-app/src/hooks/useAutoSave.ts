import { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageProvider } from '../services/storage/types';
import type { DiagramData } from '../diagramUtils';

export type SaveStatus = 'idle' | 'saving' | 'error';

/**
 * What a `saveNow()` flush actually did.
 *
 * Callers used to answer this by reading `saveStatus` back out of their own
 * render closure, which is a render behind the flush they just awaited — so a
 * manual save right after an edit did nothing and said nothing (A1/LIFE-03,
 * A1/LIFE-04). The flush reports its own outcome instead.
 */
export type FlushOutcome = 'nothing-pending' | 'saved' | 'error';

interface UseAutoSaveOptions {
  storage: StorageProvider | null;
  enabled: boolean;
  onSaved?: (diagramId: string, savedAt: Date) => void;
  onError?: (error: Error) => void;
}

export interface UseAutoSaveResult {
  saveStatus: SaveStatus;
  lastSaved: Date | null;
  /** Schedule a debounced save. Call on every real user edit. */
  scheduleSave: (diagramId: string, model: DiagramData) => void;
  /**
   * Flush any pending debounced save and wait for it — and for any write
   * already in flight — to land. Safe to call when nothing is pending.
   */
  saveNow: () => Promise<FlushOutcome>;
  /**
   * Live (ref-backed, never closure-stale) answer to "is there work that has
   * not reached storage?" — queued, in flight, or failed. The `beforeunload`
   * guards read this.
   */
  hasUnsavedWork: () => boolean;
  /**
   * Reset status back to idle (e.g. after loading a new diagram). Flushes
   * queued work first — a reset must not be a silent discard of the previous
   * diagram's last edit (A1/LIFE-09).
   */
  resetStatus: () => void;
}

const DEBOUNCE_MS = 2000;

export function useAutoSave({
  storage,
  enabled,
  onSaved,
  onError,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [saveStatus, setSaveStatusState] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // What's queued for the next flush
  const pendingRef = useRef<{ diagramId: string; model: DiagramData } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The write currently on the wire, if any (writes are serialised — see startSave)
  const inFlightRef = useRef<Promise<void> | null>(null);
  const statusRef = useRef<SaveStatus>('idle');
  const mountedRef = useRef(true);
  const storageRef = useRef(storage);
  useEffect(() => { storageRef.current = storage; }, [storage]);

  // Callbacks in refs so they never stale inside the debounce closure
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const setStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setSaveStatusState(next);
  }, []);

  /** One write. Never overlaps another — see `startSave`. */
  const performSave = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || !storageRef.current) return;
    pendingRef.current = null;

    setStatus('saving');
    try {
      await storageRef.current.saveDiagram(pending.diagramId, pending.model as unknown);
      const savedAt = new Date();
      if (mountedRef.current) setLastSaved(savedAt);
      // A newer edit landed while this write was on the wire: the diagram is
      // NOT saved, so stay 'saving' until that one lands too (LIFE-08).
      setStatus(pendingRef.current ? 'saving' : 'idle');
      onSavedRef.current?.(pending.diagramId, savedAt);
    } catch (e) {
      // Keep the model that could not be written so a retry has something to
      // send (LIFE-01) — unless a newer edit has already superseded it.
      if (!pendingRef.current) pendingRef.current = pending;
      setStatus('error');
      onErrorRef.current?.(e instanceof Error ? e : new Error('Auto-save failed'));
    }
  }, [setStatus]);

  /**
   * Start a write, queued behind any write already on the wire. Two overlapping
   * writes can land out of order — the older one overwriting the newer in
   * storage, and reporting "saved" over it (LIFE-08).
   */
  const startSave = useCallback((): Promise<void> => {
    const prior = inFlightRef.current;
    const run = prior ? prior.then(() => performSave(), () => performSave()) : performSave();
    inFlightRef.current = run;
    const clear = () => { if (inFlightRef.current === run) inFlightRef.current = null; };
    void run.then(clear, clear);
    return run;
  }, [performSave]);

  const scheduleSave = useCallback(
    (diagramId: string, model: DiagramData) => {
      if (!enabled) return;
      pendingRef.current = { diagramId, model };
      // Show 'saving' immediately so the status bar responds at once
      setStatus('saving');
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void startSave();
      }, DEBOUNCE_MS);
    },
    [enabled, startSave, setStatus]
  );

  const saveNow = useCallback(async (): Promise<FlushOutcome> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingRef.current && storageRef.current) {
      await startSave();
    } else if (inFlightRef.current) {
      // Nothing queued, but a write is still on the wire. Callers treat this
      // resolving as "the old place is flushed" before revoking a token or
      // swapping the active provider, so it has to mean that (LIFE-06).
      await inFlightRef.current;
    } else {
      return statusRef.current === 'error' ? 'error' : 'nothing-pending';
    }
    return statusRef.current === 'error' ? 'error' : 'saved';
  }, [startSave]);

  const hasUnsavedWork = useCallback(
    () => !!pendingRef.current || !!inFlightRef.current || statusRef.current !== 'idle',
    []
  );

  const resetStatus = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    // Flush, don't discard: the pending model is keyed by its own diagram id,
    // so writing it out cannot collide with the diagram being loaded.
    if (pendingRef.current && storageRef.current) void startSave();
    pendingRef.current = null;
    setStatus('idle');
  }, [startSave, setStatus]);

  // Teardown: flush, don't drop. `EditorPage` is the element of every route, so
  // an in-app navigation unmounts this hook mid-debounce (LIFE-05).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pendingRef.current && storageRef.current) void startSave();
    };
  }, [startSave]);

  // Disabling autosave must disarm an already-armed timer too — only
  // `scheduleSave` consulted the flag, so a save armed a moment earlier still
  // landed after autosave was switched off (LIFE-07). The queued model is kept:
  // "no automatic writes" is not "throw the user's work away", and an explicit
  // `saveNow()` can still flush it.
  useEffect(() => {
    if (enabled) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, [enabled]);

  return { saveStatus, lastSaved, scheduleSave, saveNow, hasUnsavedWork, resetStatus };
}
