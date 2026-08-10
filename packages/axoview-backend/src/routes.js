/**
 * Framework-agnostic route handlers. Zero Node-specific imports. Imported by
 * both the Express server (Docker) and the Cloudflare Worker (Hono).
 *
 * Each handler takes `(adapter, ctx)` where:
 *   ctx = { params, body, query, env, publicBaseUrl }
 * and returns `{ status, body }` or throws HttpError.
 */

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const UUID_PATTERN = /^[a-zA-Z0-9_-]{21,64}$/;

/**
 * S2/SHARE-02: storage keys that are NOT diagrams. The fs adapter deliberately
 * flattens `diagrams/<id>` to `<STORAGE_PATH>/<id>.json` to preserve the pre-5A
 * layout — which is the same file `folders`, `tree-manifest`, `metadata` and
 * `diagrams-index` resolve to. `ID_PATTERN` accepted all four, and
 * `saveDiagram` has no existence check, so `PUT /api/diagrams/folders` returned
 * 200 and replaced the entire folder tree; the diagram that did it was then
 * invisible, because the READ side (`listDiagramMeta`) already knew these names
 * were special and skipped them.
 *
 * Rejecting at `assertId` is the cheaper of the two fixes the entry named (the
 * other being a real `diagrams/` subdirectory in the fs adapter, which would
 * change the on-disk layout every existing deployment has).
 *
 * Note for future probes: the in-memory adapter keeps `diagrams/folders` and
 * `folders` in separate map slots AND carries its own reserved filter, so the
 * collision is invisible against the double. Only the fs adapter reproduces it —
 * which is why this guard lives in the route layer, above both.
 */
const RESERVED_DIAGRAM_IDS = new Set([
  'folders',
  'tree-manifest',
  'metadata',
  'diagrams-index'
]);

/**
 * S2/SHARE-15: fields the SERVER owns. `patchDiagram` merged the request body
 * over the stored document with no key filter, re-asserting only `id` — so
 * `PATCH /api/diagrams/<a> {"shareUuid": "<b's uuid>"}` was accepted, and every
 * cascade trusts `shareUuid` as the authoritative pointer to a snapshot.
 * Unsharing A then took down B's live link, and re-sharing A republished B's
 * link with A's content. Same class as the engine block's finding that
 * reference integrity is checked and *identity* integrity is not (E4/CLIP-01).
 */
const SERVER_OWNED_DIAGRAM_FIELDS = ['shareUuid', 'created'];

function stripServerOwnedFields(body) {
  const out = { ...(body || {}) };
  for (const key of SERVER_OWNED_DIAGRAM_FIELDS) delete out[key];
  return out;
}

/**
 * S2/SHARE-03 + SHARE-04: every folder route reads the whole `folders.json`
 * array, mutates a copy and writes it back, with no lock, no version and no
 * compare-and-swap; `shareDiagram` is read-then-write with no reservation. Two
 * requests that read before either writes each produce a complete result
 * missing the other's change, and the later `put` wins. The adapter's
 * tmp-file + rename gives FILE atomicity (ADR 0010 Decision 3), which is the
 * wrong granularity — it guarantees no torn file, not no lost update.
 *
 * A per-key async mutex is the cheapest correct fix for a single-process
 * server. It does NOT help a multi-process deployment; the durable fix there is
 * per-folder documents (or a CAS-capable adapter), which is a storage-layout
 * change. Recorded in the entries.
 */
const keyLocks = new Map();

export async function withKeyLock(key, fn) {
  const previous = keyLocks.get(key) ?? Promise.resolve();
  let release;
  const mine = previous.then(
    () => new Promise((resolve) => { release = resolve; })
  );
  keyLocks.set(key, mine);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    // Drop the entry once nothing is queued behind it, so the map cannot grow
    // without bound across a long-lived process.
    if (keyLocks.get(key) === mine) keyLocks.delete(key);
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    const body = typeof message === 'string' ? { error: message } : message;
    super(body.error || 'error');
    this.status = status;
    this.body = body;
  }
}

function assertId(id, label = 'id') {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  if (RESERVED_DIAGRAM_IDS.has(id)) {
    throw new HttpError(400, `Invalid ${label}: "${id}" is a reserved name`);
  }
  return id;
}

function assertUuid(uuid) {
  if (typeof uuid !== 'string' || !UUID_PATTERN.test(uuid)) {
    throw new HttpError(400, 'Invalid uuid');
  }
  return uuid;
}

