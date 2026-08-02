/**
 * REGRESSION — E1/HIST-10 page-stamped history entries, and E1/HIST-04 riding
 * it (creating a page is undoable).
 *
 * Owner ruling (DECISIONS.md 2026-07-30, brief signed off 2026-08-02):
 * *always navigate* — every history entry is stamped with the page that was
 * active when its action was performed, and undo/redo switches to that page
 * when it targets a non-active one, so the effect of a step is never
 * off-screen.
 *
 * Real stores throughout. The two behaviours under test are cross-store
 * (a stamp written by modelStore + sceneStore, consumed by useHistory, acted on
 * through useSceneActions.switchView), so a mocked-store suite cannot see them.
 *
 * Promoted from `__explore__/E1/hist-04.explore.test.tsx` and
 * `tests-exploratory/E1-history/hist-09-10.explore.spec.ts`. Self-contained by
 * design: the main suite must not import the tsc-excluded probe lane.
 *
 * The seed carries TWO fully-populated pages rather than creating the second
 * one empty: a connector drawn on a page whose nodes are absent routes as
 * `unroutable`, which is a different code path from the one these tests are
 * about.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { useHistory } from 'src/hooks/useHistory';

const PAGE_1 = 'view-1';
const PAGE_2 = 'view-2';

const Providers = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <SceneProvider>
      <UiStateProvider>{children}</UiStateProvider>
    </SceneProvider>
  </ModelProvider>
);

const useTestHarness = () => ({
  scene: useScene(),
  history: useHistory(),
  modelApi: useModelStoreApi(),
  sceneApi: useSceneStoreApi(),
  uiStateApi: useUiStateStoreApi()
});

type Harness = ReturnType<typeof setup>;

const pageWith = (id: string, name: string) => ({
  id,
  name,
  items: [
    { id: 'node-A', tile: { x: 0, y: 0 } },
    { id: 'node-B', tile: { x: 5, y: 5 } }
  ],
  connectors: [],
  rectangles: [],
  textBoxes: []
});

const seedModel = () => ({
  version: '1.0',
  title: 'Test',
  icons: [{ id: 'block', name: 'Block', url: '', isIsometric: true }],
  colors: [{ id: 'c1', value: '#0066cc' }],
  items: [
    { id: 'node-A', name: 'A', icon: 'block' },
    { id: 'node-B', name: 'B', icon: 'block' }
  ],
  views: [pageWith(PAGE_1, 'Page 1'), pageWith(PAGE_2, 'Page 2')]
});

function setup() {
  const { result } = renderHook(useTestHarness, { wrapper: Providers });
  act(() => {
    result.current.uiStateApi.getState().actions.setView(PAGE_1);
    result.current.modelApi.getState().actions.set(seedModel(), true);
    result.current.sceneApi
      .getState()
      .actions.set({ connectors: {}, textBoxes: {} }, true);
    result.current.modelApi.getState().actions.clearHistory();
    result.current.sceneApi.getState().actions.clearHistory();
  });
  return result;
}

const activeView = (r: Harness) => r.current.uiStateApi.getState().view;
const viewIds = (r: Harness) =>
  r.current.modelApi.getState().views.map((v) => v.id);
const depths = (r: Harness) => ({
  modelPast: r.current.modelApi.getState().history.past.length,
  scenePast: r.current.sceneApi.getState().history.past.length,
  modelFuture: r.current.modelApi.getState().history.future.length,
  sceneFuture: r.current.sceneApi.getState().history.future.length
});

const goTo = (r: Harness, viewId: string) =>
  act(() => {
    r.current.scene.switchView(viewId);
  });

const undo = (r: Harness) =>
  act(() => {
    r.current.history.undo();
  });

const redo = (r: Harness) =>
  act(() => {
    r.current.history.redo();
  });

/** Create a new page and return its id. Leaves the new page active. */
function addPage(r: Harness, name = 'Page 3'): string {
  const before = new Set(viewIds(r));
  act(() => {
    r.current.scene.createView({ name });
  });
  return viewIds(r).find((id) => !before.has(id))!;
}

/** A logical action that writes BOTH stacks, on whatever page is active. */
function drawConnector(r: Harness, id: string) {
  act(() => {
    r.current.scene.beginDragTransaction();
    r.current.scene.createConnector({
      id,
      color: 'c1',
      anchors: [
        { id: `${id}-a1`, ref: { item: 'node-A' } },
        { id: `${id}-a2`, ref: { item: 'node-A' } }
      ]
    });
    r.current.scene.updateConnector(id, {
      anchors: [
        { id: `${id}-a1`, ref: { item: 'node-A' } },
        { id: `${id}-a2`, ref: { item: 'node-B' } }
      ]
    });
    r.current.scene.commitDragTransaction();
  });
}

