/**
 * CLASS GATE — F3 standing thread F-c, "bulk styling is representative-in /
 * everyone-out" (ADR 0047 §3; lands with the wave that closes the class).
 *
 * The class: the docked strip reads ONE member of a homogeneous bulk and writes
 * the derived value to all of them. Right for an absolute value; wrong for
 * anything derived. It produced STYL-01 (the payload was the representative's
 * whole B/I/U/S quartet), STYL-02 and STYL-06 (the direction was the
 * representative's value) and STYL-08 (so the same selection in a different
 * order wrote a different result).
 *
 * Three sections, each able to go red on its own:
 *
 *  1. FIELD MAPS — the four formats × three naming schemes are complete and
 *     each field actually exists on its schema. A renamed or added format that
 *     is not routed through the maps fails here.
 *  2. WRITER SHAPE — the strip must not name a format field literally: the only
 *     writer shape available is `formatFieldPatch`, which emits exactly the
 *     pressed field. A revert to the quartet write fails here.
 *  3. DERIVATION — every displayed value the strip derives from a bulk is
 *     order-independent. A control that goes back to reading `ids[0]` fails
 *     here as soon as its derivation is added to the sweep.
 */
import fs from 'fs';
import path from 'path';
import {
  FORMAT_NAMES,
  VIEW_ITEM_FORMAT_FIELDS,
  LABEL_FORMAT_FIELDS,
  CONNECTOR_LABEL_FORMAT_FIELDS,
  FormatFieldMap,
  deriveTriState,
  nextToggleValue,
  deriveSharedValue,
  formatFieldPatch
} from '../bulkStyleTarget';
import { viewItemSchema } from 'src/schemas/views';
import { labelSchema } from 'src/schemas/label';
import { connectorLabelSchema } from 'src/schemas/connector';

const STRIP_SOURCE = path.join(
  __dirname,
  '..',
  '..',
  'components',
  'TopBarStyleControls',
  'TopBarStyleControls.tsx'
);

const MAPS: Array<{
  name: string;
  fields: FormatFieldMap;
  shape: Record<string, unknown>;
}> = [
  {
    name: 'node label (viewItem)',
    fields: VIEW_ITEM_FORMAT_FIELDS,
    shape: viewItemSchema.shape
  },
  {
    name: 'floating Label',
    fields: LABEL_FORMAT_FIELDS,
    shape: labelSchema.shape
  },
  {
    name: 'connector label',
    fields: CONNECTOR_LABEL_FORMAT_FIELDS,
    shape: connectorLabelSchema.shape
  }
];

// ---------------------------------------------------------------------------
// 1. Field maps
// ---------------------------------------------------------------------------

