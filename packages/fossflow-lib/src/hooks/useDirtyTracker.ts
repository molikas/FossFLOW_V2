/**
 * useDirtyTracker
 *
 * Tracks whether the model has unsaved changes since the last export-to-file
 * or explicit save. Wires the browser's beforeunload warning so the user is
 * prompted before closing the tab with unsaved work.
 *
 * Starts tracking only after `isReady` becomes true so that the initial data
 * load itself does not mark the diagram as dirty.
 */
import { useEffect, useRef } from 'react';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';

export const useDirtyTracker = (isReady: boolean) => {
  const modelStoreApi = useModelStoreApi();
  const setIsDirty = useUiStateStore((s) => s.actions.setIsDirty);

  // Ref so beforeunload handler always reads the latest value without being recreated
  const isDirtyRef = useRef(false);

  // Subscribe to model changes after the initial load is complete
  useEffect(() => {
    if (!isReady) return;

    // Small delay so any synchronous post-load store writes don't trip the flag
    const timer = setTimeout(() => {
      const unsubscribe = modelStoreApi.subscribe(() => {
        if (!isDirtyRef.current) {
          isDirtyRef.current = true;
          setIsDirty(true);
        }
      });

      // Capture unsubscribe so the cleanup below can call it
      cleanupRef.current = unsubscribe;
    }, 100);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // Separate ref so the effect above can register cleanup without a dependency cycle
  const cleanupRef = useRef<() => void>(() => {});
  useEffect(() => () => cleanupRef.current(), []);

  // beforeunload — warn the user if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      // Chrome requires returnValue to be set
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const markClean = () => {
    isDirtyRef.current = false;
    setIsDirty(false);
  };

  return { markClean };
};