// ---------------------------------------------------------------------------
// The ruling: undo/redo navigates to the page the entry was recorded on
// ---------------------------------------------------------------------------
describe('HIST-10 — undo/redo navigates to the entry page', () => {
  test('undoing a delete of the ACTIVE page puts the user back on that page', () => {
    const r = setup();
    goTo(r, PAGE_2);

    act(() => {
      r.current.scene.deleteView(PAGE_2);
    });
    expect(viewIds(r)).toEqual([PAGE_1]);
    expect(activeView(r)).toBe(PAGE_1); // deleteView falls back to views[0]

    undo(r);

    // Before HIST-10 the page came back in the model but `ui.view` stayed on
    // page 1: the tab reappeared and the canvas did not change.
    expect(viewIds(r)).toContain(PAGE_2);
    expect(activeView(r)).toBe(PAGE_2);
  });

  test('an edit made on another page is undone WITH a switch to that page', () => {
    const r = setup();
    drawConnector(r, 'conn-1'); // on page 1
    goTo(r, PAGE_2);

    undo(r);

    expect(activeView(r)).toBe(PAGE_1);
  });

  test('redo returns to the page the action was ORIGINALLY performed on (§5 Q2)', () => {
    const r = setup();
    drawConnector(r, 'conn-1'); // on page 1
    goTo(r, PAGE_2);
    undo(r);
    expect(activeView(r)).toBe(PAGE_1);

    // Walk away again, then redo. The stamp is page 1 — where the connector was
    // drawn — not "the page I pressed undo from".
    goTo(r, PAGE_2);
    redo(r);
    expect(activeView(r)).toBe(PAGE_1);
  });

  test('EVERY step navigates — two undos in a row move the viewport twice (§5 Q1)', () => {
    const r = setup();
    drawConnector(r, 'conn-1'); // page 1
    goTo(r, PAGE_2);
    drawConnector(r, 'conn-2'); // page 2

    // Undo #1 reverts the page-2 action; we are already there, so no move.
    undo(r);
    expect(activeView(r)).toBe(PAGE_2);

    // Undo #2 reverts the page-1 action and takes us back.
    undo(r);
    expect(activeView(r)).toBe(PAGE_1);
  });

  test('an entry with NO page stamp stays put (undefined ≠ views[0])', () => {
    const r = setup();
    goTo(r, PAGE_2);

    // A document-level edit: no coordinator supplies a page, so the entry
    // carries no stamp.
    act(() => {
      r.current.modelApi.getState().actions.set({ title: 'Renamed doc' });
    });
    expect(
      r.current.modelApi.getState().history.past.at(-1)!.viewId
    ).toBeUndefined();

    undo(r);

    expect(r.current.modelApi.getState().title).toBe('Test');
    expect(activeView(r)).toBe(PAGE_2); // stayed put, did NOT jump to views[0]
  });

  test('a stamp naming a page that is no longer in the model does not navigate', () => {
    const r = setup();
    goTo(r, PAGE_2);
    drawConnector(r, 'conn-1'); // stamped PAGE_2 on both stacks
    goTo(r, PAGE_1);

    // Drop the MODEL half (HIST-03's asymmetric trim) so nothing can put page 2
    // back — every inverse patch replaces the whole `views` array (HIST-06), so
    // a surviving model entry would simply restore it and the guard would never
    // be asked. Then remove page 2 with a `skipHistory` write, the shape any
    // background writer has.
    act(() => {
      r.current.modelApi.getState().actions.clearHistory();
      const model = r.current.modelApi.getState();
      model.actions.set(
        { views: model.views.filter((v) => v.id !== PAGE_2) },
        true
      );
    });
    expect(viewIds(r)).toEqual([PAGE_1]);

    undo(r); // the scene half steps, carrying a stamp for a page that is gone

    // It must not navigate to the missing id — that dangling `uiState.view`
    // (E3/SCN-09) is exactly what this change exists to stop producing.
    expect(activeView(r)).toBe(PAGE_1);
    expect(viewIds(r)).toContain(activeView(r));
  });

  test('navigation runs on a HALF-stepped action rather than being suppressed (§5 Q3)', () => {
    const r = setup();
    drawConnector(r, 'conn-1'); // page 1, both stacks
    expect(depths(r).scenePast).toBeGreaterThan(0);

    // Simulate HIST-03's asymmetric trim: the model half of the action is gone,
    // the scene half survives. The owner ruled fail-visible over fail-silent —
    // the surviving half still carries the page and still navigates.
    act(() => {
      r.current.modelApi.getState().actions.clearHistory();
    });
    goTo(r, PAGE_2);

    undo(r);

    expect(activeView(r)).toBe(PAGE_1);
  });
});

