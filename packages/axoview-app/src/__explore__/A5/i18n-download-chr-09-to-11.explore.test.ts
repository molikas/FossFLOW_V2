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

const LOCALE_DIR = 'packages/axoview-app/src/i18n';
const read = (p: string) => readFileSync(p, 'utf8');
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
  it('characterization: all twelve are short, and known_issues names nine of them as covered', () => {
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
    // Not one locale is complete.
    expect(short.every((s) => s.missing > 0)).toBe(true);
    expect(short.filter((s) => s.missing > 30)).toHaveLength(12);

    // And the entry that documents this debt names the other nine as the
    // fully-covered escape route — a claim no catalogue supports.
    const known = read('known_issues.md');
    expect(known).toContain('Partial-coverage i18n locales (de-DE + id-ID)');
    expect(known).toContain(
      'switch back to English (en-US) for a fully translated experience, or to one of the fully-covered locales'.replace(
        'switch',
        'Switch'
      )
    );
    for (const lng of ['zh-CN', 'es-ES', 'pt-BR', 'fr-FR', 'hi-IN', 'bn-BD', 'ru-RU', 'it-IT', 'tr-TR']) {
      expect(short.find((s) => s.lng === lng)!.missing).toBeGreaterThan(30);
    }
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

// ---------------------------------------------------------------------------
// CHR-11 — one download helper, five hand-written copies.
// ---------------------------------------------------------------------------
describe('CHR-11 — the download idiom is written five times and revokes too early', () => {
  const COPIES = [
    'packages/axoview-app/src/utils/downloadBlob.ts',
    'packages/axoview-app/src/LocalStorageInspector.tsx',
    'packages/axoview-app/src/providers/DiagramLifecycleProvider.tsx',
    'packages/axoview-app/src/components/DiagnosticsOverlay.tsx',
    'packages/axoview-lib/src/utils/exportOptions.ts'
  ];

  it('characterization: five copies, none attached to the document, all revoking synchronously', () => {
    for (const p of COPIES) {
      const src = read(p);
      // PRECONDITION: this file really does build a download anchor.
      expect(src).toContain('createObjectURL');
      expect(src).toMatch(/a\.download|\.download =/);
      // Every copy calls click() and revokes in the same synchronous block…
      expect(src).toMatch(/a\.click\(\);\s*(\/\/[^\n]*\n\s*)?URL\.revokeObjectURL/);
      // …and none appends the anchor to the document first.
      expect(src).not.toMatch(/appendChild\(a\)|body\.append\(a\)/);
    }
    // The app has a shared helper (`utils/downloadBlob`) with exactly one
    // caller, while three other app-side surfaces re-implement it inline and
    // the lib keeps its own — the ADR 0047 "app/lib dual implementations of one
    // contract" class, at five copies.
    expect(read('packages/axoview-app/src/components/fileExplorer/ExportProjectZipDialog.tsx')).toContain(
      'downloadBlob(blob, filename)'
    );
    const reusers = COPIES.filter(
      (p) => p !== 'packages/axoview-app/src/utils/downloadBlob.ts' && read(p).includes('downloadBlob')
    );
    expect(reusers).toEqual([]);
  });

  it.failing('CHR-11: one implementation, revoked after the download can start', () => {
    const impls = COPIES.filter((p) => read(p).includes('createObjectURL'));
    expect(impls.length).toBeGreaterThan(0); // precondition
    // Expected: a single helper (the app one delegating to the lib's, or vice
    // versa) that appends the anchor and revokes on a later tick — the
    // documented-safe shape. Actual: five copies, each revoking the URL in the
    // same tick as the click, which browsers are allowed to treat as a
    // cancelled download.
    expect(impls).toHaveLength(1);
  });
});
