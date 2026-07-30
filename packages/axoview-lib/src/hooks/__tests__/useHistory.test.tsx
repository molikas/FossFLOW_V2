import { renderHook, act } from '@testing-library/react';
import { useHistory } from '../useHistory';

// Mock implementations
const mockModelStore = {
  canUndo: jest.fn(),
  canRedo: jest.fn(),
  undo: jest.fn(),
  redo: jest.fn(),
  saveToHistory: jest.fn(),
  clearHistory: jest.fn()
};

// Stable across renders, as the real provider-scoped session is.
const mockEditSession = {
  transactionInProgress: false,
  dragInProgress: false,
  pendingState: null as unknown
};

const mockSceneStore = {
  canUndo: jest.fn(),
  canRedo: jest.fn(),
  undo: jest.fn(),
  redo: jest.fn(),
  saveToHistory: jest.fn(),
  clearHistory: jest.fn()
};

// Mock the store hooks
jest.mock('../../stores/modelStore', () => ({
  useModelStore: jest.fn((selector) => {
    const state = {
      actions: mockModelStore
    };
    return selector ? selector(state) : state;
  })
}));

// E1/HIST-08 (owner ruling 2026-07-30): `useHistory.transaction` delegates to
// `useSceneActions.transaction` — one grouping primitive. This suite is about
// the undo/redo COORDINATION, so the delegate is stubbed here and the grouping
// behaviour itself is covered by `hooks/__tests__/historyBrackets.test.tsx`
// against the real stores.
const mockSceneTransaction = jest.fn((ops: () => void) => {
  mockEditSession.transactionInProgress = true;
  try {
    ops();
  } finally {
    mockEditSession.transactionInProgress = false;
  }
});
jest.mock('../../hooks/useSceneActions', () => ({
  useSceneActions: () => ({ transaction: mockSceneTransaction })
}));

jest.mock('../../stores/sceneStore', () => ({
  useSceneStore: jest.fn((selector) => {
    const state = {
      actions: mockSceneStore
    };
    return selector ? selector(state) : state;
  }),
  // E1/HIST-08: the transaction bracket lives on the scene store's
  // provider-scoped `editSession`, shared with `useSceneActions`. This mocked
  // store carries one so the hook exercises the real path rather than its
  // no-provider fallback.
  useSceneStoreApi: jest.fn(() => ({
    getState: () => ({ actions: { editSession: mockEditSession } })
  }))
}));

// useHistory subscribes to the uiState store for the post-undo/redo scene
// re-sync (D4-2). No active view here → resyncScene early-returns, so these
// undo/redo coordination tests exercise only the dual-stack logic.
jest.mock('../../stores/uiStateStore', () => ({
  useUiStateStore: jest.fn((selector) => {
    const state = { view: undefined };
    return selector ? selector(state) : state;
  })
}));

