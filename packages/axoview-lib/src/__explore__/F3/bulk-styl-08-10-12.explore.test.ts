/**
 * F3 / STYL-08, STYL-10, STYL-12 — the pure parts of the styling system.
 *
 * STYL-10 is a SWEEP, not a single hypothesis: every slider the docked strip
 * owns is listed with its UI range and the schema field it writes, and both
 * endpoints are pushed through the real zod schema. That is the generalised
 * form of the connector-label 24→40 lesson (testing.md's S1-brick guard) — a
 * strip range wider than a schema cap bricks the diagram at `safeParse` on the
 * next load, and only a per-control enumeration catches a NEW control.
 */
import { resolveHomogeneousBulk } from 'src/utils/bulkStyleTarget';
import {
  applyInlineFormat,
  getWholeContentFormats
} from 'src/utils/richTextTransform';
import { connectorLabelSchema } from 'src/schemas/connector';
import { labelSchema } from 'src/schemas/label';
import { textBoxSchema } from 'src/schemas/textBox';
import { rectangleSchema } from 'src/schemas/rectangle';
import { viewItemSchema } from 'src/schemas/views';
import type { ItemReference } from 'src/types';

const ref = (type: string, id: string) => ({ type, id }) as ItemReference;

// ---------------------------------------------------------------------------
// STYL-08 — which member the strip shows
// ---------------------------------------------------------------------------

