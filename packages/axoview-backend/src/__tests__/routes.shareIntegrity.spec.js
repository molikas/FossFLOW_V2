/**
 * routes.shareIntegrity.spec.js — promoted from the 2026-07 exploratory lane
 * (`__explore__/S2`) when wave 2 fixed the S2 block.
 *
 * The existing `routes.share.spec.js` covers one request at a time against a
 * well-formed document. Everything here is about what the route layer does when
 * that assumption breaks: a second concurrent request, a reserved id, a body
 * that carries a field the server owns, or a source diagram that has since been
 * trashed.
 *
 * SHARE-01 a save must not eat `shareUuid`     SHARE-02 reserved ids are reserved
 * SHARE-03 folder writes serialise             SHARE-04 shares serialise
 * SHARE-05 a non-recursive delete cannot orphan SHARE-06 a trashed source 410s
 * SHARE-11 the snapshot carries the model      SHARE-15 server-owned fields are server-owned
 */
import {
  shareDiagram,
  unshareDiagram,
  getPublicSnapshot,
  saveDiagram,
  patchDiagram,
  deleteDiagram,
  createFolder,
  renameFolder,
  deleteFolder,
  HttpError
} from '../routes.js';
import {
  createMemoryAdapter,
  decodeJson,
  putJson,
  makeCtx
} from './helpers/memoryAdapter.js';

async function expectHttpError(promise, status, messageMatcher) {
  let caught;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(HttpError);
  expect(caught.status).toBe(status);
  if (messageMatcher instanceof RegExp) {
    expect(caught.body.error).toMatch(messageMatcher);
  }
}

const seedDiagram = (adapter, id, extra = {}) =>
  putJson(adapter, `diagrams/${id}`, {
    id,
    name: 'N',
    title: 'T',
    items: [],
    views: [],
    icons: [],
    colors: [],
    ...extra
  });

