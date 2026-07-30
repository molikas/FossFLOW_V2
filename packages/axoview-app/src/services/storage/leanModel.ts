import { PersistedDiagramBlob, isPersistedDiagramBlob } from './types';
import type { Icon } from 'axoview';
import { ALL_ICON_PACK_NAMES } from '../iconPackManager';

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
      typeof icon.collection === 'string' &&
      icon.collection !== 'isoflow' &&
      icon.collection !== 'imported'
    ) {
      derivedRequiredPacks[icon.collection] = true;
    }
  }
  return { knownIconIds, derivedRequiredPacks };
};

// True when every item-referenced icon id resolves against the icons array.
const allItemIconsResolved = (
  itemIconIds: { [k: string]: true },
  knownIconIds: { [k: string]: true }
): boolean => {
  const itemIconIdList = Object.keys(itemIconIds);
  for (let i = 0; i < itemIconIdList.length; i++) {
    if (!knownIconIds[itemIconIdList[i]]) return false;
  }
  return true;
};
/**
 * Collections the load path can actually rehydrate: the bundled `isoflow` set
 * plus every shippable icon pack. Anything else names a source nothing will
 * supply on load.
 */
// Plain-object dictionary, not a Set — see the file header: under this
// package's es5 target ts-jest's Set polyfill silently drops string members.
const REHYDRATABLE_COLLECTIONS: { [k: string]: true } = { isoflow: true };
ALL_ICON_PACK_NAMES.forEach((pack) => {
  REHYDRATABLE_COLLECTIONS[pack] = true;
});

/**
 * "Is this icon the user's data, or will it come back from a pack?" — the
 * app-side counterpart of the question the lib's `stripDefaultIcons` asks
 * (A2/STOR-14). `collection === 'imported'` was a stricter rule than either ADR
 * 0003 or the lib: an icon from a pack this build no longer ships has a
 * collection that is neither 'imported' nor loadable, so the save dropped it,
 * `mergeBundledFixtures` could not restore it, and it returned as a tombstone.
 *
 * (The remaining STOR-14 case — a user's OVERRIDE of a bundled icon, which ADR
 * 0003 lists as an acceptance criterion — needs the bundled catalog to compare
 * against, and the app half of that catalog is itself empty: that is the wave 4
 * app/lib dual-implementation item, F5/ICON-01/02.)
 */
const isUserIcon = (icon: Icon): boolean => {
  if (icon.collection === 'imported') return true;
  if (!icon.collection) return true; // nothing names a source for it
  return !REHYDRATABLE_COLLECTIONS[icon.collection];
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

  // If every item's icon resolves against the icons array, the derived list is
  // authoritative. Otherwise the input is already lean (icons stripped to
  // imported-only) and we can't see what packs the unresolved items need —
  // preserve whatever was on the input rather than overwriting with [].
  const allResolved = allItemIconsResolved(itemIconIds, knownIconIds);
  const existingRequiredPacks = Array.isArray(model.requiredPacks)
    ? (model.requiredPacks as unknown[]).filter(
        (p): p is string => typeof p === 'string'
      )
    : null;
  const derived = Object.keys(derivedRequiredPacks);
  const requiredPacks = allResolved ? derived : existingRequiredPacks ?? derived;

  return {
    ...model,
    // A2/STOR-14: `collection === 'imported'` is a STRICTER rule than ADR 0003
    // and than the lib's `stripDefaultIcons`, which keeps anything a bundled
    // fixture does not reproduce exactly. Two kinds of user data were being
    // discarded on every SAVE while every EXPORT preserved them, and
    // `mergeBundledFixtures` cannot restore either on load:
    //   - an icon from a pack this build no longer bundles (its collection is
    //     not 'imported', and nothing supplies it any more);
    //   - a bundled icon the user OVERRODE (renamed, re-coloured) — the exact
    //     case ADR 0003 lists as an acceptance criterion ("override wins").
    // Keep an icon unless a bundled fixture reproduces it, which is the same
    // question the lib asks.
    icons: modelIcons.filter(isUserIcon),
    requiredPacks
  };
};
