/**
 * E4 probes — clipboard fidelity, notification contention and unchecked model
 * shapes.
 *
 *  CLIP-08  a preserveViewport load leaves the previous diagram's selection
 *  CLIP-10  the single notification slot loses an error under a later toast
 *  CLIP-11  ADR 0023's off-grid trio across a clipboard round trip
 *  CLIP-12  ADR 0044's iconScale across a clipboard round trip
 *  CLIP-13  a group icon-resize can commit a scale outside the schema cap
 *  CLIP-14  a pasted node whose icon the target model lacks
 *  CLIP-15  tile-coordinate sanity
 *
 * See docs/exploratory/areas/E4-clipboard-schemas-load.md.
 */
import { renderHook } from '@testing-library/react';
import { installCanvasStub } from '../canvasStub';
import { ClipboardProviders, act, modelView, VIEW_ID } from '../E3/harness';
import { useTestHarness } from '../E1/harness';
import { useCopyPaste } from 'src/clipboard/useCopyPaste';
import { modelSchema } from 'src/schemas/model';
import { validateView } from 'src/schemas/validation';

installCanvasStub();

const useHarness = () => ({ ...useTestHarness(), copyPaste: useCopyPaste() });

const seed = (viewItemExtras: Record<string, unknown> = {}) => ({
  version: '1.0',
  title: 'E4 probe',
  icons: [{ id: 'block', name: 'Block', url: 'x', isIsometric: true }],
  colors: [{ id: 'c1', value: '#0066cc' }],
  items: [{ id: 'node-A', name: 'A', icon: 'block' }],
  views: [
    {
      id: VIEW_ID,
      name: 'Page 1',
      items: [{ id: 'node-A', tile: { x: 0, y: 0 }, ...viewItemExtras }],
      connectors: [],
      rectangles: [],
      textBoxes: []
    }
  ]
});

function setupClipboard(viewItemExtras: Record<string, unknown> = {}) {
  const { result } = renderHook(useHarness, { wrapper: ClipboardProviders });
  act(() => {
    result.current.uiStateApi.getState().actions.setView(VIEW_ID);
    result.current.modelApi
      .getState()
      .actions.set(seed(viewItemExtras) as never, true);
    result.current.scene.switchView(VIEW_ID);
    result.current.modelApi.getState().actions.clearHistory();
    result.current.sceneApi.getState().actions.clearHistory();
  });
  return result;
}

function copyPasteNodeA(result: ReturnType<typeof setupClipboard>) {
  act(() => {
    result.current.uiStateApi
      .getState()
      .actions.setSelectedIds([{ type: 'ITEM', id: 'node-A' }]);
  });
  act(() => {
    result.current.copyPaste.handleCopy();
  });
  act(() => {
    const ui = result.current.uiStateApi.getState();
    ui.actions.setMouse({
      ...ui.mouse,
      position: { ...ui.mouse.position, tile: { x: 6, y: 6 } }
    });
  });
  act(() => {
    result.current.copyPaste.handlePaste();
  });
  return modelView(result as never).items.find((i) => i.id !== 'node-A')!;
}

// ---------------------------------------------------------------------------
// CLIP-08 — selection survives a preserveViewport load
// ---------------------------------------------------------------------------
describe('CLIP-08 — selection across a preserveViewport reload', () => {
  it.failing(
    'BUG: the previous diagram’s selection survives the load (INV-2)',
    () => {
      const result = setupClipboard();

      act(() => {
        result.current.uiStateApi
          .getState()
          .actions.setSelectedIds([{ type: 'ITEM', id: 'node-A' }]);
      });

      // The icon-pack-swap reload: a NEW model, preserveViewport true, so the
      // load path's selection reset is skipped.
      act(() => {
        result.current.modelApi.getState().actions.set(
          {
            ...seed(),
            items: [{ id: 'other-node', name: 'Other', icon: 'block' }],
            views: [
              {
                id: VIEW_ID,
                name: 'Page 1',
                items: [{ id: 'other-node', tile: { x: 1, y: 1 } }],
                connectors: [],
                rectangles: [],
                textBoxes: []
              }
            ]
          } as never,
          true
        );
      });

      const selected = result.current.uiStateApi.getState().selectedIds;
      const liveIds = modelView(result as never).items.map((i) => i.id);
      expect(selected.filter((s) => !liveIds.includes(s.id))).toEqual([]);
    }
  );
});

