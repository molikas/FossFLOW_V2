import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import {
  parseProject,
  importProject,
  ParsedProject,
  ImportDestination
} from '../../services/project/projectZip';
import {
  StorageProvider,
  isPersistedDiagramBlob
} from '../../services/storage';
import { ImportErrorDialog } from '../ImportErrorDialog';

export interface ImportOutcome {
  diagramCount: number;
  folderCount: number;
  /** What the archive CLAIMED, so the caller can name the gap. */
  claimedDiagramCount: number;
  droppedLinks: number;
}

type Step = 'pickFile' | 'configureZip' | 'configureJson';
type DestinationKind = ImportDestination['kind'];

interface Props {
  open: boolean;
  onClose: () => void;
  storage: StorageProvider;
  /**
   * Notify parent so it can refresh tree / open the imported diagram. For a
   * project ZIP it receives what `importProject` actually created, so the
   * summary reports the truth rather than what the manifest claimed
   * (A3/ZIP-05, A3/ZIP-02).
   */
  onImported: (result?: ImportOutcome) => Promise<void> | void;
  /** Imports a single .json diagram (preserves the existing single-diagram path). */
  onImportSingleJson: (data: unknown, suggestedName: string) => Promise<void> | void;
}

export function ImportDialog({
  open,
  onClose,
  storage,
  onImported,
  onImportSingleJson
}: Props) {
  const [step, setStep] = useState<Step>('pickFile');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parsed, setParsed] = useState<ParsedProject | null>(null);
  const [destination, setDestination] = useState<DestinationKind>('root');
  const [newFolderName, setNewFolderName] = useState('Imported');
  const [replaceConfirm, setReplaceConfirm] = useState('');

  // A3/ZIP-08 + ADR 0011: a file that cannot be READ is a failure of intent —
  // it gets the explicit dialog, whose copy is specific to the failure. Errors
  // raised while CONFIGURING an import (a bad folder name, an unconfirmed
  // replace) stay inline, where the control that caused them is.
  const [fileError, setFileError] = useState<unknown>(null);
  const [singleJsonData, setSingleJsonData] = useState<unknown>(null);
  const [singleJsonName, setSingleJsonName] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setStep('pickFile');
    setError(null);
    setParsed(null);
    setDestination('root');
    setNewFolderName('Imported');
    setReplaceConfirm('');
    setSingleJsonData(null);
    setSingleJsonName('');
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, reset, onClose]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const isZip = /\.zip$/i.test(file.name);
        if (isZip) {
          const p = await parseProject(file);
          setParsed(p);
          setNewFolderName(file.name.replace(/\.zip$/i, '') || 'Imported');
          setStep('configureZip');
        } else {
          const text = await file.text();
          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch {
            throw new Error('That file is not valid JSON.');
          }
          setSingleJsonData(data);
          // Prefer the diagram's embedded title so a JSON round-trip preserves
          // the name; fall back to the filename when the JSON has no title.
          // `t` is the compact-format field name.
          const blob = isPersistedDiagramBlob(data) ? data : {};
          const embeddedTitle = blob.title || blob.name || blob.t || '';
          const fileBaseName = file.name.replace(/\.(?:compact\.)?json$/i, '');
          const suggested =
            typeof embeddedTitle === 'string' && embeddedTitle.trim()
              ? embeddedTitle.trim()
              : fileBaseName;
          setSingleJsonName(suggested);
          setStep('configureJson');
        }
      } catch (err) {
        setFileError(err ?? new Error('Could not read file'));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const handleConfirmZip = async () => {
    if (!parsed) return;
    if (destination === 'replaceAll' && replaceConfirm.trim() !== 'replace') {
      setError('Type "replace" to confirm replacing the entire workspace.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dest: ImportDestination =
        destination === 'newFolder'
          ? { kind: 'newFolder', name: newFolderName.trim() || 'Imported' }
          : destination === 'replaceAll'
            ? { kind: 'replaceAll' }
            : { kind: 'root' };
      const outcome = await importProject({ storage }, parsed, { destination: dest });
      await onImported({
        diagramCount: outcome.diagramCount,
        folderCount: outcome.folderCount,
        claimedDiagramCount: parsed.manifest.diagrams.length,
        droppedLinks: outcome.droppedLinks
      });
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmJson = async () => {
    if (singleJsonData == null) return;
    setBusy(true);
    setError(null);
    try {
      await onImportSingleJson(singleJsonData, singleJsonName);
      await onImported();
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const renderPickFile = () => (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Choose a project zip (<code>.zip</code>) or a single diagram (<code>.json</code>).
      </Typography>
      <Box>
        <Button variant="outlined" onClick={() => fileInputRef.current?.click()}>
          Choose file…
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          accept=".zip,.json,application/zip,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            // Reset so picking the same file again still triggers onChange.
            e.target.value = '';
          }}
        />
      </Box>
    </Stack>
  );

  const renderConfigureZip = () => {
    if (!parsed) return null;
    const folderCount = parsed.manifest.folders?.length ?? 0;
    const diagramCount = parsed.manifest.diagrams?.length ?? 0;
    const replaceTrim = replaceConfirm.trim();
    const replaceOK = destination !== 'replaceAll' || replaceTrim === 'replace';
    return (
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2">
            {folderCount} folder{folderCount === 1 ? '' : 's'}, {diagramCount} diagram
            {diagramCount === 1 ? '' : 's'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            From {parsed.manifest.exportedBy ?? 'unknown'}
          </Typography>
        </Box>
        <FormControl>
          <RadioGroup
            value={destination}
            onChange={(_, v) => setDestination(v as DestinationKind)}
          >
            <FormControlLabel
              value="root"
              control={<Radio size="small" />}
              label="At the top — keep the original folder layout"
            />
            <FormControlLabel
              value="newFolder"
              control={<Radio size="small" />}
              label="Inside a new folder"
            />
            <FormControlLabel
              value="replaceAll"
              control={<Radio size="small" />}
              label={
                <Typography variant="body2" color="error.main">
                  Replace all existing folders and diagrams
                </Typography>
              }
            />
          </RadioGroup>
        </FormControl>
        {destination === 'newFolder' && (
          <TextField
            size="small"
            label="New folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
        )}
        {destination === 'replaceAll' && (
          <Box>
            <Alert severity="warning" sx={{ mb: 1 }}>
              This deletes every existing diagram and folder. Type{' '}
              <strong>replace</strong> to confirm.
            </Alert>
            <TextField
              size="small"
              fullWidth
              value={replaceConfirm}
              onChange={(e) => setReplaceConfirm(e.target.value)}
              placeholder='Type "replace"'
            />
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <DialogActions sx={{ px: 0 }}>
          <Button onClick={() => reset()} disabled={busy}>
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmZip}
            disabled={busy || !replaceOK}
          >
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </DialogActions>
      </Stack>
    );
  };

  const renderConfigureJson = () => (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Single diagram detected. It will be imported as a new diagram named{' '}
        <strong>{singleJsonName || 'diagram'}</strong>.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <DialogActions sx={{ px: 0 }}>
        <Button onClick={() => reset()} disabled={busy}>
          Back
        </Button>
        <Button variant="contained" onClick={handleConfirmJson} disabled={busy}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
      </DialogActions>
    </Stack>
  );

  return (
    <>
    <ImportErrorDialog
      open={fileError !== null}
      error={fileError}
      onDismiss={() => setFileError(null)}
    />
    <Dialog
      open={open && fileError === null}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 2 } } }}
    >
      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        Import
        <IconButton
          size="small"
          onClick={handleClose}
          disabled={busy}
          sx={{ position: 'absolute', top: 12, right: 12, color: 'text.secondary' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {step === 'pickFile' && renderPickFile()}
        {step === 'configureZip' && renderConfigureZip()}
        {step === 'configureJson' && renderConfigureJson()}
        {step === 'pickFile' && error && (
          <Box mt={2}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
