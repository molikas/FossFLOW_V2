import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  SaveOutlined as SaveIcon,
  ShareOutlined as ShareIcon,
  Close as CloseIcon,
  SlideshowOutlined as PresentIcon,
  ArrowBack as ArrowBackIcon,
  ArrowDropDown as ArrowDropDownIcon,
  LinkOutlined as LinkIcon,
  VisibilityOutlined as ShowControlsIcon,
  VisibilityOffOutlined as HideControlsIcon
} from '@mui/icons-material';
import { useAppStorage } from '../providers/AppStorageContext';
import { useDiagramLifecycle } from '../providers/DiagramLifecycleProvider';
import { StatusCluster } from './StatusCluster';
import { ExportPopover } from './ExportPopover';
import { AuthControl } from './AuthControl';
import { shareUrlFromUuid } from '../utils/shareUrl';
import {
  drivePreviewUrl,
  getAccessOverview,
  isShared,
  AccessOverview
} from '../services/drive/driveSharing';
import { DriveShareManageDialog } from './DriveShareManageDialog';
import { useNotificationStore } from '../stores/notificationStore';

export function AppToolbar() {
  const { t } = useTranslation('app');
  const location = useLocation();
  const navigate = useNavigate();
  const {
    serverStorageAvailable,
    remoteStorageActive,
    activeProviderId,
    storage
  } = useAppStorage();
  const driveActive = activeProviderId === 'google-drive';
  const {
    hasUnsavedChanges,
    isReadonlyUrl,
    currentDiagram,
    setSidebarTogglePortalTarget,
    setStyleControlsPortalTarget,
    handleSaveClick,
    handlePreviewClick
  } = useDiagramLifecycle();

  const shareButtonRef = useRef<HTMLButtonElement>(null);
  // STABLE portal-target refs. The toolbar's editable branch unmounts when you
  // enter presentation and remounts on return — a *new* DOM node each time. The
  // old "set once" guard left the portal pointing at the stale (detached) node,
  // so the top-bar style strip + sidebar toggle vanished after a present→edit
  // round-trip. A stable callback ref fires on every mount (el) / unmount (null),
  // so the portal target always tracks the live node. (Stable identity → React
  // does not re-invoke it on ordinary re-renders, so no thrash.)
  const setStyleControlsRef = useCallback(
    (el: HTMLDivElement | null) => {
      // Re-point on every (re)mount of the toolbar's editable branch. On unmount
      // (el === null) we keep the old target — harmless, since the portal isn't
      // rendered in presentation; the next mount supplies the live node.
      if (el) setStyleControlsPortalTarget(el);
    },
    [setStyleControlsPortalTarget]
  );
  const setSidebarToggleRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) setSidebarTogglePortalTarget(el);
    },
    [setSidebarTogglePortalTarget]
  );
  const notify = useNotificationStore((s) => s.push);
  const [showSharePopover, setShowSharePopover] = useState(false);
  // Drive-mode share caret menu (quick Copy link + access status). null = closed.
  const [shareMenuAnchor, setShareMenuAnchor] = useState<HTMLElement | null>(null);
  // View-only "hide all controls" — bridged to the lib (separate store) via a
  // window event the lib's UiOverlay listens for. Local state drives the button.
  const [hideControls, setHideControls] = useState(false);
  // Whole-screen annotation (2026-07-22): the lib's AnnotationLayer covers the
  // canvas region + its docks while a draw/eraser tool is armed, but the top bar
  // lives ABOVE that region, out of the overlay's reach. It bridges the armed
  // state here so the bar goes inert (and reads inert) while drawing — the pen +
  // palette (in the lib overlay) stay operable, so annotation is always exitable.
  const [annotationCapturing, setAnnotationCapturing] = useState(false);
  useEffect(() => {
    const onCapturing = (e: Event) => {
      setAnnotationCapturing(!!(e as CustomEvent).detail?.capturing);
    };
    window.addEventListener('axoview-annotation-capturing', onCapturing);
    return () =>
      window.removeEventListener('axoview-annotation-capturing', onCapturing);
  }, []);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // Drive branch only (ADR 0042 §1): current ACL state (summary + people count)
  // for the caret menu's status line. null = still checking.
  const [driveOverview, setDriveOverview] = useState<AccessOverview | null>(null);
  // ACL check FAILED (distinct from still-loading) — an inline error beats an
  // eternal "Checking…". Reset per popover open / diagram change.
  const [driveAccessError, setDriveAccessError] = useState(false);
  // Monotonic id guarding the popover's async fetches: a diagram switch (or a
  // reopen) bumps it, so a late-resolving getFileShareMeta / getAccessSummary
  // for the OLD file can't paint stale data (or a stale ACL) onto the new one.
  const shareReqRef = useRef(0);

  const currentDiagramId = currentDiagram?.id;

  useEffect(() => {
    shareReqRef.current++; // invalidate any in-flight share fetch for the old id
    setShareUrl('');
    setShareCopied(false);
    setShareError(null);
    setShareLoading(false);
    setDriveOverview(null);
    setDriveAccessError(false);
    setShowSharePopover(false);
    setShareMenuAnchor(null);
  }, [currentDiagramId]);

  // SESSION-place share: create/copy a `/display/p/<uuid>` snapshot link in a
  // popover. (Drive-place sharing goes through the split Share button → Manage
  // dialog + caret menu instead; ADR 0042 §1.)
  const handleShareClick = async () => {
    const fileId = currentDiagramId;
    if (!fileId || !serverStorageAvailable || !storage) return;
    // This click owns the popover's async state until superseded.
    const reqId = ++shareReqRef.current;
    const current = () => shareReqRef.current === reqId;
    setShowSharePopover(true);
    setShareError(null);
    let url = shareUrl;
    if (!url) {
      try {
        setShareLoading(true);
        if (!storage?.shareDiagram) {
          if (current()) setShareError(t('share.unavailable', 'Sharing is not available'));
          return;
        }
        const result = await storage.shareDiagram(fileId);
        url = shareUrlFromUuid(result.uuid);
        if (!current()) return; // diagram switched mid-fetch — drop the stale URL
        setShareUrl(url);
      } catch (err) {
        if (current()) {
          setShareError(
            err instanceof Error
              ? err.message
              : t('share.failed', 'Failed to create share link')
          );
        }
        return;
      } finally {
        if (current()) setShareLoading(false);
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (!current()) return;
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
  };

  // Drive-mode caret menu: re-read the ACL each open (the Manage dialog or another
  // Drive tab may have changed it), guarded by the monotonic request id.
  const handleShareMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    if (!currentDiagramId) return;
    setShareMenuAnchor(e.currentTarget);
    const reqId = ++shareReqRef.current;
    setDriveAccessError(false);
    setDriveOverview(null);
    void getAccessOverview(currentDiagramId)
      .then((o) => {
        if (shareReqRef.current === reqId) setDriveOverview(o);
      })
      .catch(() => {
        if (shareReqRef.current === reqId) setDriveAccessError(true);
      });
  };

  // Quick "Copy link" from the caret menu — the live viewer link (app-created
  // Drive files carry no resourceKey, so fileId alone is the deterministic URL).
  const handleQuickCopyLink = async () => {
    const fileId = currentDiagramId;
    setShareMenuAnchor(null);
    if (!fileId) return;
    try {
      await navigator.clipboard.writeText(drivePreviewUrl(fileId));
      // Only worth "success" if the link will actually open for a recipient.
      //
      // S3/DRV-06: there are THREE answers here, not two. This used to choose
      // with `shared || !driveOverview` — the `!driveOverview` disjunct being a
      // deliberate "don't cry wolf" clause for a failed `getAccessOverview`.
      // But that made an UNKNOWN ACL report as a GOOD one, and unknown is
      // exactly the case where the app does not know whether the link works.
      // The Manage-access dialog computed the same question over a null
      // permissions array and warned, so the two surfaces disagreed on
      // precisely the unknown case. Neither confident answer is honest — say so.
      if (!driveOverview) {
        notify({
          severity: 'info',
          message: t(
            'share.drive.manage.copiedUnknownAccess',
            "Link copied. We couldn't check who has access — open Manage access to be sure."
          )
        });
      } else {
        notify(
          isShared(driveOverview)
            ? {
                severity: 'success',
                message: t('share.drive.manage.copiedToast', 'Preview link copied to clipboard')
              }
            : {
                severity: 'warning',
                message: t(
                  'share.drive.manage.copiedRestricted',
                  'Link copied — but only people with access can open it. Set General access to "Anyone with the link" to let anyone view.'
                )
              }
        );
      }
    } catch {
      // Clipboard blocked (insecure context) — nothing copied; stay silent.
    }
  };

  const handleShareUrlClick = (e: React.MouseEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).select();
  };

  // "Manage access" opens the custom in-app share dialog (ADR 0042 §1, rev.
  // 2026-07-14 — the deprecated ShareClient widget was replaced by a Drive REST
  // v3 permissions UI). Re-read the ACL summary when it closes so the popover's
  // "Anyone with the link" / "Restricted" indicator stays truthful.
  const [showManageDialog, setShowManageDialog] = useState(false);
  const handleManageAccessClick = () => {
    if (!currentDiagramId) return;
    setShowManageDialog(true);
  };
  const refreshAccessSummary = useCallback(() => {
    if (!driveActive || !currentDiagramId) return;
    const reqId = ++shareReqRef.current;
    setDriveAccessError(false);
    void getAccessOverview(currentDiagramId)
      .then((o) => {
        if (shareReqRef.current === reqId) setDriveOverview(o);
      })
      .catch(() => {
        if (shareReqRef.current === reqId) setDriveAccessError(true);
      });
  }, [driveActive, currentDiagramId]);

  // User-facing copy never says "session mode" — see workflow + ADR 0008 D1:
  // end users read "session" as something different from the audit's mode name.
  // The session-place disabled copy must NOT claim sharing requires
  // self-hosting — Drive-place diagrams share serverlessly (ADR 0042 §3).
  const shareDisabled = driveActive
    ? !currentDiagramId
    : !serverStorageAvailable || !currentDiagramId;
  const shareTooltip =
    !serverStorageAvailable && !driveActive
      ? t(
          'toolbar.share.disabled.sessionPlaceNeedsServerStorage',
          'Shareable links for this diagram need server storage (self-hosted Docker or Cloudflare). Diagrams saved to Google Drive can be shared from any deployment.'
        )
      : !currentDiagramId
        ? t(
            'toolbar.share.disabled.needsDiagram',
            'Open or create a diagram first to share it.'
          )
        : t('nav.share', 'Share');

  return (
    <Box
      className="toolbar"
      // The toolbar sits ABOVE the canvas, so the annotation overlay can never
      // cover it. Without this, a press-drag on the bar (e.g. someone drawing
      // with the annotation pen who strays onto the top bar) starts a native
      // HTML drag — the avatar <img> or a text selection — which paints a
      // translucent ghost of the toolbar and reads as UI corruption. Suppress
      // both: no text selection, and swallow any bubbled `dragstart` from a
      // child (image / selection). Mirrors the renderer's onDragStart guard in
      // useInteractionManager.
      onDragStart={(e) => e.preventDefault()}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        px: 1.5,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        userSelect: 'none',
        // Inert (and dimmed, so it READS inert — §2.5 spirit) while an annotation
        // draw tool is armed; the lib overlay owns the rest of the screen.
        pointerEvents: annotationCapturing ? 'none' : undefined,
        opacity: annotationCapturing ? 0.5 : 1,
        transition: 'opacity 120ms ease'
      }}
    >
      {/* LEFT: subtle brand mark (ADR 0005 amendment 2026-05-19 — logo + muted
          wordmark only). R1 (ADR 0040): links to the marketing landing at the
          site root (`${PUBLIC_URL}/`), the "home" affordance. Full navigation
          (not router), so it leaves the editor — the beforeunload guard still
          warns on unsaved work. */}
      <Box
        component="a"
        href={`${(process.env.PUBLIC_URL || '').replace(/\/$/, '')}/`}
        className="toolbar-left"
        aria-label="Axoview — home"
        title="Axoview home"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          flexShrink: 0,
          userSelect: 'none',
          pr: 1,
          textDecoration: 'none',
          color: 'inherit',
          cursor: 'pointer',
          '&:hover': { opacity: 0.82 }
        }}
      >
        <Box
          component="img"
          src={`${process.env.PUBLIC_URL || ''}/favicon-96x96.png`.replace(/\/+/g, '/')}
          alt=""
          sx={{ width: 24, height: 24, display: 'block' }}
        />
        <Typography
          component="span"
          sx={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: '#1f2937',
            lineHeight: 1
          }}
        >
          Axo<Box component="span" sx={{ color: '#2563eb' }}>view</Box>
        </Typography>
      </Box>

      {/* Format strip — LEFT-aligned after the brand (Lucid pattern; owner
          directive 2026-07-06, amends ADR 0005's empty-center layout). Still
          the ONE compressible group (F1): it shrinks and scrolls horizontally
          under viewport squeeze while the right cluster keeps its natural
          width. Portal filled by the lib's UiOverlay (selection store + scene
          actions in scope); controls self-gate on the current selection. */}
      {!isReadonlyUrl && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          <Box
            ref={setStyleControlsRef}
            data-axoview-id="toolbar-style-slot"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 1,
              minWidth: 0,
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'thin',
              '&::-webkit-scrollbar': { height: 4 },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: 'action.disabled',
                borderRadius: 2
              }
            }}
          />
        </>
      )}

      {/* CENTER: flexible spacer (ADR 0005 empty-center, now sitting between
          the left-aligned strip and the right action cluster) */}
      <Box className="toolbar-center" sx={{ flex: 1 }} />

      {/* RIGHT: action groups separated by dividers — natural width; the
          left strip absorbs viewport squeeze (F1). */}
      <Box
        className="toolbar-right"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          flexShrink: 0
        }}
      >
        {isReadonlyUrl ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 1 }}>
            <Chip
              label={t('dialog.readOnly.mode')}
              variant="outlined"
              size="small"
            />
            <Tooltip
              title={t(
                hideControls
                  ? 'toolbar.showControls'
                  : 'toolbar.hideControls',
                hideControls ? 'Show controls' : 'Hide controls'
              )}
            >
              <IconButton
                size="small"
                aria-pressed={hideControls}
                onClick={() => {
                  const next = !hideControls;
                  setHideControls(next);
                  window.dispatchEvent(
                    new CustomEvent('axoview-set-hide-view-controls', {
                      detail: { hide: next }
                    })
                  );
                }}
                data-axoview-id="toolbar-hide-view-controls"
                sx={{
                  ...(hideControls && { bgcolor: 'action.selected' })
                }}
              >
                {hideControls ? (
                  <ShowControlsIcon sx={{ fontSize: 18 }} />
                ) : (
                  <HideControlsIcon sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Tooltip>
            {(location.state as { fromEditor?: boolean } | null)?.fromEditor && (
              <Tooltip title={t('toolbar.backToEditing', 'Back to editing')}>
                <Button
                  size="small"
                  startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
                  onClick={() => navigate(-1)}
                  data-axoview-id="toolbar-back-to-editing"
                  sx={{ textTransform: 'none' }}
                >
                  {t('toolbar.backToEditing', 'Back to editing')}
                </Button>
              </Tooltip>
            )}
          </Stack>
        ) : (
          <>
            {/* Group 2: Save group — Save action (session mode only; remote
                storage autosaves) + StatusCluster */}
            {!remoteStorageActive && (
              <Tooltip
                title={t('nav.save', 'Save') + ' (Ctrl+S)'}
                placement="bottom"
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={handleSaveClick}
                    disabled={!currentDiagram || !hasUnsavedChanges}
                    data-axoview-id="toolbar-save"
                    sx={{ borderRadius: 1, color: 'primary.main' }}
                  >
                    <SaveIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            <StatusCluster />

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            {/* Group 3: Document actions — Export + Share + Present. Share
                renders for BOTH places (ADR 0042 §1, superseding ADR 0036 §4's
                Drive-mode hide): Drive-place diagrams share through Drive's own
                ACL (live preview links + the native sharing dialog), enabled
                whenever a diagram is open; session-place diagrams keep the
                snapshot-link contract (ADR 0010) and stay render-disabled (not
                hidden) without server storage so the affordance still signals
                the feature exists. */}
            <ExportPopover />
            {driveActive ? (
              // Drive place: a split Share button — primary opens the Manage-access
              // dialog (the full sharing UI), the caret opens a quick menu (Copy
              // link + access status). Mirrors the Drive/Figma share affordance.
              <Tooltip title={shareTooltip} placement="bottom">
                <Box component="span" sx={{ display: 'inline-flex', ml: 0.5 }}>
                  <ButtonGroup variant="outlined" size="small" disabled={shareDisabled}>
                    <Button
                      startIcon={<ShareIcon sx={{ fontSize: 16 }} />}
                      onClick={handleManageAccessClick}
                      data-axoview-id="toolbar-share"
                      sx={{ textTransform: 'none' }}
                    >
                      {t('nav.share', 'Share')}
                    </Button>
                    <Button
                      onClick={handleShareMenuOpen}
                      data-axoview-id="toolbar-share-caret"
                      aria-label={t('share.moreOptions', 'More share options')}
                      sx={{ px: 0.25, minWidth: 0 }}
                    >
                      <ArrowDropDownIcon sx={{ fontSize: 18 }} />
                    </Button>
                  </ButtonGroup>
                </Box>
              </Tooltip>
            ) : (
              // Session place: single Share button → snapshot-link popover (ADR 0010).
              <Tooltip title={shareTooltip} placement="bottom">
                <span>
                  <Button
                    ref={shareButtonRef}
                    size="small"
                    startIcon={<ShareIcon sx={{ fontSize: 16 }} />}
                    onClick={handleShareClick}
                    disabled={shareDisabled}
                    data-axoview-id="toolbar-share"
                    sx={{ textTransform: 'none', ml: 0.5 }}
                  >
                    {t('nav.share', 'Share')}
                  </Button>
                </span>
              </Tooltip>
            )}
            <Tooltip
              title={
                !currentDiagramId
                  ? t('toolbar.presentSaveFirst', 'Save first to present')
                  : t('toolbar.present', 'Present')
              }
              placement="bottom"
            >
              <span>
                <IconButton
                  size="small"
                  onClick={handlePreviewClick}
                  disabled={!currentDiagramId}
                  data-axoview-id="toolbar-preview"
                  sx={{ borderRadius: 1, color: 'inherit' }}
                >
                  <PresentIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            {/* Group 3.5: Account — the avatar menu is the single auth home
                (places model 2026-07-06; the storage picker was removed).
                Self-hides when no Google client id is configured. */}
            <AuthControl />

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            {/* Group 4: Sidebar toggle — Properties panel portal */}
            <Box
              ref={setSidebarToggleRef}
              data-axoview-id="toolbar-sidebar-slot"
              sx={{ display: 'inline-flex', alignItems: 'center' }}
            />
          </>
        )}
      </Box>

      {/* Share popover. onClose reason-guarded — only backdrop click + Escape
          dismiss; any other path (focus shifts, internal MUI dispatches) keeps
          it open. B-3 original symptom: clicks inside the TextField closed the
          popover; the underlying cause was a custom document mousedown listener
          (removed in 95a0fd5) that treated portaled content as outside. This
          reason guard is the defense-in-depth for any future MUI behaviour
          drift. */}
      {!isReadonlyUrl && !driveActive && (
        <Popover
          open={showSharePopover && !!currentDiagramId}
          anchorEl={shareButtonRef.current}
          onClose={(_event, reason) => {
            if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
              setShowSharePopover(false);
            }
          }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              sx: { p: 2, width: 380, mt: 0.5 },
              'data-axoview-id': 'share-popover'
            } as React.ComponentProps<'div'>
          }}
        >
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2">
                {t('share.title', 'Share Diagram')}
              </Typography>
              <IconButton
                size="small"
                onClick={() => setShowSharePopover(false)}
                data-axoview-id="share-popover-close"
              >
                <CloseIcon />
              </IconButton>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {t('share.hint', 'Anyone with this link can view the diagram in read-only mode.')}
            </Typography>
            {shareError && (
              <Typography variant="body2" color="error">
                {shareError}
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                fullWidth
                value={shareLoading ? t('share.creating', 'Creating link…') : shareUrl}
                inputProps={{
                  readOnly: true,
                  'data-axoview-id': 'share-url-input',
                  style: { fontFamily: 'monospace', fontSize: 12 }
                }}
                onClick={handleShareUrlClick}
              />
              <Button
                variant={shareCopied ? 'contained' : 'outlined'}
                color={shareCopied ? 'success' : 'primary'}
                size="small"
                onClick={handleShareClick}
                disabled={shareLoading}
                data-axoview-id="share-copy-button"
                sx={{ whiteSpace: 'nowrap', minWidth: 80, textTransform: 'none' }}
              >
                {shareCopied ? t('share.copied', '✓ Copied!') : t('share.copy', 'Copy')}
              </Button>
            </Stack>
          </Stack>
        </Popover>
      )}

      {/* Drive-mode share caret menu — quick Copy link + at-a-glance access status
          (ADR 0042 §1). The primary Share button opens the full Manage dialog. */}
      {!isReadonlyUrl && driveActive && (
        <Menu
          anchorEl={shareMenuAnchor}
          open={!!shareMenuAnchor && !!currentDiagramId}
          onClose={() => setShareMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          // `dense` drops the item text to body2 (14px), matching ExportPopover's
          // <MenuList dense> — without it the app-level Menu inherits MUI's
          // body1 (16px) default and "Copy link" reads oversized (bloat fix).
          MenuListProps={{ dense: true }}
          slotProps={{
            paper: {
              sx: { minWidth: 248, mt: 0.5 },
              'data-axoview-id': 'share-menu'
            } as React.ComponentProps<'div'>
          }}
        >
          <MenuItem onClick={() => void handleQuickCopyLink()} data-axoview-id="share-menu-copy-link">
            <ListItemIcon>
              <LinkIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('share.drive.manage.copyLink', 'Copy link')}</ListItemText>
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />
          {/* Non-interactive status row (Google's "Shared with…" line analogue). */}
          <Box sx={{ px: 2, py: 0.5 }} data-axoview-id="share-menu-status">
            <Typography
              variant="caption"
              color={driveAccessError ? 'error' : 'text.secondary'}
            >
              {driveAccessError
                ? t('share.drive.accessError', "Couldn't check who has access.")
                : !driveOverview
                  ? t('share.drive.accessUnknown', 'Checking who has access…')
                  : driveOverview.summary === 'anyone-with-link'
                    ? t('share.drive.accessAnyone', 'Anyone with the link can view')
                    : driveOverview.peopleCount > 0
                      ? t('share.drive.sharedWithCount', {
                          count: driveOverview.peopleCount,
                          defaultValue: `Shared with ${driveOverview.peopleCount} people`
                        })
                      : t('share.drive.accessRestricted', 'Only people with access can view')}
            </Typography>
          </Box>
        </Menu>
      )}

      {/* Custom in-app "Manage access" (ADR 0042 §1 rev. 2026-07-14) — Drive
          REST v3 permissions UI, replacing the deprecated ShareClient widget. */}
      {driveActive && currentDiagramId && (
        <DriveShareManageDialog
          open={showManageDialog}
          fileId={currentDiagramId}
          diagramName={currentDiagram?.name}
          onClose={() => setShowManageDialog(false)}
          onAccessChanged={refreshAccessSummary}
        />
      )}
    </Box>
  );
}
