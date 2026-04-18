import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { Tree, TreeApi } from 'react-arborist';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  Typography
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useAppStorage } from '../../providers/AppStorageContext';
import { useDiagramLifecycle } from '../../providers/DiagramLifecycleProvider';
import { useFileTree, FileNode } from '../../hooks/useFileTree';
import { FileTreeNode } from './FileTreeNode';
import { FileTreeToolbar } from './FileTreeToolbar';
import { ContextMenuItems } from './ContextMenuItems';
import { notificationStore } from '../../stores/notificationStore';
import { sequentialName, copySuffix, countDescendants, detectCollision } from '../../utils/fileOperations';

interface DeleteConfirm {
  id: string;
  type: 'diagram' | 'folder';
  name: string;
  descendantCount: number;
}

interface CollisionDialog {
  dragId: string;
  type: 'diagram' | 'folder';
  name: string;
  targetFolderId: string | null;
}

interface PendingNew {
  type: 'folder' | 'diagram';
  parentId: string | null;
}

function providerIdToLabel(id: string): string {
  if (id === 'google-drive') return 'GOOGLE DRIVE';
  if (id === 's3') return 'S3';
  return 'DIAGRAMS';
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

export function FileExplorer() {
  const { storage } = useAppStorage();
  const {
    currentDiagram,
    openDiagramById,
    fileTreeRefreshToken,
    dirtyDiagramIds,
    checkUnsavedBeforeNavigate
  } = useDiagramLifecycle();

  const treeRef = useRef<TreeApi<FileNode> | undefined>(undefined);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(400);

  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [pendingNew, setPendingNew] = useState<PendingNew | null>(null);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuNode, setContextMenuNode] = useState<FileNode | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [collisionDialog, setCollisionDialog] = useState<CollisionDialog | null>(null);

  const tree = useFileTree(
    storage,
    fileTreeRefreshToken,
    currentDiagram?.id,
    undefined,
    dirtyDiagramIds
  );

  const providerLabel = providerIdToLabel(storage?.id ?? 'local');

  // Folder id of the currently selected node (or null for root)
  const selectedFolderId = useMemo((): string | null => {
    if (!selectedNode) return null;
    if (selectedNode.type === 'folder') return selectedNode.id;
    return selectedNode.diagramMeta?.folderId ?? null;
  }, [selectedNode]);

  // Tree data with optional pending __pending__ node injected
  const treeDataWithPending = useMemo(() => {
    if (!pendingNew) return tree.treeData;
    return injectPendingNode(tree.treeData, pendingNew.parentId, pendingNew.type);
  }, [tree.treeData, pendingNew]);

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
    setContextMenuAnchor({ x: e.clientX, y: e.clientY });
    setContextMenuNode(node);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuAnchor(null);
    setContextMenuNode(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Open diagram
  // ---------------------------------------------------------------------------

  const handleOpenDiagram = useCallback(
    async (node: FileNode) => {
      if (node.type !== 'diagram' || !node.diagramMeta) return;
      if (currentDiagram?.id === node.id) return;
      try {
        await openDiagramById(node.diagramMeta.id, node.diagramMeta.name);
      } catch {
        notificationStore.push({ severity: 'error', message: `Failed to open "${node.name}"` });
      }
    },
    [openDiagramById, currentDiagram]
  );

  // ---------------------------------------------------------------------------
  // Rename (and __pending__ creation via rename submit)
  // ---------------------------------------------------------------------------

  const handleRenameNode = useCallback((node: FileNode) => {
    treeRef.current?.edit(node.id);
  }, []);

  const handleRenameSubmit = useCallback(
    async (id: string, name: string) => {
      if (id === '__pending__') {
        const trimmed = name.trim();
        const type = pendingNew?.type;
        const parentId = pendingNew?.parentId ?? null;
        setPendingNew(null);

        if (!trimmed || !type) return; // empty or Escape → cancel

        if (type === 'folder') {
          try {
            await tree.createFolder(parentId, trimmed);
          } catch {
            notificationStore.push({ severity: 'error', message: 'Failed to create folder' });
          }
        } else {
          // diagram — check unsaved changes, then create and open
          checkUnsavedBeforeNavigate(async () => {
            try {
              if (!storage) return;
              const newId = await storage.createDiagram(
                { title: trimmed, name: trimmed, icons: [], colors: [], items: [], views: [], fitToScreen: true } as any,
                parentId
              );
              await tree.refresh();
              await openDiagramById(newId, trimmed);
            } catch {
              notificationStore.push({ severity: 'error', message: 'Failed to create diagram' });
            }
          });
        }
        return;
      }

      // Normal rename
      const trimmed = name.trim();
      if (!trimmed) return;
      tree.optimisticRename(id, trimmed);
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
    [tree, pendingNew, checkUnsavedBeforeNavigate, storage, openDiagramById]
  );

  // ---------------------------------------------------------------------------
  // New folder (inline)
  // ---------------------------------------------------------------------------

  const handleNewFolder = useCallback(() => {
    setPendingNew({ type: 'folder', parentId: selectedFolderId });
  }, [selectedFolderId]);

  // ---------------------------------------------------------------------------
  // New diagram (inline)
  // ---------------------------------------------------------------------------

  const handleNewDiagramInline = useCallback(() => {
    setPendingNew({ type: 'diagram', parentId: selectedFolderId });
  }, [selectedFolderId]);

  // ---------------------------------------------------------------------------
  // Collapse all
  // ---------------------------------------------------------------------------

  const handleCollapseAll = useCallback(() => {
    treeRef.current?.closeAll();
  }, []);

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
  // Delete folder (with confirmation)
  // ---------------------------------------------------------------------------

  const handleDeleteFolder = useCallback(
    (node: FileNode) => {
      const count = countDescendants(node.id, { folders: tree.folders }, tree.diagrams);
      setDeleteConfirm({ id: node.id, type: 'folder', name: node.name, descendantCount: count });
    },
    [tree.folders, tree.diagrams]
  );

  const handleDeleteDiagram = useCallback((node: FileNode) => {
    setDeleteConfirm({ id: node.id, type: 'diagram', name: node.name, descendantCount: 0 });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setDeleteConfirm(null);
    try {
      if (deleteConfirm.type === 'folder') {
        await tree.deleteFolder(deleteConfirm.id, true);
        notificationStore.push({ severity: 'success', message: `Folder "${deleteConfirm.name}" deleted` });
      } else {
        await tree.hardDeleteDiagram(deleteConfirm.id);
        notificationStore.push({ severity: 'success', message: `"${deleteConfirm.name}" deleted` });
      }
    } catch {
      notificationStore.push({ severity: 'error', message: 'Delete failed' });
    }
  }, [deleteConfirm, tree]);

  // ---------------------------------------------------------------------------
  // Duplicate diagram
  // ---------------------------------------------------------------------------

  const handleDuplicate = useCallback(
    async (node: FileNode) => {
      if (node.type !== 'diagram' || !storage) return;
      try {
        const siblingsInFolder = tree.diagrams
          .filter((d) => d.folderId === (node.diagramMeta?.folderId ?? null))
          .map((d) => d.name);
        const newName = copySuffix(node.name, siblingsInFolder);
        const data = await storage.loadDiagram(node.id);
        await storage.createDiagram(
          { ...(data as object), title: newName, name: newName },
          node.diagramMeta?.folderId ?? null
        );
        await tree.refresh();
        notificationStore.push({ severity: 'success', message: `"${newName}" created` });
      } catch {
        notificationStore.push({ severity: 'error', message: 'Duplicate failed' });
      }
    },
    [storage, tree]
  );

  // ---------------------------------------------------------------------------
  // Drag-and-drop
  // ---------------------------------------------------------------------------

  const handleMove = useCallback(
    async ({
      dragIds,
      parentId
    }: {
      dragIds: string[];
      parentId: string | null;
      index: number;
    }) => {
      for (const dragId of dragIds) {
        const isFolder = tree.folders.some((f) => f.id === dragId);
        const type = isFolder ? 'folder' : 'diagram';

        // Determine current parent to reject same-parent reorders
        const currentParentId = isFolder
          ? (tree.folders.find((f) => f.id === dragId)?.parentId ?? null)
          : (tree.diagrams.find((d) => d.id === dragId)?.folderId ?? null);

        if (currentParentId === parentId) return; // same-parent reorder: silently ignore

        const node = isFolder
          ? tree.folders.find((f) => f.id === dragId)
          : tree.diagrams.find((d) => d.id === dragId);
        const nodeName = node?.name ?? '';

        const siblingNames = isFolder
          ? tree.folders.filter((f) => f.parentId === parentId && f.id !== dragId).map((f) => f.name)
          : tree.diagrams.filter((d) => d.folderId === parentId && d.id !== dragId).map((d) => d.name);

        if (detectCollision(nodeName, siblingNames)) {
          setCollisionDialog({ dragId, type, name: nodeName, targetFolderId: parentId });
          return;
        }

        try {
          await tree.moveItem(dragId, type, parentId);
        } catch {
          notificationStore.push({ severity: 'error', message: `Failed to move "${nodeName}"` });
        }
      }
    },
    [tree]
  );

  const confirmMove = useCallback(async () => {
    if (!collisionDialog) return;
    setCollisionDialog(null);
    try {
      await tree.moveItem(collisionDialog.dragId, collisionDialog.type, collisionDialog.targetFolderId);
    } catch {
      notificationStore.push({ severity: 'error', message: 'Move failed' });
    }
  }, [collisionDialog, tree]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <FileTreeToolbar
        providerLabel={providerLabel}
        onNewDiagram={handleNewDiagramInline}
        onNewFolder={handleNewFolder}
        onRefresh={tree.refresh}
        onCollapseAll={handleCollapseAll}
      />
      <Divider />

      {tree.error && (
        <Box sx={{ px: 1.5, py: 1 }}>
          <Typography variant="caption" color="error">{tree.error}</Typography>
        </Box>
      )}

      <Box ref={treeContainerRef} sx={{ flex: 1, overflow: 'hidden', py: 0.5 }}>
        {treeDataWithPending.length === 0 && !tree.isLoading && (
          <Box sx={{ px: 1.5, py: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              No diagrams yet. Create one to get started.
            </Typography>
          </Box>
        )}

        <Tree
          ref={treeRef}
          data={treeDataWithPending}
          openByDefault={false}
          onMove={handleMove}
          onRename={({ id, name }) => handleRenameSubmit(id, name)}
          onSelect={(nodes) => setSelectedNode(nodes[0]?.data ?? null)}
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
            />
          )}
        </Tree>
      </Box>

      {/* Context menu */}
      <Menu
        open={!!contextMenuAnchor}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenuAnchor
            ? { top: contextMenuAnchor.y, left: contextMenuAnchor.x }
            : undefined
        }
      >
        {contextMenuNode && (
          <ContextMenuItems
            node={contextMenuNode}
            onOpen={() => { if (contextMenuNode) handleOpenDiagram(contextMenuNode); }}
            onRename={() => contextMenuNode && handleRenameNode(contextMenuNode)}
            onDuplicate={() => contextMenuNode && handleDuplicate(contextMenuNode)}
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
        PaperProps={{ sx: { boxShadow: '0px 10px 20px -2px rgba(0,0,0,0.25)', borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1, pr: 6 }}>
          <Typography variant="h6" fontWeight={600} component="span">
            Delete &ldquo;{deleteConfirm?.name}&rdquo;?
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
            {deleteConfirm?.type === 'folder' && deleteConfirm.descendantCount > 0
              ? `This folder and ${deleteConfirm.descendantCount} item${deleteConfirm.descendantCount !== 1 ? 's' : ''} inside will be permanently deleted and cannot be recovered.`
              : `This ${deleteConfirm?.type === 'folder' ? 'folder' : 'diagram'} will be permanently deleted and cannot be recovered.`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
          <Button variant="text" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Name collision dialog */}
      <Dialog
        open={!!collisionDialog}
        onClose={() => setCollisionDialog(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { boxShadow: '0px 10px 20px -2px rgba(0,0,0,0.25)', borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1, pr: 6 }}>
          <Typography variant="h6" fontWeight={600} component="span">
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
    </Box>
  );
}
