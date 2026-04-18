import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import {
  ArticleOutlined as NewDiagramIcon,
  CreateNewFolderOutlined as NewFolderIcon,
  RefreshOutlined as RefreshIcon,
  UnfoldLessOutlined as CollapseAllIcon
} from '@mui/icons-material';

interface Props {
  providerLabel: string;
  onNewDiagram: () => void;
  onNewFolder: () => void;
  onRefresh: () => Promise<void>;
  onCollapseAll: () => void;
}

export function FileTreeToolbar({
  providerLabel,
  onNewDiagram,
  onNewFolder,
  onRefresh,
  onCollapseAll
}: Props) {
  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        minHeight: 32
      }}
    >
      <Typography
        variant="caption"
        sx={{
          flex: 1,
          fontWeight: 700,
          fontSize: '0.6875rem',
          letterSpacing: '0.06em',
          color: 'text.secondary',
          userSelect: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {providerLabel}
      </Typography>

      <Tooltip title="New diagram" placement="bottom">
        <IconButton size="small" onClick={onNewDiagram} sx={{ flexShrink: 0 }}>
          <NewDiagramIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>

      <Tooltip title="New folder" placement="bottom">
        <IconButton size="small" onClick={onNewFolder} sx={{ flexShrink: 0 }}>
          <NewFolderIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>

      <Tooltip title="Refresh" placement="bottom">
        <IconButton size="small" onClick={onRefresh} sx={{ flexShrink: 0 }}>
          <RefreshIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>

      <Tooltip title="Collapse all" placement="bottom">
        <IconButton size="small" onClick={onCollapseAll} sx={{ flexShrink: 0 }}>
          <CollapseAllIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
