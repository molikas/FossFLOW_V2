import { PersistedDiagramBlob, isPersistedDiagramBlob } from './types';
import type { Icon } from 'axoview';
import { stripDefaultIcons, sweepOrphanModelItems } from 'axoview';
import {
  getBundledCatalog,
  isRehydratableIcon
} from '../icons/bundledCatalog';

// ADR 0003 lean-save. Shared by every StorageProvider that persists a model so
// they all strip pack icons + record requiredPacks identically (LocalStorage +
// GoogleDrive). Keep it provider-agnostic — no fetch, no storage.
//
// Plain-object dictionaries (not Set) and indexed `for` loops throughout are
// deliberate: ts-jest transpiles `new Set` under target=es5 with a broken
// polyfill where `.add()` is a no-op for string members, making derived-/known-
// lookups silently empty.

// Index the icon ids referenced by items.
const collectItemIconIds = (
  items: PersistedDiagramBlob['items']
): { [k: string]: true } => {
  const itemIconIds: { [k: string]: true } = {};
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && typeof item.icon === 'string') itemIconIds[item.icon] = true;
    }
  }
  return itemIconIds;
};

// Walk the model's icons once: record which ids are known, and which
// non-core/non-imported collections are actually referenced by an item.
const analyzeModelIcons = (
  modelIcons: Icon[],
  itemIconIds: { [k: string]: true }
): {
  knownIconIds: { [k: string]: true };
  derivedRequiredPacks: { [k: string]: true };
} => {
  const knownIconIds: { [k: string]: true } = {};
  const derivedRequiredPacks: { [k: string]: true } = {};
  for (let i = 0; i < modelIcons.length; i++) {
    const icon = modelIcons[i];
    if (icon && icon.id) knownIconIds[icon.id] = true;
    if (
      icon &&
      icon.id &&
      itemIconIds[icon.id] &&
      isFetchableCollection(icon.collection)
    ) {
      derivedRequiredPacks[icon.collection] = true;
    }
  }
  return { knownIconIds, derivedRequiredPacks };
};

// A collection worth naming in `requiredPacks`: one the load path fetches.
// `isoflow` is bundled and `imported` is the user's own data — neither is
// fetchable, and listing them would send the loader after a pack that does not
// exist. Same rule on both derivation paths below, deliberately.
const isFetchableCollection = (collection: unknown): collection is string =>
  typeof collection === 'string' &&
  collection !== 'isoflow' &&
  collection !== 'imported';

/**
 * E4/CLIP-14, the icon-reference half.
 *
 * An item may reference an icon id that is NOT in `model.icons` — the entry's
 * case is pasting a node from a diagram that had a pack loaded into one that
 * did not. Nothing rejects that (`validateModelItem` leaves icon refs alone on
 * purpose, because icons legitimately arrive from separately-loaded packs), so
 * the reference commits cleanly and the derivation above never sees it: the id
 * resolves against nothing, no collection is recorded, `requiredPacks` does not
 * name the pack, the load path does not fetch it, and the node comes back as a
 * tombstone after save+reload.
 *
 * The missing step is the one only the HOST can take — the same host-only
 * question `applyIconStrip` asks. The pasted id is unknown to the MODEL but the
 * live catalog usually knows it (the source diagram loaded that pack in this
 * session, which is how the paste had a real icon to begin with). So: resolve
 * the leftovers against the catalog and record what it says.
 *
 * Note this is deliberately NOT a validation change. The entry says so, and it
 * is right: rejecting the reference would break the legitimate pack case, and
 * repairing it away would delete the user's node. Recovering the pack name is
 * the repair — wave 1's repair-don't-reject ruling applied to icon refs.
 */
const resolveIconPacksFromCatalog = (
  itemIconIds: { [k: string]: true },
  knownIconIds: { [k: string]: true },
  catalog: Icon[]
): { packs: { [k: string]: true }; resolvedIds: { [k: string]: true } } => {
  const packs: { [k: string]: true } = {};
  const resolvedIds: { [k: string]: true } = {};
  const unresolved: string[] = [];
  const itemIconIdList = Object.keys(itemIconIds);
  for (let i = 0; i < itemIconIdList.length; i++) {
    if (!knownIconIds[itemIconIdList[i]]) unresolved.push(itemIconIdList[i]);
  }
  if (unresolved.length === 0) return { packs, resolvedIds };

  const collectionById: { [id: string]: unknown } = {};
  for (let i = 0; i < catalog.length; i++) {
    const icon = catalog[i];
    if (icon && icon.id && !(icon.id in collectionById)) {
      collectionById[icon.id] = icon.collection;
    }
  }
  for (let i = 0; i < unresolved.length; i++) {
    const id = unresolved[i];
    if (!(id in collectionById)) continue;
    // In the catalog at all — the id is accounted for, so it no longer blocks
    // the derived list from being authoritative. A core (`isoflow`) hit is
    // exactly that case: resolved, and correctly contributes no pack.
    resolvedIds[id] = true;
    const collection = collectionById[id];
    if (isFetchableCollection(collection)) packs[collection] = true;
  }
  return { packs, resolvedIds };
};

