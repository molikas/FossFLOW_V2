export interface DiagramMeta {
  id: string;
  name: string;
  lastModified: string;    // ISO 8601
  folderId: string | null; // null = root
  isDirty?: boolean;       // client-side only
  thumbnail?: string;      // base64 PNG, generated on save
  lockedBy?: string;       // reserved for P3 collaboration — leave undefined for now
  deletedAt?: string;      // ISO 8601 — soft delete, null = not deleted
}

export interface FolderMeta {
  id: string;
  name: string;
  parentId: string | null;
  isExpanded?: boolean;    // tree UI state
}

export interface TreeManifest {
  folders: FolderMeta[];
  // diagram folderId is stored on DiagramMeta, not here
}

export interface StorageProvider {
  id: 'local' | 'google-drive' | 's3';
  displayName: string;
  requiresAuth: boolean;

  isAvailable(): Promise<boolean>;

  // Diagrams
  listDiagrams(folderId?: string | null): Promise<DiagramMeta[]>;
  loadDiagram(id: string): Promise<unknown>;
  saveDiagram(id: string, data: unknown): Promise<void>;
  createDiagram(data: unknown, folderId?: string | null): Promise<string>;
  deleteDiagram(id: string, soft?: boolean): Promise<void>;

  // Folders
  listFolders(parentId?: string | null): Promise<FolderMeta[]>;
  createFolder(name: string, parentId?: string | null): Promise<string>;
  deleteFolder(id: string, recursive: boolean): Promise<void>;
  renameFolder(id: string, name: string): Promise<void>;
  moveItem(
    id: string,
    type: 'diagram' | 'folder',
    targetFolderId: string | null
  ): Promise<void>;

  // Tree manifest (open/close state, ordering)
  getTreeManifest(): Promise<TreeManifest>;
  saveTreeManifest(manifest: TreeManifest): Promise<void>;

  // Reserved for P3 — no-op stubs for now
  subscribe?(diagramId: string, callback: () => void): () => void;
}

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented for this storage provider`);
    this.name = 'NotImplementedError';
  }
}
