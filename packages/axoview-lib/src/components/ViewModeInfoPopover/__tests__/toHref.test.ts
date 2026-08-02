/**
 * Promoted from the F2 explore lane (ADR 0047 flip rule) — VIEW-06.
 *
 * There were two URL normalisers for the same job, written at different times.
 * `normalizeWebLinkUrl` (used by the text-box link card and the strip) passes
 * `https?:` / `mailto:` / `tel:` / `#` through and prefixes everything else;
 * `toHref` (used to render an element's `headerLink` in the view-mode popover)
 * was an http(s)-only allowlist. Element `headerLink`s are stored RAW, so a
 * user's `mailto:ops@example.com` reached the popover verbatim and rendered as
 * `https://mailto:ops@example.com` — a dead URL.
 *
 * The entry asked for one normaliser plus "a test asserting the two agree on
 * the whole scheme matrix". That agreement is the point: a second
 * implementation is how this bug happened, and a table that only checked
 * `toHref`'s outputs would pass again the day someone reintroduces one.
 */
import { toHref } from '../ViewModeInfoPopover.helpers';
import { normalizeWebLinkUrl } from 'src/utils/quillLinkShortcut';

const SCHEME_MATRIX = [
  'https://example.com',
  'http://example.com',
  'HTTPS://EXAMPLE.COM',
  'mailto:ops@example.com',
  'MailTo:ops@example.com',
  'tel:+15551234567',
  '#section-2',
  'example.com',
  'example.com/path?q=1#frag',
  'www.example.com',
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  '  https://example.com  '
];

describe('toHref — one normaliser (VIEW-06)', () => {
  it.each(SCHEME_MATRIX)('agrees with normalizeWebLinkUrl on %j', (input) => {
    expect(toHref(input)).toBe(normalizeWebLinkUrl(input));
  });
});

describe('the cases the popover actually got wrong', () => {
  it('mailto: is passed through, not prefixed', () => {
    expect(toHref('mailto:ops@example.com')).toBe('mailto:ops@example.com');
  });

  it('tel: is passed through', () => {
    expect(toHref('tel:+15551234567')).toBe('tel:+15551234567');
  });

  it('a bare fragment is passed through', () => {
    expect(toHref('#section-2')).toBe('#section-2');
  });

  it('CONTROL: a schemeless host is still prefixed', () => {
    // The behaviour that was already right and must not regress — this is what
    // makes the popover work for the common case of a typed domain.
    expect(toHref('example.com')).toBe('https://example.com');
  });
});

describe('the allowlist is load-bearing, not incidental (XSS)', () => {
  // The prefixing is ALSO what neutralises a script payload. The tempting
  // "does it have a scheme?" simplification would have turned a cosmetic bug
  // fix into an XSS vector, so these assert the shape of the fix, not just its
  // output.
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)'
  ])('%j is defanged by prefixing, not passed through', (payload) => {
    const href = toHref(payload);
    expect(href.startsWith('https://')).toBe(true);
    expect(href).not.toBe(payload);
  });
});
