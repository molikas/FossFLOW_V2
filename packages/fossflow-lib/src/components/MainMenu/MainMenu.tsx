import React, { useState, useCallback, useMemo } from 'react';
import {
  Menu,
  Typography,
  Divider,
  Card,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  MenuOutlined as MenuIcon,
  GitHub as GitHubIcon,
  DataObject as ExportJsonIcon,
  ImageOutlined as ExportImageIcon,
  FolderOpen as FolderOpenIcon,
  DeleteOutline as DeleteOutlineIcon,
  Settings as SettingsIcon,
  AddOutlined as NewIcon
} from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  exportAsJSON,
  exportAsCompactJSON,
  transformFromCompactFormat
} from 'src/utils/exportOptions';
import { saveModelLocally } from 'src/utils/localStorageSave';
import { modelFromModelStore } from 'src/utils';
import { useInitialDataManager } from 'src/hooks/useInitialDataManager';
import { useModelStore } from 'src/stores/modelStore';
import { useHistory } from 'src/hooks/useHistory';
import { DialogTypeEnum } from 'src/types/ui';
import { MenuItem } from './MenuItem';
import { useTranslation } from 'src/stores/localeStore';
import { ConfirmDiscardDialog } from 'src/components/ConfirmDiscardDialog/ConfirmDiscardDialog';

type PendingAction = 'new' | 'open' | 'clear' | null;

