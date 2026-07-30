import {
  DiagramMeta,
  FolderMeta,
  PersistedDiagramBlob,
  StorageProvider,
  TreeManifest,
  isPersistedDiagramBlob
} from '../types';
import { leanIfModel } from '../leanModel';
import { authStore } from '../../../stores/authStore';
import { notificationStore } from '../../../stores/notificationStore';

// ADR 0036 — Google Drive Storage Provider.
//
// Every Axoview file/folder carries appProperties { axoview: 'true' }; the root
// folder additionally carries { axoviewRoot: 'true' } so the chosen root travels
// with the account (drive.file visibility follows the app + account, not the
// device). Delete = Drive trash. Sharing is intentionally not implemented
// (ADR 0036 §4 — session-backend-only per ADR 0010). Online-only v1: transient
// failures retry with backoff, then throw; the offline write queue is deferred.

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const JSON_MIME = 'application/json';
const APP_MARKER_Q = "appProperties has { key='axoview' and value='true' }";
const ROOT_MARKER_Q = "appProperties has { key='axoviewRoot' and value='true' }";
const APP_PROPS = { axoview: 'true' };
const ROOT_PROPS = { axoview: 'true', axoviewRoot: 'true' };
const ROOT_CACHE_KEY = 'axoview-drive-root';
const MANIFEST_NAME = 'axoview-manifest.json';
export const DEFAULT_ROOT_NAME = 'axoview-diagrams';

class DriveError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DriveError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  parents?: string[];
  trashed?: boolean;
}

export class GoogleDriveProvider implements StorageProvider {
  readonly id = 'google-drive' as const;
  readonly displayName = 'Google Drive';
  readonly requiresAuth = true;

  private rootFolderId: string | null = null;
  private rootProbe: Promise<string | null> | null = null;
  // Overridable in tests to keep backoff fast.
  protected retryDelays = [500, 1000, 2000];

  async isAvailable(): Promise<boolean> {
    return authStore.getState().status === 'AUTHENTICATED';
  }

  // ---------------------------------------------------------------------------
  // Low-level request: auth (via getValidToken ONLY), retry/backoff, 401 → expire
  // ---------------------------------------------------------------------------

  /**
   * A2/STOR-08: a retry replays the request VERBATIM, which is only safe when
   * the request is idempotent. A `POST` that creates a Drive file is not: a 5xx
   * or a dropped connection returned AFTER the file was committed made the
   * retry mint a second one — the call then SUCCEEDED, returned the second id,
   * and left an untracked orphan with no signal at all. GET/PATCH/PUT/DELETE
   * are safe to replay; POST is not, so it fails fast and the caller decides.
   *
   * (Drive's resumable uploads carry an upload id, which would make the create
   * genuinely retriable. That is a larger change than wave 1; failing fast is
   * strictly better than silently duplicating the user's file.)
   */
  private static isReplaySafe(init: RequestInit): boolean {
    return (init.method ?? 'GET').toUpperCase() !== 'POST';
  }

