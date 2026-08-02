import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography
} from '@mui/material';
import {
  Close as CloseIcon,
  ArticleOutlined as DiagramIcon
} from '@mui/icons-material';
import { useAppStorage } from '../providers/AppStorageContext';
import { useDiagramLifecycle } from '../providers/DiagramLifecycleProvider';
import { useAuthStore, AuthStatus } from '../stores/authStore';
import { GoogleDriveProvider } from '../services/storage/providers/GoogleDriveProvider';
import { moveDiagramsToDrive } from '../services/storage/driveTransfer';
import { notificationStore } from '../stores/notificationStore';
import type { DiagramMeta } from '../services/storage/types';

interface MigrateItem {
  meta: DiagramMeta;
  checked: boolean;
}

/**
 * "Move session diagrams to Google Drive?" (storage-ux-unification E,
 * 2026-07-06 — supersedes the ADR 0036 §6 "no bulk migration dialog" call).
 *
 * Auto-offers once after every FRESH sign-in (not hourly token refreshes)
 * while session diagrams exist, gated on the Drive root being configured so
 * migration can never race the first-connect folder chooser into creating a
 * duplicate root. Also opens on demand via the 'axoview-open-migrate' event
 * (avatar menu, session section header, banner).
 */
export function MigrateSessionDialog() {
  const { t } = useTranslation('app');
  const { storageManager, serverStorageAvailable, googleDriveConfigured } = useAppStorage();
  const {
    refreshFileTree,
    setFileExplorerOpen,
    currentDiagram,
    openDiagramById,
    notifyDiagramDeletedFromTree,
    saveAllDirty,
    flushDiagramIfDirty,
    isReadonlyUrl
  } = useDiagramLifecycle();
  const authStatus = useAuthStore((s) => s.status);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MigrateItem[]>([]);
  const [moving, setMoving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rootReady, setRootReady] = useState(false);

  const prevStatusRef = useRef<AuthStatus>(authStatus);
  const offeredThisGrantRef = useRef(false);
  const pendingOfferRef = useRef(false);

  const drive = storageManager?.getProvider('google-drive') as
    | GoogleDriveProvider
    | undefined;
  const local = storageManager?.getProvider('local') ?? null;

  const checkRootReady = useCallback(() => {
    setRootReady(!!drive?.getCachedRootId());
  }, [drive]);

  /**
   * A4/FEX-15 — `null` means FAILED, `[]` means genuinely nothing to move.
   *
   * This used to swallow every failure into `[]`, which the callers cannot tell
   * apart from an empty session. So a single transient listing hiccup at the
   * moment of the grant made the auto-offer return silently having already
   * spent BOTH one-shot refs — and the offer never came back for the rest of
   * the session, however long it stayed signed in. The diagrams it exists to
   * rescue stayed session-only until the tab closed and they were gone.
   */
  const enumerateSession = useCallback(async (): Promise<DiagramMeta[] | null> => {
    if (!local) return [];
    try {
      // Flush in-memory edits first so counts and moved content are current.
      await saveAllDirty();
      const list = await local.listDiagrams();
      return list.filter((d) => !d.deletedAt);
    } catch {
      return null;
    }
  }, [local, saveAllDirty]);

  const openWithItems = useCallback(
    (metas: DiagramMeta[]) => {
      setItems(metas.map((meta) => ({ meta, checked: true })));
      setProgress(null);
      setMoving(false);
      setOpen(true);
    },
    []
  );

  // Auto-offer after a fresh grant, once the root is configured.
  const tryAutoOffer = useCallback(async () => {
    if (!pendingOfferRef.current) return;
    if (!drive?.getCachedRootId()) return; // wait for the setup gate
    // A4/FEX-15 — the one-per-grant offer is consumed only once the enumeration
    // has actually SUCCEEDED. Clearing `pendingOfferRef` before the await (as
    // this did) also protects against a re-entrant second offer, so both refs
    // are re-armed on failure instead: the `axoview-drive-root-ready` listener
    // can then try again when storage recovers.
    pendingOfferRef.current = false;
    const metas = await enumerateSession();
    if (metas === null) {
      pendingOfferRef.current = true;
      offeredThisGrantRef.current = false;
      return;
    }
    if (metas.length === 0) return;
    openWithItems(metas);
  }, [drive, enumerateSession, openWithItems]);
  const tryAutoOfferRef = useRef(tryAutoOffer);
  useEffect(() => {
    tryAutoOfferRef.current = tryAutoOffer;
  }, [tryAutoOffer]);

  // Root readiness: poll the cached id on mount/auth changes and listen for
  // the DriveSetupGate's explicit ready signal.
  useEffect(() => {
    checkRootReady();
    const onReady = () => {
      setRootReady(true);
      void tryAutoOfferRef.current();
    };
    window.addEventListener('axoview-drive-root-ready', onReady);
    return () => window.removeEventListener('axoview-drive-root-ready', onReady);
  }, [checkRootReady]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = authStatus;
    if (authStatus === 'UNAUTHENTICATED' || authStatus === 'SESSION_EXPIRED') {
      offeredThisGrantRef.current = false;
      pendingOfferRef.current = false;
      return;
    }
    if (authStatus !== 'AUTHENTICATED') return;
    // Fresh grant only — REFRESHING → AUTHENTICATED is the hourly silent renew.
    const freshGrant =
      prev === 'AUTHENTICATING' || prev === 'RECONNECTING' || prev === 'UNAUTHENTICATED';
    if (!freshGrant || offeredThisGrantRef.current) return;
    if (serverStorageAvailable || !googleDriveConfigured || isReadonlyUrl) return;
    offeredThisGrantRef.current = true;
    pendingOfferRef.current = true;
    checkRootReady();
    void tryAutoOffer();
  }, [authStatus, serverStorageAvailable, googleDriveConfigured, isReadonlyUrl, checkRootReady, tryAutoOffer]);

  // On-demand open (avatar menu, session section header, banner).
  useEffect(() => {
    const onOpenRequest = () => {
      void (async () => {
        checkRootReady();
        const metas = await enumerateSession();
        if (metas === null) {
          notificationStore.push({
            severity: 'error',
            message: t(
              'migrate.listFailed',
              'Could not read session diagrams — try again'
            )
          });
          return;
        }
        if (metas.length === 0) {
          notificationStore.push({
            severity: 'info',
            message: t('migrate.nothingToMove', 'No session diagrams to move')
          });
          return;
        }
        openWithItems(metas);
      })();
    };
    window.addEventListener('axoview-open-migrate', onOpenRequest);
    return () => window.removeEventListener('axoview-open-migrate', onOpenRequest);
  }, [checkRootReady, enumerateSession, openWithItems, t]);

  const checkedCount = items.filter((i) => i.checked).length;

  const handleClose = useCallback(() => {
    if (moving) return; // mid-move: no silent dismissal
    setOpen(false);
  }, [moving]);

  const toggleItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.meta.id === id ? { ...i, checked: !i.checked } : i))
    );
  }, []);

  const handleMove = useCallback(async () => {
    if (!drive || !local || checkedCount === 0 || moving) return;
    const selected = items.filter((i) => i.checked).map((i) => i.meta);
    setMoving(true);
    setProgress({ done: 0, total: selected.length });
    try {
      const folders = await local.listFolders();
      const results = await moveDiagramsToDrive({
        source: local,
        drive,
        // A4/FEX-13 — the bulk path has the same window as the single move, and
        // a wider one: every item after the first waits for the ones before it.
        flushSource: flushDiagramIfDirty,
        diagrams: selected,
        sourceFolders: folders,
        onProgress: (done, total) => setProgress({ done, total })
      });
      const moved = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      // A2/STOR-09: copied to Drive and verified, but the session copy could
      // not be removed — the diagram is now in BOTH places. Not a failure (the
      // Drive copy is real and open-able), but the user has to know, or they
      // will "move" it again and mint a second copy.
      const duplicated = results.filter((r) => r.ok && r.sourceRemained);

      // The open diagram moved: cancel its session autosave/scratch and
      // reopen it from its new Drive home.
      const openMoved = moved.find((r) => r.id === currentDiagram?.id);
      if (openMoved) {
        notifyDiagramDeletedFromTree(openMoved.id);
        await openDiagramById(openMoved.driveId!, openMoved.driveName ?? openMoved.name, 'google-drive');
      }

      if (failed.length === 0 && duplicated.length > 0) {
        notificationStore.push({
          severity: 'warning',
          persistent: true,
          message: t('migrate.duplicatedToast', {
            defaultValue:
              'Moved {{n}} to Google Drive, but {{dup}} could not be removed from this session — they now exist in both places: {{names}}',
            n: moved.length,
            dup: duplicated.length,
            names: duplicated.map((r) => r.name).join(', ')
          })
        });
      } else if (failed.length === 0) {
        notificationStore.push({
          severity: 'success',
          // Interpolates {{n}}, not {{count}} — `count` would trigger
          // i18next plural-suffix resolution across 13 locales.
          message: t('migrate.successToast', {
            defaultValue: 'Moved {{n}} to Google Drive',
            n: moved.length
          })
        });
      } else {
        // §6.3 — failures surface with names; failed items stayed in session.
        notificationStore.push({
          severity: 'warning',
          persistent: true,
          message: t('migrate.partialToast', {
            defaultValue:
              '{{moved}} moved, {{failed}} failed — the failed diagrams stayed in this session',
            moved: moved.length,
            failed: failed.length
          })
        });
      }
      // §6.1 — show what landed.
      setFileExplorerOpen(true);
      refreshFileTree();
      setOpen(false);
    } finally {
      setMoving(false);
      setProgress(null);
    }
  }, [drive, local, items, checkedCount, moving, currentDiagram, notifyDiagramDeletedFromTree, openDiagramById, setFileExplorerOpen, refreshFileTree, t]);

  if (!googleDriveConfigured) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      onKeyDown={(e) => {
        // §3.2 — Enter confirms (Escape is MUI-native), but only from a
        // non-interactive target: a focused control ("Not now", the close
        // button, an item row) keeps its own Enter activation — otherwise
        // Enter on "Not now" would trigger the bulk move it declines.
        if (e.key !== 'Enter' || moving || checkedCount === 0 || !rootReady) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea, [role="button"], [role="checkbox"]')) return;
        e.preventDefault();
        void handleMove();
      }}
      slotProps={{
        paper: {
          'data-axoview-id': 'migrate-session-dialog',
          sx: { boxShadow: '0px 10px 20px -2px rgba(0,0,0,0.25)', borderRadius: 2 }
        } as never
      }}
    >
      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        <Typography variant="h6" component="span" fontWeight={600}>
          {t('migrate.title', 'Move session diagrams to Google Drive?')}
        </Typography>
        <IconButton
          size="small"
          onClick={handleClose}
          disabled={moving}
          sx={{ position: 'absolute', top: 12, right: 12, color: 'text.secondary' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {t(
            'migrate.body',
            'These diagrams live only in this browser tab and are lost when it closes:'
          )}
        </Typography>
        <List dense disablePadding sx={{ my: 1, maxHeight: 240, overflowY: 'auto', overflowX: 'hidden' }}>
          {items.map((item) => (
            <ListItem key={item.meta.id} disablePadding>
              <ListItemButton
                dense
                onClick={() => toggleItem(item.meta.id)}
                disabled={moving}
                sx={{ py: 0, borderRadius: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Checkbox
                    edge="start"
                    size="small"
                    checked={item.checked}
                    tabIndex={-1}
                    disableRipple
                  />
                </ListItemIcon>
                <DiagramIcon sx={{ fontSize: 15, mr: 0.75, color: 'text.secondary' }} />
                <ListItemText
                  primary={item.meta.name}
                  slotProps={{ primary: { variant: 'body2', noWrap: true } }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Typography variant="caption" color="text.secondary">
          {rootReady
            ? t('migrate.destinationNote', 'They will move into your Drive folder, keeping their folders.')
            : t('migrate.waitingForSetup', 'Finishing Google Drive setup…')}
        </Typography>
        {moving && progress && (
          <Box sx={{ mt: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={(progress.done / Math.max(1, progress.total)) * 100}
            />
            <Typography variant="caption" color="text.secondary">
              {t('migrate.moving', {
                defaultValue: 'Moving {{done}} of {{total}}…',
                done: progress.done,
                total: progress.total
              })}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
        <Button
          variant="text"
          onClick={handleClose}
          disabled={moving}
          data-axoview-id="migrate-session-not-now"
        >
          {t('migrate.notNow', 'Not now')}
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleMove()}
          disabled={moving || checkedCount === 0 || !rootReady}
          data-axoview-id="migrate-session-move"
        >
          {t('migrate.moveN', {
            defaultValue: 'Move {{n}} to Drive',
            n: checkedCount
          })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
