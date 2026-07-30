import JSZip from 'jszip';
import {
  DiagramMeta,
  FolderMeta,
  StorageProvider,
  TreeManifest
} from '../storage';

// ----------------------------------------------------------------------------
// Format constants — see ADR 0001
// ----------------------------------------------------------------------------

export const PROJECT_FORMAT = 'axoview-project';
// Pre-rename format string. Accepted on import for backwards compatibility
// with project ZIPs exported before the FossFLOW → Axoview rename.
// New exports always write PROJECT_FORMAT.
export const LEGACY_PROJECT_FORMATS = new Set(['fossflow-project']);
export const PROJECT_FORMAT_VERSION = '1';
const SUPPORTED_VERSIONS = new Set([PROJECT_FORMAT_VERSION]);
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

// Import guards (security review 2026-07-05). parseProject runs on an untrusted,
// user-supplied archive; without ceilings a small "zip bomb" (a few KB that
// inflates to gigabytes, or a manifest listing millions of diagrams) can OOM the
// tab. These caps are far above any legitimate project.
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024; // 100 MB compressed input
const MAX_ENTRY_BYTES = 50 * 1024 * 1024; // 50 MB per decompressed entry
const MAX_DIAGRAMS = 5000; // manifest entry-count ceiling

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type ExportScope = 'project' | 'folder' | 'diagram';

export interface ExportProjectOpts {
  scope: ExportScope;
  folderId?: string;
  diagramId?: string;
}

export interface ProjectManifest {
  format: typeof PROJECT_FORMAT;
  version: string;
  exportedAt: string;
  exportedBy: string;
  scope: ExportScope;
  folders: FolderMeta[];
  diagrams: Array<DiagramMeta & { file: string }>;
}

export interface ParsedProject {
  manifest: ProjectManifest;
  diagrams: Map<string, unknown>; // id → diagram model JSON (raw)
  treeManifest?: TreeManifest;
}

export type ImportDestination =
  | { kind: 'root' }
  | { kind: 'newFolder'; name: string }
  | { kind: 'replaceAll' };

export interface ImportProjectOpts {
  destination: ImportDestination;
}

export class ProjectZipError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ProjectZipError';
  }
}

// ----------------------------------------------------------------------------
// Filenames (ADR 0001)
// ----------------------------------------------------------------------------

const fsTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const slugify = (s: string) =>
  s.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'untitled';

export const projectZipFilename = (scope: ExportScope, label?: string): string => {
  const ts = fsTimestamp();
  if (scope === 'folder') return `axoview-folder-${slugify(label ?? 'folder')}-${ts}.zip`;
  return `axoview-project-${ts}.zip`;
};

// ----------------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------------

interface ExportContext {
  storage: StorageProvider;
  exporterTag: string;
}

const collectFolderSubtree = (
  rootId: string,
  allFolders: FolderMeta[]
): FolderMeta[] => {
  const result: FolderMeta[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const f = allFolders.find((x) => x.id === id);
    if (!f) return;
    result.push(f);
    for (const child of allFolders.filter((x) => x.parentId === id)) walk(child.id);
  };
  walk(rootId);
  return result;
};