  private async request(
    url: string,
    init: RequestInit = {},
    attempt = 0
  ): Promise<Response> {
    const token = await authStore.getValidToken();
    if (!token) throw new DriveError('Not signed in to Google', 401);
    const replaySafe = GoogleDriveProvider.isReplaySafe(init);

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }
      });
    } catch {
      // Network error — transient, unless replaying could duplicate a create.
      if (replaySafe && attempt < this.retryDelays.length) {
        await sleep(this.retryDelays[attempt]);
        return this.request(url, init, attempt + 1);
      }
      throw new DriveError('Network error contacting Google Drive', 0);
    }

    if (res.ok) return res;

    if (res.status === 401) {
      // Token rejected server-side despite not being locally expired — force the
      // auth store to SESSION_EXPIRED so the user gets the re-sign-in prompt.
      authStore.markExpired();
      throw new DriveError('Google session expired', 401);
    }

    // Read the error body once (we're erroring out) to classify the failure.
    // A 403 can be a transient rate limit OR a permanent condition (Drive API
    // disabled, missing scope, no permission). Only rate limits are retriable —
    // retrying a permanent 403 spams requests + "busy" toasts (a real bug this
    // classification fixes).
    let reason = '';
    let apiMessage = '';
    try {
      const body = (await res.json()) as {
        error?: {
          status?: string;
          message?: string;
          errors?: Array<{ reason?: string }>;
        };
      };
      reason = body.error?.errors?.[0]?.reason || body.error?.status || '';
      apiMessage = body.error?.message || '';
    } catch {
      /* non-JSON error body — leave reason/message empty */
    }

    const isRateLimit =
      res.status === 429 ||
      (res.status === 403 && /rateLimitExceeded/i.test(reason));
    const transient = isRateLimit || res.status >= 500;
    // A2/STOR-08: never replay a non-idempotent create — a 5xx returned after
    // the write committed would mint a second file.
    if (transient && replaySafe && attempt < this.retryDelays.length) {
      if (isRateLimit) {
        notificationStore.push({
          severity: 'warning',
          message: 'Google Drive is busy — retrying…'
        });
      }
      await sleep(this.retryDelays[attempt]);
      return this.request(url, init, attempt + 1);
    }

    // Surface Google's own message (e.g. "Google Drive API has not been used in
    // project … or it is disabled") so the file tree shows the real cause.
    throw new DriveError(
      apiMessage || `Google Drive request failed (${res.status})`,
      res.status
    );
  }

  private async listFiles(q: string, fields: string): Promise<DriveFile[]> {
    // Drive pages results — and documents that a page may hold FEWER than
    // pageSize entries even when more pages follow, so nextPageToken must be
    // drained unconditionally or listings silently truncate.
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const url =
        `${DRIVE_API}/files?q=${encodeURIComponent(q)}` +
        `&fields=${encodeURIComponent(`nextPageToken,${fields}`)}&pageSize=1000` +
        `&spaces=drive` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
      const res = await this.request(url);
      const json = (await res.json()) as {
        files?: DriveFile[];
        nextPageToken?: string;
      };
      files.push(...(json.files ?? []));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return files;
  }

  private async patchJson(id: string, body: unknown): Promise<void> {
    await this.request(`${DRIVE_API}/files/${id}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify(body)
    });
  }

  /** Multipart create (metadata + media) → new file id. */
  private async uploadCreate(
    name: string,
    parents: string[],
    mimeType: string,
    content: string,
    appProperties: Record<string, string> = APP_PROPS
  ): Promise<string> {
    const boundary = `axoview_${Math.random().toString(36).slice(2)}`;
    const metadata = { name, parents, mimeType, appProperties };
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;
    const res = await this.request(
      `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      }
    );
    const json = (await res.json()) as { id: string };
    return json.id;
  }

  private async uploadMedia(id: string, content: string): Promise<void> {
    await this.request(`${DRIVE_UPLOAD}/files/${id}?uploadType=media&fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': JSON_MIME },
      body: content
    });
  }

  // ---------------------------------------------------------------------------
  // Root folder — default axoview-diagrams, marker-discovered, choice in Drive
  // ---------------------------------------------------------------------------

  private setRoot(id: string): void {
    this.rootFolderId = id;
    try {
      localStorage.setItem(ROOT_CACHE_KEY, id);
    } catch {
      /* cache is a boot accelerator only */
    }
  }

  private async folderExists(id: string): Promise<boolean> {
    try {
      const res = await this.request(`${DRIVE_API}/files/${id}?fields=id,trashed`);
      const json = (await res.json()) as DriveFile;
      return !json.trashed;
    } catch {
      return false;
    }
  }

  private async findRootByMarker(): Promise<string | null> {
    const q = `mimeType='${FOLDER_MIME}' and ${ROOT_MARKER_Q} and trashed=false`;
    const files = await this.listFiles(q, 'files(id)');
    return files[0]?.id ?? null;
  }

  private async createRootFolder(name: string): Promise<string> {
    const res = await this.request(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: ROOT_PROPS })
    });
    const json = (await res.json()) as { id: string };
    return json.id;
  }

  /**
   * Resolve the root folder id WITHOUT creating it (cache → marker discovery).
   * Read operations use this so a tree load can never race the first-connect
   * dialog into auto-creating (or duplicating) the root folder.
   */
  private async resolveRoot(): Promise<string | null> {
    if (this.rootFolderId) return this.rootFolderId;
    // Dedupe concurrent probes — the file tree fires listFolders + listDiagrams
    // + getTreeManifest (+ DriveSetupGate's hasConfiguredRoot) at once; without
    // this each would run its own marker query (and, on a hard error like a
    // disabled Drive API, each would surface the same failure).
    if (this.rootProbe) return this.rootProbe;
    this.rootProbe = this.probeRoot().finally(() => {
      this.rootProbe = null;
    });
    return this.rootProbe;
  }

  private async probeRoot(): Promise<string | null> {
    const cached = (() => {
      try {
        return localStorage.getItem(ROOT_CACHE_KEY);
      } catch {
        return null;
      }
    })();
    if (cached && (await this.folderExists(cached))) {
      this.rootFolderId = cached;
      return cached;
    }
    if (cached) {
      try {
        localStorage.removeItem(ROOT_CACHE_KEY);
      } catch {
        /* ignore */
      }
    }
    const found = await this.findRootByMarker();
    if (found) {
      this.setRoot(found);
      return found;
    }
    return null;
  }

  /** True when a root folder (marker) already exists for this account. */
  async hasConfiguredRoot(): Promise<boolean> {
    return (await this.resolveRoot()) !== null;
  }

  /**
   * Synchronous root-id read (memory, else the boot cache) — a UI accelerator
   * for the avatar menu's "Open Drive folder" link and the tree's setup-row
   * check. Never probes the network; may be null until resolveRoot() has run.
   */
  getCachedRootId(): string | null {
    if (this.rootFolderId) return this.rootFolderId;
    try {
      return localStorage.getItem(ROOT_CACHE_KEY);
    } catch {
      return null;
    }
  }

  /** First-connect setup: create the named root folder + stamp the marker. */
  async configureRoot(name: string): Promise<void> {
    const trimmed = name.trim() || DEFAULT_ROOT_NAME;
    // A marker root may already exist — created by a concurrent write's
    // ensureRoot() while this dialog was pending, or by another tab/device.
    // Adopt it (renamed to the user's choice) instead of minting a duplicate;
    // two axoviewRoot markers would make findRootByMarker() nondeterministic.
    const existing = await this.resolveRoot();
    if (existing) {
      await this.patchJson(existing, { name: trimmed });
      return;
    }
    const id = await this.createRootFolder(trimmed);
    this.setRoot(id);
  }

  /** Resolve the root, creating the default folder if none is configured (writes only). */
  private async ensureRoot(): Promise<string> {
    const existing = await this.resolveRoot();
    if (existing) return existing;
    const id = await this.createRootFolder(DEFAULT_ROOT_NAME);
    this.setRoot(id);
    return id;
  }

  // ---------------------------------------------------------------------------
  // Diagrams
  // ---------------------------------------------------------------------------

  async listDiagrams(folderId?: string | null): Promise<DiagramMeta[]> {
    const root = await this.resolveRoot();
    if (!root) return []; // root not configured yet (first-connect dialog pending)
    const q =
      folderId === undefined
        ? `mimeType='${JSON_MIME}' and trashed=false and ${APP_MARKER_Q}`
        : `'${folderId ?? root}' in parents and mimeType='${JSON_MIME}' and trashed=false and ${APP_MARKER_Q}`;
    const files = await this.listFiles(q, 'files(id,name,modifiedTime,parents)');
    return files
      .filter((f) => f.name !== MANIFEST_NAME)
      .map((f) => {
        const parent = f.parents?.[0] ?? root;
        return {
          id: f.id,
          name: f.name,
          lastModified: f.modifiedTime ?? new Date().toISOString(),
          folderId: parent === root ? null : parent
        };
      });
  }

  async loadDiagram(id: string): Promise<unknown> {
    const res = await this.request(`${DRIVE_API}/files/${id}?alt=media`);
    return res.json();
  }

  async saveDiagram(id: string, data: unknown): Promise<void> {
    // ADR 0003 lean-save — strip rehydratable pack icons before upload so Drive
    // stores a few KB, not the full icon-pack SVG payload, on every autosave.
    await this.uploadMedia(id, JSON.stringify(leanIfModel(data)));
  }

  async createDiagram(data: unknown, folderId?: string | null): Promise<string> {
    const root = await this.ensureRoot();
    const parent = folderId ?? root;
    const blob: PersistedDiagramBlob = isPersistedDiagramBlob(data) ? data : {};
    const name = blob.title || blob.name || 'Untitled Diagram';
    return this.uploadCreate(name, [parent], JSON_MIME, JSON.stringify(leanIfModel(data)));
  }

  async deleteDiagram(id: string): Promise<void> {
    // ADR 0036 §3 — Drive trash (recoverable ~30 days), never hard delete.
    await this.patchJson(id, { trashed: true });
  }

  async restoreDiagram(id: string): Promise<void> {
    await this.patchJson(id, { trashed: false });
  }

  async renameDiagram(id: string, name: string): Promise<void> {
    await this.patchJson(id, { name });
  }

  // ---------------------------------------------------------------------------
  // Folders
  // ---------------------------------------------------------------------------

  async listFolders(parentId?: string | null): Promise<FolderMeta[]> {
    const root = await this.resolveRoot();
    if (!root) return []; // root not configured yet
    const q =
      parentId === undefined
        ? `mimeType='${FOLDER_MIME}' and trashed=false and ${APP_MARKER_Q}`
        : `'${parentId ?? root}' in parents and mimeType='${FOLDER_MIME}' and trashed=false and ${APP_MARKER_Q}`;
    const files = await this.listFiles(q, 'files(id,name,parents)');
    return files
      .filter((f) => f.id !== root) // the root folder itself is not a listed folder
      .map((f) => {
        const parent = f.parents?.[0] ?? root;
        return { id: f.id, name: f.name, parentId: parent === root ? null : parent };
      });
  }

  async createFolder(name: string, parentId?: string | null): Promise<string> {
    const root = await this.ensureRoot();
    const res = await this.request(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId ?? root],
        appProperties: APP_PROPS
      })
    });
    const json = (await res.json()) as { id: string };
    return json.id;
  }

  async deleteFolder(id: string, recursive = true): Promise<void> {
    // A2/STOR-02: `deleteFolder(id, recursive)` meant three different things
    // across the three providers — the server forwarded the flag, Drive ignored
    // it and always cascaded, and the session place ignored it the other way,
    // so `recursive: true` in the session place was WEAKER than `false` on
    // Drive. Trashing a Drive folder trashes its descendants, so honouring
    // `recursive: false` means moving the children out first.
    if (!recursive) {
      const root = await this.ensureRoot();
      const meta = (await (
        await this.request(`${DRIVE_API}/files/${id}?fields=parents`)
      ).json()) as DriveFile;
      const target = meta.parents?.[0] ?? root;
      const children = await this.listFiles(
        `'${id}' in parents and trashed=false and ${APP_MARKER_Q}`,
        'files(id,name,parents)'
      );
      for (const child of children) {
        await this.moveItem(child.id, 'folder', target === root ? null : target);
      }
    }
    await this.patchJson(id, { trashed: true });
  }

  async renameFolder(id: string, name: string): Promise<void> {
    await this.patchJson(id, { name });
  }

  async moveItem(
    id: string,
    _type: 'diagram' | 'folder',
    targetFolderId: string | null
  ): Promise<void> {
    const root = await this.ensureRoot();
    const target = targetFolderId ?? root;
    const meta = (await (
      await this.request(`${DRIVE_API}/files/${id}?fields=parents`)
    ).json()) as DriveFile;
    const prevParents = (meta.parents ?? []).join(',');
    const query = prevParents
      ? `addParents=${target}&removeParents=${prevParents}`
      : `addParents=${target}`;
    await this.request(`${DRIVE_API}/files/${id}?${query}&fields=id`, {
      method: 'PATCH'
    });
  }

  // ---------------------------------------------------------------------------
  // Tree manifest — axoview-manifest.json in the root folder
  // ---------------------------------------------------------------------------

  private async findManifestId(root: string): Promise<string | null> {
    const q = `'${root}' in parents and name='${MANIFEST_NAME}' and trashed=false`;
    const files = await this.listFiles(q, 'files(id)');
    return files[0]?.id ?? null;
  }

  async getTreeManifest(): Promise<TreeManifest> {
    const root = await this.resolveRoot();
    if (!root) return { folders: [] };
    const id = await this.findManifestId(root);
    if (!id) return { folders: [] };
    const res = await this.request(`${DRIVE_API}/files/${id}?alt=media`);
    return res.json();
  }

  async saveTreeManifest(manifest: TreeManifest): Promise<void> {
    const root = await this.ensureRoot();
    const id = await this.findManifestId(root);
    if (!id) {
      await this.uploadCreate(
        MANIFEST_NAME,
        [root],
        JSON_MIME,
        JSON.stringify(manifest)
      );
      return;
    }
    await this.uploadMedia(id, JSON.stringify(manifest));
  }

  // shareDiagram / unshareDiagram intentionally omitted (ADR 0036 §4).
}