// ---------------------------------------------------------------------------
// SHARE-01 — the first autosave after sharing used to orphan the snapshot
// ---------------------------------------------------------------------------
describe('a whole-document save preserves the fields the server owns', () => {
  test('PUT does not drop shareUuid, so unshare can still reach the snapshot', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1');
    const { body: shared } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' } })
    );
    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBe(shared.uuid);

    // The app's autosave body: a `modelSchema` document with no shareUuid —
    // it is a backend-only field, so the client never sends it.
    await saveDiagram(
      adapter,
      makeCtx({
        params: { id: 'd1' },
        body: { title: 'T', items: [], views: [], icons: [], colors: [] }
      })
    );

    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBe(shared.uuid);
    await unshareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(decodeJson(adapter, `public/${shared.uuid}`)).toBeNull();
  });

  test('`created` survives a save too', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1', { created: '2020-01-01T00:00:00.000Z' });
    await saveDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: { title: 'T2' } })
    );
    expect(decodeJson(adapter, 'diagrams/d1').created).toBe(
      '2020-01-01T00:00:00.000Z'
    );
  });

  test('a save still replaces everything else (it is not a merge)', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1', { description: 'gone after the replace' });
    await saveDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: { title: 'T2' } })
    );
    const stored = decodeJson(adapter, 'diagrams/d1');
    expect(stored.title).toBe('T2');
    expect(stored.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SHARE-15 — `shareUuid` cannot be aimed at someone else's snapshot
// ---------------------------------------------------------------------------
describe('server-owned fields are not writable by a client', () => {
  test('a PATCH cannot point one diagram at another share link', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'victim');
    seedDiagram(adapter, 'impostor');
    const { body: victimShare } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'victim' } })
    );

    await patchDiagram(
      adapter,
      makeCtx({
        params: { id: 'impostor' },
        body: { shareUuid: victimShare.uuid, name: 'renamed' }
      })
    );

    // The rename landed; the borrowed uuid did not.
    const impostor = decodeJson(adapter, 'diagrams/impostor');
    expect(impostor.name).toBe('renamed');
    expect(impostor.shareUuid).toBeUndefined();
    // …and the victim's link is untouched.
    expect(decodeJson(adapter, `public/${victimShare.uuid}`)).not.toBeNull();
  });

  test('a cascade refuses a snapshot whose sourceId names another diagram', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'victim');
    const { body: victimShare } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'victim' } })
    );
    // A document written by an older build, carrying a borrowed uuid.
    seedDiagram(adapter, 'impostor', { shareUuid: victimShare.uuid });

    await deleteDiagram(adapter, makeCtx({ params: { id: 'impostor' } }));

    expect(decodeJson(adapter, `public/${victimShare.uuid}`)).not.toBeNull();
    expect(decodeJson(adapter, 'diagrams/victim').shareUuid).toBe(
      victimShare.uuid
    );
  });

  test('the owner CAN still delete its own snapshot (not a blanket refusal)', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1');
    const { body: shared } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' } })
    );
    await deleteDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(decodeJson(adapter, `public/${shared.uuid}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SHARE-02 — reserved storage keys
// ---------------------------------------------------------------------------
describe('reserved storage keys are not valid diagram ids', () => {
  // The fs adapter flattens `diagrams/<id>` to `<STORAGE_PATH>/<id>.json`, so
  // these four resolve to the same files the folder tree and manifests live in.
  // (The memory adapter used here keeps them in separate map slots, which is
  // exactly why the guard belongs in the route layer, above both.)
  test.each(['folders', 'tree-manifest', 'metadata', 'diagrams-index'])(
    '"%s" is rejected as a diagram id',
    async (id) => {
      const adapter = createMemoryAdapter();
      await expectHttpError(
        saveDiagram(adapter, makeCtx({ params: { id }, body: {} })),
        400,
        /reserved/
      );
    }
  );

  test('an ordinary id is still accepted', async () => {
    const adapter = createMemoryAdapter();
    const res = await saveDiagram(
      adapter,
      makeCtx({ params: { id: 'folders-overview' }, body: { title: 'x' } })
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// SHARE-03 / SHARE-04 — read-modify-write races
// ---------------------------------------------------------------------------
describe('concurrent writes do not lose one another', () => {
  test('two concurrent folder creates both land', async () => {
    const adapter = createMemoryAdapter();
    await Promise.all([
      createFolder(adapter, makeCtx({ body: { name: 'A' } })),
      createFolder(adapter, makeCtx({ body: { name: 'B' } }))
    ]);
    const folders = decodeJson(adapter, 'folders');
    expect(folders.map((f) => f.name).sort()).toEqual(['A', 'B']);
  });

  test('a concurrent rename + create keeps both changes', async () => {
    const adapter = createMemoryAdapter();
    const { body: made } = await createFolder(
      adapter,
      makeCtx({ body: { name: 'Original' } })
    );
    await Promise.all([
      renameFolder(
        adapter,
        makeCtx({ params: { id: made.id }, body: { name: 'Renamed' } })
      ),
      createFolder(adapter, makeCtx({ body: { name: 'New' } }))
    ]);
    const folders = decodeJson(adapter, 'folders');
    expect(folders.map((f) => f.name).sort()).toEqual(['New', 'Renamed']);
  });

  test('two concurrent shares publish ONE snapshot, and it is the recorded one', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1');

    const [a, b] = await Promise.all([
      shareDiagram(adapter, makeCtx({ params: { id: 'd1' } })),
      shareDiagram(adapter, makeCtx({ params: { id: 'd1' } }))
    ]);

    expect(a.body.uuid).toBe(b.body.uuid);
    const published = await adapter.list('public');
    expect(published).toHaveLength(1);
    expect(decodeJson(adapter, 'diagrams/d1').shareUuid).toBe(a.body.uuid);

    // …and unsharing really takes the only link down.
    await unshareDiagram(adapter, makeCtx({ params: { id: 'd1' } }));
    expect(await adapter.list('public')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SHARE-05 — a non-recursive delete cannot strand a subtree
// ---------------------------------------------------------------------------
describe('deleting a folder that has children', () => {
  const seedTree = (adapter) =>
    putJson(adapter, 'folders', [
      { id: 'parent', name: 'Parent', parentId: null },
      { id: 'child', name: 'Child', parentId: 'parent' },
      { id: 'grandchild', name: 'Grandchild', parentId: 'child' }
    ]);

  test('a non-recursive delete is refused rather than orphaning them', async () => {
    const adapter = createMemoryAdapter();
    seedTree(adapter);
    seedDiagram(adapter, 'inside', { folderId: 'child' });

    await expectHttpError(
      deleteFolder(
        adapter,
        makeCtx({ params: { id: 'parent' }, query: { recursive: 'false' } })
      ),
      409,
      /not empty/i
    );

    // Nothing moved, nothing was swept.
    expect(decodeJson(adapter, 'folders')).toHaveLength(3);
    expect(decodeJson(adapter, 'diagrams/inside')).not.toBeNull();
  });

  test('a LEAF folder still deletes non-recursively, sweeping its diagrams', async () => {
    const adapter = createMemoryAdapter();
    seedTree(adapter);
    seedDiagram(adapter, 'inside', { folderId: 'grandchild' });

    await deleteFolder(
      adapter,
      makeCtx({ params: { id: 'grandchild' }, query: { recursive: 'false' } })
    );

    expect(decodeJson(adapter, 'folders').map((f) => f.id).sort()).toEqual([
      'child',
      'parent'
    ]);
    expect(decodeJson(adapter, 'diagrams/inside')).toBeNull();
  });

  test('the recursive branch is unchanged', async () => {
    const adapter = createMemoryAdapter();
    seedTree(adapter);
    seedDiagram(adapter, 'inside', { folderId: 'child' });

    await deleteFolder(
      adapter,
      makeCtx({ params: { id: 'parent' }, query: { recursive: 'true' } })
    );

    expect(decodeJson(adapter, 'folders')).toHaveLength(0);
    expect(decodeJson(adapter, 'diagrams/inside')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SHARE-06 — a trashed source stops resolving
// ---------------------------------------------------------------------------
describe('a share link follows its source into the trash', () => {
  test('a soft-deleted diagram answers 410, not its contents', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1');
    const { body: shared } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' } })
    );

    // The soft delete an API client (or a wired-up trash UI — A4/FEX-02) sends.
    await patchDiagram(
      adapter,
      makeCtx({
        params: { id: 'd1' },
        body: { deletedAt: '2026-07-30T00:00:00.000Z' }
      })
    );

    await expectHttpError(
      getPublicSnapshot(adapter, makeCtx({ params: { uuid: shared.uuid } })),
      410
    );
  });

  test('restoring the diagram restores the link', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1', { deletedAt: '2026-07-30T00:00:00.000Z' });
    // Publish it while live, then trash and restore around the read.
    putJson(adapter, 'diagrams/d1', {
      id: 'd1',
      name: 'N',
      title: 'T',
      items: [],
      views: [],
      icons: [],
      colors: []
    });
    const { body: shared } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' } })
    );
    await patchDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: { deletedAt: '2026-07-30T00:00:00.000Z' } })
    );
    await patchDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' }, body: { deletedAt: null } })
    );

    const res = await getPublicSnapshot(
      adapter,
      makeCtx({ params: { uuid: shared.uuid } })
    );
    expect(res.status).toBe(200);
  });

  test('publishing something already in the trash is refused', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1', { deletedAt: '2026-07-30T00:00:00.000Z' });
    await expectHttpError(
      shareDiagram(adapter, makeCtx({ params: { id: 'd1' } })),
      409,
      /deleted/i
    );
  });
});

// ---------------------------------------------------------------------------
// SHARE-11 — the snapshot carries the whole model, not a stale whitelist
// ---------------------------------------------------------------------------
describe('the public snapshot keeps what the viewer needs', () => {
  test('requiredPacks, description and version survive', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1', {
      description: 'the description',
      version: '1.0',
      // ADR 0003 lean-save: the pack icon is stripped from `icons` and the pack
      // recorded here, so this field is the ONLY way the viewer can resolve it.
      requiredPacks: ['aws'],
      items: [{ id: 'i1', icon: 'aws-ec2' }],
      icons: []
    });

    const { body: shared } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' } })
    );
    const snapshot = decodeJson(adapter, `public/${shared.uuid}`);

    expect(snapshot.requiredPacks).toEqual(['aws']);
    expect(snapshot.description).toBe('the description');
    expect(snapshot.version).toBe('1.0');
  });

  test('a field added to the model later is carried, not silently dropped', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1', { somethingAddedLater: { nested: true } });
    const { body: shared } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' } })
    );
    expect(
      decodeJson(adapter, `public/${shared.uuid}`).somethingAddedLater
    ).toEqual({ nested: true });
  });

  test('server-owned and workspace-only fields are NOT published', async () => {
    const adapter = createMemoryAdapter();
    seedDiagram(adapter, 'd1', {
      folderId: 'folder_secret',
      created: '2020-01-01T00:00:00.000Z',
      deletedAt: null
    });
    const { body: shared } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' } })
    );
    const snapshot = decodeJson(adapter, `public/${shared.uuid}`);

    expect(snapshot.folderId).toBeUndefined();
    expect(snapshot.created).toBeUndefined();
    expect(snapshot.deletedAt).toBeUndefined();
    expect(snapshot.shareUuid).toBeUndefined();
    expect(snapshot.id).toBeUndefined();
    // The back-reference the cascades and the trashed gate need IS present.
    expect(snapshot.sourceId).toBe('d1');
  });

  test('a malformed stored document still yields a loadable snapshot', async () => {
    const adapter = createMemoryAdapter();
    putJson(adapter, 'diagrams/d1', { id: 'd1', items: 'not-an-array' });
    const { body: shared } = await shareDiagram(
      adapter,
      makeCtx({ params: { id: 'd1' } })
    );
    const snapshot = decodeJson(adapter, `public/${shared.uuid}`);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.title).toBe('Untitled Diagram');
  });
});
