import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tree, TreeApi, NodeApi } from 'react-arborist';
import { exportAsJSON, mergeBundledFixtures, type Model } from 'axoview';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Menu,
  Typography,
  type PaperProps
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useAppStorage } from '../../providers/AppStorageContext';
import { useDiagramLifecycle } from '../../providers/DiagramLifecycleProvider';
import { useAuthStore } from '../../stores/authStore';
import { GoogleDriveProvider } from '../../services/storage/providers/GoogleDriveProvider';
import { moveDiagramsToDrive } from '../../services/storage/driveTransfer';
import { stripSourceIdentity } from '../../services/storage/importedBlob';
import { useFileTree, FileNode, PlaceId } from '../../hooks/useFileTree';
import { FileTreeNode } from './FileTreeNode';
import { FileTreeToolbar } from './FileTreeToolbar';
import { ContextMenuItems } from './ContextMenuItems';
import { ExportProjectZipDialog } from './ExportProjectZipDialog';
import { ImportDialog } from './ImportDialog';
import { ShareErrorDialog } from '../ShareErrorDialog';
import { notificationStore } from '../../stores/notificationStore';
import { copySuffix, countDescendants, detectCollision } from '../../utils/fileOperations';
import { shareUrlFromUuid } from '../../utils/shareUrl';
import { ExportScope } from '../../services/project/projectZip';

// Section-root ids of the places model (2026-07-06): one tree, two places.
const PLACE_DRIVE = 'place:google-drive';
const PLACE_SESSION = 'place:local';

interface DeleteConfirm {
  id: string;
  type: 'diagram' | 'folder';
  name: string;
  descendantCount: number;
  placeId: PlaceId;
}

interface CollisionDialog {
  dragId: string;
  type: 'diagram' | 'folder';
  name: string;
  targetFolderId: string | null;
  placeId: PlaceId;
}

interface PendingNew {
  type: 'folder' | 'diagram';
  parentId: string | null;
  placeId: PlaceId;
}

// Custom row: arborist's DefaultRow has only onClick — we need onDoubleClick to
// trigger inline rename on a real DOM node arborist owns.
function FileTreeRow({
  node,
  attrs,
  innerRef,
  children
}: {
  node: NodeApi<FileNode>;
  attrs: React.HTMLAttributes<HTMLDivElement> & { style?: React.CSSProperties };
  innerRef: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div
      {...attrs}
      ref={innerRef}
      onFocus={(e) => e.stopPropagation()}
      onClick={node.handleClick}
      onDoubleClick={(e) => {
        if (node.data.id === '__pending__') return;
        if (node.data.type !== 'diagram') return;
        e.preventDefault();
        e.stopPropagation();
        node.select();
        node.tree.edit(node.id);
      }}
    >
      {children}
    </div>
  );
}

function injectPendingNode(
  nodes: FileNode[],
  parentId: string | null,
  type: 'folder' | 'diagram'
): FileNode[] {
  const pendingNode: FileNode = {
    id: '__pending__',
    name: '',
    type,
    children: type === 'folder' ? [] : undefined
  };

  if (parentId === null) {
    return [pendingNode, ...nodes];
  }

  return nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [pendingNode, ...(node.children ?? [])] };
    }
    if (node.children) {
      return { ...node, children: injectPendingNode(node.children, parentId, type) };
    }
    return node;
  });
}

/** Deep-stamp a place id onto per-provider tree data (places model). */
function stampPlace(nodes: FileNode[], placeId: PlaceId): FileNode[] {
  return nodes.map((n) => ({
    ...n,
    placeId,
    children: n.children ? stampPlace(n.children, placeId) : n.children
  }));
}