// ---------------------------------------------------------------------------
// CLIP-10 — the single notification slot
// ---------------------------------------------------------------------------
describe('CLIP-10 — notification contention', () => {
  it.failing('BUG: a later success toast silently replaces a pending error', () => {
    const result = setupClipboard();
    const ui = result.current.uiStateApi.getState().actions;

    act(() => {
      ui.setNotification({
        severity: 'error',
        message: 'Could not save your diagram'
      });
    });
    act(() => {
      ui.setNotification({ severity: 'success', message: 'Pasted 3 items' });
    });

    // An error the user has not seen must not be overwritten by an unrelated
    // success message.
    expect(
      result.current.uiStateApi.getState().notification?.severity
    ).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// CLIP-11 / CLIP-12 — clipboard fidelity for the off-grid trio and iconScale
// ---------------------------------------------------------------------------
describe('CLIP-11 — off-grid fields across copy/paste', () => {
  it('FALSIFIED: offset / snap / collides all survive a clipboard round trip', () => {
    const result = setupClipboard({
      offset: { x: 21, y: -13 },
      snap: false,
      collides: false
    });

    const pasted = copyPasteNodeA(result);

    expect(pasted.snap).toBe(false);
    expect(pasted.collides).toBe(false);
    expect(pasted.offset).toEqual({ x: 21, y: -13 });
  });
});

describe('CLIP-12 — iconScale across copy/paste', () => {
  it('FALSIFIED: a per-node iconScale survives a clipboard round trip', () => {
    const result = setupClipboard({ iconScale: 2.4 });
    const pasted = copyPasteNodeA(result);
    expect(pasted.iconScale).toBe(2.4);
  });
});

// ---------------------------------------------------------------------------
// CLIP-13 — group resize vs the schema cap
// ---------------------------------------------------------------------------
describe('CLIP-13 — iconScale outside the schema cap bricks the reload', () => {
  it('characterization: the schema hard-caps iconScale at 3', () => {
    const model = seed({ iconScale: 3.25 });
    const result = modelSchema.safeParse(model);
    expect(result.success).toBe(false);
  });

  it.failing(
    'BUG: writing an out-of-range scale through the normal action is refused',
    () => {
      const result = setupClipboard({ iconScale: 2.5 });

      // What a group resize does to each member: startScale * factor.
      act(() => {
        result.current.scene.updateViewItem('node-A', { iconScale: 2.5 * 1.3 });
      });

      const model = result.current.modelApi.getState();
      expect(
        modelSchema.safeParse({
          version: model.version,
          title: model.title,
          colors: model.colors,
          icons: model.icons,
          items: model.items,
          views: model.views
        }).success
      ).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// CLIP-14 — a node whose icon the model does not have
// ---------------------------------------------------------------------------
describe('CLIP-14 — unknown icon references', () => {
  it.failing(
    'BUG: a model item referencing a missing icon validates clean',
    () => {
      const model = seed();
      model.items = [
        { id: 'node-A', name: 'A', icon: 'icon-from-a-pack-we-never-loaded' }
      ];

      expect(modelSchema.safeParse(model).success).toBe(false);
    }
  );

  it('characterization: nothing in validateView checks icon refs either', () => {
    const model = seed();
    model.items = [
      { id: 'node-A', name: 'A', icon: 'icon-from-a-pack-we-never-loaded' }
    ];

    // Both layers pass, so the node saves and reloads as a tombstone.
    expect(modelSchema.safeParse(model).success).toBe(true);
    expect(
      validateView(model.views[0] as never, { model: model as never })
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CLIP-15 — tile-coordinate sanity
// ---------------------------------------------------------------------------
describe('CLIP-15 — tile coordinates are unchecked', () => {
  it('control: a non-finite tile coordinate IS rejected (zod z.number() excludes NaN)', () => {
    const model = seed();
    model.views[0].items = [
      { id: 'node-A', tile: { x: Number.NaN, y: 0 } }
    ] as never;

    expect(modelSchema.safeParse(model).success).toBe(false);
  });

  it.failing(
    'BUG: an absurd but finite tile loads clean with no sanity bound',
    () => {
    const model = seed();
    model.views[0].items = [
      { id: 'node-A', tile: { x: 1e12, y: -1e12 } }
    ] as never;

      // A coordinate this far out overflows the projection math and puts the
      // content somewhere no viewport can reach; nothing bounds it.
      expect(modelSchema.safeParse(model).success).toBe(false);
      expect(
        validateView(model.views[0] as never, { model: model as never }).length
      ).toBeGreaterThan(0);
    }
  );
});