export const exportProject = async (
  ctx: ExportContext,
  opts: ExportProjectOpts
): Promise<{
  blob: Blob;
  filename: string;
  /** Diagrams whose blob could not be read; the archive is complete without them (A3/ZIP-11). */
  skipped: Array<{ id: string; name: string }>;
}> => {
  const { storage, exporterTag } = ctx;

  const allFolders = await storage.listFolders();
  // A3/ZIP-07: `listDiagrams()` includes soft-deleted rows, so a project export
  // carried the trash — and the import has no `deletedAt` branch, so every
  // trashed diagram came back LIVE. Export and import now agree: the trash is
  // not part of a project export.
  const allDiagrams = (await storage.listDiagrams()).filter((d) => !d.deletedAt);

  let folders: FolderMeta[];
  let diagrams: DiagramMeta[];
  let scopeLabel: string | undefined;

  if (opts.scope === 'project') {
    folders = allFolders;
    diagrams = allDiagrams;
  } else if (opts.scope === 'folder') {
    if (!opts.folderId) throw new ProjectZipError('folderId required for folder scope', 'BAD_INPUT');
    folders = collectFolderSubtree(opts.folderId, allFolders);
    const folderIds = new Set(folders.map((f) => f.id));
    diagrams = allDiagrams.filter((d) => d.folderId != null && folderIds.has(d.folderId));
    scopeLabel = folders[0]?.name;
  } else {
    if (!opts.diagramId) throw new ProjectZipError('diagramId required for diagram scope', 'BAD_INPUT');
    const meta = allDiagrams.find((d) => d.id === opts.diagramId);
    if (!meta) throw new ProjectZipError(`Diagram ${opts.diagramId} not found`, 'NOT_FOUND');
    folders = [];
    diagrams = [meta];
    scopeLabel = meta.name;
  }

  const zip = new JSZip();
  const diagramsDir = zip.folder('diagrams');
  if (!diagramsDir) throw new ProjectZipError('Failed to create diagrams folder', 'ZIP_ERROR');

  const manifestDiagrams: Array<DiagramMeta & { file: string }> = [];
  // A3/ZIP-11: one unreadable diagram used to abort the whole export — the user
  // asked to back up 42 diagrams and got a stack trace and no file. Skip what
  // cannot be read and report it, so 41 of 42 still reach disk.
  const skipped: Array<{ id: string; name: string }> = [];
  for (const meta of diagrams) {
    let model: unknown;
    try {
      model = await storage.loadDiagram(meta.id);
    } catch {
      skipped.push({ id: meta.id, name: meta.name });
      continue;
    }
    const file = `diagrams/${meta.id}.json`;
    diagramsDir.file(`${meta.id}.json`, JSON.stringify(model));
    manifestDiagrams.push({ ...meta, file });
  }

  const manifest: ProjectManifest = {
    format: PROJECT_FORMAT,
    version: PROJECT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: exporterTag,
    scope: opts.scope,
    folders,
    diagrams: manifestDiagrams
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Tree manifest is best-effort — failure must not block export.
  // A3/ZIP-10: scope it to the folders actually in this archive, so a
  // folder-scope export does not ship ordering rows for folders the importer
  // will never see.
  try {
    const treeManifest = await storage.getTreeManifest();
    const exportedIds = new Set(folders.map((f) => f.id));
    zip.file(
      'tree-manifest.json',
      JSON.stringify({
        ...treeManifest,
        folders: (treeManifest.folders ?? []).filter((f) => exportedIds.has(f.id))
      })
    );
  } catch {
    // skip
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    blob,
    filename: projectZipFilename(opts.scope, scopeLabel),
    skipped
  };
};

// ----------------------------------------------------------------------------
// Parse
// ----------------------------------------------------------------------------

const loadZip = async (file: File | Blob): Promise<JSZip> => {
  if (typeof file.size === 'number' && file.size > MAX_ARCHIVE_BYTES) {
    throw new ProjectZipError('Archive is too large', 'TOO_LARGE');
  }
  try {
    return await JSZip.loadAsync(file);
  } catch {
    // JSZip throws on any malformed/non-zip input → translate to a domain error.
    throw new ProjectZipError('Could not read zip archive', 'BAD_ZIP');
  }
};

// Read a zip entry as a string, but refuse entries that decompress past the
// per-entry ceiling — the anti-zip-bomb guard. JSZip exposes the declared
// uncompressed size on the entry's internal `_data`; check it before inflating.
const readEntryString = async (
  entry: JSZip.JSZipObject,
  label: string
): Promise<string> => {
  const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })
    ._data?.uncompressedSize;
  if (typeof declared === 'number' && declared > MAX_ENTRY_BYTES) {
    throw new ProjectZipError(`Entry "${label}" is too large`, 'TOO_LARGE');
  }
  return entry.async('string');
};

const readManifest = async (zip: JSZip): Promise<ProjectManifest> => {
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new ProjectZipError('Missing manifest.json', 'NO_MANIFEST');
  }

  let manifest: ProjectManifest;
  try {
    manifest = JSON.parse(await readEntryString(manifestEntry, 'manifest.json'));
  } catch (e) {
    if (e instanceof ProjectZipError) throw e;
    throw new ProjectZipError('manifest.json is not valid JSON', 'BAD_MANIFEST');
  }

  if (Array.isArray(manifest.diagrams) && manifest.diagrams.length > MAX_DIAGRAMS) {
    throw new ProjectZipError(
      `Project lists too many diagrams (${manifest.diagrams.length})`,
      'TOO_LARGE'
    );
  }

  if (
    manifest.format !== PROJECT_FORMAT &&
    !LEGACY_PROJECT_FORMATS.has(manifest.format)
  ) {
    throw new ProjectZipError(
      `Unrecognized format "${manifest.format}" — expected "${PROJECT_FORMAT}"`,
      'BAD_FORMAT'
    );
  }
  // A3/ZIP-08: a manifest with no `version` (or a non-string one) is corrupt,
  // not from the future — it used to be told "exported by a newer Axoview
  // (version undefined); please upgrade", which sends the user to look for an
  // update that does not exist.
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new ProjectZipError(
      'manifest.json has no version — the archive is incomplete or corrupt',
      'BAD_MANIFEST'
    );
  }
  if (!SUPPORTED_VERSIONS.has(manifest.version)) {
    throw new ProjectZipError(
      `This project was exported by a newer Axoview (version ${manifest.version}); please upgrade.`,
      'UNSUPPORTED_VERSION'
    );
  }
  return manifest;
};

