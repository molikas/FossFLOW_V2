import React, { createContext, useRef, useContext } from 'react';
import { createStore } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { enablePatches, produceWithPatches, applyPatches, Patch } from 'immer';
import { SceneStore, Scene } from 'src/types';
import {
  allocateHistorySequence,
  currentHistorySequence,
  currentHistoryViewId,
  retainWithinHistoryWindow
} from 'src/stores/historySequence';

// enablePatches() is idempotent — safe to call in multiple modules.
enablePatches();

// `seq` stamps each entry with the logical-action sequence it belongs to so
// useHistory can coordinate the two independent stacks (D-7, historySequence.ts).
// `viewId` stamps the page the action was performed on (E1/HIST-10) — the same
// shape modelStore declares, and deliberately stamped from the same register so
// the two halves of one logical action always agree. See modelStore.tsx for the
// full contract.
type HistoryEntry = {
  patches: Patch[];
  inversePatches: Patch[];
  seq: number;
  viewId?: string;
};

export interface SceneHistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  maxHistorySize: number;
}

export interface SceneStoreWithHistory extends Omit<SceneStore, 'actions'> {
  history: SceneHistoryState;
  actions: {
    get: () => SceneStoreWithHistory;
    set: (scene: Partial<Scene>, skipHistory?: boolean) => void;
    undo: () => boolean;
    redo: () => boolean;
    canUndo: () => boolean;
    canRedo: () => boolean;
    saveToHistory: () => void;
    clearHistory: () => void;
    freezePendingPre: () => void;
    unfreezePendingPre: () => void;
    /** Drop an armed pre-snapshot without recording anything (E1/HIST-05). */
    discardPendingPre: () => void;
    /** Invalidate the redo stack when a new logical action branches history (E1/HIST-02). */
    clearFuture: () => void;
    /**
     * Provider-scoped edit-session state. `useSceneActions` used to keep
     * `transactionInProgress` / `dragInProgress` / the pending state in per-HOOK
     * refs, so a second instance of the hook under the same providers — another
     * component, or `useHistory`'s own — could not see an open transaction or an
     * open drag. That is E1/HIST-07 (a foreign mid-drag write re-armed the
     * snapshot, so undo landed mid-drag) and E1/HIST-08 (scene CRUD wrapped in
     * `useHistory.transaction` pushed one entry each instead of one in total).
     * The store is created once per provider, so this object is shared by every
     * hook instance under it — which is the scope the state always meant.
     */
    editSession: EditSession;
    // D-7 coordination: the logical-action seq of the top undo/redo entry, or
    // null when the respective stack is empty.
    peekUndoSeq: () => number | null;
    peekRedoSeq: () => number | null;
    /** E1/HIST-10: the page stamped on the top undo/redo entry. See modelStore. */
    peekUndoViewId: () => string | undefined;
    peekRedoViewId: () => string | undefined;
  };
}

const MAX_HISTORY_SIZE = 50;

export interface EditSession {
  transactionInProgress: boolean;
  dragInProgress: boolean;
  /** The reducers' `State` while a transaction batches writes; typed loosely so the store stays reducer-agnostic. */
  pendingState: unknown;
}

const createSceneHistoryState = (): SceneHistoryState => ({
  past: [],
  future: [],
  maxHistorySize: MAX_HISTORY_SIZE
});

const extractSceneData = (state: SceneStoreWithHistory): Scene => ({
  connectors: state.connectors,
  textBoxes: state.textBoxes
});

