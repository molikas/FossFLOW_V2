/**
 * Promoted from the F3 explore lane (ADR 0047 flip rule) — STYL-01, STYL-02,
 * STYL-06 and STYL-08, the "representative-in / everyone-out" cluster.
 *
 * The strip used to read ONE member of a bulk (`bulk.ids[0]`) and write the
 * derived value to all of them. For an absolute value that is right; for a
 * toggle it meant BOTH the payload (the whole B/I/U/S quartet — STYL-01) and
 * the direction (STYL-02/06) came from an arbitrary member, so the same
 * selection in a different order produced a different result (STYL-08).
 *
 * These are the pure derivations the strip now asks instead.
 */
import {
  deriveTriState,
  nextToggleValue,
  deriveSharedValue,
  formatFieldPatch,
  readFormatFields,
  FORMAT_NAMES,
  VIEW_ITEM_FORMAT_FIELDS,
  LABEL_FORMAT_FIELDS,
  CONNECTOR_LABEL_FORMAT_FIELDS
} from '../bulkStyleTarget';
import {
  applyInlineFormat,
  getWholeContentFormats
} from '../richTextTransform';

describe('deriveTriState — the mixed state the strip had none of (STYL-02)', () => {
  it('all on → on, all off → off, anything else → mixed', () => {
    expect(deriveTriState([true, true])).toBe('on');
    expect(deriveTriState([false, false])).toBe('off');
    expect(deriveTriState([true, false])).toBe('mixed');
    expect(deriveTriState([false, true, false])).toBe('mixed');
  });

  it('a single member is never mixed', () => {
    expect(deriveTriState([true])).toBe('on');
    expect(deriveTriState([false])).toBe('off');
  });

  it('an empty selection reads off (nothing to be on about)', () => {
    expect(deriveTriState([])).toBe('off');
  });

  it('is independent of order — the STYL-08 property', () => {
    expect(deriveTriState([true, false, false])).toBe(
      deriveTriState([false, false, true])
    );
  });
});

describe('nextToggleValue — one press APPLIES to a mixed selection (STYL-02 ruling)', () => {
  it('mixed and off both apply; only a fully-on selection clears', () => {
    expect(nextToggleValue('mixed')).toBe(true);
    expect(nextToggleValue('off')).toBe(true);
    expect(nextToggleValue('on')).toBe(false);
  });

  it('REGRESSION (STYL-02): [bold, plain] + Bold bolds everyone, it does not clear', () => {
    // The pre-fix path was `next = !representative.bold`, so with the bold
    // member first one press turned bold OFF for the whole selection.
    const state = deriveTriState([true, false]);
    expect(state).toBe('mixed');
    expect(nextToggleValue(state)).toBe(true);
  });

  it('REGRESSION (STYL-08): reversing the same selection cannot change the outcome', () => {
    const forward = nextToggleValue(deriveTriState([true, false]));
    const reversed = nextToggleValue(deriveTriState([false, true]));
    expect(forward).toBe(reversed);
  });
});

describe('deriveSharedValue — absolute controls show Mixed, never one member (STYL-08 ruling)', () => {
  it('agreeing members yield the shared value', () => {
    expect(deriveSharedValue([12, 12, 12])).toEqual({
      value: 12,
      mixed: false
    });
  });

  it('disagreeing members yield mixed and NO value', () => {
    expect(deriveSharedValue([12, 18])).toEqual({
      value: undefined,
      mixed: true
    });
  });

  it('a single member is never mixed', () => {
    expect(deriveSharedValue(['#ff0000'])).toEqual({
      value: '#ff0000',
      mixed: false
    });
  });

  it('an empty selection is not mixed either', () => {
    expect(deriveSharedValue([])).toEqual({ value: undefined, mixed: false });
  });

  it('is order-independent', () => {
    expect(deriveSharedValue([1, 2]).mixed).toBe(
      deriveSharedValue([2, 1]).mixed
    );
  });

  it('treats absent as a value of its own (absent ≠ the default it renders as)', () => {
    expect(deriveSharedValue([undefined, undefined]).mixed).toBe(false);
    expect(deriveSharedValue([undefined, '#000000']).mixed).toBe(true);
  });
});

