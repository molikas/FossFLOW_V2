import type { DiagramMeta, FolderMeta, StorageProvider } from './types';
import { copySuffix } from '../../utils/fileOperations';

// Move-to-Drive machinery (storage-ux-unification, 2026-07-06). Semantics are
// MOVE, not copy (owner decision, supersedes ADR 0036 §6 copy-only): create on
// Drive → verify the create returned an id → only then delete from the source.
// A failed item stays untouched in its source place.

export interface MoveToDriveResult {
  /** Source (session) diagram id. */
  id: string;
  name: string;
  ok: boolean;
  error?: string;
  /** The id the diagram received on Drive (set when ok). */
  driveId?: string;
  /** The name it landed under (may carry a copy-suffix on collision). */
  driveName?: string;
  /**
   * A2/STOR-09: the Drive copy is verified but the SOURCE could not be deleted,
   * so the diagram now exists in both places. `ok` stays true — the copy is
   * real and `driveId` names it — and this flags the cleanup the caller still
   * owes, so a retry does not mint a second Drive copy.
   */
  sourceRemained?: boolean;
}

/** Folder-name chain (root→leaf) for a diagram, from the flat folder list. */
function folderPath(folderId: string | null, folders: FolderMeta[]): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  let cur = folderId ? byId.get(folderId) : undefined;
  let guard = 0;
  while (cur && guard++ < 100) {
    names.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return names;
}

export interface MoveToDriveOptions {
  /** The place the diagrams currently live in (the local/session provider). */
  source: StorageProvider;
  /** The Google Drive provider. */
  drive: StorageProvider;
  /** Which diagrams to move. */
  diagrams: DiagramMeta[];
  /** Flat folder list of the source place — used to recreate folder paths. */
  sourceFolders: FolderMeta[];
  /**
   * Explicit Drive destination folder. When given, folder-path recreation is
   * skipped and every diagram lands here (used by drag-onto-Drive-folder).
   * null = Drive root. Omit to recreate each diagram's source folder path.
   */
  targetFolderId?: string | null;
  onProgress?: (done: number, total: number, current: DiagramMeta) => void;
}

export async function moveDiagramsToDrive(
  opts: MoveToDriveOptions
): Promise<MoveToDriveResult[]> {
  const results: MoveToDriveResult[] = [];

  // One flat listing each, kept current locally as we create — avoids a Drive
  // round-trip per item and keeps name de-collision consistent across the run.
  let driveFolders: FolderMeta[] | null = null;
  let driveDiagrams: DiagramMeta[] | null = null;
  const ensureListed = async () => {
    if (!driveFolders) driveFolders = await opts.drive.listFolders();
    if (!driveDiagrams) driveDiagrams = await opts.drive.listDiagrams();
  };

  /** Walk/create the folder chain on Drive; returns the leaf folder id. */
  const ensurePath = async (names: string[]): Promise<string | null> => {
    let parentId: string | null = null;
    for (const name of names) {
      const hit = driveFolders!.find(
        (f) => f.name === name && (f.parentId ?? null) === parentId && !f.deletedAt
      );
      if (hit) {
        parentId = hit.id;
      } else {
        const id = await opts.drive.createFolder(name, parentId);
        driveFolders!.push({ id, name, parentId });
        parentId = id;
      }
    }
    return parentId;
  };

  let done = 0;
  for (const meta of opts.diagrams) {
    try {
      await ensureListed();
      const raw = await opts.source.loadDiagram(meta.id);
      const blob =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      // Strip the source id so Drive allocates a fresh one.
      const { id: _dropId, ...rest } = blob;

      const targetFolderId =
        opts.targetFolderId !== undefined
          ? opts.targetFolderId
          : await ensurePath(folderPath(meta.folderId ?? null, opts.sourceFolders));

      const siblingNames = driveDiagrams!
        .filter((d) => (d.folderId ?? null) === (targetFolderId ?? null) && !d.deletedAt)
        .map((d) => d.name);
      const targetName = siblingNames.includes(meta.name)
        ? copySuffix(meta.name, siblingNames)
        : meta.name;

      const driveId = await opts.drive.createDiagram(
        { ...rest, title: targetName, name: targetName },
        targetFolderId
      );
      if (!driveId) throw new Error('Drive did not return a file id');
      driveDiagrams!.push({
        id: driveId,
        name: targetName,
        folderId: targetFolderId ?? null,
        lastModified: meta.lastModified
      });

      // Verified on Drive — NOW the source copy may go (move, not copy).
      try {
        await opts.source.deleteDiagram(meta.id, false);
      } catch (e) {
        // A2/STOR-09: this used to fall into the outer catch, which reports
        // `ok: false` and DROPS `driveId` — so the caller was told the move
        // failed and given no way to reconcile the Drive copy it now owns, and
        // a retry with the same selection minted a second one. The copy exists
        // and is verified; only the source cleanup failed. Report exactly that.
        results.push({
          id: meta.id,
          name: meta.name,
          ok: true,
          driveId,
          driveName: targetName,
          sourceRemained: true,
          error: e instanceof Error ? e.message : String(e)
        });
        done += 1;
        opts.onProgress?.(done, opts.diagrams.length, meta);
        continue;
      }
      results.push({ id: meta.id, name: meta.name, ok: true, driveId, driveName: targetName });
    } catch (e) {
      results.push({
        id: meta.id,
        name: meta.name,
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
    done += 1;
    opts.onProgress?.(done, opts.diagrams.length, meta);
  }
  return results;
}
