/**
 * S2 / SHARE-03, SHARE-05 — folders.json as a single mutable document.
 *
 * Every folder route reads the whole array, mutates a copy and writes it back;
 * nothing versions or locks it. SHARE-03 is what two requests do to each other.
 * SHARE-05 is what one request does to the rows it did not select.
 */
import * as routes from '../../routes.js';
import {
  createMemoryAdapter,
  decodeJson,
  makeCtx,
  putJson
} from '../../__tests__/helpers/memoryAdapter.js';

describe('SHARE-03 — concurrent folder writes lose one another', () => {
  test('CHARACTERIZATION: two concurrent createFolder calls leave ONE folder', async () => {
    const adapter = createMemoryAdapter();
    // --- precondition: no folders.json yet ---
    expect(decodeJson(adapter, 'folders')).toBeNull();

    const [a, b] = await Promise.all([
      routes.createFolder(adapter, makeCtx({ body: { name: 'Work' } })),
      routes.createFolder(adapter, makeCtx({ body: { name: 'Personal' } }))
    ]);
    // Both requests reported success with distinct ids...
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);

    // ...and only one folder exists.
    const stored = decodeJson(adapter, 'folders');
    expect(stored).toHaveLength(1);
    const listed = (await routes.listFolders(adapter, makeCtx({}))).body;
    expect(listed).toHaveLength(1);
  });

  test('CHARACTERIZATION: a concurrent rename + create drops the rename', async () => {
    const adapter = createMemoryAdapter();
    putJson(adapter, 'folders', [{ id: 'f1', name: 'Old', parentId: null }]);
    expect(decodeJson(adapter, 'folders')[0].name).toBe('Old'); // precondition

    await Promise.all([
      routes.renameFolder(adapter, makeCtx({ params: { id: 'f1' }, body: { name: 'New' } })),
      routes.createFolder(adapter, makeCtx({ body: { name: 'Added' } }))
    ]);

    const stored = decodeJson(adapter, 'folders');
    // The create won the write; the rename is gone even though it returned 200.
    expect(stored.map((f) => f.name).sort()).toEqual(['Added', 'Old']);
  });

  test('CONTROL: the same two calls made sequentially both land', async () => {
    const adapter = createMemoryAdapter();
    await routes.createFolder(adapter, makeCtx({ body: { name: 'Work' } }));
    await routes.createFolder(adapter, makeCtx({ body: { name: 'Personal' } }));
    expect(decodeJson(adapter, 'folders')).toHaveLength(2);
  });

  test('SHOULD: concurrent creates should both survive (currently fails)', async () => {
    const adapter = createMemoryAdapter();
    await Promise.all([
      routes.createFolder(adapter, makeCtx({ body: { name: 'Work' } })),
      routes.createFolder(adapter, makeCtx({ body: { name: 'Personal' } }))
    ]);
    let failed = false;
    try {
      expect(decodeJson(adapter, 'folders')).toHaveLength(2);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});

describe('SHARE-05 — a non-recursive folder delete orphans its subtree', () => {
  /**
   * Reachable from the product: `useFileTree` calls
   * `deleteFolder(id, recursive)` and `LocalStorageProvider.serverDeleteFolder`
   * forwards it as `?recursive=<bool>`, so a non-recursive delete is a real
   * request shape, not a synthetic one.
   */
  test('CHARACTERIZATION: children keep a parentId naming a folder that no longer exists, and their diagrams survive unswept', async () => {
    const adapter = createMemoryAdapter();
    putJson(adapter, 'folders', [
      { id: 'parent', name: 'Parent', parentId: null },
      { id: 'child', name: 'Child', parentId: 'parent' },
      { id: 'grandchild', name: 'Grandchild', parentId: 'child' }
    ]);
    putJson(adapter, 'diagrams/inChild', { id: 'inChild', name: 'In child', folderId: 'child' });
    putJson(adapter, 'diagrams/inParent', { id: 'inParent', name: 'In parent', folderId: 'parent' });
    // --- preconditions ---
    expect(decodeJson(adapter, 'folders')).toHaveLength(3);
    expect((await adapter.listDiagramMeta()).map((d) => d.id).sort()).toEqual([
      'inChild',
      'inParent'
    ]);

    const res = await routes.deleteFolder(
      adapter,
      makeCtx({ params: { id: 'parent' }, query: {} })
    );
    expect(res.status).toBe(200);

    const folders = decodeJson(adapter, 'folders');
    const ids = folders.map((f) => f.id);
    expect(ids).not.toContain('parent');
    // The subtree is still there, rooted at nothing.
    expect(ids.sort()).toEqual(['child', 'grandchild']);
    const dangling = folders.filter(
      (f) => f.parentId !== null && !ids.includes(f.parentId)
    );
    expect(dangling.map((f) => f.id)).toEqual(['child']);

    // The sweep only covered folderId ∈ {parent}: the child's diagram survives
    // pointing at a folder that is unreachable from the root.
    const left = (await adapter.listDiagramMeta()).map((d) => d.id).sort();
    expect(left).toEqual(['inChild']);
    expect(decodeJson(adapter, 'diagrams/inChild').folderId).toBe('child');
  });

  test('CHARACTERIZATION: a shared diagram in the orphaned subtree keeps its public snapshot', async () => {
    const adapter = createMemoryAdapter();
    putJson(adapter, 'folders', [
      { id: 'parent', name: 'Parent', parentId: null },
      { id: 'child', name: 'Child', parentId: 'parent' }
    ]);
    putJson(adapter, 'diagrams/shared', {
      id: 'shared',
      name: 'Shared',
      folderId: 'child',
      title: 'Shared',
      items: [],
      views: [],
      icons: [],
      colors: []
    });
    const { body } = await routes.shareDiagram(adapter, makeCtx({ params: { id: 'shared' } }));
    expect(decodeJson(adapter, `public/${body.uuid}`)).not.toBeNull(); // precondition

    await routes.deleteFolder(adapter, makeCtx({ params: { id: 'parent' }, query: {} }));

    // Still published, and now inside a subtree the tree cannot render.
    expect(
      (await routes.getPublicSnapshot(adapter, makeCtx({ params: { uuid: body.uuid } }))).status
    ).toBe(200);
  });

  test('CONTROL: the recursive form removes the subtree AND sweeps its diagrams', async () => {
    const adapter = createMemoryAdapter();
    putJson(adapter, 'folders', [
      { id: 'parent', name: 'Parent', parentId: null },
      { id: 'child', name: 'Child', parentId: 'parent' },
      { id: 'grandchild', name: 'Grandchild', parentId: 'child' }
    ]);
    putJson(adapter, 'diagrams/inChild', { id: 'inChild', name: 'x', folderId: 'child' });

    await routes.deleteFolder(
      adapter,
      makeCtx({ params: { id: 'parent' }, query: { recursive: 'true' } })
    );

    expect(decodeJson(adapter, 'folders')).toEqual([]);
    expect(await adapter.listDiagramMeta()).toEqual([]);
  });
});
