import { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageProvider } from '../services/storage/types';
import type { DiagramData } from '../diagramUtils';

export type SaveStatus = 'idle' | 'saving' | 'error';

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
  /** Flush any pending debounced save immediately. Safe to call when nothing is pending. */
  saveNow: () => Promise<void>;
  /** Reset status back to idle (e.g. after loading a new diagram). */
  resetStatus: () => void;
}

const DEBOUNCE_MS = 2000;

export function useAutoSave({
  storage,
  enabled,
  onSaved,
  onError,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // What's queued for the next debounced flush
  const pendingRef = useRef<{ diagramId: string; model: DiagramData } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageRef = useRef(storage);
  useEffect(() => { storageRef.current = storage; }, [storage]);

  // Callbacks in refs so they never stale inside the debounce closure
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const executeSave = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || !storageRef.current) return;
    pendingRef.current = null;

    setSaveStatus('saving');
    try {
      await storageRef.current.saveDiagram(pending.diagramId, pending.model as unknown);
      const savedAt = new Date();
      setLastSaved(savedAt);
      setSaveStatus('idle');
      onSavedRef.current?.(pending.diagramId, savedAt);
    } catch (e) {
      setSaveStatus('error');
      onErrorRef.current?.(e instanceof Error ? e : new Error('Auto-save failed'));
    }
  }, []);

  const scheduleSave = useCallback(
    (diagramId: string, model: DiagramData) => {
      if (!enabled) return;
      pendingRef.current = { diagramId, model };
      // Show 'saving' immediately so the status bar responds at once
      setSaveStatus('saving');
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(executeSave, DEBOUNCE_MS);
    },
    [enabled, executeSave]
  );

  const saveNow = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (!pendingRef.current) return;
    await executeSave();
  }, [executeSave]);

  const resetStatus = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingRef.current = null;
    setSaveStatus('idle');
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return { saveStatus, lastSaved, scheduleSave, saveNow, resetStatus };
}
