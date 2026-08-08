/**
 * E3 probes — cross-page paste.
 *
 *  SCN-14  pasted items keep their layerId, producing a dangling layer ref on a
 *          page that has no such layer
 *  SCN-15  computePathsAsync writes into whatever scene is live when its batch
 *          fires, so a page switch mid-routing lands page 1's paths in page 2
 *
 * See docs/reviews/exploratory-2026-07/areas/E3-scene-actions-paste.md.
 */
import { installCanvasStub } from '../canvasStub';
import {
  setup,
  act,
  modelView,
  makePastePayload,
  flushAnimationFrames,
  VIEW_ID
} from './harness';
import { validateView } from 'src/schemas/validation';

installCanvasStub();

const viewById = (result: ReturnType<typeof setup>, id: string) =>
  result.current.modelApi.getState().views.find((v) => v.id === id)!;

// ---------------------------------------------------------------------------
// SCN-14 — layerId rides along to a page that has no such layer
// ---------------------------------------------------------------------------
describe('SCN-14 — pasted items carry their layerId across pages', () => {
  it.failing(
    'BUG: pasting onto a page without that layer leaves a dangling layer ref',
    () => {
      const result = setup();

      // Page 1 has a layer; the pasted payload carries its id.
      act(() => {
        result.current.layers.createLayer({ name: 'Layer 1' });
      });
      const layerId = modelView(result).layers![0].id;

      act(() => {
        result.current.scene.createView({ name: 'Page 2' });
      });
      const page2Id = result.current.uiStateApi.getState().view!;
      expect(page2Id).not.toBe(VIEW_ID);
      expect(viewById(result, page2Id).layers ?? []).toHaveLength(0);

      const payload = makePastePayload(1);
      (payload as unknown as { items: { viewItem: { layerId?: string } }[] })
        .items[0].viewItem.layerId = layerId;

      act(() => {
        result.current.scene.pasteItems(payload);
      });

      const pasted = viewById(result, page2Id).items.find(
        (i) => i.id === 'p-item-0'
      )!;
      // Either the paste drops the ref, or validation flags it. Neither happens.
      expect(pasted.layerId).toBeUndefined();
    }
  );

  it('characterization: the dangling ref is invisible to validateView (RED-03 compound)', () => {
    const result = setup();

    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });
    const layerId = modelView(result).layers![0].id;

    act(() => {
      result.current.scene.createView({ name: 'Page 2' });
    });
    const page2Id = result.current.uiStateApi.getState().view!;

    const payload = makePastePayload(1);
    (payload as unknown as { items: { viewItem: { layerId?: string } }[] })
      .items[0].viewItem.layerId = layerId;

    act(() => {
      result.current.scene.pasteItems(payload);
    });

    const page2 = viewById(result, page2Id);
    expect(page2.items.find((i) => i.id === 'p-item-0')!.layerId).toBe(layerId);
    expect(page2.layers ?? []).toHaveLength(0);
    expect(
      validateView(page2, { model: result.current.modelApi.getState() })
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SCN-15 — routing batches vs a page switch
// ---------------------------------------------------------------------------
describe('SCN-15 — page switch during async connector routing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it.failing(
    'BUG: switching pages mid-routing writes page 1 paths into page 2 scene',
    () => {
      const result = setup();

      act(() => {
        result.current.scene.createView({ name: 'Page 2' });
      });
      const page2Id = result.current.uiStateApi.getState().view!;
      act(() => {
        result.current.scene.switchView(VIEW_ID);
      });

      // A paste big enough to need several rAF batches.
      act(() => {
        result.current.scene.pasteItems(makePastePayload(31));
      });
      act(() => {
        jest.advanceTimersByTime(20); // batch 1 routes 25 and re-schedules
      });

      // The user switches page while the tail is still queued.
      act(() => {
        result.current.scene.switchView(page2Id);
      });
      flushAnimationFrames();

      // Page 2 owns no connectors, so its scene must hold none.
      const sceneIds = Object.keys(
        result.current.sceneApi.getState().connectors
      );
      expect(viewById(result, page2Id).connectors ?? []).toHaveLength(0);
      expect(sceneIds).toEqual([]);
    }
  );

  it('characterization: the stale paths are the page-1 connectors', () => {
    const result = setup();

    act(() => {
      result.current.scene.createView({ name: 'Page 2' });
    });
    const page2Id = result.current.uiStateApi.getState().view!;
    act(() => {
      result.current.scene.switchView(VIEW_ID);
    });
    act(() => {
      result.current.scene.pasteItems(makePastePayload(31));
    });
    act(() => {
      jest.advanceTimersByTime(20);
    });
    act(() => {
      result.current.scene.switchView(page2Id);
    });
    flushAnimationFrames();

    const sceneIds = Object.keys(result.current.sceneApi.getState().connectors);
    expect(sceneIds.length).toBeGreaterThan(0);
    expect(sceneIds.every((id) => id.startsWith('p-conn-'))).toBe(true);
  });
});
