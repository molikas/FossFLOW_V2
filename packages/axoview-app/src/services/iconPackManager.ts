import { useState, useEffect, useCallback } from 'react';
import { flattenCollections } from '@isoflow/isopacks/dist/utils';
import type { ProcessedCollection } from '@isoflow/isopacks/dist/types';
import type { Icon } from 'axoview';

// Available icon packs (excluding core isoflow which is always loaded)
export type IconPackName = 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'material';

export interface IconPackInfo {
  name: IconPackName;
  displayName: string;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  iconCount: number;
}

// localStorage keys
const LAZY_LOADING_KEY = 'axoview-lazy-loading-enabled';
const ENABLED_PACKS_KEY = 'axoview-enabled-icon-packs';

// Pack metadata
const PACK_METADATA: Record<IconPackName, string> = {
  aws: 'AWS Icons',
  gcp: 'Google Cloud Icons',
  azure: 'Azure Icons',
  kubernetes: 'Kubernetes Icons',
  material: 'Material Icons'
};

// F5/ICON-05 — every localStorage access is guarded.
//
// In a browser that THROWS on access (Safari private browsing, an iframe with
// third-party storage blocked) the raw reads below propagated and took the
// whole pack manager down at mount. Its sibling
// `axoview-lib/src/config/persistedSettings.ts` has wrapped every access since
// it was written — "errors are silently swallowed so a corrupt/missing entry
// never crashes the editor" — the same lesson, learned on one side of the
// package boundary only.
const safeRead = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeWrite = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A preference that cannot be persisted is not worth losing the session
    // over; the in-memory state is still correct for this tab.
  }
};

export const loadLazyLoadingPreference = (): boolean => {
  const stored = safeRead(LAZY_LOADING_KEY);
  return stored === null ? true : stored === 'true'; // Default to true
};

export const saveLazyLoadingPreference = (enabled: boolean): void => {
  safeWrite(LAZY_LOADING_KEY, String(enabled));
};

// Default: all packs enabled so AWS/GCP/Azure/K8s icons are available out of
// the box. Users can opt individual packs off in Settings → Icon Packs.
const DEFAULT_ENABLED_PACKS: IconPackName[] = [
  'aws',
  'gcp',
  'azure',
  'kubernetes',
  'material'
];

/**
 * F5/ICON-04 — guard the SHAPE, not just the parse.
 *
 * This used to be `JSON.parse(stored) as IconPackName[]`, and an assertion is
 * not a check: a bare string, `null`, or a list holding a name that is not a
 * pack all parsed cleanly and were returned verbatim, so `loadIconPack` hit its
 * `default:` throw. The value survives across sessions, so the failure repeated
 * on every boot until the key was cleared by hand — a corrupt preference
 * bricked icon loading with no way back from the UI.
 *
 * Filtered against the pack list rather than validated wholesale: one bad name
 * in an otherwise good list should cost the user that one pack, not all of them.
 */
export const loadEnabledPacks = (): IconPackName[] => {
  const stored = safeRead(ENABLED_PACKS_KEY);
  if (!stored) return DEFAULT_ENABLED_PACKS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return DEFAULT_ENABLED_PACKS;
  }
  if (!Array.isArray(parsed)) return DEFAULT_ENABLED_PACKS;
  const known = parsed.filter((name): name is IconPackName =>
    ALL_ICON_PACK_NAMES.includes(name as IconPackName)
  );
  // Nothing survived — the stored value tells us nothing usable, so fall back
  // rather than leaving the user with no packs at all.
  return known.length > 0 ? known : DEFAULT_ENABLED_PACKS;
};

export const saveEnabledPacks = (packs: IconPackName[]): void => {
  safeWrite(ENABLED_PACKS_KEY, JSON.stringify(packs));
};

// Dynamic pack loader
export const loadIconPack = async (
  packName: IconPackName
): Promise<ProcessedCollection | null> => {
  switch (packName) {
    case 'aws':
      return (await import('@isoflow/isopacks/dist/aws')).default;
    case 'gcp':
      return (await import('@isoflow/isopacks/dist/gcp')).default;
    case 'azure':
      return (await import('@isoflow/isopacks/dist/azure')).default;
    case 'kubernetes':
      return (await import('@isoflow/isopacks/dist/kubernetes')).default;
    case 'material': {
      // Generated at prebuild — imported as a JSON asset. The build omits the
      // per-icon `isIsometric` flag (all material icons are non-isometric, and
      // flattenCollections doesn't read it back), so a structural cast is safe.
      const pack = await import('../assets/material-icons-pack.json');
      return (pack.default ?? pack) as unknown as ProcessedCollection;
    }
    default:
      // F5/ICON-04: an unknown name is SKIPPED, not thrown on. It used to
      // throw, which is how one bad entry in a persisted preference became a
      // hard failure that repeated on every boot. `loadEnabledPacks` now
      // filters, so this is unreachable from the preference path — but a name
      // can also arrive from a diagram's `requiredPacks`, which is untrusted
      // file content, and a diagram must never be able to break icon loading.
      return null;
  }
};

