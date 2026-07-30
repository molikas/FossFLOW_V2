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
// ZIP-01 (a cyclic folder graph froze the tab) was fixed — `parseProject`
// rejects the loop with BAD_FOLDER_GRAPH and both walks carry a visited set —
// and its probes promoted to
// `src/services/project/__tests__/projectZip.test.ts`.

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
// ZIP-03 (a failed replaceAll destroyed the workspace and imported nothing) was
// fixed — the import creates first and deletes the old content only once every
// create has succeeded — and its probes promoted to
// `src/services/project/__tests__/projectZip.test.ts`.

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
// ZIP-05 (the import toast counted what the manifest CLAIMED) and ZIP-15 (a
// non-object diagram entry imported as a blank diagram and counted as a
// success) were both fixed, and their probes promoted to
// `src/utils/__tests__/importSummary.test.ts` and
// `src/services/project/__tests__/projectZip.test.ts`.

// ---------------------------------------------------------------------------
// ZIP-07 — trashed diagrams round-trip back to life.
// ZIP-07 (a project export carried the trash, and the import brought it back
// live) was fixed — the export filters `deletedAt` rows — and its probes
// promoted to `src/services/project/__tests__/projectZip.test.ts`.

// ---------------------------------------------------------------------------
// ZIP-08 — every import failure renders the same sentence.
// ZIP-08 (nine distinct failure codes reached the user as one message, and the
// one it showed was wrong for four of them) was fixed — the error reaches
// `ImportErrorDialog`, which maps the code to copy that is true for THAT
// failure, and a versionless manifest is BAD_MANIFEST rather than
// UNSUPPORTED_VERSION. Probes promoted to
// `src/components/__tests__/ImportErrorDialog.test.tsx` and
// `src/services/project/__tests__/projectZip.test.ts`.

// ---------------------------------------------------------------------------
// ZIP-10 — the tree manifest is exported, parsed, and then dropped.
// ZIP-10 (folder ordering never survived a round trip) was fixed — the export
// scopes the tree manifest and the import applies it, remapped through the ids
// it just minted — and its probes promoted to
// `src/services/project/__tests__/projectZip.test.ts`.

// ---------------------------------------------------------------------------
// ZIP-11 — one unreadable diagram kills the whole export.
// ZIP-11 (one unreadable diagram aborted the whole export) was fixed — the
// export skips and reports them — and its probes promoted to
// `src/services/project/__tests__/projectZip.test.ts`.

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
// ZIP-13 (the import resurrected the blob's stale title over the name the
// manifest recorded) was fixed and its probes promoted to
// `src/services/project/__tests__/projectZip.test.ts`.

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
