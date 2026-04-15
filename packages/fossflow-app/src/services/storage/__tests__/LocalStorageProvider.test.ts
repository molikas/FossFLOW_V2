import { LocalStorageProvider } from '../providers/LocalStorageProvider';

const BASE = 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

function setFetch(impl: FetchImpl) {
  (global as any).fetch = impl;
}

function setFetchSequence(...responses: Array<Response | Error>) {
  let idx = 0;
  (global as any).fetch = async () => {
    const r = responses[idx++] ?? mockResponse({ error: 'no more mocks' }, 500);
    if (r instanceof Error) throw r;
    return r;
  };
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

async function serverProvider(): Promise<LocalStorageProvider> {
  setFetchSequence(mockResponse({ enabled: true, version: '1.0.0' }));
  const p = new LocalStorageProvider(BASE);
  await p.isAvailable();
  expect(p.usingServer).toBe(true);
  return p;
}

async function offlineProvider(): Promise<LocalStorageProvider> {
  setFetchSequence(new Error('Network error'));
  const p = new LocalStorageProvider(BASE);
  await p.isAvailable();
  expect(p.usingServer).toBe(false);
  return p;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  (global as any).fetch = undefined;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalStorageProvider', () => {
  // ---- listDiagrams ---------------------------------------------------------

  test('listDiagrams() returns parsed list from server', async () => {
    const provider = await serverProvider();
    const serverDiagrams = [
      { id: 'diag-1', name: 'My Diagram', lastModified: '2026-04-14T10:00:00.000Z', folderId: null }
    ];
    setFetchSequence(mockResponse(serverDiagrams));

    const list = await provider.listDiagrams();

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('diag-1');
    expect(list[0].name).toBe('My Diagram');
    expect(typeof list[0].lastModified).toBe('string');
    expect(list[0].folderId).toBeNull();
  });

  test('listDiagrams() falls back to sessionStorage when server unavailable', async () => {
    const provider = await offlineProvider();
    const meta = [
      { id: 'sess-1', name: 'Session Diagram', lastModified: '2026-01-01T00:00:00Z', folderId: null }
    ];
    sessionStorage.setItem('fossflow_diagrams', JSON.stringify(meta));

    const list = await provider.listDiagrams();

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('sess-1');
  });

  // ---- saveDiagram ----------------------------------------------------------

  test('saveDiagram() sends correct PUT body', async () => {
    const provider = await serverProvider();

    let capturedBody: unknown;
    setFetch(async (_input, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string);
      return mockResponse({ success: true });
    });

    await provider.saveDiagram('diag-1', { title: 'Updated', items: [] });

    expect((capturedBody as any).title).toBe('Updated');
  });

  // ---- createDiagram --------------------------------------------------------

  test('createDiagram() returns new id from server', async () => {
    const provider = await serverProvider();
    setFetchSequence(mockResponse({ success: true, id: 'new-diag-1' }, 201));

    const id = await provider.createDiagram({ title: 'New', items: [] });

    expect(id).toBe('new-diag-1');
  });

  // ---- deleteDiagram --------------------------------------------------------

  test('deleteDiagram(id, soft=true) sends PATCH with deletedAt, not DELETE', async () => {
    const provider = await serverProvider();

    let calledMethod: string | undefined;
    let capturedBody: unknown;
    setFetch(async (_input, init) => {
      calledMethod = (init as RequestInit)?.method;
      capturedBody = JSON.parse((init as RequestInit).body as string);
      return mockResponse({ success: true });
    });

    await provider.deleteDiagram('diag-1', true);

    expect(calledMethod).toBe('PATCH');
    expect((capturedBody as any).deletedAt).toBeTruthy();
  });

  test('deleteDiagram(id, soft=false) removes permanently via DELETE', async () => {
    const provider = await serverProvider();

    let calledMethod: string | undefined;
    setFetch(async (_input, init) => {
      calledMethod = (init as RequestInit)?.method;
      return mockResponse({ success: true });
    });

    await provider.deleteDiagram('diag-1', false);

    expect(calledMethod).toBe('DELETE');
  });

  // ---- createFolder ---------------------------------------------------------

  test('createFolder() creates and returns id', async () => {
    const provider = await serverProvider();
    setFetchSequence(mockResponse({ success: true, id: 'folder-1' }, 201));

    const id = await provider.createFolder('My Folder', null);

    expect(id).toBe('folder-1');
  });

  // ---- moveItem -------------------------------------------------------------

  test('moveItem() sends correct PATCH body for diagram', async () => {
    const provider = await serverProvider();

    let capturedBody: unknown;
    setFetch(async (_input, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string);
      return mockResponse({ success: true });
    });

    await provider.moveItem('diag-1', 'diagram', 'folder-42');

    expect((capturedBody as any).targetFolderId).toBe('folder-42');
  });

  // ---- server timeout fallback ----------------------------------------------

  test('server unavailability falls back to sessionStorage for listDiagrams', async () => {
    const provider = await offlineProvider();

    const meta = [
      { id: 'fallback-1', name: 'Fallback', lastModified: '2026-01-01T00:00:00Z', folderId: null }
    ];
    sessionStorage.setItem('fossflow_diagrams', JSON.stringify(meta));

    const list = await provider.listDiagrams();

    expect(list[0].id).toBe('fallback-1');
  });
});
