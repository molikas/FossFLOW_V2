import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
  createTheme
} from '@mui/material';
import {
  CloseOutlined as CloseIcon,
  DeleteOutlineOutlined as RemoveIcon,
  LinkOutlined as LinkIcon,
  LockOutlined as LockIcon,
  PublicOutlined as PublicIcon
} from '@mui/icons-material';
import {
  DrivePermission,
  DriveShareError,
  ShareRole,
  drivePreviewUrl,
  listPermissions,
  setAnyoneWithLink,
  addPersonPermission,
  removePermission
} from '../services/drive/driveSharing';
import { useNotificationStore } from '../stores/notificationStore';
import {
  getRecentShareEmails,
  addRecentShareEmail
} from '../services/drive/recentShareEmails';

// Drive policy rejections carry their cause ONLY in `reason` — Google's message
// is an empty user message (see toError in driveSharing.ts), which as raw text
// tells the user nothing. Map the causes a user can act on to copy that says
// what happened AND what still works. Owner repro 2026-07-28: a corporate
// Workspace account toggling "Anyone with the link" got a bare
// `Bad Request. User message: ""`.
const shareErrorCopy = (
  err: unknown,
  t: (key: string, fallback: string) => string
): string => {
  if (err instanceof DriveShareError && err.reason === 'publishOutNotPermitted') {
    return t(
      'share.drive.manage.publishOutNotPermitted',
      'Your organization’s Google Workspace policy doesn’t allow “Anyone with the link” sharing. You can still share with specific people below.'
    );
  }
  return err instanceof Error && err.message
    ? err.message
    : t('share.drive.manage.actionError', 'That change could not be saved.');
};

// The app renders on MUI's DEFAULT theme (16px body, 20px h6, UPPERCASE overline),
// which makes this dialog feel oversized next to the lib's compact Export dialog.
// Opt into a compact scale for the dialog only — typography + input/menu font
// sizes. These are MERGED onto the outer theme (see the ThemeProvider below via
// `createTheme(outer, …)`), so the app palette is preserved even once a custom
// app-root theme lands. Matches the Export dialog's feel.
const compactShareOverrides = {
  typography: {
    h6: { fontSize: '1.1rem', fontWeight: 600 },
    body1: { fontSize: '0.875rem' },
    body2: { fontSize: '0.875rem' },
    caption: { fontSize: '0.75rem' }
  },
  components: {
    MuiInputBase: { styleOverrides: { root: { fontSize: '0.875rem' } } },
    MuiMenuItem: { styleOverrides: { root: { fontSize: '0.875rem' } } }
  }
};

// ADR 0042 §1 (rev. 2026-07-14) — custom in-app "Manage access" over the Drive
// REST v3 permissions API (replaces the deprecated ShareClient widget). Grants
// apply immediately (Google-style), each with its own inline error; the whole
// list re-reads after every mutation so the UI never drifts from Drive's truth.
//
// 2026-07-14 UX pass (external review): information hierarchy now mirrors the
// Drive share mental model — Add people (primary action) → People with access
// (owner "you" row + grantees, with avatars) → General access (the link fallback,
// with a lock/globe state icon). The raw preview-URL field became a Copy-link
// action + success toast (ux-principles §6.3.1: a toast is right for "this
// happened"). Email pills / multi-queue add were deliberately NOT adopted — our
// permissions API grants one person at a time and single-add-immediately is
// simpler and truthful.

interface Props {
  open: boolean;
  fileId: string;
  diagramName?: string;
  onClose: () => void;
  /** Fired after any successful mutation so the caller can refresh its summary. */
  onAccessChanged?: () => void;
}

const roleLabelKey = (role: DrivePermission['role']): string => {
  switch (role) {
    case 'owner':
      return 'share.drive.manage.roleOwner';
    case 'writer':
    case 'fileOrganizer':
    case 'organizer':
      return 'share.drive.manage.roleEditor';
    default:
      return 'share.drive.manage.roleViewer';
  }
};

