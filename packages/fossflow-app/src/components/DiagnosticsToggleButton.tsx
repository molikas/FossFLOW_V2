/**
 * DiagnosticsToggleButton — compact Bug icon for the BottomDock.
 *
 * ON  (monitoring enabled)  → colored bug icon
 * OFF (monitoring disabled) → dimmed bug icon
 *
 * Clicking when closed opens the DiagnosticsOverlay panel.
 * The icon uses MUI BugReport to match the lib's icon set.
 */
import { useSyncExternalStore } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import {
  BugReportOutlined as BugIcon
} from '@mui/icons-material';
import { diagnosticsStore } from '../stores/diagnosticsStore';

const btnSx = {
  borderRadius: 1,
  p: 0.5,
  '&:hover': { bgcolor: 'action.hover' }
} as const;

export function DiagnosticsToggleButton() {
  const enabled = useSyncExternalStore(
    diagnosticsStore.subscribe,
    diagnosticsStore.getEnabled
  );

  const title = enabled
    ? 'Diagnostics (monitoring on)'
    : 'Diagnostics (monitoring off)';

  return (
    <Tooltip title={title} placement="top">
      <IconButton
        size="small"
        onClick={() => diagnosticsStore.setOpen(true)}
        sx={{
          ...btnSx,
          color: enabled ? 'success.main' : 'text.disabled'
        }}
      >
        <BugIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
}
