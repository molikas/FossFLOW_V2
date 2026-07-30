import { GoogleDriveProvider } from '../providers/GoogleDriveProvider';
import { useAuthStore } from '../../../stores/authStore';
import { useNotificationStore } from '../../../stores/notificationStore';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

let fetchMock: jest.Mock;

/** Provider with the root pre-resolved (skips ensureRoot's network) + fast retries. */
function makeProvider(): GoogleDriveProvider {
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
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

describe('GoogleDriveProvider', () => {
  test('listDiagrams maps Drive files → DiagramMeta[] and excludes the manifest', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        files: [
          { id: 'd1', name: 'Alpha', modifiedTime: '2026-07-05T10:00:00Z', parents: ['root'] },
          { id: 'sub', name: 'Beta', modifiedTime: '2026-07-05T11:00:00Z', parents: ['folderX'] },
          { id: 'm', name: 'axoview-manifest.json', modifiedTime: '2026-07-05T09:00:00Z', parents: ['root'] }
        ]
      })
    );
    const list = await makeProvider().listDiagrams();
    expect(list).toEqual([
      { id: 'd1', name: 'Alpha', lastModified: '2026-07-05T10:00:00Z', folderId: null },
      { id: 'sub', name: 'Beta', lastModified: '2026-07-05T11:00:00Z', folderId: 'folderX' }
    ]);
  });

  test('loadDiagram fetches media and returns parsed JSON', async () => {
    const doc = { title: 'X', items: [] };
    fetchMock.mockResolvedValueOnce(mockResponse(doc));
    await expect(makeProvider().loadDiagram('d1')).resolves.toEqual(doc);
    expect(fetchMock.mock.calls[0][0]).toContain('/files/d1?alt=media');
  });

  test('saveDiagram sends a media PATCH with a JSON content-type', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'd1' }));
    await makeProvider().saveDiagram('d1', { title: 'Y' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/upload/drive/v3/files/d1?uploadType=media');
    expect((init as RequestInit).method).toBe('PATCH');
    expect((init as { headers: Record<string, string> }).headers['Content-Type']).toBe(
      'application/json'
    );
  });

  test('createDiagram uploads into the root folder and returns the new id', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'new-id' }));
    const id = await makeProvider().createDiagram({ title: 'Fresh' }, null);
    expect(id).toBe('new-id');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/upload/drive/v3/files?uploadType=multipart');
    const body = (init as { body: string }).body;
    expect(body).toContain('"parents":["root"]');
    expect(body).toContain('Fresh');
  });

  test('deleteDiagram trashes (never hard-deletes)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'd1' }));
    await makeProvider().deleteDiagram('d1');
    const [url, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe('PATCH');
    expect((init as { body: string }).body).toContain('"trashed":true');
    expect(url).not.toContain('uploadType');
  });

  test('moveItem swaps parents', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ parents: ['oldFolder'] }))
      .mockResolvedValueOnce(mockResponse({ id: 'd1' }));
    await makeProvider().moveItem('d1', 'diagram', 'newFolder');
    const patchUrl = fetchMock.mock.calls[1][0] as string;
    expect(patchUrl).toContain('addParents=newFolder');
    expect(patchUrl).toContain('removeParents=oldFolder');
  });

  test('401 forces SESSION_EXPIRED and throws', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'unauthorized' }, 401));
    await expect(makeProvider().loadDiagram('d1')).rejects.toThrow();
    expect(useAuthStore.getState().status).toBe('SESSION_EXPIRED');
  });

  test('retries a transient 503 then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ error: 'busy' }, 503))
      .mockResolvedValueOnce(mockResponse({ error: 'busy' }, 503))
      .mockResolvedValueOnce(mockResponse({ ok: true }));
    await expect(makeProvider().loadDiagram('d1')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('gives up after exhausting retries', async () => {
    fetchMock.mockResolvedValue(mockResponse({ error: 'busy' }, 503));
    await expect(makeProvider().loadDiagram('d1')).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  test('a permanent 403 (Drive API disabled) fails fast, surfacing Google\'s message', async () => {
    fetchMock.mockResolvedValue(
      mockResponse(
        {
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message:
              'Google Drive API has not been used in project 485371025824 before or it is disabled.'
          }
        },
        403
      )
    );
    await expect(makeProvider().loadDiagram('d1')).rejects.toThrow(/has not been used/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry storm
  });

  test('a rate-limit 403 IS retried', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 403)
      )
      .mockResolvedValueOnce(mockResponse({ ok: true }));
    await expect(makeProvider().loadDiagram('d1')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('root discovery: adopts an existing marker folder', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ files: [{ id: 'existing-root' }] }));
    const p = new GoogleDriveProvider();
    (p as unknown as { retryDelays: number[] }).retryDelays = [0, 0, 0];
    await expect(p.hasConfiguredRoot()).resolves.toBe(true);
    expect(localStorage.getItem('axoview-drive-root')).toBe('existing-root');
  });

  test('root discovery: no marker → not configured', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ files: [] }));
    const p = new GoogleDriveProvider();
    (p as unknown as { retryDelays: number[] }).retryDelays = [0, 0, 0];
    await expect(p.hasConfiguredRoot()).resolves.toBe(false);
  });

  test('listDiagrams drains nextPageToken (Drive pages can be partial)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          files: [{ id: 'd1', name: 'Alpha', modifiedTime: 'T1', parents: ['root'] }],
          nextPageToken: 'page2'
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          files: [{ id: 'd2', name: 'Beta', modifiedTime: 'T2', parents: ['root'] }]
        })
      );
    const list = await makeProvider().listDiagrams();
    expect(list.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('pageToken=page2');
  });

  test('configureRoot adopts + renames an existing marker root instead of duplicating it', async () => {
    const p = new GoogleDriveProvider();
    (p as unknown as { retryDelays: number[] }).retryDelays = [0, 0, 0];
    fetchMock
      .mockResolvedValueOnce(mockResponse({ files: [{ id: 'existing-root' }] })) // marker probe
      .mockResolvedValueOnce(mockResponse({ id: 'existing-root' })); // rename PATCH
    await p.configureRoot('My Diagrams');
    expect(fetchMock).toHaveBeenCalledTimes(2); // probe + rename, NO create POST
    const [renameUrl, renameInit] = fetchMock.mock.calls[1];
    expect(renameUrl).toContain('/files/existing-root');
    expect((renameInit as RequestInit).method).toBe('PATCH');
    expect((renameInit as { body: string }).body).toContain('My Diagrams');
  });

  test('configureRoot creates the marker root when none exists', async () => {
    const p = new GoogleDriveProvider();
    (p as unknown as { retryDelays: number[] }).retryDelays = [0, 0, 0];
    fetchMock
      .mockResolvedValueOnce(mockResponse({ files: [] })) // marker probe: nothing
      .mockResolvedValueOnce(mockResponse({ id: 'new-root' })); // create POST
    await p.configureRoot('My Diagrams');
    const [, createInit] = fetchMock.mock.calls[1];
    expect((createInit as RequestInit).method).toBe('POST');
    expect((createInit as { body: string }).body).toContain('"axoviewRoot":"true"');
    expect((createInit as { body: string }).body).toContain('My Diagrams');
  });

  test('reads the token via getValidToken only — unauth throws before any fetch', async () => {
    useAuthStore.setState({ status: 'UNAUTHENTICATED', accessToken: null, expiresAt: null });
    await expect(makeProvider().loadDiagram('d1')).rejects.toThrow(/signed in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Wave 1 — A2/STOR-02, STOR-08. Promoted from the 2026-07 exploratory
// campaign's probe lane (`__explore__/A2/drive-stor-*`).
// ---------------------------------------------------------------------------

describe('A2/STOR-08 — a create is never replayed', () => {
  test('fails fast on a 5xx instead of minting a second file', async () => {
    const posts: string[] = [];
    // The shape that matters: the write COMMITS, then the response is lost.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST') {
        posts.push(String(url));
        return mockResponse({ error: { message: 'backend hiccup' } }, 503);
      }
      return mockResponse({ files: [] });
    });

    await expect(
      makeProvider().createDiagram(
        { title: 'X', name: 'X', icons: [], items: [], views: [] },
        null
      )
    ).rejects.toThrow();

    // It used to POST four times (the retry ladder), succeed on a later one,
    // return that id, and leave orphans no listing could explain.
    expect(posts).toHaveLength(1);
  });

  test('still retries a replay-safe request', async () => {
    let gets = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') {
        gets += 1;
        if (gets === 1) return mockResponse({ error: { message: 'hiccup' } }, 503);
        return mockResponse({ ok: true });
      }
      return mockResponse({});
    });

    await expect(makeProvider().loadDiagram('file-1')).resolves.toEqual({ ok: true });
    expect(gets).toBe(2);
  });
});

