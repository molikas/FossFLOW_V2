// @ts-nocheck
import { createStore } from 'zustand';
import { enablePatches, produceWithPatches, applyPatches } from 'immer';

// We test the store logic directly by recreating it (not via React context)
// so we can call actions imperatively without a provider.

enablePatches();

type Scene = { connectors: Record<string, unknown>; textBoxes: Record<string, unknown> };
type HistoryEntry = { patches: any[]; inversePatches: any[] };
type HistoryState = { past: HistoryEntry[]; future: HistoryEntry[]; maxHistorySize: number };

const MAX_HISTORY_SIZE = 50;

function createSceneHistoryState(): HistoryState {
  return { past: [], future: [], maxHistorySize: MAX_HISTORY_SIZE };
}

function extractSceneData(state: any): Scene {
  return { connectors: state.connectors, textBoxes: state.textBoxes };
}

function makeStore() {
  return createStore<any>((set, get) => {
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

      set((state: any) => {
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

      set((state: any) => {
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
      set((state: any) => ({ ...state, history: createSceneHistoryState() }));
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
            set((state: any) => {
              const next: Scene = { ...extractSceneData(state), ...updates };
              const [, patches, inversePatches] = produceWithPatches(
                pre,
                (draft: Scene) => { Object.assign(draft, next); }
              );

              const newPast = [...state.history.past, { patches, inversePatches }];
              if (newPast.length > state.history.maxHistorySize) newPast.shift();

              return {
                ...state,
                ...next,
                history: { ...state.history, past: newPast, future: [] }
              };
            });
          } else {
            set((state: any) => ({ ...state, ...updates }));
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
}

describe('sceneStore — canUndo / canRedo', () => {
  it('canUndo returns false when history is empty', () => {
    const store = makeStore();
    expect(store.getState().actions.canUndo()).toBe(false);
  });

  it('canRedo returns false when future is empty', () => {
    const store = makeStore();
    expect(store.getState().actions.canRedo()).toBe(false);
  });

  it('canUndo returns true after a tracked set()', () => {
    const store = makeStore();
    store.getState().actions.set({ connectors: { a: {} } });
    expect(store.getState().actions.canUndo()).toBe(true);
  });

  it('canRedo returns true after undo()', () => {
    const store = makeStore();
    store.getState().actions.set({ connectors: { a: {} } });
    store.getState().actions.undo();
    expect(store.getState().actions.canRedo()).toBe(true);
  });
});

describe('sceneStore — undo()', () => {
  it('returns false and does not change state when past is empty', () => {
    const store = makeStore();
    const stateBefore = store.getState().connectors;
    const result = store.getState().actions.undo();
    expect(result).toBe(false);
    expect(store.getState().connectors).toBe(stateBefore);
  });

  it('returns true and reverts the last change', () => {
    const store = makeStore();
    const original = store.getState().connectors;

    store.getState().actions.set({ connectors: { a: { id: 'a' } } });
    expect(store.getState().history.past).toHaveLength(1);

    const result = store.getState().actions.undo();
    expect(result).toBe(true);
    expect(store.getState().connectors).toEqual(original);
    expect(store.getState().history.past).toHaveLength(0);
    expect(store.getState().history.future).toHaveLength(1);
  });

  it('moves entry from past to future', () => {
    const store = makeStore();
    store.getState().actions.set({ connectors: { x: {} } });
    store.getState().actions.set({ connectors: { y: {} } });
    expect(store.getState().history.past).toHaveLength(2);

    store.getState().actions.undo();
    expect(store.getState().history.past).toHaveLength(1);
    expect(store.getState().history.future).toHaveLength(1);
  });
});

describe('sceneStore — redo()', () => {
  it('returns false when future is empty', () => {
    const store = makeStore();
    const result = store.getState().actions.redo();
    expect(result).toBe(false);
  });

  it('returns true and moves the entry from future to past', () => {
    const store = makeStore();
    store.getState().actions.set({ connectors: { a: { id: 'a' } } });
    store.getState().actions.undo();
    expect(store.getState().history.future).toHaveLength(1);
    expect(store.getState().history.past).toHaveLength(0);

    const result = store.getState().actions.redo();
    expect(result).toBe(true);
    // Entry moves: future shrinks, past grows
    expect(store.getState().history.future).toHaveLength(0);
    expect(store.getState().history.past).toHaveLength(1);
  });
});

describe('sceneStore — set() with skipHistory', () => {
  it('does not add to past when skipHistory=true', () => {
    const store = makeStore();
    store.getState().actions.set({ connectors: { a: {} } }, true);
    expect(store.getState().history.past).toHaveLength(0);
    expect(store.getState().connectors).toEqual({ a: {} });
  });

  it('adds to past when skipHistory=false (default)', () => {
    const store = makeStore();
    store.getState().actions.set({ connectors: { a: {} } });
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('clears future when a new tracked change is made', () => {
    const store = makeStore();
    store.getState().actions.set({ connectors: { a: {} } });
    store.getState().actions.undo();
    expect(store.getState().history.future).toHaveLength(1);

    store.getState().actions.set({ connectors: { b: {} } });
    expect(store.getState().history.future).toHaveLength(0);
  });
});

describe('sceneStore — history size cap', () => {
  it('caps past at MAX_HISTORY_SIZE (50) entries', () => {
    const store = makeStore();
    for (let i = 0; i < 55; i++) {
      store.getState().actions.set({ connectors: { [String(i)]: {} } });
    }
    expect(store.getState().history.past.length).toBeLessThanOrEqual(50);
  });
});

describe('sceneStore — clearHistory()', () => {
  it('resets past and future to empty arrays', () => {
    const store = makeStore();
    store.getState().actions.set({ connectors: { a: {} } });
    store.getState().actions.set({ connectors: { b: {} } });
    store.getState().actions.undo();
    expect(store.getState().history.past).toHaveLength(1);
    expect(store.getState().history.future).toHaveLength(1);

    store.getState().actions.clearHistory();
    expect(store.getState().history.past).toHaveLength(0);
    expect(store.getState().history.future).toHaveLength(0);
  });

  it('prevents pendingPre from being used after clearHistory', () => {
    const store = makeStore();
    // saveToHistory sets pendingPre; clearHistory should null it out
    store.getState().actions.saveToHistory();
    store.getState().actions.clearHistory();
    // next set with skipHistory=true should not record anything
    store.getState().actions.set({ connectors: { a: {} } }, true);
    expect(store.getState().history.past).toHaveLength(0);
  });
});

describe('sceneStore — saveToHistory() + set()', () => {
  it('saveToHistory() captures pre-state so next set() records a diff', () => {
    const store = makeStore();
    store.getState().actions.set({ connectors: { a: {} } }, true); // skipHistory, no record

    store.getState().actions.saveToHistory(); // manually capture pre
    store.getState().actions.set({ connectors: { b: {} } }, true); // skipHistory but pendingPre is set

    // pendingPre was set, so even with skipHistory=true a diff is recorded
    expect(store.getState().history.past).toHaveLength(1);
  });
});
