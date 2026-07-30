/**
 * A2 — the local place and the lean-save helper.
 *
 * STOR-01 (server create skips leanIfModel), STOR-03 (non-empty folder delete
 * orphans its diagrams), STOR-04 (silent read fallback vs throwing write),
 * STOR-05 (unguarded list parses brick the tree), STOR-06 (non-atomic
 * blob-then-index write), STOR-07 (only some session writers announce
 * themselves), STOR-14 (leanIfModel is stricter than ADR 0003).
 *
 * Fetch-mock + provider-factory shape copied from
 * `services/storage/__tests__/LocalStorageProvider.test.ts` so the two read the
 * same way.
 */
import { LocalStorageProvider } from '../../services/storage/providers/LocalStorageProvider';
import { leanIfModel } from '../../services/storage/leanModel';

const BASE = 'http://localhost:3001';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

/** Records every request and answers each with `answer(call)`. */
function recordFetch(answer: (call: FetchCall) => Response | Error = () => mockResponse({ id: 'srv-1' })) {
  const calls: FetchCall[] = [];
  (global as unknown as { fetch: unknown }).fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    };
    calls.push(call);
    const r = answer(call);
    if (r instanceof Error) throw r;
    return r;
  };
  return calls;
}

function serverProvider(): LocalStorageProvider {
  const p = new LocalStorageProvider(BASE);
  p.usingServer = true;
  return p;
}
function sessionProvider(): LocalStorageProvider {
  const p = new LocalStorageProvider(BASE);
  p.usingServer = false;
  return p;
}

/** A model carrying one imported icon and two pack icons referenced by items. */
const FAT_MODEL = () => ({
  title: 'Fat',
  items: [{ id: 'n1', icon: 'aws-ec2' }],
  views: [],
  icons: [
    { id: 'aws-ec2', name: 'EC2', collection: 'aws', url: 'data:image/svg+xml;base64,AAA' },
    { id: 'iso-block', name: 'Block', collection: 'isoflow', url: 'data:image/svg+xml;base64,BBB' },
    { id: 'my-logo', name: 'Logo', collection: 'imported', url: 'data:image/png;base64,CCC' }
  ]
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  (global as unknown as { fetch: unknown }).fetch = undefined;
});

// ---------------------------------------------------------------------------
// STOR-01 — `serverSaveDiagram` wraps its body in `leanIfModel(data)`;
// `serverCreateDiagram` does not. Session create does (it routes through
// sessionSaveDiagram), and both Drive paths do.
// ---------------------------------------------------------------------------
describe('STOR-01 — the server create path is the only write that skips lean-save', () => {
  it('characterization: create POSTs the full catalog, the very next save PUTs it lean', async () => {
    const calls = recordFetch();
    const p = serverProvider();

    const id = await p.createDiagram(FAT_MODEL(), null);
    // PRECONDITION: the create really happened and we captured its body.
    expect(id).toBe('srv-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');

    const posted = calls[0].body as { icons: unknown[]; requiredPacks?: unknown };
    expect(posted.icons).toHaveLength(3);          // nothing stripped
    expect(posted.requiredPacks).toBeUndefined();  // no pack hint recorded

    // The same model through saveDiagram — one keystroke later — is lean.
    await p.saveDiagram(id, FAT_MODEL());
    const put = calls[1].body as { icons: Array<{ id: string }>; requiredPacks: string[] };
    expect(calls[1].method).toBe('PUT');
    expect(put.icons.map((i) => i.id)).toEqual(['my-logo']);
    expect(put.requiredPacks).toEqual(['aws']);
  });

  it('control: the SESSION create is lean, so the drift is server-create-only', async () => {
    const p = sessionProvider();
    const id = await p.createDiagram(FAT_MODEL(), null);
    const raw = sessionStorage.getItem(`axoview_diagram_${id}`);
    expect(raw).not.toBeNull(); // precondition
    const blob = JSON.parse(raw!) as { icons: Array<{ id: string }>; requiredPacks: string[] };
    expect(blob.icons.map((i) => i.id)).toEqual(['my-logo']);
    expect(blob.requiredPacks).toEqual(['aws']);
  });

  it.failing('STOR-01: the server create persists a lean blob like every other write', async () => {
    const calls = recordFetch();
    await serverProvider().createDiagram(FAT_MODEL(), null);
    expect(calls).toHaveLength(1); // precondition
    const posted = calls[0].body as { icons: Array<{ id: string }> };
    // Expected: ADR 0003 applies to every persist call site. Actual: the POST
    // body is `data` (plus folderId), never passed through leanIfModel.
    expect(posted.icons.map((i) => i.id)).toEqual(['my-logo']);
  });
});

