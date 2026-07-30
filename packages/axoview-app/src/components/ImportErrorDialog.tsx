import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';

// ADR 0011 — Error UX Contract. Failure-of-intent surface for a user-initiated
// direct file import (the empty-tree file chooser) that could not be parsed.
// Dumb presenter; `onDismiss` closes the dialog and leaves the tree intact —
// no navigation, no retry (re-picking a file is the recovery affordance).
interface ImportErrorDialogProps {
  open: boolean;
  onDismiss: () => void;
  /**
   * The failure that got us here. A3/ZIP-08: nine distinct `ProjectZipError`
   * codes all reached the user as "This file isn't a valid Axoview diagram",
   * which is actively wrong for four of them — a 200 MB archive, an archive
   * missing a diagram file, and one from a newer Axoview are all valid Axoview
   * files. Omitted → the generic copy, which is right for a plain parse
   * failure.
   */
  error?: unknown;
}

/**
 * Distinct copy per failure class, keyed on `ProjectZipError.code`. Anything
 * not listed falls through to the generic body (A3/ZIP-08).
 */
const BODY_BY_CODE: Record<string, { key: string; fallback: string }> = {
  TOO_LARGE: {
    key: 'dialog.importError.bodyTooLarge',
    fallback:
      'This archive is too large to import. Try exporting a single folder instead of the whole project.'
  },
  UNSUPPORTED_VERSION: {
    key: 'dialog.importError.bodyNewerVersion',
    fallback:
      'This project was exported by a newer version of Axoview. Update Axoview and try again.'
  },
  MISSING_DIAGRAM: {
    key: 'dialog.importError.bodyIncomplete',
    fallback:
      'This archive is incomplete — it lists diagrams whose files are missing. Try exporting it again.'
  },
  BAD_DIAGRAM: {
    key: 'dialog.importError.bodyIncomplete',
    fallback:
      'This archive is incomplete — it lists diagrams whose files are missing. Try exporting it again.'
  },
  BAD_MANIFEST: {
    key: 'dialog.importError.bodyCorrupt',
    fallback:
      "This archive is damaged — its manifest could not be read. Try exporting it again."
  },
  BAD_FOLDER_GRAPH: {
    key: 'dialog.importError.bodyCorrupt',
    fallback:
      "This archive is damaged — its manifest could not be read. Try exporting it again."
  }
};

export function ImportErrorDialog({
  open,
  onDismiss,
  error
}: ImportErrorDialogProps) {
  const { t } = useTranslation('app');
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;
  const body = code ? BODY_BY_CODE[code] : undefined;

  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: { boxShadow: '0px 10px 20px -2px rgba(0,0,0,0.25)', borderRadius: 2 },
          'data-axoview-id': 'dialog-import-error'
        } as React.ComponentProps<'div'>
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" component="span">
          {t('dialog.importError.headline', "Couldn't import.")}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {body
            ? t(body.key, body.fallback)
            : t(
                'dialog.importError.body',
                "This file isn't a valid Axoview diagram. Make sure it's a .json or .zip exported from Axoview."
              )}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
        <Button
          variant="contained"
          onClick={onDismiss}
          autoFocus
          data-axoview-id="dialog-import-error-dismiss"
        >
          {t('dialog.importError.btnDismiss', 'OK')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
