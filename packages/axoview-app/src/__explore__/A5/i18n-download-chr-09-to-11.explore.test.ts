/**
 * A5 — locale catalogues and the download idiom.
 *
 * CHR-09 (every non-English catalogue is incomplete, and the record says nine
 * of them are complete), CHR-10 (catalogues carry keys en-US no longer has),
 * CHR-11 (five hand-written copies of one download helper, all revoking the
 * object URL in the same tick as the click).
 *
 * Novelty note: known_issues carries two i18n entries — hardcoded strings on
 * the storage/auth surface, and "Partial-coverage i18n locales (de-DE +
 * id-ID)". Neither says anything about the other eleven locales; the second
 * names them as the fully-covered alternative. That claim is what CHR-09
 * falsifies, so this is not a re-file of a known entry.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { supportedLanguages } from '../../i18n';

// RIG (2026-08-02): resolved from THIS FILE, not from the runner's cwd — the
// same fault A4's `filetree-fex-01-to-07` carried. Repo-root-relative paths
// worked when the lane ran from the root and broke silently when it started
// running per-package, turning every source-scanning probe into an ENOENT that
// PRESENTS as a finding. See the wave-6 rig-traps appendix.
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const LOCALE_DIR = path.resolve(__dirname, '../../i18n');
const read = (p: string) =>
  readFileSync(path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p), 'utf8');
const catalogue = (lng: string): Record<string, unknown> =>
  JSON.parse(read(path.join(LOCALE_DIR, `${lng}.json`)));

/** Dotted leaf keys, so a missing sub-tree is reported per string. */
function leafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? leafKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}

const EN = 'en-US';
const others = () =>
  readdirSync(LOCALE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
    .filter((l) => l !== EN);

// ---------------------------------------------------------------------------
// CHR-09 — no catalogue is complete, and the record says nine are.
// ---------------------------------------------------------------------------
describe('CHR-09 — every shipped locale is missing strings, including the ones documented as complete', () => {
  // The second half of this characterization is now STALE, deliberately: the
  // `known_issues.md` entry no longer claims nine locales are fully covered —
  // that correction IS the CHR-09 fix, alongside the key-set gate. What
  // survives is the measurement itself, kept here as the standing record of the
  // deferred translation debt.
  it('characterization: not one of the twelve catalogues is complete', () => {
    const en = leafKeys(catalogue(EN));
    // PRECONDITION: the reference catalogue is the big one and the locale list
    // matches what the language switcher offers.
    expect(en.length).toBeGreaterThan(200);
    expect(others().sort()).toEqual(
      supportedLanguages.map((l) => l.value).filter((v) => v !== EN).sort()
    );

    const short = others().map((lng) => {
      const keys = new Set(leafKeys(catalogue(lng)));
      return { lng, missing: en.filter((k) => !keys.has(k)).length };
    });
    expect(short.every((s) => s.missing > 0)).toBe(true);
    expect(short.filter((s) => s.missing > 30)).toHaveLength(12);

    // The entry now names all twelve rather than nine as an escape route.
    const known = read('known_issues.md');
    expect(known).toContain('Partial-coverage i18n locales (ALL twelve)');
    expect(known).toContain('en-US is the only complete catalogue');
  });
  it.failing('CHR-09: the locales documented as fully covered are fully covered', () => {
    const en = leafKeys(catalogue(EN));
    expect(en.length).toBeGreaterThan(200); // precondition
    // Expected: either the catalogues are complete, or the record says which
    // are not — and a gate keeps the two in step (the campaign's own class:
    // an unenforced invariant drifts). Actual: every locale is short by 34–66
    // strings and nothing checks.
    const worst = Math.max(
      ...['zh-CN', 'es-ES', 'fr-FR'].map((lng) => {
        const keys = new Set(leafKeys(catalogue(lng)));
        return en.filter((k) => !keys.has(k)).length;
      })
    );
    expect(worst).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CHR-10 — drift in the other direction.
// ---------------------------------------------------------------------------
describe('CHR-10 — catalogues carry keys en-US does not', () => {
  it('characterization: every locale holds at least one key the reference dropped', () => {
    const en = new Set(leafKeys(catalogue(EN)));
    const extras = others().map((lng) => ({
      lng,
      extra: leafKeys(catalogue(lng)).filter((k) => !en.has(k))
    }));
    // PRECONDITION: the comparison is against a populated reference.
    expect(en.size).toBeGreaterThan(200);
    // A key present only in a translation is either a rename en-US made and
    // the locales did not, or a string deleted from en-US and left behind —
    // both invisible: i18next falls back per key, so nothing ever reports it.
    expect(extras.every((e) => e.extra.length > 0)).toBe(true);
  });

  it.failing('CHR-10: no locale carries keys the reference catalogue has dropped', () => {
    const en = new Set(leafKeys(catalogue(EN)));
    expect(en.size).toBeGreaterThan(200); // precondition
    const stray = others().flatMap((lng) =>
      leafKeys(catalogue(lng))
        .filter((k) => !en.has(k))
        .map((k) => `${lng}:${k}`)
    );
    // Expected: the reference is the superset by construction (a lint or a
    // generation step). Actual: drift accumulates in both directions.
    expect(stray).toEqual([]);
  });
});

// CHR-11 is FIXED (wave 4, 2026-08-02) and its probe is retired — one helper in
// `axoview-lib/src/utils/downloadFile.ts`, four copies deleted. Promoted to
// `axoview-lib/src/utils/__tests__/downloadFile.test.ts`.
//
// CHR-09/CHR-10 above stay as the standing marker for the DEFERRED translation
// debt. What wave 4 fixed is that the gap is now measured rather than
// discovered: `src/i18n/__tests__/localeKeyParity.contract.test.ts` pins the
// per-locale shortfall in both directions, so a new untranslated string fails
// the build. The `known_issues.md` entry that named nine locales as "fully
// covered" — none of which was — is corrected.
