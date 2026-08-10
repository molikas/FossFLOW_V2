import { Model } from 'src/types';

/**
 * E2/RED-08 — collect `model.items` that no view references.
 *
 * Deleting a node removes only the VIEW item; its `model.items` entry (name,
 * icon, notes, link) was never collected. A place-then-delete cycle therefore
 * grew `model.items` without bound while the canvas stayed empty, and every
 * orphan was written to localStorage / Drive, included in JSON and ZIP exports,
 * and re-loaded next session. Nothing surfaced them: `validateView` only checks
 * the other direction (view item → model item), and lean-save strips bundled
 * icons but never orphaned items.
 *
 * **At SAVE time, not at delete time** — the entry's own direction, and the
 * reason matters: collecting on delete would make UNDO of that delete restore a
 * view item whose model item is gone. Save is the moment the document is
 * declared final; undo cannot cross it.
 *
 * Scoped to items referenced by NO view, not by the current one: a model item
 * used only on page 3 is live, and the campaign's sibling finding (cross-page
 * content) is exactly the shape that would break if this looked at one view.
 */
export const sweepOrphanModelItems = <M extends Pick<Model, 'items' | 'views'>>(
  model: M
): { model: M; removed: number } => {
  const items = model.items ?? [];
  if (items.length === 0) return { model, removed: 0 };

  const referenced = new Set<string>();
  (model.views ?? []).forEach((view) => {
    (view?.items ?? []).forEach((viewItem) => {
      if (viewItem?.id) referenced.add(viewItem.id);
    });
  });

  // `filter(Boolean)` first: a malformed array can hold an `undefined` slot
  // (E2/RED-01's corruption, already in users' files), and a sweep that threw
  // on one would be a worse failure than the leak it is fixing.
  const kept = items.filter((item) => !!item && referenced.has(item.id));
  const removed = items.length - kept.length;
  if (removed === 0) return { model, removed: 0 };
  return { model: { ...model, items: kept }, removed };
};