describe('A2/STOR-02 — recursive:false does not orphan the contents', () => {
  test('moves the children out before trashing the folder', async () => {
    const patched: Array<{ url: string; body: unknown }> = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH') {
        patched.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : null
        });
        return mockResponse({ id: 'ok' });
      }
      if (String(url).includes('fields=parents')) {
        return mockResponse({ parents: ['parentFolder'] });
      }
      return mockResponse({ files: [{ id: 'childDoc', name: 'Doc', parents: ['victim'] }] });
    });

    await makeProvider().deleteFolder('victim', false);

    // Drive trashes descendants with the parent, so honouring recursive:false
    // means the child leaves first. It used to cascade either way — making
    // `recursive: true` in the session place WEAKER than `false` here.
    const moved = patched.find((p) => p.url.includes('childDoc'));
    expect(moved).toBeDefined();
    expect(moved!.url).toContain('addParents=parentFolder');
    const trashed = patched.find((p) => p.url.includes('victim'));
    expect(trashed!.body).toEqual({ trashed: true });
  });

  test('recursive:true still relies on Drive cascading', async () => {
    const patched: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET').toUpperCase() === 'PATCH') {
        patched.push(String(url));
        return mockResponse({ id: 'ok' });
      }
      return mockResponse({ files: [] });
    });

    await makeProvider().deleteFolder('victim', true);

    expect(patched).toHaveLength(1);
    expect(patched[0]).toContain('victim');
  });
});
