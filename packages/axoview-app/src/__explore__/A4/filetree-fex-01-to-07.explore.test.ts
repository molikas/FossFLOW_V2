/**
 * A4 — `useFileTree` (zero tests) and the dead paths around it.
 *
 * FEX-01 (a dangling folderId renders nowhere and is not in the trash either),
 * FEX-02 (the soft-delete/trash machine has no caller), FEX-03 (TreeManifest is
 * write-only end to end), FEX-04 (one rejecting call fails the whole tree),
 * FEX-05 (a failed refresh reports error over live rows), FEX-06 (folders can
 * never be in the trash), FEX-07 (correcting a stale source comment).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFileTree } from '../../hooks/useFileTree';
import { LocalStorageProvider } from '../../services/storage/providers/LocalStorageProvider';
import type {
  DiagramMeta,
  FolderMeta,
  StorageProvider,
  TreeManifest
} from '../../services/storage/types';

interface Rig {
  storage: StorageProvider;
  folders: FolderMeta[];
  diagrams: DiagramMeta[];
  manifest: TreeManifest;
  /** Reject the named listing call from now on. */
  failing: Set<string>;
  calls: Record<string, number>;
}

function rig(init: Partial<Pick<Rig, 'folders' | 'diagrams' | 'manifest'>> = {}): Rig {
  const r: Rig = {
    folders: init.folders ?? [],
    diagrams: init.diagrams ?? [],
    manifest: init.manifest ?? ({ folders: [] } as TreeManifest),
    failing: new Set(),
    calls: {},
    storage: null as unknown as StorageProvider
  };
  const tick = (m: string) => {
    r.calls[m] = (r.calls[m] ?? 0) + 1;
    if (r.failing.has(m)) throw new Error(`${m} failed (injected)`);
  };
  r.storage = {
    listFolders: async () => { tick('listFolders'); return [...r.folders]; },
    listDiagrams: async () => { tick('listDiagrams'); return [...r.diagrams]; },
    getTreeManifest: async () => { tick('getTreeManifest'); return r.manifest; },
    saveTreeManifest: async (m: TreeManifest) => { r.manifest = m; },
    deleteDiagram: async () => {},
    restoreDiagram: async () => {},
    deleteFolder: async () => {},
    renameDiagram: async () => {},
    renameFolder: async () => {},
    createFolder: async () => 'f-new',
    createDiagram: async () => 'd-new',
    moveItem: async () => {},
    loadDiagram: async () => ({}),
    saveDiagram: async () => {},
    isAvailable: async () => true
  } as unknown as StorageProvider;
  return r;
}

const dg = (id: string, name: string, folderId: string | null, extra: Partial<DiagramMeta> = {}): DiagramMeta =>
  ({ id, name, folderId, lastModified: '2026-07-30T00:00:00.000Z', ...extra });

const useTree = (r: Rig) => renderHook(() => useFileTree(r.storage, 0));

// RIG (2026-08-02): resolved from THIS FILE, not from the runner's cwd. The
// path used to be repo-root-relative ('packages/axoview-app/src/'), which broke
// the moment the explore lane started running per-package: jest's cwd is the
// package dir, so the path doubled and every source-scanning probe threw ENOENT
// — presenting as four findings that were really one rig fault. See the wave-6
// rig-traps appendix.
const readSrc = (p: string) => readFileSync(resolve(APP_SRC, p), 'utf8');
const APP_SRC = resolve(__dirname, '../../');

// FEX-01 is FIXED and its probes are retired (re-derived 2026-08-02).
//
// The two characterizations here described the pre-fix world: a diagram whose
// `folderId` named no existing folder appeared in no folder and at no root,
// invisible in the tree while still counted by every consumer of the listing.
//
// What closed it was NOT the RED-03/05 layer-reference work (the wave-3 note's
// attribution — re-checked and wrong): it was A2/STOR-13's fix in
// `useFileTree`, which rewrites an unresolvable `folderId` to `null` so the
// diagram surfaces at ROOT, where it can be seen and moved. That is exactly the
// "degrade to the root, the treatment a dangling `layerId` gets in the lib"
// resolution the `it.failing` probe asked for — reached from the Drive side
// (a file the user moved out of the Axoview folder in Drive's own UI) rather
// than from this one. Promoted regression: `useFileTree.orphanFolder.test.tsx`.

