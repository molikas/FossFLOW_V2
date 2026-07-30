/**
 * F1 / TXT-10, TXT-12, TXT-13 — the write-side of the text formatting stack.
 *
 * TXT-12 is a PARITY oracle: every field `getTextBoxDimensions` reads must
 * appear in `updateTextBox`'s re-measure trigger list, or a write that changes
 * the footprint leaves `scene.textBoxes[id].size` stale. Written as a
 * differential (measure vs reducer) rather than a source scan, so it stays
 * honest when either side moves.
 *
 * jsdom has no canvas 2D context — `installCanvasStub()` runs first.
 */
import { installCanvasStub } from 'src/__explore__/canvasStub';

installCanvasStub();

// eslint-disable-next-line import/first
import { getTextBoxDimensions } from 'src/utils/isoMath';
// eslint-disable-next-line import/first
import {
  applyInlineFormat,
  getWholeContentFormats
} from 'src/utils/richTextTransform';
// eslint-disable-next-line import/first
import { updateTextBox } from 'src/stores/reducers/textBox';
// eslint-disable-next-line import/first
import { seedConnectorLabel } from 'src/utils/seedConnectorLabel';
// eslint-disable-next-line import/first
import { ProjectionOrientationEnum, TextBox } from 'src/types';
// eslint-disable-next-line import/first
import type { State } from 'src/stores/reducers/types';

const VIEW_ID = 'view1';
const TB_ID = 'tb1';

const stateWith = (textBox: Partial<TextBox>): State =>
  ({
    model: {
      version: '1',
      title: 't',
      icons: [],
      colors: [],
      items: [],
      views: [
        {
          id: VIEW_ID,
          name: 'v',
          items: [],
          connectors: [],
          rectangles: [],
          textBoxes: [
            {
              id: TB_ID,
              tile: { x: 0, y: 0 },
              orientation: ProjectionOrientationEnum.X,
              content: '<p>alpha</p><p>beta</p>',
              ...textBox
            }
          ]
        }
      ]
    },
    scene: { connectors: {}, textBoxes: {} }
  } as unknown as State);

const sizeAfter = (
  seed: Partial<TextBox>,
  updates: Partial<TextBox>
): { stored: unknown; fresh: unknown } => {
  const state = stateWith(seed);
  const next = updateTextBox(
    { id: TB_ID, ...updates },
    { viewId: VIEW_ID, state }
  );
  const box = next.model.views[0].textBoxes![0];
  return {
    stored: next.scene.textBoxes[TB_ID]?.size,
    fresh: getTextBoxDimensions(box)
  };
};

// ---------------------------------------------------------------------------
// TXT-12 — re-measure trigger parity
// ---------------------------------------------------------------------------

describe('TXT-12 — updateTextBox re-measure triggers vs getTextBoxDimensions inputs', () => {
  // Every field the measurement reads, with a value that visibly changes it.
  const GEOMETRY_WRITES: Array<[string, Partial<TextBox>]> = [
    ['content', { content: '<p>a</p><p>b</p><p>c</p><p>d</p>' } as Partial<TextBox>],
    ['fontSize', { fontSize: 0.9 }],
    ['lineHeight', { lineHeight: 3 }],
    ['width', { width: 4 }],
    ['height', { height: 9 }]
  ];

  it('PRECONDITION: each write really does change the measured size (otherwise the probe proves nothing)', () => {
    const base = getTextBoxDimensions(
      stateWith({}).model.views[0].textBoxes![0]
    );
    GEOMETRY_WRITES.forEach(([name, updates]) => {
      const box = {
        ...stateWith({}).model.views[0].textBoxes![0],
        ...updates
      };
      expect([name, getTextBoxDimensions(box)]).not.toEqual([name, base]);
    });
  });

  it.each(GEOMETRY_WRITES)(
    'a %s write leaves scene.textBoxes size equal to a fresh measurement',
    (_name, updates) => {
      const { stored, fresh } = sizeAfter({}, updates);
      expect(stored).toEqual(fresh);
    }
  );

  it('CHARACTERIZATION: a NON-geometry write (verticalAlign) skips the re-measure — and correctly so, the measurement never reads it', () => {
    const state = stateWith({});
    const next = updateTextBox(
      { id: TB_ID, verticalAlign: 'middle' } as never,
      { viewId: VIEW_ID, state }
    );
    // No scene entry written at all (the seed state has none) — proving the
    // branch was skipped — and the size would have been identical anyway.
    expect(next.scene.textBoxes[TB_ID]).toBeUndefined();
    expect(
      getTextBoxDimensions(next.model.views[0].textBoxes![0])
    ).toEqual(getTextBoxDimensions(state.model.views[0].textBoxes![0]));
  });
});

