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
import { sanitizeImportedBlob } from '../importedBlob';

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

  it('leaves share identity alone — that is MOP-01, across every copy path', () => {
    const out = sanitizeImportedBlob(
      { ...file, shareUuid: 'u', sharedAt: 't' },
      'Chosen'
    ) as Record<string, unknown>;
    expect(out.shareUuid).toBe('u');
  });
});
