import {
  DiagramMeta,
  FolderMeta,
  StorageProvider,
  TreeManifest
} from '../types';

const SESSION_DIAGRAMS_KEY = 'fossflow_diagrams';
const SESSION_DIAGRAM_PREFIX = 'fossflow_diagram_';
const LOCAL_FOLDERS_KEY = 'fossflow-folders';
const LOCAL_MANIFEST_KEY = 'fossflow-tree-manifest';

/** Builds an AbortSignal with timeout, falling back gracefully if unavailable. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

function devBaseUrl(): string {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost' &&
    window.location.port === '3000'
  ) {
    return 'http://localhost:3001';
  }
  return '';
}

export class LocalStorageProvider implements StorageProvider {
  readonly id = 'local' as const;
  readonly displayName = 'Local Storage';
  readonly requiresAuth = false;

  /** True when server storage resolved as available during the last isAvailable() call */
  usingServer = false;

  private readonly baseUrl: string;
  private serverAvailable: boolean | null = null;
  private serverCheckedAt: number | null = null;
  private readonly AVAILABILITY_CACHE_MS = 60000;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? devBaseUrl();
  }

  // ---------------------------------------------------------------------------
  // Availability
  // ---------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (
      this.serverAvailable !== null &&
      this.serverCheckedAt !== null &&
      now - this.serverCheckedAt < this.AVAILABILITY_CACHE_MS
    ) {
      return true; // provider is always available (server or fallback)
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/storage/status`, {
        signal: timeoutSignal(5000)
      });
      const data = await response.json();
      this.serverAvailable = !!data.enabled;
    } catch {
      this.serverAvailable = false;
    }

    this.usingServer = this.serverAvailable === true;
    this.serverCheckedAt = Date.now();
    return true; // always available
  }

  private async ensureChecked(): Promise<void> {
    if (this.serverAvailable === null) {
      await this.isAvailable();
    }
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
    const list = await response.json();
    return list.map((d: any) => ({
      id: d.id,
      name: d.name,
      lastModified: typeof d.lastModified === 'string'
        ? d.lastModified
        : new Date(d.lastModified).toISOString(),
      folderId: d.folderId ?? null,
      deletedAt: d.deletedAt ?? undefined
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
      body: JSON.stringify(data),
      signal: timeoutSignal(15000)
    });
    if (!response.ok) throw new Error(`Failed to save diagram: ${response.status}`);
  }

  private async serverCreateDiagram(
    data: unknown,
    folderId?: string | null
  ): Promise<string> {
    const body = folderId != null ? { ...(data as object), folderId } : data;
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

  private sessionListDiagrams(folderId?: string | null): DiagramMeta[] {
    const raw = sessionStorage.getItem(SESSION_DIAGRAMS_KEY);
    if (!raw) return [];
    const list: DiagramMeta[] = JSON.parse(raw);
    if (folderId === undefined) return list;
    return list.filter((d) => d.folderId === folderId);
  }

  private sessionLoadDiagram(id: string): unknown {
    const raw = sessionStorage.getItem(`${SESSION_DIAGRAM_PREFIX}${id}`);
    if (!raw) throw new Error('Diagram not found');
    return JSON.parse(raw);
  }

  private sessionSaveDiagram(id: string, data: unknown): void {
    sessionStorage.setItem(`${SESSION_DIAGRAM_PREFIX}${id}`, JSON.stringify(data));
    const list = this.sessionListDiagrams();
    const name = (data as any)?.name || (data as any)?.title || 'Untitled Diagram';
    const meta: DiagramMeta = {
      id,
      name,
      lastModified: new Date().toISOString(),
      folderId: (data as any)?.folderId ?? null
    };
    const idx = list.findIndex((d) => d.id === id);
    if (idx >= 0) list[idx] = meta;
    else list.push(meta);
    sessionStorage.setItem(SESSION_DIAGRAMS_KEY, JSON.stringify(list));
  }

  private sessionCreateDiagram(data: unknown, folderId?: string | null): string {
    const id = `diagram_${Date.now()}`;
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
  }

  // ---------------------------------------------------------------------------
  // StorageProvider — Diagrams
  // ---------------------------------------------------------------------------

  async listDiagrams(folderId?: string | null): Promise<DiagramMeta[]> {
    await this.ensureChecked();
    if (this.usingServer) {
      try {
        return await this.serverListDiagrams(folderId);
      } catch {
        return this.sessionListDiagrams(folderId);
      }
    }
    return this.sessionListDiagrams(folderId);
  }

  async loadDiagram(id: string): Promise<unknown> {
    await this.ensureChecked();
    if (this.usingServer) {
      try {
        return await this.serverLoadDiagram(id);
      } catch {
        return this.sessionLoadDiagram(id);
      }
    }
    return this.sessionLoadDiagram(id);
  }

  async saveDiagram(id: string, data: unknown): Promise<void> {
    await this.ensureChecked();
    if (this.usingServer) {
      await this.serverSaveDiagram(id, data);
    } else {
      this.sessionSaveDiagram(id, data);
    }
  }

  async createDiagram(data: unknown, folderId?: string | null): Promise<string> {
    await this.ensureChecked();
    if (this.usingServer) {
      return this.serverCreateDiagram(data, folderId);
    }
    return this.sessionCreateDiagram(data, folderId);
  }

  async deleteDiagram(id: string, soft = false): Promise<void> {
    await this.ensureChecked();
    if (this.usingServer) {
      await this.serverDeleteDiagram(id, soft);
    } else {
      this.sessionDeleteDiagram(id, soft);
    }
  }

  async restoreDiagram(id: string): Promise<void> {
    await this.ensureChecked();
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
    }
  }

  async renameDiagram(id: string, name: string): Promise<void> {
    await this.ensureChecked();
    if (this.usingServer) {
      const response = await fetch(`${this.baseUrl}/api/diagrams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, title: name }),
        signal: timeoutSignal(10000)
      });
      if (!response.ok) throw new Error(`Failed to rename diagram: ${response.status}`);
    } else {
      const list = this.sessionListDiagrams();
      const updated = list.map((d) =>
        d.id === id ? { ...d, name } : d
      );
      sessionStorage.setItem(SESSION_DIAGRAMS_KEY, JSON.stringify(updated));
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
    const raw = localStorage.getItem(LOCAL_FOLDERS_KEY);
    return raw ? JSON.parse(raw) : [];
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
    const id = `folder_${Date.now()}`;
    folders.push({ id, name, parentId: parentId ?? null });
    this.localSaveFolders(folders);
    return id;
  }

  private localDeleteFolder(id: string, recursive: boolean): void {
    let folders = this.localGetFolders();
    if (recursive) {
      const toDelete = new Set<string>();
      const collect = (fid: string) => {
        toDelete.add(fid);
        folders.filter((f) => f.parentId === fid).forEach((f) => collect(f.id));
      };
      collect(id);
      folders = folders.filter((f) => !toDelete.has(f.id));
    } else {
      folders = folders.filter((f) => f.id !== id);
    }
    this.localSaveFolders(folders);
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
    }
  }

  // ---------------------------------------------------------------------------
  // StorageProvider — Folders
  // ---------------------------------------------------------------------------

  async listFolders(parentId?: string | null): Promise<FolderMeta[]> {
    await this.ensureChecked();
    if (this.usingServer) {
      try {
        return await this.serverListFolders(parentId);
      } catch {
        return this.localListFolders(parentId);
      }
    }
    return this.localListFolders(parentId);
  }

  async createFolder(name: string, parentId?: string | null): Promise<string> {
    await this.ensureChecked();
    if (this.usingServer) {
      return this.serverCreateFolder(name, parentId);
    }
    return this.localCreateFolder(name, parentId);
  }

  async deleteFolder(id: string, recursive: boolean): Promise<void> {
    await this.ensureChecked();
    if (this.usingServer) {
      await this.serverDeleteFolder(id, recursive);
    } else {
      this.localDeleteFolder(id, recursive);
    }
  }

  async renameFolder(id: string, name: string): Promise<void> {
    await this.ensureChecked();
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
    await this.ensureChecked();
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
    await this.ensureChecked();
    if (this.usingServer) {
      try {
        const response = await fetch(`${this.baseUrl}/api/tree-manifest`, {
          signal: timeoutSignal(10000)
        });
        if (!response.ok) throw new Error('Failed to get tree manifest');
        return response.json();
      } catch {
        // fall through to localStorage
      }
    }
    const raw = localStorage.getItem(LOCAL_MANIFEST_KEY);
    return raw ? JSON.parse(raw) : { folders: [] };
  }

  async saveTreeManifest(manifest: TreeManifest): Promise<void> {
    await this.ensureChecked();
    if (this.usingServer) {
      try {
        const response = await fetch(`${this.baseUrl}/api/tree-manifest`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(manifest),
          signal: timeoutSignal(10000)
        });
        if (!response.ok) throw new Error('Failed to save tree manifest');
        return;
      } catch {
        // fall through to localStorage
      }
    }
    localStorage.setItem(LOCAL_MANIFEST_KEY, JSON.stringify(manifest));
  }
}