const initialState = () => {
  return createStore<SceneStoreWithHistory>((set, get) => {
    const initialScene: Scene = { connectors: {}, textBoxes: {} };

    let pendingPre: Scene | null = null;

    // While true, set() will not consume pendingPre — see modelStore.tsx for why.
    let pendingPreFrozen = false;

    const saveToHistory = () => {
      pendingPre = extractSceneData(get());
    };

    // MQA #5 (Bundle B follow-up #3): scene store's undo/redo previously
    // recomputed entry patches via `produceWithPatches(current, draft =>
    // Object.assign(draft, applyPatches(current, entry.inversePatches)))`,
    // which yielded patches in the WRONG direction (B → A, not A → B).
    // Pushing those backwards-patches to future meant `redo` applied
    // undo-direction patches to an already-undone state — a no-op. Model
    // store stayed correct, so model.redo restored the connector to
    // `views[].connectors` but scene.redo never re-populated
    // `scene.connectors[id]`, leaving the connector with no path → invisible.
    // The redo also consumed the future entry, disabling the redo button.
    // Mirror the model store: push the ORIGINAL entry to future on undo,
    // pop it back on redo. entry.patches always travel pre → post.
    // E1/HIST-03 — see modelStore for the full contract. The retained set is the
    // newest MAX_HISTORY_SIZE LOGICAL ACTIONS, evaluated against the shared
    // counter, so this stack and the model stack always agree about which action
    // is the oldest one still undoable. The scene stack is the one that used to
    // be left holding an orphaned half: model-only actions fill the model stack
    // while this one stands still.
    const retained = () =>
      retainWithinHistoryWindow(get().history.past, MAX_HISTORY_SIZE);

    const undo = (): boolean => {
      const past = retained();
      if (past.length === 0) return false;

      const entry = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);

      set((state) => {
        const currentScene = extractSceneData(state);
        const previousScene = applyPatches(currentScene, entry.inversePatches);
        return {
          ...previousScene,
          history: {
            ...state.history,
            past: newPast,
            future: [entry, ...state.history.future]
          }
        };
      });

      return true;
    };

    const redo = (): boolean => {
      const { history } = get();
      if (history.future.length === 0) return false;

      const entry = history.future[0];
      const newFuture = history.future.slice(1);

      set((state) => {
        const currentScene = extractSceneData(state);
        const nextScene = applyPatches(currentScene, entry.patches);
        return {
          ...nextScene,
          history: {
            ...state.history,
            past: [...state.history.past, entry],
            future: newFuture
          }
        };
      });

      return true;
    };

    const canUndo = () => retained().length > 0;
    const canRedo = () => get().history.future.length > 0;

    const peekUndoSeq = (): number | null => {
      const past = retained();
      return past.length > 0 ? past[past.length - 1].seq : null;
    };

    const peekRedoSeq = (): number | null => {
      const { future } = get().history;
      return future.length > 0 ? future[0].seq : null;
    };

    const peekUndoViewId = (): string | undefined => {
      const past = retained();
      return past.length > 0 ? past[past.length - 1].viewId : undefined;
    };

    const peekRedoViewId = (): string | undefined => {
      const { future } = get().history;
      return future.length > 0 ? future[0].viewId : undefined;
    };

    const clearHistory = () => {
      pendingPre = null;
      pendingPreFrozen = false;
      set((state) => ({ ...state, history: createSceneHistoryState() }));
    };

    const discardPendingPre = () => {
      if (pendingPreFrozen) return; // a live drag owns it
      pendingPre = null;
    };

    const clearFuture = () => {
      set((state) => ({ ...state, history: { ...state.history, future: [] } }));
    };

    const editSession: EditSession = {
      transactionInProgress: false,
      dragInProgress: false,
      pendingState: null
    };

    const freezePendingPre = () => {
      pendingPreFrozen = true;
    };

    const unfreezePendingPre = () => {
      pendingPreFrozen = false;
    };

    return {
      ...initialScene,
      history: createSceneHistoryState(),
      actions: {
        get,
        set: (updates: Partial<Scene>, skipHistory = false) => {
          if (!skipHistory) {
            // Standalone logical action — allocate its own sequence (D-7).
            // Coordinated writes (skipHistory=true after a coordinator's
            // saveToHistory) inherit the coordinator's sequence.
            allocateHistorySequence();
            saveToHistory();
          }

          if (pendingPre !== null && !pendingPreFrozen) {
            const pre = pendingPre;
            pendingPre = null;
            set((state) => {
              const next: Scene = { ...extractSceneData(state), ...updates };
              const [, patches, inversePatches] = produceWithPatches(
                pre,
                (draft: Scene) => {
                  Object.assign(draft, next);
                }
              );

              // MQA #5: see modelStore. A no-op set() must not clobber `future`,
              // otherwise undo+undo+redo+redo loses the trailing action whenever
              // a transient inter-redo write produced no real change.
              if (patches.length === 0) {
                return { ...state, ...next };
              }

              // E1/HIST-03 — trim by the shared logical-action window, so this
              // stack and the model stack evict the same action.
              const newPast = retainWithinHistoryWindow(
                [
                  ...state.history.past,
                  {
                    patches,
                    inversePatches,
                    seq: currentHistorySequence(),
                    // E1/HIST-10 — same register the model store reads, so the
                    // two halves of one action carry the same page.
                    viewId: currentHistoryViewId()
                  }
                ],
                state.history.maxHistorySize
              );

              return {
                ...state,
                ...next,
                history: {
                  ...state.history,
                  past: newPast,
                  future: []
                }
              };
            });
          } else {
            set((state) => ({ ...state, ...updates }));
          }
        },
        undo,
        redo,
        canUndo,
        canRedo,
        saveToHistory,
        clearHistory,
        discardPendingPre,
        clearFuture,
        editSession,
        freezePendingPre,
        unfreezePendingPre,
        peekUndoSeq,
        peekRedoSeq,
        peekUndoViewId,
        peekRedoViewId
      }
    };
  });
};

const SceneContext = createContext<ReturnType<typeof initialState> | null>(
  null
);

interface ProviderProps {
  children: React.ReactNode;
}

export const SceneProvider = ({ children }: ProviderProps) => {
  const storeRef = useRef<ReturnType<typeof initialState> | undefined>(
    undefined
  );

  if (!storeRef.current) {
    storeRef.current = initialState();
  }

  return (
    <SceneContext.Provider value={storeRef.current}>
      {children}
    </SceneContext.Provider>
  );
};

export function useSceneStore<T>(
  selector: (state: SceneStoreWithHistory) => T,
  equalityFn?: (left: T, right: T) => boolean
) {
  const store = useContext(SceneContext);
  if (store === null) throw new Error('Missing provider in the tree');
  return useStoreWithEqualityFn(store, selector, equalityFn);
}

export function useSceneStoreApi() {
  const store = useContext(SceneContext);
  if (store === null) throw new Error('Missing provider in the tree');
  return store;
}
