/**
 * E2 cluster integration — "no route produces a dangling ref, and any already
 * in a file is repaired on load."
 *
 * This is the pair wave 1's **repair-don't-reject** ruling asks for, applied to
 * the anchor graph: the WRITE SITES stop producing dangling refs (both delete
 * paths sweep), and the LOAD PATH heals the ones already in users' files. Each
 * half is necessary and neither is sufficient — a write-site fix cannot reach a
 * file the bug already wrote, and a load repair cannot stop the next delete.
 *
 * The third member is RED-02: while a dangling ref exists, it must not take the
 * editor down. That is what turned RED-07 and RED-14 from "one broken
 * connector" into "the whole page is un-editable".
 */
import { deleteViewItem } from '../viewItem';
import { deleteConnector } from '../connector';
import { updateViewItem, createViewItem } from '../viewItem';
import { repairModelIdentity } from 'src/utils/repairModel';
import { validateView } from 'src/schemas/validation';
import type { State, ViewReducerContext } from '../types';

const VIEW_ID = 'view-1';
const ctx = (state: State): ViewReducerContext => ({ viewId: VIEW_ID, state });

/**
 * node-A ── c1 ── node-B, and c2 anchored to c1's anchor (the ADR 0006
 * anchor-to-anchor ref that dropping a connector onto another produces).
 */
const chained = (): State =>
  ({
    model: {
      version: '1.0',
      title: 'E2',
      icons: [],
      colors: [],
      items: [
        { id: 'node-A', name: 'A' },
        { id: 'node-B', name: 'B' }
      ],
      views: [
        {
          id: VIEW_ID,
          name: 'Page 1',
          items: [
            { id: 'node-A', tile: { x: 0, y: 0 } },
            { id: 'node-B', tile: { x: 5, y: 5 } }
          ],
          connectors: [
            {
              id: 'c1',
              color: 'c',
              anchors: [
                { id: 'c1-a1', ref: { item: 'node-A' } },
                { id: 'c1-a2', ref: { tile: { x: 3, y: 3 } } }
              ]
            },
            {
              id: 'c2',
              color: 'c',
              anchors: [
                { id: 'c2-a1', ref: { anchor: 'c1-a2' } },
                { id: 'c2-a2', ref: { tile: { x: 8, y: 8 } } }
              ]
            }
          ],
          rectangles: [],
          textBoxes: [],
          labels: []
        }
      ]
    },
    scene: { connectors: { c1: {}, c2: {} }, textBoxes: {} }
  }) as unknown as State;

const viewOf = (s: State) => s.model.views[0];
const danglingAnchorIssues = (s: State) =>
  validateView(viewOf(s), { model: s.model }).filter(
    (i) => i.type === 'INVALID_ANCHOR_TO_ANCHOR_REF'
  );

describe('WRITE SITE — deleting a NODE leaves no dangling anchor ref (RED-07)', () => {
  it('PRECONDITION: the fixture is genuinely chained and currently valid', () => {
    const s = chained();
    expect(danglingAnchorIssues(s)).toEqual([]);
    expect(viewOf(s).connectors).toHaveLength(2);
  });

  it('the chained connector is re-pointed, not left dangling', () => {
    const out = deleteViewItem('node-A', ctx(chained()));
    // c1 goes with the node; c2 survives, re-pointed at c1-a2's last tile.
    expect(viewOf(out).connectors?.map((c) => c.id)).toEqual(['c2']);
    expect(viewOf(out).connectors?.[0].anchors[0].ref).toEqual({
      tile: { x: 3, y: 3 }
    });
    expect(danglingAnchorIssues(out)).toEqual([]);
  });

  it('and the scene entry for the removed connector goes with it', () => {
    const out = deleteViewItem('node-A', ctx(chained()));
    expect(Object.keys(out.scene.connectors)).toEqual(['c2']);
  });
});

describe('WRITE SITE — deleting a CONNECTOR leaves no dangling ref (RED-14)', () => {
  it('the sibling anchored to it is re-pointed', () => {
    const out = deleteConnector('c1', ctx(chained()));
    expect(viewOf(out).connectors?.map((c) => c.id)).toEqual(['c2']);
    expect(viewOf(out).connectors?.[0].anchors[0].ref).toEqual({
      tile: { x: 3, y: 3 }
    });
    expect(danglingAnchorIssues(out)).toEqual([]);
  });
});

