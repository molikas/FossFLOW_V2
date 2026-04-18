import {
  DiagramMeta,
  FolderMeta,
  NotImplementedError,
  StorageProvider,
  TreeManifest
} from '../types';

export class S3Provider implements StorageProvider {
  readonly id = 's3' as const;
  readonly displayName = 'Amazon S3';
  readonly requiresAuth = true;

  async isAvailable(): Promise<boolean> {
    throw new NotImplementedError('S3Provider.isAvailable');
  }

  async listDiagrams(_folderId?: string | null): Promise<DiagramMeta[]> {
    throw new NotImplementedError('S3Provider.listDiagrams');
  }

  async loadDiagram(_id: string): Promise<unknown> {
    throw new NotImplementedError('S3Provider.loadDiagram');
  }

  async saveDiagram(_id: string, _data: unknown): Promise<void> {
    throw new NotImplementedError('S3Provider.saveDiagram');
  }

  async createDiagram(_data: unknown, _folderId?: string | null): Promise<string> {
    throw new NotImplementedError('S3Provider.createDiagram');
  }

  async deleteDiagram(_id: string, _soft?: boolean): Promise<void> {
    throw new NotImplementedError('S3Provider.deleteDiagram');
  }

  async restoreDiagram(_id: string): Promise<void> {
    throw new NotImplementedError('S3Provider.restoreDiagram');
  }

  async renameDiagram(_id: string, _name: string): Promise<void> {
    throw new NotImplementedError('S3Provider.renameDiagram');
  }

  async listFolders(_parentId?: string | null): Promise<FolderMeta[]> {
    throw new NotImplementedError('S3Provider.listFolders');
  }

  async createFolder(_name: string, _parentId?: string | null): Promise<string> {
    throw new NotImplementedError('S3Provider.createFolder');
  }

  async deleteFolder(_id: string, _recursive: boolean): Promise<void> {
    throw new NotImplementedError('S3Provider.deleteFolder');
  }

  async renameFolder(_id: string, _name: string): Promise<void> {
    throw new NotImplementedError('S3Provider.renameFolder');
  }

  async moveItem(
    _id: string,
    _type: 'diagram' | 'folder',
    _targetFolderId: string | null
  ): Promise<void> {
    throw new NotImplementedError('S3Provider.moveItem');
  }

  async getTreeManifest(): Promise<TreeManifest> {
    throw new NotImplementedError('S3Provider.getTreeManifest');
  }

  async saveTreeManifest(_manifest: TreeManifest): Promise<void> {
    throw new NotImplementedError('S3Provider.saveTreeManifest');
  }
}
