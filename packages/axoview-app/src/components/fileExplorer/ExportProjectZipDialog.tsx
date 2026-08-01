import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { StorageProvider } from '../../services/storage';
import {
  exportProject,
  ExportScope
} from '../../services/project/projectZip';
import { downloadBlob } from '../../utils/downloadBlob';

interface Props {
  open: boolean;
  onClose: () => void;
  scope: Exclude<ExportScope, 'diagram'>;
  folderId?: string;
  folderName?: string;
  storage: StorageProvider;
  exporterTag: string;
  /** Called after a successful project-zip export so the caller can clear sessionWorkUnexported. */
  onProjectZipExported?: () => void;
}

export function ExportProjectZipDialog({
  open,
  onClose,
  scope,
  folderId,
  folderName,
  storage,
  exporterTag,
  onProjectZipExported
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heading =
    scope === 'project'
      ? 'Export project'
      : `Export folder${folderName ? ` "${folderName}"` : ''}`;

  const description =
    scope === 'project'
      ? 'Bundles every diagram, folder, and tree state into a single .zip you can re-import later.'
      : 'Bundles this folder and everything inside into a .zip you can re-import later.';

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename, skipped } = await exportProject(
        { storage, exporterTag },
        { scope, folderId }
      );
      downloadBlob(blob, filename);
      // Only a PROJECT-scope zip covers all session work — a folder export
      // must not clear the caller's sessionWorkUnexported guard.
      if (scope === 'project') onProjectZipExported?.();
      if (skipped.length > 0) {
        // A3/ZIP-11: the archive is real and complete without them, so this is
        // a warning about what is NOT in the file the user just downloaded —
        // not a failure. Keeping the dialog open is what makes it readable.
        setError(
          `Exported, but ${skipped.length} diagram${skipped.length === 1 ? '' : 's'} could not be read and ${skipped.length === 1 ? 'is' : 'are'} missing from the archive: ${skipped
            .map((d) => d.name || d.id)
            .join(', ')}`
        );
        return;
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        {heading}
        <IconButton
          size="small"
          onClick={onClose}
          disabled={busy}
          sx={{ position: 'absolute', top: 12, right: 12, color: 'text.secondary' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={busy}
          data-axoview-id="dialog-export-project-zip-confirm"
        >
          {busy ? 'Exporting…' : 'Download .zip'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// F5/ICON-01/02 correction (2026-08-01). This file used to import and re-export
// `stripDefaultIcons` without ever applying it. The project-ZIP export archives
// the STORED blobs (`storage.loadDiagram`), which every provider already leans
// on write — so the ZIP path never needed a strip of its own, and the entry's
// claim that it "writes every icon the session has loaded" was inferred from
// the dead import rather than measured. The single-diagram "Export as JSON"
// path is the one that was genuinely fat, and it is fixed at its own call site.
