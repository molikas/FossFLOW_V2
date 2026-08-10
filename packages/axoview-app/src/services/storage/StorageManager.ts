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

  /** The id of the currently active provider (defaults to 'local' pre-init). */
  get activeProviderId(): string {
    return this.active?.id ?? 'local';
  }

  /** Look up a registered provider without making it active (e.g. "Save to Drive"). */
  getProvider(id: string): StorageProvider | undefined {
    return this.registry.get(id);
  }

  /**
   * Boot-time setter (ADR 0009 D2 — dual-probe collapse). AppStorageContext
   * derives this from `/api/config`'s `serverStorage` flag and pushes it into
   * the manager + the active provider's `usingServer` field. Replaces the
   * prior `initialize()` flow that probed `/api/storage/status`.
   */
  setServerStorage(available: boolean): void {
    this.serverStorageAvailable = available;
    // Every registered provider, not just the active one (A2/STOR-10): whether
    // the deploy is server-backed is a property of the deploy, and pushing it
    // onto whichever provider happened to be active when boot finished left the
    // others answering from a mode they were never told about.
    this.registry.forEach((provider) => {
      if ('usingServer' in provider) {
        (provider as StorageProvider & { usingServer: boolean }).usingServer = available;
      }
    });
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

  async shareDiagram(id: string): Promise<{ uuid: string; url: string; sharedAt: string }> {
    const provider = this.getActiveProvider();
    if (!provider.shareDiagram) {
      throw new Error(`${provider.displayName} does not support sharing`);
    }
    return provider.shareDiagram(id);
  }

  async unshareDiagram(id: string): Promise<void> {
    const provider = this.getActiveProvider();
    if (!provider.unshareDiagram) return;
    return provider.unshareDiagram(id);
  }

  subscribe?(diagramId: string, callback: () => void): () => void {
    const provider = this.getActiveProvider();
    if (provider.subscribe) return provider.subscribe(diagramId, callback);
    return () => {};
  }
}
