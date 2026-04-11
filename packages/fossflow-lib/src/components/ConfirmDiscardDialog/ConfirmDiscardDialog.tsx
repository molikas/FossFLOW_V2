import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box
} from '@mui/material';
import { WarningAmberOutlined } from '@mui/icons-material';

interface Props {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export const ConfirmDiscardDialog = ({
  open,
  onSave,
  onDiscard,
  onCancel
}: Props) => {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberOutlined color="warning" />
          Unsaved changes
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          Your diagram has unsaved changes. What would you like to do?
        </Typography>
      </DialogContent>
      <DialogActions
        sx={{
          px: 3,
          pb: 2,
          gap: 1,
          flexDirection: 'column',
          alignItems: 'stretch'
        }}
      >
        <Button variant="contained" onClick={onSave} fullWidth>
          Save & continue
        </Button>
        <Button variant="outlined" color="error" onClick={onDiscard} fullWidth>
          Discard changes
        </Button>
        <Button variant="text" onClick={onCancel} fullWidth>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};
