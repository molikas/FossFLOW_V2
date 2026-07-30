/**
 * Default page naming.
 *
 * E3/SCN-13: new pages were named from `views.length`, so deleting a page in the
 * middle made the next "New page" reproduce a name that is already on screen —
 * two tabs reading "Page 3". Derive the number from the highest existing suffix
 * instead, so the sequence only ever moves forward.
 *
 * The template is localised (`t('pageName')`, e.g. `Page {count}`), so the scan
 * is built from the template itself rather than from a hardcoded `/^Page (\d+)$/`.
 * Imported deeply, not through `src/utils` — see the note in schemas/validation.ts.
 */

const COUNT_TOKEN = '{count}';

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param template  the localised name template, containing `{count}`
 * @param existingNames  every page name currently in the model
 */
export const nextPageName = (
  template: string,
  existingNames: (string | undefined)[]
): string => {
  if (!template.includes(COUNT_TOKEN)) {
    // A locale that dropped the token cannot carry a number; nothing to derive.
    return template;
  }

  const pattern = new RegExp(
    `^${escapeRegExp(template).replace(escapeRegExp(COUNT_TOKEN), '(\\d+)')}$`
  );

  const highest = existingNames.reduce<number>((max, name) => {
    const match = name ? pattern.exec(name.trim()) : null;
    if (!match) return max;
    const n = Number(match[1]);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  // `highest` is 0 when no page carries the default shape, so a model whose
  // pages are all user-named still starts at 1 — but never below the count of
  // pages that exist, so the first suggestion on a 3-page diagram is "Page 4".
  return template.replace(
    COUNT_TOKEN,
    String(Math.max(highest, existingNames.length) + 1)
  );
};
