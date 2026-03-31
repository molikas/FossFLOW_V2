import React, { createContext, useRef, useContext } from 'react';
import { createStore } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { enablePatches, produceWithPatches, applyPatches, Patch } from 'immer';
import { SceneStore, Scene } from 'src/types';

// enablePatches() is idempotent — safe to call in multiple modules.
enablePatches();

type HistoryEntry = { patches: Patch[]; inversePatches: Patch[] };

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
  };
}

const MAX_HISTORY_SIZE = 50;

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

    const saveToHistory = () => {
      pendingPre = extractSceneData(get());
    };

    const undo = (): boolean => {
      const { history } = get();
      if (history.past.length === 0) return false;

      const entry = history.past[history.past.length - 1];
      const newPast = history.past.slice(0, history.past.length - 1);

      set((state) => {
        const currentScene = extractSceneData(state);
        const [, redoPatches, redoInverse] = produceWithPatches(
          currentScene,
          (draft: Scene) => { Object.assign(draft, applyPatches(currentScene, entry.inversePatches)); }
        );
        const previousScene = applyPatches(currentScene, entry.inversePatches);
        return {
          ...previousScene,
          history: {
            ...state.history,
            past: newPast,
            future: [{ patches: redoPatches, inversePatches: redoInverse }, ...state.history.future]
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
        const [, undoPatches, undoInverse] = produceWithPatches(
          currentScene,
          (draft: Scene) => { Object.assign(draft, applyPatches(currentScene, entry.patches)); }
        );
        const nextScene = applyPatches(currentScene, entry.patches);
        return {
          ...nextScene,
          history: {
            ...state.history,
            past: [...state.history.past, { patches: undoPatches, inversePatches: undoInverse }],
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
      set((state) => ({ ...state, history: createSceneHistoryState() }));
    };

    return {
      ...initialScene,
      history: createSceneHistoryState(),
      actions: {
        get,
        set: (updates: Partial<Scene>, skipHistory = false) => {
          if (!skipHistory) {
            saveToHistory();
          }

          if (pendingPre !== null) {
            const pre = pendingPre;
            pendingPre = null;
            set((state) => {
              const next: Scene = { ...extractSceneData(state), ...updates };
              const [, patches, inversePatches] = produceWithPatches(pre, (draft: Scene) => {
                Object.assign(draft, next);
              });

              const newPast = [...state.history.past, { patches, inversePatches }];
              if (newPast.length > state.history.maxHistorySize) newPast.shift();

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
        clearHistory
      }
    };
  });
};

const SceneContext = createContext<ReturnType<typeof initialState> | null>(null);

interface ProviderProps {
  children: React.ReactNode;
}

export const SceneProvider = ({ children }: ProviderProps) => {
  const storeRef = useRef<ReturnType<typeof initialState> | undefined>(undefined);

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