function generateShareUuid() {
  if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
    throw new Error('crypto.getRandomValues is required');
  }
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = new Uint8Array(21);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % 64];
  return out;
}

async function getJson(adapter, key) {
  const buf = await adapter.get(key);
  if (!buf) return null;
  return JSON.parse(new TextDecoder().decode(buf));
}

async function putJson(adapter, key, value) {
  await adapter.put(key, new TextEncoder().encode(JSON.stringify(value, null, 2)));
}

// ---------------------------------------------------------------------------
// Config (ADR 0009 D2: single boot probe — /api/storage/status removed)
// ---------------------------------------------------------------------------

export function getConfig(_adapter, ctx) {
  const env = ctx?.env || {};
  return {
    status: 200,
    body: {
      googleClientId: env.GOOGLE_CLIENT_ID || null,
      // The Express/Docker target has NO anonymous read proxy (that lives only in
      // the Cloudflare worker — ADR 0042 §8), so anonymous Drive preview is off
      // here and the raw key is never surfaced.
      drivePublicPreview: false,
      googleProjectNumber: env.GOOGLE_PROJECT_NUMBER || null,
      driveScopes: ['https://www.googleapis.com/auth/drive.file'],
      authMode: env.AUTH_MODE || 'none',
      serverStorage: env.STORAGE_ENABLED !== false,
      // A5/CHR-08 (owner ruling 2026-07-30): the operator's canonical public
      // base, so every share link the CLIENT mints resolves against it instead
      // of whichever origin the page happens to be on (preview, staging, LAN).
      // The server has always used `PUBLIC_BASE_URL` for the `url` it returns
      // from `shareDiagram`; this exposes the same value to the app, which
      // builds the links the user actually copies. Null → page origin, which is
      // the existing behaviour.
      publicBaseUrl: env.PUBLIC_BASE_URL || null
    }
  };
}

// ---------------------------------------------------------------------------
// Diagrams
// ---------------------------------------------------------------------------

export async function listDiagrams(adapter, _ctx) {
  const all = await adapter.listDiagramMeta();
  return { status: 200, body: all };
}

export async function getDiagram(adapter, ctx) {
  const id = assertId(ctx.params.id);
  const data = await getJson(adapter, `diagrams/${id}`);
  if (!data) throw new HttpError(404, 'Diagram not found');
  return { status: 200, body: data };
}

export async function createDiagram(adapter, ctx) {
  const body = ctx.body || {};
  // MQA #21: same collision class as createFolder — a project import calls
  // createDiagram in a sequential burst and `diagram_${Date.now()}` reused the
  // same id within a millisecond, then 409'd on the second write. Use a random
  // suffix so back-to-back creates produce distinct ids when the caller did
  // not supply one explicitly.
  let id;
  if (body.id) {
    id = assertId(body.id);
  } else {
    do {
      const rand = Math.random().toString(36).slice(2, 10);
      id = `diagram_${Date.now().toString(36)}_${rand}`;
    } while (await adapter.get(`diagrams/${id}`));
  }
  if (await adapter.get(`diagrams/${id}`)) {
    throw new HttpError(409, 'Diagram already exists');
  }
  // MOP-01 / SHARE-15: a create is the third write path, and `shareUuid` is
  // server-owned on all three. The client strips it at every copy site
  // (`stripSourceIdentity`), but a create that carried one would have made the
  // new diagram claim an existing snapshot — so refuse it here too rather than
  // trusting one side of the wire.
  const data = {
    ...stripServerOwnedFields(body),
    id,
    created: new Date().toISOString(),
    lastModified: new Date().toISOString()
  };
  await putJson(adapter, `diagrams/${id}`, data);
  return { status: 201, body: { success: true, id } };
}

