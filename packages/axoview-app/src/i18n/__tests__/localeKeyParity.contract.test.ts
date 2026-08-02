/**
 * CLASS GATE — locale key-set parity (A5/CHR-09, CHR-10).
 *
 * Promoted from the A5 explore lane. The finding was not "some strings are
 * missing" — that debt is filed and deferred — but that **no locale is
 * complete**, including the nine `known_issues.md` documented as fully covered
 * and told users to switch to. Nothing kept the catalogues in step: they are
 * hand-maintained JSON copied verbatim into the bundle, and no lint, test or CI
 * step compared key sets, so every feature that added a string to `en-US`
 * widened the gap silently and invisibly.
 *
 * This gate makes the gap a NUMBER rather than a discovery. It deliberately
 * does not demand parity today (that would be a red suite, not a gate): it
 * pins the current shortfall per locale, so
 *
 *   - a NEW `en-US` string added without translations fails the build, and
 *   - closing translation debt requires lowering the number here, which is the
 *     visible record the entry asks for.
 *
 * Both directions, because drift runs both ways (CHR-10): a catalogue can also
 * carry keys `en-US` no longer has — renames and deletions the translations
 * never followed. i18next resolves per key, so neither direction is ever
 * reported at runtime.
 */
import * as fs from 'fs';
import * as path from 'path';

const I18N_DIR = path.resolve(__dirname, '..');

/** Flatten to dotted leaf paths — nesting differences are key differences. */
const leafKeys = (value: unknown, prefix = ''): string[] => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  const out: string[] = [];
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out.push(
      ...leafKeys(
        (value as Record<string, unknown>)[key],
        prefix ? `${prefix}.${key}` : key
      )
    );
  }
  return out;
};

const readCatalog = (locale: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${locale}.json`), 'utf8'));

const localeFiles = fs
  .readdirSync(I18N_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((l) => l !== 'en-US')
  .sort();

// Plain-object index and `Array.prototype` calls throughout, NOT `Set` +
// spread. This package targets es5 without downlevelIteration, so `[...someSet]`
// silently evaluates to `[]` — the trap the A4 harness header records. The
// "can this comparison detect a difference at all" CONTROL below caught it on
// the first run of this gate: every locale reported 0 missing keys, which read
// as twelve perfectly-translated catalogues.
const index = (keys: string[]): { [k: string]: true } => {
  const out: { [k: string]: true } = {};
  for (let i = 0; i < keys.length; i++) out[keys[i]] = true;
  return out;
};

const EN_KEYS = leafKeys(readCatalog('en-US'));
const EN = index(EN_KEYS);

/**
 * Current shortfall per locale — MISSING (in en-US, not here) and EXTRA (here,
 * not in en-US). These are budgets, not targets: they may go DOWN freely, and
 * going up fails.
 *
 * Baselined 2026-08-02. If a number here is wrong the gate tells you the actual
 * one — update it in the same commit that changes the catalogues, never
 * separately.
 */
const BUDGET: Record<string, { missing: number; extra: number }> = {
  'bn-BD': { missing: 34, extra: 1 },
  'de-DE': { missing: 65, extra: 1 },
  'es-ES': { missing: 34, extra: 1 },
  'fr-FR': { missing: 34, extra: 2 },
  'hi-IN': { missing: 34, extra: 1 },
  'id-ID': { missing: 66, extra: 1 },
  'it-IT': { missing: 34, extra: 1 },
  'pl-PL': { missing: 34, extra: 3 },
  'pt-BR': { missing: 34, extra: 2 },
  'ru-RU': { missing: 34, extra: 3 },
  'tr-TR': { missing: 34, extra: 1 },
  'zh-CN': { missing: 35, extra: 1 }
};

const diff = (locale: string) => {
  const localeKeys = leafKeys(readCatalog(locale));
  const have = index(localeKeys);
  return {
    missing: EN_KEYS.filter((k) => !have[k]),
    extra: localeKeys.filter((k) => !EN[k])
  };
};

describe('locale key-set parity — CONTROLs', () => {
  it('the sweep found the catalogues, and en-US has real content', () => {
    // Without this a path typo makes every budget assertion below vacuously
    // pass: zero locales compared, zero failures.
    expect(localeFiles.length).toBeGreaterThanOrEqual(12);
    expect(EN_KEYS.length).toBeGreaterThan(200);
  });

  it('every shipped locale has a budget entry, and vice versa', () => {
    // A new locale added without a budget would otherwise be exempt from the
    // gate entirely — the "silent widening" this exists to stop.
    expect(localeFiles).toEqual(Object.keys(BUDGET).sort());
  });

  it('the comparison can detect a difference at all', () => {
    // en-US against itself plus one planted key. If this yields no difference,
    // the comparison is inert and every real gap reads as zero — which is what
    // the first draft of this gate did, via the es5 `[...someSet]` trap noted
    // above. It reported twelve complete catalogues.
    const planted = EN_KEYS.concat(['planted.key.that.does.not.exist']);
    expect(planted.filter((k) => !EN[k])).toEqual([
      'planted.key.that.does.not.exist'
    ]);
    // …and the same comparison finds nothing when there is nothing to find.
    expect(EN_KEYS.filter((k) => !EN[k])).toEqual([]);
  });
});

describe('locale key-set parity — no silent widening', () => {
  it.each(localeFiles)('%s is not MISSING more keys than budgeted', (locale) => {
    const { missing } = diff(locale);
    if (missing.length > BUDGET[locale].missing) {
      throw new Error(
        `${locale} is missing ${missing.length} keys (budget ${BUDGET[locale].missing}). ` +
          `New: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}\n` +
          `Add the translations, or lower/raise the budget deliberately in this file.`
      );
    }
    // Going DOWN is the point — but the budget must follow, or the gate stops
    // protecting the ground that was won.
    expect(missing.length).toBe(BUDGET[locale].missing);
  });

  it.each(localeFiles)('%s has no more EXTRA keys than budgeted', (locale) => {
    // CHR-10: keys en-US no longer has. Dead weight in the bundle, and a signal
    // that a rename was never followed through.
    const { extra } = diff(locale);
    expect(extra.length).toBe(BUDGET[locale].extra);
  });
});