export const MainMenu = () => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const model = useModelStore((state) => modelFromModelStore(state));
  const isMainMenuOpen = useUiStateStore((state) => state.isMainMenuOpen);
  const mainMenuOptions = useUiStateStore((state) => state.mainMenuOptions);
  const isDirty = useUiStateStore((state) => state.isDirty);
  const uiStateActions = useUiStateStore((state) => state.actions);
  const initialDataManager = useInitialDataManager();
  const { clearHistory } = useHistory();

  const { t } = useTranslation('mainMenu');

  const closeMenu = useCallback(() => {
    uiStateActions.setIsMainMenuOpen(false);
  }, [uiStateActions]);

  const onToggleMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(event.currentTarget);
      uiStateActions.setIsMainMenuOpen(true);
    },
    [uiStateActions]
  );

  const gotoUrl = useCallback((url: string) => {
    window.open(url, '_blank');
  }, []);

  const { load, clear } = initialDataManager;

  // ── Guard helpers ────────────────────────────────────────────────────────────

  /** Request an action — shows the discard guard if the model is dirty. */
  const requestAction = useCallback(
    (action: PendingAction) => {
      closeMenu();
      if (isDirty) {
        setPendingAction(action);
      } else {
        executeAction(action);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [isDirty]
  );

  const executeAction = useCallback((action: PendingAction) => {
    setPendingAction(null);
    switch (action) {
      case 'new':
        performNew();
        break;
      case 'open':
        performOpen();
        break;
      case 'clear':
        performClear();
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGuardSave = useCallback(() => {
    saveModelLocally(model);
    uiStateActions.setIsDirty(false);
    executeAction(pendingAction);
  }, [model, uiStateActions, pendingAction, executeAction]);

  const handleGuardDiscard = useCallback(() => {
    uiStateActions.setIsDirty(false);
    executeAction(pendingAction);
  }, [uiStateActions, pendingAction, executeAction]);

  const handleGuardCancel = useCallback(() => {
    setPendingAction(null);
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const performNew = useCallback(() => {
    clear();
    clearHistory();
    uiStateActions.setIsDirty(false);
  }, [clear, clearHistory, uiStateActions]);

  const performOpen = useCallback(() => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json';

    fileInput.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const fileReader = new FileReader();
      fileReader.onload = async (e) => {
        const rawData = JSON.parse(e.target?.result as string);
        let modelData = rawData;
        if (rawData._?.f === 'compact') {
          modelData = transformFromCompactFormat(rawData);
        }
        load(modelData);
        clearHistory();
        uiStateActions.setIsDirty(false);
      };
      fileReader.readAsText(file);
      uiStateActions.resetUiState();
    };

    fileInput.click();
  }, [load, clearHistory, uiStateActions]);

  const performClear = useCallback(() => {
    clear();
    clearHistory();
    uiStateActions.setIsDirty(false);
  }, [clear, clearHistory, uiStateActions]);

  // ── Export (marks model as clean) ───────────────────────────────────────────

  const onExportAsJSON = useCallback(() => {
    exportAsJSON(model);
    uiStateActions.setIsDirty(false);
    closeMenu();
  }, [model, uiStateActions, closeMenu]);

  const onExportAsCompactJSON = useCallback(() => {
    exportAsCompactJSON(model);
    uiStateActions.setIsDirty(false);
    closeMenu();
  }, [model, uiStateActions, closeMenu]);

  const onExportAsImage = useCallback(() => {
    closeMenu();
    uiStateActions.setDialog(DialogTypeEnum.EXPORT_IMAGE);
    // Image export also counts as "saved"
    uiStateActions.setIsDirty(false);
  }, [uiStateActions, closeMenu]);

  const onOpenSettings = useCallback(() => {
    closeMenu();
    uiStateActions.setDialog(DialogTypeEnum.SETTINGS);
  }, [uiStateActions, closeMenu]);

  // ── Visibility ───────────────────────────────────────────────────────────────

  const sectionVisibility = useMemo(
    () => ({
      actions: Boolean(
        mainMenuOptions.find(
          (opt) => opt.includes('ACTION') || opt.includes('EXPORT')
        )
      ),
      links: Boolean(mainMenuOptions.find((opt) => opt.includes('LINK'))),
      version: Boolean(mainMenuOptions.includes('VERSION'))
    }),
    [mainMenuOptions]
  );

  if (mainMenuOptions.length === 0) return null;

  return (
    <>
      <Tooltip title="Main menu" placement="bottom">
        <IconButton
          size="small"
          onClick={onToggleMenu}
          sx={{
            bgcolor: isMainMenuOpen ? 'action.selected' : 'transparent',
            borderRadius: 1,
            color: 'inherit'
          }}
        >
          <MenuIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={isMainMenuOpen}
        onClose={() => {
          if (anchorEl) anchorEl.focus();
          closeMenu();
        }}
        elevation={0}
        sx={{ mt: 2 }}
        MenuListProps={{ sx: { minWidth: '250px', py: 0 } }}
      >
        <Card sx={{ py: 1 }}>
          {mainMenuOptions.includes('ACTION.NEW') && (
            <MenuItem onClick={() => requestAction('new')} Icon={<NewIcon />}>
              {t('new')}
            </MenuItem>
          )}

          {mainMenuOptions.includes('ACTION.OPEN') && (
            <MenuItem
              onClick={() => requestAction('open')}
              Icon={<FolderOpenIcon />}
            >
              {t('open')}
            </MenuItem>
          )}

          {(mainMenuOptions.includes('EXPORT.JSON') ||
            mainMenuOptions.includes('EXPORT.PNG')) && <Divider />}

          {mainMenuOptions.includes('EXPORT.JSON') && (
            <MenuItem onClick={onExportAsJSON} Icon={<ExportJsonIcon />}>
              {t('exportJson')}
            </MenuItem>
          )}

          {mainMenuOptions.includes('EXPORT.JSON') && (
            <MenuItem onClick={onExportAsCompactJSON} Icon={<ExportJsonIcon />}>
              {t('exportCompactJson')}
            </MenuItem>
          )}

          {mainMenuOptions.includes('EXPORT.PNG') && (
            <MenuItem onClick={onExportAsImage} Icon={<ExportImageIcon />}>
              {t('exportImage')}
            </MenuItem>
          )}

          {mainMenuOptions.includes('ACTION.CLEAR_CANVAS') && (
            <>
              <Divider />
              <MenuItem
                onClick={() => requestAction('clear')}
                Icon={<DeleteOutlineIcon />}
              >
                {t('clearCanvas')}
              </MenuItem>
            </>
          )}

          <Divider />

          <MenuItem onClick={onOpenSettings} Icon={<SettingsIcon />}>
            {t('settings')}
          </MenuItem>

          {sectionVisibility.links && (
            <>
              <Divider />
              {mainMenuOptions.includes('LINK.GITHUB') && (
                <MenuItem
                  onClick={() => gotoUrl(`${REPOSITORY_URL}`)}
                  Icon={<GitHubIcon />}
                >
                  {t('gitHub')}
                </MenuItem>
              )}
            </>
          )}

          {sectionVisibility.version && (
            <>
              <Divider />
              {mainMenuOptions.includes('VERSION') && (
                <MenuItem>
                  <Typography variant="body2" color="text.secondary">
                    FossFLOW Community Edition v{PACKAGE_VERSION}
                  </Typography>
                </MenuItem>
              )}
            </>
          )}
        </Card>
      </Menu>

      <ConfirmDiscardDialog
        open={pendingAction !== null}
        onSave={handleGuardSave}
        onDiscard={handleGuardDiscard}
        onCancel={handleGuardCancel}
      />
    </>
  );
};