describe('useHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockModelStore.canUndo.mockReturnValue(false);
    mockModelStore.canRedo.mockReturnValue(false);
    mockModelStore.undo.mockReturnValue(true);
    mockModelStore.redo.mockReturnValue(true);

    mockSceneStore.canUndo.mockReturnValue(false);
    mockSceneStore.canRedo.mockReturnValue(false);
    mockSceneStore.undo.mockReturnValue(true);
    mockSceneStore.redo.mockReturnValue(true);
  });

  describe('undo/redo basic functionality', () => {
    it('should initialize with no undo/redo capability', () => {
      const { result } = renderHook(() => useHistory());

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('should call saveToHistory on both stores', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.saveToHistory();
      });

      expect(mockModelStore.saveToHistory).toHaveBeenCalled();
      expect(mockSceneStore.saveToHistory).toHaveBeenCalled();
    });

    it('should perform undo when model store has history', () => {
      mockModelStore.canUndo.mockReturnValue(true);
      const { result } = renderHook(() => useHistory());

      expect(result.current.canUndo).toBe(true);

      act(() => {
        const success = result.current.undo();
        expect(success).toBe(true);
      });

      expect(mockModelStore.undo).toHaveBeenCalled();
    });

    it('should perform undo when scene store has history', () => {
      mockSceneStore.canUndo.mockReturnValue(true);
      const { result } = renderHook(() => useHistory());

      expect(result.current.canUndo).toBe(true);

      act(() => {
        const success = result.current.undo();
        expect(success).toBe(true);
      });

      expect(mockSceneStore.undo).toHaveBeenCalled();
    });

    it('should perform redo when model store has future', () => {
      mockModelStore.canRedo.mockReturnValue(true);
      const { result } = renderHook(() => useHistory());

      expect(result.current.canRedo).toBe(true);

      act(() => {
        const success = result.current.redo();
        expect(success).toBe(true);
      });

      expect(mockModelStore.redo).toHaveBeenCalled();
    });

    it('should return false when undo is called with no history', () => {
      mockModelStore.undo.mockReturnValue(false);
      mockSceneStore.undo.mockReturnValue(false);

      const { result } = renderHook(() => useHistory());

      act(() => {
        const success = result.current.undo();
        expect(success).toBe(false);
      });
    });

    it('should return false when redo is called with no future', () => {
      mockModelStore.redo.mockReturnValue(false);
      mockSceneStore.redo.mockReturnValue(false);

      const { result } = renderHook(() => useHistory());

      act(() => {
        const success = result.current.redo();
        expect(success).toBe(false);
      });
    });
  });

  describe('transaction functionality', () => {
    it('delegates to the one grouping primitive rather than reimplementing it', () => {
      const { result } = renderHook(() => useHistory());
      const ops = jest.fn();

      act(() => {
        result.current.transaction(ops);
      });

      expect(mockSceneTransaction).toHaveBeenCalledTimes(1);
      expect(ops).toHaveBeenCalledTimes(1);
    });

    it('reports the shared bracket through isInTransaction()', () => {
      const { result } = renderHook(() => useHistory());

      expect(result.current.isInTransaction()).toBe(false);

      act(() => {
        result.current.transaction(() => {
          expect(result.current.isInTransaction()).toBe(true);
        });
      });

      expect(result.current.isInTransaction()).toBe(false);
    });

    it('does not save history while the shared bracket is open', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.transaction(() => {
          result.current.saveToHistory();
        });
      });

      // The delegate owns the pre-snapshot; `saveToHistory` inside the bracket
      // must add nothing on top of it.
      expect(mockModelStore.saveToHistory).not.toHaveBeenCalled();
      expect(mockSceneStore.saveToHistory).not.toHaveBeenCalled();
    });

    it('leaves the bracket closed when the operations throw', () => {
      const { result } = renderHook(() => useHistory());

      expect(() => {
        act(() => {
          result.current.transaction(() => {
            throw new Error('Test error');
          });
        });
      }).toThrow('Test error');

      expect(result.current.isInTransaction()).toBe(false);
    });
  });

  describe('history management', () => {
    it('should clear all history', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.clearHistory();
      });

      expect(mockModelStore.clearHistory).toHaveBeenCalled();
      expect(mockSceneStore.clearHistory).toHaveBeenCalled();
    });

    it('should check both stores for undo capability', () => {
      // Only model has undo
      mockModelStore.canUndo.mockReturnValue(true);
      mockSceneStore.canUndo.mockReturnValue(false);

      const { result: result1 } = renderHook(() => useHistory());
      expect(result1.current.canUndo).toBe(true);

      // Only scene has undo
      mockModelStore.canUndo.mockReturnValue(false);
      mockSceneStore.canUndo.mockReturnValue(true);

      const { result: result2 } = renderHook(() => useHistory());
      expect(result2.current.canUndo).toBe(true);

      // Both have undo
      mockModelStore.canUndo.mockReturnValue(true);
      mockSceneStore.canUndo.mockReturnValue(true);

      const { result: result3 } = renderHook(() => useHistory());
      expect(result3.current.canUndo).toBe(true);

      // Neither has undo
      mockModelStore.canUndo.mockReturnValue(false);
      mockSceneStore.canUndo.mockReturnValue(false);

      const { result: result4 } = renderHook(() => useHistory());
      expect(result4.current.canUndo).toBe(false);
    });

    it('should check both stores for redo capability', () => {
      // Only model has redo
      mockModelStore.canRedo.mockReturnValue(true);
      mockSceneStore.canRedo.mockReturnValue(false);

      const { result: result1 } = renderHook(() => useHistory());
      expect(result1.current.canRedo).toBe(true);

      // Only scene has redo
      mockModelStore.canRedo.mockReturnValue(false);
      mockSceneStore.canRedo.mockReturnValue(true);

      const { result: result2 } = renderHook(() => useHistory());
      expect(result2.current.canRedo).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle missing store actions gracefully', () => {
      // Mock stores returning undefined actions
      const useModelStore = require('../../stores/modelStore').useModelStore;
      const useSceneStore = require('../../stores/sceneStore').useSceneStore;

      useModelStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = { actions: undefined };
        return selector ? selector(state) : state;
      });
      useSceneStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = { actions: undefined };
        return selector ? selector(state) : state;
      });

      const { result } = renderHook(() => useHistory());

      // Should not throw and return safe defaults
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);

      act(() => {
        expect(result.current.undo()).toBe(false);
        expect(result.current.redo()).toBe(false);
        // These should not throw
        result.current.saveToHistory();
        result.current.clearHistory();
        result.current.transaction(() => {});
      });

      // Restore mocks for other tests
      useModelStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = { actions: mockModelStore };
        return selector ? selector(state) : state;
      });
      useSceneStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = { actions: mockSceneStore };
        return selector ? selector(state) : state;
      });
    });

    it('should not save history during active transaction', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.transaction(() => {
          // Clear previous calls from transaction setup
          mockModelStore.saveToHistory.mockClear();
          mockSceneStore.saveToHistory.mockClear();

          // Try to save during transaction
          result.current.saveToHistory();

          // Should not have saved
          expect(mockModelStore.saveToHistory).not.toHaveBeenCalled();
          expect(mockSceneStore.saveToHistory).not.toHaveBeenCalled();
        });
      });
    });
  });
});
