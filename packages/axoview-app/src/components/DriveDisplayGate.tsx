import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Paper, Typography } from '@mui/material';
import { useAppStorage } from '../providers/AppStorageContext';
import { useDiagramLifecycle } from '../providers/DiagramLifecycleProvider';
import { useAuthStore } from '../stores/authStore';
import { launchDrivePicker } from '../services/drive/drivePicker';
import { ReadonlyLoadErrorDialog } from './ReadonlyLoadErrorDialog';
import { GoogleGIcon } from './GoogleGIcon';
import { isoGridBackground } from '../utils/isoGridBackground';

/**
 * Gate screen for `/display/drive/:driveFileId` (ADR 0042 §2 rungs 3–4).
 * Renders nothing off that route or while the ladder is loading/loaded:
 * - needs-signin → explanation + Google sign-in (retries automatically ONCE
 *   the session lands — a one-shot guard, so a token the server later rejects
 *   can't spin the read);
 * - needs-grant → "Open with Google Drive access" launching the Picker, or a
 *   sign-in-only explanation when the Picker is unconfigured (ADR 0042 §5);
 * - transient → an inline Retry (network / rate-limit / 5xx are recoverable);
 * - failed → the existing readonly-load-failed dialog treatment.
 */
export function DriveDisplayGate() {
  const { t } = useTranslation('app');
  const navigate = useNavigate();
  const { driveDisplayFileId, driveDisplayState, retryDriveDisplayRead } =
    useDiagramLifecycle();
  const { runtimeConfig } = useAppStorage();
  const authStatus = useAuthStore((s) => s.status);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const signedInEmail = useAuthStore((s) => s.user?.email || null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [switchBusy, setSwitchBusy] = useState(false);
  // ADR 0011 — a user-initiated Picker launch that fails surfaces inline in the
  // gate (an actionable, persistent message), not as a transient toast.
  const [pickerError, setPickerError] = useState<string | null>(null);

  // `driveDisplayFileId != null` IS "on the Drive display route" (the provider
  // keys it off the route param) — no separate boolean needed.
  const onDriveDisplayRoute = !!driveDisplayFileId;

  const googleApiKey = runtimeConfig?.googleApiKey ?? null;
  const googleProjectNumber = runtimeConfig?.googleProjectNumber ?? null;
  // ADR 0042 §5: either value null ⇒ the Picker rung is unavailable — hide
  // the button and explain sign-in-only access instead.
  const pickerAvailable = !!googleApiKey && !!googleProjectNumber;

  // One-shot: auto-retry the token read at most ONCE per fresh AUTHENTICATED
  // session. Re-armed whenever we leave AUTHENTICATED, so a genuine re-sign-in
  // gets exactly one more attempt (and a 401 that fires markExpired() flips the
  // status away from AUTHENTICATED, breaking any retry loop at the source).
  const autoRetriedRef = useRef(false);
  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED') autoRetriedRef.current = false;
  }, [authStatus]);
  useEffect(() => {
    if (
      onDriveDisplayRoute &&
      driveDisplayState === 'needs-signin' &&
      authStatus === 'AUTHENTICATED' &&
      !autoRetriedRef.current
    ) {
      autoRetriedRef.current = true;
      retryDriveDisplayRead(false);
    }
  }, [onDriveDisplayRoute, driveDisplayState, authStatus, retryDriveDisplayRead]);

  if (!onDriveDisplayRoute) return null;

  if (driveDisplayState === 'failed') {
    return (
      <ReadonlyLoadErrorDialog
        open
        onDismiss={() => navigate('/', { replace: true })}
      />
    );
  }

  if (
    driveDisplayState !== 'needs-signin' &&
    driveDisplayState !== 'needs-grant' &&
    driveDisplayState !== 'transient'
  ) {
    return null;
  }

  const handleGrant = async () => {
    if (!driveDisplayFileId) return;
    setPickerBusy(true);
    setPickerError(null);
    try {
      const outcome = await launchDrivePicker({
        fileId: driveDisplayFileId,
        googleApiKey,
        googleProjectNumber
      });
      // 'cancelled' keeps the gate up — the user can pick again.
      if (outcome === 'picked') retryDriveDisplayRead(true);
    } catch (err) {
      console.error('DriveDisplayGate: Picker launch failed', err);
      setPickerError(
        t(
          'driveDisplay.pickerError',
          'Could not open the Google Drive access dialog. This can happen when third-party cookies or pop-ups are blocked — allow them for this site, then try again.'
        )
      );
    } finally {
      setPickerBusy(false);
    }
  };

  // Wrong-account recovery (owner report 2026-07-28: "they still couldn't open
  // it"). In `needs-grant` the viewer IS signed in — the account just can't see
  // the file, typically a personal address when the link was shared to a work
  // one. `signOut()` clears the profile hint, so the next `signIn()` shows
  // Google's account chooser instead of silently re-picking the same account
  // (`attemptSilentReconnect` passes the persisted email as `login_hint`).
  //
  // The one-shot auto-retry above fires only on `needs-signin`, so it does NOT
  // cover this state — re-read explicitly once the new session lands, or the
  // gate would keep showing the same wall to an account that now has access.
  const handleSwitchAccount = async () => {
    setSwitchBusy(true);
    try {
      signOut();
      await signIn();
      if (useAuthStore.getState().status === 'AUTHENTICATED') {
        retryDriveDisplayRead(false);
      }
    } finally {
      setSwitchBusy(false);
    }
  };

  return (
    <Box
      data-axoview-id="drive-display-gate"
      sx={{
        position: 'fixed',
        inset: 0,
        // Below MUI dialogs (1300) so DriveAccessRequiredDialog and friends
        // stack above the gate; above the canvas overlays (z ≤ 20).
        zIndex: 1250,
        bgcolor: 'background.default',
        backgroundImage: isoGridBackground.backgroundImage,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2
      }}
    >
      <Paper
        elevation={3}
        sx={{
          maxWidth: 440,
          p: 4,
          borderRadius: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 2
        }}
      >
        <Typography variant="h6" component="h1">
          {t(
            'driveDisplay.headline',
            "This diagram lives in its owner's Google Drive"
          )}
        </Typography>

        {driveDisplayState === 'transient' ? (
          <>
            <Typography variant="body2" color="text.secondary">
              {t(
                'driveDisplay.transientBody',
                "We couldn't reach Google Drive to load this diagram. Check your connection and try again."
              )}
            </Typography>
            <Button
              variant="contained"
              onClick={() => retryDriveDisplayRead(false)}
              data-axoview-id="drive-display-gate-retry"
              sx={{ textTransform: 'none' }}
            >
              {t('driveDisplay.retryButton', 'Try again')}
            </Button>
          </>
        ) : driveDisplayState === 'needs-signin' ? (
          <>
            <Typography variant="body2" color="text.secondary">
              {t(
                'driveDisplay.signInBody',
                'Sign in with Google so Axoview can check whether this diagram has been shared with you.'
              )}
            </Typography>
            <Button
              variant="outlined"
              onClick={() => void signIn()}
              disabled={authStatus === 'AUTHENTICATING'}
              startIcon={<GoogleGIcon size={16} />}
              data-axoview-id="drive-display-gate-signin"
              sx={{ textTransform: 'none', bgcolor: 'background.paper' }}
            >
              {t('auth.signIn', 'Sign in with Google')}
            </Button>
          </>
        ) : pickerAvailable ? (
          <>
            <Typography variant="body2" color="text.secondary">
              {t(
                'driveDisplay.grantBody',
                'You are signed in, but Axoview needs your permission to open this specific file from Google Drive.'
              )}
            </Typography>
            <Button
              variant="contained"
              onClick={() => void handleGrant()}
              disabled={pickerBusy}
              data-axoview-id="drive-display-gate-grant"
              sx={{ textTransform: 'none' }}
            >
              {t('driveDisplay.grantButton', 'Open with Google Drive access')}
            </Button>
            {pickerError && (
              <Typography
                variant="body2"
                color="error"
                data-axoview-id="drive-display-gate-picker-error"
              >
                {pickerError}
              </Typography>
            )}
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">
              {signedInEmail
                ? t('driveDisplay.grantUnavailableAs', {
                    defaultValue:
                      "You're signed in as {{email}}, which can't open this diagram. If it was shared with a different account, switch to it below. Otherwise ask the owner to share the file with you in Google Drive, then reload this page.",
                    email: signedInEmail
                  })
                : t(
                    'driveDisplay.grantUnavailable',
                    'Your Google account does not have access to this diagram through Axoview. If the diagram was shared with a different account, switch to it below. Otherwise ask the owner to share the file with you in Google Drive, then reload this page.'
                  )}
            </Typography>
            <Button
              variant="outlined"
              onClick={() => void handleSwitchAccount()}
              disabled={switchBusy || authStatus === 'AUTHENTICATING'}
              startIcon={<GoogleGIcon size={16} />}
              data-axoview-id="drive-display-gate-switch-account"
              sx={{ textTransform: 'none', bgcolor: 'background.paper' }}
            >
              {t('driveDisplay.switchAccountButton', 'Use a different Google account')}
            </Button>
          </>
        )}
      </Paper>
    </Box>
  );
}