export const ALL_ICON_PACK_NAMES: IconPackName[] = [
  'aws',
  'gcp',
  'azure',
  'kubernetes',
  'material'
];

// Map every icon id in an untyped payload to its collection name. Only
// well-formed { id: string, collection: string } entries are kept.
const buildIconIdToCollection = (icons: unknown[]): Map<string, string> => {
  const idToCollection = new Map<string, string>();
  for (const icon of icons) {
    if (
      typeof icon === 'object' &&
      icon !== null &&
      typeof (icon as { id?: unknown }).id === 'string' &&
      typeof (icon as { collection?: unknown }).collection === 'string'
    ) {
      idToCollection.set(
        (icon as { id: string }).id,
        (icon as { collection: string }).collection
      );
    }
  }
  return idToCollection;
};

// Derive the icon collections a diagram payload references, honouring both
// `requiredPacks` and the items × icons cross-reference (see callers' note).
const collectRequiredCollections = (blob: {
  requiredPacks?: unknown;
  items?: unknown;
  icons?: unknown;
}): Set<string> => {
  const collections = new Set<string>();

  if (Array.isArray(blob.requiredPacks)) {
    for (const p of blob.requiredPacks) {
      if (typeof p === 'string') collections.add(p);
    }
  }

  const items: unknown[] = Array.isArray(blob.items) ? blob.items : [];
  const icons: unknown[] = Array.isArray(blob.icons) ? blob.icons : [];
  if (!items.length || !icons.length) return collections;

  const idToCollection = buildIconIdToCollection(icons);
  for (const item of items) {
    // ModelItem.icon is `string` per schema; the object-shaped fallback
    // handles legacy single-JSON imports that retained the inline icon.
    const itemIcon = (item as { icon?: unknown })?.icon;
    const iconId =
      typeof itemIcon === 'string'
        ? itemIcon
        : (itemIcon as { id?: string } | undefined)?.id;
    if (!iconId) continue;
    const c = idToCollection.get(iconId);
    if (c) collections.add(c);
  }

  return collections;
};

// Filter collections down to loadable icon packs that aren't already
// loaded/loading.
const resolvePacksToLoad = (
  collections: Set<string>,
  packInfo: Record<IconPackName, IconPackInfo>
): IconPackName[] => {
  const packsToLoad: IconPackName[] = [];
  collections.forEach((collection) => {
    if (collection === 'isoflow' || collection === 'imported') return;
    const packName = collection as IconPackName;
    if (!ALL_ICON_PACK_NAMES.includes(packName)) return;
    if (packInfo[packName].loaded || packInfo[packName].loading) return;
    packsToLoad.push(packName);
  });
  return packsToLoad;
};

