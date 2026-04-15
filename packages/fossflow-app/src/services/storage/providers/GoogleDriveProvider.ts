import {
  DiagramMeta,
  FolderMeta,
  NotImplementedError,
  StorageProvider,
  TreeManifest
} from '../types';

export class GoogleDriveProvider implements StorageProvider {
  readonly id = 'google-drive' as const;
  readonly displayName = 'Google Drive';
  readonly requiresAuth = true;

  async isAvailable(): Promise<boolean> {
    throw new NotImplementedError('GoogleDriveProvider.isAvailable');
  }

  async listDiagrams(_folderId?: string | null): Promise<DiagramMeta[]> {
    throw new NotImplementedError('GoogleDriveProvider.listDiagrams');
  }

  async loadDiagram(_id: string): Promise<unknown> {
    throw new NotImplementedError('GoogleDriveProvider.loadDiagram');
  }

  async saveDiagram(_id: string, _data: unknown): Promise<void> {
    throw new NotImplementedError('GoogleDriveProvider.saveDiagram');
  }

  async createDiagram(_data: unknown, _folderId?: string | null): Promise<string> {
    throw new NotImplementedError('GoogleDriveProvider.createDiagram');
  }

  async deleteDiagram(_id: string, _soft?: boolean): Promise<void> {
    throw new NotImplementedError('GoogleDriveProvider.deleteDiagram');
  }

  async listFolders(_parentId?: string | null): Promise<FolderMeta[]> {
    throw new NotImplementedError('GoogleDriveProvider.listFolders');
  }

  async createFolder(_name: string, _parentId?: string | null): Promise<string> {
    throw new NotImplementedError('GoogleDriveProvider.createFolder');
  }

  async deleteFolder(_id: string, _recursive: boolean): Promise<void> {
    throw new NotImplementedError('GoogleDriveProvider.deleteFolder');
  }

  async renameFolder(_id: string, _name: string): Promise<void> {
    throw new NotImplementedError('GoogleDriveProvider.renameFolder');
  }

  async moveItem(
    _id: string,
    _type: 'diagram' | 'folder',
    _targetFolderId: string | null
  ): Promise<void> {
    throw new NotImplementedError('GoogleDriveProvider.moveItem');
  }

  async getTreeManifest(): Promise<TreeManifest> {
    throw new NotImplementedError('GoogleDriveProvider.getTreeManifest');
  }

  async saveTreeManifest(_manifest: TreeManifest): Promise<void> {
    throw new NotImplementedError('GoogleDriveProvider.saveTreeManifest');
  }
}
