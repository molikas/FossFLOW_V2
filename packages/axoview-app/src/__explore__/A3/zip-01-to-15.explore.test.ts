/**
 * A3 — project ZIP import/export.
 *
 * `FakeStorage` is modelled on `services/project/__tests__/projectZip.test.ts`
 * so the two read the same way, with hooks the original does not need:
 * per-call failure injection, soft-delete support and call counting.
 */
import JSZip from 'jszip';
import {
  exportProject,
  parseProject,
  importProject,
  rewriteIds,
  ProjectZipError,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  ParsedProject
} from '../../services/project/projectZip';
import type {
  DiagramMeta,
  FolderMeta,
  StorageProvider,
  TreeManifest
} from '../../services/storage';

// ---------------------------------------------------------------------------
// Storage double
// ---------------------------------------------------------------------------

class FakeStorage implements StorageProvider {
  readonly id = 'local' as const;
  readonly displayName = 'Fake';
  readonly requiresAuth = false;

  diagrams = new Map<string, { meta: DiagramMeta; data: unknown }>();
  folders = new Map<string, FolderMeta>();
  manifest: TreeManifest = { folders: [] } as TreeManifest;
  private idSeq = 0;

  /** Throw on the Nth call of the named method (1-based). */
  failOn: { method: string; nth: number } | null = null;
  calls: Record<string, number> = {};

  private tick(method: string) {
    this.calls[method] = (this.calls[method] ?? 0) + 1;
    if (this.failOn && this.failOn.method === method && this.calls[method] === this.failOn.nth) {
      throw new Error(`${method} failed (injected)`);
    }
  }

  async isAvailable() { return true; }

  async listDiagrams(folderId?: string | null): Promise<DiagramMeta[]> {
    this.tick('listDiagrams');
    const all = Array.from(this.diagrams.values()).map((d) => d.meta);
    if (folderId === undefined) return all;
    return all.filter((d) => d.folderId === folderId);
  }
  async loadDiagram(id: string) {
    this.tick('loadDiagram');
    const d = this.diagrams.get(id);
    if (!d) throw new Error(`Not found: ${id}`);
    return d.data;
  }
  async saveDiagram(id: string, data: unknown) {
    this.tick('saveDiagram');
    const meta = this.diagrams.get(id)?.meta ?? {
      id, name: 'Untitled', lastModified: new Date().toISOString(), folderId: null
    };
    this.diagrams.set(id, { meta, data });
  }
  async createDiagram(data: unknown, folderId?: string | null) {
    this.tick('createDiagram');
    const id = `diagram_test_${++this.idSeq}`;
    const blob = data as { name?: string; title?: string };
    const meta: DiagramMeta = {
      id,
      name: blob?.name ?? blob?.title ?? 'Untitled Diagram',
      lastModified: new Date().toISOString(),
      folderId: folderId ?? null
    };
    this.diagrams.set(id, { meta, data });
    return id;
  }
  async deleteDiagram(id: string, soft?: boolean) {
    this.tick('deleteDiagram');
    if (soft) {
      const d = this.diagrams.get(id);
      if (d) d.meta = { ...d.meta, deletedAt: new Date().toISOString() };
      return;
    }
    this.diagrams.delete(id);
  }
  async restoreDiagram(id: string) {
    const d = this.diagrams.get(id);
    if (d) d.meta = { ...d.meta, deletedAt: undefined };
  }
  async renameDiagram(id: string, name: string) {
    const d = this.diagrams.get(id);
    if (d) d.meta = { ...d.meta, name };
  }
  async listFolders(parentId?: string | null) {
    this.tick('listFolders');
    const all = Array.from(this.folders.values());
    if (parentId === undefined) return all;
    return all.filter((f) => f.parentId === parentId);
  }
  async createFolder(name: string, parentId?: string | null) {
    this.tick('createFolder');
    const id = `folder_test_${++this.idSeq}`;
    this.folders.set(id, { id, name, parentId: parentId ?? null });
    return id;
  }
  async deleteFolder(id: string) {
    this.tick('deleteFolder');
    this.folders.delete(id);
  }
  async renameFolder(id: string, name: string) {
    const f = this.folders.get(id);
    if (f) this.folders.set(id, { ...f, name });
  }
  async moveItem() { /* unused */ }
  async getTreeManifest() { return this.manifest; }
  async saveTreeManifest(m: TreeManifest) { this.manifest = m; }
}

