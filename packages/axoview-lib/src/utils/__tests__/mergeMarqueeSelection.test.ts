/**
 * Promoted from the 2026-07 exploratory lane (I3/SEL-15, ruled 2026-07-30 —
 * ADR 0006 §10 addendum). The click path treated Shift/Ctrl/⌘ as additive and a
 * marquee ignored the same modifier, so one gesture taught a rule the other
 * broke. Both marquee tools call these, so the rectangular and freehand lassos
 * cannot drift apart again.
 */
import {
  mergeMarqueeSelection,
  isAdditiveModifier
} from '../selectableRefs';
import type { ItemReference } from 'src/types';

const A: ItemReference = { type: 'ITEM', id: 'a' };
const B: ItemReference = { type: 'ITEM', id: 'b' };
const C: ItemReference = { type: 'ITEM', id: 'c' };

describe('mergeMarqueeSelection', () => {
  it('replaces the selection when the modifier is not held', () => {
    expect(mergeMarqueeSelection([A], [B], false)).toEqual([B]);
  });

  it('unions the marquee into the existing selection when it is', () => {
    // The campaign's exact repro: first marquee {A}, second {B}, Shift held.
    expect(mergeMarqueeSelection([A], [B], true)).toEqual([A, B]);
  });

  it('de-dupes, keeping the existing members in their original order', () => {
    expect(mergeMarqueeSelection([A, B], [B, C], true)).toEqual([A, B, C]);
  });

  it('de-dupes on (type, id), not id alone', () => {
    // A connector and one of its anchors can share neither id nor type, but a
    // waypoint anchor id is not an item id — keying on id alone would drop refs
    // that are genuinely different selections.
    const connector: ItemReference = { type: 'CONNECTOR', id: 'x' };
    const anchor: ItemReference = { type: 'CONNECTOR_ANCHOR', id: 'x' };
    expect(mergeMarqueeSelection([connector], [anchor], true)).toEqual([
      connector,
      anchor
    ]);
  });

  it('is a union, never a toggle — re-lassoing a selected item keeps it', () => {
    // A subtract modifier was NOT ruled (see ADR 0006 §10 scope note).
    expect(mergeMarqueeSelection([A, B], [A], true)).toEqual([A, B]);
  });

  it('handles the empty cases', () => {
    expect(mergeMarqueeSelection([], [A], true)).toEqual([A]);
    expect(mergeMarqueeSelection([A], [], true)).toEqual([A]);
    expect(mergeMarqueeSelection([A], [], false)).toEqual([]);
  });

  it('does not alias its inputs', () => {
    const existing = [A];
    const out = mergeMarqueeSelection(existing, [B], true);
    expect(out).not.toBe(existing);
    expect(existing).toEqual([A]);
  });
});

describe('isAdditiveModifier', () => {
  it('accepts the same three keys the click path honours', () => {
    expect(isAdditiveModifier({ shift: true })).toBe(true);
    expect(isAdditiveModifier({ ctrl: true })).toBe(true);
    expect(isAdditiveModifier({ meta: true })).toBe(true);
  });

  it('is false for no modifiers, and for undefined', () => {
    expect(isAdditiveModifier({})).toBe(false);
    expect(isAdditiveModifier({ shift: false, ctrl: false })).toBe(false);
    expect(isAdditiveModifier(undefined)).toBe(false);
  });
});
