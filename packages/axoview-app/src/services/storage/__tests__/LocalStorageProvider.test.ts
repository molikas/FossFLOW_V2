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

// ADR 0009 D2: usingServer is set externally by AppStorageContext after the
// single /api/config probe — the provider no longer auto-probes
// /api/storage/status. Tests inject the mode directly to mimic boot.
async function serverProvider(): Promise<LocalStorageProvider> {
  const p = new LocalStorageProvider(BASE);
  p.usingServer = true;
  return p;
}

async function offlineProvider(): Promise<LocalStorageProvider> {
  const p = new LocalStorageProvider(BASE);
  p.usingServer = false;
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
  // ---- isAvailable ----------------------------------------------------------

  // Post-collapse (ADR 0009 D2): isAvailable() is a no-op that returns true.
  // The legacy /api/storage/status timeout-and-abort behaviour moved upstream
  // to fetchRuntimeConfig (see useRuntimeConfig.test.ts), which is now the
  // sole boot probe.
  test('isAvailable() returns true without issuing any fetch', async () => {
    let calls = 0;
    (global as any).fetch = () => {
      calls++;
      return Promise.reject(new Error('fetch should not be called'));
    };
    const provider = new LocalStorageProvider(BASE);
    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(calls).toBe(0);
    expect(provider.usingServer).toBe(false);
  });

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
    sessionStorage.setItem('axoview_diagrams', JSON.stringify(meta));

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

  // ---- leanIfModel (ADR 0003 + requiredPacks) -------------------------------

  test('saveDiagram() strips pack icons but keeps imported icons (ADR 0003)', async () => {
    const provider = await serverProvider();

    let body: any;
    setFetch(async (_input, init) => {
      body = JSON.parse((init as RequestInit).body as string);
      return mockResponse({ success: true });
    });

    await provider.saveDiagram('d1', {
      items: [{ id: 'i1', name: 'n', icon: 'aws_ec2' }],
      icons: [
        { id: 'aws_ec2', name: 'EC2', url: 'data:x', collection: 'aws' },
        { id: 'iso_box', name: 'Box', url: 'data:x', collection: 'isoflow' },
        { id: 'usr_a', name: 'My logo', url: 'data:y', collection: 'imported' }
      ]
    });

    expect(body.icons).toHaveLength(1);
    expect(body.icons[0].id).toBe('usr_a');
  });

  test('saveDiagram() derives requiredPacks from items × full icons', async () => {
    const provider = await serverProvider();

    let body: any;
    setFetch(async (_input, init) => {
      body = JSON.parse((init as RequestInit).body as string);
      return mockResponse({ success: true });
    });

    await provider.saveDiagram('d1', {
      items: [
        { id: 'i1', name: 'n', icon: 'aws_ec2' },
        { id: 'i2', name: 'n', icon: 'material_Abc' },
        { id: 'i3', name: 'n', icon: 'iso_box' } // isoflow shouldn't appear
      ],
      icons: [
        { id: 'aws_ec2', name: 'EC2', url: 'd', collection: 'aws' },
        { id: 'aws_unused', name: 'X', url: 'd', collection: 'aws' }, // not used
        { id: 'gcp_unused', name: 'Y', url: 'd', collection: 'gcp' }, // not used
        { id: 'material_Abc', name: 'Abc', url: 'd', collection: 'material' },
        { id: 'iso_box', name: 'Box', url: 'd', collection: 'isoflow' }
      ]
    });

    expect(body.requiredPacks.sort()).toEqual(['aws', 'material']);
  });

  // Regression: the bug that prompted this work — re-importing a lean payload
  // (icons already stripped to imported-only) used to overwrite the good
  // requiredPacks list with [] because nothing in icons[] resolved against
  // items[]. Lean inputs must preserve the field they came in with.
  test('saveDiagram() preserves existing requiredPacks when input is already lean', async () => {
    const provider = await serverProvider();

    let body: any;
    setFetch(async (_input, init) => {
      body = JSON.parse((init as RequestInit).body as string);
      return mockResponse({ success: true });
    });

    await provider.saveDiagram('d1', {
      items: [
        { id: 'i1', name: 'n', icon: 'aws_ec2' },
        { id: 'i2', name: 'n', icon: 'material_Abc' }
      ],
      icons: [
        // Only an imported icon — pack icons have already been stripped
        { id: 'usr_a', name: 'logo', url: 'd', collection: 'imported' }
      ],
      requiredPacks: ['aws', 'material']
    });

    expect(body.requiredPacks.sort()).toEqual(['aws', 'material']);
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

  // ---- renameDiagram (session) ---------------------------------------------

  // MQA #14: session-mode rename used to update the diagrams list only, leaving
  // the per-diagram blob's `title` stuck on the old name. The export path reads
  // from the blob, so any unopened-after-rename diagram exported with the old
  // title. Rename must now mirror the new name into the blob.
  test('renameDiagram (session) syncs blob.title + blob.name with new name', async () => {
    const provider = await offlineProvider();
    const meta = [
      { id: 'sess-1', name: 'Old Name', lastModified: '2026-01-01T00:00:00Z', folderId: null }
    ];
    sessionStorage.setItem('axoview_diagrams', JSON.stringify(meta));
    sessionStorage.setItem(
      'axoview_diagram_sess-1',
      JSON.stringify({ title: 'Old Name', items: [], views: [], icons: [], colors: [] })
    );

    await provider.renameDiagram('sess-1', 'New Name');

    const listAfter = JSON.parse(sessionStorage.getItem('axoview_diagrams') ?? '[]');
    expect(listAfter[0].name).toBe('New Name');

    const blobAfter = JSON.parse(sessionStorage.getItem('axoview_diagram_sess-1') ?? '{}');
    expect(blobAfter.title).toBe('New Name');
    expect(blobAfter.name).toBe('New Name');
  });

  test('renameDiagram (session) leaves listing rename in place when blob is corrupted', async () => {
    const provider = await offlineProvider();
    const meta = [
      { id: 'sess-1', name: 'Old Name', lastModified: '2026-01-01T00:00:00Z', folderId: null }
    ];
    sessionStorage.setItem('axoview_diagrams', JSON.stringify(meta));
    sessionStorage.setItem('axoview_diagram_sess-1', 'not-json');

    await expect(provider.renameDiagram('sess-1', 'New Name')).resolves.toBeUndefined();
    const listAfter = JSON.parse(sessionStorage.getItem('axoview_diagrams') ?? '[]');
    expect(listAfter[0].name).toBe('New Name');
  });

  // ---- server timeout fallback ----------------------------------------------

  test('server unavailability falls back to sessionStorage for listDiagrams', async () => {
    const provider = await offlineProvider();

    const meta = [
      { id: 'fallback-1', name: 'Fallback', lastModified: '2026-01-01T00:00:00Z', folderId: null }
    ];
    sessionStorage.setItem('axoview_diagrams', JSON.stringify(meta));

    const list = await provider.listDiagrams();

    expect(list[0].id).toBe('fallback-1');
  });
});

// ---------------------------------------------------------------------------
// Wave 1 — A2/STOR-01, 03, 04, 05, 06, 07, 16. Promoted from the 2026-07
// exploratory campaign's probe lane (`__explore__/A2/local-place-*`).
// ---------------------------------------------------------------------------

describe('A2/STOR-05 — a corrupt store degrades, it does not brick the tree', () => {
  it('listDiagrams survives a corrupt index', async () => {
    sessionStorage.setItem('axoview_diagrams', '{not json');
    const p = await offlineProvider();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(p.listDiagrams()).resolves.toEqual([]);
  });

  it('listFolders survives a corrupt folder store', async () => {
    localStorage.setItem('axoview-folders', '[[[');
    const p = await offlineProvider();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(p.listFolders()).resolves.toEqual([]);
  });

  it('getTreeManifest survives a corrupt manifest', async () => {
    localStorage.setItem('axoview-tree-manifest', 'nope');
    const p = await offlineProvider();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(p.getTreeManifest()).resolves.toEqual({ folders: [] });
  });

  it('and the corruption is reported, not swallowed', async () => {
    sessionStorage.setItem('axoview_diagrams', '{not json');
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const p = await offlineProvider();
    await p.listDiagrams();
    expect(err).toHaveBeenCalled();
  });
});

describe('A2/STOR-06 — a quota failure must not leave unreachable bytes', () => {
  it('removes the blob it just wrote when the index write fails', async () => {
    const p = await offlineProvider();
    const realSetItem = Storage.prototype.setItem;
    jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === 'axoview_diagrams') {
          throw new DOMException('quota', 'QuotaExceededError');
        }
        realSetItem.call(this, key, value);
      });

    await expect(
      p.saveDiagram('diag-1', { title: 'Big', icons: [], items: [], views: [] })
    ).rejects.toThrow();

    jest.restoreAllMocks();
    // The blob used to survive: bytes on a 5 MB budget that no listing shows
    // and nothing can delete.
    expect(sessionStorage.getItem('axoview_diagram_diag-1')).toBeNull();
  });
});

