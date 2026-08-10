import isoflowIsopack from '@isoflow/isopacks/dist/isoflow';
import { flattenCollections } from '@isoflow/isopacks/dist/utils';
import { stripDefaultIcons } from 'axoview';
import type { Icon } from 'axoview';
import { ALL_ICON_PACK_NAMES } from '../iconPackManager';

/**
 * THE bundled icon catalog — one owner, two readers (F5/ICON-01/02 + A2/STOR-14).
 *
 * ADR 0003 addendum (owner ruling 2026-08-01): the lean-save ALGORITHM lives in
 * the lib and the CATALOG is a parameter the host injects. The lib publishes
 * standalone and carries a bundle-size gate; an icon catalog is host data, and a
 * library holding an opinion about host data is the defect this closes — the
 * lib's `src/fixtures/icons.ts` exported `[]`, so its half of lean-save was the
 * identity function and "Export as JSON" wrote the entire loaded catalog into
 * the file.
 *
 * Two questions are answered from here, and they need different halves of it:
 *
 *  - **Will this icon come back on load?** (lean-save) — a question about the
 *    icon's COLLECTION. Answerable statically from `ALL_ICON_PACK_NAMES` plus
 *    the bundled `isoflow` set, whether or not a pack is currently loaded.
 *  - **Is this the user's OVERRIDE of a bundled icon?** (STOR-14) — a question
 *    about the icon's CONTENT, so it needs the bundled entry to compare
 *    against, and can only be answered for packs that are actually loaded.
 *
 * The second is why this module exists rather than a bare name list: STOR-14's
 * override half was left open in wave 1 precisely because "the app's half of
 * that catalog is empty".
 */

/**
 * The core set, bundled with the app and always present. Module-level because
 * it is a pure flatten of a static import — this was a module const inside
 * `DiagramLifecycleProvider` and is hoisted here so the catalog has one owner.
 */
// The `?? []` guards are not defensive programming for its own sake: this
// module is evaluated at IMPORT time by every consumer, including test files
// that legitimately mock the isopacks away. A module-level throw there fails
// the whole suite with "Cannot read properties of undefined", which reads as a
// broken test rather than an absent catalog — and an absent catalog is a
// perfectly valid state (the lib treats it as "keep everything").
export const CORE_ICONS: Icon[] =
  (flattenCollections([isoflowIsopack]) as Icon[]) ?? [];

/**
 * Collections the load path can rehydrate: the bundled `isoflow` set plus every
 * shippable pack. `imported` is deliberately absent — an imported icon IS the
 * user's data and nothing will supply it on load.
 */
export const REHYDRATABLE_COLLECTIONS: ReadonlySet<string> = new Set<string>([
  'isoflow',
  ...(ALL_ICON_PACK_NAMES ?? [])
]);

/**
 * "Will this icon come back from a pack on load?" — the lean-save question.
 *
 * An icon with NO collection names no source for itself, so it is treated as
 * the user's data and kept. An icon whose collection is not rehydratable (a
 * pack this build no longer ships) is likewise kept: dropping it made it return
 * as a tombstone, which is the A2/STOR-14 half wave 1 fixed.
 */
export const isRehydratableIcon = (icon: Pick<Icon, 'collection'>): boolean =>
  !!icon.collection && REHYDRATABLE_COLLECTIONS.has(icon.collection);

/**
 * The live catalog: core plus whatever packs are loaded right now. Callers pass
 * the pack manager's `loadedIcons` — this module does not subscribe, so it stays
 * usable from non-React code (the ZIP exporter, the storage providers).
 */
export const buildBundledCatalog = (loadedPackIcons: Icon[] = []): Icon[] => {
  // Plain-object index, not a Map spread — this package targets es5 and
  // `[...map.values()]` needs downlevelIteration (the same constraint
  // leanModel.ts's header records for Set).
  const byId: { [id: string]: Icon } = {};
  const order: string[] = [];
  const put = (icon: Icon) => {
    if (!(icon.id in byId)) order.push(icon.id);
    byId[icon.id] = icon;
  };
  // Pack icons last: a pack that ships its own version of a core id should win,
  // which is the same precedence the app's merge already uses at load.
  CORE_ICONS.forEach(put);
  loadedPackIcons.forEach(put);
  return order.map((id) => byId[id]);
};

/**
 * A2/STOR-14's remaining half: is this the user's OVERRIDE of a bundled icon —
 * same id, different metadata?
 *
 * An override is the user's data even though its collection says otherwise, so
 * lean-save must keep it; dropping it would let the bundled original come back
 * in its place on the next load, silently discarding an edit.
 *
 * **Delegates the comparison.** Deciding "are these the same icon?" field by
 * field here would be a second implementation of the very rule this wave is
 * consolidating — so the question is put to the lib: `stripDefaultIcons` keeps
 * exactly what the catalog does not reproduce.
 *
 * Returns false when the catalog does not contain the id at all. That is not
 * "not an override", it is UNANSWERABLE — an icon from a pack that is not
 * currently loaded — and the caller treats unanswerable as reproducible,
 * because `requiredPacks` will refetch the pack on load.
 */
export const isBundledIconOverride = (icon: Icon, catalog: Icon[]): boolean => {
  if (!catalog.some((c) => c.id === icon.id)) return false;
  return stripDefaultIcons({ icons: [icon] }, catalog).icons.length === 1;
};

// ---------------------------------------------------------------------------
// The live catalog registry
// ---------------------------------------------------------------------------

/**
 * The storage providers are plain classes, not React — they cannot read the
 * pack manager's `loadedIcons` through a hook, and threading a catalog argument
 * down every save call site would put the injection seam in the wrong place
 * (every provider would have to remember it, which is how the app grew a second
 * lean-save in the first place).
 *
 * So the pack manager PUBLISHES here whenever its loaded set changes, and the
 * non-React readers pull. One owner, still — this module — with a single
 * writer.
 */
let liveCatalog: Icon[] = CORE_ICONS;

/** Called by the icon pack manager whenever the loaded pack set changes. */
export const publishLoadedPackIcons = (loadedPackIcons: Icon[]): void => {
  liveCatalog = buildBundledCatalog(loadedPackIcons);
};

/**
 * The catalog as it stands right now: core plus every loaded pack.
 *
 * Never empty — it falls back to `CORE_ICONS`, so a caller that runs before the
 * first publish still strips the bundled core rather than silently persisting
 * it. (The lib treats an EMPTY catalog as "keep everything", which is the safe
 * direction but would waste bytes on every early save.)
 */
export const getBundledCatalog = (): Icon[] => liveCatalog;
