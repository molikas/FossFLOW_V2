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
 * Fields that identify the ORIGINAL diagram as a published artifact. A copy is
 * a different diagram and has never been shared, so it must not inherit them.
 *
 * MOP-01 (cross-area mop-up, A4 × A3 × S2): every copy path spread the source
 * document into `createDiagram` and carried `shareUuid` along with it. The
 * consequences differ per path but all come from the same root:
 *   · the copy claims a snapshot it does not own, so unsharing or deleting the
 *     COPY takes down the ORIGINAL's live link (the S2/SHARE-15 cascade trusts
 *     `shareUuid` as an authoritative pointer);
 *   · re-sharing the copy republishes that snapshot with the copy's content,
 *     so everyone holding the original's link silently starts seeing the copy;
 *   · and `sharedAt` makes the copy's UI claim a share that never happened.
 *
 * `created` goes too — a copy is created now, not when its source was.
 */
const SOURCE_IDENTITY_FIELDS = ['shareUuid', 'sharedAt', 'created'] as const;

/**
 * Strip everything a COPY must not inherit from its source. Used by all three
 * copy paths — duplicate, project-ZIP import, single-JSON import — so they
 * cannot drift apart again, which is exactly how MOP-01 came to differ per path.
 *
 * Exported separately from `sanitizeImportedBlob` because the duplicate path
 * resolves its own name and destination and needs only this half.
 */
export const stripSourceIdentity = <T extends object>(data: T): T => {
  const out = { ...data } as Record<string, unknown>;
  for (const field of STORAGE_OWNED_FIELDS) delete out[field];
  for (const field of SOURCE_IDENTITY_FIELDS) delete out[field];
  return out as T;
};

/**
 * Strip the storage-owned and source-identity fields from an imported diagram
 * document and apply the name the caller resolved. The create's destination
 * argument wins, which is the only sane rule: the file cannot know where the
 * user is putting it.
 */
export const sanitizeImportedBlob = (
  data: unknown,
  name: string
): PersistedDiagramBlob => {
  const blob: PersistedDiagramBlob = isPersistedDiagramBlob(data) ? data : {};
  const out = stripSourceIdentity(blob) as Record<string, unknown>;
  out.name = name;
  out.title = name;
  return out as PersistedDiagramBlob;
};
