/**
 * Promoted from the F5 explore lane (ADR 0047 flip rule) — ICON-06.
 *
 * `scanIconUsage` skipped soft-deleted diagrams, with a comment explaining that
 * surfacing their counts "would only confuse the warning". That is right for a
 * usage REPORT and wrong for a DELETE GATE: a trashed diagram is restorable, so
 * its reference is live. Deleting the icon left it resolving to nothing on
 * restore, and nothing downstream catches that — an unknown icon reference
 * passes both the schema and `validateView` (E4/CLIP-14).
 *
 * Same shape as S2/SHARE-06 (trashing a shared diagram left its public link
 * live): a soft delete hides a row from one query and the row keeps mattering
 * somewhere else.
 */
import { scanIconUsage } from '../iconUsage';

type Meta = { id: string; name: string; deletedAt?: string };

const ICON = 'imported-1';
const usingIcon = { items: [{ icon: ICON }, { icon: 'other' }] };

const makeStorage = (
  metas: Meta[],
  blobs: Record<string, { items?: Array<{ icon?: string }> }>
) =>
  ({
    listDiagrams: async () => metas,
    loadDiagram: async (id: string) => blobs[id] ?? null
  }) as never;

const scan = (
  metas: Meta[],
  blobs: Record<string, { items?: Array<{ icon?: string }> }>,
  currentDiagramId?: string
) =>
  scanIconUsage({
    storage: makeStorage(metas, blobs),
    iconId: ICON,
    currentDiagramId
  } as never);

describe('ICON-06 — the delete gate counts the trash', () => {
  it('CONTROL: a LIVE diagram using the icon is reported', async () => {
    const out = await scan([{ id: 'd1', name: 'Live' }], { d1: usingIcon });
    expect(out).toEqual([{ diagramId: 'd1', diagramName: 'Live', count: 1 }]);
  });

  it('a TRASHED diagram using the icon is reported too, and labelled', async () => {
    const out = await scan([{ id: 'd1', name: 'Trashed', deletedAt: '2026-08-01' }], {
      d1: usingIcon
    });
    expect(out).toEqual([
      { diagramId: 'd1', diagramName: 'Trashed', count: 1, inTrash: true }
    ]);
  });

  it('the label distinguishes them when both exist', async () => {
    const out = await scan(
      [
        { id: 'd1', name: 'Live' },
        { id: 'd2', name: 'Trashed', deletedAt: '2026-08-01' }
      ],
      { d1: usingIcon, d2: usingIcon }
    );
    expect(out.map((r) => [r.diagramName, !!r.inTrash])).toEqual([
      ['Live', false],
      ['Trashed', true]
    ]);
  });

  it('the CURRENT diagram is still excluded — the dialog speaks about others', async () => {
    const out = await scan(
      [
        { id: 'd1', name: 'Current' },
        { id: 'd2', name: 'Other' }
      ],
      { d1: usingIcon, d2: usingIcon },
      'd1'
    );
    expect(out.map((r) => r.diagramId)).toEqual(['d2']);
  });

  it('a diagram that does not use the icon is not reported, trashed or not', async () => {
    const out = await scan(
      [
        { id: 'd1', name: 'Live' },
        { id: 'd2', name: 'Trashed', deletedAt: '2026-08-01' }
      ],
      { d1: { items: [{ icon: 'other' }] }, d2: { items: [] } }
    );
    expect(out).toEqual([]);
  });
});
