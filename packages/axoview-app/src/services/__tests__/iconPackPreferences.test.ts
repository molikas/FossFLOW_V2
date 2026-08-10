/**
 * Promoted from the F5 explore lane (ADR 0047 flip rule) — ICON-04 and ICON-05.
 *
 * Both are the same four accessors read the wrong way. ICON-04 guarded the
 * PARSE and not the SHAPE (`JSON.parse(stored) as IconPackName[]` — an
 * assertion is not a check), so a corrupt preference reached `loadIconPack`'s
 * `default:` throw and bricked icon loading on every boot until the key was
 * cleared by hand. ICON-05 did not guard the ACCESS, so a browser that throws
 * on `localStorage` (Safari private browsing, an iframe with third-party
 * storage blocked) took the pack manager down at mount.
 *
 * The lib's `config/persistedSettings.ts` had wrapped every access since it was
 * written. The lesson had been learned on one side of the package boundary and
 * not carried across — the same shape as this wave's lean-save duplication.
 */
import {
  loadEnabledPacks,
  saveEnabledPacks,
  loadLazyLoadingPreference,
  saveLazyLoadingPreference,
  loadIconPack,
  ALL_ICON_PACK_NAMES
} from '../iconPackManager';

const KEY = 'axoview-enabled-icon-packs';
const LAZY_KEY = 'axoview-lazy-loading-enabled';

const withStorage = (impl: Partial<Storage>) => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: impl
  });
  return () => {
    if (original) Object.defineProperty(window, 'localStorage', original);
  };
};

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* a throwing stub may still be installed */
  }
});

describe('ICON-04 — a corrupt pack preference falls back instead of breaking', () => {
  it('CONTROL: a well-formed preference is honoured verbatim', () => {
    localStorage.setItem(KEY, JSON.stringify(['aws', 'gcp']));
    expect(loadEnabledPacks()).toEqual(['aws', 'gcp']);
  });

  it('a bare JSON string falls back to the default set', () => {
    // `'"aws"'` parses to the STRING 'aws', which the old assertion returned
    // as if it were an array.
    localStorage.setItem(KEY, '"aws"');
    expect(loadEnabledPacks()).toEqual(ALL_ICON_PACK_NAMES);
  });

  it('JSON null falls back', () => {
    localStorage.setItem(KEY, 'null');
    expect(loadEnabledPacks()).toEqual(ALL_ICON_PACK_NAMES);
  });

  it('an object falls back', () => {
    localStorage.setItem(KEY, '{"aws":true}');
    expect(loadEnabledPacks()).toEqual(ALL_ICON_PACK_NAMES);
  });

  it('unparseable JSON falls back', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadEnabledPacks()).toEqual(ALL_ICON_PACK_NAMES);
  });

  it('a list with one bad name keeps the GOOD ones', () => {
    // Deliberately not all-or-nothing: one bad entry should cost the user that
    // one pack, not every pack they had enabled.
    localStorage.setItem(KEY, JSON.stringify(['aws', 'AWS', 'not-a-pack']));
    expect(loadEnabledPacks()).toEqual(['aws']);
  });

  it('a list with NO good names falls back rather than disabling everything', () => {
    localStorage.setItem(KEY, JSON.stringify(['not-a-pack', 'AWS']));
    expect(loadEnabledPacks()).toEqual(ALL_ICON_PACK_NAMES);
  });

  it('an empty list falls back — it tells us nothing usable', () => {
    localStorage.setItem(KEY, '[]');
    expect(loadEnabledPacks()).toEqual(ALL_ICON_PACK_NAMES);
  });

  it('loadIconPack SKIPS an unknown name rather than throwing', async () => {
    // Reachable from a diagram's `requiredPacks`, which is untrusted file
    // content — a diagram must never be able to break icon loading.
    await expect(
      loadIconPack('not-a-pack' as never)
    ).resolves.toBeNull();
  });
});

describe('ICON-05 — a hostile localStorage does not crash the pack manager', () => {
  it('a THROWING getItem falls back instead of propagating', () => {
    const restore = withStorage({
      getItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
      setItem: () => {},
      clear: () => {}
    });
    try {
      expect(() => loadEnabledPacks()).not.toThrow();
      expect(loadEnabledPacks()).toEqual(ALL_ICON_PACK_NAMES);
      expect(() => loadLazyLoadingPreference()).not.toThrow();
      expect(loadLazyLoadingPreference()).toBe(true);
    } finally {
      restore();
    }
  });

  it('a THROWING setItem does not lose the session', () => {
    const restore = withStorage({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      },
      clear: () => {}
    });
    try {
      expect(() => saveEnabledPacks(['aws'])).not.toThrow();
      expect(() => saveLazyLoadingPreference(false)).not.toThrow();
    } finally {
      restore();
    }
  });

  it('CONTROL: the throwing stub really is installed', () => {
    const restore = withStorage({
      getItem: () => {
        throw new Error('boom');
      },
      setItem: () => {},
      clear: () => {}
    });
    try {
      // If the stub were not in place, this would return null rather than
      // throwing — and every assertion above would pass for the wrong reason.
      expect(() => window.localStorage.getItem(LAZY_KEY)).toThrow('boom');
    } finally {
      restore();
    }
  });
});
