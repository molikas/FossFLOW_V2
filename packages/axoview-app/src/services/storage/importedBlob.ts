import { PersistedDiagramBlob, isPersistedDiagramBlob } from './types';

/**
 * Fields the STORAGE layer owns. A diagram document that arrives from a file
 * carries whatever the workspace it came from wrote there, and those values
 * mean nothing here.
 *
 * A3/ZIP-06: both single-JSON import call sites spread the untrusted file
 * straight into `createDiagram`, and `isPersistedDiagramBlob` is a shape check,
 * not a whitelist — so `folderId` rode along, and
 * `LocalStorageProvider.sessionSaveDiagram` prefers the blob's value over the
 * caller's (`blob.folderId !== undefined ? blob.folderId : …`). The explicit
 * `null` destination lost, and the diagram landed in a folder the tree does not
 * have: counted by every listing, visible in none. The project-ZIP importer
 * already strips `id` for the same class of reason (a 409 it once caused); this
 * path stripped nothing.
 */
const STORAGE_OWNED_FIELDS = ['id', 'folderId', 'deletedAt'] as const;

/**
 * Strip the storage-owned fields from an imported diagram document and apply the
 * name the caller resolved. The create's destination argument wins, which is the
 * only sane rule: the file cannot know where the user is putting it.
 *
 * Deliberately NOT stripped here: `shareUuid` / `sharedAt`. Copy-identity across
 * every copy path is MOP-01 (wave 2's share cluster) and belongs in one change,
 * not spread across the paths that happen to be touched first.
 */
export const sanitizeImportedBlob = (
  data: unknown,
  name: string
): PersistedDiagramBlob => {
  const blob: PersistedDiagramBlob = isPersistedDiagramBlob(data) ? data : {};
  const out = { ...blob } as Record<string, unknown>;
  for (const field of STORAGE_OWNED_FIELDS) delete out[field];
  out.name = name;
  out.title = name;
  return out as PersistedDiagramBlob;
};
