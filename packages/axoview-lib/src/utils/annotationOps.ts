import { AnnotationOp, AnnotationStroke } from 'src/types';

/**
 * F2/VIEW-07 + VIEW-13 — the annotation overlay's operation log.
 *
 * The overlay's history used to be two plain stroke stacks: `undo` popped the
 * LAST element of `strokes` and `redo` pushed it back. That models exactly one
 * thing, "draw / un-draw at the tail", and the palette offers three:
 *
 *   - **erase** is a delete at an arbitrary index. It had no representation, so
 *     it pushed nothing and merely reset the redo stack — erase the middle
 *     stroke, press Undo, and the LAST stroke vanished instead. The erased one
 *     was unrecoverable.
 *   - **clear** removed everything and was not undoable at all, even though it
 *     sits in the same three-button row as Undo and Redo (VIEW-13's ruling:
 *     adopt, because a bin next to undo controls sets that expectation).
 *   - a stroke sitting on the redo stack was silently discarded by any erase.
 *
 * So each operation records what it did *and where*, and undo inverts it in
 * place. These two functions are exact inverses; that is the property the
 * tests assert, rather than each branch separately.
 */

const insertAt = (
  strokes: AnnotationStroke[],
  index: number,
  stroke: AnnotationStroke
): AnnotationStroke[] => {
  // Clamped rather than trusted: an index is only meaningful against the list
  // it was recorded on, and a clamp degrades to "at the end" instead of
  // producing a hole or dropping the stroke.
  const at = Math.max(0, Math.min(index, strokes.length));
  return [...strokes.slice(0, at), stroke, ...strokes.slice(at)];
};

const withoutId = (
  strokes: AnnotationStroke[],
  id: string
): AnnotationStroke[] => strokes.filter((s) => s.id !== id);

/** Apply an operation — the "do" and "redo" direction. */
export const applyAnnotationOp = (
  strokes: AnnotationStroke[],
  op: AnnotationOp
): AnnotationStroke[] => {
  switch (op.kind) {
    case 'add':
      return insertAt(strokes, op.index, op.stroke);
    case 'erase':
      return withoutId(strokes, op.stroke.id);
    case 'clear':
      return [];
    default:
      return strokes;
  }
};

/** Invert an operation — the "undo" direction. */
export const revertAnnotationOp = (
  strokes: AnnotationStroke[],
  op: AnnotationOp
): AnnotationStroke[] => {
  switch (op.kind) {
    case 'add':
      return withoutId(strokes, op.stroke.id);
    case 'erase':
      // Back at its own position, which is the whole point of the restructure:
      // re-appending it would silently reorder the drawing.
      return insertAt(strokes, op.index, op.stroke);
    case 'clear':
      return op.strokes;
    default:
      return strokes;
  }
};

const isShape = (tool: AnnotationStroke['tool']) =>
  tool === 'rectangle' || tool === 'ellipse';
const isSegment = (tool: AnnotationStroke['tool']) =>
  tool === 'line' || tool === 'arrow';

/**
 * F2/VIEW-04 — "did this gesture actually draw anything?"
 *
 * The shape/segment branch always rejected a zero-extent click. The freehand
 * branch read `points.length >= 1`, which a click without a move ALWAYS
 * satisfies: it produces exactly one point, and `polylinePathD([p])` is
 * `'M x y'` — a moveto with no geometry, invisible at any stroke width. So a
 * stray click committed a stroke that drew nothing, cost an Undo press to
 * remove, counted toward what Clear removed, and accumulated silently through a
 * presentation.
 *
 * Freehand now needs two points, matching its sibling. Rejected rather than
 * rendered as a dot (the entry's other option): in present mode, where the pen
 * mostly lives, an accidental click leaving a permanent mark is the worse of
 * the two failure modes. Reversible — emit `M x y L x y` for a round-linecap
 * dot instead if a deliberate dot is wanted.
 *
 * Lives here rather than inside `AnnotationLayer.endStroke` so the rule can be
 * pinned without mounting a pointer-driven component.
 */
export const strokeHasExtent = (
  stroke: Pick<AnnotationStroke, 'tool' | 'points'>
): boolean => {
  const { tool, points } = stroke;
  if (isShape(tool) || isSegment(tool)) {
    if (points.length < 2) return false;
    return points[0].x !== points[1].x || points[0].y !== points[1].y;
  }
  return points.length >= 2;
};