// React hook for managing icon packs
export const useIconPackManager = (coreIcons: Icon[]) => {
  const [lazyLoadingEnabled, setLazyLoadingEnabled] = useState<boolean>(() =>
    loadLazyLoadingPreference()
  );

  const [enabledPacks, setEnabledPacks] = useState<IconPackName[]>(() =>
    loadEnabledPacks()
  );

  const [packInfo, setPackInfo] = useState<Record<IconPackName, IconPackInfo>>(
    () => {
      const info: Record<string, IconPackInfo> = {};
      const packNames: IconPackName[] = ['aws', 'gcp', 'azure', 'kubernetes', 'material'];
      packNames.forEach((name) => {
        info[name] = {
          name,
          displayName: PACK_METADATA[name],
          loaded: false,
          loading: false,
          error: null,
          iconCount: 0
        };
      });
      return info as Record<IconPackName, IconPackInfo>;
    }
  );

  const [loadedIcons, setLoadedIcons] = useState<Icon[]>(coreIcons);
  const [loadedPackData, setLoadedPackData] = useState<
    Record<IconPackName, ProcessedCollection>
  >({} as Record<IconPackName, ProcessedCollection>);

  // Load a specific pack
  const loadPack = useCallback(
    async (packName: IconPackName) => {
      // Already loaded?
      if (packInfo[packName].loaded || packInfo[packName].loading) {
        return;
      }

      // Set loading state
      setPackInfo((prev) => ({
        ...prev,
        [packName]: { ...prev[packName], loading: true, error: null }
      }));

      try {
        const pack = await loadIconPack(packName);
        // F5/ICON-04: an unknown pack name resolves to null rather than
        // throwing. Treat it as "nothing to add" — the pack simply is not one
        // this build ships.
        if (!pack) {
          setPackInfo((prev) => ({
            ...prev,
            [packName]: { ...prev[packName], loading: false }
          }));
          return;
        }
        const flattenedIcons = flattenCollections([pack]);

        // Store the loaded pack data
        setLoadedPackData((prev) => ({
          ...prev,
          [packName]: pack
        }));

        // Update pack info
        setPackInfo((prev) => ({
          ...prev,
          [packName]: {
            ...prev[packName],
            loaded: true,
            loading: false,
            iconCount: flattenedIcons.length,
            error: null
          }
        }));

        // Add icons to the loaded icons array
        setLoadedIcons((prev) => [...prev, ...flattenedIcons]);

        return flattenedIcons;
      } catch (error) {
        console.error(`Failed to load ${packName} icon pack:`, error);
        setPackInfo((prev) => ({
          ...prev,
          [packName]: {
            ...prev[packName],
            loading: false,
            error:
              error instanceof Error ? error.message : 'Failed to load pack'
          }
        }));
        throw error;
      }
    },
    [packInfo]
  );

  // Enable/disable a pack
  const togglePack = useCallback(
    async (packName: IconPackName, enabled: boolean) => {
      if (enabled) {
        // Add to enabled packs
        const newEnabledPacks = [...enabledPacks, packName];
        setEnabledPacks(newEnabledPacks);
        saveEnabledPacks(newEnabledPacks);

        // Load the pack
        await loadPack(packName);
      } else {
        // Remove from enabled packs
        const newEnabledPacks = enabledPacks.filter((p) => p !== packName);
        setEnabledPacks(newEnabledPacks);
        saveEnabledPacks(newEnabledPacks);

        // Remove icons from loaded icons
        // We need to rebuild the icons array from core + enabled packs
        const newIcons = [coreIcons];
        for (const pack of newEnabledPacks) {
          if (loadedPackData[pack]) {
            newIcons.push(flattenCollections([loadedPackData[pack]]));
          }
        }
        setLoadedIcons(newIcons.flat());
      }
    },
    [enabledPacks, loadPack, coreIcons, loadedPackData]
  );

  // Toggle lazy loading
  const toggleLazyLoading = useCallback((enabled: boolean) => {
    setLazyLoadingEnabled(enabled);
    saveLazyLoadingPreference(enabled);
  }, []);

  // Load all packs (for when lazy loading is disabled)
  const loadAllPacks = useCallback(async () => {
    const allPacks: IconPackName[] = ['aws', 'gcp', 'azure', 'kubernetes', 'material'];
    for (const pack of allPacks) {
      if (!packInfo[pack].loaded && !packInfo[pack].loading) {
        await loadPack(pack);
      }
    }
  }, [packInfo, loadPack]);

  // Auto-detect required packs from diagram data.
  //
  // Two signals are honoured (in order of preference):
  //   1. `data.requiredPacks` — written by the lean-save path; the canonical
  //      record of which packs the diagram actually uses.
  //   2. items × icons cross-reference — handles non-lean payloads (e.g. a
  //      single-JSON import that retains pack icons inline) where each
  //      `item.icon` is just an id string and the collection is only
  //      recoverable via the icons array on the same payload.
  //
  // Note: `item.icon` is a string id, not an object — earlier code that read
  // `item.icon?.collection` always evaluated to undefined.
  const loadPacksForDiagram = useCallback(
    async (diagramData: unknown) => {
      if (!diagramData || typeof diagramData !== 'object') return;
      const blob = diagramData as {
        requiredPacks?: unknown;
        items?: unknown;
        icons?: unknown;
      };

      const collections = collectRequiredCollections(blob);
      const packsToLoad = resolvePacksToLoad(collections, packInfo);

      for (const pack of packsToLoad) {
        await loadPack(pack);
        if (!enabledPacks.includes(pack)) {
          const newEnabledPacks = [...enabledPacks, pack];
          setEnabledPacks(newEnabledPacks);
          saveEnabledPacks(newEnabledPacks);
        }
      }
    },
    [packInfo, enabledPacks, loadPack]
  );

  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize: when lazy loading is disabled, eagerly load all packs.
  // When lazy loading is enabled, skip startup loading entirely — packs are
  // fetched on-demand via loadPacksForDiagram() or explicit user toggles in
  // the Elements panel "More icons" section.
  useEffect(() => {
    const initialize = async () => {
      if (!lazyLoadingEnabled) {
        await loadAllPacks();
      }
      // lazyLoadingEnabled=true → nothing to load upfront; isInitialized immediately
      setIsInitialized(true);
    };
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: eager-load packs once at startup
  }, []);

  return {
    isInitialized,
    lazyLoadingEnabled,
    enabledPacks,
    packInfo,
    loadedIcons,
    togglePack,
    toggleLazyLoading,
    loadAllPacks,
    loadPacksForDiagram,
    isPackEnabled: (packName: IconPackName) => enabledPacks.includes(packName)
  };
};
