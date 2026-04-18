import { Box, Tooltip, Typography } from '@mui/material';
import {
  FolderOutlined as FolderIcon,
  FolderOpenOutlined as FolderOpenIcon,
  ArticleOutlined as DiagramIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  FiberManualRecord as DotIcon
} from '@mui/icons-material';
import type { NodeRendererProps } from 'react-arborist';
import type { FileNode } from '../../hooks/useFileTree';

interface Props extends NodeRendererProps<FileNode> {
  selectedId?: string | null;
  onContextMenu: (event: React.MouseEvent, node: FileNode) => void;
  onOpen: (node: FileNode) => void;
}

export function FileTreeNode({ node, style, dragHandle, selectedId, onContextMenu, onOpen }: Props) {
  const isFolder = node.data.type === 'folder';
  const isSelected = node.data.id === selectedId;
  const isDirty = node.data.isDirty;

  const handleClick = () => {
    if (isFolder) {
      node.toggle();
    } else {
      onOpen(node.data);
    }
  };

  const handleDoubleClick = () => {
    node.edit();
  };

  const FolderIconComponent = node.isOpen ? FolderOpenIcon : FolderIcon;

  const label = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        py: 0.25,
        borderRadius: 0.5,
        cursor: 'pointer',
        bgcolor: isSelected ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
        userSelect: 'none',
        overflow: 'hidden',
        width: '100%'
      }}
    >
      {/* Expand/collapse chevron for folders */}
      {isFolder ? (
        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'text.secondary', width: 16 }}>
          {node.isOpen
            ? <ExpandMoreIcon sx={{ fontSize: 16 }} />
            : <ChevronRightIcon sx={{ fontSize: 16 }} />}
        </Box>
      ) : (
        <Box sx={{ width: 16, flexShrink: 0 }} />
      )}

      {/* Icon */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: isFolder ? 'primary.main' : 'text.secondary' }}>
        {isFolder
          ? <FolderIconComponent sx={{ fontSize: 16 }} />
          : <DiagramIcon sx={{ fontSize: 16 }} />}
      </Box>

      {/* Name or inline rename input — never rendered together to avoid flex gap */}
      {node.isEditing ? (
        <input
          autoFocus
          defaultValue={node.data.name}
          onBlur={(e) => {
            const value = e.currentTarget.value;
            if (node.data.id === '__pending__' && !value.trim()) {
              node.submit(''); // routes to cancel path in handleRenameSubmit
            } else {
              node.submit(value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') node.submit(e.currentTarget.value);
            if (e.key === 'Escape') {
              if (node.data.id === '__pending__') {
                node.submit(''); // cancel pending node
              } else {
                node.reset();
              }
            }
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            border: '1px solid',
            borderRadius: 2,
            padding: '0 4px',
            fontSize: '0.8125rem',
            outline: 'none',
            minWidth: 0
          }}
        />
      ) : (
        <Typography
          variant="body2"
          noWrap
          sx={{
            flex: 1,
            fontSize: '0.8125rem',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {node.data.name}
          {isDirty && (
            <Box
              component="span"
              sx={{ ml: 0.5, color: 'warning.main', verticalAlign: 'middle' }}
            >
              <DotIcon sx={{ fontSize: 8 }} />
            </Box>
          )}
        </Typography>
      )}
    </Box>
  );

  const isPending = node.data.id === '__pending__';

  return (
    <Box
      ref={dragHandle}
      style={style}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => onContextMenu(e, node.data)}
      sx={{ display: 'flex', alignItems: 'center' }}
    >
      {isPending ? (
        label
      ) : !node.isEditing && node.data.type === 'diagram' && node.data.thumbnail ? (
        <Tooltip
          title={<img src={node.data.thumbnail} alt={node.data.name} style={{ maxWidth: 200, maxHeight: 150 }} />}
          placement="right"
          arrow
        >
          {label}
        </Tooltip>
      ) : (
        <Tooltip
          title={node.data.name.length > 28 ? node.data.name : ''}
          placement="right"
          arrow
          disableInteractive
        >
          {label}
        </Tooltip>
      )}
    </Box>
  );
}
