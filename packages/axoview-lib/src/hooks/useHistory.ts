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
  const { transaction: sceneTransaction, switchView } = useSceneActions();
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

  /**
   * E1/HIST-10 — "always navigate" (owner ruling 2026-07-30, signed off
   * 2026-08-02). A step whose entry was recorded on another page switches to
   * that page, so the effect of an undo/redo is never off-screen.
   *
   * Returns true when it navigated, because the caller then owes the scene a
   * PAGE-SWITCH sync rather than the same-page `resyncScene()` repair.
   *
   * Three reasons this can decline, all of them normal:
   *  - no stamp (`undefined`) — a document-level action (title, colours) or an
   *    entry recorded before the field existed. "Stay put", never "views[0]";
   *  - already there — the overwhelmingly common case, and the one that keeps
   *    single-page undo byte-identical to its pre-HIST-10 behaviour;
   *  - the page is gone. Not defensive padding: a redo that re-creates a page,
   *    and a stamp naming a page a later undo has removed, are both reachable
   *    (HIST-04). Navigating to a missing id is exactly the dangling
   *    `uiState.view` this change exists to stop producing (E3/SCN-09).
   */
  const navigateToEntryView = useCallback(
    (targetViewId: string | undefined): boolean => {
      if (!targetViewId || targetViewId === activeViewId) return false;
      if (!modelActions) return false;
      const exists = modelActions
        .get()
        .views.some((v) => v.id === targetViewId);
      if (!exists) return false;
      // `switchView` is the same primitive a tab click uses (SYNC_SCENE for the
      // target page, then setView) and it reads the model the step just wrote.
      // `setView` touches ui state only — ui state has no history stack, so a
      // navigation cannot record an entry and undo cannot become a loop.
      switchView(targetViewId);
      return true;
    },
    [activeViewId, modelActions, switchView]
  );

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

    // HIST-10: peek BEFORE stepping — a step moves the entry to the other
    // stack. Only the halves that actually step contribute a page, and the
    // model half wins when both do; they are stamped from one register for one
    // logical action, so a disagreement is a bug (asserted in the promoted
    // regression) rather than something to reconcile here.
    const modelViewId =
      modelSeq === target ? modelActions.peekUndoViewId?.() : undefined;
    const sceneViewId =
      sceneSeq === target ? sceneActions.peekUndoViewId?.() : undefined;

    let undoPerformed = false;
    if (modelSeq === target) {
      undoPerformed = modelActions.undo() || undoPerformed;
    }
    if (sceneSeq === target) {
      undoPerformed = sceneActions.undo() || undoPerformed;
    }

    if (undoPerformed) {
      // Navigate first so the page we land on is the one that gets settled.
      // A navigation runs SYNC_SCENE for the target page — a full, deterministic
      // rebuild that subsumes `resyncScene`'s same-page repair — so running
      // both would re-check the OLD page's connectors against the NEW page's
      // scene and could write a page's cache over its successor's.
      if (!navigateToEntryView(modelViewId ?? sceneViewId)) resyncScene();
    }
    return undoPerformed;
  }, [modelActions, sceneActions, navigateToEntryView, resyncScene]);

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

    // HIST-10, redo symmetry (owner sign-off §5 Q2): the stamp is the page the
    // action was ORIGINALLY performed on. There is no separate "page I pressed
    // undo from" to return to — redo re-applies the action, so it belongs where
    // the action belongs.
    const modelViewId =
      modelSeq === target ? modelActions.peekRedoViewId?.() : undefined;
    const sceneViewId =
      sceneSeq === target ? sceneActions.peekRedoViewId?.() : undefined;

    let redoPerformed = false;
    if (modelSeq === target) {
      redoPerformed = modelActions.redo() || redoPerformed;
    }
    if (sceneSeq === target) {
      redoPerformed = sceneActions.redo() || redoPerformed;
    }

    if (redoPerformed) {
      if (!navigateToEntryView(modelViewId ?? sceneViewId)) resyncScene();
    }
    return redoPerformed;
  }, [modelActions, sceneActions, navigateToEntryView, resyncScene]);

  const saveToHistory = useCallback(() => {
    // Don't save during transactions
    if (session.transactionInProgress) {
      return;
    }

    if (!modelActions || !sceneActions) return;

    // One logical action across both stores — shared seq (D-7) and shared page
    // stamp (HIST-10).
    allocateHistorySequence(activeViewId);
    modelActions.clearFuture?.(); // E1/HIST-02
    sceneActions.clearFuture?.();
    modelActions.saveToHistory();
    sceneActions.saveToHistory();
  }, [session, activeViewId, modelActions, sceneActions]);

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
