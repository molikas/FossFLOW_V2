/**
 * F2 / VIEW-06 — the two URL normalisers.
 *
 * The app has two, written for the same job at different times:
 *   - `normalizeWebLinkUrl` (utils/quillLinkShortcut.ts) — used by the text-box
 *     link card and the strip's Link field. Explicitly passes through
 *     `https?:` / `mailto:` / `tel:` / `#`.
 *   - `toHref` (ViewModeInfoPopover.helpers.ts) — used by the ADR 0012 popover
 *     to render an element's `headerLink`. Passes through `https?://` only.
 *
 * Element-level `headerLink`s are written RAW by the strip ("element
 * headerLinks keep their raw semantics" — TopBarStyleControls.onLinkChange), so
 * whatever the user types is what the popover has to render.
 */
import { toHref } from 'src/components/ViewModeInfoPopover/ViewModeInfoPopover.helpers';
import { normalizeWebLinkUrl } from 'src/utils/quillLinkShortcut';

describe('VIEW-06 — toHref vs normalizeWebLinkUrl', () => {
  it('PRECONDITION: both agree on the cases the popover was written for', () => {
    expect(toHref('https://example.com')).toBe('https://example.com');
    expect(normalizeWebLinkUrl('https://example.com')).toBe('https://example.com');
    expect(toHref('example.com')).toBe('https://example.com');
    expect(normalizeWebLinkUrl('example.com')).toBe('https://example.com');
  });

  it('PRECONDITION: the sibling normaliser deliberately passes mailto:/tel:/# through', () => {
    expect(normalizeWebLinkUrl('mailto:ops@example.com')).toBe(
      'mailto:ops@example.com'
    );
    expect(normalizeWebLinkUrl('tel:+15551234')).toBe('tel:+15551234');
    expect(normalizeWebLinkUrl('#diagram:abc')).toBe('#diagram:abc');
  });

  it('VIEW-06: toHref turns each of them into an unusable https URL', () => {
    expect(toHref('mailto:ops@example.com')).toBe('https://mailto:ops@example.com');
    expect(toHref('tel:+15551234')).toBe('https://tel:+15551234');
    expect(toHref('#diagram:abc')).toBe('https://#diagram:abc');
  });

  it('CHARACTERIZATION: the prefixing DOES neutralise a javascript: payload — that part is a feature, not an accident to preserve', () => {
    // eslint-disable-next-line no-script-url
    expect(toHref('javascript:alert(1)')).toBe('https://javascript:alert(1)');
    // …and it is what any fix must keep: an allowlist, never a bare
    // "does it contain a colon" check.
    // eslint-disable-next-line no-script-url
    expect(normalizeWebLinkUrl('javascript:alert(1)')).toBe(
      // The sibling prefixes it too — neither surface can produce a live
      // javascript: href.
      'https://javascript:alert(1)'
    );
  });

  it('CHARACTERIZATION: a protocol-relative URL is also mangled', () => {
    expect(toHref('//example.com/x')).toBe('https:////example.com/x');
  });
});