export async function saveDiagram(adapter, ctx) {
  const id = assertId(ctx.params.id);
  const body = stripServerOwnedFields(ctx.body);
  return withKeyLock(`diagrams/${id}`, async () => {
    // S2/SHARE-01: PUT is a whole-document replace, and the app's autosave body
    // is `leanIfModel(model)` — a `modelSchema` document with no `shareUuid`,
    // because `shareUuid` is a backend-only field. So the FIRST autosave after
    // sharing deleted it while `public/<uuid>` stayed on disk: `shareDiagram`
    // then saw no uuid and minted a new one, and unshare/delete — which both
    // cascade off `diagram.shareUuid` — could never reach the previous snapshot
    // again. The link already sent to colleagues became a frozen copy nobody
    // could revoke.
    //
    // `patchDiagram` (rename / trash) always preserved the field, so the loss
    // was specific to the full replace. Carry the server-owned fields across
    // the same way, which also makes the two write paths agree.
    const existing = await getJson(adapter, `diagrams/${id}`);
    const preserved = {};
    for (const key of SERVER_OWNED_DIAGRAM_FIELDS) {
      if (existing && existing[key] !== undefined) preserved[key] = existing[key];
    }
    const data = {
      ...body,
      ...preserved,
      id,
      lastModified: new Date().toISOString()
    };
    await putJson(adapter, `diagrams/${id}`, data);
    return { status: 200, body: { success: true, id } };
  });
}

export async function patchDiagram(adapter, ctx) {
  const id = assertId(ctx.params.id);
  return withKeyLock(`diagrams/${id}`, async () => {
    const existing = await getJson(adapter, `diagrams/${id}`);
    if (!existing) throw new HttpError(404, 'Diagram not found');
    const updated = {
      // SHARE-15: strip the server-owned keys the way `id` was always stripped.
      ...existing,
      ...stripServerOwnedFields(ctx.body),
      id,
      lastModified: new Date().toISOString()
    };
    await putJson(adapter, `diagrams/${id}`, updated);
    return { status: 200, body: { success: true } };
  });
}

export async function moveDiagram(adapter, ctx) {
  const id = assertId(ctx.params.id);
  const target = ctx.body?.targetFolderId ?? null;
  if (target !== null) assertId(target, 'targetFolderId');
  const existing = await getJson(adapter, `diagrams/${id}`);
  if (!existing) throw new HttpError(404, 'Diagram not found');
  existing.folderId = target;
  existing.lastModified = new Date().toISOString();
  await putJson(adapter, `diagrams/${id}`, existing);
  return { status: 200, body: { success: true } };
}

/**
 * Delete the snapshot `shareUuid` points at — but only if the snapshot agrees
 * that this diagram is its source.
 *
 * S2/SHARE-15: every cascade trusted `shareUuid` as an authoritative pointer
 * without checking `snapshot.sourceId`. Stripping the field from PATCH closes
 * the route in, but a document written by an older build can still carry a
 * borrowed uuid, and "delete someone else's published artifact" is not a
 * failure mode worth leaving to one guard.
 */
async function deleteOwnedSnapshot(adapter, id, shareUuid) {
  if (!shareUuid || !UUID_PATTERN.test(shareUuid)) return;
  try {
    const snapshot = await getJson(adapter, `public/${shareUuid}`);
    if (snapshot && snapshot.sourceId && snapshot.sourceId !== id) return;
    await adapter.delete(`public/${shareUuid}`);
  } catch {
    /* best-effort */
  }
}

export async function deleteDiagram(adapter, ctx) {
  const id = assertId(ctx.params.id);
  return withKeyLock(`diagrams/${id}`, async () => {
    const existingBuf = await adapter.get(`diagrams/${id}`);
    if (!existingBuf) throw new HttpError(404, 'Diagram not found');
    let existing = null;
    try {
      existing = JSON.parse(new TextDecoder().decode(existingBuf));
    } catch {}
    await deleteOwnedSnapshot(adapter, id, existing?.shareUuid);
    await adapter.delete(`diagrams/${id}`);
    return { status: 200, body: { success: true } };
  });
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

async function readFolders(adapter) {
  // MQA #21: a `folders.json` written by an earlier shape (e.g. `{ folders: [...] }`
  // from a tree-manifest-style payload) crashed every folder operation with
  // `folders.map is not a function`. Always coerce to a flat array — accept the
  // legacy `{ folders: [...] }` shape, otherwise fall back to empty so the next
  // write heals the file. Log unexpected shapes once so we can trace where they
  // came from on the rare deployments where this trips.
  const raw = await getJson(adapter, 'folders');
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.folders)) {
    console.warn(
      '[folders] coerced legacy {folders:[]} payload — next write will heal the file'
    );
    return raw.folders;
  }
  if (raw != null) {
    console.warn(
      `[folders] folders.json has unexpected shape (typeof=${typeof raw}, keys=${
        typeof raw === 'object' ? Object.keys(raw).slice(0, 5).join(',') : 'n/a'
      }) — falling back to empty array`
    );
  }
  return [];
}