const loadDiagrams = async (
  zip: JSZip,
  manifest: ProjectManifest
): Promise<Map<string, unknown>> => {
  const diagrams = new Map<string, unknown>();
  for (const meta of manifest.diagrams ?? []) {
    if (!ID_PATTERN.test(meta.id)) {
      throw new ProjectZipError(`Invalid diagram id "${meta.id}"`, 'BAD_ID');
    }
    const path = meta.file ?? `diagrams/${meta.id}.json`;
    const entry = zip.file(path);
    if (!entry) {
      throw new ProjectZipError(`Missing diagram file "${path}"`, 'MISSING_DIAGRAM');
    }
    let model: unknown;
    try {
      model = JSON.parse(await readEntryString(entry, path));
    } catch (e) {
      if (e instanceof ProjectZipError) throw e;
      throw new ProjectZipError(`Diagram ${meta.id} is not valid JSON`, 'BAD_DIAGRAM');
    }
    // A3/ZIP-15: `null`, a number or an array all parse as valid JSON and used
    // to be imported as a BLANK diagram that counted as a success. Only an
    // object can be a model — take the BAD_DIAGRAM path the other two
    // corruption cases already take.
    if (model === null || typeof model !== 'object' || Array.isArray(model)) {
      throw new ProjectZipError(
        `Diagram ${meta.id} is not a diagram document`,
        'BAD_DIAGRAM'
      );
    }
    diagrams.set(meta.id, model);
  }
  return diagrams;
};

const validateFolderIds = (manifest: ProjectManifest): void => {
  for (const folder of manifest.folders ?? []) {
    if (!ID_PATTERN.test(folder.id)) {
      throw new ProjectZipError(`Invalid folder id "${folder.id}"`, 'BAD_ID');
    }
  }
};

/**
 * Depth of a folder in the parent chain, and the one place that knows a chain
 * can be a loop.
 *
 * A3/ZIP-01: `importProject` and `wipeWorkspace` each climbed `parentId` with no
 * visited set, so a manifest with `A.parent = B` and `B.parent = A` — a few
 * hundred bytes, well under every anti-zip-bomb cap — spun forever and froze the
 * tab with no error and no way out. The export side's `collectFolderSubtree`
 * already carried a `seen` set for exactly this.
 *
 * Returns `null` when the chain revisits a folder, which is what makes the loop
 * reportable rather than merely survivable.
 */
const folderDepth = (
  folder: FolderMeta,
  folders: FolderMeta[]
): number | null => {
  const seen = new Set<string>([folder.id]);
  let depth = 0;
  let cur: FolderMeta | undefined = folder;
  while (cur && cur.parentId) {
    const parentId: string = cur.parentId;
    const next: FolderMeta | undefined = folders.find((x) => x.id === parentId);
    if (!next) break; // dangling parent: treat as top level, as before
    if (seen.has(next.id)) return null;
    seen.add(next.id);
    cur = next;
    depth += 1;
  }
  return depth;
};

/**
 * Reject a cyclic folder graph at parse time, so the user gets the import-error
 * dialog instead of a frozen tab (A3/ZIP-01). `validateFolderIds` checked the id
 * characters only; nothing between `parseProject` and the walk looked at the
 * shape of the graph.
 */
const validateFolderGraph = (manifest: ProjectManifest): void => {
  const folders = manifest.folders ?? [];
  for (const folder of folders) {
    if (folderDepth(folder, folders) === null) {
      throw new ProjectZipError(
        `Folder "${folder.name || folder.id}" is inside itself — the archive's folder tree contains a loop`,
        'BAD_FOLDER_GRAPH'
      );
    }
  }
};

