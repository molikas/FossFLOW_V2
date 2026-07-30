/**
 * F1 / TXT-09, TXT-10 — project-ZIP id rewriting vs the text surfaces that
 * grew cross-diagram references after ADR 0001 was written.
 *
 * `rewriteIds` → `rewriteRefsInModel` is the whole rewrite: a deep object walk
 * that rewrites exactly one key, `link`. Everything else is copied verbatim.
 * That is correct for the ADR's original ref sites, and the probe below asks
 * whether it is still complete now that a text box's Quill content can carry
 * `#diagram:<id>` hrefs (ADR 0034 addendum 2026-07-04, TextBoxLinkCard).
 */
import { rewriteIds, ParsedProject } from '../../services/project/projectZip';

const OLD_A = 'diagram_old_a';
const OLD_B = 'diagram_old_b';

const parsed = (): ParsedProject => ({
  manifest: {
    format: 'axoview-project',
    formatVersion: 1,
    exportedAt: '2026-07-30T00:00:00.000Z',
    folders: [],
    diagrams: [
      { id: OLD_A, name: 'A', lastModified: '2026-07-30T00:00:00.000Z', folderId: null },
      { id: OLD_B, name: 'B', lastModified: '2026-07-30T00:00:00.000Z', folderId: null }
    ]
  } as unknown as ParsedProject['manifest'],
  diagrams: new Map<string, unknown>([
    [
      OLD_A,
      {
        title: 'A',
        // The node-level "linked diagram" field the ADR names — rewritten.
        items: [{ id: 'i1', name: 'N', link: OLD_B }],
        views: [
          {
            id: 'v1',
            name: 'Main',
            items: [{ id: 'i1', tile: { x: 0, y: 0 } }],
            connectors: [
              {
                id: 'c1',
                name: 'Flow',
                nameSeeded: true,
                labels: [{ id: 'l1', text: 'Flow', position: 50, line: '1' }],
                anchors: [
                  { id: 'a1', ref: { item: 'i1' } },
                  { id: 'a2', ref: { tile: { x: 3, y: 3 } } }
                ]
              }
            ],
            textBoxes: [
              {
                id: 'tb1',
                tile: { x: 1, y: 1 },
                // Authored by TextBoxLinkCard's "link to a diagram" suggestion.
                content: `<p>see <a href="#diagram:${OLD_B}">the other page</a></p>`
              }
            ],
            rectangles: []
          }
        ]
      }
    ],
    [OLD_B, { title: 'B', items: [], views: [] }]
  ])
});

describe('TXT-09 — #diagram: hrefs inside text-box content', () => {
  it('PRECONDITION: the importer really does rewrite the ref sites the ADR names', () => {
    const out = rewriteIds(parsed());
    const newA = out.idMap.get(OLD_A)!;
    const newB = out.idMap.get(OLD_B)!;
    expect(newA).toBeTruthy();
    expect(newB).toBeTruthy();
    const modelA = out.models.get(newA) as {
      items: Array<{ link?: string }>;
    };
    // The node-level linked-diagram field IS remapped — so a failure below is
    // a gap in the rewrite LIST, not a broken rig.
    expect(modelA.items[0].link).toBe(newB);
  });

  it('CHARACTERIZATION: the text-box href still carries the OLD diagram id', () => {
    const out = rewriteIds(parsed());
    const modelA = out.models.get(out.idMap.get(OLD_A)!) as {
      views: Array<{ textBoxes: Array<{ content: string }> }>;
    };
    const content = modelA.views[0].textBoxes[0].content;
    expect(content).toContain(`#diagram:${OLD_A === OLD_B ? '' : OLD_B}`);
    expect(content).not.toContain(out.idMap.get(OLD_B)!);
  });

  it.failing(
    'TXT-09: an imported text-box diagram link should point at the imported copy',
    () => {
      const out = rewriteIds(parsed());
      const modelA = out.models.get(out.idMap.get(OLD_A)!) as {
        views: Array<{ textBoxes: Array<{ content: string }> }>;
      };
      expect(modelA.views[0].textBoxes[0].content).toContain(
        `#diagram:${out.idMap.get(OLD_B)!}`
      );
    }
  );

  it('CHARACTERIZATION: the dead link resolves to an id that exists nowhere in the imported project', () => {
    const out = rewriteIds(parsed());
    const ids = new Set(out.diagrams.map((d) => d.newId));
    // What the resting-render click handler will dispatch:
    // `axoview-navigate-to-diagram` with the slice after the prefix.
    expect(ids.has(OLD_B)).toBe(false);
  });
});

describe('TXT-10 — the nameSeeded marker through ZIP import', () => {
  it('the deep rewrite copies every unrecognised key, so nameSeeded survives (no duplicate label on the next load)', () => {
    const out = rewriteIds(parsed());
    const modelA = out.models.get(out.idMap.get(OLD_A)!) as {
      views: Array<{ connectors: Array<Record<string, unknown>> }>;
    };
    const connector = modelA.views[0].connectors[0];
    expect(connector.nameSeeded).toBe(true);
    expect((connector.labels as unknown[]).length).toBe(1);
  });
});
