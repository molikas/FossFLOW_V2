import React, { createContext, useRef, useContext } from 'react';
import { createStore } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { enablePatches, produceWithPatches, applyPatches, Patch } from 'immer';
import { ModelStore, Model } from 'src/types';
import { INITIAL_DATA } from 'src/config';

// Enable Immer patch support — must be called once before any produce() call.
enablePatches();

type HistoryEntry = { patches: Patch[]; inversePatches: Patch[] };

export interface HistoryState {
  // Each entry is a diff pair rather than a full Model snapshot.
  // Reduces memory from O(N * history_size) to O(diff_size * history_size).
  past: HistoryEntry[];
  future: HistoryEntry[];
  maxHistorySize: number;
}

export interface ModelStoreWithHistory extends Omit<ModelStore, 'actions'> {
  history: HistoryState;
  actions: {
    get: () => ModelStoreWithHistory;
    set: (model: Partial<Model>, skipHistory?: boolean) => void;
    undo: () => boolean;
    redo: () => boolean;
    canUndo: () => boolean;
    canRedo: () => boolean;
    saveToHistory: () => void;
    clearHistory: () => void;
  };
}

const MAX_HISTORY_SIZE = 50;

const createHistoryState = (): HistoryState => ({
  past: [],
  future: [],
  maxHistorySize: MAX_HISTORY_SIZE
});

const extractModelData = (state: ModelStoreWithHistory): Model => ({
  version: state.version,
  title: state.title,
  description: state.description,
  colors: state.colors,
  icons: state.icons,
  items: state.items,
  views: state.views
});

const initialState = () => {
  return createStore<ModelStoreWithHistory>((set, get) => {
    const initialModel = { ...INITIAL_DATA };

    // Holds the pre-mutation snapshot captured by saveToHistory().
    // The matching set() call (skipHistory=true) will compute patches relative to it.
    let pendingPre: Model | null = null;

    const saveToHistory = () => {
      // Capture the current model so the subsequent set() call can compute the diff.
      pendingPre = extractModelData(get());
    };

    const undo = (): boolean => {
      const { history } = get();
      if (history.past.length === 0) return false;

      const entry = history.past[history.past.length - 1];
      const newPast = history.past.slice(0, history.past.length - 1);

      set((state) => {
        const currentModel = extractModelData(state);
        const previousModel = applyPatches(currentModel, entry.inversePatches);
        return {
          ...previousModel,
          history: {
            ...state.history,
            past: newPast,
            // Push original entry to future so redo can re-apply the forward patches.
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
        const currentModel = extractModelData(state);
        const nextModel = applyPatches(currentModel, entry.patches);
        return {
          ...nextModel,
          history: {
            ...state.history,
            // Push original entry back to past so undo can re-apply the inverse patches.
            past: [...state.history.past, entry],
            future: newFuture
          }
        };
      });

      return true;
    };

    const canUndo = () => get().history.past.length > 0;
    const canRedo = () => get().history.future.length > 0;

    const clearHistory = () => {
      pendingPre = null;
      set((state) => ({ ...state, history: createHistoryState() }));
    };

    return {
      ...initialModel,
      history: createHistoryState(),
      actions: {
        get,
        set: (updates: Partial<Model>, skipHistory = false) => {
          if (!skipHistory) {
            // Direct call without a prior saveToHistory — save a snapshot-based entry.
            saveToHistory();
          }

          if (pendingPre !== null) {
            // We have a pre-state — compute patches instead of storing a full snapshot.
            const pre = pendingPre;
            pendingPre = null;
            set((state) => {
              const next: Model = { ...extractModelData(state), ...updates };
              const [, patches, inversePatches] = produceWithPatches(
                pre,
                (draft: Model) => {
                  Object.assign(draft, next);
                }
              );

              const newPast = [
                ...state.history.past,
                { patches, inversePatches }
              ];
              if (newPast.length > state.history.maxHistorySize)
                newPast.shift();

              return {
                ...state,
                ...next,
                history: {
                  ...state.history,
                  past: newPast,
                  future: [] // new action clears redo stack
                }
              };
            });
          } else {
            // No pending pre — just apply the update without touching history.
            set((state) => ({ ...state, ...updates }));
          }
        },
        undo,
        redo,
        canUndo,
        canRedo,
        saveToHistory,
        clearHistory
      }
    };
  });
};

const ModelContext = createContext<ReturnType<typeof initialState> | null>(
  null
);

interface ProviderProps {
  children: React.ReactNode;
}

export const ModelProvider = ({ children }: ProviderProps) => {
  const storeRef = useRef<ReturnType<typeof initialState> | undefined>(
    undefined
  );

  if (!storeRef.current) {
    storeRef.current = initialState();
  }

  return (
    <ModelContext.Provider value={storeRef.current}>
      {children}
    </ModelContext.Provider>
  );
};

export function useModelStore<T>(
  selector: (state: ModelStoreWithHistory) => T,
  equalityFn?: (left: T, right: T) => boolean
) {
  const store = useContext(ModelContext);
  if (store === null) throw new Error('Missing provider in the tree');
  return useStoreWithEqualityFn(store, selector, equalityFn);
}

export function useModelStoreApi() {
  const store = useContext(ModelContext);
  if (store === null) throw new Error('Missing provider in the tree');
  return store;
}