async function writeFolders(adapter, folders) {
  await putJson(adapter, 'folders', folders);
}

export async function listFolders(adapter, ctx) {
  const all = await readFolders(adapter);
  const parentId = ctx?.query?.parentId;
  const result =
    parentId !== undefined
      ? all.filter((f) => String(f.parentId) === String(parentId))
      : all;
  return { status: 200, body: result };
}

// S2/SHARE-03: every folder mutation is a read-modify-write of ONE document, so
// they all serialise behind this key. Measured before the lock: two concurrent
// `createFolder` calls returned 201 with distinct ids and left ONE folder; a
// concurrent rename + create returned 200 for both and dropped the rename. Most
// visible during a project import, which dispatches folder creates in a burst.
const FOLDERS_KEY = 'folders';

export async function createFolder(adapter, ctx) {
  const { name, parentId } = ctx.body || {};
  if (!name || typeof name !== 'string') {
    throw new HttpError(400, 'name is required');
  }
  if (parentId !== null && parentId !== undefined) assertId(parentId, 'parentId');
  return withKeyLock(FOLDERS_KEY, () => createFolderLocked(adapter, name, parentId));
}

async function createFolderLocked(adapter, name, parentId) {
  const folders = await readFolders(adapter);
  // MQA #21: project-import dispatches a sequential burst of createFolder calls.
  // The previous `folder_${Date.now()}` id collided whenever two writes landed
  // in the same millisecond, producing duplicate ids in folders.json that
  // confused later move/delete/import passes. Generate a uniqueness suffix
  // (random + collision check against the existing list) so back-to-back
  // creates always yield distinct ids on the fs adapter.
  const existingIds = new Set(folders.map((f) => f.id));
  let id;
  do {
    const rand = Math.random().toString(36).slice(2, 10);
    id = `folder_${Date.now().toString(36)}_${rand}`;
  } while (existingIds.has(id));
  folders.push({ id, name, parentId: parentId ?? null });
  await writeFolders(adapter, folders);
  return { status: 201, body: { success: true, id } };
}

export async function renameFolder(adapter, ctx) {
  const id = assertId(ctx.params.id);
  const { name } = ctx.body || {};
  if (!name || typeof name !== 'string') {
    throw new HttpError(400, 'name is required');
  }
  return withKeyLock(FOLDERS_KEY, async () => {
    const folders = await readFolders(adapter);
    const idx = folders.findIndex((f) => f.id === id);
    if (idx < 0) throw new HttpError(404, 'Folder not found');
    folders[idx] = { ...folders[idx], name };
    await writeFolders(adapter, folders);
    return { status: 200, body: { success: true } };
  });
}

// Collect a folder and all its descendant folder ids (recursive delete set).
function collectDescendantFolderIds(folders, rootId) {
  const ids = new Set();
  const visit = (fid) => {
    ids.add(fid);
    folders.filter((f) => f.parentId === fid).forEach((f) => visit(f.id));
  };
  visit(rootId);
  return ids;
}

// Best-effort: delete the public snapshot referenced by a diagram buffer, if
// the blob parses and carries a valid shareUuid. Swallows parse/delete errors.
async function deletePublicSnapshot(adapter, id, buf) {
  if (!buf) return;
  let existing;
  try {
    existing = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return; // unparseable diagram blob — nothing to clean up
  }
  await deleteOwnedSnapshot(adapter, id, existing?.shareUuid);
}

// MQA #14 (Bundle B follow-up): the previous behaviour orphaned every diagram
// inside the deleted folder — listDiagramMeta still returned them (with stale
// folderId), and a subsequent project import collided on the original ids.
// Sweep diagrams whose folderId pointed at any deleted folder. Best-effort:
// per-diagram failures are logged but do not block.
async function sweepOrphanedDiagrams(adapter, toDelete) {
  try {
    const allDiagrams = await adapter.listDiagramMeta();
    const orphans = allDiagrams.filter((d) => toDelete.has(d.folderId));
    for (const meta of orphans) {
      try {
        const buf = await adapter.get(`diagrams/${meta.id}`);
        await deletePublicSnapshot(adapter, meta.id, buf);
        await adapter.delete(`diagrams/${meta.id}`);
      } catch (e) {
        console.warn(`[deleteFolder] failed to sweep diagram ${meta.id}:`, e);
      }
    }
  } catch (e) {
    console.warn('[deleteFolder] orphan sweep failed:', e);
  }
}

