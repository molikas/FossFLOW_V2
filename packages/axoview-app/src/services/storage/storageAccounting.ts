/**
 * A5/CHR-01 / CHR-02 / CHR-03 / CHR-04 — what is actually stored, and where.
 *
 * The Storage Manager predates the places model (2026-07-06) and was never
 * re-pointed, so it reasoned about one store with one prefix. The app uses
 * **two prefixes in two stores**, and the difference is a single character:
 *
 *   - `sessionStorage`, `axoview_` (UNDERSCORE) — the session place's DIAGRAMS:
 *     `axoview_diagrams` (the index) and `axoview_diagram_<id>` (the bodies).
 *   - `localStorage`, `axoview-` (HYPHEN) — folders, the tree manifest, the
 *     last-opened pointer, the Google profile hint, the Drive root cache, the
 *     enabled icon packs, the explorer's open/closed state. CONFIGURATION.
 *
 * Every symptom in that cluster follows from taking the hyphen set for the
 * diagram set: the gauge labelled preference bytes "Axoview diagrams" and
 * measured none of the diagrams (CHR-02), "Clear All Diagrams" deleted the
 * configuration and no diagram (CHR-01), leaving every diagram pointing at a
 * folder that no longer existed (CHR-03), and the "Export All Diagrams" backup
 * offered right beside it read a pre-places-model key that is normally absent
 * (CHR-04).
 *
 * These functions are pure over injected stores so the classification can be
 * pinned directly — the bug was never in the arithmetic, it was in which keys
 * were counted.
 */

/** The subset of the Storage API this module needs. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

/** Session place, `sessionStorage`. */
export const SESSION_DIAGRAMS_KEY = 'axoview_diagrams';
export const SESSION_DIAGRAM_PREFIX = 'axoview_diagram_';
/** Configuration, `localStorage`. Note the HYPHEN. */
export const CONFIG_KEY_PREFIX = 'axoview-';

/** Enumerate a store's keys without relying on `for…in` (which also walks the
 *  prototype's own members on some engines and is not guaranteed ordered). */
const keysOf = (store: StorageLike): string[] => {
  const out: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null) out.push(key);
  }
  return out;
};

const byteLength = (value: string): number => new Blob([value]).size;

export const isSessionDiagramKey = (key: string): boolean =>
  key === SESSION_DIAGRAMS_KEY || key.indexOf(SESSION_DIAGRAM_PREFIX) === 0;

export const isConfigKey = (key: string): boolean =>
  key.indexOf(CONFIG_KEY_PREFIX) === 0;

export interface StorageBreakdown {
  /** Bytes held by the session place's diagrams (`sessionStorage`). */
  diagrams: number;
  /** Bytes held by Axoview's configuration (`localStorage`). */
  config: number;
  /** Everything else in either store — not ours. */
  other: number;
  /** `diagrams + config + other`. */
  total: number;
}

/**
 * Measure both stores and bucket by the REAL key sets.
 *
 * The two stores are summed into one total deliberately: the quota error that
 * opens the Storage Manager can come from either, so a figure covering one of
 * them would be answering a question the user did not ask.
 */
export const measureStorage = (
  local: StorageLike,
  session: StorageLike
): StorageBreakdown => {
  let diagrams = 0;
  let config = 0;
  let other = 0;

  const add = (store: StorageLike) => {
    for (const key of keysOf(store)) {
      const value = store.getItem(key);
      if (value === null) continue;
      const size = byteLength(value);
      if (isSessionDiagramKey(key)) diagrams += size;
      else if (isConfigKey(key)) config += size;
      else other += size;
    }
  };

  // Both stores are scanned with the same classifier rather than one each: a
  // key in the "wrong" store is exactly the confusion this module exists to
  // stop, and hard-coding which store to look in would re-introduce it.
  add(local);
  add(session);

  return { diagrams, config, other, total: diagrams + config + other };
};

/**
 * The quota to show the percentage against.
 *
 * `navigator.storage.estimate()` is the browser's own answer and covers both
 * stores; the 5 MB constant it replaces was a guess about ONE of them, so the
 * bar could read comfortable while the store that actually threw was full.
 * Falls back to the guess where the API is absent, flagged so the UI can say
 * so rather than presenting an assumption as a measurement.
 */
export const FALLBACK_QUOTA_BYTES = 5 * 1024 * 1024;

export const estimateQuota = async (): Promise<{
  quota: number;
  estimated: boolean;
}> => {
  try {
    const nav = navigator as Navigator & {
      storage?: { estimate?: () => Promise<{ quota?: number }> };
    };
    const quota = (await nav.storage?.estimate?.())?.quota;
    if (typeof quota === 'number' && quota > 0) {
      return { quota, estimated: true };
    }
  } catch {
    // Permission-gated or unimplemented — fall through to the guess.
  }
  return { quota: FALLBACK_QUOTA_BYTES, estimated: false };
};

/**
 * The keys "Clear All Diagrams" may remove, given what it says on the tin.
 *
 * CONFIGURATION IS NEVER SWEPT. Deleting it freed no space (it is the small
 * half), broke silent Drive reconnect, reset the icon-pack preference, and —
 * the part that made this data loss rather than annoyance — removed the FOLDERS
 * while every diagram kept its `folderId`, so the diagrams rendered nowhere and
 * the trash could not hold them either (CHR-03 / A4/FEX-01).
 *
 * Note this returns only the RAW keys, for the case where no provider is
 * reachable. The caller should prefer deleting through the storage provider, so
 * the diagram index and the folder tree stay coherent with each other.
 */
export const clearableDiagramKeys = (session: StorageLike): string[] =>
  keysOf(session).filter(isSessionDiagramKey);