// ---------------------------------------------------------------------------
// STOR-14 — ADR 0003 and the lib's `stripDefaultIcons` both keep "custom icons
// (unknown id) and overridden defaults (same id, different metadata)". The
// app-side `leanIfModel` — the helper every SAVE goes through — keeps only
// `collection === 'imported'`.
// ---------------------------------------------------------------------------
describe('STOR-14 — leanIfModel discards icons ADR 0003 calls user data', () => {
  it('characterization: a non-imported icon with an id no bundle knows is dropped', () => {
    const model = {
      title: 'T',
      items: [{ id: 'n1', icon: 'legacy-pack-icon' }],
      views: [],
      icons: [
        // Unknown id, non-imported collection: ADR 0003 → "preserved verbatim"
        // (it cannot be rehydrated, because no pack supplies it).
        { id: 'legacy-pack-icon', name: 'Legacy', collection: 'retired-pack', url: 'data:image/svg+xml;base64,AAA' },
        { id: 'my-logo', name: 'Logo', collection: 'imported', url: 'data:image/png;base64,CCC' }
      ]
    };
    const lean = leanIfModel(model) as { icons: Array<{ id: string }>; requiredPacks: string[] };
    // PRECONDITION: the helper did run (it returns the input unchanged when the
    // shape is not a model blob, which would make the assertion vacuous).
    expect(lean).not.toBe(model);
    expect(lean.icons.map((i) => i.id)).toEqual(['my-logo']);
    // The pack is recorded as required — but nothing can serve it, so the icon
    // is a tombstone on next load.
    expect(lean.requiredPacks).toEqual(['retired-pack']);
  });

  it.failing('STOR-14: an override of a bundled icon survives the save-side strip', () => {
    // ADR 0003 acceptance criterion, verbatim: "model with icons[0] = bundled
    // fixture but `name` changed → fixture is preserved (override wins)". The
    // lib's stripDefaultIcons implements exactly that (compares name/url/
    // collection/isIsometric against the bundle); leanIfModel never looks.
    const model = {
      title: 'T',
      items: [{ id: 'n1', icon: 'iso-block' }],
      views: [],
      icons: [
        { id: 'iso-block', name: 'MY RENAMED BLOCK', collection: 'isoflow', url: 'data:image/svg+xml;base64,MINE' }
      ]
    };
    const lean = leanIfModel(model) as { icons: Array<{ id: string }> };
    expect(lean).not.toBe(model); // precondition
    expect(lean.icons.map((i) => i.id)).toEqual(['iso-block']);
  });
});