// ---------------------------------------------------------------------------
// TXT-13 — strip whole-content format round-trip over PARTIALLY formatted text
// ---------------------------------------------------------------------------

describe('TXT-13 — strip B on/off destroys pre-existing per-range formatting', () => {
  // A box the user bolded ONE WORD of inside the on-canvas editor.
  const PARTIAL = '<p>plain <strong>bold</strong> tail</p>';

  it('PRECONDITION: the strip reads this content as NOT bold, so its next press is "apply"', () => {
    // getWholeContentFormats requires every leaf fully covered; one bolded run
    // is not, so `formatValue.bold` is false and toggleFormat sends on=true.
    expect(getWholeContentFormats(PARTIAL).bold).toBe(false);
  });

  it('CHARACTERIZATION: pressing B wraps the whole leaf, and pressing B again unwraps EVERYTHING', () => {
    const on = applyInlineFormat(PARTIAL, 'bold', true);
    expect(getWholeContentFormats(on).bold).toBe(true);
    const off = applyInlineFormat(on, 'bold', false);
    expect(off).toBe('<p>plain bold tail</p>');
    expect(off).not.toContain('<strong>');
  });

  it.failing(
    'TXT-13: B-on then B-off should return the content to its pre-press state (the one bolded word survives)',
    () => {
      const roundTrip = applyInlineFormat(
        applyInlineFormat(PARTIAL, 'bold', true),
        'bold',
        false
      );
      expect(roundTrip).toBe(PARTIAL);
    }
  );

  it('the same non-idempotence holds for italic/underline/strike (one shared code path)', () => {
    (['italic', 'underline', 'strike'] as const).forEach((format) => {
      const tag = { italic: 'em', underline: 'u', strike: 's' }[format];
      const src = `<p>plain <${tag}>marked</${tag}> tail</p>`;
      expect(getWholeContentFormats(src)[format]).toBe(false);
      const roundTrip = applyInlineFormat(
        applyInlineFormat(src, format, true),
        format,
        false
      );
      expect(roundTrip).toBe('<p>plain marked tail</p>');
    });
  });
});

// ---------------------------------------------------------------------------
// TXT-10 — nameSeeded survival through clipboard reconstruction
// ---------------------------------------------------------------------------

describe('TXT-10 — the nameSeeded marker through paste', () => {
  const seeded = () =>
    seedConnectorLabel({
      id: 'c1',
      name: 'Flow',
      anchors: [{ id: 'a1', ref: { item: 'i1' } }, { id: 'a2', ref: { item: 'i2' } }]
    }) as Record<string, unknown>;

  it('PRECONDITION: the seed stamps the marker and folds the name into labels[]', () => {
    const c = seeded();
    expect(c.nameSeeded).toBe(true);
    expect((c.labels as unknown[]).length).toBe(1);
  });

  it('TXT-10 probe: useCopyPaste rebuilds connectors with an object spread, so the marker survives', () => {
    // The exact reconstruction shape from clipboard/useCopyPaste.ts:
    //   { ...c, id: <new>, anchors: c.anchors.map(...) }
    const original = seeded();
    const pasted = {
      ...original,
      id: 'c2',
      anchors: (original.anchors as Array<Record<string, unknown>>).map((a) => ({
        ...a,
        id: 'new-' + String(a.id)
      }))
    };
    expect(pasted.nameSeeded).toBe(true);
    // …and re-seeding the paste is a no-op: no second label.
    const reloaded = seedConnectorLabel(pasted) as Record<string, unknown>;
    expect((reloaded.labels as unknown[]).length).toBe(1);
    expect(reloaded).toBe(pasted); // early-returned, not rebuilt
  });

  it('CHARACTERIZATION: the marker is what protects it — drop it and the next load duplicates the label', () => {
    const original = seeded();
    const { nameSeeded, ...withoutMarker } = original;
    expect(nameSeeded).toBe(true);
    const reloaded = seedConnectorLabel(withoutMarker) as Record<string, unknown>;
    expect((reloaded.labels as unknown[]).length).toBe(2);
  });
});
