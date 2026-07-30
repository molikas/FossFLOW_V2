import {
  DiagramMeta,
  FolderMeta,
  PersistedDiagramBlob,
  StorageProvider,
  TreeManifest,
  isPersistedDiagramBlob
} from '../types';
import { leanIfModel } from '../leanModel';
import { apiBaseUrl } from '../../../utils/apiBaseUrl';

const SESSION_DIAGRAMS_KEY = 'axoview_diagrams';
const SESSION_DIAGRAM_PREFIX = 'axoview_diagram_';
const LOCAL_FOLDERS_KEY = 'axoview-folders';
const LOCAL_MANIFEST_KEY = 'axoview-tree-manifest';

// Date.now() alone collides when many ids are minted in the same tick (e.g.
// during a project import loop). A collision on folder ids lets the import's
// parent-remap produce a folder whose parentId equals its own id, which the
// recursive tree builder then walks forever.
function uniqueSuffix(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${Date.now().toString(36)}_${rand}`;
}

/** Builds an AbortSignal with timeout, falling back gracefully if unavailable. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

export class LocalStorageProvider implements StorageProvider {
  readonly id = 'local' as const;
  readonly displayName = 'Local Storage';
  readonly requiresAuth = false;

  // Set externally during boot by AppStorageContext from /api/config's
  // `serverStorage` flag (ADR 0009 D2 — dual-probe collapse). Default `false`
  // means "fall back to per-tab sessionStorage" — safe if init is skipped.
  usingServer = false;

  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? apiBaseUrl();
  }

  // Provider is always available — server-or-fallback is set externally now.
  async isAvailable(): Promise<boolean> {
    return true;
  }

  // ---------------------------------------------------------------------------
  // Diagrams — server path
  // ---------------------------------------------------------------------------

  private async serverListDiagrams(folderId?: string | null): Promise<DiagramMeta[]> {
    const params = folderId != null ? `?folderId=${encodeURIComponent(folderId)}` : '';
    const response = await fetch(`${this.baseUrl}/api/diagrams${params}`, {
      signal: timeoutSignal(10000)
    });
    if (!response.ok) throw new Error(`Failed to list diagrams: ${response.status}`);
    const list = (await response.json()) as Array<Record<string, unknown>>;
    return list.map((d) => ({
      id: String(d.id),
      name: String(d.name),
      lastModified: typeof d.lastModified === 'string'
        ? d.lastModified
        : new Date(d.lastModified as string | number | Date).toISOString(),
      folderId: (d.folderId as string | null | undefined) ?? null,
      deletedAt: (d.deletedAt as string | undefined) ?? undefined
    }));
  }

  private async serverLoadDiagram(id: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/diagrams/${id}`, {
      signal: timeoutSignal(10000)
    });
    if (!response.ok) throw new Error(`Failed to load diagram: ${response.status}`);
    return response.json();
  }

  private async serverSaveDiagram(id: string, data: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/diagrams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leanIfModel(data)),
      signal: timeoutSignal(15000)
    });
    if (!response.ok) throw new Error(`Failed to save diagram: ${response.status}`);
  }

  private async serverCreateDiagram(
    data: unknown,
    folderId?: string | null
  ): Promise<string> {
    // A2/STOR-01: every other write path applies `leanIfModel` (ADR 0003 —
    // strip bundled pack icons, record `requiredPacks`); the server CREATE did
    // not, so on a server deploy the FIRST write of every diagram persisted the
    // whole icon catalog and recorded no pack hint. The very next `saveDiagram`
    // then wrote the lean shape, which is how the drift stayed invisible.
    const lean = leanIfModel(data);
    const body = folderId != null ? { ...(lean as object), folderId } : lean;
    const response = await fetch(`${this.baseUrl}/api/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeoutSignal(15000)
    });
    if (!response.ok) throw new Error(`Failed to create diagram: ${response.status}`);
    const result = await response.json();
    return result.id;
  }

  private async serverDeleteDiagram(id: string, soft = false): Promise<void> {
    if (soft) {
      const response = await fetch(`${this.baseUrl}/api/diagrams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: new Date().toISOString() }),
        signal: timeoutSignal(10000)
      });
      if (!response.ok) throw new Error(`Failed to soft-delete diagram: ${response.status}`);
    } else {
      const response = await fetch(`${this.baseUrl}/api/diagrams/${id}`, {
        method: 'DELETE',
        signal: timeoutSignal(10000)
      });
      if (!response.ok) throw new Error(`Failed to delete diagram: ${response.status}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Diagrams — session storage fallback
  // ---------------------------------------------------------------------------

  /**
   * A2/STOR-05: one corrupt entry used to throw a SyntaxError through EVERY
   * list call and brick the file tree — and in server mode the fallback sits
   * inside the catch, so its throw escaped the try that was meant to make
   * listing failure-proof. The one parse in this file that WAS guarded
   * (`renameDiagram`'s blob) survived, which is what made the omission a
   * sibling-drift bug rather than a design. Degrade to empty and say so.
   */
  private parseOrWarn<T>(raw: string | null, fallback: T, label: string): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      console.error(`[LocalStorageProvider] ${label} is corrupt — ignoring it`, e);
      return fallback;
    }
  }

  private sessionListDiagrams(folderId?: string | null): DiagramMeta[] {
    const list = this.parseOrWarn<DiagramMeta[]>(
      sessionStorage.getItem(SESSION_DIAGRAMS_KEY),
      [],
      SESSION_DIAGRAMS_KEY
    );
    if (!Array.isArray(list)) return [];
    if (folderId === undefined) return list;
    return list.filter((d) => d.folderId === folderId);
  }

  private sessionLoadDiagram(id: string): unknown {
    const raw = sessionStorage.getItem(`${SESSION_DIAGRAM_PREFIX}${id}`);
    if (!raw) throw new Error('Diagram not found');
    return JSON.parse(raw);
  }

  private sessionSaveDiagram(id: string, data: unknown): void {
    const lean = leanIfModel(data);
    const blobKey = `${SESSION_DIAGRAM_PREFIX}${id}`;
    const previousBlob = sessionStorage.getItem(blobKey);
    sessionStorage.setItem(blobKey, JSON.stringify(lean));
    const list = this.sessionListDiagrams();
    const idx = list.findIndex((d) => d.id === id);
    const existing = idx >= 0 ? list[idx] : undefined;
    const blob: PersistedDiagramBlob = isPersistedDiagramBlob(data) ? data : {};
    const name = blob.name || blob.title || existing?.name || 'Untitled Diagram';
    // Preserve the existing meta's folderId when the save payload doesn't carry one.
    // Autosave strips folderId from the model; without this fallback every autosave
    // would relocate the diagram to root.
    const folderId =
      blob.folderId !== undefined ? blob.folderId : existing?.folderId ?? null;
    const meta: DiagramMeta = {
      id,
      name,
      lastModified: new Date().toISOString(),
      folderId
    };
    if (idx >= 0) list[idx] = meta;
    else list.push(meta);
    try {
      sessionStorage.setItem(SESSION_DIAGRAMS_KEY, JSON.stringify(list));
    } catch (e) {
      // A2/STOR-06: the blob is written first, so a quota failure on the INDEX
      // used to leave unreachable bytes on a 5 MB budget — a diagram no listing
      // shows and nothing can delete. Undo the blob write before rethrowing, so
      // the failure costs the save but not the budget.
      if (previousBlob === null) sessionStorage.removeItem(blobKey);
      else sessionStorage.setItem(blobKey, previousBlob);
      throw e;
    }
    // Notify subscribers (storage gauge) — sessionStorage has no native cross-component event.
    this.notifySessionChanged();
  }

  /**
   * A2/STOR-07: only SOME session write paths dispatched this, so the storage
   * gauge and the `sessionWorkUnexported` export guard missed renames, restores
   * and moves. One helper, called by every path that mutates the session place.
   */
  private notifySessionChanged(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('axoview-session-changed'));
    }
  }

  private sessionCreateDiagram(data: unknown, folderId?: string | null): string {
    const id = `diagram_${uniqueSuffix()}`;
    const dataWithFolder = folderId != null ? { ...(data as object), folderId } : data;
    this.sessionSaveDiagram(id, dataWithFolder);
    return id;
  }

  private sessionDeleteDiagram(id: string, soft = false): void {
    const list = this.sessionListDiagrams();
    if (soft) {
      const idx = list.findIndex((d) => d.id === id);
      if (idx >= 0) list[idx] = { ...list[idx], deletedAt: new Date().toISOString() };
      sessionStorage.setItem(SESSION_DIAGRAMS_KEY, JSON.stringify(list));
    } else {
      sessionStorage.removeItem(`${SESSION_DIAGRAM_PREFIX}${id}`);
      sessionStorage.setItem(
        SESSION_DIAGRAMS_KEY,
        JSON.stringify(list.filter((d) => d.id !== id))
      );
    }
    this.notifySessionChanged();
  }

  // ---------------------------------------------------------------------------
  // StorageProvider — Diagrams
  // ---------------------------------------------------------------------------

  /**
   * A2/STOR-04: the read paths swap the whole workspace for the empty per-tab
   * session one on ANY server error, with no error surfaced anywhere — while
   * the paired WRITE on the same provider in the same state still targets the
   * server and throws. The read half and the write half disagreed about whether
   * the backend exists, silently. The fallback stays (a transient blip should
   * not empty the screen with an exception), but it is now audible: one console
   * error, and a window event the shell can surface.
   */
  private reportServerFallback(op: string, e: unknown): void {
    console.error(
      `[LocalStorageProvider] server ${op} failed — falling back to this tab's session storage. Saves still target the server.`,
      e
    );
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('axoview-server-unreachable', { detail: { op } })
      );
    }
  }

  async listDiagrams(folderId?: string | null): Promise<DiagramMeta[]> {
    if (this.usingServer) {
      try {
        return await this.serverListDiagrams(folderId);
      } catch (e) {
        this.reportServerFallback('listDiagrams', e);
        return this.sessionListDiagrams(folderId);
      }
    }
    return this.sessionListDiagrams(folderId);
  }

  async loadDiagram(id: string): Promise<unknown> {
    if (this.usingServer) {
      try {
        return await this.serverLoadDiagram(id);
      } catch (e) {
        this.reportServerFallback('loadDiagram', e);
        return this.sessionLoadDiagram(id);
      }
    }
    return this.sessionLoadDiagram(id);
  }

  async saveDiagram(id: string, data: unknown): Promise<void> {
    if (this.usingServer) {
      await this.serverSaveDiagram(id, data);
    } else {
      this.sessionSaveDiagram(id, data);
    }
  }

  async createDiagram(data: unknown, folderId?: string | null): Promise<string> {
    if (this.usingServer) {
      return this.serverCreateDiagram(data, folderId);
    }
    return this.sessionCreateDiagram(data, folderId);
  }

  async deleteDiagram(id: string, soft = false): Promise<void> {
    if (this.usingServer) {
      await this.serverDeleteDiagram(id, soft);
    } else {
      this.sessionDeleteDiagram(id, soft);
    }
  }

  async restoreDiagram(id: string): Promise<void> {
    if (this.usingServer) {
      const response = await fetch(`${this.baseUrl}/api/diagrams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: null }),
        signal: timeoutSignal(10000)
      });
      if (!response.ok) throw new Error(`Failed to restore diagram: ${response.status}`);
    } else {
      const list = this.sessionListDiagrams();
      const updated = list.map((d) =>
        d.id === id ? { ...d, deletedAt: undefined } : d
      );
      sessionStorage.setItem(SESSION_DIAGRAMS_KEY, JSON.stringify(updated));
      this.notifySessionChanged(); // A2/STOR-07
    }
  }

  async renameDiagram(id: string, name: string): Promise<void> {
    if (this.usingServer) {
      const response = await fetch(`${this.baseUrl}/api/diagrams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, title: name }),
        signal: timeoutSignal(10000)
      });
      if (!response.ok) throw new Error(`Failed to rename diagram: ${response.status}`);
    } else {
      // MQA #14: keep the per-diagram blob's `title` in sync with the list-level
      // `name`. The export path reads from the blob (`loadDiagram`), so renaming
      // only the listing left exports stuck on the old title for any diagram
      // that wasn't reopened after rename. Update both atomically here.
      const list = this.sessionListDiagrams();
      const updated = list.map((d) =>
        d.id === id ? { ...d, name } : d
      );
      sessionStorage.setItem(SESSION_DIAGRAMS_KEY, JSON.stringify(updated));

      const blobKey = `${SESSION_DIAGRAM_PREFIX}${id}`;
      const blobRaw = sessionStorage.getItem(blobKey);
      if (blobRaw) {
        try {
          const blob = JSON.parse(blobRaw);
          if (blob && typeof blob === 'object') {
            blob.title = name;
            blob.name = name;
            sessionStorage.setItem(blobKey, JSON.stringify(blob));
          }
        } catch {
          // Corrupted blob — leave the listing rename in place but don't crash.
        }
      }
      this.notifySessionChanged(); // A2/STOR-07
    }
  }

  // ---------------------------------------------------------------------------
  // Folders — server path
  // ---------------------------------------------------------------------------

  private async serverListFolders(parentId?: string | null): Promise<FolderMeta[]> {
    const params = parentId != null ? `?parentId=${encodeURIComponent(parentId)}` : '';
    const response = await fetch(`${this.baseUrl}/api/folders${params}`, {
      signal: timeoutSignal(10000)
    });
    if (!response.ok) throw new Error(`Failed to list folders: ${response.status}`);
    return response.json();
  }

  private async serverCreateFolder(
    name: string,
    parentId?: string | null
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId: parentId ?? null }),
      signal: timeoutSignal(10000)
    });
    if (!response.ok) throw new Error(`Failed to create folder: ${response.status}`);
    const result = await response.json();
    return result.id;
  }

  private async serverDeleteFolder(id: string, recursive: boolean): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/folders/${id}?recursive=${recursive}`,
      { method: 'DELETE', signal: timeoutSignal(10000) }
    );
    if (!response.ok) throw new Error(`Failed to delete folder: ${response.status}`);
  }

  private async serverRenameFolder(id: string, name: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: timeoutSignal(10000)
    });
    if (!response.ok) throw new Error(`Failed to rename folder: ${response.status}`);
  }

  private async serverMoveItem(
    id: string,
    type: 'diagram' | 'folder',
    targetFolderId: string | null
  ): Promise<void> {
    const endpoint =
      type === 'diagram'
        ? `${this.baseUrl}/api/diagrams/${id}/move`
        : `${this.baseUrl}/api/folders/${id}/move`;
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetFolderId }),
      signal: timeoutSignal(10000)
    });
    if (!response.ok) throw new Error(`Failed to move item: ${response.status}`);
  }

  // ---------------------------------------------------------------------------
  // Folders — localStorage fallback
  // ---------------------------------------------------------------------------

  private localGetFolders(): FolderMeta[] {
    const folders = this.parseOrWarn<FolderMeta[]>(
      localStorage.getItem(LOCAL_FOLDERS_KEY),
      [],
      LOCAL_FOLDERS_KEY
    );
    return Array.isArray(folders) ? folders : [];
  }

  private localSaveFolders(folders: FolderMeta[]): void {
    localStorage.setItem(LOCAL_FOLDERS_KEY, JSON.stringify(folders));
  }

  private localListFolders(parentId?: string | null): FolderMeta[] {
    const all = this.localGetFolders();
    if (parentId === undefined) return all;
    return all.filter((f) => f.parentId === parentId);
  }

  private localCreateFolder(name: string, parentId?: string | null): string {
    const folders = this.localGetFolders();
    const id = `folder_${uniqueSuffix()}`;
    folders.push({ id, name, parentId: parentId ?? null });
    this.localSaveFolders(folders);
    return id;
  }

  private localDeleteFolder(id: string, recursive: boolean): void {
    let folders = this.localGetFolders();
    // Captured BEFORE the delete: where the folder's contents go when the
    // caller asked for a non-recursive delete.
    const parentOfDeleted = folders.find((f) => f.id === id)?.parentId ?? null;
    const removed = new Set<string>();
    if (recursive) {
      const collect = (fid: string) => {
        if (removed.has(fid)) return; // a corrupt parent cycle must not hang
        removed.add(fid);
        folders.filter((f) => f.parentId === fid).forEach((f) => collect(f.id));
      };
      collect(id);
      folders = folders.filter((f) => !removed.has(f.id));
    } else {
      removed.add(id);
      folders = folders.filter((f) => f.id !== id);
      // A2/STOR-02: `recursive` only ever widened the FOLDER sweep, so a
      // non-recursive delete left child folders with a dangling `parentId`.
      // Re-parent them to where their parent was, which is what every file
      // manager does with a non-recursive delete.
      folders = folders.map((f) =>
        f.parentId === id ? { ...f, parentId: parentOfDeleted } : f
      );
    }
    this.localSaveFolders(folders);

    // A2/STOR-03: the diagrams INSIDE the folder were never touched, so they
    // stayed in `axoview_diagrams` pointing at a folder that no longer exists —
    // invisible in the tree, still counted by every `listDiagrams()` consumer,
    // still consuming the 5 MB budget, and unreachable by any UI. A recursive
    // delete removes them; a non-recursive one moves them to the deleted
    // folder's parent, alongside the child folders above.
    const list = this.sessionListDiagrams();
    const affected = list.filter(
      (d) => d.folderId != null && removed.has(d.folderId)
    );
    if (affected.length === 0) return;

    if (recursive) {
      affected.forEach((d) =>
        sessionStorage.removeItem(`${SESSION_DIAGRAM_PREFIX}${d.id}`)
      );
      const keep = list.filter((d) => !affected.some((a) => a.id === d.id));
      sessionStorage.setItem(SESSION_DIAGRAMS_KEY, JSON.stringify(keep));
    } else {
      const moved = list.map((d) =>
        d.folderId != null && removed.has(d.folderId)
          ? { ...d, folderId: parentOfDeleted }
          : d
      );
      sessionStorage.setItem(SESSION_DIAGRAMS_KEY, JSON.stringify(moved));
    }
    this.notifySessionChanged();
  }

  private localRenameFolder(id: string, name: string): void {
    const folders = this.localGetFolders().map((f) =>
      f.id === id ? { ...f, name } : f
    );
    this.localSaveFolders(folders);
  }

  private localMoveItem(
    id: string,
    type: 'diagram' | 'folder',
    targetFolderId: string | null
  ): void {
    if (type === 'folder') {
      const folders = this.localGetFolders().map((f) =>
        f.id === id ? { ...f, parentId: targetFolderId } : f
      );
      this.localSaveFolders(folders);
    } else {
      const list = this.sessionListDiagrams();
      const updated = list.map((d) =>
        d.id === id ? { ...d, folderId: targetFolderId } : d
      );
      sessionStorage.setItem(SESSION_DIAGRAMS_KEY, JSON.stringify(updated));
      this.notifySessionChanged(); // A2/STOR-07
    }
  }

  // ---------------------------------------------------------------------------
  // StorageProvider — Folders
  // ---------------------------------------------------------------------------

  async listFolders(parentId?: string | null): Promise<FolderMeta[]> {
    if (this.usingServer) {
      try {
        return await this.serverListFolders(parentId);
      } catch (e) {
        this.reportServerFallback('listFolders', e);
        return this.localListFolders(parentId);
      }
    }
    return this.localListFolders(parentId);
  }

  async createFolder(name: string, parentId?: string | null): Promise<string> {
    if (this.usingServer) {
      return this.serverCreateFolder(name, parentId);
    }
    return this.localCreateFolder(name, parentId);
  }

  async deleteFolder(id: string, recursive: boolean): Promise<void> {
    if (this.usingServer) {
      await this.serverDeleteFolder(id, recursive);
    } else {
      this.localDeleteFolder(id, recursive);
    }
  }

  async renameFolder(id: string, name: string): Promise<void> {
    if (this.usingServer) {
      await this.serverRenameFolder(id, name);
    } else {
      this.localRenameFolder(id, name);
    }
  }

  async moveItem(
    id: string,
    type: 'diagram' | 'folder',
    targetFolderId: string | null
  ): Promise<void> {
    if (this.usingServer) {
      await this.serverMoveItem(id, type, targetFolderId);
    } else {
      this.localMoveItem(id, type, targetFolderId);
    }
  }

  // ---------------------------------------------------------------------------
  // Tree manifest
  // ---------------------------------------------------------------------------

  async getTreeManifest(): Promise<TreeManifest> {
    if (this.usingServer) {
      try {
        const response = await fetch(`${this.baseUrl}/api/tree-manifest`, {
          signal: timeoutSignal(10000)
        });
        if (!response.ok) throw new Error('Failed to get tree manifest');
        return response.json();
      } catch (e) {
        this.reportServerFallback('getTreeManifest', e);
      }
    }
    const manifest = this.parseOrWarn<TreeManifest>(
      localStorage.getItem(LOCAL_MANIFEST_KEY),
      { folders: [] },
      LOCAL_MANIFEST_KEY
    );
    return manifest && Array.isArray(manifest.folders)
      ? manifest
      : { folders: [] };
  }

  // ---------------------------------------------------------------------------
  // Share — server-only (snapshot to public namespace)
  // ---------------------------------------------------------------------------

  async shareDiagram(id: string): Promise<{ uuid: string; url: string; sharedAt: string }> {
    if (!this.usingServer) {
      throw new Error('Sharing requires server storage');
    }
    const response = await fetch(`${this.baseUrl}/api/diagrams/${id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeoutSignal(10000)
    });
    if (!response.ok) throw new Error(`Share failed: ${response.status}`);
    return response.json();
  }

  async unshareDiagram(id: string): Promise<void> {
    if (!this.usingServer) return;
    const response = await fetch(`${this.baseUrl}/api/diagrams/${id}/share`, {
      method: 'DELETE',
      signal: timeoutSignal(10000)
    });
    if (!response.ok) throw new Error(`Unshare failed: ${response.status}`);
  }

  async saveTreeManifest(manifest: TreeManifest): Promise<void> {
    if (this.usingServer) {
      try {
        const response = await fetch(`${this.baseUrl}/api/tree-manifest`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(manifest),
          signal: timeoutSignal(10000)
        });
        if (!response.ok) throw new Error('Failed to save tree manifest');
        // A2/STOR-16: on success, drop any local copy a previous failed save
        // left behind, so the two stores cannot disagree later.
        localStorage.removeItem(LOCAL_MANIFEST_KEY);
        return;
      } catch (e) {
        // A2/STOR-16: this used to write localStorage and RESOLVE, so the user
        // saw a successful reorder — and `getTreeManifest` prefers the server
        // copy, so the ordering silently reverted on the next healthy read. The
        // read and write halves fell back to the same store with opposite
        // authority. In server mode the server owns the manifest: report the
        // failure instead of pretending, and leave no local copy to shadow it.
        console.error('[LocalStorageProvider] tree manifest save failed', e);
        throw e instanceof Error ? e : new Error('Failed to save tree manifest');
      }
    }
    localStorage.setItem(LOCAL_MANIFEST_KEY, JSON.stringify(manifest));
  }
}