const readTreeManifest = async (
  zip: JSZip
): Promise<TreeManifest | undefined> => {
  const tmEntry = zip.file('tree-manifest.json');
  if (!tmEntry) return undefined;
  try {
    return JSON.parse(await readEntryString(tmEntry, 'tree-manifest.json'));
  } catch {
    // tree manifest is optional — ignore parse failures (including a too-large
    // entry: the import proceeds without the optional tree manifest)
    return undefined;
  }
};

export const parseProject = async (file: File | Blob): Promise<ParsedProject> => {
  const zip = await loadZip(file);
  const manifest = await readManifest(zip);
  const diagrams = await loadDiagrams(zip, manifest);
  validateFolderIds(manifest);
  validateFolderGraph(manifest);
  const treeManifest = await readTreeManifest(zip);
  return { manifest, diagrams, treeManifest };
};

// ----------------------------------------------------------------------------
// ID rewriting
// ----------------------------------------------------------------------------

const newId = (prefix: 'diagram' | 'folder'): string => {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
};

const rewriteRefsInModel = (model: unknown, idMap: Map<string, string>): unknown => {
  if (model == null || typeof model !== 'object') return model;
  if (Array.isArray(model)) return model.map((m) => rewriteRefsInModel(m, idMap));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(model as Record<string, unknown>)) {
    if (k === 'link' && typeof v === 'string' && idMap.has(v)) {
      out[k] = idMap.get(v);
    } else {
      out[k] = rewriteRefsInModel(v, idMap);
    }
  }
  return out;
};

export interface RewriteResult {
  folders: FolderMeta[];
  diagrams: Array<DiagramMeta & { newId: string }>;
  models: Map<string, unknown>; // newId → rewritten model
  idMap: Map<string, string>; // oldId → newId (folders + diagrams)
}

export const rewriteIds = (parsed: ParsedProject): RewriteResult => {
  const idMap = new Map<string, string>();
  for (const folder of parsed.manifest.folders) idMap.set(folder.id, newId('folder'));
  for (const diagram of parsed.manifest.diagrams) idMap.set(diagram.id, newId('diagram'));

  const folders: FolderMeta[] = parsed.manifest.folders.map((f) => ({
    ...f,
    id: idMap.get(f.id)!,
    parentId: f.parentId ? idMap.get(f.parentId) ?? null : null
  }));

  const diagrams: Array<DiagramMeta & { newId: string }> = parsed.manifest.diagrams.map((d) => ({
    ...d,
    newId: idMap.get(d.id)!,
    folderId: d.folderId ? idMap.get(d.folderId) ?? null : null
  }));

  const models = new Map<string, unknown>();
  for (const d of parsed.manifest.diagrams) {
    const raw = parsed.diagrams.get(d.id);
    models.set(idMap.get(d.id)!, rewriteRefsInModel(raw, idMap));
  }

  return { folders, diagrams, models, idMap };
};

// ----------------------------------------------------------------------------
// Import
// ----------------------------------------------------------------------------

interface ImportContext {
  storage: StorageProvider;
}

const wipeWorkspace = async (storage: StorageProvider): Promise<void> => {
  const diagrams = await storage.listDiagrams();
  for (const d of diagrams) await storage.deleteDiagram(d.id, false);
  const folders = await storage.listFolders();
  // Delete children before parents — sort by depth (parent chain length). A
  // cycle here comes from STORAGE, not from the archive, so it cannot be
  // rejected at parse time: `folderDepth` returns null and those folders sort
  // last, which still deletes them (A3/ZIP-01).
  const depth = (f: FolderMeta): number => folderDepth(f, folders) ?? -1;
  const sorted = [...folders].sort((a, b) => depth(b) - depth(a));
  for (const f of sorted) await storage.deleteFolder(f.id, false);
};

