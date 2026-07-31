/**
 * Promoted from the F1 explore lane (ADR 0047 flip rule) — TXT-09 and TXT-10.
 *
 * ADR 0001 §1 requires the importer to rewrite every id and every
 * cross-reference. `rewriteRefsInModel` is a deep object walk that rewrote
 * exactly one KEY (`link`) — correct for every cross-diagram reference that
 * existed when it was written. Since the ADR 0034 addendum (2026-07-04) a
 * reference can also live INSIDE a string: a text box's Quill content carries
 * `<a href="#diagram:&lt;id&gt;">` runs authored by `TextBoxLinkCard`, which a
 * key-based walk cannot see. The old id survived verbatim, so an imported
 * project's in-text links dead-ended at diagrams in the project it came from.
 *
 * The fix rewrites by SENTINEL, so any current or future HTML surface carrying
 * `#diagram:` is covered by construction — which is what these tests pin.
 */
import {
  rewriteIds,
  rewriteEmbeddedDiagramLinks,
  ParsedProject
} from '../projectZip';

const OLD_A = 'diagram_old_a';
const OLD_B = 'diagram_old_b';

const parsed = (): ParsedProject => ({
  manifest: {
    format: 'axoview-project',
    formatVersion: 1,
    exportedAt: '2026-07-30T00:00:00.000Z',
    folders: [],
    diagrams: [
      {
        id: OLD_A,
        name: 'A',
        lastModified: '2026-07-30T00:00:00.000Z',
        folderId: null
      },
      {
        id: OLD_B,
        name: 'B',
        lastModified: '2026-07-30T00:00:00.000Z',
        folderId: null
      }
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
  it('PRECONDITION: the importer rewrites the ref sites the ADR names', () => {
    const out = rewriteIds(parsed());
    const newA = out.idMap.get(OLD_A)!;
    const newB = out.idMap.get(OLD_B)!;
    expect(newA).toBeTruthy();
    expect(newB).toBeTruthy();
    const modelA = out.models.get(newA) as { items: Array<{ link?: string }> };
    expect(modelA.items[0].link).toBe(newB);
  });

  it('an imported text-box diagram link points at the imported copy', () => {
    const out = rewriteIds(parsed());
    const modelA = out.models.get(out.idMap.get(OLD_A)!) as {
      views: Array<{ textBoxes: Array<{ content: string }> }>;
    };
    const content = modelA.views[0].textBoxes[0].content;
    expect(content).toContain(`#diagram:${out.idMap.get(OLD_B)!}`);
    // …and no trace of the id it was exported from.
    expect(content).not.toContain(OLD_B);
  });

  it('the surrounding markup survives the rewrite untouched', () => {
    const out = rewriteIds(parsed());
    const modelA = out.models.get(out.idMap.get(OLD_A)!) as {
      views: Array<{ textBoxes: Array<{ content: string }> }>;
    };
    expect(modelA.views[0].textBoxes[0].content).toBe(
      `<p>see <a href="#diagram:${out.idMap.get(OLD_B)!}">the other page</a></p>`
    );
  });
});

describe('rewriteEmbeddedDiagramLinks — the sentinel rewrite in isolation', () => {
  const idMap = new Map([
    ['old1', 'new1'],
    ['old2', 'new2']
  ]);

  it('rewrites every occurrence, not just the first', () => {
    expect(
      rewriteEmbeddedDiagramLinks(
        'a #diagram:old1 b #diagram:old2 c #diagram:old1',
        idMap
      )
    ).toBe('a #diagram:new1 b #diagram:new2 c #diagram:new1');
  });

  it('stops at the first character that cannot be part of an id', () => {
    expect(
      rewriteEmbeddedDiagramLinks('<a href="#diagram:old1">x</a>', idMap)
    ).toBe('<a href="#diagram:new1">x</a>');
    expect(rewriteEmbeddedDiagramLinks('#diagram:old1&quot;', idMap)).toBe(
      '#diagram:new1&quot;'
    );
  });

  it('leaves a sentinel whose target is not in this archive ALONE', () => {
    // Silently repointing it at some other diagram would be worse than a link
    // that no-ops — `TextBox.onRestingClick` already handles an unresolvable id.
    expect(rewriteEmbeddedDiagramLinks('#diagram:stranger', idMap)).toBe(
      '#diagram:stranger'
    );
  });

  it('is a no-op for a string with no sentinel', () => {
    const plain = 'just some <strong>content</strong>';
    expect(rewriteEmbeddedDiagramLinks(plain, idMap)).toBe(plain);
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