describe('class gate §1 — the B/I/U/S field maps', () => {
  it('CONTROL: there are exactly four formats, and the gate knows all of them', () => {
    expect([...FORMAT_NAMES].sort()).toEqual([
      'bold',
      'italic',
      'strike',
      'underline'
    ]);
  });

  it.each(MAPS.map((m) => [m.name, m] as const))(
    '%s — every format has a field, and every field exists on the schema',
    (_name, m) => {
      FORMAT_NAMES.forEach((format) => {
        const field = m.fields[format];
        expect(field).toBeTruthy();
        expect(Object.keys(m.shape)).toContain(field);
      });
    }
  );

  it.each(MAPS.map((m) => [m.name, m] as const))(
    '%s — the four fields are distinct (no format shadows another)',
    (_name, m) => {
      const fields = FORMAT_NAMES.map((f) => m.fields[f]);
      expect(new Set(fields).size).toBe(FORMAT_NAMES.length);
    }
  );

  it('CONTROL: the schema check can fail — a made-up field is not on any shape', () => {
    MAPS.forEach((m) => {
      expect(Object.keys(m.shape)).not.toContain('labelSparkle');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Writer shape
// ---------------------------------------------------------------------------

describe('class gate §2 — the strip cannot hand-write a format field', () => {
  const source = fs.readFileSync(STRIP_SOURCE, 'utf8');

  it('CONTROL: the source was actually read', () => {
    expect(source).toContain('export const TopBarStyleControls');
    expect(source.length).toBeGreaterThan(1000);
  });

  it('routes every format write through formatFieldPatch', () => {
    // Whitespace-tolerant: prettier wraps the longer call across lines.
    expect(source).toMatch(/formatFieldPatch\(\s*VIEW_ITEM_FORMAT_FIELDS/);
    expect(source).toMatch(/formatFieldPatch\(\s*LABEL_FORMAT_FIELDS/);
    expect(source).toMatch(
      /formatFieldPatch\(\s*CONNECTOR_LABEL_FORMAT_FIELDS/
    );
  });

  // The connector label's three bare fields (`bold`, `italic`, `underline`) are
  // ALSO the FormatName keys the derivation is written in, so scanning for them
  // by name would flag every read. They are covered instead by `strikethrough`
  // — the one connector-label field whose name is not a FormatName, and one a
  // quartet write necessarily names.
  const SCANNABLE = [
    ...FORMAT_NAMES.map((f) => VIEW_ITEM_FORMAT_FIELDS[f]),
    ...FORMAT_NAMES.map((f) => LABEL_FORMAT_FIELDS[f]),
    CONNECTOR_LABEL_FORMAT_FIELDS.strike
  ];

  it('CONTROL: the scannable set covers both long-form maps plus the connector tell', () => {
    expect(SCANNABLE).toEqual([
      'labelBold',
      'labelItalic',
      'labelUnderline',
      'labelStrikethrough',
      'isBold',
      'isItalic',
      'isUnderline',
      'isStrikethrough',
      'strikethrough'
    ]);
  });

  it.each(SCANNABLE.map((f) => [f, f] as const))(
    '%s is never written as a literal object key in the strip',
    (_label, field) => {
      // `isBold: `, `labelItalic: ` … the quartet write's shape. The maps live
      // in utils/bulkStyleTarget.ts, so a hit here means a writer went around
      // them — which is exactly how STYL-01 wiped three formats per press.
      expect(source).not.toMatch(new RegExp(`\\b${field}\\s*:`));
    }
  );

  it('CONTROL: this scan can go red — a field name the strip DOES contain is found', () => {
    // `borderOpacity:` is a legitimate literal write, so the regex shape itself
    // demonstrably matches when the pattern is present.
    expect(source).toMatch(/\bborderOpacity\s*:/);
  });
});

// ---------------------------------------------------------------------------
// 3. Derivation
// ---------------------------------------------------------------------------

describe('class gate §3 — nothing the strip derives depends on selection order', () => {
  const shuffles = <T,>(xs: T[]): T[][] => [xs, [...xs].reverse()];

  it('a toggle press is the same for any ordering of the same selection', () => {
    shuffles([true, false, false]).forEach((order) => {
      expect(nextToggleValue(deriveTriState(order))).toBe(true);
    });
    shuffles([true, true]).forEach((order) => {
      expect(nextToggleValue(deriveTriState(order))).toBe(false);
    });
  });

  it('an absolute display is the same for any ordering of the same selection', () => {
    shuffles(['#ff0000', '#00ff00']).forEach((order) => {
      expect(deriveSharedValue(order)).toEqual({
        value: undefined,
        mixed: true
      });
    });
    shuffles([10, 10]).forEach((order) => {
      expect(deriveSharedValue(order)).toEqual({ value: 10, mixed: false });
    });
  });

  it('and the patch a press produces carries exactly one field, whatever the order', () => {
    shuffles([false, true]).forEach((order) => {
      const patch = formatFieldPatch(
        LABEL_FORMAT_FIELDS,
        'italic',
        nextToggleValue(deriveTriState(order))
      );
      expect(patch).toEqual({ isItalic: true });
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Sibling drift inside one popover (STYL-05)
// ---------------------------------------------------------------------------

describe('class gate §4 — every text-box Border writer carries the colour seed', () => {
  const source = fs.readFileSync(STRIP_SOURCE, 'utf8');

  // A text box with no `borderColor` has NO border — `TextBox.borderCss`
  // returns undefined — so a control in that popover that writes without
  // seeding a colour moves, renders nothing, and still stores its value. Two of
  // the three writers seeded and the opacity slider did not (STYL-05). They all
  // go through `updateTextBoxBorder` now, which seeds per target.
  it('CONTROL: the seeded writer exists and does the seeding', () => {
    expect(source).toMatch(/const updateTextBoxBorder = useCallback\(/);
    expect(source).toMatch(/borderColor: '#000000'/);
  });

  it('all three border controls call it — style, width and opacity', () => {
    const calls = source.match(/updateTextBoxBorder\(\{/g) ?? [];
    expect(calls.length).toBe(3);
  });

  it('and none of them writes a border field through the raw text-box writer', () => {
    // `updateTextBox(textBox.id, { borderStyle … })` is the pre-fix shape; the
    // colour picker keeps its own explicit `borderColor` writer, which is the
    // one control for which "no seed" is the whole point.
    expect(source).not.toMatch(
      /updateTextBox\(textBox\.id,\s*\{\s*border(Style|Width|Opacity)/
    );
  });
});
