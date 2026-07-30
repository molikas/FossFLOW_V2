import { useCallback, useRef } from 'react';
import { useModelStore } from 'src/stores/modelStore';
import {
  useSceneStore,
  useSceneStoreApi,
  type EditSession
} from 'src/stores/sceneStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useSceneActions } from 'src/hooks/useSceneActions';
import * as reducers from 'src/stores/reducers';
import { INITIAL_SCENE_STATE } from 'src/config';
import { allocateHistorySequence } from 'src/stores/historySequence';

export const useHistory = () => {
  // E1/HIST-08 (owner ruling 2026-07-30: delegate, don't duplicate). This hook
  // kept its OWN `transactionInProgress` ref, so N scene CRUD ops wrapped in
  // `useHistory.transaction` pushed N history entries instead of 1 and one
  // Ctrl+Z undid only the last — `useSceneActions` never saw the bracket. Both
  // now read the same provider-scoped edit session, so there is one grouping
  // primitive with one piece of state behind it, whichever hook opens it.
  //
  // The `?? fallback` keeps the mocked-store unit tests working, matching the
  // `peekUndoSeq?.() ?? 0` accommodation below.
  const sceneStoreApi = useSceneStoreApi();
  const { transaction: sceneTransaction } = useSceneActions();
  const fallbackSession = useRef<EditSession>({
    transactionInProgress: false,
    dragInProgress: false,
    pendingState: null
  });
  const session =
    sceneStoreApi.getState()?.actions?.editSession ?? fallbackSession.current;

  // Get store actions
  const modelActions = useModelStore((state) => {
    return state?.actions;
  });
  const sceneActions = useSceneStore((state) => {
    return state?.actions;
  });
  const activeViewId = useUiStateStore((state) => state?.view);

  // Get history state
  const modelCanUndo = useModelStore((state) => {
    return state?.actions?.canUndo?.() ?? false;
  });
  const sceneCanUndo = useSceneStore((state) => {
    return state?.actions?.canUndo?.() ?? false;
  });
  const modelCanRedo = useModelStore((state) => {
    return state?.actions?.canRedo?.() ?? false;
  });
  const sceneCanRedo = useSceneStore((state) => {
    return state?.actions?.canRedo?.() ?? false;
  });

  // Derived values
  const canUndo = modelCanUndo || sceneCanUndo;
  const canRedo = modelCanRedo || sceneCanRedo;

  // Transaction wrapper - groups multiple operations into single history entry
  /**
   * E1/HIST-08 (owner ruling 2026-07-30: **delegate**, don't duplicate).
   *
   * This used to be a second, subtly different implementation of grouping: it
   * armed the snapshots and set its OWN `transactionInProgress` ref, which
   * `useSceneActions` could not see. N scene CRUD ops inside it therefore
   * pushed N history entries instead of 1, and one Ctrl+Z undid only the last.
   * It is now a pass-through to the one implementation that batches the writes
   * as well as the history — the bracket state they share lives on the scene
   * store's provider-scoped `editSession`, so a caller's own
   * `useSceneActions()` instance sees this bracket too.
   */
  const transaction = sceneTransaction;

  // D4-2 / D-8: connector paths are derived from the model but cached in the
  // scene store + its history. Paste records PROVISIONAL empty connector paths in
  // its history entry, then computePathsAsync writes the real paths skipHistory —
  // so the real paths never enter history and redoing a paste restores empty
  // paths (invisible connectors).
  //
  // After undo/redo, re-route ONLY when a connector in the active view actually
  // has a missing/empty path (the D-8 symptom). The common case — every other
  // undo/redo — is then just an O(C) tiles.length scan with NO getConnectorPath
  // re-route, so a model-only edit's undo (e.g. a rename) doesn't pay a full
  // view re-route at 700+ connectors (review follow-up: scope the cost to the
  // actual symptom). When it does fire, SYNC_SCENE is deterministic and written
  // skipHistory, so it never perturbs the undo/redo stacks. (Textbox sizes are
  // stored in history, not provisional, so they never need this.)
  const resyncScene = useCallback(() => {
    if (!modelActions || !sceneActions || !activeViewId) return;
    try {
      const m = modelActions.get();
      const view = m.views.find((v) => v.id === activeViewId);
      const connectors = view?.connectors ?? [];
      if (connectors.length === 0) return;

      const sceneConnectors = sceneActions.get().connectors;
      const needsResync = connectors.some((c) => {
        const sc = sceneConnectors[c.id];
        // Missing entry, or an empty path that isn't a deliberate unroutable.
        return !sc || ((sc.path?.tiles?.length ?? 0) === 0 && !sc.unroutable);
      });
      if (!needsResync) return;

      const synced = reducers.view({
        action: 'SYNC_SCENE',
        payload: undefined,
        ctx: {
          viewId: activeViewId,
          state: {
            model: {
              version: m.version,
              title: m.title,
              description: m.description,
              colors: m.colors,
              icons: m.icons,
              items: m.items,
              views: m.views
            },
            scene: INITIAL_SCENE_STATE
          }
        }
      });
      sceneActions.set(synced.scene, true);
    } catch {
      // Active view missing mid-teardown — leave the scene as undo/redo left it.
    }
  }, [modelActions, sceneActions, activeViewId]);

  // D-7: the two stacks can skew to different depths (a model-only action pushes
  // a model entry but the scene store's no-op branch pushes nothing). Stepping
  // them in lockstep then pops entries belonging to DIFFERENT logical actions
  // (the invisible-connector symptom). Each entry carries a logical-action seq
  // (historySequence.ts); one keystroke must revert exactly one logical action,
  // so undo touches only the stack(s) whose top entry carries the highest seq
  // (the most recent action), redo only those at the lowest future seq.
  //
  // The `?? 0` fallback keeps the mocked-store unit tests (which expose no
  // peek*Seq) working: when both stacks report the same seq the behaviour
  // collapses to "step every stack that can", matching the legacy contract.
  const undo = useCallback(() => {
    if (!modelActions || !sceneActions) return false;

    const modelSeq = modelActions.canUndo()
      ? modelActions.peekUndoSeq?.() ?? 0
      : null;
    const sceneSeq = sceneActions.canUndo()
      ? sceneActions.peekUndoSeq?.() ?? 0
      : null;

    if (modelSeq === null && sceneSeq === null) return false;

    const target = Math.max(
      modelSeq ?? Number.NEGATIVE_INFINITY,
      sceneSeq ?? Number.NEGATIVE_INFINITY
    );

    let undoPerformed = false;
    if (modelSeq === target) {
      undoPerformed = modelActions.undo() || undoPerformed;
    }
    if (sceneSeq === target) {
      undoPerformed = sceneActions.undo() || undoPerformed;
    }

    if (undoPerformed) resyncScene();
    return undoPerformed;
  }, [modelActions, sceneActions, resyncScene]);

  const redo = useCallback(() => {
    if (!modelActions || !sceneActions) return false;

    const modelSeq = modelActions.canRedo()
      ? modelActions.peekRedoSeq?.() ?? 0
      : null;
    const sceneSeq = sceneActions.canRedo()
      ? sceneActions.peekRedoSeq?.() ?? 0
      : null;

    if (modelSeq === null && sceneSeq === null) return false;

    const target = Math.min(
      modelSeq ?? Number.POSITIVE_INFINITY,
      sceneSeq ?? Number.POSITIVE_INFINITY
    );

    let redoPerformed = false;
    if (modelSeq === target) {
      redoPerformed = modelActions.redo() || redoPerformed;
    }
    if (sceneSeq === target) {
      redoPerformed = sceneActions.redo() || redoPerformed;
    }

    if (redoPerformed) resyncScene();
    return redoPerformed;
  }, [modelActions, sceneActions, resyncScene]);

  const saveToHistory = useCallback(() => {
    // Don't save during transactions
    if (session.transactionInProgress) {
      return;
    }

    if (!modelActions || !sceneActions) return;

    // One logical action across both stores — shared seq (D-7).
    allocateHistorySequence();
    modelActions.clearFuture?.(); // E1/HIST-02
    sceneActions.clearFuture?.();
    modelActions.saveToHistory();
    sceneActions.saveToHistory();
  }, [session, modelActions, sceneActions]);

  const clearHistory = useCallback(() => {
    if (!modelActions || !sceneActions) return;

    modelActions.clearHistory();
    sceneActions.clearHistory();
  }, [modelActions, sceneActions]);

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    saveToHistory,
    clearHistory,
    transaction,
    isInTransaction: () => {
      return session.transactionInProgress;
    }
  };
};
