import { moveDiagramsToDrive } from '../driveTransfer';
import type { DiagramMeta, FolderMeta, StorageProvider } from '../types';

// Minimal in-memory fakes — only the methods driveTransfer touches.

function makeSource(diagrams: Record<string, unknown>) {
  const deleted: string[] = [];
  return {
    provider: {
      loadDiagram: jest.fn(async (id: string) => {
        if (!(id in diagrams)) throw new Error(`missing ${id}`);
        return diagrams[id];
      }),
      deleteDiagram: jest.fn(async (id: string) => {
        deleted.push(id);
      })
    } as unknown as StorageProvider,
    deleted
  };
}

function makeDrive(opts?: {
  folders?: FolderMeta[];
  diagrams?: DiagramMeta[];
  failCreateFor?: string[];
}) {
  const folders: FolderMeta[] = [...(opts?.folders ?? [])];
  const diagrams: DiagramMeta[] = [...(opts?.diagrams ?? [])];
  const created: Array<{ data: Record<string, unknown>; folderId: string | null | undefined }> = [];
  let nextId = 1;
  return {
    provider: {
      // Fresh copies, like the real providers (JSON-parsed per call) — the
      // service keeps its own local bookkeeping of creates.
      listFolders: jest.fn(async () => [...folders]),
      listDiagrams: jest.fn(async () => [...diagrams]),
      createFolder: jest.fn(async (name: string, parentId?: string | null) => {
        const id = `df-${nextId++}`;
        folders.push({ id, name, parentId: parentId ?? null });
        return id;
      }),
      createDiagram: jest.fn(async (data: unknown, folderId?: string | null) => {
        const blob = data as Record<string, unknown>;
        if (opts?.failCreateFor?.includes(String(blob.title))) {
          throw new Error('Drive 500');
        }
        created.push({ data: blob, folderId });
        return `dd-${nextId++}`;
      })
    } as unknown as StorageProvider,
    created,
    folders
  };
}

const meta = (id: string, name: string, folderId: string | null = null): DiagramMeta => ({
  id,
  name,
  folderId,
  lastModified: '2026-07-06T00:00:00Z'
});

