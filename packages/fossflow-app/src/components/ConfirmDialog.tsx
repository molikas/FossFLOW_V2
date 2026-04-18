import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'

interface ConfirmDialogProps {
  open: boolean
  message: string
  title?: string
  confirmLabel?: string
  discardLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  /** When provided, renders a 3-button variant: Cancel | Discard | confirmLabel */
  onDiscard?: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  message,
  title,
  confirmLabel = 'Confirm',
  discardLabel = 'Discard',
  cancelLabel = 'Cancel',
  onConfirm,
  onDiscard,
  onCancel
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { boxShadow: '0px 10px 20px -2px rgba(0,0,0,0.25)', borderRadius: 2 } }}
    >
      {title && (
        <DialogTitle sx={{ pb: 1, pr: 6 }}>
          <Typography variant="h6" fontWeight={600} component="span">{title}</Typography>
          <IconButton
            size="small"
            onClick={onCancel}
            sx={{ position: 'absolute', top: 12, right: 12, color: 'text.secondary' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
      )}
      <DialogContent sx={{ pt: title ? 0 : undefined }}>
        <Typography variant="body2" color="text.secondary">{message}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
        <Button variant="text" onClick={onCancel}>{cancelLabel}</Button>
        {onDiscard && (
          <Button variant="text" onClick={onDiscard}>{discardLabel}</Button>
        )}
        <Button variant="contained" onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