// True when every item-referenced icon id resolves — against the model's own
// icons array, or (CLIP-14) against the catalog the host could name a pack for.
const allItemIconsResolved = (
  itemIconIds: { [k: string]: true },
  knownIconIds: { [k: string]: true },
  recoveredIds: { [k: string]: true }
): boolean => {
  const itemIconIdList = Object.keys(itemIconIds);
  for (let i = 0; i < itemIconIdList.length; i++) {
    const id = itemIconIdList[i];
    if (!knownIconIds[id] && !recoveredIds[id]) return false;
  }
  return true;
};
/**
 * ADR 0003 addendum (owner ruling 2026-08-01) — ONE lean-save implementation.
 *
 * This file used to carry its own copy of the strip rule, which is how the app
 * and the lib ended up disagreeing (F5/ICON-01/02: saving wrote one icon,
 * exporting wrote the whole loaded catalog). The ALGORITHM is the lib's
 * `stripDefaultIcons`; the CATALOG comes from the app's canonical module; and
 * the one thing that stays here is the question only the host can answer —
 * WHICH COLLECTIONS this build can rehydrate.
 *
 * Keep an icon when ANY of these holds:
 *   1. its collection names no source this build can reload (A2/STOR-14 half 1,
 *      wave 1 — dropping it made the icon return as a tombstone);
 *   2. it is the user's OVERRIDE of a catalog entry (A2/STOR-14 half 2, this
 *      wave — dropping it would let the original silently replace the edit);
 *   3. its id is absent from the catalog entirely (the user's own icon).
 * Rules 2 and 3 are exactly what `stripDefaultIcons` keeps, so they are not
 * re-implemented here.
 */
const applyIconStrip = (modelIcons: Icon[]): Icon[] => {
  const catalog = getBundledCatalog();
  // Composed by OBJECT IDENTITY, not by id. `stripDefaultIcons` filters, so it
  // returns the same references — and nothing enforces id uniqueness in a model
  // (E4/CLIP-01), so an id-keyed set would keep or drop every icon sharing an id
  // together. The contract gate's fixture has two entries with one id for
  // exactly this reason; it caught that on the first run.
  const keptByLib = stripDefaultIcons({ icons: modelIcons }, catalog).icons;
  const catalogIds = new Set(catalog.map((c) => c.id));

  return modelIcons.filter((icon) => {
    // Host-only question: nothing will supply this on load, so it is data.
    if (!isRehydratableIcon(icon)) return true;
    // Rehydratable, and the catalog has never heard of it — the pack simply is
    // not loaded in this session. `requiredPacks` refetches it on load, so it
    // is reproducible and need not be persisted. (Keeping it here is what made
    // the export fat: an unloaded pack icon is still a pack icon.)
    if (!catalogIds.has(icon.id)) return false;
    // Rehydratable and known: the LIB decides. It keeps an icon the catalog
    // does not reproduce exactly, which for a known id means the user overrode
    // it — A2/STOR-14's remaining half.
    return keptByLib.indexOf(icon) !== -1;
  });
};

/**
 * Apply ADR 0003 lean-save: keep only user-supplied (imported) icons. Pack icons
 * (isoflow, aws, gcp, …) are always rehydrated from the icon pack manager on
 * load, so their SVG payloads are not persisted. Also persists `requiredPacks` —
 * the unique non-isoflow/imported collections referenced by items — so the load
 * path can fetch exactly those packs.
 */
export const leanIfModel = (data: unknown): unknown => {
  if (!isPersistedDiagramBlob(data)) return data;
  const modelIcons: Icon[] | undefined = data.icons;
  if (!Array.isArray(modelIcons)) return data;
  const model = data;

  const itemIconIds = collectItemIconIds(model.items);
  const { knownIconIds, derivedRequiredPacks } = analyzeModelIcons(
    modelIcons,
    itemIconIds
  );

  // E4/CLIP-14: whatever the model's own icons could not account for, ask the
  // catalog about before giving up on it.
  const recovered = resolveIconPacksFromCatalog(
    itemIconIds,
    knownIconIds,
    getBundledCatalog()
  );
  const derivedIds = Object.keys(recovered.packs);
  for (let i = 0; i < derivedIds.length; i++) {
    derivedRequiredPacks[derivedIds[i]] = true;
  }

  // If every item's icon is accounted for — by the icons array or by the
  // catalog — the derived list is authoritative, so a pack nothing references
  // any more stops being fetched. Otherwise the input is already lean (icons
  // stripped to imported-only) and we still can't see what packs the remaining
  // items need, so the derived list is a floor rather than the answer: UNION it
  // with whatever was on the input rather than either overwriting with [] or
  // discarding what we did manage to derive.
  const allResolved = allItemIconsResolved(
    itemIconIds,
    knownIconIds,
    recovered.resolvedIds
  );
  const existingRequiredPacks = Array.isArray(model.requiredPacks)
    ? (model.requiredPacks as unknown[]).filter(
        (p): p is string => typeof p === 'string'
      )
    : null;
  const derived = Object.keys(derivedRequiredPacks);
  if (!allResolved && existingRequiredPacks) {
    for (let i = 0; i < existingRequiredPacks.length; i++) {
      derivedRequiredPacks[existingRequiredPacks[i]] = true;
    }
  }
  const requiredPacks = allResolved
    ? derived
    : Object.keys(derivedRequiredPacks);

  // E2/RED-08 — collect model items no view references. Lean-save is the
  // natural home per the entry: at SAVE time rather than at delete time, so
  // undoing a delete still restores a node whose model item is intact.
  const swept = sweepOrphanModelItems(
    model as unknown as { items: never[]; views: never[] }
  );

  return {
    ...model,
    items: swept.model.items,
    // A2/STOR-14, both halves. `collection === 'imported'` was a STRICTER rule
    // than ADR 0003, so two kinds of user data were discarded on every SAVE
    // while every EXPORT preserved them, and `mergeBundledFixtures` could
    // restore neither on load:
    //   - an icon from a pack this build no longer bundles (wave 1);
    //   - a bundled icon the user OVERRODE (this wave) — the exact case ADR
    //     0003 lists as an acceptance criterion ("override wins"), which stayed
    //     open only because there was no app-side catalog to compare against.
    icons: applyIconStrip(modelIcons),
    requiredPacks
  };
};
