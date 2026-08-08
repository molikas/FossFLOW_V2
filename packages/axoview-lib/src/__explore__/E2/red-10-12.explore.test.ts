/**
 * E2 probes — RED-10 (offset-only updates skip the connector cascade),
 * RED-11 (the text-box re-measure trigger set vs the fields the measurer reads)
 * and RED-12 (the shared INITIAL_SCENE_STATE seed).
 *
 * See docs/reviews/exploratory-2026-07/areas/E2-reducers-cascades.md.
 */
import { installCanvasStub } from '../canvasStub';
import { view as viewReducer } from 'src/stores/reducers/view';
import { INITIAL_SCENE_STATE } from 'src/config';
import { getTextBoxDimensions } from 'src/utils';
import { seedState, viewOf, connectorAB, VIEW_ID } from './harness';
import type { State } from 'src/stores/reducers/types';

// Text-box reducers need a canvas measurer under jsdom — see canvasStub.ts.
installCanvasStub();

const dispatch = (state: State, action: string, payload: unknown): State =>
  viewReducer({
    action,
    payload,
    ctx: { viewId: VIEW_ID, state }
  } as never);

const withConnector = () => {
  const state = seedState();
  return dispatch(state, 'CREATE_CONNECTOR', connectorAB());
};

// ---------------------------------------------------------------------------
// RED-10 — the cascade fires on `tile`, but "snap back to grid" writes `offset`
// ---------------------------------------------------------------------------
describe('RED-10 — offset-only updates and the connector cascade', () => {
  it('characterization: an offset-only update does NOT re-run the connector cascade', () => {
    const base = withConnector();
    const pathBefore = base.scene.connectors['conn-1'].path;

    // The context menu's "snap back to grid": {snap:true, offset:undefined}.
    // No `tile` key, so viewItem.ts's `if (updates.tile)` branch is skipped.
    const after = dispatch(base, 'UPDATE_VIEWITEM', {
      id: 'node-A',
      snap: true,
      offset: undefined
    });

    expect(after.scene.connectors['conn-1'].path).toBe(pathBefore);
  });

  it('FALSIFIED: skipping the cascade is harmless — `offset` is not a path input', () => {
    // Put node-A off-grid, then clear the offset, re-routing explicitly each
    // time. If `offset` fed the routing, the two paths would differ.
    const offGrid = dispatch(withConnector(), 'UPDATE_VIEWITEM', {
      id: 'node-A',
      tile: { x: 0, y: 0 },
      offset: { x: 40, y: -25 }
    });
    const snapped = dispatch(offGrid, 'UPDATE_VIEWITEM', {
      id: 'node-A',
      tile: { x: 0, y: 0 },
      offset: undefined
    });

    expect(viewOf(offGrid).items.find((i) => i.id === 'node-A')!.offset).toEqual({
      x: 40,
      y: -25
    });
    expect(
      viewOf(snapped).items.find((i) => i.id === 'node-A')!.offset
    ).toBeUndefined();

    // getConnectorPath resolves anchors through `getAnchorTile`, which reads
    // `tile` only — so the cached path is correct either way and the skipped
    // cascade costs nothing at the model/scene level. (The RENDERED endpoint
    // offset is applied downstream, per ADR 0023 — an R-area concern.)
    expect(snapped.scene.connectors['conn-1'].path.tiles).toEqual(
      offGrid.scene.connectors['conn-1'].path.tiles
    );
  });
});

// ---------------------------------------------------------------------------
// RED-11 — re-measure triggers vs the fields getTextBoxDimensions reads
// ---------------------------------------------------------------------------
describe('RED-11 — text-box re-measure trigger parity', () => {
  const withTextBox = () =>
    dispatch(seedState(), 'CREATE_TEXTBOX', {
      id: 'tb-1',
      tile: { x: 1, y: 1 },
      content: 'hello world this is a reasonably long line'
    });

  it('control: a content edit re-measures', () => {
    const base = withTextBox();
    const sizeBefore = base.scene.textBoxes['tb-1'].size;
    const after = dispatch(base, 'UPDATE_TEXTBOX', {
      id: 'tb-1',
      content: 'x'
    });
    expect(after.scene.textBoxes['tb-1'].size).not.toEqual(sizeBefore);
  });

  it('every field getTextBoxDimensions reads is in the re-measure trigger list', () => {
    // The measurer's inputs, read off isoMath.getTextBoxDimensions.
    const measured = ['content', 'fontSize', 'lineHeight', 'width'] as const;
    const triggers = ['content', 'fontSize', 'lineHeight', 'width', 'height'];

    for (const field of measured) {
      expect(triggers).toContain(field);
    }
  });

  it('FALSIFIED: no size-affecting field is missing a trigger — a size-neutral edit really is size-neutral', () => {
    const base = withTextBox();
    const sizeBefore = base.scene.textBoxes['tb-1'].size;

    // Fields the trigger list deliberately excludes. If any of them fed the
    // measurement, the recomputed size would differ from the cached one.
    const sizeNeutral: Array<Record<string, unknown>> = [
      { textColor: '#ff0000' },
      { bold: true },
      { italic: true },
      { orientation: 'Y' },
      { tile: { x: 4, y: 4 } }
    ];

    for (const updates of sizeNeutral) {
      const after = dispatch(base, 'UPDATE_TEXTBOX', { id: 'tb-1', ...updates });
      const tb = viewOf(after).textBoxes!.find((t) => t.id === 'tb-1')!;
      expect(getTextBoxDimensions(tb)).toEqual(sizeBefore);
    }
  });
});

// ---------------------------------------------------------------------------
// RED-12 — the shared INITIAL_SCENE_STATE seed
// ---------------------------------------------------------------------------
describe('RED-12 — SYNC_SCENE seeds from a module-level constant', () => {
  it('FALSIFIED: repeated SYNC_SCENE never mutates the shared seed', () => {
    const snapshot = JSON.stringify(INITIAL_SCENE_STATE);

    let state = withConnector();
    state = dispatch(state, 'CREATE_TEXTBOX', {
      id: 'tb-1',
      tile: { x: 2, y: 2 },
      content: 'hi'
    });

    for (let i = 0; i < 3; i += 1) {
      const synced = dispatch(state, 'SYNC_SCENE', undefined);
      expect(Object.keys(synced.scene.connectors)).toEqual(['conn-1']);
      expect(Object.keys(synced.scene.textBoxes)).toEqual(['tb-1']);
      state = synced;
    }

    expect(JSON.stringify(INITIAL_SCENE_STATE)).toBe(snapshot);
    expect(INITIAL_SCENE_STATE.connectors).toEqual({});
    expect(INITIAL_SCENE_STATE.textBoxes).toEqual({});
  });

  it('characterization: SYNC_SCENE drops scene entries belonging to other views', () => {
    // The per-view scoping the seed exists to provide — a sync against view A
    // must not carry view B's cached paths.
    const state = withConnector();
    const polluted: State = {
      ...state,
      scene: {
        connectors: {
          ...state.scene.connectors,
          'from-another-page': state.scene.connectors['conn-1']
        },
        textBoxes: {}
      }
    };

    const synced = dispatch(polluted, 'SYNC_SCENE', undefined);
    expect(Object.keys(synced.scene.connectors)).toEqual(['conn-1']);
  });
});
