/**
 * Promoted from the F3 explore lane (ADR 0047 flip rule) — the STYL-10 slider
 * sweep and the STYL-12 opacity round trip. Neither was a bug; both are the
 * generalised form of a lesson the repo has already paid for once, so they
 * belong in the main suite rather than in a lane that only runs on demand.
 *
 * STYL-10 is a SWEEP, not a single case: every slider the docked strip owns is
 * listed with its UI range and the schema field it writes, and both endpoints
 * are pushed through the real zod schema. A strip range wider than a schema cap
 * bricks the diagram at `safeParse` on the next load (testing.md's S1-brick
 * guard, learned from the connector-label 24→40 regression) and only a
 * per-control enumeration catches a NEW control.
 *
 * When you add a slider to the strip, add its row here.
 */
import { connectorLabelSchema } from 'src/schemas/connector';
import { labelSchema } from 'src/schemas/label';
import { textBoxSchema } from 'src/schemas/textBox';
import { rectangleSchema } from 'src/schemas/rectangle';
import { viewItemSchema } from 'src/schemas/views';

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

describe('no strip slider can write outside its schema cap (STYL-10)', () => {
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
      expect(c.schema.safeParse({ ...c.base, [c.field]: c.min }).success).toBe(
        true
      );
      expect(c.schema.safeParse({ ...c.base, [c.field]: c.max }).success).toBe(
        true
      );
    }
  );
});

describe('opacity written as undefined at the top of its range (STYL-12)', () => {
  // TopBarStyleControls: `onChange={(v) => update({ opacity: v >= 1 ? undefined : v })}`
  const write = (v: number) => (v >= 1 ? undefined : v);

  it('dragging back to 100% removes the field rather than storing 1', () => {
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