describe('LOAD PATH — a dangling ref already in the file is REPAIRED (repair-don\'t-reject)', () => {
  const brokenFile = () => ({
    version: '1.0',
    title: 'E2',
    icons: [],
    colors: [],
    items: [],
    views: [
      {
        id: VIEW_ID,
        name: 'Page 1',
        items: [],
        connectors: [
          {
            id: 'c2',
            color: 'c',
            anchors: [
              { id: 'c2-a1', ref: { anchor: 'never-existed' } },
              { id: 'c2-a2', ref: { tile: { x: 8, y: 8 } } }
            ]
          }
        ]
      }
    ]
  });

  it('the ref is dropped and the file is not rejected', () => {
    const { data, report } = repairModelIdentity(brokenFile() as never);
    expect(report.danglingAnchorRefs).toBeGreaterThan(0);
    // One end left, so the connector goes — but the DOCUMENT opens.
    const view = (data.views as Array<{ connectors: unknown[] }>)[0];
    expect(view.connectors).toEqual([]);
  });

  it('CONTROL: a file with a VALID anchor ref is left alone', () => {
    const clean = brokenFile();
    (clean.views[0].connectors as unknown[]).push({
      id: 'c1',
      color: 'c',
      anchors: [
        { id: 'never-existed', ref: { tile: { x: 1, y: 1 } } },
        { id: 'c1-a2', ref: { tile: { x: 2, y: 2 } } }
      ]
    });
    const { data, report } = repairModelIdentity(clean as never);
    expect(report.danglingAnchorRefs).toBe(0);
    expect(
      (data.views as Array<{ connectors: unknown[] }>)[0].connectors
    ).toHaveLength(2);
  });
});

describe('AMPLIFIER — a pre-existing bad ref no longer breaks unrelated edits (RED-02)', () => {
  /** The chained fixture with c2 deliberately pointed at nothing. */
  const alreadyBroken = (): State => {
    const s = chained();
    (viewOf(s).connectors as Array<{ anchors: Array<{ ref: unknown }> }>)[1].anchors[0].ref =
      { anchor: 'never-existed' };
    return s;
  };

  it('PRECONDITION: the view really does carry an issue', () => {
    expect(danglingAnchorIssues(alreadyBroken()).length).toBeGreaterThan(0);
  });

  it('moving an UNRELATED node still works', () => {
    // This is the whole of RED-02: the update has nothing to do with the bad
    // ref, and used to throw because validation was scoped to the view while
    // the check was scoped to the action.
    const out = updateViewItem(
      { id: 'node-B', tile: { x: 6, y: 6 } },
      ctx(alreadyBroken())
    );
    expect(
      viewOf(out).items.find((i) => i.id === 'node-B')?.tile
    ).toEqual({ x: 6, y: 6 });
  });

  it('placing a NEW node still works too — the other half of the symptom', () => {
    // `createViewItem` funnels through `updateViewItem`, which is why placement
    // died alongside dragging.
    const out = createViewItem(
      { id: 'node-A', tile: { x: 9, y: 9 } } as never,
      ctx(alreadyBroken())
    );
    expect(viewOf(out).items).toHaveLength(3);
  });

  it('but an update that INTRODUCES an issue still THROWS — the guard keeps its teeth', () => {
    // "Ignore pre-existing" must not become "ignore everything". A view item
    // referencing a model item that does not exist is an issue this action
    // introduces, and it must still be rejected even though the view already
    // carries an unrelated one.
    expect(() =>
      createViewItem(
        { id: 'no-such-model-item', tile: { x: 1, y: 1 } } as never,
        ctx(alreadyBroken())
      )
    ).toThrow();
  });

  it('CONTROL: that same introduced issue throws on a CLEAN view as well', () => {
    // Otherwise the test above could be passing because of the pre-existing
    // issue rather than the introduced one.
    expect(() =>
      createViewItem(
        { id: 'no-such-model-item', tile: { x: 1, y: 1 } } as never,
        ctx(chained())
      )
    ).toThrow();
  });
});