// ---------------------------------------------------------------------------
// FEX-02 / FEX-06 — the trash machine has no caller, and folders can't enter it.
// ---------------------------------------------------------------------------
describe('FEX-02 / FEX-06 — soft delete and the trash are implemented and unreachable', () => {
  it('characterization: the hook exposes the whole trash API and no UI calls any of it', () => {
    const r = rig();
    const { result } = useTree(r);
    // PRECONDITION: the API really is there to be called.
    expect(typeof result.current.softDeleteDiagram).toBe('function');
    expect(typeof result.current.restoreDiagram).toBe('function');
    expect(Array.isArray(result.current.trashData)).toBe(true);

    // Sweep every component + the app shell for a caller.
    const sources = [
      'components/fileExplorer/FileExplorer.tsx',
      'components/fileExplorer/FileTreeNode.tsx',
      'components/fileExplorer/FileTreeToolbar.tsx',
      'components/fileExplorer/ContextMenuItems.tsx',
      'components/DiagramManager.tsx',
      'App.tsx',
      'providers/DiagramLifecycleProvider.tsx'
    ].map((p) => readSrc(p));
    // PRECONDITION: we are reading the real files.
    expect(sources[0]).toContain('hardDeleteDiagram');

    for (const src of sources) {
      expect(src).not.toContain('softDeleteDiagram');
      expect(src).not.toContain('trashData');
      expect(src).not.toContain('restoreDiagram');
    }
    // The one delete the explorer performs is the irreversible one.
    expect(sources[0]).toContain('await tree.hardDeleteDiagram(target.id)');
  });

  it('FEX-06: no provider marks a folder deleted, so the folder trash branch is unreachable', async () => {
    // Session place: the row is removed, not flagged.
    const p = new LocalStorageProvider('http://localhost:3001');
    p.usingServer = false;
    localStorage.clear();
    const fid = await p.createFolder('Gone', null);
    await p.deleteFolder(fid, false);
    const remaining = await p.listFolders();
    expect(remaining.map((f) => f.id)).not.toContain(fid);
    expect(remaining.some((f) => f.deletedAt)).toBe(false);

    // And the Drive provider patches the DRIVE file's `trashed` flag, which the
    // app never reads back as `deletedAt` (its `listFolders` query filters
    // `trashed=false` server-side, so a trashed folder simply vanishes).
    const drive = readSrc('services/storage/providers/GoogleDriveProvider.ts');
    expect(drive).toContain("await this.patchJson(id, { trashed: true })");
    expect(drive).not.toContain('deletedAt');
  });
});

// ---------------------------------------------------------------------------
// FEX-03 — TreeManifest is fetched, exported, imported and never read.
// ---------------------------------------------------------------------------
describe('FEX-03 — the tree manifest is write-only end to end', () => {
  it('characterization: it is fetched on every load, and nothing renders from it', async () => {
    const r = rig({
      folders: [
        { id: 'b', name: 'Bravo', parentId: null },
        { id: 'a', name: 'Alpha', parentId: null }
      ],
      // An ordering that puts Bravo first — the opposite of alphabetical.
      manifest: { folders: [{ id: 'b', order: 0 }, { id: 'a', order: 1 }] } as unknown as TreeManifest
    });
    const { result } = useTree(r);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // PRECONDITION: the manifest really was fetched and is on the hook.
    expect(r.calls.getTreeManifest).toBe(1);
    expect(result.current.manifest).toEqual({
      folders: [{ id: 'b', order: 0 }, { id: 'a', order: 1 }]
    });

    // …and `buildTree` sorts by name regardless.
    expect(result.current.treeData.map((n) => n.name)).toEqual(['Alpha', 'Bravo']);

    // No component reads either the manifest or its setter.
    for (const p of [
      'components/fileExplorer/FileExplorer.tsx',
      'components/fileExplorer/FileTreeNode.tsx',
      'components/fileExplorer/FileTreeToolbar.tsx'
    ]) {
      const src = readSrc(p);
      expect(src).not.toContain('updateManifest');
      expect(src).not.toMatch(/\btree\.manifest\b/);
    }
    // The zip side already showed the other half (A3/ZIP-10): exported into
    // every archive, parsed on import, applied by nothing.
    const zip = readSrc('services/project/projectZip.ts');
    expect(zip).toContain("zip.file('tree-manifest.json'");
    expect(zip).toContain('const importProject');
  });

  it.failing('FEX-03: the fetched ordering decides the rendered order', async () => {
    const r = rig({
      folders: [
        { id: 'b', name: 'Bravo', parentId: null },
        { id: 'a', name: 'Alpha', parentId: null }
      ],
      manifest: { folders: [{ id: 'b', order: 0 }, { id: 'a', order: 1 }] } as unknown as TreeManifest
    });
    const { result } = useTree(r);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.manifest).not.toBeNull(); // precondition
    // Expected: a manifest the app pays a request for on every tree load (and an
    // extra listing on Drive to locate the file) affects something.
    expect(result.current.treeData.map((n) => n.name)).toEqual(['Bravo', 'Alpha']);
  });
});

