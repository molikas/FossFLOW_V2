/**
 * A2/STOR-13 — a Drive diagram outside the Axoview folder must still be
 * reachable. Promoted from the 2026-07 exploratory campaign's probe lane
 * (`__explore__/A2/drive-stor-*`).
 *
 * `GoogleDriveProvider.listDiagrams(undefined)` queries the ACCOUNT by app
 * marker rather than the root subtree — Drive has no recursive parent query —
 * so a file the user moved out of the Axoview folder in Drive's own UI comes
 * back with a `folderId` naming a folder `listFolders()` knows nothing about.
 * `buildTree` places diagrams by exact `folderId` match, so it landed in no
 * folder and at no root: invisible in the tree while still counted by every
 * consumer of the listing (sessionHasContent, icon-usage scans, export scope).
 *
 * The re-homing happens in `useFileTree` because that is the one place holding
 * both lists — the provider would pay an extra Drive listing per call to know.
 */
import { buildTree } from '../useFileTree';
import type { DiagramMeta, FolderMeta } from '../../services/storage/types';

const folder = (id: string, parentId: string | null = null): FolderMeta => ({
  id,
  name: id,
  parentId
});

const diagram = (id: string, folderId: string | null): DiagramMeta => ({
  id,
  name: id,
  folderId,
  lastModified: '2026-07-30T00:00:00Z'
});

/** What `useFileTree` now does to the listing before it reaches `buildTree`. */
const rehome = (diagrams: DiagramMeta[], folders: FolderMeta[]): DiagramMeta[] => {
  const known = new Set(folders.map((f) => f.id));
  return diagrams.map((d) =>
    d.folderId != null && !known.has(d.folderId) ? { ...d, folderId: null } : d
  );
};

describe('a diagram whose folder is not in the tree', () => {
  const folders = [folder('known')];

  it('appears nowhere at all without the re-homing (the bug)', () => {
    const diagrams = [diagram('stray', 'outside-the-app-folder')];
    const roots = buildTree(folders, diagrams, new Map(), null);
    const inKnown = buildTree(folders, diagrams, new Map(), 'known');
    expect(roots.some((n) => n.id === 'stray')).toBe(false);
    expect(inKnown.some((n) => n.id === 'stray')).toBe(false);
  });

  it('appears at root once re-homed, where it can be seen and moved', () => {
    const diagrams = rehome([diagram('stray', 'outside-the-app-folder')], folders);
    const roots = buildTree(folders, diagrams, new Map(), null);
    expect(roots.some((n) => n.id === 'stray')).toBe(true);
  });

  it('leaves a diagram in a KNOWN folder where it is', () => {
    const diagrams = rehome([diagram('normal', 'known')], folders);
    expect(diagrams[0].folderId).toBe('known');
    const inKnown = buildTree(folders, diagrams, new Map(), 'known');
    expect(inKnown.some((n) => n.id === 'normal')).toBe(true);
  });

  it('leaves a root-level diagram alone', () => {
    const diagrams = rehome([diagram('rooted', null)], folders);
    expect(diagrams[0].folderId).toBeNull();
  });
});
