import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Tabs,
  Tab,
  Box
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { HotkeySettings } from '../HotkeySettings/HotkeySettings';
import { PanSettings } from '../PanSettings/PanSettings';
import { ZoomSettings } from '../ZoomSettings/ZoomSettings';
import { LabelSettings } from '../LabelSettings/LabelSettings';
import { ConnectorSettings } from '../ConnectorSettings/ConnectorSettings';
import { IconPackSettings } from '../IconPackSettings/IconPackSettings';
import { useTranslation } from 'src/stores/localeStore';

export interface SettingsDialogProps {
  iconPackManager?: {
    lazyLoadingEnabled: boolean;
    onToggleLazyLoading: (enabled: boolean) => void;
    packInfo: Array<{
      name: string;
      displayName: string;
      loaded: boolean;
      loading: boolean;
      error: string | null;
      iconCount: number;
    }>;
    enabledPacks: string[];
    onTogglePack: (packName: string, enabled: boolean) => void;
  };
}

export const SettingsDialog = ({ iconPackManager }: SettingsDialogProps) => {
  const dialog = useUiStateStore((state) => state.dialog);
  const setDialog = useUiStateStore((state) => state.actions.setDialog);
  const [tabValue, setTabValue] = useState(0);
  const { t } = useTranslation();

  const isOpen = dialog === 'SETTINGS';

  const handleClose = () => {
    setDialog(null);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Settings
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label={t('settings.hotkeys.title')} />
          <Tab label="Canvas" />
          <Tab label={t('settings.connector.title')} />
          {iconPackManager && <Tab label={t('settings.iconPacks.title')} />}
        </Tabs>

        <Box sx={{ mt: 2 }}>
          {tabValue === 0 && <HotkeySettings />}
          {tabValue === 1 && (
            <>
              <PanSettings />
              <Box sx={{ px: 2, pb: 2 }}>
                <ZoomSettings />
              </Box>
              <Box sx={{ px: 2, pb: 2 }}>
                <LabelSettings />
              </Box>
            </>
          )}
          {tabValue === 2 && <ConnectorSettings />}
          {tabValue === 3 && iconPackManager && (
            <IconPackSettings
              lazyLoadingEnabled={iconPackManager.lazyLoadingEnabled}
              onToggleLazyLoading={iconPackManager.onToggleLazyLoading}
              packInfo={iconPackManager.packInfo}
              enabledPacks={iconPackManager.enabledPacks}
              onTogglePack={iconPackManager.onTogglePack}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};