describe('A2/STOR-07 — every session mutation announces itself', () => {
  const countEvents = async (run: () => Promise<void>) => {
    let n = 0;
    const listener = () => {
      n += 1;
    };
    window.addEventListener('axoview-session-changed', listener);
    await run();
    window.removeEventListener('axoview-session-changed', listener);
    return n;
  };

  it('rename, restore and move all dispatch, as save and delete already did', async () => {
    const p = await offlineProvider();
    const id = await p.createDiagram({ title: 'A', name: 'A' }, null);

    // Preconditions: each op really did mutate the index.
    expect(await countEvents(() => p.renameDiagram(id, 'B'))).toBe(1);
    expect((await p.listDiagrams()).find((d) => d.id === id)!.name).toBe('B');

    await p.deleteDiagram(id, true);
    expect(await countEvents(() => p.restoreDiagram(id))).toBe(1);

    const folder = await p.createFolder('F', null);
    expect(await countEvents(() => p.moveItem(id, 'diagram', folder))).toBe(1);
    expect((await p.listDiagrams()).find((d) => d.id === id)!.folderId).toBe(folder);
  });
});

describe('A2/STOR-03 — deleting a folder does not orphan its diagrams', () => {
  it('recursive: the diagrams and their bytes go with the folder', async () => {
    const p = await offlineProvider();
    const folder = await p.createFolder('Networking', null);
    const id = await p.createDiagram({ title: 'VPC', name: 'VPC' }, folder);
    expect(sessionStorage.getItem('axoview_diagram_' + id)).not.toBeNull();

    await p.deleteFolder(folder, true);

    expect(await p.listDiagrams()).toEqual([]);
    expect(sessionStorage.getItem('axoview_diagram_' + id)).toBeNull();
  });

  it('non-recursive: the diagrams move up to the parent, not into limbo', async () => {
    const p = await offlineProvider();
    const parent = await p.createFolder('Parent', null);
    const child = await p.createFolder('Child', parent);
    await p.createDiagram({ title: 'Doc', name: 'Doc' }, child);

    await p.deleteFolder(child, false);

    const [meta] = await p.listDiagrams();
    // It used to keep `folderId: <child>` — a folder no listing returns, so the
    // diagram was in no tree at all while still counting everywhere.
    expect(meta.folderId).toBe(parent);
    expect(await p.listDiagrams(parent)).toHaveLength(1);
  });

  it('non-recursive: child FOLDERS are re-parented rather than dangling', async () => {
    const p = await offlineProvider();
    const parent = await p.createFolder('Parent', null);
    const mid = await p.createFolder('Mid', parent);
    const leaf = await p.createFolder('Leaf', mid);

    await p.deleteFolder(mid, false);

    const folders = await p.listFolders();
    expect(folders.find((f) => f.id === leaf)!.parentId).toBe(parent);
  });
});