const model = (name: string, extra: Record<string, unknown> = {}) => ({
  title: name, name, icons: [], colors: [], items: [], views: [], ...extra
});

/** Build a ParsedProject by hand (no zip round trip needed for import probes). */
function parsedOf(opts: {
  folders?: FolderMeta[];
  diagrams?: Array<DiagramMeta & { file?: string }>;
  models?: Record<string, unknown>;
  treeManifest?: TreeManifest;
  version?: string;
}): ParsedProject {
  const diagrams = (opts.diagrams ?? []).map((d) => ({ ...d, file: d.file ?? `diagrams/${d.id}.json` }));
  return {
    manifest: {
      format: PROJECT_FORMAT,
      version: opts.version ?? PROJECT_FORMAT_VERSION,
      exportedAt: '2026-07-30T00:00:00.000Z',
      exportedBy: 'probe',
      scope: 'project',
      folders: opts.folders ?? [],
      diagrams
    },
    diagrams: new Map(Object.entries(opts.models ?? {})),
    treeManifest: opts.treeManifest
  };
}

const meta = (id: string, name: string, folderId: string | null = null, extra: Partial<DiagramMeta> = {}): DiagramMeta =>
  ({ id, name, folderId, lastModified: '2026-07-30T00:00:00.000Z', ...extra });

/** Zip a manifest + diagram files into a Blob the real parseProject can read. */
async function zipOf(manifest: unknown, files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  for (const [path, body] of Object.entries(files)) zip.file(path, body);
  return zip.generateAsync({ type: 'blob' });
}