export async function deleteFolder(adapter, ctx) {
  const id = assertId(ctx.params.id);
  const recursive =
    ctx?.query?.recursive === 'true' || ctx?.query?.recursive === true;
  return withKeyLock(FOLDERS_KEY, async () => {
    let folders = await readFolders(adapter);
    let toDelete;
    if (recursive) {
      toDelete = collectDescendantFolderIds(folders, id);
      folders = folders.filter((f) => !toDelete.has(f.id));
    } else {
      const idx = folders.findIndex((f) => f.id === id);
      if (idx < 0) throw new HttpError(404, 'Folder not found');
      // S2/SHARE-05: the non-recursive branch spliced exactly ONE row out and
      // swept only diagrams whose `folderId` was in that one-element set — so
      // child folders stayed in `folders.json` pointing at a `parentId` that no
      // longer existed (unreachable from the root, invisible in the tree, still
      // present in storage), and the diagrams inside them survived too. A
      // shared diagram stranded that way kept its public link live while being
      // unreachable in the UI. The two branches disagreed about what "delete
      // this folder" means; refusing is the honest reconciliation, and it is a
      // 409 the UI can turn into "this folder isn't empty" (the alternative,
      // silently re-parenting the orphans, invents a placement the user never
      // asked for).
      const children = folders.filter((f) => f.parentId === id);
      if (children.length > 0) {
        throw new HttpError(
          409,
          'Folder is not empty — delete it recursively or move its contents first'
        );
      }
      folders.splice(idx, 1);
      toDelete = new Set([id]);
    }
    await writeFolders(adapter, folders);

    await sweepOrphanedDiagrams(adapter, toDelete);

    return { status: 200, body: { success: true } };
  });
}

export async function moveFolder(adapter, ctx) {
  const id = assertId(ctx.params.id);
  const target = ctx.body?.targetFolderId ?? null;
  if (target !== null) assertId(target, 'targetFolderId');
  return withKeyLock(FOLDERS_KEY, async () => {
    const folders = await readFolders(adapter);
    const idx = folders.findIndex((f) => f.id === id);
    if (idx < 0) throw new HttpError(404, 'Folder not found');
    folders[idx] = { ...folders[idx], parentId: target };
    await writeFolders(adapter, folders);
    return { status: 200, body: { success: true } };
  });
}

// ---------------------------------------------------------------------------
// Tree manifest
// ---------------------------------------------------------------------------

export async function getTreeManifest(adapter) {
  const data = await getJson(adapter, 'tree-manifest');
  return { status: 200, body: data ?? { folders: [] } };
}

export async function saveTreeManifest(adapter, ctx) {
  await putJson(adapter, 'tree-manifest', ctx.body || { folders: [] });
  return { status: 200, body: { success: true } };
}

// ---------------------------------------------------------------------------
// Share — public snapshots
// ---------------------------------------------------------------------------

/**
 * S2/SHARE-11: the snapshot was a hand-written field WHITELIST — `title, name,
 * icons, colors, items, views, fitToScreen, sharedAt, sourceId` — so every
 * other top-level field was dropped, including `description`, `version` and
 * `requiredPacks`. The last one is the damaging one: under ADR 0003 lean-save
 * the stored diagram has its pack icons stripped from `icons` and records the
 * packs it needs in `requiredPacks`, and `loadPacksForDiagram` resolves what to
 * fetch from that field first — its items × icons cross-reference fallback
 * cannot work on a lean payload, because mapping `item.icon` to a collection
 * needs the icons array to still contain that icon. With lazy pack loading on
 * by default, a shared AWS/Azure/Material diagram opened with every icon
 * unresolved.
 *
 * Inverted to a DENY-list of the fields the server owns or that are meaningless
 * to an anonymous reader, so the next `modelSchema` field is carried rather
 * than silently dropped. (Deriving the list from the schema itself, as the
 * entry suggests, would mean importing the lib's zod model into a package that
 * is deliberately dependency-free and shared with the Worker.)
 */
const SNAPSHOT_EXCLUDED_FIELDS = new Set([
  'id',
  'shareUuid',
  'folderId',
  'deletedAt',
  'created',
  'lastModified'
]);

