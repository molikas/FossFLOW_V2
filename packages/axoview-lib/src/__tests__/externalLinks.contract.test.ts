/**
 * CLASS GATE — reverse-tabnabbing on JSX-built link surfaces (ADR 0047 §3).
 *
 * ADR 0029's guarantee is that user-authored HTML is sanitized before the single
 * `dangerouslySetInnerHTML` sink, and that the sanitizer forces
 * `rel="noopener noreferrer"` on every anchor with an href. The 2026-07 campaign
 * recorded the gap that guarantee leaves (F1's invariant list):
 *
 *   > The rel-forcing hook lives INSIDE `sanitizeHtml`. Link surfaces built
 *   > directly in React — the view-mode popover's headerLink, connector-label
 *   > link chips, TextBoxLinkCard's "open in new tab" — get `target=_blank` from
 *   > their own JSX; any of them omitting `rel=noopener` reintroduces
 *   > reverse-tabnabbing on user-supplied URLs, invisible to the sanitizer tests
 *   > which only cover the HTML path.
 *
 * Every such surface is compliant today — that was verified when this gate
 * landed, and the finding was a HOLE IN THE COVERAGE rather than a live defect.
 * So this pins the property rather than fixing anything: the next JSX anchor, or
 * the next `window.open`, cannot omit it silently. The sibling scan for the
 * app package is `axoview-app/src/__tests__/externalLinks.contract.test.ts`.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const SKIP_DIRS = new Set([
  '__tests__',
  '__explore__',
  '__perf_refactor_regression__',
  'node_modules'
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) sourceFiles(path.join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

interface Site {
  file: string;
  line: number;
  text: string;
}

/**
 * Collect every occurrence of `pattern`, with the window of lines a reviewer
 * would read to judge it. JSX attributes and call arguments both wrap freely, so
 * a line-window is the honest unit — narrower would produce false alarms, wider
 * would let a neighbouring element's `rel` vouch for this one.
 */
function findSites(pattern: RegExp, window: number): Array<Site & { context: string }> {
  const sites: Array<Site & { context: string }> = [];
  for (const file of sourceFiles(SRC)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, i) => {
      if (!pattern.test(text)) return;
      const context = lines
        .slice(Math.max(0, i - window), i + window + 1)
        .join('\n');
      sites.push({
        file: path.relative(SRC, file).replace(/\\/g, '/'),
        line: i + 1,
        text: text.trim(),
        context
      });
    });
  }
  return sites;
}

describe('class gate — every JSX anchor that opens a new tab carries rel=noopener', () => {
  const anchors = findSites(/target=["']_blank["']/, 8);

  it('finds the link surfaces to check (the gate can go red)', () => {
    // A scan that finds nothing is a green gate that cannot fail — the shape the
    // 2026-07-29 audit flagged for the madge and bundle-size gates.
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('every one of them sets rel', () => {
    const offenders = anchors
      .filter((site) => !/rel=/.test(site.context))
      // sanitizeHtml.ts documents the rule in prose; it is not a link surface.
      .filter((site) => !site.file.endsWith('utils/sanitizeHtml.ts'));
    expect(
      offenders.length === 0
        ? null
        : `target="_blank" with no rel: ${offenders
            .map((o) => `${o.file}:${o.line}`)
            .join(', ')}. Add rel="noopener noreferrer" — an opened tab can ` +
            'otherwise rewrite this one through window.opener.'
    ).toBeNull();
  });

  it('every one of them names noopener specifically', () => {
    const offenders = anchors
      .filter((site) => /rel=/.test(site.context))
      .filter((site) => !/noopener/.test(site.context));
    expect(offenders.map((o) => `${o.file}:${o.line}`)).toEqual([]);
  });
});

describe('class gate — every window.open passes noopener', () => {
  // `window.open` does NOT get the implicit noopener that a bare
  // `target="_blank"` anchor gets in modern browsers, so the feature string is
  // the only protection here.
  const opens = findSites(/window\.open\(/, 4);

  it('finds the call sites to check (the gate can go red)', () => {
    expect(opens.length).toBeGreaterThan(0);
  });

  it('every one of them passes noopener', () => {
    const offenders = opens.filter((site) => !/noopener/.test(site.context));
    expect(
      offenders.length === 0
        ? null
        : `window.open without noopener: ${offenders
            .map((o) => `${o.file}:${o.line}`)
            .join(', ')}`
    ).toBeNull();
  });
});
