/**
 * S2 / SHARE-02, SHARE-13 — two claims that can only be answered against the
 * REAL adapter and the REAL generator.
 *
 * SHARE-02 must use the fs adapter: the in-memory test double keeps
 * `diagrams/folders` and `folders` in separate map slots AND carries its own
 * RESERVED_DIAGRAM_KEYS filter, so the collision is invisible there. The fs
 * adapter flattens `diagrams/<id>` to `<STORAGE_PATH>/<id>.json` — the same file
 * the `folders` key resolves to. (That divergence between the double and
 * production is itself worth knowing.)
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import * as routes from '../../routes.js';
import { createFsAdapter } from '../../adapters/fs.js';
import { makeCtx } from '../../__tests__/helpers/memoryAdapter.js';

let dir;
let adapter;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axoview-explore-s2-'));
  adapter = createFsAdapter(dir);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const RESERVED = ['folders', 'tree-manifest', 'metadata', 'diagrams-index'];

describe('SHARE-02 — a diagram id can be a reserved storage key', () => {
  test('CHARACTERIZATION: PUT /api/diagrams/folders overwrites the whole folder tree', async () => {
    // A real folder tree first.
    await routes.createFolder(adapter, makeCtx({ body: { name: 'Work' } }));
    await routes.createFolder(adapter, makeCtx({ body: { name: 'Personal' } }));
    // --- preconditions: two folders on disk, in the file the collision targets ---
    expect((await routes.listFolders(adapter, makeCtx({}))).body).toHaveLength(2);
    expect(await fs.readFile(path.join(dir, 'folders.json'), 'utf-8')).toContain('Work');

    // `assertId` accepts 'folders' (ID_PATTERN is /^[a-zA-Z0-9_-]{1,64}$/), and
    // saveDiagram has no existence check at all — it just writes.
    const res = await routes.saveDiagram(
      adapter,
      makeCtx({
        params: { id: 'folders' },
        body: { title: 'Innocent diagram', items: [], views: [], icons: [], colors: [] }
      })
    );
    expect(res.status).toBe(200);

    // The folder tree is gone. `readFolders` coerces the diagram document to []
    // and the next folder write heals the file — by finishing the deletion.
    expect((await routes.listFolders(adapter, makeCtx({}))).body).toEqual([]);
    await routes.createFolder(adapter, makeCtx({ body: { name: 'New' } }));
    const after = (await routes.listFolders(adapter, makeCtx({}))).body;
    expect(after).toHaveLength(1);
    expect(after.map((f) => f.name)).toEqual(['New']);

    // ...and the diagram that did it is invisible in the listing, so nothing in
    // the UI can point at the cause.
    const listed = (await routes.listDiagrams(adapter, makeCtx({}))).body;
    expect(listed.map((d) => d.id)).not.toContain('folders');
  });

  test('CHARACTERIZATION: every reserved key is writable through the diagram routes', async () => {
    const accepted = [];
    for (const id of RESERVED) {
      const res = await routes.saveDiagram(
        adapter,
        makeCtx({ params: { id }, body: { title: `clobber-${id}` } })
      );
      if (res.status === 200) accepted.push(id);
    }
    expect(accepted).toEqual(RESERVED);
    // Each landed on the reserved file, not in a diagrams/ namespace.
    for (const id of RESERVED) {
      const raw = await fs.readFile(path.join(dir, `${id}.json`), 'utf-8');
      expect(raw).toContain(`clobber-${id}`);
    }
    // tree-manifest now returns a diagram document to every caller.
    const manifest = await routes.getTreeManifest(adapter);
    expect(manifest.body.title).toBe('clobber-tree-manifest');
    expect(manifest.body.folders).toBeUndefined();
  });

  test('CHARACTERIZATION: POST is blocked only by accident — the 409 comes from reading the reserved file', async () => {
    // With a folders.json present, createDiagram's existence check reads it and
    // reports "Diagram already exists" — a confusing 409 rather than a rejection.
    await routes.createFolder(adapter, makeCtx({ body: { name: 'Work' } }));
    await expect(
      routes.createDiagram(adapter, makeCtx({ body: { id: 'folders' } }))
    ).rejects.toMatchObject({ status: 409 });

    // With no folders yet, the same POST succeeds and CREATES folders.json as a
    // diagram — so the very first folder the user makes silently wipes it.
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'axoview-explore-s2b-'));
    try {
      const a2 = createFsAdapter(fresh);
      const created = await routes.createDiagram(
        a2,
        makeCtx({ body: { id: 'folders', title: 'Mine' } })
      );
      expect(created.status).toBe(201);
      expect(await fs.readFile(path.join(fresh, 'folders.json'), 'utf-8')).toContain('Mine');
      await routes.createFolder(a2, makeCtx({ body: { name: 'Work' } }));
      const gone = await routes.getDiagram(a2, makeCtx({ params: { id: 'folders' } })).catch((e) => e);
      expect(gone.title).toBeUndefined();
    } finally {
      await fs.rm(fresh, { recursive: true, force: true });
    }
  });

  test('CONTROL: the reserved names are otherwise rejected nowhere — assertId accepts them', async () => {
    // Proves the probe is exercising a validation gap, not a filesystem quirk:
    // the same ids pass the route-layer validator that rejects everything else.
    await expect(
      routes.getDiagram(adapter, makeCtx({ params: { id: 'has spaces' } }))
    ).rejects.toMatchObject({ status: 400 });
    for (const id of RESERVED) {
      // 404 (not 400) === the id passed validation and only the lookup failed.
      await expect(
        routes.getDiagram(adapter, makeCtx({ params: { id } }))
      ).rejects.toMatchObject({ status: 404 });
    }
  });
});

describe('SHARE-13 — share-uuid alphabet distribution', () => {
  test('byte % 64 over a 64-character alphabet is UNIFORM (256 is a multiple of 64)', async () => {
    // The uuid generator is private, so drive it through the route and collect
    // real outputs. 2000 uuids x 21 chars = 42000 samples over 64 buckets
    // (~656 expected each); a modulo bias with this alphabet would show up as
    // some buckets at ~2x others, which this margin catches easily.
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    expect(alphabet).toHaveLength(64);
    expect(256 % alphabet.length).toBe(0); // the arithmetic reason there is no bias

    const counts = new Map([...alphabet].map((c) => [c, 0]));
    for (let i = 0; i < 2000; i++) {
      await routes.saveDiagram(
        adapter,
        makeCtx({ params: { id: `d${i}` }, body: { title: 't' } })
      );
      const { body } = await routes.shareDiagram(
        adapter,
        makeCtx({ params: { id: `d${i}` } })
      );
      expect(body.uuid).toHaveLength(21);
      for (const ch of body.uuid) counts.set(ch, counts.get(ch) + 1);
    }
    const values = [...counts.values()];
    expect(Math.min(...values)).toBeGreaterThan(0);
    // Every bucket within ±35% of the mean — far tighter than the 2x a
    // 256-%-alphabet mismatch would produce, and loose enough not to flake.
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(Math.max(...values)).toBeLessThan(mean * 1.35);
    expect(Math.min(...values)).toBeGreaterThan(mean * 0.65);
  }, 30000);
});
