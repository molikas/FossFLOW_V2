/**
 * A2 — Drive provider, cross-provider parity and move-to-Drive.
 *
 * STOR-02 (deleteFolder means three different things), STOR-08 (the retry policy
 * replays non-idempotent creates), STOR-09 (a failed source delete is reported
 * as a failed move while the Drive copy survives), STOR-13 (listDiagrams is
 * account-wide, not root-scoped), STOR-16 (the tree manifest falls back to
 * localStorage on write but the server wins on the next read).
 *
 * Setup shape copied from `__tests__/GoogleDriveProvider.test.ts` and
 * `__tests__/driveTransfer.test.ts`.
 */
import { GoogleDriveProvider } from '../../services/storage/providers/GoogleDriveProvider';
import { LocalStorageProvider } from '../../services/storage/providers/LocalStorageProvider';
import { moveDiagramsToDrive } from '../../services/storage/driveTransfer';
import type { DiagramMeta, StorageProvider } from '../../services/storage/types';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

let fetchMock: jest.Mock;

function makeDriveProvider(): GoogleDriveProvider {
  const p = new GoogleDriveProvider();
  (p as unknown as { rootFolderId: string }).rootFolderId = 'root';
  (p as unknown as { retryDelays: number[] }).retryDelays = [0, 0, 0];
  return p;
}

beforeEach(() => {
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: 'test-token',
    expiresAt: Date.now() + 3600_000,
    user: null,
    _requestToken: null,
    _revoke: null,
    _waiters: []
  });
  useNotificationStore.setState({ queue: [] });
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

