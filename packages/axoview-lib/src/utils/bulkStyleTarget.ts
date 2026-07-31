import { ItemReference } from 'src/types';

export interface BulkStyleTarget {
  type: ItemReference['type'];
  ids: string[];
}

/**
 * ADR 0030 §2 amendment (2026-06-30) — bulk styling gate. A `>1` selection is a
 * bulk-style target IFF every selected item shares a `.type` (homogeneous).
 * Returns the shared type + ids, or null for a single/empty/heterogeneous
 * selection (the strip stays disabled for those). Pure — the docked style strip
 * fans its writers out over `ids` in one transaction.
 */
export const resolveHomogeneousBulk = (
  selectedIds: ItemReference[]
): BulkStyleTarget | null => {
  if (selectedIds.length < 2) return null;
  const type = selectedIds[0].type;
  if (!selectedIds.every((r) => r.type === type)) return null;
  return { type, ids: selectedIds.map((r) => r.id) };
};

// ---------------------------------------------------------------------------
// Whole-selection derivation (STYL-02 / STYL-06 / STYL-08, owner 2026-07-30)
//
// The strip used to read ONE member (`bulk.ids[0]`, the "representative") and
// write the derived value to all of them — right for an absolute value, wrong
// for anything derived (F3 standing thread F-c). These two helpers replace the
// representative read: a toggle asks the WHOLE selection, and an absolute
// control reports "mixed" instead of one arbitrary member's value.
// ---------------------------------------------------------------------------

/** Tri-state of a boolean style across a selection (Word/Docs/Figma model). */
export type TriState = 'on' | 'mixed' | 'off';

/**
 * `all` → on, `none` → off, anything else → mixed. An empty selection is off
 * (nothing to be on about) — callers gate on enablement before displaying it.
 */
export const deriveTriState = (values: boolean[]): TriState => {
  if (values.length === 0) return 'off';
  const on = values.filter(Boolean).length;
  if (on === values.length) return 'on';
  if (on === 0) return 'off';
  return 'mixed';
};

/**
 * What one press of a tri-state toggle should write (STYL-02 ruling): a mixed
 * or off selection applies the format to everyone; only a fully-on selection
 * clears it. Never reads a representative, so the selection ORDER stops
 * deciding the outcome (STYL-08).
 */
export const nextToggleValue = (state: TriState): boolean => state !== 'on';

/**
 * Shared absolute value across a selection, or `mixed` when the members
 * disagree (STYL-08 ruling). `value` is the shared value when they agree and
 * `undefined` when they do not, so a caller can never accidentally display one
 * member's value for the whole set.
 */
export const deriveSharedValue = <T>(
  values: T[]
): { value: T | undefined; mixed: boolean } => {
  if (values.length === 0) return { value: undefined, mixed: false };
  const [first] = values;
  const mixed = values.some((v) => v !== first);
  return { value: mixed ? undefined : first, mixed };
};

// ---------------------------------------------------------------------------
// The B/I/U/S field maps (STYL-01)
//
// ADR 0033 left the three label types with three naming schemes for the same
// four booleans. The strip used to rebuild the whole quartet on every press,
// which is how ONE press wiped the other three formats across a bulk. These
// maps + `formatFieldPatch` make "write exactly the field that was pressed"
// the only shape available; `bulkStyleFormat.contract.test.ts` gates it.
// ---------------------------------------------------------------------------

export type FormatName = 'bold' | 'italic' | 'underline' | 'strike';

export const FORMAT_NAMES: readonly FormatName[] = [
  'bold',
  'italic',
  'underline',
  'strike'
];

/** viewItem (node label). */
export const VIEW_ITEM_FORMAT_FIELDS = {
  bold: 'labelBold',
  italic: 'labelItalic',
  underline: 'labelUnderline',
  strike: 'labelStrikethrough'
} as const;

/** Floating Label. */
export const LABEL_FORMAT_FIELDS = {
  bold: 'isBold',
  italic: 'isItalic',
  underline: 'isUnderline',
  strike: 'isStrikethrough'
} as const;

/** A connector's `labels[]` entry. */
export const CONNECTOR_LABEL_FORMAT_FIELDS = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikethrough'
} as const;

export type FormatFieldMap = Record<FormatName, string>;

/** The patch for ONE pressed format — always exactly one key. */
export const formatFieldPatch = (
  fields: FormatFieldMap,
  name: FormatName,
  next: boolean
): Record<string, boolean> => ({ [fields[name]]: next });

/** Read the four booleans off an element through its own naming scheme. */
export const readFormatFields = (
  fields: FormatFieldMap,
  source: Record<string, unknown> | null | undefined
): Record<FormatName, boolean> => ({
  bold: !!source?.[fields.bold],
  italic: !!source?.[fields.italic],
  underline: !!source?.[fields.underline],
  strike: !!source?.[fields.strike]
});