describe('A2/STOR-04 — a silent read fallback is audible', () => {
  it('reports when a server read falls back to this tab, and still falls back', async () => {
    const p = await serverProvider();
    setFetch(async () => {
      throw new Error('backend down');
    });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    let event = 0;
    const listener = () => {
      event += 1;
    };
    window.addEventListener('axoview-server-unreachable', listener);

    // The fallback stays — a transient blip must not empty the screen with an
    // exception — but it no longer happens in silence while writes still
    // target the server.
    await expect(p.listDiagrams()).resolves.toEqual([]);

    window.removeEventListener('axoview-server-unreachable', listener);
    expect(err).toHaveBeenCalled();
    expect(event).toBe(1);
  });
});

describe('A2/STOR-01 — the server CREATE is lean, like every sibling', () => {
  it('strips pack icons and records requiredPacks on the first write', async () => {
    const p = await serverProvider();
    const bodies: unknown[] = [];
    setFetch(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return mockResponse({ id: 'server-1' });
    });

    await p.createDiagram(
      {
        title: 'New',
        icons: [
          { id: 'aws-ec2', name: 'EC2', url: 'data:x', collection: 'aws' },
          { id: 'mine', name: 'Mine', url: 'data:y', collection: 'imported' }
        ],
        items: [{ id: 'n1', name: 'N', icon: 'aws-ec2' }],
        views: []
      },
      null
    );

    const body = bodies[0] as { icons: unknown[]; requiredPacks: string[] };
    // It used to POST the whole catalog with no pack hint, and only the NEXT
    // save wrote the lean shape — which is how the drift stayed invisible.
    expect(body.icons).toHaveLength(1);
    expect(body.requiredPacks).toEqual(['aws']);
  });
});

describe('A2/STOR-16 — a failed manifest save is reported, not written locally', () => {
  it('rejects instead of resolving into localStorage', async () => {
    const p = await serverProvider();
    setFetch(async () => mockResponse({ error: 'nope' }, 500));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(p.saveTreeManifest({ folders: [] })).rejects.toThrow();

    // The local copy used to win the next healthy read, silently reverting the
    // user's ordering — the read and write halves fell back to the same store
    // with opposite authority.
    expect(localStorage.getItem('axoview-tree-manifest')).toBeNull();
  });

  it('clears a stale local copy when a save later succeeds', async () => {
    localStorage.setItem('axoview-tree-manifest', JSON.stringify({ folders: [] }));
    const p = await serverProvider();
    setFetch(async () => mockResponse({}, 200));
    await p.saveTreeManifest({ folders: [] });
    expect(localStorage.getItem('axoview-tree-manifest')).toBeNull();
  });
});