// ---------------------------------------------------------------------------
// STOR-03 — `localDeleteFolder(id, false)` drops the folder row and nothing
// else. The diagrams that named it keep `folderId: '<deleted>'`.
// ---------------------------------------------------------------------------
describe('STOR-03 — deleting a non-empty session folder orphans its diagrams', () => {
  async function seedFolderWithDiagram() {
    const p = sessionProvider();
    const folderId = await p.createFolder('Work', null);
    const diagramId = await p.createDiagram({ title: 'Inside', items: [], views: [], icons: [] }, folderId);
    // PRECONDITION: the diagram really is filed under the folder.
    expect(await p.listDiagrams(folderId)).toHaveLength(1);
    return { p, folderId, diagramId };
  }

  it('characterization: the diagram survives with a dangling folderId and no listing shows it', async () => {
    const { p, folderId, diagramId } = await seedFolderWithDiagram();

    await p.deleteFolder(folderId, false);

    // The folder is gone…
    expect((await p.listFolders()).map((f) => f.id)).not.toContain(folderId);
    // …the diagram is not, and still points at it.
    const all = await p.listDiagrams();
    expect(all.map((d) => d.id)).toContain(diagramId);
    expect(all.find((d) => d.id === diagramId)!.folderId).toBe(folderId);
    // Neither the root listing nor any live folder's listing contains it, so a
    // tree built from these two calls cannot render it anywhere.
    expect((await p.listDiagrams(null)).map((d) => d.id)).not.toContain(diagramId);
    // …while its bytes are still on the session budget.
    expect(sessionStorage.getItem(`axoview_diagram_${diagramId}`)).not.toBeNull();
  });

  it.failing('STOR-03: deleting a folder leaves no diagram pointing at it', async () => {
    const { p, folderId, diagramId } = await seedFolderWithDiagram();
    await p.deleteFolder(folderId, false);
    const all = await p.listDiagrams();
    expect(all.find((d) => d.id === diagramId)!.folderId).not.toBe(folderId);
  });

  it.failing('STOR-03: a recursive delete removes the diagrams inside too', async () => {
    const { p, folderId, diagramId } = await seedFolderWithDiagram();
    await p.deleteFolder(folderId, true);
    // Expected: `recursive: true` means the contents go. Actual: the recursive
    // branch only widens the FOLDER sweep (it collects child folders); no
    // branch of localDeleteFolder ever touches a diagram.
    expect((await p.listDiagrams()).map((d) => d.id)).not.toContain(diagramId);
  });
});