// ---------------------------------------------------------------------------
// FEX-04 — one rejecting call fails the whole tree.
// ---------------------------------------------------------------------------
describe('FEX-04 — the unread tree manifest can take the whole tree down', () => {
  it('characterization: getTreeManifest rejecting hides folders and diagrams that loaded fine', async () => {
    const r = rig({
      folders: [{ id: 'f', name: 'Folder', parentId: null }],
      diagrams: [dg('d', 'Diagram', null)]
    });
    r.failing.add('getTreeManifest');

    const { result } = useTree(r);
    await waitFor(() => expect(result.current.status).toBe('error'));

    // PRECONDITION: the other two calls were made and would have succeeded.
    expect(r.calls.listFolders).toBe(1);
    expect(r.calls.listDiagrams).toBe(1);

    // The user sees an unusable explorer because of a value nothing reads
    // (FEX-03). This is also the consumer that turns A2/STOR-05's unguarded
    // `JSON.parse` of `axoview-tree-manifest` into a dead file tree.
    expect(result.current.treeData).toEqual([]);
    expect(result.current.error).toMatch(/getTreeManifest failed/);
  });

  it.failing('FEX-04: a failed manifest fetch degrades instead of failing the tree', async () => {
    const r = rig({
      folders: [{ id: 'f', name: 'Folder', parentId: null }],
      diagrams: [dg('d', 'Diagram', null)]
    });
    r.failing.add('getTreeManifest');
    const { result } = useTree(r);
    await waitFor(() => expect(result.current.status).not.toBe('loading'));
    expect(r.calls.listFolders).toBe(1); // precondition
    // Expected: the manifest is optional (the export path says so in as many
    // words — "Tree manifest is best-effort — failure must not block export").
    // Actual: `Promise.all` makes it mandatory on the read side.
    expect(result.current.treeData).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// FEX-05 — a failed refresh reports error while the old rows are still there.
// ---------------------------------------------------------------------------
describe('FEX-05 — a failed refresh reports error over live data', () => {
  it('characterization: status flips to error while treeData still holds the previous rows', async () => {
    const r = rig({ diagrams: [dg('d', 'Diagram', null)] });
    const { result } = useTree(r);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    // PRECONDITION: a good load happened first.
    expect(result.current.treeData).toHaveLength(1);

    r.failing.add('listDiagrams');
    await act(async () => { await result.current.refresh(); });

    await waitFor(() => expect(result.current.status).toBe('error'));
    // The rows are not cleared, so the section is simultaneously "error" and
    // populated — whichever the composition renders, the other is a lie.
    expect(result.current.treeData).toHaveLength(1);
    expect(result.current.isRefreshing).toBe(false);
  });

  it.failing('FEX-05: a failed refresh keeps the section usable rather than errored', async () => {
    const r = rig({ diagrams: [dg('d', 'Diagram', null)] });
    const { result } = useTree(r);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    r.failing.add('listDiagrams');
    await act(async () => { await result.current.refresh(); });
    expect(result.current.treeData).toHaveLength(1); // precondition
    // Expected: the hook already distinguishes a first load from a refresh for
    // exactly this reason ("later refreshes keep `ready` + `isRefreshing` so
    // stale rows stay visible instead of blanking") — the error path skipped
    // that distinction. Actual: `error ? 'error' : …` wins over `hasLoaded`.
    expect(result.current.status).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// FEX-07 — correcting a stale comment in the provider.
// ---------------------------------------------------------------------------
describe('FEX-07 — a self-parented folder is not walked forever', () => {
  it('a cyclic / self-parented folder is silently invisible, not an infinite walk', async () => {
    const r = rig({
      folders: [
        { id: 'self', name: 'Self', parentId: 'self' },
        { id: 'x', name: 'X', parentId: 'y' },
        { id: 'y', name: 'Y', parentId: 'x' },
        { id: 'ok', name: 'OK', parentId: null }
      ],
      diagrams: [dg('inside', 'Inside', 'self')]
    });
    const { result } = useTree(r);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // No hang, and only the reachable folder renders — `buildTree` descends
    // from `parentId === null`, so nothing in a cycle is ever visited.
    expect(result.current.treeData.map((n) => n.name)).toEqual(['OK']);
    // The diagram inside the self-parented folder is lost the same way FEX-01's
    // orphan is.
    expect(result.current.trashData).toEqual([]);

    // The comment in LocalStorageProvider's `uniqueSuffix` names the wrong
    // failure mode for this shape, which matters because it is the stated
    // justification for that helper.
    const src = readSrc('services/storage/providers/LocalStorageProvider.ts');
    expect(src).toContain('recursive tree builder then walks forever');
  });
});
