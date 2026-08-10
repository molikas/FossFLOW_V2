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

  // Subscribe to model changes after the initial load is complete.
  //
  // E4/CLIP-04/05/06 (mop-up 2026-08-10): this effect used to defer the
  // subscription 100 ms and clean up only its timer. Three defects in one
  // shape: the subscription leaked on every isReady toggle (one per diagram
  // open), `isDirtyRef` was never reset so a diagram opened after a dirty one
  // swallowed its first real edit, and an edit landing inside the 100 ms
  // window was never tracked at all — the beforeunload guard then let the tab
  // close on unsaved work. The load path (`useInitialDataManager.load`)
  // completes its store writes synchronously before flipping isReady, so
  // there is nothing left for a delay to absorb: start clean, subscribe
  // immediately, release on the way out.
  useEffect(() => {
    if (!isReady) return undefined;

    isDirtyRef.current = false;
    setIsDirty(false);

    const unsubscribe = modelStoreApi.subscribe(() => {
      if (!isDirtyRef.current) {
        isDirtyRef.current = true;
        setIsDirty(true);
      }
    });
    return () => unsubscribe();
  }, [isReady, modelStoreApi, setIsDirty]);

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
