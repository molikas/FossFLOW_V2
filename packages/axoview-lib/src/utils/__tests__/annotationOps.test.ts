/**
 * Promoted from the F2 explore lane (ADR 0047 flip rule) — VIEW-07 and the
 * VIEW-13 ruling that rides it.
 *
 * The annotation overlay's history was two plain stroke stacks: undo popped the
 * last element of `strokes`, redo pushed it back. That models "draw / un-draw at
 * the tail" and nothing else, so:
 *
 *   - erasing the MIDDLE stroke pushed nothing and merely reset the redo stack,
 *     and the next Undo ate the LAST stroke instead. The erased one was
 *     unrecoverable;
 *   - Clear was not undoable at all, sitting in the same three-button row as
 *     Undo and Redo (VIEW-13: adopt — a bin next to undo controls sets that
 *     expectation);
 *   - a stroke on the redo stack was silently discarded by any erase.
 *
 * These two functions are the operation log's whole semantics, and the property
 * under test is that they are exact inverses.
 */
import {
  applyAnnotationOp,
  revertAnnotationOp,
  strokeHasExtent
} from '../annotationOps';
import type { AnnotationOp, AnnotationStroke } from 'src/types';

const stroke = (id: string): AnnotationStroke => ({
  id,
  tool: 'pencil',
  color: '#000',
  thickness: 4,
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 }
  ]
});

const A = stroke('a');
const B = stroke('b');
const C = stroke('c');
const ids = (s: AnnotationStroke[]) => s.map((x) => x.id);

describe('annotation operation log — apply/revert are inverses', () => {
  const cases: Array<[string, AnnotationStroke[], AnnotationOp]> = [
    ['add at the end', [A, B], { kind: 'add', stroke: C, index: 2 }],
    ['add in the middle', [A, C], { kind: 'add', stroke: B, index: 1 }],
    ['erase the middle', [A, B, C], { kind: 'erase', stroke: B, index: 1 }],
    ['erase the first', [A, B, C], { kind: 'erase', stroke: A, index: 0 }],
    ['erase the last', [A, B, C], { kind: 'erase', stroke: C, index: 2 }],
    ['clear', [A, B, C], { kind: 'clear', strokes: [A, B, C] }],
    ['clear an empty list', [], { kind: 'clear', strokes: [] }]
  ];

  it.each(cases)('%s round-trips', (_name, before, op) => {
    // The `add` cases describe a state the op has NOT been applied to yet, so
    // the round-trip runs apply → revert; that is also exactly what redo → undo
    // does at runtime.
    const after = applyAnnotationOp(before, op);
    expect(ids(revertAnnotationOp(after, op))).toEqual(ids(before));
  });
});

describe('erase — the case the two stacks could not represent (VIEW-07)', () => {
  it('undoing an erase puts the stroke back AT ITS OWN INDEX', () => {
    // Re-appending it would silently reorder the drawing: later strokes paint
    // over earlier ones, so position is visible, not bookkeeping.
    const op: AnnotationOp = { kind: 'erase', stroke: B, index: 1 };
    const erased = applyAnnotationOp([A, B, C], op);
    expect(ids(erased)).toEqual(['a', 'c']);
    expect(ids(revertAnnotationOp(erased, op))).toEqual(['a', 'b', 'c']);
  });

  it('CONTROL: undoing an ADD removes the stroke it added, not the tail', () => {
    // The old behaviour was "always the tail". This is the same assertion the
    // erase case makes, from the direction that used to work — if both were
    // tail-based, the erase test alone could not tell them apart.
    const op: AnnotationOp = { kind: 'add', stroke: B, index: 1 };
    const withB = applyAnnotationOp([A, C], op);
    expect(ids(withB)).toEqual(['a', 'b', 'c']);
    expect(ids(revertAnnotationOp(withB, op))).toEqual(['a', 'c']);
  });
});

describe('clear — undoable (VIEW-13)', () => {
  it('restores every stroke, in order', () => {
    const op: AnnotationOp = { kind: 'clear', strokes: [A, B, C] };
    expect(applyAnnotationOp([A, B, C], op)).toEqual([]);
    expect(ids(revertAnnotationOp([], op))).toEqual(['a', 'b', 'c']);
  });
});

describe('index handling', () => {
  it('an out-of-range index clamps rather than dropping the stroke', () => {
    // An index is only meaningful against the list it was recorded on. Losing
    // the stroke would be worse than putting it at the end.
    const op: AnnotationOp = { kind: 'erase', stroke: B, index: 99 };
    expect(ids(revertAnnotationOp([A], op))).toEqual(['a', 'b']);
    const neg: AnnotationOp = { kind: 'erase', stroke: B, index: -5 };
    expect(ids(revertAnnotationOp([A], neg))).toEqual(['b', 'a']);
  });

  it('reverting an add is keyed on IDENTITY, not on position', () => {
    // The list may have shifted under the op (an intervening erase was undone).
    // Removing "whatever is at index" would take the wrong stroke.
    const op: AnnotationOp = { kind: 'add', stroke: B, index: 0 };
    expect(ids(revertAnnotationOp([A, C, B], op))).toEqual(['a', 'c']);
  });
});

describe('strokeHasExtent — VIEW-04, the invisible click', () => {
  const at = (tool: AnnotationStroke['tool'], points: AnnotationStroke['points']) =>
    strokeHasExtent({ tool, points });
  const P = { x: 5, y: 5 };

  it.each(['pencil', 'highlighter'] as const)(
    'a %s CLICK (one point) draws nothing and is rejected',
    (tool) => {
      // `polylinePathD([p])` is `'M 5 5'` — a moveto with no geometry.
      expect(at(tool, [P])).toBe(false);
    }
  );

  it.each(['pencil', 'highlighter'] as const)(
    'a %s DRAG is kept',
    (tool) => {
      expect(at(tool, [P, { x: 6, y: 7 }])).toBe(true);
    }
  );

  it('a freehand drag that returns to its origin is still a real stroke', () => {
    // Two points at the same place is a deliberate gesture with geometry (a
    // closed scribble), unlike one point. The rule is point COUNT for freehand
    // precisely because the path is a polyline, not a two-point extent.
    expect(at('pencil', [P, P])).toBe(true);
  });

  it.each(['rectangle', 'ellipse', 'line', 'arrow'] as const)(
    'CONTROL: a zero-extent %s was always rejected, and still is',
    (tool) => {
      expect(at(tool, [P, P])).toBe(false);
    }
  );

  it.each(['rectangle', 'ellipse', 'line', 'arrow'] as const)(
    'CONTROL: a dragged %s is kept',
    (tool) => {
      expect(at(tool, [P, { x: 50, y: 50 }])).toBe(true);
    }
  );

  it('a shape with a single point is rejected rather than throwing', () => {
    expect(at('rectangle', [P])).toBe(false);
  });
});