describe('moveDiagramsToDrive', () => {
  test('move = create on Drive, then delete from source (verified order)', async () => {
    const source = makeSource({ a: { title: 'Alpha', items: [] } });
    const drive = makeDrive();
    const results = await moveDiagramsToDrive({
      source: source.provider,
      drive: drive.provider,
      diagrams: [meta('a', 'Alpha')],
      sourceFolders: []
    });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].driveId).toMatch(/^dd-/);
    expect(drive.created).toHaveLength(1);
    expect(source.deleted).toEqual(['a']);
  });

  test('a failed Drive create keeps the source copy (no delete)', async () => {
    const source = makeSource({ a: { title: 'Alpha' }, b: { title: 'Beta' } });
    const drive = makeDrive({ failCreateFor: ['Beta'] });
    const results = await moveDiagramsToDrive({
      source: source.provider,
      drive: drive.provider,
      diagrams: [meta('a', 'Alpha'), meta('b', 'Beta')],
      sourceFolders: []
    });
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(source.deleted).toEqual(['a']); // Beta untouched in source
  });

  test('recreates the source folder path on Drive, reusing existing folders', async () => {
    const sourceFolders: FolderMeta[] = [
      { id: 'sf-1', name: 'work', parentId: null },
      { id: 'sf-2', name: 'api', parentId: 'sf-1' }
    ];
    const source = makeSource({ a: { title: 'Alpha' } });
    // "work" already exists on Drive — must be reused, not duplicated.
    const drive = makeDrive({ folders: [{ id: 'df-work', name: 'work', parentId: null }] });
    const results = await moveDiagramsToDrive({
      source: source.provider,
      drive: drive.provider,
      diagrams: [meta('a', 'Alpha', 'sf-2')],
      sourceFolders
    });
    expect(results[0].ok).toBe(true);
    // Only "api" was created (inside the pre-existing "work").
    const createdFolders = drive.folders.filter((f) => f.id !== 'df-work');
    expect(createdFolders).toHaveLength(1);
    expect(createdFolders[0].name).toBe('api');
    expect(createdFolders[0].parentId).toBe('df-work');
    expect(drive.created[0].folderId).toBe(createdFolders[0].id);
  });

  test('an explicit targetFolderId skips path recreation', async () => {
    const source = makeSource({ a: { title: 'Alpha' } });
    const drive = makeDrive();
    await moveDiagramsToDrive({
      source: source.provider,
      drive: drive.provider,
      diagrams: [meta('a', 'Alpha', 'sf-ignored')],
      sourceFolders: [{ id: 'sf-ignored', name: 'nope', parentId: null }],
      targetFolderId: null
    });
    expect(drive.provider.createFolder).not.toHaveBeenCalled();
    expect(drive.created[0].folderId).toBeNull();
  });

  test('name collision in the target folder gets a copy suffix', async () => {
    const source = makeSource({ a: { title: 'Alpha' } });
    const drive = makeDrive({ diagrams: [meta('existing', 'Alpha', null)] });
    const results = await moveDiagramsToDrive({
      source: source.provider,
      drive: drive.provider,
      diagrams: [meta('a', 'Alpha')],
      sourceFolders: []
    });
    expect(results[0].ok).toBe(true);
    expect(results[0].driveName).not.toBe('Alpha');
    expect(String(drive.created[0].data.title)).toBe(results[0].driveName);
  });

  test('the source id is stripped so Drive allocates a fresh one', async () => {
    const source = makeSource({ a: { id: 'a', title: 'Alpha' } });
    const drive = makeDrive();
    await moveDiagramsToDrive({
      source: source.provider,
      drive: drive.provider,
      diagrams: [meta('a', 'Alpha')],
      sourceFolders: []
    });
    expect('id' in drive.created[0].data).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wave 1 — A2/STOR-09. Promoted from the 2026-07 exploratory campaign's probe
// lane (`__explore__/A2/drive-stor-*`).
//
// A move is create → verify → delete-source. When the SOURCE delete failed, the
// whole item was reported `ok: false` with `driveId` DROPPED — so the caller was
// told the move failed and given no way to reconcile the Drive copy it now
// owned, and a retry with the same selection minted a second one.
// ---------------------------------------------------------------------------
describe('A2/STOR-09 — a failed source delete is not a failed move', () => {
  test('reports the Drive copy it created, and flags the leftover source', async () => {
    const source = makeSource({ a: { title: 'Alpha' } });
    (source.provider.deleteDiagram as jest.Mock).mockImplementation(async () => {
      throw new Error('session delete failed');
    });
    const drive = makeDrive();

    const [result] = await moveDiagramsToDrive({
      source: source.provider,
      drive: drive.provider,
      diagrams: [meta('a', 'Alpha')],
      sourceFolders: []
    });

    // The copy is real and verified: saying "failed" and hiding its id is what
    // made a retry mint a second one.
    expect(result.ok).toBe(true);
    expect(result.driveId).toBeDefined();
    expect(result.sourceRemained).toBe(true);
    expect(result.error).toMatch(/session delete failed/);
    expect(drive.created).toHaveLength(1);
  });

  test('a create failure is still a failed move, with no driveId', async () => {
    const source = makeSource({ a: { title: 'Alpha' } });
    const drive = makeDrive({ failCreateFor: ['Alpha'] });

    const [result] = await moveDiagramsToDrive({
      source: source.provider,
      drive: drive.provider,
      diagrams: [meta('a', 'Alpha')],
      sourceFolders: []
    });

    expect(result.ok).toBe(false);
    expect(result.driveId).toBeUndefined();
    expect(result.sourceRemained).toBeUndefined();
    // And the source copy is untouched — the one guarantee the move owes.
    expect(source.deleted).toEqual([]);
  });
});