// ---------------------------------------------------------------------------
// MANDATORY (owner sign-off) #1 — the two stores' stamps agree
// ---------------------------------------------------------------------------
describe('HIST-10 — both stores stamp the same page for one logical action', () => {
  test('every seq present on both stacks carries the same viewId on both', () => {
    const r = setup();
    drawConnector(r, 'conn-1'); // page 1
    goTo(r, PAGE_2);
    drawConnector(r, 'conn-2'); // page 2

    const modelBySeq = new Map(
      r.current.modelApi.getState().history.past.map((e) => [e.seq, e.viewId])
    );
    const sceneBySeq = new Map(
      r.current.sceneApi.getState().history.past.map((e) => [e.seq, e.viewId])
    );

    // CONTROL: the sweep must actually have pairs to compare, or a stamp that
    // never lands would pass this vacuously.
    const shared = [...modelBySeq.keys()].filter((s) => sceneBySeq.has(s));
    expect(shared.length).toBeGreaterThan(0);

    for (const seq of shared) {
      expect(sceneBySeq.get(seq)).toBe(modelBySeq.get(seq));
    }

    // …and they are the pages the work was actually done on.
    expect(new Set(shared.map((s) => modelBySeq.get(s)))).toEqual(
      new Set([PAGE_1, PAGE_2])
    );
  });

  test('the stamp is the page active at RECORD time, not the page on screen later', () => {
    const r = setup();
    drawConnector(r, 'conn-1');
    expect(r.current.modelApi.getState().history.past.at(-1)!.viewId).toBe(
      PAGE_1
    );

    goTo(r, PAGE_2);

    // Moving does not rewrite the entry.
    expect(r.current.modelApi.getState().history.past.at(-1)!.viewId).toBe(
      PAGE_1
    );
    expect(r.current.sceneApi.getState().history.past.at(-1)!.viewId).toBe(
      PAGE_1
    );
  });
});

// ---------------------------------------------------------------------------
// MANDATORY (owner sign-off) #2 — navigation records no history
//
// The failure mode this guards is a LOOP: if navigating pushed an entry, the
// undo that navigated would leave a fresh entry on top of the stack for the
// next undo to consume, and Ctrl+Z would never drain.
// ---------------------------------------------------------------------------
describe('HIST-10 — navigation records no history', () => {
  const EMPTY = { modelPast: 0, scenePast: 0, modelFuture: 0, sceneFuture: 0 };

  test('setView alone pushes nothing onto either stack', () => {
    const r = setup();

    act(() => {
      r.current.uiStateApi.getState().actions.setView(PAGE_2);
    });
    expect(depths(r)).toEqual(EMPTY);

    act(() => {
      r.current.uiStateApi.getState().actions.setView(PAGE_1);
    });
    expect(depths(r)).toEqual(EMPTY);
  });

  test('an undo that NAVIGATES does not grow either past stack', () => {
    const r = setup();
    drawConnector(r, 'conn-1');
    goTo(r, PAGE_2);

    const before = depths(r);
    undo(r);
    const after = depths(r);

    expect(activeView(r)).toBe(PAGE_1); // it really did navigate
    expect(after.modelPast).toBeLessThan(before.modelPast);
    expect(after.scenePast).toBeLessThanOrEqual(before.scenePast);
  });

  test('repeated undo terminates — canUndo goes false and stays false', () => {
    const r = setup();
    drawConnector(r, 'conn-1'); // page 1
    goTo(r, PAGE_2);
    drawConnector(r, 'conn-2'); // page 2

    // Drain. Two logical actions were recorded and each navigates, so it must
    // take exactly two steps: an extra step means a navigation left an entry
    // behind for the next Ctrl+Z to consume. The bound only stops a true
    // runaway from hanging the suite.
    let steps = 0;
    while (r.current.history.canUndo && steps < 50) {
      undo(r);
      steps += 1;
    }

    expect(steps).toBe(2);
    expect(r.current.history.canUndo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HIST-04 — creating a page is undoable, riding the page stamp
// ---------------------------------------------------------------------------
describe('HIST-04 — creating a page is undoable', () => {
  test('createView records exactly one entry (create/delete are symmetric)', () => {
    const r = setup();

    const beforeCreate = depths(r).modelPast;
    const page3 = addPage(r);
    const afterCreate = depths(r).modelPast;

    act(() => {
      r.current.scene.deleteView(page3);
    });
    const afterDelete = depths(r).modelPast;

    expect(afterCreate - beforeCreate).toBe(1);
    expect(afterDelete - afterCreate).toBe(1);
  });

  test('Ctrl+Z after "New page" removes the page and returns to the page it was created from', () => {
    const r = setup();
    act(() => {
      r.current.scene.updateView(PAGE_1, { name: 'Renamed page' });
    });

    const page3 = addPage(r);
    expect(activeView(r)).toBe(page3);

    undo(r);

    // The undo removes the page just created — not the rename before it.
    expect(viewIds(r)).not.toContain(page3);
    expect(r.current.modelApi.getState().views[0].name).toBe('Renamed page');
    // …and leaves the active view pointing at a page that EXISTS. Recording
    // createView without the page stamp is what would have stranded `ui.view`
    // on the deleted id (E3/SCN-09).
    expect(activeView(r)).toBe(PAGE_1);
    expect(viewIds(r)).toContain(activeView(r));
  });

  test('redoing the creation brings the page back', () => {
    const r = setup();
    const page3 = addPage(r);

    undo(r);
    expect(viewIds(r)).not.toContain(page3);

    redo(r);
    expect(viewIds(r)).toContain(page3);
    expect(viewIds(r)).toContain(activeView(r));
  });
});