// ---------------------------------------------------------------------------
// STOR-02 — one signature, three semantics.
// ---------------------------------------------------------------------------
describe('STOR-02 — deleteFolder(id, recursive) is honoured, inverted and ignored', () => {
  it('characterization: the three providers disagree about what the flag means', async () => {
    // (a) server path — forwards the flag verbatim.
    const urls: string[] = [];
    (global as unknown as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return mockResponse({});
    };
    const server = new LocalStorageProvider('http://localhost:3001');
    server.usingServer = true;
    await server.deleteFolder('f1', false);
    await server.deleteFolder('f1', true);
    expect(urls[0]).toContain('recursive=false');
    expect(urls[1]).toContain('recursive=true');

    // (b) Drive path — the flag never reaches the wire; both calls are the same
    // cascading trash (`deleteFolder(id)` doesn't even declare the parameter).
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    fetchMock.mockResolvedValue(mockResponse({ id: 'f1' }));
    const drive = makeDriveProvider();
    await drive.deleteFolder('f1', false);
    await drive.deleteFolder('f1', true);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1].body)));
    expect(bodies).toEqual([{ trashed: true }, { trashed: true }]);

    // (c) session path — both calls leave every diagram in place (STOR-03), so
    // `recursive: true` is weaker here than `recursive: false` is on Drive.
    const session = new LocalStorageProvider('http://localhost:3001');
    session.usingServer = false;
    const fid = await session.createFolder('Work', null);
    const did = await session.createDiagram({ title: 'In', items: [], views: [], icons: [] }, fid);
    await session.deleteFolder(fid, true);
    expect((await session.listDiagrams()).map((d) => d.id)).toContain(did);
  });

  it.failing('STOR-02: recursive=false refuses to orphan, on every provider', async () => {
    const session = new LocalStorageProvider('http://localhost:3001');
    session.usingServer = false;
    const fid = await session.createFolder('Work', null);
    await session.createDiagram({ title: 'In', items: [], views: [], icons: [] }, fid);
    expect((await session.listDiagrams(fid))).toHaveLength(1); // precondition
    // Expected: a non-recursive delete of a non-empty folder either refuses or
    // reparents. Actual: it silently drops the folder row.
    await expect(session.deleteFolder(fid, false)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// STOR-08 — `request()` classifies by status only, never by method.
// ---------------------------------------------------------------------------
describe('STOR-08 — a 5xx after the write replays the create and mints a duplicate', () => {
  /** A Drive double that really creates a file per POST, then answers 503 once. */
  function driveWithFlakyResponse() {
    const created: string[] = [];
    let n = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.includes('uploadType=multipart')) {
        // The write lands server-side FIRST, then the response is lost.
        const id = `file-${++n}`;
        created.push(id);
        if (n === 1) return mockResponse({ error: { status: 'UNAVAILABLE' } }, 503);
        return mockResponse({ id });
      }
      return mockResponse({});
    });
    return created;
  }

  it('characterization: one createDiagram call issues two POSTs and leaves two files', async () => {
    const created = driveWithFlakyResponse();
    const p = makeDriveProvider();

    const id = await p.createDiagram({ title: 'Once', items: [], views: [], icons: [] }, null);

    // PRECONDITION: the call succeeded, so this is the happy path as the user
    // experiences it — no error, no warning.
    expect(id).toBe('file-2');
    // Two POSTs, two files. The user asked for one diagram.
    const posts = fetchMock.mock.calls.filter(
      (c) => c[1]?.method === 'POST' && String(c[0]).includes('uploadType=multipart')
    );
    expect(posts).toHaveLength(2);
    expect(created).toEqual(['file-1', 'file-2']);
    // And the orphan is not the one the app now tracks, so nothing will clean it.
    expect(created).toContain('file-1');
    expect(id).not.toBe('file-1');
  });

  it.failing('STOR-08: a non-idempotent create is not replayed on a 5xx', async () => {
    driveWithFlakyResponse();
    await makeDriveProvider()
      .createDiagram({ title: 'Once', items: [], views: [], icons: [] }, null)
      .catch(() => {});
    const posts = fetchMock.mock.calls.filter(
      (c) => c[1]?.method === 'POST' && String(c[0]).includes('uploadType=multipart')
    );
    // Expected: retry the read-only and idempotent calls, surface the create.
    // Actual: `request()` decides on status + attempt count only.
    expect(posts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// STOR-09 — the move's second leg.
// ---------------------------------------------------------------------------
describe('STOR-09 — a failed source delete is reported as a failed move', () => {
  function rig() {
    const driveCreated: Array<{ title: unknown; folderId: unknown }> = [];
    const drive = {
      listFolders: async () => [],
      listDiagrams: async () => [],
      createFolder: async () => 'df-1',
      createDiagram: async (data: unknown, folderId?: string | null) => {
        driveCreated.push({ title: (data as { title: unknown }).title, folderId });
        return `dd-${driveCreated.length}`;
      }
    } as unknown as StorageProvider;
    const source = {
      loadDiagram: async () => ({ title: 'Alpha', items: [], views: [], icons: [] }),
      deleteDiagram: async () => { throw new Error('sessionStorage delete failed'); }
    } as unknown as StorageProvider;
    const diagrams: DiagramMeta[] = [
      { id: 's1', name: 'Alpha', folderId: null, lastModified: '2026-07-06T00:00:00Z' }
    ];
    return { drive, source, diagrams, driveCreated };
  }

  it('characterization: the Drive copy exists, the result says ok:false and hides its id', async () => {
    const { drive, source, diagrams, driveCreated } = rig();

    const results = await moveDiagramsToDrive({ source, drive, diagrams, sourceFolders: [] });

    // PRECONDITION: the create really succeeded and the delete really failed —
    // otherwise ok:false would just be a failed create (already covered).
    expect(driveCreated).toEqual([{ title: 'Alpha', folderId: null }]);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/delete failed/);
    // The caller is told nothing about the copy it now owns on Drive, so it
    // cannot roll back, cannot report it, and a retry creates another one.
    expect(results[0].driveId).toBeUndefined();
    expect(results[0].driveName).toBeUndefined();
  });

  it.failing('STOR-09: a post-create failure reports the Drive id it created', async () => {
    const { drive, source, diagrams } = rig();
    const results = await moveDiagramsToDrive({ source, drive, diagrams, sourceFolders: [] });
    expect(results[0].ok).toBe(false); // precondition
    // Expected: enough information to reconcile (or roll back) the duplicate.
    // Actual: the catch builds its result from `meta` only.
    expect(results[0].driveId).toBe('dd-1');
  });

  it.failing('STOR-09: retrying the failed move does not create a second Drive copy', async () => {
    const { drive, source, diagrams, driveCreated } = rig();
    await moveDiagramsToDrive({ source, drive, diagrams, sourceFolders: [] });
    expect(driveCreated).toHaveLength(1); // precondition
    // The user sees "1 failed" and retries the same selection.
    await moveDiagramsToDrive({ source, drive, diagrams, sourceFolders: [] });
    expect(driveCreated).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// STOR-13 — `listDiagrams(undefined)` is scoped by app marker, not by root.
// ---------------------------------------------------------------------------
describe('STOR-13 — a file moved out of the root still lists, unplaceable', () => {
  it('characterization: the query has no root term and the stray folderId matches no folder', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("mimeType%3D'application%2Fjson'")) {
        return mockResponse({
          files: [
            { id: 'in', name: 'Inside', parents: ['root'], modifiedTime: '2026-01-01T00:00:00Z' },
            // The user dragged this one to "My Drive" in Drive's own UI. It
            // keeps the app marker, so the marker-only query still finds it.
            { id: 'stray', name: 'Stray', parents: ['someUnrelatedFolder'], modifiedTime: '2026-01-01T00:00:00Z' }
          ]
        });
      }
      return mockResponse({ files: [] }); // no folders under the root
    });

    const p = makeDriveProvider();
    const diagrams = await p.listDiagrams();
    const folders = await p.listFolders();

    // PRECONDITION: the query really was the unscoped one (no root term).
    const listUrl = String(fetchMock.mock.calls[0][0]);
    expect(decodeURIComponent(listUrl)).not.toContain("'root' in parents");

    expect(diagrams.map((d) => d.id)).toEqual(['in', 'stray']);
    const stray = diagrams.find((d) => d.id === 'stray')!;
    expect(stray.folderId).toBe('someUnrelatedFolder');
    // Nothing in the folder list can host it, so any tree built from these two
    // calls has a diagram it cannot place — while every count includes it.
    expect(folders.map((f) => f.id)).not.toContain('someUnrelatedFolder');
  });

  it.failing('STOR-13: a diagram outside the root is either scoped out or placed at root', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("mimeType%3D'application%2Fjson'")) {
        return mockResponse({
          files: [{ id: 'stray', name: 'Stray', parents: ['someUnrelatedFolder'], modifiedTime: '2026-01-01T00:00:00Z' }]
        });
      }
      return mockResponse({ files: [] });
    });
    const diagrams = await makeDriveProvider().listDiagrams();
    expect(diagrams).toHaveLength(1); // precondition
    // Expected: `folderId` always names a folder the tree knows, or the file is
    // excluded. Actual: `parents[0]` is passed through untranslated.
    expect(diagrams[0].folderId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// STOR-16 — the tree manifest's two halves fall back differently.
// ---------------------------------------------------------------------------
describe('STOR-16 — a failed manifest save lands in localStorage and is then overwritten', () => {
  it('characterization: the save reports success, the next healthy read returns the server copy', async () => {
    const p = new LocalStorageProvider('http://localhost:3001');
    p.usingServer = true;

    // The manifest PUT fails; the server keeps its old ordering.
    (global as unknown as { fetch: unknown }).fetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      if (init?.method === 'PUT') throw new Error('offline');
      return mockResponse({ folders: [{ id: 'f1', order: 0 }] });
    };

    // The user reorders folders. This resolves — no throw, no signal.
    await expect(p.saveTreeManifest({ folders: [{ id: 'f1', order: 99 }] } as never))
      .resolves.toBeUndefined();
    // PRECONDITION: it really did land locally rather than nowhere.
    expect(JSON.parse(localStorage.getItem('axoview-tree-manifest')!).folders[0].order).toBe(99);

    // The backend recovers. The read prefers the server, which never saw the
    // reorder — so the user's change silently reverts.
    const readBack = (await p.getTreeManifest()) as { folders: Array<{ order: number }> };
    expect(readBack.folders[0].order).toBe(0);
  });

  it.failing('STOR-16: a manifest save that could not reach the server says so', async () => {
    const p = new LocalStorageProvider('http://localhost:3001');
    p.usingServer = true;
    (global as unknown as { fetch: unknown }).fetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      if (init?.method === 'PUT') throw new Error('offline');
      return mockResponse({ folders: [] });
    };
    // Expected: in server mode a localStorage write is not a substitute for the
    // durable one, so the caller must learn. Actual: `catch { fall through }`.
    await expect(p.saveTreeManifest({ folders: [] } as never)).rejects.toThrow();
  });
});