// ---------------------------------------------------------------------------
// ZIP-01 — a folder cycle makes the import's depth walk unbounded.
// ---------------------------------------------------------------------------
describe('ZIP-01 — a folder-parent cycle makes the import walk unbounded', () => {
  /**
   * The walk is a private closure, so it is observed through the `Array.find`
   * it calls once per step. Capping the call count converts what would be a
   * hung worker into a signal — a plain timeout cannot help, because the loop
   * is synchronous and never yields.
   */
  async function importWithFindCap(parsed: ParsedProject, cap: number) {
    const real = Array.prototype.find;
    let finds = 0;
    // eslint-disable-next-line no-extend-native
    Array.prototype.find = function (this: unknown[], ...args: Parameters<typeof real>) {
      if (++finds > cap) throw new Error('FIND_CAP');
      return real.apply(this, args) as unknown;
    } as typeof real;
    try {
      await importProject({ storage: new FakeStorage() }, parsed, { destination: { kind: 'root' } });
      return { capped: false, finds };
    } catch (e) {
      if ((e as Error).message === 'FIND_CAP') return { capped: true, finds };
      throw e;
    } finally {
      // eslint-disable-next-line no-extend-native
      Array.prototype.find = real;
    }
  }

  const CYCLE = parsedOf({
    folders: [
      { id: 'fa', name: 'A', parentId: 'fb' },
      { id: 'fb', name: 'B', parentId: 'fa' }
    ]
  });
  const ACYCLIC = parsedOf({
    folders: [
      { id: 'fa', name: 'A', parentId: null },
      { id: 'fb', name: 'B', parentId: 'fa' }
    ]
  });

  it('characterization: an acyclic manifest finishes in a handful of steps, a cyclic one never does', async () => {
    // PRECONDITION: the same shape and size of manifest completes normally, so
    // the cap below is hit by the cycle and not by the instrumentation.
    const ok = await importWithFindCap(ACYCLIC, 10_000);
    expect(ok.capped).toBe(false);
    expect(ok.finds).toBeLessThan(100);

    const bad = await importWithFindCap(CYCLE, 10_000);
    expect(bad.capped).toBe(true);
  });

  it('the same file already knows the fix: rewriteIds handles the cycle without looping', () => {
    // `rewriteIds` maps parents through `idMap` with no walk, and
    // `collectFolderSubtree` (export side) carries a `seen` set — so the two
    // unguarded walks in `importProject`/`wipeWorkspace` are the outliers.
    const r = rewriteIds(CYCLE);
    expect(r.folders).toHaveLength(2);
    expect(r.folders.every((f) => f.parentId !== null)).toBe(true);
  });

  it.failing('ZIP-01: importing a cyclic manifest terminates', async () => {
    const bad = await importWithFindCap(CYCLE, 10_000);
    // Expected: refuse the manifest (or break the cycle) the way the export
    // walk does. Actual: `while (cur && cur.parentId)` climbs forever.
    expect(bad.capped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ZIP-02 — out-of-scope `link` refs keep the old id.
// ---------------------------------------------------------------------------
describe('ZIP-02 — a link to a diagram outside the zip stays pointing at the old id', () => {
  const PARTIAL = () =>
    parsedOf({
      diagrams: [meta('inzip', 'In Zip')],
      models: {
        // `modelItems.link` is the only schema field that can hold a diagram id
        // (verified against the lib schemas), and this one names a diagram the
        // folder-scope export left behind.
        inzip: model('In Zip', { items: [{ id: 'n1', name: 'N', link: 'outside-the-zip' }] })
      }
    });

  it('characterization: the rewrite leaves the foreign id verbatim and reports nothing', async () => {
    const s = new FakeStorage();
    const result = await importProject({ storage: s }, PARTIAL(), { destination: { kind: 'root' } });

    // PRECONDITION: the import really ran and really created the diagram.
    expect(result.diagramCount).toBe(1);
    const created = Array.from(s.diagrams.values())[0].data as { items: Array<{ link: string }> };

    // The in-zip diagram got a fresh id (so the rewrite pass definitely ran)…
    expect(Array.from(s.diagrams.keys())[0]).not.toBe('inzip');
    // …while the cross-diagram reference still names the source workspace's id.
    expect(created.items[0].link).toBe('outside-the-zip');
    // And nothing in the return value mentions an unresolved reference.
    expect(Object.keys(result)).toEqual(['folderCount', 'diagramCount']);
  });

  it('control: a link INSIDE the zip is rewritten, so the pass works', async () => {
    const s = new FakeStorage();
    const parsed = parsedOf({
      diagrams: [meta('a', 'A'), meta('b', 'B')],
      models: {
        a: model('A', { items: [{ id: 'n1', link: 'b' }] }),
        b: model('B')
      }
    });
    await importProject({ storage: s }, parsed, { destination: { kind: 'root' } });
    const a = Array.from(s.diagrams.values()).find(
      (d) => (d.data as { title: string }).title === 'A'
    )!.data as { items: Array<{ link: string }> };
    expect(a.items[0].link).not.toBe('b');
    expect(a.items[0].link).toMatch(/^diagram_/);
  });

  it.failing('ZIP-02: an unresolvable link is cleared or reported', async () => {
    const s = new FakeStorage();
    const result = await importProject({ storage: s }, PARTIAL(), { destination: { kind: 'root' } });
    expect(result.diagramCount).toBe(1); // precondition
    const created = Array.from(s.diagrams.values())[0].data as { items: Array<{ link?: string }> };
    // Expected: a reference the importer cannot satisfy is dropped (or at least
    // surfaced), not silently aimed at a stranger's id.
    expect(created.items[0].link).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ZIP-03 — replaceAll's wipe is not transactional.
// ---------------------------------------------------------------------------
describe('ZIP-03 — a failure mid-wipe leaves the workspace half-destroyed', () => {
  async function seeded() {
    const s = new FakeStorage();
    const f = await s.createFolder('Keep');
    await s.createDiagram(model('One'), f);
    await s.createDiagram(model('Two'), f);
    await s.createDiagram(model('Three'), null);
    s.calls = {};
    return s;
  }

  it('characterization: the first deletions stick, the import never starts, the error escapes', async () => {
    const s = await seeded();
    expect(s.diagrams.size).toBe(3); // precondition
    s.failOn = { method: 'deleteDiagram', nth: 2 };

    const parsed = parsedOf({ diagrams: [meta('new', 'New')], models: { new: model('New') } });
    await expect(
      importProject({ storage: s }, parsed, { destination: { kind: 'replaceAll' } })
    ).rejects.toThrow(/injected/);

    // One diagram is gone, two survive, the folder survives — and nothing was
    // imported, so the user has neither their old workspace nor the new one.
    expect(s.diagrams.size).toBe(2);
    expect(s.folders.size).toBe(1);
    expect(s.calls.createDiagram).toBeUndefined();
  });

  it.failing('ZIP-03: a failed replaceAll leaves the workspace as it was', async () => {
    const s = await seeded();
    s.failOn = { method: 'deleteDiagram', nth: 2 };
    const parsed = parsedOf({ diagrams: [meta('new', 'New')], models: { new: model('New') } });
    await importProject({ storage: s }, parsed, { destination: { kind: 'replaceAll' } }).catch(() => {});
    // Expected: all-or-nothing (the parse step already models this — "a failed
    // parse does not modify storage"). Actual: sequential deletes, no rollback.
    expect(s.diagrams.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ZIP-04 — does the per-entry cap actually work against the installed JSZip?
// ---------------------------------------------------------------------------
describe('ZIP-04 — the per-entry zip-bomb cap reads a private JSZip field', () => {
  it('the private field IS present and IS the real size, so the cap can fire', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_FORMAT_VERSION, diagrams: [], folders: [] }));
    zip.file('diagrams/big.json', JSON.stringify({ pad: 'x'.repeat(200_000) }));
    const blob = await zip.generateAsync({ type: 'blob' });

    const reloaded = await JSZip.loadAsync(blob);
    const entry = reloaded.file('diagrams/big.json')!;
    const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;

    // PRECONDITION: the entry really is the big one we wrote.
    const body = await entry.async('string');
    expect(body.length).toBeGreaterThan(200_000);

    // The guard is `typeof declared === 'number' && declared > MAX_ENTRY_BYTES`.
    // Against jszip as installed, `declared` is a number equal to the real
    // uncompressed size — so the guard is live, not a false green. It is still a
    // PRIVATE-API read (`_data`), which is a maintenance risk rather than a
    // present defect: if a jszip upgrade renames it, `declared` becomes
    // undefined and the cap silently stops firing with nothing to notice.
    expect(typeof declared).toBe('number');
    expect(declared).toBe(body.length);
    // eslint-disable-next-line no-console
    console.log(`[ZIP-04] _data.uncompressedSize = ${String(declared)} for a ${body.length}-byte entry — cap is live`);
  });
});

// ---------------------------------------------------------------------------
// ZIP-05 / ZIP-15 — what happens to bad diagram entries, and what gets counted.
// ---------------------------------------------------------------------------
describe('ZIP-05 / ZIP-15 — three kinds of bad diagram entry, three fates, no warning', () => {
  const BAD = () =>
    parsedOf({
      diagrams: [meta('nul', 'Null one'), meta('num', 'Number one'), meta('ok', 'Good one')],
      models: { nul: null, num: 42, ok: model('Good one') }
    });

  it('characterization: null is skipped, a non-object becomes a BLANK diagram, only the good one is real', async () => {
    const s = new FakeStorage();
    const result = await importProject({ storage: s }, BAD(), { destination: { kind: 'root' } });

    // PRECONDITION: the import ran over all three manifest entries.
    expect(BAD().manifest.diagrams).toHaveLength(3);

    // `null` → `continue`, so it is not created and not counted.
    // `42` → `{ id: undefined }` → spread to `{}` → an empty diagram, counted.
    expect(result.diagramCount).toBe(2);
    expect(s.diagrams.size).toBe(2);
    const names = Array.from(s.diagrams.values()).map((d) => d.meta.name).sort();
    expect(names).toEqual(['Good one', 'Untitled Diagram']);
    const blank = Array.from(s.diagrams.values()).find((d) => d.meta.name === 'Untitled Diagram')!;
    expect(blank.data).toEqual({});
  });

  it('ZIP-05: the toast would report 3 while the import managed 2', async () => {
    const s = new FakeStorage();
    const parsed = BAD();
    const result = await importProject({ storage: s }, parsed, { destination: { kind: 'root' } });
    // App.tsx builds its success message from `parsed.manifest.diagrams.length`
    // and discards `result` — so these two numbers are what the user is told
    // versus what happened.
    expect(parsed.manifest.diagrams.length).toBe(3);
    expect(result.diagramCount).toBe(2);
  });

  it.failing('ZIP-15: a diagram entry that is not an object is rejected', async () => {
    const s = new FakeStorage();
    const parsed = parsedOf({ diagrams: [meta('num', 'Number one')], models: { num: 42 } });
    await importProject({ storage: s }, parsed, { destination: { kind: 'root' } });
    // Expected: the same treatment unparseable JSON gets (BAD_DIAGRAM).
    // Actual: it imports as a blank diagram and is counted as a success.
    expect(s.diagrams.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ZIP-07 — trashed diagrams round-trip back to life.
// ---------------------------------------------------------------------------
describe('ZIP-07 — export→import resurrects soft-deleted diagrams', () => {
  it('characterization: a trashed diagram is exported, and imports as a live one', async () => {
    const src = new FakeStorage();
    const live = await src.createDiagram(model('Keeper'), null);
    const gone = await src.createDiagram(model('Deleted on purpose'), null);
    await src.deleteDiagram(gone, true); // soft delete = what the UI performs
    // PRECONDITION: it really is soft-deleted, and still loadable.
    expect(src.diagrams.get(gone)!.meta.deletedAt).toBeTruthy();
    expect(await src.loadDiagram(gone)).toBeTruthy();
    void live;

    const { blob } = await exportProject({ storage: src, exporterTag: 'probe' }, { scope: 'project' });
    const parsed = await parseProject(blob);
    // The trashed diagram is in the archive…
    expect(parsed.manifest.diagrams.map((d) => d.name).sort()).toEqual([
      'Deleted on purpose', 'Keeper'
    ]);

    const dest = new FakeStorage();
    await importProject({ storage: dest }, parsed, { destination: { kind: 'root' } });
    // …and lands with no deletedAt at all: back from the trash, in the tree.
    const restored = Array.from(dest.diagrams.values()).find(
      (d) => (d.data as { title: string }).title === 'Deleted on purpose'
    );
    expect(restored).toBeDefined();
    expect(restored!.meta.deletedAt).toBeUndefined();
  });

  it.failing('ZIP-07: a soft-deleted diagram is not exported', async () => {
    const src = new FakeStorage();
    await src.createDiagram(model('Keeper'), null);
    const gone = await src.createDiagram(model('Deleted on purpose'), null);
    await src.deleteDiagram(gone, true);
    expect(src.diagrams.get(gone)!.meta.deletedAt).toBeTruthy(); // precondition
    const { blob } = await exportProject({ storage: src, exporterTag: 'probe' }, { scope: 'project' });
    const parsed = await parseProject(blob);
    // Expected: the trash is not part of the project. Actual: `listDiagrams()`
    // returns it and `exportProject` never filters `deletedAt`.
    expect(parsed.manifest.diagrams.map((d) => d.name)).toEqual(['Keeper']);
  });
});

// ---------------------------------------------------------------------------
// ZIP-08 — every import failure renders the same sentence.
// ---------------------------------------------------------------------------
describe('ZIP-08 — the nine import failure codes all reach the user as one message', () => {
  /**
   * NOTE (rig trap): `expect(err).toBeInstanceOf(ProjectZipError)` FAILS here
   * even for a genuine ProjectZipError — the app's tsconfig targets es5, so
   * ts-jest downlevels `class extends Error` and the subclass prototype is
   * lost. `.name` and `.code` survive, so assert on those. rsbuild configures
   * no target/browserslist, so the shipped bundle does not downlevel this way;
   * it is a probe artifact, not a product defect. (Same family as the S1 trap
   * where a jest.mock dropped a class an `instanceof` depended on.)
   */
  const codeOf = async (blob: Blob) => {
    const err = (await parseProject(blob).catch((e) => e)) as ProjectZipError;
    expect(err.name).toBe('ProjectZipError');
    return { code: err.code, message: err.message };
  };

  it('characterization: distinct causes get distinct codes and bespoke messages', async () => {
    // A manifest with no version at all is classified as "too new".
    const noVersion = await codeOf(
      await zipOf({ format: PROJECT_FORMAT, folders: [], diagrams: [] }, {})
    );
    expect(noVersion.code).toBe('UNSUPPORTED_VERSION');
    expect(noVersion.message).toMatch(/newer Axoview \(version undefined\)/);
    expect(noVersion.message).toMatch(/please upgrade/);

    // A valid-but-incomplete archive gets its own code and message…
    const missing = await codeOf(
      await zipOf(
        { format: PROJECT_FORMAT, version: PROJECT_FORMAT_VERSION, folders: [], diagrams: [{ id: 'a', name: 'A', file: 'diagrams/a.json' }] },
        {}
      )
    );
    expect(missing.code).toBe('MISSING_DIAGRAM');

    // …and so does a non-Axoview zip.
    const wrongFormat = await codeOf(
      await zipOf({ format: 'something-else', version: '1', folders: [], diagrams: [] }, {})
    );
    expect(wrongFormat.code).toBe('BAD_FORMAT');
  });

  it('characterization: the dialog the user sees takes no error and says one thing', () => {
    // `App.tsx`'s catch is `console.error(...); setImportError(true)` — the error
    // object is dropped on the floor — and `ImportErrorDialog`'s props are
    // `{ open, onDismiss }`, with the body a constant.
    const dialogSource = require('fs').readFileSync(
      'packages/axoview-app/src/components/ImportErrorDialog.tsx',
      'utf8'
    ) as string;
    // PRECONDITION: we are reading the right file.
    expect(dialogSource).toContain('dialog-import-error');
    // No error/code/message is threaded in…
    expect(dialogSource).not.toMatch(/ProjectZipError|error|code/);
    // …and the single body line claims the file is not a valid Axoview diagram,
    // which is wrong for UNSUPPORTED_VERSION, MISSING_DIAGRAM and TOO_LARGE.
    expect(dialogSource).toContain("isn't a valid Axoview diagram");
  });

  it.failing('ZIP-08: a manifest missing its version reads as corrupt, not as too new', async () => {
    const noVersion = await codeOf(
      await zipOf({ format: PROJECT_FORMAT, folders: [], diagrams: [] }, {})
    );
    // Expected: BAD_MANIFEST — the file is broken, and telling the user to
    // upgrade an already-current app sends them nowhere. Actual: any version
    // that is not exactly '1', including absent, is "newer".
    expect(noVersion.code).toBe('BAD_MANIFEST');
  });
});

// ---------------------------------------------------------------------------
// ZIP-10 — the tree manifest is exported, parsed, and then dropped.
// ---------------------------------------------------------------------------
describe('ZIP-10 — folder ordering never survives a round trip', () => {
  it('characterization: the tree manifest is in the zip and in ParsedProject, and the import ignores it', async () => {
    const src = new FakeStorage();
    const f = await src.createFolder('Ordered');
    await src.createDiagram(model('One'), f);
    src.manifest = { folders: [{ id: f, order: 7 }] } as unknown as TreeManifest;

    // Scope it to a SINGLE diagram — the manifest is written regardless.
    const only = Array.from(src.diagrams.keys())[0];
    const { blob } = await exportProject(
      { storage: src, exporterTag: 'probe' },
      { scope: 'diagram', diagramId: only }
    );
    const parsed = await parseProject(blob);

    // PRECONDITION: the whole workspace's ordering rode along in a zip that
    // contains no folders at all.
    expect(parsed.manifest.folders).toEqual([]);
    expect(parsed.treeManifest).toEqual({ folders: [{ id: f, order: 7 }] });

    const dest = new FakeStorage();
    await importProject({ storage: dest }, parsed, { destination: { kind: 'root' } });
    // `importProject` never reads `parsed.treeManifest` and never calls
    // `saveTreeManifest` — the destination keeps its empty default.
    expect(dest.manifest).toEqual({ folders: [] });
  });

  it.failing('ZIP-10: the imported workspace receives the tree manifest from the zip', async () => {
    const src = new FakeStorage();
    const f = await src.createFolder('Ordered');
    await src.createDiagram(model('One'), f);
    src.manifest = { folders: [{ id: f, order: 7 }] } as unknown as TreeManifest;
    const { blob } = await exportProject({ storage: src, exporterTag: 'probe' }, { scope: 'project' });
    const parsed = await parseProject(blob);
    expect(parsed.treeManifest).toBeDefined(); // precondition

    const dest = new FakeStorage();
    await importProject({ storage: dest }, parsed, { destination: { kind: 'root' } });
    // Expected: ADR 0001 lists tree-manifest.json as part of the format, so an
    // importer that parses it should apply it (remapped through idMap).
    expect((dest.manifest as { folders: unknown[] }).folders).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ZIP-11 — one unreadable diagram kills the whole export.
// ---------------------------------------------------------------------------
describe('ZIP-11 — an export aborts entirely on one unreadable diagram', () => {
  it('characterization: the tree-manifest read is best-effort, the per-diagram read is not', async () => {
    const s = new FakeStorage();
    await s.createDiagram(model('One'), null);
    await s.createDiagram(model('Two'), null);
    await s.createDiagram(model('Three'), null);
    s.calls = {};

    // A single unreadable diagram (a 404 in the middle of a Drive listing, a
    // corrupt session blob) takes the whole archive with it.
    s.failOn = { method: 'loadDiagram', nth: 2 };
    await expect(
      exportProject({ storage: s, exporterTag: 'probe' }, { scope: 'project' })
    ).rejects.toThrow(/injected/);

    // Contrast, same function: getTreeManifest failing produces a zip anyway.
    const s2 = new FakeStorage();
    await s2.createDiagram(model('One'), null);
    s2.getTreeManifest = async () => { throw new Error('manifest unavailable'); };
    const out = await exportProject({ storage: s2, exporterTag: 'probe' }, { scope: 'project' });
    expect(out.blob.size).toBeGreaterThan(0);
  });

  it.failing('ZIP-11: an export skips (and reports) the diagrams it could not read', async () => {
    const s = new FakeStorage();
    await s.createDiagram(model('One'), null);
    await s.createDiagram(model('Two'), null);
    s.calls = {};
    s.failOn = { method: 'loadDiagram', nth: 1 };
    // Expected: the user gets an archive of what could be read, plus a warning
    // — losing everything because of one bad row is the worst outcome for a
    // backup gesture. Actual: the throw propagates out of exportProject.
    const out = await exportProject({ storage: s, exporterTag: 'probe' }, { scope: 'project' });
    expect(out.blob.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ZIP-12 — same-tick id minting.
// ---------------------------------------------------------------------------
describe('ZIP-12 — newId() collisions inside one import', () => {
  it('a 400-entry manifest in one tick mints no duplicate ids', () => {
    const folders: FolderMeta[] = Array.from({ length: 200 }, (_, i) => ({
      id: `f${i}`, name: `F${i}`, parentId: null
    }));
    const diagrams = Array.from({ length: 200 }, (_, i) => meta(`d${i}`, `D${i}`));
    const parsed = parsedOf({ folders, diagrams });

    const r = rewriteIds(parsed);
    const minted = [...r.folders.map((f) => f.id), ...r.diagrams.map((d) => d.newId)];
    // PRECONDITION: we really minted 400 ids.
    expect(minted).toHaveLength(400);
    expect(new Set(minted).size).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// ZIP-13 — the manifest name is discarded on import.
// ---------------------------------------------------------------------------
describe('ZIP-13 — the import renames a diagram whose blob title disagrees with its listing name', () => {
  it('characterization: the listing name in the manifest is ignored; the blob title wins', async () => {
    // Exactly the A1/LIFE-12 state, and the normal state of every Drive diagram
    // (the Drive file name is the listing name; the blob carries its own title).
    const src = new FakeStorage();
    const id = await src.createDiagram(model('Old Title'), null);
    await src.renameDiagram(id, 'Name The User Sees');
    // PRECONDITION: listing name and blob title really do disagree.
    expect(src.diagrams.get(id)!.meta.name).toBe('Name The User Sees');
    expect((src.diagrams.get(id)!.data as { title: string }).title).toBe('Old Title');

    const { blob } = await exportProject({ storage: src, exporterTag: 'probe' }, { scope: 'project' });
    const parsed = await parseProject(blob);
    // The manifest carries the right name…
    expect(parsed.manifest.diagrams[0].name).toBe('Name The User Sees');

    const dest = new FakeStorage();
    await importProject({ storage: dest }, parsed, { destination: { kind: 'root' } });
    // …and the import throws it away: `createDiagram(model, folderId)` passes
    // no name, so the provider falls back to the blob.
    expect(Array.from(dest.diagrams.values())[0].meta.name).toBe('Old Title');
  });

  it.failing('ZIP-13: the imported diagram keeps the name the manifest recorded', async () => {
    const src = new FakeStorage();
    const id = await src.createDiagram(model('Old Title'), null);
    await src.renameDiagram(id, 'Name The User Sees');
    const { blob } = await exportProject({ storage: src, exporterTag: 'probe' }, { scope: 'project' });
    const parsed = await parseProject(blob);
    expect(parsed.manifest.diagrams[0].name).toBe('Name The User Sees'); // precondition
    const dest = new FakeStorage();
    await importProject({ storage: dest }, parsed, { destination: { kind: 'root' } });
    expect(Array.from(dest.diagrams.values())[0].meta.name).toBe('Name The User Sees');
  });
});

// ---------------------------------------------------------------------------
// ZIP-14 — is the import id gate wider than the ids the providers mint?
// ---------------------------------------------------------------------------
describe('ZIP-14 — ID_PATTERN vs the ids the three places actually produce', () => {
  const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

  it('every real-shaped provider id passes the import gate', async () => {
    const samples = {
      // LocalStorageProvider.sessionCreateDiagram: `diagram_${Date.now().toString(36)}_${uuidhex12}`
      session: `diagram_${Date.now().toString(36)}_0123456789ab`,
      sessionFolder: `folder_${Date.now().toString(36)}_0123456789ab`,
      // Google Drive file ids: base64url-ish, 28-44 chars.
      drive: '1a2B3c-4D5e_6F7g8H9i0JkLmNoPqRsTu',
      // projectZip.newId output (what a previous import produced).
      reimport: `diagram_${Date.now().toString(36)}_0123456789abcdef`
    };
    for (const [where, id] of Object.entries(samples)) {
      expect({ where, ok: ID_PATTERN.test(id) }).toEqual({ where, ok: true });
    }

    // And the gate really is live — a positive control that it rejects something.
    const bad = await zipOf(
      { format: PROJECT_FORMAT, version: PROJECT_FORMAT_VERSION, folders: [], diagrams: [{ id: 'has spaces', name: 'x', file: 'diagrams/x.json' }] },
      { 'diagrams/x.json': '{}' }
    );
    const err = await parseProject(bad).catch((e) => e as ProjectZipError);
    expect((err as ProjectZipError).code).toBe('BAD_ID');
  });
});
