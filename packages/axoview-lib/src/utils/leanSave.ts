import { Icon, Model } from 'src/types';

/**
 * ADR 0003 lean-save — THE algorithm, and the only implementation.
 *
 * **2026-08-01 ruling (ADR 0003 addendum).** The algorithm lives here; the
 * CATALOG is a parameter the host injects. It used to run against
 * `src/fixtures/icons.ts`, which exported `[]` — so `stripDefaultIcons` was the
 * identity function and `mergeBundledFixtures` was inert. "Export as JSON"
 * therefore wrote every icon the session had loaded (the whole AWS / GCP /
 * Azure / Kubernetes / Material catalog, SVG payloads and all) into the file
 * users mail around, while the storage path — which had its own SECOND
 * implementation, app-side — wrote one icon (F5/ICON-01/02).
 *
 * **Why the fixture was not simply filled in.** That was the rejected
 * alternative: it duplicates the catalog on both sides of the package boundary,
 * which is the exact class this wave is closing; it bloats a library that
 * publishes standalone and carries a bundle-size gate; and it drifts the moment
 * a pack changes. The empty fixture was a SYMPTOM. The defect is that a library
 * held an opinion about host data.
 *
 * The catalog reaches here through the existing host→lib seam — the same
 * channel the app already uses to hand `<Axoview>` its merged icons.
 */

/** Fields that decide whether a model icon is a pure duplicate of a catalog entry. */
const ICON_COMPARE_FIELDS: (keyof Icon)[] = [
  'name',
  'url',
  'collection',
  'isIsometric'
];

const iconMatchesCatalogEntry = (icon: Icon, entry: Icon): boolean =>
  ICON_COMPARE_FIELDS.every((field) => icon[field] === entry[field]);

const indexById = (catalog: readonly Icon[]): Map<string, Icon> =>
  new Map(catalog.map((icon) => [icon.id, icon]));

/**
 * Drop icons that are pure duplicates of a catalog entry — the host will supply
 * them again on load, so their payloads need not be persisted.
 *
 * Preserved verbatim, because the host will NOT supply them:
 *  - an icon whose id is absent from the catalog (the user's own);
 *  - an OVERRIDE — same id, different metadata (A2/STOR-14). Dropping one would
 *    let the catalog's original silently take its place on the next load.
 *
 * An EMPTY catalog means "the host told us nothing", and the honest answer to
 * "can this be reproduced?" is then no for everything: the model comes back
 * untouched rather than stripped against a catalog that does not exist. That is
 * the same conservative posture the pre-ruling code had by ACCIDENT (its
 * fixture was empty); it is a stated rule now rather than a consequence of a
 * stub, so a host that forgets to inject loses bytes, never data.
 */
export const stripDefaultIcons = <M extends Pick<Model, 'icons'>>(
  model: M,
  catalog: readonly Icon[] = []
): M => {
  if (catalog.length === 0) return { ...model, icons: model.icons ?? [] };
  const byId = indexById(catalog);
  const filtered = (model.icons ?? []).filter((icon) => {
    const entry = byId.get(icon.id);
    if (!entry) return true;
    return !iconMatchesCatalogEntry(icon, entry);
  });
  return { ...model, icons: filtered };
};

/**
 * Merge the host's catalog back into a saved model's icons (ADR 0002), so the
 * side dock has the full set regardless of what was persisted. Union by id with
 * the MODEL's entry winning, which is what preserves a user's override.
 */
export const mergeBundledFixtures = <M extends Pick<Model, 'icons'>>(
  model: M,
  catalog: readonly Icon[] = []
): M => {
  const modelIcons = model.icons ?? [];
  if (catalog.length === 0) return { ...model, icons: modelIcons };
  const seen = new Set(modelIcons.map((i) => i.id));
  const additions = catalog.filter((entry) => !seen.has(entry.id));
  if (additions.length === 0) return { ...model, icons: modelIcons };
  return { ...model, icons: [...modelIcons, ...additions] };
};