describe('formatFieldPatch — one press writes exactly one field (STYL-01)', () => {
  it.each(FORMAT_NAMES)(
    'a node-label %s press patches only its own field',
    (name) => {
      const patch = formatFieldPatch(VIEW_ITEM_FORMAT_FIELDS, name, true);
      expect(Object.keys(patch)).toEqual([VIEW_ITEM_FORMAT_FIELDS[name]]);
      expect(patch[VIEW_ITEM_FORMAT_FIELDS[name]]).toBe(true);
    }
  );

  it('REGRESSION (STYL-01): bolding never mentions italic/underline/strike', () => {
    // The pre-fix writer built { bold, italic, strikethrough, underline } from
    // the representative and fanned the WHOLE thing out, so one press wiped
    // every other format on every other member.
    const patch = formatFieldPatch(LABEL_FORMAT_FIELDS, 'bold', true);
    expect(patch).toEqual({ isBold: true });
    expect(patch).not.toHaveProperty('isItalic');
    expect(patch).not.toHaveProperty('isUnderline');
    expect(patch).not.toHaveProperty('isStrikethrough');
  });

  it('applying a patch to a member leaves its other formats alone', () => {
    const italicOnly = { isItalic: true };
    const after = {
      ...italicOnly,
      ...formatFieldPatch(LABEL_FORMAT_FIELDS, 'bold', true)
    };
    expect(after).toEqual({ isItalic: true, isBold: true });
  });
});

describe('readFormatFields — the three naming schemes read the same four booleans', () => {
  it('reads a node label through the labelXxx scheme', () => {
    expect(
      readFormatFields(VIEW_ITEM_FORMAT_FIELDS, {
        labelBold: true,
        labelStrikethrough: true
      })
    ).toEqual({ bold: true, italic: false, underline: false, strike: true });
  });

  it('reads a floating Label through the isXxx scheme', () => {
    expect(
      readFormatFields(LABEL_FORMAT_FIELDS, { isItalic: true })
    ).toEqual({ bold: false, italic: true, underline: false, strike: false });
  });

  it('reads a connector label through the bare scheme', () => {
    expect(
      readFormatFields(CONNECTOR_LABEL_FORMAT_FIELDS, { underline: true })
    ).toEqual({ bold: false, italic: false, underline: true, strike: false });
  });

  it('a missing element reads as all-off rather than throwing', () => {
    expect(readFormatFields(LABEL_FORMAT_FIELDS, undefined)).toEqual({
      bold: false,
      italic: false,
      underline: false,
      strike: false
    });
  });
});

describe('the text-box branch reaches the same derivation (STYL-06)', () => {
  const BOLD = '<p><strong>alpha</strong></p>';
  const PLAIN = '<p>beta</p>';

  it('PRECONDITION: the two boxes genuinely disagree', () => {
    expect(getWholeContentFormats(BOLD).bold).toBe(true);
    expect(getWholeContentFormats(PLAIN).bold).toBe(false);
  });

  it('REGRESSION (STYL-06): a mixed pair bolds BOTH, whichever box came first', () => {
    const state = deriveTriState(
      [BOLD, PLAIN].map((c) => getWholeContentFormats(c).bold)
    );
    const next = nextToggleValue(state);
    expect(next).toBe(true);
    expect(getWholeContentFormats(applyInlineFormat(BOLD, 'bold', next)).bold).toBe(
      true
    );
    expect(
      getWholeContentFormats(applyInlineFormat(PLAIN, 'bold', next)).bold
    ).toBe(true);

    // …and the reversed selection is the same press.
    const reversed = deriveTriState(
      [PLAIN, BOLD].map((c) => getWholeContentFormats(c).bold)
    );
    expect(nextToggleValue(reversed)).toBe(next);
  });

  it('a fully-bold pair clears, which is the only case that should', () => {
    const state = deriveTriState(
      [BOLD, BOLD].map((c) => getWholeContentFormats(c).bold)
    );
    expect(nextToggleValue(state)).toBe(false);
  });
});
