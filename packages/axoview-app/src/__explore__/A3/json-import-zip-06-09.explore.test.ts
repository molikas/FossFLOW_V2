/**
 * A3 — the single-JSON import path (ZIP-06) and the three import entry points
 * (ZIP-09). Separate file because these drive the real `LocalStorageProvider`
 * rather than the projectZip fakes.
 */
import { readFileSync } from 'fs';
import { LocalStorageProvider } from '../../services/storage/providers/LocalStorageProvider';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

function sessionProvider() {
  const p = new LocalStorageProvider('http://localhost:3001');
  p.usingServer = false;
  return p;
}

// ---------------------------------------------------------------------------
// ZIP-06 — `App.tsx` and `ImportDialog`'s single-JSON leg both do
//
//   storage.createDiagram({ ...blob, name, title: name }, null)
//
// with `blob` the file's own contents (`isPersistedDiagramBlob(data) ? data : {}`
// — a shape check, not a field whitelist). The ZIP leg strips the blob's `id`
// for precisely this class of reason, with a comment explaining the 409 it once
// caused; the JSON leg strips nothing.
// ---------------------------------------------------------------------------
describe('ZIP-06 — a foreign JSON file can inject storage metadata on import', () => {
  /** What both single-JSON call sites do, verbatim. */
  const importJson = (p: LocalStorageProvider, blob: object, name: string) =>
    p.createDiagram({ ...blob, name, title: name }, null);

  it('characterization: the file\'s own folderId wins over the caller\'s null and hides the diagram', async () => {
    const p = sessionProvider();
    // A real folder, so the tree has somewhere legitimate to show things.
    const realFolder = await p.createFolder('Real', null);

    // The caller explicitly asks for the root (`null`).
    const id = await importJson(
      p,
      { title: 'Foreign', items: [], views: [], icons: [], folderId: 'ghost-folder' },
      'Foreign'
    );

    // PRECONDITION: the import succeeded and the diagram exists.
    const all = await p.listDiagrams();
    expect(all.map((d) => d.id)).toContain(id);

    // …filed under a folder that does not exist, not at the requested root.
    expect(all.find((d) => d.id === id)!.folderId).toBe('ghost-folder');
    expect((await p.listDiagrams(null)).map((d) => d.id)).not.toContain(id);
    expect((await p.listDiagrams(realFolder)).map((d) => d.id)).not.toContain(id);
    // Same end state as A2/STOR-03's orphan: present in every count, placeable
    // in no tree.
  });

  it('control: without the injected field the same call lands at the root', async () => {
    const p = sessionProvider();
    const id = await importJson(p, { title: 'Clean', items: [], views: [], icons: [] }, 'Clean');
    expect((await p.listDiagrams(null)).map((d) => d.id)).toContain(id);
  });

  it.failing('ZIP-06: the import strips storage metadata the way the ZIP leg does', async () => {
    const p = sessionProvider();
    const id = await importJson(
      p,
      { title: 'Foreign', items: [], views: [], icons: [], folderId: 'ghost-folder' },
      'Foreign'
    );
    const all = await p.listDiagrams();
    expect(all.map((d) => d.id)).toContain(id); // precondition
    // Expected: the caller's destination is authoritative, and `id`/`folderId`/
    // `deletedAt` from an untrusted file are dropped — the ZIP importer already
    // strips `id` and remaps `folderId` through its own map.
    expect(all.find((d) => d.id === id)!.folderId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ZIP-09 — three entry points into one operation.
// ---------------------------------------------------------------------------
describe('ZIP-09 — the Import gesture has three entry points with different destinations', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('characterization: the surface you launch from decides the place and the choices offered', () => {
    const app = read('packages/axoview-app/src/App.tsx');
    const explorer = read('packages/axoview-app/src/components/fileExplorer/FileExplorer.tsx');
    const dialog = read('packages/axoview-app/src/components/fileExplorer/ImportDialog.tsx');

    // PRECONDITION: we are reading the files we think we are.
    expect(app).toContain('handleDirectImportFile');
    expect(explorer).toContain('<ImportDialog');
    expect(dialog).toContain('DestinationKind');

    // (1) Toolbar import with an EMPTY tree → a bare file input. No destination
    //     choice at all, hard-coded root, and its own count-bearing toast.
    expect(app).toContain('if (treeIsEmpty) {');
    expect(app).toContain("destination: { kind: 'root' }");
    expect(app).toContain('buildZipImportSummary');

    // (2) Toolbar import with a NON-empty tree → ImportDialog over `storage`
    //     (the manager, i.e. whichever place the open diagram put it in), with
    //     root / newFolder / replaceAll offered and a generic toast.
    expect(app).toContain('setShowImportDialog(true)');
    expect(app).toMatch(/<ImportDialog[\s\S]{0,400}storage=\{storage\}/);
    expect(app).toContain("message: 'Import complete'");

    // (3) File-explorer import → ImportDialog over the SELECTED ROW's place,
    //     which can be a different place from the one (2) would have used.
    expect(explorer).toMatch(/<ImportDialog[\s\S]{0,400}providerFor\(createTargetPlace\)/);

    // And only the dialog can wipe a workspace, so the same button is
    // destructive-capable or not depending on whether the tree happens to be
    // empty when it is pressed.
    expect(dialog).toContain("{ kind: 'replaceAll' }");
    expect(app).not.toContain("{ kind: 'replaceAll' }");
  });
});