export function FileExplorer() {
  const { t } = useTranslation('app');
  const {
    storage,
    storageManager,
    serverStorageAvailable,
    googleDriveConfigured,
    defaultPlaceId
  } = useAppStorage();
  const authStatus = useAuthStore((s) => s.status);
  const authUser = useAuthStore((s) => s.user);
  const signIn = useAuthStore((s) => s.signIn);
  const grantDriveAccess = useAuthStore((s) => s.grantDriveAccess);
  const driveScopeGranted = useAuthStore((s) => s.driveScopeGranted);
  const {
    currentDiagram,
    openDiagramById,
    fileTreeRefreshToken,
    dirtyDiagramIds,
    checkUnsavedBeforeNavigate,
    markProjectExported,
    notifyDiagramRenamedFromTree,
    notifyDiagramDeletedFromTree,
    saveAllDirty,
    axoviewRef
  } = useDiagramLifecycle();
  const treeRef = useRef<TreeApi<FileNode> | undefined>(undefined);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(400);

  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [pendingNew, setPendingNew] = useState<PendingNew | null>(null);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuNode, setContextMenuNode] = useState<FileNode | null>(null);
  const [contextMenuOrigin, setContextMenuOrigin] = useState<'row' | 'empty'>('row');
  // Which place a context-menu create action targets (set from the clicked row).
  const [contextMenuPlace, setContextMenuPlace] = useState<PlaceId | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [collisionDialog, setCollisionDialog] = useState<CollisionDialog | null>(null);
  // ADR 0011 — share-link creation failure from the file-tree context menu (a
  // bare action, outside any dialog). Holds the node so "Try again" can re-POST.
  const [shareErrorNode, setShareErrorNode] = useState<FileNode | null>(null);
  const [exportTarget, setExportTarget] = useState<{
    scope: Exclude<ExportScope, 'diagram'>;
    folderId?: string;
    folderName?: string;
    placeId?: PlaceId;
  } | null>(null);
  const [showImport, setShowImport] = useState(false);
  // Diagrams mid-move to Drive — drives the row spinner + the panel's thin
  // progress bar (the app's honest-progress vocabulary: indeterminate, since
  // a single move is sequential network calls with no real percent signal).
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Places model: one useFileTree instance per place, composed into one tree.
  // ---------------------------------------------------------------------------
  const localProvider = storageManager?.getProvider('local') ?? storage;
  const driveProvider = storageManager?.getProvider('google-drive') ?? null;
  const dualMode = googleDriveConfigured;
  const driveUsable = authStatus === 'AUTHENTICATED' || authStatus === 'REFRESHING';

  const sessionTree = useFileTree(
    localProvider,
    fileTreeRefreshToken,
    currentDiagram?.id,
    undefined,
    dirtyDiagramIds,
    'local'
  );
  const driveTree = useFileTree(
    dualMode ? driveProvider : null,
    fileTreeRefreshToken,
    currentDiagram?.id,
    undefined,
    dirtyDiagramIds,
    'google-drive',
    dualMode && driveUsable
  );

  const treeFor = useCallback(
    (placeId: PlaceId) => (placeId === 'google-drive' ? driveTree : sessionTree),
    [driveTree, sessionTree]
  );
  const providerFor = useCallback(
    (placeId: PlaceId) =>
      placeId === 'google-drive' ? driveProvider : localProvider,
    [driveProvider, localProvider]
  );

  // id → place map over the FLAT lists (covers nodes hidden by collapse too).
  const placeOfId = useMemo(() => {
    const map = new Map<string, PlaceId>();
    for (const d of sessionTree.diagrams) map.set(d.id, 'local');
    for (const f of sessionTree.folders) map.set(f.id, 'local');
    for (const d of driveTree.diagrams) map.set(d.id, 'google-drive');
    for (const f of driveTree.folders) map.set(f.id, 'google-drive');
    return map;
  }, [sessionTree.diagrams, sessionTree.folders, driveTree.diagrams, driveTree.folders]);

  const placeOf = useCallback(
    (node: FileNode | null | undefined): PlaceId =>
      node?.placeId ?? (node ? placeOfId.get(node.id) : undefined) ?? 'local',
    [placeOfId]
  );

  // Drive root not configured yet (first-connect dialog cancelled/pending):
  // lists come back empty with no cached root id.
  const driveRootMissing =
    dualMode &&
    driveUsable &&
    driveTree.status === 'ready' &&
    !(driveProvider as GoogleDriveProvider | null)?.getCachedRootId?.();

  const driveReady =
    dualMode && driveUsable && driveTree.status === 'ready' && !driveRootMissing;

  // Where toolbar/empty-space create actions land: the selected row's place,
  // else the default place — downgraded to the session place while Drive
  // isn't ready to take writes.
  const createTargetPlace: PlaceId = useMemo(() => {
    const candidate = selectedNode ? placeOf(selectedNode) : defaultPlaceId;
    if (candidate === 'google-drive' && !driveReady) return 'local';
    return candidate;
  }, [selectedNode, placeOf, defaultPlaceId, driveReady]);

  const sessionHasContent =
    sessionTree.treeData.length > 0 || sessionTree.folders.length > 0;

  // ---------------------------------------------------------------------------
  // Composition: section roots + per-section state rows
  // ---------------------------------------------------------------------------
  const composedData = useMemo((): FileNode[] => {
    const withPending = (data: FileNode[], placeId: PlaceId) =>
      pendingNew && pendingNew.placeId === placeId
        ? injectPendingNode(data, pendingNew.parentId, pendingNew.type)
        : data;

    if (!dualMode) {
      return withPending(sessionTree.treeData, 'local');
    }

    const stateRow = (
      placeId: PlaceId,
      stateKind: NonNullable<FileNode['stateKind']>,
      name = ''
    ): FileNode => ({
      id: `${placeId}:state:${stateKind}`,
      name,
      type: 'placeState',
      placeId,
      stateKind
    });
    const skeletons = (placeId: PlaceId): FileNode[] =>
      [0, 1, 2].map((i) => ({
        id: `${placeId}:state:loading:${i}`,
        name: '',
        type: 'placeState' as const,
        placeId,
        stateKind: 'loading' as const
      }));

    // Google Drive section children by auth/tree state.
    let driveChildren: FileNode[];
    if (driveScopeGranted === false) {
      // Signed in, but the consent screen's Drive checkbox was left unchecked
      // (granular consent) — every Drive call 403s until re-granted. Checked
      // FIRST so it wins over the reconnect/loading rows (which would otherwise
      // mislabel this as "signed out"); this coincides with the blocking
      // DRIVE_ACCESS_REQUIRED dialog. The fix is a re-consent, not a retry.
      driveChildren = [stateRow('google-drive', 'scope')];
    } else if (!driveUsable) {
      driveChildren =
        authStatus === 'RECONNECTING' || authStatus === 'AUTHENTICATING'
          ? skeletons('google-drive')
          : [stateRow('google-drive', authUser ? 'reconnect' : 'signin')];
    } else if (driveTree.status === 'loading') {
      driveChildren = skeletons('google-drive');
    } else if (driveTree.status === 'error') {
      driveChildren = [stateRow('google-drive', 'error', driveTree.error ?? '')];
    } else if (driveRootMissing) {
      driveChildren = [stateRow('google-drive', 'setup')];
    } else {
      const data = withPending(stampPlace(driveTree.treeData, 'google-drive'), 'google-drive');
      driveChildren = data.length > 0 ? data : [stateRow('google-drive', 'empty')];
    }

    const sections: FileNode[] = [
      {
        id: PLACE_DRIVE,
        name: 'Google Drive',
        type: 'place',
        placeId: 'google-drive',
        children: driveChildren
      }
    ];

    // Session section: shown while it has content, or while it is the only
    // usable place (signed out) — hidden when signed in and empty, so the
    // Drive-first experience stays quiet.
    const showSession = sessionHasContent || !driveUsable || !!(pendingNew && pendingNew.placeId === 'local');
    if (showSession) {
      let sessionChildren: FileNode[];
      if (sessionTree.status === 'loading') {
        sessionChildren = skeletons('local');
      } else if (sessionTree.status === 'error') {
        sessionChildren = [stateRow('local', 'error', sessionTree.error ?? '')];
      } else {
        const data = withPending(stampPlace(sessionTree.treeData, 'local'), 'local');
        sessionChildren = data.length > 0 ? data : [stateRow('local', 'empty')];
      }
      sections.push({
        id: PLACE_SESSION,
        name: serverStorageAvailable
          ? t('places.server', 'This server')
          : t('places.session', 'This session'),
        type: 'place',
        placeId: 'local',
        children: sessionChildren
      });
    }
    return sections;
  }, [
    dualMode,
    driveUsable,
    driveRootMissing,
    driveScopeGranted,
    authStatus,
    authUser,
    driveTree.status,
    driveTree.error,
    driveTree.treeData,
    sessionTree.status,
    sessionTree.error,
    sessionTree.treeData,
    sessionHasContent,
    serverStorageAvailable,
    pendingNew,
    t
  ]);

  // Open section roots the first time they appear (arborist keeps openness
  // by id afterwards, so a user's deliberate collapse is respected).
  const openedPlacesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!dualMode) return;
    for (const id of [PLACE_DRIVE, PLACE_SESSION]) {
      if (
        composedData.some((n) => n.id === id) &&
        !openedPlacesRef.current.has(id)
      ) {
        openedPlacesRef.current.add(id);
        requestAnimationFrame(() => treeRef.current?.open(id));
      }
    }
  }, [dualMode, composedData]);

  // Trigger edit on __pending__ node when it is injected
  useEffect(() => {
    if (!pendingNew) return;
    const timer = setTimeout(() => {
      treeRef.current?.edit('__pending__');
    }, 50);
    return () => clearTimeout(timer);
  }, [pendingNew]);

  // ---------------------------------------------------------------------------
  // Context menu
  // ---------------------------------------------------------------------------

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.type === 'placeState') return;
    if (node.type === 'place') {
      // A section header targets its place root with the create actions only.
      setContextMenuAnchor({ x: e.clientX, y: e.clientY });
      setContextMenuNode(null);
      setContextMenuOrigin('empty');
      setContextMenuPlace(node.placeId ?? 'local');
      return;
    }
    setContextMenuAnchor({ x: e.clientX, y: e.clientY });
    setContextMenuNode(node);
    setContextMenuOrigin('row');
    setContextMenuPlace(node.placeId ?? null);
  }, []);

  // Right-click on the tree's EMPTY space (VS Code convention, owner
  // 2026-07-04): the menu targets the selected node — or the open diagram
  // when nothing is tree-selected — plus the create actions (New diagram /
  // New folder / Refresh), which render even with no target at all. Rows stop
  // propagation in handleContextMenu, so this only fires between/below rows.
  const handleEmptySpaceContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const findById = (nodes: FileNode[], id: string): FileNode | null => {
        for (const n of nodes) {
          if (n.id === id) return n;
          const hit = n.children ? findById(n.children, id) : null;
          if (hit) return hit;
        }
        return null;
      };
      // Re-resolve by id: the state snapshots can outlive a rename/delete.
      const target =
        (selectedNode && findById(composedData, selectedNode.id)) ||
        (currentDiagram && findById(composedData, currentDiagram.id)) ||
        null;
      e.preventDefault();
      setContextMenuAnchor({ x: e.clientX, y: e.clientY });
      setContextMenuNode(target);
      setContextMenuOrigin('empty');
      setContextMenuPlace(target ? placeOf(target) : null);
    },
    [selectedNode, currentDiagram, composedData, placeOf]
  );

  // Create from the context menu: a folder row creates INSIDE that folder
  // (auto-expanded so the inline-rename pending row is visible); the empty
  // space / a place header creates at that place's ROOT.
  const handleNewFromMenu = useCallback(
    (type: 'diagram' | 'folder') => {
      const target =
        contextMenuOrigin === 'row' && contextMenuNode?.type === 'folder'
          ? contextMenuNode.id
          : null;
      if (target) treeRef.current?.open(target);
      const placeId = contextMenuPlace ?? createTargetPlace;
      setPendingNew({
        type,
        parentId: target,
        placeId: placeId === 'google-drive' && !driveReady ? 'local' : placeId
      });
    },
    [contextMenuOrigin, contextMenuNode, contextMenuPlace, createTargetPlace, driveReady]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuAnchor(null);
    setContextMenuNode(null);
    setContextMenuPlace(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Open diagram
  // ---------------------------------------------------------------------------

  const handleOpenDiagram = useCallback(
    async (node: FileNode) => {
      if (node.type !== 'diagram' || !node.diagramMeta) return;
      if (currentDiagram?.id === node.id) return;
      try {
        await openDiagramById(node.diagramMeta.id, node.diagramMeta.name, placeOf(node));
      } catch {
        notificationStore.push({ severity: 'error', message: `Failed to open "${node.name}"` });
      }
    },
    [openDiagramById, currentDiagram, placeOf]
  );

  // ---------------------------------------------------------------------------
  // Rename (and __pending__ creation via rename submit)
  // ---------------------------------------------------------------------------

  const handleRenameNode = useCallback((node: FileNode) => {
    // Delay so the MUI Menu close animation completes and restores focus before
    // we put the input in edit mode — prevents the menu from stealing focus back.
    setTimeout(() => {
      treeRef.current?.edit(node.id);
    }, 150);
  }, []);

  const handleRenameSubmit = useCallback(
    async (id: string, name: string) => {
      if (id === '__pending__') {
        const trimmed = name.trim();
        const type = pendingNew?.type;
        const parentId = pendingNew?.parentId ?? null;
        const placeId = pendingNew?.placeId ?? 'local';
        setPendingNew(null);

        if (!trimmed || !type) return; // empty or Escape → cancel

        if (type === 'folder') {
          try {
            await treeFor(placeId).createFolder(parentId, trimmed);
          } catch {
            notificationStore.push({ severity: 'error', message: 'Failed to create folder' });
          }
        } else {
          // diagram — check unsaved changes, then create and open
          checkUnsavedBeforeNavigate(async () => {
            try {
              const provider = providerFor(placeId);
              if (!provider) return;
              const newId = await provider.createDiagram(
                { title: trimmed, name: trimmed, icons: [], colors: [], items: [], views: [], fitToScreen: true },
                parentId
              );
              await treeFor(placeId).refresh();
              await openDiagramById(newId, trimmed, placeId);
            } catch {
              notificationStore.push({ severity: 'error', message: 'Failed to create diagram' });
            }
          });
        }
        return;
      }

      // Normal rename — route to the node's own place.
      const trimmed = name.trim();
      if (!trimmed) return;
      const placeId = placeOfId.get(id) ?? 'local';
      const tree = treeFor(placeId);
      tree.optimisticRename(id, trimmed);
      notifyDiagramRenamedFromTree(id, trimmed);
      try {
        const isFolder = tree.folders.some((f) => f.id === id);
        if (isFolder) {
          await tree.renameFolder(id, trimmed);
        } else {
          await tree.renameDiagram(id, trimmed);
        }
      } catch {
        notificationStore.push({ severity: 'error', message: 'Rename failed' });
        tree.refresh();
      }
    },
    [pendingNew, checkUnsavedBeforeNavigate, providerFor, treeFor, placeOfId, openDiagramById, notifyDiagramRenamedFromTree]
  );

  // ---------------------------------------------------------------------------
  // New folder / diagram (inline, from the panel toolbar)
  // ---------------------------------------------------------------------------

  // Folder id of the currently selected node (or null for root)
  const selectedFolderId = useMemo((): string | null => {
    if (!selectedNode) return null;
    if (selectedNode.type === 'folder') return selectedNode.id;
    if (selectedNode.type === 'diagram') return selectedNode.diagramMeta?.folderId ?? null;
    return null;
  }, [selectedNode]);

  const handleNewFolder = useCallback(() => {
    setPendingNew({ type: 'folder', parentId: selectedFolderId, placeId: createTargetPlace });
  }, [selectedFolderId, createTargetPlace]);

  const handleNewDiagramInline = useCallback(() => {
    setPendingNew({ type: 'diagram', parentId: selectedFolderId, placeId: createTargetPlace });
  }, [selectedFolderId, createTargetPlace]);

  // ---------------------------------------------------------------------------
  // Refresh / collapse
  // ---------------------------------------------------------------------------

  const refreshAll = useCallback(async () => {
    await Promise.all([sessionTree.refresh(), driveTree.refresh()]);
  }, [sessionTree.refresh, driveTree.refresh]); // eslint-disable-line react-hooks/exhaustive-deps -- stable per-hook callbacks; whole tree results churn on data changes

  const handleCollapseAll = useCallback(() => {
    treeRef.current?.closeAll();
    // Sections are wayfinding chrome, not content — keep them open.
    if (dualMode) {
      treeRef.current?.open(PLACE_DRIVE);
      treeRef.current?.open(PLACE_SESSION);
    }
  }, [dualMode]);

  // Measure container height for react-window virtualization
  useLayoutEffect(() => {
    const el = treeContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTreeHeight(el.clientHeight));
    ro.observe(el);
    setTreeHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // ---------------------------------------------------------------------------
  // Delete (with confirmation)
  // ---------------------------------------------------------------------------

  const handleDeleteFolder = useCallback(
    (node: FileNode) => {
      const placeId = placeOf(node);
      const tree = treeFor(placeId);
      const count = countDescendants(node.id, { folders: tree.folders }, tree.diagrams);
      setDeleteConfirm({ id: node.id, type: 'folder', name: node.name, descendantCount: count, placeId });
    },
    [placeOf, treeFor]
  );

  const handleDeleteDiagram = useCallback(
    (node: FileNode) => {
      setDeleteConfirm({
        id: node.id,
        type: 'diagram',
        name: node.name,
        descendantCount: 0,
        placeId: placeOf(node)
      });
    },
    [placeOf]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const target = deleteConfirm;
    setDeleteConfirm(null);
    const tree = treeFor(target.placeId);
    try {
      if (target.type === 'folder') {
        await tree.deleteFolder(target.id, true);
        notificationStore.push({ severity: 'success', message: `Folder "${target.name}" deleted` });
      } else {
        // MQA #18: if the deleted diagram is the one currently on the canvas,
        // reset the canvas BEFORE the storage delete so the in-flight autosave
        // is canceled and can't recreate the diagram after we remove it.
        notifyDiagramDeletedFromTree(target.id);
        await tree.hardDeleteDiagram(target.id);
        notificationStore.push({ severity: 'success', message: `"${target.name}" deleted` });
      }
    } catch {
      notificationStore.push({ severity: 'error', message: 'Delete failed' });
    }
  }, [deleteConfirm, treeFor, notifyDiagramDeletedFromTree]);

  // ---------------------------------------------------------------------------
  // Copy share link (session-backend contract — local place only)
  // ---------------------------------------------------------------------------

  const handleCopyShareLink = useCallback(async (node: FileNode) => {
    if (node.type !== 'diagram' || !localProvider) return;
    if (!localProvider.shareDiagram) {
      notificationStore.push({ severity: 'error', message: 'Sharing is not available' });
      return;
    }
    try {
      const { uuid } = await localProvider.shareDiagram(node.id);
      const url = shareUrlFromUuid(uuid);
      await navigator.clipboard.writeText(url);
      notificationStore.push({ severity: 'success', message: 'Share link copied to clipboard' });
    } catch (err) {
      // ADR 0011 — failure-of-intent from a bare action: explicit dialog, not a
      // toast. Stash the node so the dialog's "Try again" can re-run the POST.
      console.error('handleCopyShareLink failed:', err);
      setShareErrorNode(node);
    }
  }, [localProvider]);

  // ---------------------------------------------------------------------------
  // Move to Google Drive (MOVE semantics — create → verify → delete source;
  // owner decision 2026-07-06, supersedes the copy-only "Save to Drive")
  // ---------------------------------------------------------------------------

  const handleMoveToDrive = useCallback(
    async (node: FileNode, explicitTargetFolderId?: string | null) => {
      if (node.type !== 'diagram' || !node.diagramMeta) return;
      if (movingIds.has(node.id)) return; // already in flight
      const drive = providerFor('google-drive');
      const local = providerFor('local');
      if (!drive || !local) return;
      const wasOpen = currentDiagram?.id === node.id;
      setMovingIds((prev) => new Set(prev).add(node.id));
      try {
        // Flush in-memory session edits so the moved content is current.
        await saveAllDirty();
        const [result] = await moveDiagramsToDrive({
          source: local,
          drive,
          diagrams: [node.diagramMeta],
          sourceFolders: sessionTree.folders,
          ...(explicitTargetFolderId !== undefined
            ? { targetFolderId: explicitTargetFolderId }
            : {})
        });
        if (result?.ok) {
          if (wasOpen) {
            // The session copy is gone — cancel its autosave/scratch, then
            // reopen the diagram from its new Drive home.
            notifyDiagramDeletedFromTree(node.id);
            await openDiagramById(result.driveId!, result.driveName ?? node.name, 'google-drive');
          }
          notificationStore.push({
            severity: 'success',
            message: t('fileExplorer.movedToDrive', {
              defaultValue: '"{{name}}" moved to Google Drive',
              name: result.driveName ?? node.name
            })
          });
        } else {
          notificationStore.push({
            severity: 'error',
            message: t('fileExplorer.moveToDriveFailed', {
              defaultValue: 'Could not move "{{name}}" to Google Drive — it stayed in this session',
              name: node.name
            })
          });
        }
      } finally {
        setMovingIds((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
        void refreshAll();
      }
    },
    [providerFor, movingIds, currentDiagram, saveAllDirty, sessionTree.folders, notifyDiagramDeletedFromTree, openDiagramById, refreshAll, t]
  );

  // ---------------------------------------------------------------------------
  // Export — image (delegates to the lib's ExportImageDialog)
  // ---------------------------------------------------------------------------

  const handleExportImage = useCallback(
    (node: FileNode) => {
      if (node.type !== 'diagram' || !node.diagramMeta) return;
      const openDialog = () => axoviewRef.current?.openExportImageDialog();
      if (currentDiagram?.id === node.id) {
        openDialog();
        return;
      }
      checkUnsavedBeforeNavigate(async () => {
        try {
          await openDiagramById(node.diagramMeta!.id, node.diagramMeta!.name, placeOf(node));
          // Wait one tick so the model store finishes hydrating before the
          // hidden Axoview inside the dialog reads from it.
          requestAnimationFrame(() => openDialog());
        } catch {
          notificationStore.push({ severity: 'error', message: `Failed to open "${node.name}"` });
        }
      });
    },
    [currentDiagram, openDiagramById, checkUnsavedBeforeNavigate, axoviewRef, placeOf]
  );

  // ---------------------------------------------------------------------------
  // Export — JSON (direct download, no dialog)
  // ---------------------------------------------------------------------------

  const handleExportJsonNode = useCallback(
    async (node: FileNode) => {
      if (node.type !== 'diagram') return;
      const provider = providerFor(placeOf(node));
      if (!provider) return;
      try {
        const raw = await provider.loadDiagram(node.id);
        // Storage returns `unknown`; runtime shape is a persisted diagram blob
        // that matches Model structurally — assert at this single lib boundary.
        const model = mergeBundledFixtures(raw as Model);
        exportAsJSON(model);
      } catch {
        notificationStore.push({ severity: 'error', message: `Failed to export "${node.name}"` });
      }
    },
    [providerFor, placeOf]
  );

  const handleDuplicate = useCallback(
    async (node: FileNode) => {
      if (node.type !== 'diagram') return;
      const placeId = placeOf(node);
      const provider = providerFor(placeId);
      const tree = treeFor(placeId);
      if (!provider) return;
      try {
        const siblingsInFolder = tree.diagrams
          .filter((d) => d.folderId === (node.diagramMeta?.folderId ?? null))
          .map((d) => d.name);
        const newName = copySuffix(node.name, siblingsInFolder);
        const data = await provider.loadDiagram(node.id);
        // MOP-01: the id was stripped here (so the server assigns a fresh one
        // and the create can't 409) but `shareUuid` was not — so a duplicate
        // claimed the ORIGINAL's public snapshot, and unsharing or deleting the
        // copy took down the original's live link. One helper strips everything
        // a copy must not inherit, shared with both import paths.
        await provider.createDiagram(
          {
            ...stripSourceIdentity(data as Record<string, unknown>),
            title: newName,
            name: newName
          },
          node.diagramMeta?.folderId ?? null
        );
        await tree.refresh();
        notificationStore.push({ severity: 'success', message: `"${newName}" created` });
      } catch {
        notificationStore.push({ severity: 'error', message: 'Duplicate failed' });
      }
    },
    [placeOf, providerFor, treeFor]
  );

  // ---------------------------------------------------------------------------
  // Drag-and-drop — within-place reorganization + session→Drive move
  // ---------------------------------------------------------------------------

  /** Resolve an arborist drop parent to a (place, folder) pair. */
  const resolveDropTarget = useCallback(
    (parentId: string | null): { placeId: PlaceId; folderId: string | null } | null => {
      if (parentId === null) {
        // Virtual root: valid only in single-place mode.
        return dualMode ? null : { placeId: 'local', folderId: null };
      }
      if (parentId === PLACE_DRIVE) return { placeId: 'google-drive', folderId: null };
      if (parentId === PLACE_SESSION) return { placeId: 'local', folderId: null };
      const placeId = placeOfId.get(parentId);
      return placeId ? { placeId, folderId: parentId } : null;
    },
    [dualMode, placeOfId]
  );

  const handleMove = useCallback(
    async ({
      dragIds,
      parentId
    }: {
      dragIds: string[];
      parentId: string | null;
      index: number;
    }) => {
      const target = resolveDropTarget(parentId);
      if (!target) return;
      for (const dragId of dragIds) {
        const dragPlace = placeOfId.get(dragId) ?? 'local';

        // Cross-place: session diagram dropped onto the Drive section/folder.
        if (dragPlace !== target.placeId) {
          if (dragPlace === 'local' && target.placeId === 'google-drive' && driveReady) {
            const meta = sessionTree.diagrams.find((d) => d.id === dragId);
            if (meta) {
              await handleMoveToDrive(
                { id: meta.id, name: meta.name, type: 'diagram', diagramMeta: meta, placeId: 'local' },
                target.folderId
              );
            }
          }
          continue; // any other cross-place drop is blocked by disableDrop
        }

        const tree = treeFor(dragPlace);
        const isFolder = tree.folders.some((f) => f.id === dragId);
        const type = isFolder ? 'folder' : 'diagram';

        // Determine current parent to reject same-parent reorders
        const currentParentId = isFolder
          ? (tree.folders.find((f) => f.id === dragId)?.parentId ?? null)
          : (tree.diagrams.find((d) => d.id === dragId)?.folderId ?? null);

        if (currentParentId === target.folderId) return; // same-parent reorder: silently ignore

        const node = isFolder
          ? tree.folders.find((f) => f.id === dragId)
          : tree.diagrams.find((d) => d.id === dragId);
        const nodeName = node?.name ?? '';

        const siblingNames = isFolder
          ? tree.folders.filter((f) => f.parentId === target.folderId && f.id !== dragId).map((f) => f.name)
          : tree.diagrams.filter((d) => d.folderId === target.folderId && d.id !== dragId).map((d) => d.name);

        if (detectCollision(nodeName, siblingNames)) {
          setCollisionDialog({ dragId, type, name: nodeName, targetFolderId: target.folderId, placeId: dragPlace });
          return;
        }

        try {
          await tree.moveItem(dragId, type, target.folderId);
        } catch {
          notificationStore.push({ severity: 'error', message: `Failed to move "${nodeName}"` });
        }
      }
    },
    [resolveDropTarget, placeOfId, treeFor, driveReady, sessionTree.diagrams, handleMoveToDrive]
  );

  const confirmMove = useCallback(async () => {
    if (!collisionDialog) return;
    setCollisionDialog(null);
    try {
      await treeFor(collisionDialog.placeId).moveItem(
        collisionDialog.dragId,
        collisionDialog.type,
        collisionDialog.targetFolderId
      );
    } catch {
      notificationStore.push({ severity: 'error', message: 'Move failed' });
    }
  }, [collisionDialog, treeFor]);

  const disableDrag = useCallback(
    (data: FileNode) => data.type === 'place' || data.type === 'placeState',
    []
  );

  const disableDrop = useCallback(
    (args: { parentNode: NodeApi<FileNode> | null; dragNodes: NodeApi<FileNode>[] }) => {
      const { parentNode, dragNodes } = args;
      if (!dualMode) return false;
      const target = parentNode?.data;
      if (!target) return true; // between-section virtual-root drops
      if (target.type === 'placeState') return true;
      const targetPlace = target.placeId;
      for (const d of dragNodes) {
        const dragPlace = d.data.placeId ?? placeOfId.get(d.data.id);
        if (dragPlace === targetPlace) continue;
        // The one allowed cross-place gesture: session diagram → Drive.
        if (
          dragPlace === 'local' &&
          targetPlace === 'google-drive' &&
          d.data.type === 'diagram' &&
          driveReady
        ) {
          continue;
        }
        return true;
      }
      return false;
    },
    [dualMode, placeOfId, driveReady]
  );

  // ---------------------------------------------------------------------------
  // Place state-row actions (sign-in / reconnect / retry / finish setup)
  // ---------------------------------------------------------------------------

  const handleStateAction = useCallback(
    (node: FileNode) => {
      switch (node.stateKind) {
        case 'signin':
        case 'reconnect':
          void signIn();
          break;
        // A partial grant (Drive checkbox unchecked) can't be fixed by a plain
        // signIn — Google replays the cached identity-only grant. Force the
        // consent screen back open (prompt:'consent') so the checkbox reappears.
        case 'scope':
          grantDriveAccess();
          break;
        case 'error':
          void treeFor(node.placeId ?? 'google-drive').refresh();
          break;
        case 'setup':
          window.dispatchEvent(new CustomEvent('axoview-drive-setup'));
          break;
        default:
          break;
      }
    },
    [signIn, grantDriveAccess, treeFor]
  );

  const sessionDiagramCount = sessionTree.diagrams.filter((d) => !d.deletedAt).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const anyRefreshing = sessionTree.isRefreshing || driveTree.isRefreshing;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        // VS Code-style hover-reveal for toolbar icons (mqa-results.md #27).
        '&:hover .ff-file-toolbar-icons, &:focus-within .ff-file-toolbar-icons': {
          opacity: 1
        }
      }}
    >
      <FileTreeToolbar
        providerLabel={t('fileExplorer.title')}
        onNewDiagram={handleNewDiagramInline}
        onNewFolder={handleNewFolder}
        onRefresh={refreshAll}
        onCollapseAll={handleCollapseAll}
        onImport={() => setShowImport(true)}
        onExportProject={() => setExportTarget({ scope: 'project' })}
      />
      <Divider />
      {/* Refresh/move in progress: stale rows stay, a thin bar signals work. */}
      <Box sx={{ height: 2, flexShrink: 0 }}>
        {(anyRefreshing || movingIds.size > 0) && <LinearProgress sx={{ height: 2 }} />}
      </Box>

      {!dualMode && sessionTree.error && (
        <Box sx={{ px: 1.5, py: 1 }}>
          <Typography variant="caption" color="error">{sessionTree.error}</Typography>
        </Box>
      )}

      <Box
        ref={treeContainerRef}
        tabIndex={-1}
        data-axoview-id="file-explorer-tree"
        sx={{ flex: 1, overflow: 'hidden', py: 0.5, outline: 'none' }}
        onContextMenu={handleEmptySpaceContextMenu}
        onKeyDown={(e) => {
          if (!selectedNode) return;
          if (selectedNode.type === 'place' || selectedNode.type === 'placeState') return;
          if (e.key === 'F2') {
            e.preventDefault();
            treeRef.current?.edit(selectedNode.id);
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
            // Only fire Delete when not renaming
            if (document.activeElement?.tagName === 'INPUT') return;
            e.preventDefault();
            if (selectedNode.type === 'folder') {
              handleDeleteFolder(selectedNode);
            } else {
              handleDeleteDiagram(selectedNode);
            }
          }
        }}
      >
        {composedData.length === 0 && sessionTree.status === 'ready' && !dualMode && (
          <Box sx={{ px: 1.5, py: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              {t('fileExplorer.empty', 'No diagrams yet. Create one to get started.')}
            </Typography>
          </Box>
        )}

        <Tree
          ref={treeRef}
          data={composedData}
          openByDefault={false}
          onMove={handleMove}
          disableDrag={disableDrag}
          disableDrop={disableDrop}
          onRename={({ id, name }) => handleRenameSubmit(id, name)}
          onSelect={(nodes) => {
            const data = nodes[0]?.data ?? null;
            setSelectedNode(data && (data.type === 'folder' || data.type === 'diagram') ? data : null);
          }}
          renderRow={FileTreeRow}
          width="100%"
          height={treeHeight}
          rowHeight={28}
          indent={16}
          paddingTop={4}
          paddingBottom={4}
        >
          {(props) => (
            <FileTreeNode
              {...props}
              selectedId={currentDiagram?.id}
              onContextMenu={handleContextMenu}
              onOpen={handleOpenDiagram}
              onStateAction={handleStateAction}
              serverPlace={serverStorageAvailable}
              moveAllVisible={driveReady && sessionDiagramCount > 0}
              onMoveAll={() => window.dispatchEvent(new CustomEvent('axoview-open-migrate'))}
              movingIds={movingIds}
            />
          )}
        </Tree>
      </Box>

      {/* Context menu */}
      <Menu
        open={!!contextMenuAnchor}
        onClose={closeContextMenu}
        disableRestoreFocus
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenuAnchor
            ? { top: contextMenuAnchor.y, left: contextMenuAnchor.x }
            : undefined
        }
      >
        {contextMenuAnchor && (
          <ContextMenuItems
            node={contextMenuNode}
            origin={contextMenuOrigin}
            canShare={
              serverStorageAvailable &&
              (contextMenuNode ? placeOf(contextMenuNode) !== 'google-drive' : true)
            }
            canMoveToDrive={
              driveReady &&
              !!contextMenuNode &&
              placeOf(contextMenuNode) === 'local' &&
              !movingIds.has(contextMenuNode.id)
            }
            onNewDiagram={() => handleNewFromMenu('diagram')}
            onNewFolder={() => handleNewFromMenu('folder')}
            onRefresh={() => void refreshAll()}
            onMoveToDrive={() => contextMenuNode && void handleMoveToDrive(contextMenuNode)}
            onOpen={() => { if (contextMenuNode) handleOpenDiagram(contextMenuNode); }}
            onRename={() => contextMenuNode && handleRenameNode(contextMenuNode)}
            onDuplicate={() => contextMenuNode && handleDuplicate(contextMenuNode)}
            onCopyShareLink={() => contextMenuNode && handleCopyShareLink(contextMenuNode)}
            onExportImage={() => contextMenuNode && handleExportImage(contextMenuNode)}
            onExportJson={() => contextMenuNode && handleExportJsonNode(contextMenuNode)}
            onExportFolder={() => {
              if (!contextMenuNode || contextMenuNode.type !== 'folder') return;
              setExportTarget({
                scope: 'folder',
                folderId: contextMenuNode.id,
                folderName: contextMenuNode.name,
                placeId: placeOf(contextMenuNode)
              });
            }}
            onDelete={() => {
              if (!contextMenuNode) return;
              if (contextMenuNode.type === 'folder') {
                handleDeleteFolder(contextMenuNode);
              } else {
                handleDeleteDiagram(contextMenuNode);
              }
            }}
            onClose={closeContextMenu}
          />
        )}
      </Menu>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          // data-* anchors (ADR 0008 Decision 5) aren't in the typed paper
          // slot props; cast to PaperProps to keep the E2E hook on the root.
          paper: {
            'data-axoview-id': 'file-explorer-delete-confirm-dialog',
            sx: { boxShadow: '0px 10px 20px -2px rgba(0,0,0,0.25)', borderRadius: 2 }
          } as PaperProps
        }}
      >
        <DialogTitle sx={{ pb: 1, pr: 6 }}>
          <Typography variant="h6" component="span">
            {t('fileExplorer.deleteTitle', {
              defaultValue: 'Delete "{{name}}"?',
              name: deleteConfirm?.name ?? ''
            })}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setDeleteConfirm(null)}
            sx={{ position: 'absolute', top: 12, right: 12, color: 'text.secondary' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Typography variant="body2" color="text.secondary">
            {(() => {
              // ADR 0036 §3 — a Drive-place delete = Drive trash (recoverable),
              // so the copy must not claim permanence. Places model: the fate
              // follows the ITEM's place, not a global mode. Full sentences per
              // place/shape so every locale can phrase them naturally.
              const place = deleteConfirm?.placeId === 'google-drive' ? 'Drive' : 'Session';
              if (deleteConfirm?.type === 'folder' && deleteConfirm.descendantCount > 0) {
                const n = deleteConfirm.descendantCount;
                return n === 1
                  ? t(`fileExplorer.deleteBodyFolderOneItem${place}`)
                  : t(`fileExplorer.deleteBodyFolderItems${place}`, { count: n });
              }
              const shape = deleteConfirm?.type === 'folder' ? 'Folder' : 'Diagram';
              return t(`fileExplorer.deleteBody${shape}${place}`);
            })()}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
          <Button
            variant="text"
            data-axoview-id="file-explorer-delete-cancel"
            onClick={() => setDeleteConfirm(null)}
          >
            {t('fileExplorer.deleteCancel', 'Cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            data-axoview-id="file-explorer-delete-confirm"
            onClick={confirmDelete}
          >
            {t('fileExplorer.deleteConfirm', 'Delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export dialog (project / folder zip only) */}
      {exportTarget && (
        <ExportProjectZipDialog
          open
          onClose={() => setExportTarget(null)}
          scope={exportTarget.scope}
          folderId={exportTarget.folderId}
          folderName={exportTarget.folderName}
          storage={
            (exportTarget.placeId ? providerFor(exportTarget.placeId) : storage) ?? storage!
          }
          exporterTag={`axoview-app@${process.env.REACT_APP_VERSION ?? 'dev'}`}
          onProjectZipExported={() => {
            // The zip covered ONE place. Clear the session exit guard only
            // when that place was the session — a Drive-place export leaves
            // session work unexported.
            const exportedPlace =
              exportTarget.placeId ?? storageManager?.activeProviderId ?? 'local';
            if (exportedPlace === 'local') markProjectExported?.();
          }}
        />
      )}

      {/* Import dialog — imports land in the create-target place */}
      {showImport && (
        <ImportDialog
          open
          onClose={() => setShowImport(false)}
          storage={providerFor(createTargetPlace) ?? storage!}
          onImported={async () => {
            await refreshAll();
          }}
          onImportSingleJson={async (data, suggestedName) => {
            const provider = providerFor(createTargetPlace);
            if (!provider) return;
            const folderId =
              selectedNode && placeOf(selectedNode) === createTargetPlace
                ? selectedFolderId
                : null;
            const newId = await provider.createDiagram(
              { ...(data as object), name: suggestedName, title: suggestedName },
              folderId
            );
            await refreshAll();
            await openDiagramById(newId, suggestedName, createTargetPlace);
          }}
        />
      )}

      {/* Name collision dialog */}
      <Dialog
        open={!!collisionDialog}
        onClose={() => setCollisionDialog(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { boxShadow: '0px 10px 20px -2px rgba(0,0,0,0.25)', borderRadius: 2 } } }}
      >
        <DialogTitle sx={{ pb: 1, pr: 6 }}>
          <Typography variant="h6" component="span">
            Name already exists
          </Typography>
          <IconButton
            size="small"
            onClick={() => setCollisionDialog(null)}
            sx={{ position: 'absolute', top: 12, right: 12, color: 'text.secondary' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Typography variant="body2" color="text.secondary">
            &ldquo;{collisionDialog?.name}&rdquo; already exists in this folder. Replace it?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
          <Button variant="text" onClick={() => setCollisionDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={confirmMove}>Replace</Button>
        </DialogActions>
      </Dialog>

      {/* ADR 0011 — share-link creation failure (file-tree context menu). */}
      <ShareErrorDialog
        open={!!shareErrorNode}
        onDismiss={() => setShareErrorNode(null)}
        onRetry={() => {
          const node = shareErrorNode;
          setShareErrorNode(null);
          if (node) handleCopyShareLink(node);
        }}
      />
    </Box>
  );
}
