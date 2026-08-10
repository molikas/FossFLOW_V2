/**
 * A3/ZIP-06 — a single-JSON import used to file itself into a folder this
 * workspace does not have. Promoted from the 2026-07 exploratory campaign's
 * probe lane (`__explore__/A3/json-import-zip-06-09`).
 *
 * Both call sites spread the untrusted file straight into `createDiagram`, and
 * `isPersistedDiagramBlob` is a shape check rather than a whitelist — so the
 * file's own `folderId` rode along, and `sessionSaveDiagram` prefers the blob's
 * value over the caller's, which meant the explicit `null` destination lost.
 */
import { sanitizeImportedBlob, stripSourceIdentity } from '../importedBlob';

describe('sanitizeImportedBlob', () => {
  const file = {
    id: 'from-another-workspace',
    folderId: 'a-folder-that-is-not-here',
    deletedAt: '2026-01-01T00:00:00.000Z',
    title: 'Old title',
    name: 'Old name',
    items: [{ id: 'n1' }],
    views: []
  };

  it('strips the fields storage owns', () => {
    const out = sanitizeImportedBlob(file, 'Chosen') as Record<string, unknown>;
    expect(out).not.toHaveProperty('id');
    expect(out).not.toHaveProperty('folderId');
    expect(out).not.toHaveProperty('deletedAt');
  });

  it('applies the name the caller resolved to both fields', () => {
    const out = sanitizeImportedBlob(file, 'Chosen') as Record<string, unknown>;
    expect(out.name).toBe('Chosen');
    expect(out.title).toBe('Chosen');
  });

  it('keeps the document itself', () => {
    const out = sanitizeImportedBlob(file, 'Chosen') as Record<string, unknown>;
    expect(out.items).toEqual([{ id: 'n1' }]);
    expect(out.views).toEqual([]);
  });

  it('handles a file that is not a diagram document at all', () => {
    const out = sanitizeImportedBlob(42, 'Chosen') as Record<string, unknown>;
    expect(out).toEqual({ name: 'Chosen', title: 'Chosen' });
  });

  // Wave 1 deliberately left share identity alone here and routed it to MOP-01
  // so all three copy paths could be fixed as one change. That landed in wave 2
  // — see the `stripSourceIdentity` block below.
  it('strips share identity too, now that MOP-01 has landed', () => {
    const out = sanitizeImportedBlob(
      { ...file, shareUuid: 'u', sharedAt: 't' },
      'Chosen'
    ) as Record<string, unknown>;
    expect(out.shareUuid).toBeUndefined();
    expect(out.sharedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MOP-01 — a copy must not inherit its source's published identity
// ---------------------------------------------------------------------------
// Promoted from `__explore__/MOP/copy-paths-share-identity`. Every copy path
// spread the source document into `createDiagram` and carried `shareUuid`
// along, so the copy claimed a snapshot it did not own: unsharing or deleting
// the COPY took down the ORIGINAL's live link, and re-sharing the copy
// republished that snapshot with the copy's content. One helper, used by all
// three paths (duplicate, project-ZIP import, single-JSON import).
describe('stripSourceIdentity', () => {
  const source = {
    id: 'original-id',
    title: 'Original',
    shareUuid: 'AAAAAAAAAAAAAAAAAAAAA',
    sharedAt: '2026-07-01T00:00:00.000Z',
    created: '2020-01-01T00:00:00.000Z',
    folderId: 'folder_x',
    deletedAt: null,
    items: [{ id: 'i1' }],
    views: [{ id: 'v1' }]
  };

  it.each(['shareUuid', 'sharedAt', 'created', 'id', 'folderId', 'deletedAt'])(
    'drops %s',
    (field) => {
      expect(stripSourceIdentity(source)).not.toHaveProperty(field);
    }
  );

  it('keeps the diagram content — it is a copy, not a new blank', () => {
    const copy = stripSourceIdentity(source);
    expect(copy.items).toEqual([{ id: 'i1' }]);
    expect(copy.views).toEqual([{ id: 'v1' }]);
    expect(copy.title).toBe('Original');
  });

  it('does not mutate the source', () => {
    const before = JSON.stringify(source);
    stripSourceIdentity(source);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('handles a document that carries none of them', () => {
    expect(stripSourceIdentity({ title: 'X' })).toEqual({ title: 'X' });
  });

  it('sanitizeImportedBlob strips them too (the single-JSON import path)', () => {
    const out = sanitizeImportedBlob(source, 'Imported') as Record<string, unknown>;
    expect(out.shareUuid).toBeUndefined();
    expect(out.sharedAt).toBeUndefined();
    expect(out.name).toBe('Imported');
    expect(out.title).toBe('Imported');
  });
});
