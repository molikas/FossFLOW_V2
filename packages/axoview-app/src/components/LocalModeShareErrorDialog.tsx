import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';

interface LocalModeShareErrorDialogProps {
  open: boolean;
  onDismiss: () => void;
}

// S2/SHARE-12: the copy here used to be written for an operator — "deploy via
// Docker or Cloudflare to view shared diagrams" — but the person who sees it is
// normally the RECIPIENT of someone else's link, who owns no deployment. The
// route shape alone (`isPublicShareUrl && !serverStorageAvailable`) cannot tell
// the two apart, so the copy has to work for the reader who actually arrives
// here. The advice was also wrong: the Cloudflare worker hardcodes
// `serverStorage: false` and has no `/api/public/diagrams` handler at all, so
// "deploy via Cloudflare" could never make the link work.
//
// The sibling dead-end gets this right — `DriveDisplayGate`'s unreachable-file
// branch tells its viewer to switch accounts or ask the owner, and never
// mentions deploying. (Longer term this is the ADR 0010 D6 public-namespace
// cutout showing through: a snapshot store on the worker would remove the
// class.)

export function LocalModeShareErrorDialog({
  open,
  onDismiss
}: LocalModeShareErrorDialogProps) {
  const { t } = useTranslation('app');

  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: { boxShadow: '0px 10px 20px -2px rgba(0,0,0,0.25)', borderRadius: 2 },
          'data-axoview-id': 'dialog-local-mode-share-error'
        } as React.ComponentProps<'div'>
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" component="span">
          {t(
            'dialog.localModeShareError.headline',
            "This link belongs to a different Axoview site."
          )}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {t(
            'dialog.localModeShareError.body',
            'Share links only open on the Axoview site that created them. Ask whoever sent it for a link from that site — or, if this site is yours, open it from the address your server runs on.'
          )}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
        <Button
          variant="contained"
          onClick={onDismiss}
          autoFocus
          data-axoview-id="dialog-local-mode-share-error-dismiss"
        >
          {t('dialog.localModeShareError.btnDismiss', 'OK')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
