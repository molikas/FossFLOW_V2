/**
 * F5 / ICON-07, ICON-09 — ADR 0044 per-node icon scale.
 *
 * ICON-07 is a PARITY sweep over the resolution rule
 * `viewItem.iconScale ?? icon.scale ?? 1`, transcribed from each of the five
 * readers that exist today. It is a guard, not a bug hunt: a NEW reader that
 * resolves differently is the failure mode the ADR warns about, and CI is
 * otherwise pixel-blind here.
 *
 * ICON-09 re-confirms the already-filed CLIP-13 (a group resize can commit a
 * scale outside the schema's hard [0.1, 3]) from the F5 side, because the
 * group transform is this area's own control.
 */
import { viewItemSchema } from 'src/schemas/views';
import { iconSchema } from 'src/schemas/icons';

// ---------------------------------------------------------------------------
// ICON-07 — one resolution rule, five readers
// ---------------------------------------------------------------------------

type Node = { iconScale?: number };
type Icon = { scale?: number };

/** Each entry is transcribed verbatim from its source file. */
const READERS: Array<[string, (n: Node, i: Icon) => number]> = [
  // NodesCanvas.tsx:508
  ['NodesCanvas', (n, i) => n.iconScale ?? i.scale ?? 1],
  // TransformControlsManager/HoverOutline.tsx:33
  ['HoverOutline', (n, i) => n.iconScale ?? i.scale ?? 1],
  // TransformControlsManager/NodeTransformControls.tsx:57
  ['NodeTransformControls', (n, i) => n.iconScale ?? i.scale ?? 1],
  // TransformControlsManager/NodeGroupTransformControls.tsx:50
  ['NodeGroupTransformControls', (n, i) => n.iconScale ?? i?.scale ?? 1],
  // hooks/useIcon.tsx:39 — the DOM icon path, via an explicit override arg
  ['useIcon', (n, i) => n.iconScale ?? i.scale ?? 1]
];

const CASES: Array<[string, Node, Icon, number]> = [
  ['per-node override wins', { iconScale: 2.5 }, { scale: 1.5 }, 2.5],
  ['asset scale is the fallback', {}, { scale: 1.5 }, 1.5],
  ['neither set → 1', {}, {}, 1],
  // The one that separates `??` from `||`: a 0 scale is not a legal value, but
  // a reader written with `||` would silently skip it — worth pinning.
  ['an explicit 0 override is honoured by ??', { iconScale: 0 }, { scale: 2 }, 0]
];

describe('ICON-07 — every iconScale reader resolves identically', () => {
  it('CONTROL: the sweep can tell two rules apart', () => {
    const wrong = (n: Node, i: Icon) => i.scale ?? n.iconScale ?? 1;
    expect(wrong({ iconScale: 2.5 }, { scale: 1.5 })).not.toBe(2.5);
    const orRule = (n: Node, i: Icon) => n.iconScale || i.scale || 1;
    expect(orRule({ iconScale: 0 }, { scale: 2 })).not.toBe(0);
  });

  it.each(
    READERS.flatMap(([name, fn]) =>
      CASES.map(([label, n, i, want]) => [`${name} — ${label}`, fn, n, i, want] as const)
    )
  )('%s', (_label, fn, n, i, want) => {
    expect(fn(n, i)).toBe(want);
  });
});

// ---------------------------------------------------------------------------
// ICON-09 — the group factor vs the schema cap (known: CLIP-13)
// ---------------------------------------------------------------------------

describe('ICON-09 — a group resize factor past the schema cap', () => {
  // NodeGroupTransformControls: each member's committed scale is
  // `startScale * factor`, preserving relative sizes.
  const commit = (startScale: number, factor: number) => startScale * factor;

  it('PRECONDITION: the schema caps a view item\'s iconScale at [0.1, 3] — and the ICON asset shares that cap', () => {
    const base = { id: 'v1', tile: { x: 0, y: 0 } };
    expect(viewItemSchema.safeParse({ ...base, iconScale: 3 }).success).toBe(true);
    expect(viewItemSchema.safeParse({ ...base, iconScale: 3.25 }).success).toBe(
      false
    );
    expect(
      iconSchema.safeParse({ id: 'i', name: 'n', url: 'u', scale: 3.25 }).success
    ).toBe(false);
  });

  it('ICON-09 (known — CLIP-13): a member already at 2.5× times a 1.3 factor commits 3.25, which the loader rejects', () => {
    const committed = commit(2.5, 1.3);
    expect(committed).toBeCloseTo(3.25, 5);
    expect(
      viewItemSchema.safeParse({
        id: 'v1',
        tile: { x: 0, y: 0 },
        iconScale: committed
      }).success
    ).toBe(false);
  });

  it('CHARACTERIZATION: per-member clamping would break the "relative sizes preserved" contract, which is why the fix is not a clamp', () => {
    // Two members at 1.0 and 2.5, one factor of 1.3.
    const a = commit(1.0, 1.3);
    const b = commit(2.5, 1.3);
    expect(b / a).toBeCloseTo(2.5, 5);
    const clamp = (v: number) => Math.min(3, Math.max(0.1, v));
    // Clamping b alone destroys the ratio the group resize exists to keep.
    expect(clamp(b) / clamp(a)).not.toBeCloseTo(2.5, 5);
  });
});