// Deterministic avatar background from a seed string. Under `drive.file` we have
// no profile pictures, so a stable coloured initial makes the list scannable as a
// collaborative space rather than a raw data readout (ux-principles §3).
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360} 52% 42%)`;
}

function personInitial(p: DrivePermission): string {
  return (p.displayName || p.emailAddress || '?').trim().charAt(0).toUpperCase() || '?';
}

/** One avatar row in "People with access". `right` carries the role label and,
 *  for removable grantees, the remove control. */
function PersonRow({ p, right }: { p: DrivePermission; right: ReactNode }) {
  const seed = p.emailAddress || p.displayName || p.id;
  const primary = p.displayName || p.emailAddress || p.id;
  const secondary = p.displayName && p.emailAddress ? p.emailAddress : undefined;
  return (
    <ListItem disableGutters secondaryAction={right}>
      <ListItemAvatar sx={{ minWidth: 44 }}>
        <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: avatarColor(seed) }}>
          {personInitial(p)}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={primary}
        secondary={secondary}
        primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
        secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
      />
    </ListItem>
  );
}

export function DriveShareManageDialog({
  open,
  fileId,
  diagramName,
  onClose,
  onAccessChanged
}: Props) {
  const { t } = useTranslation('app');
  // t is only used for FALLBACK error copy inside the async callbacks. Reading
  // it through a ref keeps `refresh`/`runAction` stable across locale changes,
  // so the open-effect below re-runs on open/fileId only (never on a new `t`).
  const tRef = useRef(t);
  tRef.current = t;
  const notify = useNotificationStore((s) => s.push);
  const [permissions, setPermissions] = useState<DrivePermission[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<ShareRole>('reader');
  // Previously shared-with emails, for the Add-people autocomplete. Local history
  // only — NOT Google Contacts (that needs a new sensitive scope). See
  // recentShareEmails.ts.
  const [recentEmails, setRecentEmails] = useState<string[]>([]);

  // The viewer link to hand people — NOT the raw Drive file Google's notification
  // email points at. App-created files carry no resourceKey, so fileId suffices.
  const previewUrl = drivePreviewUrl(fileId);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setPermissions(await listPermissions(fileId));
    } catch (err) {
      setPermissions([]);
      setLoadError(
        err instanceof Error
          ? err.message
          : tRef.current('share.drive.manage.loadError', "Couldn't load who has access.")
      );
    }
  }, [fileId]);

  useEffect(() => {
    if (!open) return;
    setPermissions(null);
    setActionError(null);
    setAddEmail('');
    setAddRole('reader');
    setRecentEmails(getRecentShareEmails());
    void refresh();
  }, [open, refresh]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(previewUrl);
      // A copied link is only useful if the file is actually shared. If access is
      // still restricted (no "anyone with the link" grant and no people added),
      // warn rather than imply the link will work for anyone.
      const isPublic = permissions?.some((p) => p.type === 'anyone') ?? false;
      const hasPeople = permissions?.some(
        (p) => (p.type === 'user' || p.type === 'group') && p.role !== 'owner'
      );
      if (isPublic || hasPeople) {
        notify({
          severity: 'success',
          message: tRef.current(
            'share.drive.manage.copiedToast',
            'Preview link copied to clipboard'
          )
        });
      } else {
        notify({
          severity: 'warning',
          message: tRef.current(
            'share.drive.manage.copiedRestricted',
            'Link copied — but only people with access can open it. Set General access to "Anyone with the link" to let anyone view.'
          )
        });
      }
    } catch {
      // Clipboard unavailable (blocked / insecure context) — nothing was copied,
      // so we deliberately do not claim success.
    }
  };

  /**
   * Run a mutation, then re-read the ACL from Drive (never trust local state)
   * and notify the caller. A single busy flag serialises the dialog's writes.
   *
   * Returns whether the action SUCCEEDED. S3/DRV-08: it used to swallow the
   * failure into `actionError` and resolve either way, so `handleAdd`'s three
   * trailing statements ran unconditionally — a rejected address was cleared out
   * of the input (forcing a retype to fix a typo) and added to the autocomplete
   * history, where it would be suggested as if it had been granted access. The
   * success and failure end states were indistinguishable in the UI.
   *
   * DRV-05 (owner ruling 2026-07-30): the ACL is re-read in the `catch` too.
   * Cloud UIs re-read authoritative state after ANY mutation attempt, because a
   * failure does not mean nothing changed — `setAnyoneWithLink(false)` can
   * remove one permission and fail on the next, and the dialog must show what
   * is actually true rather than what it hoped for.
   */
  const runAction = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      setActionError(null);
      try {
        await action();
        await refresh();
        onAccessChanged?.();
        return true;
      } catch (err) {
        setActionError(shareErrorCopy(err, tRef.current));
        // Best-effort: a refresh that also fails must not mask the original
        // error, which is the one the user needs.
        try {
          await refresh();
          onAccessChanged?.();
        } catch {
          /* keep the action's error on screen */
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh, onAccessChanged]
  );

  const permsList = permissions ?? [];
  const anyoneOn = permsList.some((p) => p.type === 'anyone');
  // The owner is "you" — always present, never removable — shown as the first row
  // so the list reads as a populated collaborative space. Other named grantees
  // (the anyone-link entry is owned by the General-access control) list below it.
  const owner = permsList.find((p) => p.role === 'owner');
  const others = permsList.filter(
    (p) => (p.type === 'user' || p.type === 'group') && p.role !== 'owner'
  );
  // Add-people role + button stay hidden until there's an email to act on
  // (progressive disclosure — keeps the primary action uncluttered when idle).
  const showAddControls = addEmail.trim().length > 0;

  const handleAdd = async () => {
    const email = addEmail.trim();
    if (!email) return;
    // Point Google's notification email at OUR viewer, not the raw Drive JSON.
    const emailMessage = t('share.drive.manage.emailInvite', {
      url: previewUrl,
      defaultValue: `View this diagram in Axoview: ${previewUrl}`
    });
    const added = await runAction(() =>
      addPersonPermission(fileId, email, addRole, true, emailMessage)
    );
    // DRV-08: only on success. A rejected address keeps the field populated (so
    // a typo is one edit away, not a retype) and stays out of the history.
    if (!added) return;
    // Remember for next time's autocomplete (local history, no new Google scope).
    addRecentShareEmail(email);
    setRecentEmails(getRecentShareEmails());
    setAddEmail('');
  };

  return (
    <ThemeProvider theme={(outer) => createTheme(outer, compactShareOverrides)}>
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          'data-axoview-id': 'drive-share-manage-dialog'
        } as ComponentProps<'div'>
      }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {diagramName
          ? t('share.drive.manage.titleNamed', { name: diagramName, defaultValue: `Share "${diagramName}"` })
          : t('share.drive.manage.title', 'Manage access')}
        <IconButton
          onClick={onClose}
          disabled={busy}
          data-axoview-id="drive-share-manage-close"
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {permissions === null ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : loadError ? (
          <Alert severity="error" data-axoview-id="drive-share-manage-load-error">
            {loadError}
          </Alert>
        ) : (
          <Stack spacing={2.5}>
            {actionError && (
              <Alert
                severity="error"
                onClose={() => setActionError(null)}
                data-axoview-id="drive-share-manage-action-error"
              >
                {actionError}
              </Alert>
            )}

            {/* Add people — the primary action, at the top (Drive mental model). */}
            <Box>
              <Typography
                variant="caption"
                sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.75 }}
              >
                {t('share.drive.manage.addPeople', 'Add people')}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Autocomplete
                  freeSolo
                  fullWidth
                  size="small"
                  disabled={busy}
                  options={recentEmails}
                  inputValue={addEmail}
                  onInputChange={(_, val) => setAddEmail(val)}
                  forcePopupIcon={false}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      type="email"
                      placeholder={t('share.drive.manage.emailPlaceholder', 'name@example.com')}
                      inputProps={{
                        ...params.inputProps,
                        'data-axoview-id': 'drive-share-manage-add-email'
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleAdd();
                        }
                      }}
                    />
                  )}
                />
                {showAddControls && (
                  <>
                    <Select
                      size="small"
                      value={addRole}
                      disabled={busy}
                      data-axoview-id="drive-share-manage-add-role"
                      onChange={(e) => setAddRole(e.target.value as ShareRole)}
                      sx={{ minWidth: 104 }}
                    >
                      <MenuItem value="reader">
                        {t('share.drive.manage.roleViewer', 'Viewer')}
                      </MenuItem>
                      <MenuItem value="writer">
                        {t('share.drive.manage.roleEditor', 'Editor')}
                      </MenuItem>
                    </Select>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={busy || !addEmail.trim()}
                      onClick={() => void handleAdd()}
                      data-axoview-id="drive-share-manage-add-button"
                      sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                    >
                      {t('share.drive.manage.add', 'Add')}
                    </Button>
                  </>
                )}
              </Stack>
            </Box>

            {/* People with access — owner "you" row first, then grantees. */}
            <Box>
              <Typography
                variant="caption"
                sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.75 }}
              >
                {t('share.drive.manage.peopleWithAccess', 'People with access')}
              </Typography>
              {!owner && others.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('share.drive.manage.onlyYou', 'Only you have access so far.')}
                </Typography>
              ) : (
                <List dense disablePadding data-axoview-id="drive-share-manage-people">
                  {owner && (
                    <PersonRow
                      p={owner}
                      right={
                        <Typography variant="caption" color="text.secondary">
                          {t('share.drive.manage.roleOwner', 'Owner')}
                        </Typography>
                      }
                    />
                  )}
                  {others.map((p) => (
                    <PersonRow
                      key={p.id}
                      p={p}
                      right={
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">
                            {t(roleLabelKey(p.role), p.role)}
                          </Typography>
                          <IconButton
                            edge="end"
                            size="small"
                            disabled={busy}
                            aria-label={t('share.drive.manage.remove', 'Remove access')}
                            data-axoview-id="drive-share-manage-remove"
                            onClick={() => void runAction(() => removePermission(fileId, p.id))}
                          >
                            <RemoveIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      }
                    />
                  ))}
                </List>
              )}
            </Box>

            {/* General access — the link fallback, with a lock/globe state icon. */}
            <Box>
              <Typography
                variant="caption"
                sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.75 }}
              >
                {t('share.drive.manage.generalAccess', 'General access')}
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: 'action.hover',
                    color: 'text.secondary'
                  }}
                >
                  {anyoneOn ? <PublicIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                </Avatar>
                <Select
                  size="small"
                  fullWidth
                  value={anyoneOn ? 'anyone' : 'restricted'}
                  disabled={busy}
                  data-axoview-id="drive-share-manage-general-select"
                  onChange={(e) =>
                    void runAction(() => setAnyoneWithLink(fileId, e.target.value === 'anyone'))
                  }
                >
                  <MenuItem value="restricted">
                    {t('share.drive.manage.restricted', 'Restricted — only people with access')}
                  </MenuItem>
                  <MenuItem value="anyone">
                    {t('share.drive.manage.anyone', 'Anyone with the link can view')}
                  </MenuItem>
                </Select>
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>

      {/* Copy link (left) + Done (right) — mirrors the Drive share action bar. */}
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 1.5 }}>
        <Button
          startIcon={<LinkIcon />}
          onClick={() => void handleCopy()}
          data-axoview-id="drive-share-manage-copy-link"
          sx={{ textTransform: 'none' }}
        >
          {t('share.drive.manage.copyLink', 'Copy link')}
        </Button>
        <Button
          variant="contained"
          onClick={onClose}
          disabled={busy}
          data-axoview-id="drive-share-manage-done"
          sx={{ textTransform: 'none' }}
        >
          {t('share.drive.manage.done', 'Done')}
        </Button>
      </DialogActions>
    </Dialog>
    </ThemeProvider>
  );
}