// ---------------------------------------------------------------------------
// STOR-04 — reads swallow every server error and answer from sessionStorage;
// writes don't. Neither tells anybody.
// ---------------------------------------------------------------------------
describe('STOR-04 — a server outage silently replaces the workspace with an empty one', () => {
  it('characterization: the read reports an empty workspace, the write throws, nothing is logged', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const p = serverProvider();

    // The server has two diagrams and is momentarily unreachable.
    recordFetch(() => new Error('ECONNRESET'));

    const listed = await p.listDiagrams();
    // The user's workspace now reads as empty rather than as unavailable…
    expect(listed).toEqual([]);
    // …with no diagnostic of any kind.
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    // The paired write, on the same provider in the same state, does throw —
    // so the two halves disagree about whether the backend exists.
    await expect(p.saveDiagram('d1', { title: 'x', items: [], views: [], icons: [] }))
      .rejects.toThrow();

    warn.mockRestore();
    error.mockRestore();
  });

  it.failing('STOR-04: a failed listing surfaces the failure instead of an empty list', async () => {
    const p = serverProvider();
    recordFetch(() => new Error('ECONNRESET'));
    // Expected: either a rejection the caller can render, or at minimum a
    // console diagnostic. Actual: a bare `catch { return session… }`.
    await expect(p.listDiagrams()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// STOR-05 — every session/local READ parses raw JSON unguarded.
// ---------------------------------------------------------------------------
describe('STOR-05 — one corrupt entry throws through every listing', () => {
  it('characterization: a corrupt index/folder/manifest value throws, unlike the guarded blob parse', async () => {
    const p = sessionProvider();

    sessionStorage.setItem('axoview_diagrams', '[{"id":');
    await expect(p.listDiagrams()).rejects.toThrow(SyntaxError);

    localStorage.setItem('axoview-folders', '[{');
    await expect(p.listFolders()).rejects.toThrow(SyntaxError);

    localStorage.setItem('axoview-tree-manifest', 'not json');
    await expect(p.getTreeManifest()).rejects.toThrow(SyntaxError);

    // The contrast: the ONE parse in this file that is wrapped survives a
    // corrupt value and still applies the listing-level rename.
    sessionStorage.setItem('axoview_diagrams', JSON.stringify([{ id: 'd1', name: 'Old', folderId: null, lastModified: 'x' }]));
    sessionStorage.setItem('axoview_diagram_d1', '{"corrupt');
    await expect(p.renameDiagram('d1', 'New')).resolves.toBeUndefined();
    expect(JSON.parse(sessionStorage.getItem('axoview_diagrams')!)[0].name).toBe('New');
  });

  it.failing('STOR-05: a corrupt session index degrades to an empty listing', async () => {
    const p = sessionProvider();
    sessionStorage.setItem('axoview_diagrams', '[{"id":');
    // Expected: the same treatment the blob parse gets — swallow, carry on.
    await expect(p.listDiagrams()).resolves.toEqual([]);
  });

  it.failing('STOR-05: the server-mode fallback survives a corrupt session index', async () => {
    const p = serverProvider();
    recordFetch(() => new Error('offline'));
    sessionStorage.setItem('axoview_diagrams', '[{"id":');
    // The fallback call sits INSIDE the catch, so its throw escapes the
    // try/catch that was supposed to make listing failure-proof.
    await expect(p.listDiagrams()).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// STOR-06 — `sessionSaveDiagram` writes the blob, then the index. A quota
// failure on the second write leaves the first.
// ---------------------------------------------------------------------------
describe('STOR-06 — a quota failure mid-save orphans the blob', () => {
  /** Throws QuotaExceededError for one key only. */
  function trapKey(key: string) {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key) throw new DOMException('Quota exceeded (test trap)', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
    return () => { Storage.prototype.setItem = orig; };
  }

  it('characterization: the blob lands, the index write throws, the bytes are unreachable', async () => {
    const p = sessionProvider();
    const restore = trapKey('axoview_diagrams');
    try {
      await expect(
        p.saveDiagram('d-orphan', { title: 'Orphan', items: [], views: [], icons: [] })
      ).rejects.toThrow(/Quota/);
    } finally {
      restore();
    }

    // PRECONDITION: the trap hit the index write, not the blob write.
    expect(sessionStorage.getItem('axoview_diagram_d-orphan')).not.toBeNull();
    // No listing will ever mention it, so nothing can delete or show it.
    expect(await p.listDiagrams()).toEqual([]);
  });

  it.failing('STOR-06: a failed save leaves no bytes behind', async () => {
    const p = sessionProvider();
    const restore = trapKey('axoview_diagrams');
    try {
      await expect(
        p.saveDiagram('d-orphan', { title: 'Orphan', items: [], views: [], icons: [] })
      ).rejects.toThrow();
    } finally {
      restore();
    }
    // Expected: a save that reports failure has written nothing. Actual: the
    // blob is already committed when the index write throws.
    expect(sessionStorage.getItem('axoview_diagram_d-orphan')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// STOR-07 — `axoview-session-changed` is what the storage gauge and the
// lifecycle provider's `sessionWorkUnexported` export guard listen to.
// ---------------------------------------------------------------------------
describe('STOR-07 — only some session mutations announce themselves', () => {
  function countEvents(run: () => Promise<unknown>) {
    let n = 0;
    const handler = () => { n++; };
    window.addEventListener('axoview-session-changed', handler);
    return run().then(() => {
      window.removeEventListener('axoview-session-changed', handler);
      return n;
    });
  }

  it('characterization: save and delete fire the event; rename, restore and move do not', async () => {
    const p = sessionProvider();
    const id = await p.createDiagram({ title: 'A', items: [], views: [], icons: [] }, null);
    const folderId = await p.createFolder('F', null);
    // PRECONDITION: the event mechanism works at all.
    expect(await countEvents(() => p.saveDiagram(id, { title: 'A2', items: [], views: [], icons: [] }))).toBe(1);
    expect(await countEvents(() => p.deleteDiagram(id, true))).toBe(1);

    // Same store, same file, three writers that stay silent:
    expect(await countEvents(() => p.renameDiagram(id, 'Renamed'))).toBe(0);
    expect(await countEvents(() => p.restoreDiagram(id))).toBe(0);
    expect(await countEvents(() => p.moveItem(id, 'diagram', folderId))).toBe(0);
  });

  it.failing('STOR-07: every session write that mutates sessionStorage announces it', async () => {
    const p = sessionProvider();
    const id = await p.createDiagram({ title: 'A', items: [], views: [], icons: [] }, null);
    expect(sessionStorage.getItem(`axoview_diagram_${id}`)).not.toBeNull(); // precondition
    const before = sessionStorage.getItem('axoview_diagrams');
    const fired = await countEvents(() => p.renameDiagram(id, 'Renamed'));
    // PRECONDITION: the rename really did write (so a 0 count is the omission,
    // not a no-op).
    expect(sessionStorage.getItem('axoview_diagrams')).not.toBe(before);
    expect(fired).toBe(1);
  });
});
