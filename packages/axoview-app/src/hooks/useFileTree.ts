import { useState, useEffect, useCallback, useRef } from 'react';
import type { DiagramMeta, FolderMeta, StorageProvider, TreeManifest } from '../services/storage/types';
import { propagateDirty } from '../utils/fileOperations';

// ---------------------------------------------------------------------------
// FileNode type — used by react-arborist
// ---------------------------------------------------------------------------

/** A storage place a node can live in (places model, 2026-07-06). */
export type PlaceId = 'local' | 'google-drive';

export interface FileNode {
  id: string;
  name: string;
  /**
   * 'place' = a section root ("Google Drive" / "This session");
   * 'placeState' = a synthetic status row inside a section (loading skeleton,
   * sign-in prompt, error, empty hint). Both exist only in the composed
   * dual-place tree — per-provider data contains folders/diagrams only.
   */
  type: 'folder' | 'diagram' | 'place' | 'placeState';
  /** Populated for folders; undefined for leaf diagram nodes */
  children?: FileNode[];
  isDirty?: boolean;
  deletedAt?: string;
  thumbnail?: string;
  /** Original DiagramMeta for diagram nodes */
  diagramMeta?: DiagramMeta;
  /** Original FolderMeta for folder nodes */
  folderMeta?: FolderMeta;
  /** Which storage place this node belongs to (stamped during composition). */
  placeId?: PlaceId;
  /** placeState rows: which state to render. */
  stateKind?: 'loading' | 'signin' | 'reconnect' | 'error' | 'empty' | 'setup' | 'scope';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildTree(
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

/**
 * Lifecycle of one place's tree data. `loading` covers only the FIRST fetch
 * (skeleton-worthy); later refreshes keep `ready` + `isRefreshing` so stale
 * rows stay visible instead of blanking (storage-ux-unification 2026-07-06).
 */
export type FileTreeStatus = 'disabled' | 'loading' | 'ready' | 'error';

export interface UseFileTreeResult {
  treeData: FileNode[];
  trashData: FileNode[];
  isLoading: boolean;
  /** First-load / disabled / ready / error — drives per-section state rows. */
  status: FileTreeStatus;
  /** A refresh is running while data is already shown (thin progress bar). */
  isRefreshing: boolean;
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
  dirtyDiagramIds?: Set<string>,
  /** Active provider id — a change drops stale cross-provider nodes immediately. */
  providerId?: string,
  /**
   * Gate for providers that need preconditions (Drive needs a token): while
   * false, data is cleared and no fetch fires; flipping to true loads fresh.
   */
  enabled: boolean = true
): UseFileTreeResult {
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([]);
  const [manifest, setManifest] = useState<TreeManifest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageRef = useRef(storage);
  storageRef.current = storage;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const providerIdRef = useRef(providerId);
  providerIdRef.current = providerId;
  const loadedProviderRef = useRef<string | undefined>(providerId);
  // Monotonic load sequence: a slow listing that resolves after a newer load
  // started must not overwrite the newer state (last-writer-wins would let a
  // stale Drive response resurrect rows the tree already replaced).
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const s = storageRef.current;
    if (!s || !enabledRef.current) {
      // Disabled (e.g. Drive while signed out): drop any stale rows so nothing
      // unreachable stays clickable, and reset to the pre-first-load state.
      setFolders([]);
      setDiagrams([]);
      setManifest(null);
      setHasLoaded(false);
      setError(null);
      setIsLoading(false);
      return;
    }
    // Provider just switched (local ⇄ Drive): clear the previous backend's nodes
    // NOW so their ids — invalid against the new backend — aren't clickable
    // during the async reload (else opening one 404s on the wrong provider).
    if (providerIdRef.current !== loadedProviderRef.current) {
      setFolders([]);
      setDiagrams([]);
      setManifest(null);
      setHasLoaded(false);
      loadedProviderRef.current = providerIdRef.current;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [allFolders, allDiagrams, treeManifest] = await Promise.all([
        s.listFolders(),
        s.listDiagrams(),
        s.getTreeManifest()
      ]);
      if (seq !== loadSeqRef.current) return; // superseded by a newer load
      // Normalize to arrays — server may return non-array on error or corrupt data
      const folderList = Array.isArray(allFolders) ? allFolders : [];
      const diagramList = Array.isArray(allDiagrams) ? allDiagrams : [];
      setFolders(folderList);
      // A2/STOR-13: `GoogleDriveProvider.listDiagrams(undefined)` queries the
      // ACCOUNT by app marker, not the root subtree — Drive has no recursive
      // parent query — so a file the user moved out of the Axoview folder in
      // Drive's own UI comes back with a `folderId` naming a folder that is not
      // in `allFolders`. `buildTree` places diagrams by exact `folderId` match,
      // so it appeared in no folder and at no root: invisible in the tree, yet
      // counted by every consumer of the listing. Surface it at root, where it
      // can be seen and moved. Done here rather than in the provider because
      // this is the one place that already holds both lists — the provider
      // would have to pay an extra Drive listing per call to know.
      const knownFolderIds = new Set(folderList.map((f) => f.id));
      setDiagrams(
        diagramList.map((d) =>
          d.folderId != null && !knownFolderIds.has(d.folderId)
            ? { ...d, folderId: null }
            : d
        )
      );
      setManifest(treeManifest);
      setHasLoaded(true);
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load file tree');
    } finally {
      if (seq === loadSeqRef.current) setIsLoading(false);
    }
  }, []);

  // Reload on mount, when refreshToken changes, and when the gate opens/closes
  useEffect(() => {
    load();
  }, [load, refreshToken, enabled]);

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

  const status: FileTreeStatus = !enabled
    ? 'disabled'
    : error
      ? 'error'
      : hasLoaded
        ? 'ready'
        : 'loading';

  return {
    treeData,
    trashData,
    isLoading,
    status,
    isRefreshing: isLoading && hasLoaded,
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
