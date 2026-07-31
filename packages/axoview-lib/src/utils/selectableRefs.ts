import { ItemReference } from 'src/types';
import { getConnectorWaypointRefs } from 'src/utils/connectorSelection';

// Minimal scene shape needed to enumerate selectable refs — kept structural so
// both useInteractionManager (Ctrl+A) and the canvas context menu (Select all)
// can pass their `useScene()` result without coupling to its full type.
interface SelectableScene {
  items: { id: string }[];
  rectangles: { id: string }[];
  textBoxes: { id: string }[];
  // Optional so partial scenes (tests) don't crash; the live scene provides it.
  labels?: { id: string }[];
  connectors: Parameters<typeof getConnectorWaypointRefs>[0][];
}

// An item is interactable only if its layer is unlocked AND visible.
// `hasLayers === false` is the "no layers configured" fallback (matches the
// SceneLayers render guards + onContextMenu). UX §4.3.
//
// NOTE: the fallback keys off whether ANY layer exists, NOT `visibleIds.size`.
// An empty `visibleIds` is ambiguous — it also occurs when every entity sits on
// a hidden layer — so treating "empty" as "no layers" made a fully-hidden view
// snap back to fully-interactable (the layer-visibility regression). When layers
// exist, `visibleIds` is authoritative: unassigned/visible entities are members,
// hidden-layer entities are not.
export const makeInteractableCheck =
  (
    lockedIds: ReadonlySet<string>,
    visibleIds: ReadonlySet<string>,
    hasLayers: boolean
  ) =>
  (id: string) =>
    !lockedIds.has(id) && (!hasLayers || visibleIds.has(id));

// Every visible + unlocked item in the active view, including connector
// waypoints (which aren't free — see getConnectorWaypointRefs). The single
// source of truth for Ctrl+A and the context menu's "Select all" so the two
// can't drift (ADR 0006 §3 / UX §4.3-§4.4).
export const collectSelectableRefs = (
  scene: SelectableScene,
  lockedIds: ReadonlySet<string>,
  visibleIds: ReadonlySet<string>,
  hasLayers: boolean
): ItemReference[] => {
  const isInteractable = makeInteractableCheck(lockedIds, visibleIds, hasLayers);
  const refs: ItemReference[] = [];
  for (const item of scene.items) {
    if (isInteractable(item.id)) refs.push({ type: 'ITEM', id: item.id });
  }
  for (const r of scene.rectangles) {
    if (isInteractable(r.id)) refs.push({ type: 'RECTANGLE', id: r.id });
  }
  for (const tb of scene.textBoxes) {
    if (isInteractable(tb.id)) refs.push({ type: 'TEXTBOX', id: tb.id });
  }
  for (const l of scene.labels ?? []) {
    if (isInteractable(l.id)) refs.push({ type: 'LABEL', id: l.id });
  }
  for (const c of scene.connectors) {
    if (!isInteractable(c.id)) continue;
    refs.push({ type: 'CONNECTOR', id: c.id });
    refs.push(...getConnectorWaypointRefs(c));
  }
  return refs;
};

// ---------------------------------------------------------------------------
// Additive marquee (I3/SEL-15, ruled 2026-07-30 — ADR 0006 §2 addendum)
// ---------------------------------------------------------------------------
//
// The CLICK path has treated Shift/Ctrl/Cmd as additive since change #10
// ("Shift joins Ctrl/Cmd as an additive-selection modifier on canvas"), but a
// marquee ignored the same modifier and replaced the selection outright — so
// one gesture taught the user a rule the other broke. The owner adopted the
// near-universal behaviour (Figma, Miro, Lucid, draw.io, Illustrator, Sketch,
// Inkscape, Blender all extend on Shift+drag).
//
// Both marquee tools call this, so the rectangular and freehand lassos cannot
// drift the way the two `mouseup` handlers otherwise would.

/** Identity for de-duping refs: type AND id (an anchor id is not an item id). */
const refKey = (ref: ItemReference): string => `${ref.type}:${ref.id}`;

/**
 * The selection a completed marquee should produce.
 *
 * Non-additive: the marquee's own catch, unchanged. Additive: the existing
 * selection plus the catch, de-duped, with the existing members kept in their
 * original order so an extend never reshuffles what was already selected.
 *
 * Note this is a UNION, not a toggle. A subtract modifier is a common second
 * tier in the Adobe family and Blender, but is not baseline and was not ruled.
 */
export const mergeMarqueeSelection = (
  existing: readonly ItemReference[],
  marquee: readonly ItemReference[],
  additive: boolean
): ItemReference[] => {
  if (!additive) return [...marquee];
  const seen = new Set(existing.map(refKey));
  const merged = [...existing];
  for (const ref of marquee) {
    if (seen.has(refKey(ref))) continue;
    seen.add(refKey(ref));
    merged.push(ref);
  }
  return merged;
};

/**
 * Was the additive modifier held for this event? The same three keys the click
 * path honours (`resolveClickSelection`), read from the same place.
 */
export const isAdditiveModifier = (
  modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean } | undefined
): boolean => !!(modifiers?.ctrl || modifiers?.meta || modifiers?.shift);