function buildSnapshot(diagram, id, sharedAt) {
  const snapshot = {};
  for (const [key, value] of Object.entries(diagram)) {
    if (SNAPSHOT_EXCLUDED_FIELDS.has(key)) continue;
    snapshot[key] = value;
  }
  // Normalisations the whitelist used to apply — kept so a malformed stored
  // document cannot produce a snapshot the viewer chokes on.
  snapshot.title = diagram.title || diagram.name || 'Untitled Diagram';
  snapshot.name = diagram.name || diagram.title || 'Untitled Diagram';
  for (const key of ['icons', 'colors', 'items', 'views']) {
    if (!Array.isArray(snapshot[key])) snapshot[key] = [];
  }
  snapshot.fitToScreen = diagram.fitToScreen !== false;
  snapshot.sharedAt = sharedAt;
  snapshot.sourceId = id;
  return snapshot;
}

export async function shareDiagram(adapter, ctx) {
  const id = assertId(ctx.params.id);
  const baseUrl = ctx.publicBaseUrl || '';
  // S2/SHARE-04: read-then-write with no reservation. Two Share requests that
  // overlapped on a never-shared diagram both took the "no uuid → generate one"
  // branch, both wrote their own `public/<uuid>`, and the second diagram write
  // won the record — so Unshare took down one link and left the other serving
  // the diagram indefinitely, with nothing in the app aware of it. Same class
  // as SHARE-03, worse consequence: the lost write is a PUBLISHED artifact.
  // Sequential shares were always correctly idempotent, so the whole exposure
  // was the concurrency window this lock closes.
  return withKeyLock(`diagrams/${id}`, async () => {
    const diagram = await getJson(adapter, `diagrams/${id}`);
    if (!diagram) throw new HttpError(404, 'Diagram not found');
    // SHARE-06's other half: publishing something that is in the trash was
    // accepted, and the snapshot it produced would 410 immediately.
    if (diagram.deletedAt) {
      throw new HttpError(409, 'Cannot share a deleted diagram');
    }

    const uuid =
      diagram.shareUuid && UUID_PATTERN.test(diagram.shareUuid)
        ? diagram.shareUuid
        : generateShareUuid();

    const sharedAt = new Date().toISOString();
    await putJson(adapter, `public/${uuid}`, buildSnapshot(diagram, id, sharedAt));

    if (diagram.shareUuid !== uuid) {
      diagram.shareUuid = uuid;
      diagram.lastModified = new Date().toISOString();
      await putJson(adapter, `diagrams/${id}`, diagram);
    }

    const url = `${baseUrl}/display/p/${uuid}`;
    return { status: 200, body: { uuid, url, sharedAt } };
  });
}

export async function unshareDiagram(adapter, ctx) {
  const id = assertId(ctx.params.id);
  return withKeyLock(`diagrams/${id}`, async () => {
    const diagram = await getJson(adapter, `diagrams/${id}`);
    if (!diagram) throw new HttpError(404, 'Diagram not found');
    if (diagram.shareUuid && UUID_PATTERN.test(diagram.shareUuid)) {
      await deleteOwnedSnapshot(adapter, id, diagram.shareUuid);
      delete diagram.shareUuid;
      diagram.lastModified = new Date().toISOString();
      await putJson(adapter, `diagrams/${id}`, diagram);
    }
    return { status: 200, body: { success: true } };
  });
}

export async function getPublicSnapshot(adapter, ctx) {
  const uuid = assertUuid(ctx.params.uuid);
  const data = await getJson(adapter, `public/${uuid}`);
  if (!data) throw new HttpError(404, 'Snapshot not found');
  // S2/SHARE-06: a soft delete (`PATCH { deletedAt }`) merges into the stored
  // document and preserves `shareUuid`, so only the PERMANENT delete cascaded
  // to `public/<uuid>` — a trashed diagram kept serving its full contents while
  // being unopenable, and Unshare lives on the open diagram's toolbar, so the
  // owner had no way left to take the link down.
  //
  // Resolve back through `sourceId` and answer 410, mirroring the worker's
  // Drive read proxy, which fetches `fields=trashed` first specifically so that
  // "a trashed file must stop resolving here". Restoring the diagram restores
  // the link, which is the behaviour a trash implies. Snapshots written before
  // `sourceId` existed carry no back-reference and are served as before.
  if (data.sourceId && ID_PATTERN.test(data.sourceId)) {
    const source = await getJson(adapter, `diagrams/${data.sourceId}`);
    if (source?.deletedAt) {
      throw new HttpError(410, 'This diagram has been deleted');
    }
  }
  return { status: 200, body: data };
}