describe('STYL-08 — the bulk representative', () => {
  it('CHARACTERIZATION: the representative is selectedIds[0], in selection-array order', () => {
    const bulk = resolveHomogeneousBulk([
      ref('LABEL', 'l3'),
      ref('LABEL', 'l1'),
      ref('LABEL', 'l2')
    ]);
    expect(bulk).toEqual({ type: 'LABEL', ids: ['l3', 'l1', 'l2'] });
    // TopBarStyleControls: `sel = bulk ? { type: bulk.type, id: bulk.ids[0] }`.
    expect(bulk!.ids[0]).toBe('l3');
  });

  it('CHARACTERIZATION: reversing the selection order changes which member the strip reads', () => {
    const a = resolveHomogeneousBulk([ref('LABEL', 'l1'), ref('LABEL', 'l2')]);
    const b = resolveHomogeneousBulk([ref('LABEL', 'l2'), ref('LABEL', 'l1')]);
    expect([a!.ids[0], b!.ids[0]]).toEqual(['l1', 'l2']);
    // Same SET of labels, different displayed values — and, per STYL-01/02,
    // different written values too.
  });

  it('CONTROL: the gate itself is right — <2, or heterogeneous, is not a bulk', () => {
    expect(resolveHomogeneousBulk([])).toBeNull();
    expect(resolveHomogeneousBulk([ref('LABEL', 'l1')])).toBeNull();
    expect(
      resolveHomogeneousBulk([ref('LABEL', 'l1'), ref('ITEM', 'i1')])
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// STYL-10 — every strip slider vs the schema it writes
// ---------------------------------------------------------------------------

type Case = {
  control: string;
  min: number;
  max: number;
  field: string;
  schema: { safeParse: (v: unknown) => { success: boolean } };
  base: Record<string, unknown>;
};

const BASE_LABEL = { id: 'l1', text: 'x', tile: { x: 0, y: 0 } };
const BASE_TEXTBOX = { id: 't1', tile: { x: 0, y: 0 }, content: 'x' };
const BASE_RECT = { id: 'r1', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } };
const BASE_VIEWITEM = { id: 'v1', tile: { x: 0, y: 0 } };
const BASE_CONN_LABEL = { id: 'cl1', text: 'x', position: 50, line: '1' };

// Transcribed from TopBarStyleControls — one row per slider the strip renders.
const SLIDERS: Case[] = [
  {
    control: 'text size (node label)',
    min: 10,
    max: 40,
    field: 'labelFontSize',
    schema: viewItemSchema,
    base: BASE_VIEWITEM
  },
  {
    control: 'text size (floating Label)',
    min: 10,
    max: 40,
    field: 'fontSize',
    schema: labelSchema,
    base: BASE_LABEL
  },
  {
    control: 'text size (connector label)',
    min: 10,
    max: 40,
    field: 'fontSize',
    schema: connectorLabelSchema,
    base: BASE_CONN_LABEL
  },
  {
    control: 'text size (text box)',
    min: 0.15,
    max: 0.9,
    field: 'fontSize',
    schema: textBoxSchema,
    base: BASE_TEXTBOX
  },
  {
    control: 'line spacing (text box)',
    min: 0.8,
    max: 2.5,
    field: 'lineHeight',
    schema: textBoxSchema,
    base: BASE_TEXTBOX
  },
  {
    control: 'border width (text box)',
    min: 2,
    max: 30,
    field: 'borderWidth',
    schema: textBoxSchema,
    base: BASE_TEXTBOX
  },
  {
    control: 'border opacity (text box)',
    min: 0,
    max: 1,
    field: 'borderOpacity',
    schema: textBoxSchema,
    base: BASE_TEXTBOX
  },
  {
    control: 'border width (rectangle)',
    min: 2,
    max: 30,
    field: 'borderWidth',
    schema: rectangleSchema,
    base: BASE_RECT
  },
  {
    control: 'border opacity (rectangle)',
    min: 0,
    max: 1,
    field: 'borderOpacity',
    schema: rectangleSchema,
    base: BASE_RECT
  },
  {
    control: 'fill opacity (rectangle)',
    min: 0,
    max: 1,
    field: 'fillOpacity',
    schema: rectangleSchema,
    base: BASE_RECT
  },
  {
    control: 'background opacity (floating Label)',
    min: 0,
    max: 1,
    field: 'backgroundOpacity',
    schema: labelSchema,
    base: BASE_LABEL
  }
];

describe('STYL-10 — no strip slider can write outside its schema cap', () => {
  it('CONTROL: every base object is itself schema-valid (a bad base would make the sweep vacuous)', () => {
    expect(viewItemSchema.safeParse(BASE_VIEWITEM).success).toBe(true);
    expect(labelSchema.safeParse(BASE_LABEL).success).toBe(true);
    expect(connectorLabelSchema.safeParse(BASE_CONN_LABEL).success).toBe(true);
    expect(textBoxSchema.safeParse(BASE_TEXTBOX).success).toBe(true);
    expect(rectangleSchema.safeParse(BASE_RECT).success).toBe(true);
  });

  it('CONTROL: the sweep can detect an out-of-range write', () => {
    // The connector-label fontSize is the one field with a real cap — push past
    // it and the schema must reject, or this whole sweep is vacuous.
    expect(
      connectorLabelSchema.safeParse({ ...BASE_CONN_LABEL, fontSize: 41 })
        .success
    ).toBe(false);
    expect(
      connectorLabelSchema.safeParse({ ...BASE_CONN_LABEL, fontSize: 7 })
        .success
    ).toBe(false);
  });

  it.each(SLIDERS.map((c) => [c.control, c] as const))(
    '%s — both endpoints are schema-legal',
    (_name, c) => {
      expect(
        c.schema.safeParse({ ...c.base, [c.field]: c.min }).success
      ).toBe(true);
      expect(
        c.schema.safeParse({ ...c.base, [c.field]: c.max }).success
      ).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// STYL-12 — the absent-is-default opacity convention
// ---------------------------------------------------------------------------

describe('STYL-12 — opacity written as undefined at the top of its range', () => {
  // TopBarStyleControls: `onChange={(v) => update({ opacity: v >= 1 ? undefined : v })}`
  const write = (v: number) => (v >= 1 ? undefined : v);

  it('CHARACTERIZATION: dragging back to 100% removes the field rather than storing 1', () => {
    expect(write(0.5)).toBe(0.5);
    expect(write(1)).toBeUndefined();
  });

  it('the round trip is nevertheless the identity — every reader defaults absent to 1', () => {
    // rectangle: `fillOpacity ?? 1`; label: `backgroundOpacity ?? 1`;
    // textBox: `borderOpacity ?? 1`. Absent and 1 are the same rendered state,
    // so "reset" and "never set" being one value loses no information.
    const read = (stored: number | undefined) => stored ?? 1;
    expect(read(write(1))).toBe(1);
    expect(read(1)).toBe(1);
    expect(read(write(0.5))).toBe(0.5);
  });

  it('and both schemas accept the explicit 1, so a legacy diagram carrying it still loads', () => {
    expect(
      rectangleSchema.safeParse({ ...BASE_RECT, fillOpacity: 1 }).success
    ).toBe(true);
    expect(
      labelSchema.safeParse({ ...BASE_LABEL, backgroundOpacity: 1 }).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STYL-05 — the text-box border popover's three writers
// ---------------------------------------------------------------------------

describe('STYL-05 — border opacity on a border-less text box', () => {
  // TextBox.tsx's borderCss derivation, transcribed — the sole consumer that
  // decides whether a border is painted at all.
  const borderCss = (tb: {
    borderColor?: string;
    borderWidth?: number;
    borderStyle?: string;
    borderOpacity?: number;
  }) => {
    if (!tb.borderColor) return undefined;
    return `${tb.borderWidth ?? 2}px ${(tb.borderStyle ?? 'SOLID').toLowerCase()} ${
      tb.borderColor
    }`;
  };

  it('CONTROL: the STYLE and WIDTH writers seed a default colour, so their change is visible', () => {
    // `updateTextBox(id, { borderStyle, ...(borderColor ? {} : { borderColor: '#000000' }) })`
    const afterStyle = { borderStyle: 'DASHED', borderColor: '#000000' };
    const afterWidth = { borderWidth: 6, borderColor: '#000000' };
    expect(borderCss(afterStyle)).toBe('2px dashed #000000');
    expect(borderCss(afterWidth)).toBe('6px solid #000000');
  });

  it('STYL-05: the OPACITY writer does not, so the slider changes nothing and leaves an orphan field', () => {
    // `updateTextBox(id, { borderOpacity: v >= 1 ? undefined : v })` — no seed.
    const afterOpacity = { borderOpacity: 0.5 };
    expect(borderCss(afterOpacity)).toBeUndefined();
    // The field is stored all the same, so a later style press silently
    // resurrects a half-transparent border the user never chose.
    expect(borderCss({ ...afterOpacity, borderColor: '#000000' })).toBe(
      '2px solid #000000'
    );
  });
});

// ---------------------------------------------------------------------------
// STYL-06 — the text-box branch of the format cluster over a bulk
// ---------------------------------------------------------------------------

describe('STYL-06 — bulk B/I/U/S over text boxes', () => {
  const BOLD = '<p><strong>alpha</strong></p>';
  const PLAIN = '<p>beta</p>';

  it('PRECONDITION: the representative reads bold, the other member does not', () => {
    expect(getWholeContentFormats(BOLD).bold).toBe(true);
    expect(getWholeContentFormats(PLAIN).bold).toBe(false);
  });

  it('STYL-06: with the BOLD box as representative, one press un-bolds it and leaves the plain one untouched — the bulk stays split', () => {
    // TopBarStyleControls: `next = !formatValue.bold` (representative), then
    // `applyToTargets('TEXTBOX', tid => applyTextBox(tid, {
    //    content: applyInlineFormat(target.content, name, next) }))`
    const next = !getWholeContentFormats(BOLD).bold; // false
    const outBold = applyInlineFormat(BOLD, 'bold', next);
    const outPlain = applyInlineFormat(PLAIN, 'bold', next);
    expect(getWholeContentFormats(outBold).bold).toBe(false);
    expect(getWholeContentFormats(outPlain).bold).toBe(false);
    // Both are now un-bold, i.e. the press normalised DOWN — same shape as
    // STYL-02 for the label types, reached through a different code path.
  });

  it('CHARACTERIZATION: reversing which box is the representative reverses the outcome for the SAME selection', () => {
    const next = !getWholeContentFormats(PLAIN).bold; // true
    expect(getWholeContentFormats(applyInlineFormat(BOLD, 'bold', next)).bold).toBe(
      true
    );
    expect(
      getWholeContentFormats(applyInlineFormat(PLAIN, 'bold', next)).bold
    ).toBe(true);
  });
});
