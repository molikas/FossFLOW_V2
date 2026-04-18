import { useState, useEffect, useCallback, useRef } from 'react';
import type { DiagramMeta, FolderMeta, StorageProvider, TreeManifest } from '../services/storage/types';
import { propagateDirty } from '../utils/fileOperations';

// ---------------------------------------------------------------------------
// FileNode type — used by react-arborist
// ---------------------------------------------------------------------------

export interface FileNode {
  id: string;
  name: string;
  type: 'folder' | 'diagram';
  /** Populated for folders; undefined for leaf diagram nodes */
  children?: FileNode[];
  isDirty?: boolean;
  deletedAt?: string;
  thumbnail?: string;
  /** Original DiagramMeta for diagram nodes */
  diagramMeta?: DiagramMeta;
  /** Original FolderMeta for folder nodes */
  folderMeta?: FolderMeta;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTree(
  folders: FolderMeta[],
  diagrams: DiagramMeta[],
  dirtyMap: Map<string, boolean>,
  parentId: string | null
): FileNode[] {
  const nodes: FileNode[] = [];

  // Active (non-deleted) folders at this level — sorted alphabetically
  const childFolders = folders
    .filter((f) => f.parentId === parentId && !f.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const folder of childFolders) {
    nodes.push({
      id: folder.id,
      name: folder.name,
      type: 'folder',
      isDirty: dirtyMap.get(folder.id) ?? false,
      folderMeta: folder,
      children: buildTree(folders, diagrams, dirtyMap, folder.id)
    });
  }

  // Active (non-deleted) diagrams in this folder — sorted alphabetically
  const folderDiagrams = diagrams
    .filter((d) => d.folderId === parentId && !d.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const diagram of folderDiagrams) {
    nodes.push({
      id: diagram.id,
      name: diagram.name,
      type: 'diagram',
      isDirty: diagram.isDirty ?? false,
      thumbnail: diagram.thumbnail,
      diagramMeta: diagram
    });
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseFileTreeResult {
  treeData: FileNode[];
  trashData: FileNode[];
  isLoading: boolean;
  error: string | null;
  manifest: TreeManifest | null;
  diagrams: DiagramMeta[];
  folders: FolderMeta[];
  refresh: () => Promise<void>;
  // CRUD
  createFolder: (parentId: string | null, name: string) => Promise<string>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string, recursive: boolean) => Promise<void>;
  renameDiagram: (id: string, name: string) => Promise<void>;
  softDeleteDiagram: (id: string) => Promise<void>;
  hardDeleteDiagram: (id: string) => Promise<void>;
  restoreDiagram: (id: string) => Promise<void>;
  moveItem: (id: string, type: 'diagram' | 'folder', targetFolderId: string | null) => Promise<void>;
  updateManifest: (manifest: TreeManifest) => Promise<void>;
  /** Optimistically update a node name without server round-trip */
  optimisticRename: (id: string, name: string) => void;
}

export function useFileTree(
  storage: StorageProvider | null,
  refreshToken: number,
  currentDiagramId?: string | null,
  hasUnsavedChanges?: boolean,
  dirtyDiagramIds?: Set<string>
): UseFileTreeResult {
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([]);
  const [manifest, setManifest] = useState<TreeManifest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageRef = useRef(storage);
  storageRef.current = storage;

  const load = useCallback(async () => {
    const s = storageRef.current;
    if (!s) return;
    setIsLoading(true);
    setError(null);
    try {
      const [allFolders, allDiagrams, treeManifest] = await Promise.all([
        s.listFolders(),
        s.listDiagrams(),
        s.getTreeManifest()
      ]);
      // Normalize to arrays — server may return non-array on error or corrupt data
      setFolders(Array.isArray(allFolders) ? allFolders : []);
      setDiagrams(Array.isArray(allDiagrams) ? allDiagrams : []);
      setManifest(treeManifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load file tree');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reload on mount and when refreshToken changes
  useEffect(() => {
    load();
  }, [load, refreshToken]);

  // Overlay in-memory dirty state: dirtyDiagramIds covers all buffered diagrams;
  // hasUnsavedChanges covers the currently-open diagram specifically.
  const diagramsWithDirty = diagrams.map((d) => {
    const inMemoryDirty = dirtyDiagramIds?.has(d.id) ?? false;
    const isCurrent = d.id === currentDiagramId;
    return { ...d, isDirty: inMemoryDirty || (isCurrent && (hasUnsavedChanges ?? false)) || (d.isDirty ?? false) };
  });

  const dirtyMap = propagateDirty({ folders }, diagramsWithDirty);

  const treeData = buildTree(folders, diagramsWithDirty, dirtyMap, null);

  const trashData: FileNode[] = [
    ...diagramsWithDirty
      .filter((d) => !!d.deletedAt)
      .map((d): FileNode => ({
        id: d.id,
        name: d.name,
        type: 'diagram',
        deletedAt: d.deletedAt,
        thumbnail: d.thumbnail,
        diagramMeta: d
      })),
    ...folders
      .filter((f) => !!f.deletedAt)
      .map((f): FileNode => ({
        id: f.id,
        name: f.name,
        type: 'folder',
        deletedAt: f.deletedAt,
        folderMeta: f
      }))
  ];

  // ---------------------------------------------------------------------------
  // CRUD actions
  // ---------------------------------------------------------------------------

  const createFolder = useCallback(
    async (parentId: string | null, name: string): Promise<string> => {
      if (!storageRef.current) throw new Error('No storage');
      const id = await storageRef.current.createFolder(name, parentId);
      await load();
      return id;
    },
    [load]
  );

  const renameFolder = useCallback(
    async (id: string, name: string): Promise<void> => {
      if (!storageRef.current) throw new Error('No storage');
      await storageRef.current.renameFolder(id, name);
      await load();
    },
    [load]
  );

  const deleteFolder = useCallback(
    async (id: string, recursive: boolean): Promise<void> => {
      if (!storageRef.current) throw new Error('No storage');
      await storageRef.current.deleteFolder(id, recursive);
      await load();
    },
    [load]
  );

  const renameDiagram = useCallback(
    async (id: string, name: string): Promise<void> => {
      if (!storageRef.current) throw new Error('No storage');
      await storageRef.current.renameDiagram(id, name);
      await load();
    },
    [load]
  );

  const softDeleteDiagram = useCallback(
    async (id: string): Promise<void> => {
      if (!storageRef.current) throw new Error('No storage');
      await storageRef.current.deleteDiagram(id, true);
      await load();
    },
    [load]
  );

  const hardDeleteDiagram = useCallback(
    async (id: string): Promise<void> => {
      if (!storageRef.current) throw new Error('No storage');
      await storageRef.current.deleteDiagram(id, false);
      await load();
    },
    [load]
  );

  const restoreDiagram = useCallback(
    async (id: string): Promise<void> => {
      if (!storageRef.current) throw new Error('No storage');
      await storageRef.current.restoreDiagram(id);
      await load();
    },
    [load]
  );

  const moveItem = useCallback(
    async (id: string, type: 'diagram' | 'folder', targetFolderId: string | null): Promise<void> => {
      if (!storageRef.current) throw new Error('No storage');
      await storageRef.current.moveItem(id, type, targetFolderId);
      await load();
    },
    [load]
  );

  const updateManifest = useCallback(
    async (newManifest: TreeManifest): Promise<void> => {
      if (!storageRef.current) throw new Error('No storage');
      await storageRef.current.saveTreeManifest(newManifest);
      setManifest(newManifest);
    },
    []
  );

  const optimisticRename = useCallback((id: string, name: string): void => {
    setDiagrams((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  return {
    treeData,
    trashData,
    isLoading,
    error,
    manifest,
    diagrams: diagramsWithDirty,
    folders,
    refresh: load,
    createFolder,
    renameFolder,
    deleteFolder,
    renameDiagram,
    softDeleteDiagram,
    hardDeleteDiagram,
    restoreDiagram,
    moveItem,
    updateManifest,
    optimisticRename
  };
}
