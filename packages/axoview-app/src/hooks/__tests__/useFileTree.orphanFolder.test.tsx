/**
 * Promoted from the A4 explore lane (ADR 0047 flip rule) — A4/FEX-01, closed by
 * the A2/STOR-13 fix and re-derived 2026-08-02.
 *
 * A diagram whose `folderId` names no existing folder used to appear in NO
 * folder and at NO root: `buildTree` walks down from `parentId === null` and
 * places diagrams by exact `folderId` match, so the row existed in `diagrams`
 * and nowhere the user could reach — while still being counted by every
 * consumer of the listing. The trash could not hold it either, since that is
 * keyed on `deletedAt`.
 *
 * The rule is the one a dangling `layerId` already gets in the lib: **degrade
 * to unassigned, not to gone.** `useFileTree` rewrites an unresolvable
 * `folderId` to `null` so the diagram surfaces at root, where it is visible and
 * can be moved somewhere real.
 *
 * Two routes reach the same state and this pins both: a Drive file the user
 * moved out of the Axoview folder in Drive's own UI (STOR-13 — Drive has no
 * recursive parent query, so `listDiagrams` returns it by app marker with a
 * `folderId` outside the tree), and a folder deleted while its diagrams kept
 * pointing at it (FEX-01, and the shape A5/CHR-03's "Clear All" produced
 * wholesale).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useFileTree } from '../useFileTree';
import type { DiagramMeta, FolderMeta } from '../../services/storage/types';

const dg = (id: string, name: string, folderId: string | null): DiagramMeta => ({
  id,
  name,
  folderId,
  lastModified: '2026-01-01T00:00:00.000Z'
});

// `useFileTree` takes the PROVIDER directly (not the manager).
const rig = (folders: FolderMeta[], diagrams: DiagramMeta[]) =>
  ({
    listFolders: async () => folders.map((f) => ({ ...f })),
    listDiagrams: async () => diagrams.map((d) => ({ ...d })),
    getTreeManifest: async () => ({ folders: [] }),
    saveTreeManifest: async () => {}
  }) as never;

const useTree = (storage: never) =>
  renderHook(() => useFileTree(storage, 0));

const flatIds = (nodes: { id: string; children?: unknown[] }[]): string[] =>
  nodes.flatMap((n) => [
    n.id,
    ...flatIds((n.children ?? []) as { id: string; children?: unknown[] }[])
  ]);

describe('useFileTree — a diagram whose folder does not exist (FEX-01 / STOR-13)', () => {
  const FOLDERS: FolderMeta[] = [{ id: 'real', name: 'Real', parentId: null }];

  it('CONTROL: a diagram in a real folder is nested under it', () => {
    // If this ever fails, the orphan assertions below prove nothing — every
    // diagram would be at root.
    const { result } = useTree(rig(FOLDERS, [dg('good', 'Good', 'real')]) as never);
    return waitFor(() => {
      expect(result.current.status).toBe('ready');
      const root = result.current.treeData.find((n) => n.id === 'real');
      expect(flatIds(root ? [root] : [])).toEqual(['real', 'good']);
    });
  });

  it('an orphan surfaces at ROOT rather than nowhere', async () => {
    const { result } = useTree(
      rig(FOLDERS, [dg('good', 'Good', 'real'), dg('lost', 'Lost', 'deleted-folder')]) as never
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // PRECONDITION: the provider really returned both, so a missing row would
    // be the tree builder's doing and not a fetch problem.
    expect(result.current.diagrams.map((d) => d.id).sort()).toEqual([
      'good',
      'lost'
    ]);
    expect(flatIds(result.current.treeData)).toContain('lost');
  });

  it('and it is at the TOP level, not buried under the surviving folder', async () => {
    const { result } = useTree(
      rig(FOLDERS, [dg('lost', 'Lost', 'deleted-folder')]) as never
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.treeData.map((n) => n.id)).toContain('lost');
  });

  it('its folderId is normalised, so a later move has something coherent to move', async () => {
    // Rendering it at root while it still claims a dead parent would make the
    // next drag compute the wrong "current parent" and be treated as a
    // same-parent reorder (the FEX-10 guard).
    const { result } = useTree(
      rig(FOLDERS, [dg('lost', 'Lost', 'deleted-folder')]) as never
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.diagrams.find((d) => d.id === 'lost')?.folderId).toBeNull();
  });

  it('CONTROL: a diagram already at root is untouched', async () => {
    const { result } = useTree(rig(FOLDERS, [dg('top', 'Top', null)]) as never);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.diagrams.find((d) => d.id === 'top')?.folderId).toBeNull();
    expect(result.current.treeData.map((n) => n.id)).toContain('top');
  });
});
