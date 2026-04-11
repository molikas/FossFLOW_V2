import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  Popover,
  Stack,
  TextField,
  Typography,
  Button,
  Tooltip
} from '@mui/material';
import {
  SaveOutlined as SaveIcon,
  FolderOpenOutlined as FolderIcon,
  ShareOutlined as ShareIcon,
  Close as CloseIcon,
  VisibilityOutlined as PreviewIcon
} from '@mui/icons-material';

interface Props {
  diagramName: string;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  isReadonlyUrl: boolean;
  serverStorageAvailable: boolean;
  currentDiagramId: string | null | undefined;
  /** Portal container target for the library's MainMenu injection */
  onToolbarPortalReady: (el: HTMLElement) => void;
  /** Portal container target for the library's sidebar-toggle injection */
  onSidebarTogglePortalReady: (el: HTMLElement) => void;
  onSaveClick: () => void;
  onOpenClick: () => void;
  onPreviewClick: () => void;
}

export function AppToolbar({
  diagramName,
  hasUnsavedChanges,
  lastSaved,
  isReadonlyUrl,
  serverStorageAvailable,
  currentDiagramId,
  onToolbarPortalReady,
  onSidebarTogglePortalReady,
  onSaveClick,
  onOpenClick,
  onPreviewClick
}: Props) {
  const { t } = useTranslation('app');
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const [toolbarPortalSet, setToolbarPortalSet] = useState(false);
  const [sidebarPortalSet, setSidebarPortalSet] = useState(false);
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const shareUrl = currentDiagramId
    ? `${window.location.origin}/display/${currentDiagramId}`
    : '';

  const handleShareClick = () => {
    if (!serverStorageAvailable || !currentDiagramId) return;
    navigator.clipboard.writeText(shareUrl).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setShareCopied(true);
    setShowSharePopover(true);
    setTimeout(() => setShareCopied(false), 2500);
  };

  const handleShareUrlClick = (e: React.MouseEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).select();
  };

  // Close share popover on outside click
  useEffect(() => {
    if (!showSharePopover) return;
    const handleOutside = (e: MouseEvent) => {
      const btn = shareButtonRef.current;
      if (btn && !btn.parentElement?.contains(e.target as Node)) {
        setShowSharePopover(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showSharePopover]);

  const formatSavedAt = (d: Date): string => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (dDay.getTime() === today.getTime()) return t('status.savedAt', { time });
    if (dDay.getTime() === yesterday.getTime())
      return t('status.savedYesterdayAt', { time });
    const month = d.toLocaleString([], { month: 'short' });
    const day = d.getDate();
    if (d.getFullYear() === now.getFullYear())
      return t('status.savedOnDate', { month, day, time });
    return t('status.savedOnDateYear', { month, day, year: d.getFullYear(), time });
  };

  return (
    <Box
      className="toolbar"
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        px: 1.5,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 0
      }}
    >
      {/* LEFT: menu portal + save + open */}
      <Box
        className="toolbar-left"
        sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}
      >
        <Box
          ref={(el: HTMLDivElement | null) => {
            if (el && !toolbarPortalSet) {
              setToolbarPortalSet(true);
              onToolbarPortalReady(el);
            }
          }}
          sx={{ display: 'inline-flex', alignItems: 'center' }}
        />
        {!isReadonlyUrl && (
          <>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title={t('nav.save', 'Save') + ' (Ctrl+S)'} placement="bottom">
              <span>
                <IconButton
                  size="small"
                  onClick={onSaveClick}
                  disabled={!!currentDiagramId && !hasUnsavedChanges}
                  sx={{ borderRadius: 1, color: 'inherit' }}
                >
                  <SaveIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip
              title={t('nav.diagrams', 'Diagrams') + ' (Ctrl+O)'}
              placement="bottom"
            >
              <IconButton
                size="small"
                onClick={onOpenClick}
                sx={{ borderRadius: 1, color: 'inherit' }}
              >
                <FolderIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
        {isReadonlyUrl && (
          <Chip
            label={t('dialog.readOnly.mode')}
            variant="outlined"
            size="small"
            sx={{ ml: 1 }}
          />
        )}
      </Box>

      {/* CENTER: diagram name */}
      <Box
        className="toolbar-center"
        sx={{ flex: 1, display: 'flex', justifyContent: 'center', px: 1, overflow: 'hidden' }}
      >
        {diagramName && (
          <Typography
            variant="body2"
            fontWeight={500}
            color="text.secondary"
            noWrap
            sx={{ userSelect: 'none' }}
          >
            {diagramName}
          </Typography>
        )}
      </Box>

      {/* RIGHT: status | share + preview | sidebar toggle portal */}
      <Box
        className="toolbar-right"
        sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}
      >
        {!isReadonlyUrl && (
          <>
            <Typography
              variant="caption"
              sx={{
                color: hasUnsavedChanges ? 'text.primary' : 'text.disabled',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                minWidth: 60,
                textAlign: 'right'
              }}
            >
              {lastSaved
                ? `${formatSavedAt(lastSaved)}${hasUnsavedChanges ? ' •' : ''}`
                : hasUnsavedChanges
                  ? t('status.unsaved', 'Unsaved')
                  : ''}
            </Typography>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip
              title={
                !serverStorageAvailable || !currentDiagramId
                  ? t('nav.share', 'Share') + ' (requires server)'
                  : t('nav.share', 'Share')
              }
              placement="bottom"
            >
              <span>
                <IconButton
                  ref={shareButtonRef}
                  size="small"
                  onClick={handleShareClick}
                  disabled={!serverStorageAvailable || !currentDiagramId}
                  sx={{ borderRadius: 1, color: 'inherit' }}
                >
                  <ShareIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip
              title={
                !serverStorageAvailable || !currentDiagramId
                  ? t('toolbar.previewSaveFirst', 'Save first to preview')
                  : hasUnsavedChanges
                    ? t('toolbar.saveAndPreview', 'Save & Preview')
                    : t('toolbar.preview', 'Preview')
              }
              placement="bottom"
            >
              <span>
                <IconButton
                  size="small"
                  onClick={onPreviewClick}
                  disabled={!serverStorageAvailable || !currentDiagramId}
                  sx={{ borderRadius: 1, color: 'inherit' }}
                >
                  <PreviewIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Box
              ref={(el: HTMLDivElement | null) => {
                if (el && !sidebarPortalSet) {
                  setSidebarPortalSet(true);
                  onSidebarTogglePortalReady(el);
                }
              }}
              sx={{ display: 'inline-flex', alignItems: 'center' }}
            />
          </>
        )}
      </Box>

      {/* Share popover */}
      {!isReadonlyUrl && (
        <Popover
          open={showSharePopover && !!currentDiagramId}
          anchorEl={shareButtonRef.current}
          onClose={() => setShowSharePopover(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ sx: { p: 2, width: 380, mt: 0.5 } }}
        >
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2">
                {t('share.title', 'Share Diagram')}
              </Typography>
              <IconButton size="small" onClick={() => setShowSharePopover(false)}>
                <CloseIcon />
              </IconButton>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {t(
                'share.hint',
                'Anyone with this link can view the diagram in read-only mode.'
              )}
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                fullWidth
                value={shareUrl}
                inputProps={{
                  readOnly: true,
                  style: { fontFamily: 'monospace', fontSize: 12 }
                }}
                onClick={handleShareUrlClick}
              />
              <Button
                variant={shareCopied ? 'contained' : 'outlined'}
                color={shareCopied ? 'success' : 'primary'}
                size="small"
                onClick={handleShareClick}
                sx={{ whiteSpace: 'nowrap', minWidth: 80 }}
              >
                {shareCopied ? t('share.copied', '✓ Copied!') : t('share.copy', 'Copy')}
              </Button>
            </Stack>
          </Stack>
        </Popover>
      )}
    </Box>
  );
}
