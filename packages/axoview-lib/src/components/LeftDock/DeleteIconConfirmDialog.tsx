import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { Icon as IconI } from 'src/types';
import { IconUsageReport } from 'src/types/axoviewProps';

interface Props {
  open: boolean;
  icon: IconI | null;
  /** null while the scan is in flight; [] when scan resolved with no hits. */
  usage: IconUsageReport[] | null;
  scanning: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const totalRefs = (usage: IconUsageReport[]) =>
  usage.reduce((n, r) => n + r.count, 0);

export const DeleteIconConfirmDialog = ({
  open,
  icon,
  usage,
  scanning,
  onConfirm,
  onCancel
}: Props) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onConfirm();
    }
  };

  const hasUsage = !!usage && usage.length > 0;
  const refCount = usage ? totalRefs(usage) : 0;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      onKeyDown={handleKeyDown}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            boxShadow: '0px 10px 20px -2px rgba(0,0,0,0.25)',
            borderRadius: 2
          }
        }
      }}
    >
      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        <Typography variant="h6" component="span">
          Delete imported icon?
        </Typography>
        <IconButton
          size="small"
          onClick={onCancel}
          sx={{
            position: 'absolute',
            top: 12,
            right: 12,
            color: 'text.secondary'
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Stack spacing={1.5}>
          {icon && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                component="img"
                src={icon.url}
                alt={icon.name}
                sx={{
                  width: 40,
                  height: 40,
                  objectFit: 'contain',
                  flexShrink: 0,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 0.5
                }}
              />
              <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                {icon.name}
              </Typography>
            </Stack>
          )}

          {scanning && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={14} />
              <Typography variant="body2" color="text.secondary">
                Checking workspace for references…
              </Typography>
            </Stack>
          )}

          {!scanning && !hasUsage && (
            <Typography variant="body2" color="text.secondary">
              This icon isn&rsquo;t used by any diagram. Deleting it removes it
              from the Imported section.
            </Typography>
          )}

          {!scanning && hasUsage && (
            <>
              <Typography variant="body2" color="warning.main">
                In use by {refCount}{' '}
                {refCount === 1 ? 'item' : 'items'} across {usage!.length}{' '}
                {usage!.length === 1 ? 'diagram' : 'diagrams'}. Affected items
                will render a placeholder until the icon is re-imported.
              </Typography>
              <Box
                sx={{
                  maxHeight: 160,
                  overflowY: 'auto',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'background.default'
                }}
              >
                <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
                  {usage!.map((r) => (
                    <Stack
                      key={r.diagramId}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ px: 1.25, py: 0.5 }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          mr: 1
                        }}
                        title={r.diagramName}
                      >
                        {r.diagramName}
                        {/* F5/ICON-06: a trashed diagram is RESTORABLE, so its
                            reference is live and must count — but the row says
                            where the use is, or the count reads as wrong. */}
                        {r.inTrash && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: 0.75, fontStyle: 'italic' }}
                            data-axoview-id="icon-usage-in-trash"
                          >
                            {/* Hardcoded to match this dialog, whose copy is
                                all literal English — i18n'ing one string here
                                would be the inconsistency, not the fix. */}
                            (in Trash)
                          </Typography>
                        )}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ flexShrink: 0 }}
                      >
                        {r.count}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
        <Button variant="text" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={scanning}
          autoFocus
          data-axoview-id="dialog-delete-icon-confirm"
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};
