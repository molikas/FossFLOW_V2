/**
 * CLASS GATE — reverse-tabnabbing on JSX-built link surfaces, app half
 * (ADR 0047 §3). The reasoning and the campaign finding are documented on the
 * lib half, `axoview-lib/src/__tests__/externalLinks.contract.test.ts`; this is
 * the same scan over the app package, which owns its own link surfaces
 * (`AppToolbar`'s brand link, `NotFound`, `ErrorBoundary`'s issue link,
 * `AuthControl`'s "open Drive folder").
 *
 * Two gates rather than one shared helper because each package's suite has to
 * be able to fail on its OWN files — a lib-only scan would go green while an app
 * surface regressed.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['__tests__', '__explore__', 'node_modules']);

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
  context: string;
}

function findSites(pattern: RegExp, window: number): Site[] {
  const sites: Site[] = [];
  for (const file of sourceFiles(SRC)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, i) => {
      if (!pattern.test(text)) return;
      sites.push({
        file: path.relative(SRC, file).replace(/\\/g, '/'),
        line: i + 1,
        context: lines.slice(Math.max(0, i - window), i + window + 1).join('\n')
      });
    });
  }
  return sites;
}

describe('class gate — app JSX anchors that open a new tab carry rel=noopener', () => {
  const anchors = findSites(/target=["']_blank["']/, 8);

  it('finds the link surfaces to check (the gate can go red)', () => {
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('every one of them names noopener', () => {
    const offenders = anchors.filter((site) => !/noopener/.test(site.context));
    expect(
      offenders.length === 0
        ? null
        : `target="_blank" with no rel=noopener: ${offenders
            .map((o) => `${o.file}:${o.line}`)
            .join(', ')}. An opened tab can otherwise rewrite this one through ` +
            'window.opener.'
    ).toBeNull();
  });
});

describe('class gate — app window.open calls pass noopener', () => {
  // `window.open` does NOT get the implicit noopener a bare `target="_blank"`
  // anchor gets in modern browsers, so the feature string is the only
  // protection here.
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