export const importProject = async (
  ctx: ImportContext,
  parsed: ParsedProject,
  opts: ImportProjectOpts
): Promise<{ folderCount: number; diagramCount: number }> => {
  const { storage } = ctx;

  // A3/ZIP-03: `replaceAll` used to wipe FIRST. A failure anywhere in the
  // import then left the workspace destroyed and nothing imported — the one
  // destination where a partial failure is unrecoverable. Snapshot what is
  // there, import alongside it, and delete the old content only once every
  // create has succeeded.
  const replacing = opts.destination.kind === 'replaceAll';
  const preexisting = replacing
    ? {
        diagrams: (await storage.listDiagrams()).map((d) => d.id),
        folders: await storage.listFolders()
      }
    : null;

  const rewritten = rewriteIds(parsed);

  // Determine root override for top-level items.
  let rootOverride: string | null = null;
  if (opts.destination.kind === 'newFolder') {
    rootOverride = await storage.createFolder(opts.destination.name, null);
  }

  // Recreate folder tree. Parents must exist before children; sort by depth
  // ascending. `parseProject` has already rejected a cyclic graph, so the null
  // branch is unreachable for a parsed archive — it is kept because
  // `importProject` is exported and can be called with a hand-built
  // `ParsedProject` (A3/ZIP-01).
  const depthIn = (f: FolderMeta): number =>
    folderDepth(f, rewritten.folders) ?? Number.MAX_SAFE_INTEGER;
  const folderRemap = new Map<string, string>();
  const ordered = [...rewritten.folders].sort((a, b) => depthIn(a) - depthIn(b));
  for (const f of ordered) {
    const parentId = f.parentId
      ? folderRemap.get(f.parentId) ?? f.parentId
      : rootOverride;
    const realId = await storage.createFolder(f.name, parentId);
    folderRemap.set(f.id, realId);
  }

  let diagramCount = 0;
  for (const d of rewritten.diagrams) {
    const rawModel = rewritten.models.get(d.newId);
    if (rawModel == null) continue;
    // MQA #14 (Bundle B follow-up): the exported blob still carries its
    // original `id`. If a diagram with that id still exists in storage
    // (e.g. orphaned after a folder delete that didn't sweep its contents),
    // the server 409s and the whole import aborts. Strip the original id
    // and let the server allocate a fresh one — keeps import idempotent
    // against pre-existing collisions and matches the duplicate flow.
    const { id: _strippedId, ...model } =
      rawModel && typeof rawModel === 'object'
        ? (rawModel as Record<string, unknown>)
        : { id: undefined };
    const folderId = d.folderId
      ? folderRemap.get(d.folderId) ?? d.folderId
      : rootOverride;
    // A3/ZIP-13: providers name a created diagram from the blob itself
    // (`blob.name || blob.title`), but the manifest carries the name the
    // workspace actually showed — a rename after the last save leaves the two
    // disagreeing, and the import used to resurrect the stale one. What the
    // export recorded wins, and both fields are set because either can name it.
    const named = d.name ? { ...model, name: d.name, title: d.name } : model;
    await storage.createDiagram(named, folderId);
    diagramCount++;
  }

  // A3/ZIP-10: carry the exported folder ordering into the new workspace,
  // remapped through the ids the import just minted. Best-effort, like the
  // export side — a workspace with the content but the old ordering is a far
  // better outcome than a failed import.
  if (parsed.treeManifest) {
    try {
      const remappedFolders = (parsed.treeManifest.folders ?? [])
        .map((f) => {
          const rewrittenId = rewritten.idMap.get(f.id);
          const realId = rewrittenId ? folderRemap.get(rewrittenId) : undefined;
          if (!realId) return null;
          const parentRewritten = f.parentId
            ? rewritten.idMap.get(f.parentId)
            : undefined;
          return {
            ...f,
            id: realId,
            parentId: parentRewritten
              ? folderRemap.get(parentRewritten) ?? null
              : rootOverride
          };
        })
        .filter((f): f is FolderMeta => f !== null);
      if (remappedFolders.length > 0) {
        const existing = await storage.getTreeManifest();
        const carried = new Set(remappedFolders.map((f) => f.id));
        await storage.saveTreeManifest({
          ...existing,
          folders: [
            ...(existing.folders ?? []).filter((f) => !carried.has(f.id)),
            ...remappedFolders
          ]
        });
      }
    } catch {
      // Ordering is cosmetic — never fail an import over it.
    }
  }

  // Every create succeeded: now the old workspace can go (A3/ZIP-03).
  if (preexisting) {
    for (const id of preexisting.diagrams) await storage.deleteDiagram(id, false);
    const oldDepth = (f: FolderMeta): number =>
      folderDepth(f, preexisting.folders) ?? -1;
    const sorted = [...preexisting.folders].sort((a, b) => oldDepth(b) - oldDepth(a));
    for (const f of sorted) await storage.deleteFolder(f.id, false);
  }

  return { folderCount: rewritten.folders.length, diagramCount };
};
