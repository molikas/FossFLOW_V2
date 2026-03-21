/**
 * REGRESSION — modelStore history with REAL store (no mocks)
 *
 * These tests exercise the actual Zustand store history implementation to catch
 * regressions that mocked-store tests cannot (e.g. overflow trim, real undo data).
 *
 * Contracts:
 *  1. undo/redo round-trip: state is restored to the prior value after undo
 *  2. canUndo is false on fresh store, true after a mutation
 *  3. redo stack cleared when a new mutation is made after undo
 *  4. Overflow: after MAX_HISTORY_SIZE+1 saves, past.length is capped at MAX_HISTORY_SIZE
 *  5. transaction — exactly 1 history entry for N sequential operations
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from '../../stores/modelStore';
import { SceneProvider } from '../../stores/sceneStore';
import { useHistory } from '../useHistory';

// ---------------------------------------------------------------------------
// Wrapper: provides both required store contexts
// ---------------------------------------------------------------------------
const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <SceneProvider>
      {children}
    </SceneProvider>
  </ModelProvider>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupModelApi() {
  return renderHook(() => useModelStoreApi(), { wrapper: AllProviders });
}

function setupHistory() {
  return renderHook(() => useHistory(), { wrapper: AllProviders });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('modelStore history — real store', () => {
  test('1. undo restores the previous title value', () => {
    const { result } = setupModelApi();
    const api = result.current;

    act(() => { api.getState().actions.set({ title: 'Version A' }); });
    act(() => { api.getState().actions.set({ title: 'Version B' }); });

    expect(api.getState().title).toBe('Version B');
    expect(api.getState().actions.canUndo()).toBe(true);

    act(() => { api.getState().actions.undo(); });
    expect(api.getState().title).toBe('Version A');
  });

  test('2. canUndo is false on fresh store, true after first mutation', () => {
    const { result } = setupModelApi();
    const api = result.current;

    expect(api.getState().actions.canUndo()).toBe(false);

    act(() => { api.getState().actions.set({ title: 'Changed' }); });
    expect(api.getState().actions.canUndo()).toBe(true);
  });

  test('3. redo stack cleared after a new mutation following undo', () => {
    const { result } = setupModelApi();
    const api = result.current;

    act(() => { api.getState().actions.set({ title: 'A' }); });
    act(() => { api.getState().actions.set({ title: 'B' }); });
    act(() => { api.getState().actions.undo(); });

    // Now there's a future entry
    expect(api.getState().actions.canRedo()).toBe(true);

    // New mutation clears redo stack
    act(() => { api.getState().actions.set({ title: 'C' }); });
    expect(api.getState().actions.canRedo()).toBe(false);
  });

  test('4. overflow: past is capped at MAX_HISTORY_SIZE (50) after 51 saves', () => {
    const { result } = setupModelApi();
    const api = result.current;

    // Trigger 51 mutations (each calls saveToHistory before the set)
    for (let i = 0; i < 51; i++) {
      act(() => { api.getState().actions.set({ title: `Step ${i}` }); });
    }

    // past should be capped at 50 (oldest entry was shifted off)
    expect(api.getState().history.past.length).toBeLessThanOrEqual(50);
  });

  test('5. redo round-trip: undo then redo returns to the later value', () => {
    const { result } = setupModelApi();
    const api = result.current;

    act(() => { api.getState().actions.set({ title: 'First' }); });
    act(() => { api.getState().actions.set({ title: 'Second' }); });
    act(() => { api.getState().actions.undo(); });
    expect(api.getState().title).toBe('First');
    expect(api.getState().actions.canRedo()).toBe(true);

    act(() => { api.getState().actions.redo(); });
    expect(api.getState().title).toBe('Second');
    expect(api.getState().actions.canRedo()).toBe(false);
  });
});

describe('useHistory.transaction — real store', () => {
  // Use a single renderHook that returns BOTH hooks so they share the same context
  function setupCombined() {
    return renderHook(
      () => ({ history: useHistory(), modelApi: useModelStoreApi() }),
      { wrapper: AllProviders }
    );
  }

  test('6. transaction creates exactly 1 history checkpoint for 3 operations', () => {
    const { result } = setupCombined();

    const pastBefore = result.current.modelApi.getState().history.past.length;

    act(() => {
      result.current.history.transaction(() => {
        // Use skipHistory=true to prevent individual set() calls from adding entries
        result.current.modelApi.getState().actions.set({ title: 'Op1' }, true);
        result.current.modelApi.getState().actions.set({ title: 'Op2' }, true);
        result.current.modelApi.getState().actions.set({ title: 'Op3' }, true);
      });
    });

    // transaction() calls modelActions.saveToHistory() exactly once before the operations
    const pastAfter = result.current.modelApi.getState().history.past.length;
    expect(pastAfter).toBe(pastBefore + 1);
    expect(result.current.modelApi.getState().title).toBe('Op3');
  });

  test('7. nested transaction is treated as single checkpoint', () => {
    const { result } = setupCombined();

    const pastBefore = result.current.modelApi.getState().history.past.length;

    act(() => {
      result.current.history.transaction(() => {
        // Outer transaction saves 1 checkpoint
        result.current.history.transaction(() => {
          // Nested — should NOT save another checkpoint
          result.current.modelApi.getState().actions.set({ title: 'Nested' }, true);
        });
      });
    });

    // Still only 1 checkpoint saved (not 2)
    expect(result.current.modelApi.getState().history.past.length).toBe(pastBefore + 1);
  });
});
