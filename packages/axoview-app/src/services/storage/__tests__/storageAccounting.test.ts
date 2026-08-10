/**
 * Promoted from the A5 explore lane (ADR 0047 flip rule) — A5/CHR-01, CHR-02,
 * CHR-03, CHR-04.
 *
 * All four came from one mistake: the Storage Manager predates the places model
 * and reasoned about ONE store with ONE prefix, while the app uses two of each
 * and they differ by a single character.
 *
 *   sessionStorage + `axoview_` (UNDERSCORE) → the session place's DIAGRAMS
 *   localStorage   + `axoview-` (HYPHEN)     → CONFIGURATION (folders, manifest,
 *                                              profile hint, Drive root, packs)
 *
 * Taking the second for the first gave: a gauge labelling preference bytes
 * "Axoview diagrams" while measuring none of the diagrams (CHR-02), a
 * "Clear All Diagrams" that deleted the configuration and no diagram (CHR-01)
 * and left every diagram pointing at a folder that no longer existed (CHR-03),
 * and an "Export All Diagrams" backup reading a pre-places-model key (CHR-04).
 *
 * The bug was never in the arithmetic — it was in which keys were counted — so
 * these tests are about CLASSIFICATION.
 */
import {
  measureStorage,
  clearableDiagramKeys,
  isSessionDiagramKey,
  isConfigKey,
  estimateQuota,
  FALLBACK_QUOTA_BYTES,
  type StorageLike
} from '../storageAccounting';

/** A `StorageLike` over a plain object, in insertion order. */
const store = (entries: Record<string, string>): StorageLike => {
  const keys = Object.keys(entries);
  return {
    get length() {
      return keys.length;
    },
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => (k in entries ? entries[k] : null),
    removeItem: (k: string) => {
      const i = keys.indexOf(k);
      if (i >= 0) keys.splice(i, 1);
      delete entries[k];
    }
  };
};

const bytes = (n: number) => 'x'.repeat(n);

describe('key classification — the one-character difference', () => {
  it('session diagram keys are the UNDERSCORE set', () => {
    expect(isSessionDiagramKey('axoview_diagrams')).toBe(true);
    expect(isSessionDiagramKey('axoview_diagram_abc123')).toBe(true);
  });

  it('configuration keys are the HYPHEN set', () => {
    for (const key of [
      'axoview-folders',
      'axoview-tree-manifest',
      'axoview-google-profile',
      'axoview-drive-root',
      'axoview-enabled-icon-packs',
      'axoview-last-opened'
    ]) {
      expect(isConfigKey(key)).toBe(true);
      // …and CRUCIALLY, not diagrams. This single assertion is the bug.
      expect(isSessionDiagramKey(key)).toBe(false);
    }
  });

  it('CONTROL: an unrelated key is neither', () => {
    expect(isSessionDiagramKey('some-other-app')).toBe(false);
    expect(isConfigKey('some-other-app')).toBe(false);
  });

  it('the legacy `axoview-diagrams` key is CONFIG-shaped, not a diagram', () => {
    // The trap CHR-04 fell into: it LOOKS like the diagram index and is spelled
    // with the configuration prefix. It is the pre-places-model store.
    expect(isSessionDiagramKey('axoview-diagrams')).toBe(false);
    expect(isConfigKey('axoview-diagrams')).toBe(true);
  });
});

describe('measureStorage — CHR-02', () => {
  it('counts session diagrams from sessionStorage, not config from localStorage', () => {
    const local = store({
      'axoview-folders': bytes(400),
      'axoview-drive-root': bytes(12)
    });
    const session = store({
      axoview_diagrams: bytes(100),
      axoview_diagram_d1: bytes(50_000)
    });

    const out = measureStorage(local, session);
    // The headline number the user acts on.
    expect(out.diagrams).toBe(50_100);
    expect(out.config).toBe(412);
    expect(out.total).toBe(50_512);
  });

  it('the old rule would have reported the config bytes as diagrams', () => {
    // The regression stated as the arithmetic it replaces: 412 bytes labelled
    // "Axoview diagrams" over a workspace holding 50 KB of them.
    const local = store({ 'axoview-folders': bytes(400), 'axoview-drive-root': bytes(12) });
    const session = store({ axoview_diagram_d1: bytes(50_000) });
    const out = measureStorage(local, session);
    expect(out.diagrams).not.toBe(412);
  });

  it('non-Axoview keys in either store are "other"', () => {
    const out = measureStorage(
      store({ 'some-other-app': bytes(10) }),
      store({ 'another-thing': bytes(5) })
    );
    expect(out.other).toBe(15);
    expect(out.diagrams).toBe(0);
    expect(out.config).toBe(0);
  });

  it('both stores are scanned with the SAME classifier', () => {
    // A key in the "wrong" store is exactly the confusion this module exists to
    // stop; hard-coding which store to look in would rebuild it.
    const out = measureStorage(
      store({ axoview_diagram_stray: bytes(7) }),
      store({ 'axoview-folders': bytes(3) })
    );
    expect(out.diagrams).toBe(7);
    expect(out.config).toBe(3);
  });

  it('empty stores measure zero rather than throwing', () => {
    expect(measureStorage(store({}), store({}))).toEqual({
      diagrams: 0,
      config: 0,
      other: 0,
      total: 0
    });
  });
});

describe('clearableDiagramKeys — CHR-01 / CHR-03', () => {
  it('returns the diagram keys', () => {
    const session = store({
      axoview_diagrams: '[]',
      axoview_diagram_d1: '{}',
      'unrelated-key': 'x'
    });
    expect(clearableDiagramKeys(session).sort()).toEqual([
      'axoview_diagram_d1',
      'axoview_diagrams'
    ]);
  });

  it('NEVER returns a configuration key — including the folders', () => {
    // The CHR-03 half: the old sweep deleted the folders while every diagram
    // kept its `folderId`, so the work rendered nowhere and the trash could not
    // hold it either. Configuration is not clearable, so that cannot recur.
    const local = store({
      'axoview-folders': '[]',
      'axoview-tree-manifest': '{}',
      'axoview-google-profile': '{}',
      'axoview-enabled-icon-packs': '[]'
    });
    expect(clearableDiagramKeys(local)).toEqual([]);
  });
});

describe('estimateQuota', () => {
  const withNavigator = (storage: unknown) => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
    Object.defineProperty(navigator, 'storage', {
      value: storage,
      configurable: true
    });
    return () => {
      if (original) Object.defineProperty(navigator, 'storage', original);
      else delete (navigator as unknown as Record<string, unknown>).storage;
    };
  };

  it("prefers the browser's own estimate", async () => {
    const restore = withNavigator({ estimate: async () => ({ quota: 12345 }) });
    try {
      expect(await estimateQuota()).toEqual({ quota: 12345, estimated: true });
    } finally {
      restore();
    }
  });

  it('falls back to the constant, FLAGGED as an assumption', async () => {
    // The flag is what lets the UI say "~5 MB" instead of presenting a guess as
    // a measurement — and the guess was about one store while the quota error
    // that opens the dialog can come from either.
    const restore = withNavigator(undefined);
    try {
      expect(await estimateQuota()).toEqual({
        quota: FALLBACK_QUOTA_BYTES,
        estimated: false
      });
    } finally {
      restore();
    }
  });

  it('a rejecting or permission-gated estimate falls back rather than throwing', async () => {
    const restore = withNavigator({
      estimate: async () => {
        throw new Error('denied');
      }
    });
    try {
      expect((await estimateQuota()).estimated).toBe(false);
    } finally {
      restore();
    }
  });
});
