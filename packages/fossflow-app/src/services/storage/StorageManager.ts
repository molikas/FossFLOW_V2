import {
  DiagramMeta,
  FolderMeta,
  StorageProvider,
  TreeManifest
} from './types';

/**
 * Provider registry that delegates all StorageProvider calls to the currently
 * active provider. Components depend only on StorageProvider — switching
 * providers (local → Drive → S3) requires no component changes.
 */
export class StorageManager implements StorageProvider {
  readonly id = 'local' as const; // reflects active provider — updated on switch
  readonly displayName = 'Storage Manager';
  readonly requiresAuth = false;

  private registry = new Map<string, StorageProvider>();
  private active: StorageProvider | null = null;

  /** True when the active local provider resolved to server-backed mode */
  serverStorageAvailable = false;

  // ---------------------------------------------------------------------------
  // Registry management
  // ---------------------------------------------------------------------------

  registerProvider(provider: StorageProvider): void {
    this.registry.set(provider.id, provider);
  }

  setActiveProvider(id: string): void {
    const provider = this.registry.get(id);
    if (!provider) throw new Error(`Storage provider "${id}" is not registered`);
    this.active = provider;
  }

  getActiveProvider(): StorageProvider {
    if (!this.active) throw new Error('No active storage provider. Call setActiveProvider() first.');
    return this.active;
  }

  /**
   * Call once after registering providers. Resolves server availability and
   * sets serverStorageAvailable.
   */
  async initialize(): Promise<void> {
    const provider = this.getActiveProvider();
    await provider.isAvailable();
    // Check if the active local provider resolved to server mode
    if ('usingServer' in provider) {
      this.serverStorageAvailable = (provider as any).usingServer === true;
    }
  }

  // ---------------------------------------------------------------------------
  // StorageProvider delegation
  // ---------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    return this.getActiveProvider().isAvailable();
  }

  async listDiagrams(folderId?: string | null): Promise<DiagramMeta[]> {
    return this.getActiveProvider().listDiagrams(folderId);
  }

  async loadDiagram(id: string): Promise<unknown> {
    return this.getActiveProvider().loadDiagram(id);
  }

  async saveDiagram(id: string, data: unknown): Promise<void> {
    return this.getActiveProvider().saveDiagram(id, data);
  }

  async createDiagram(data: unknown, folderId?: string | null): Promise<string> {
    return this.getActiveProvider().createDiagram(data, folderId);
  }

  async deleteDiagram(id: string, soft?: boolean): Promise<void> {
    return this.getActiveProvider().deleteDiagram(id, soft);
  }

  async restoreDiagram(id: string): Promise<void> {
    return this.getActiveProvider().restoreDiagram(id);
  }

  async renameDiagram(id: string, name: string): Promise<void> {
    return this.getActiveProvider().renameDiagram(id, name);
  }

  async listFolders(parentId?: string | null): Promise<FolderMeta[]> {
    return this.getActiveProvider().listFolders(parentId);
  }

  async createFolder(name: string, parentId?: string | null): Promise<string> {
    return this.getActiveProvider().createFolder(name, parentId);
  }

  async deleteFolder(id: string, recursive: boolean): Promise<void> {
    return this.getActiveProvider().deleteFolder(id, recursive);
  }

  async renameFolder(id: string, name: string): Promise<void> {
    return this.getActiveProvider().renameFolder(id, name);
  }

  async moveItem(
    id: string,
    type: 'diagram' | 'folder',
    targetFolderId: string | null
  ): Promise<void> {
    return this.getActiveProvider().moveItem(id, type, targetFolderId);
  }

  async getTreeManifest(): Promise<TreeManifest> {
    return this.getActiveProvider().getTreeManifest();
  }

  async saveTreeManifest(manifest: TreeManifest): Promise<void> {
    return this.getActiveProvider().saveTreeManifest(manifest);
  }

  subscribe?(diagramId: string, callback: () => void): () => void {
    const provider = this.getActiveProvider();
    if (provider.subscribe) return provider.subscribe(diagramId, callback);
    return () => {};
  }
}
