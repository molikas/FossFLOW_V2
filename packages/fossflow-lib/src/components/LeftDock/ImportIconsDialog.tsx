import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  Typography,
  Box
} from '@mui/material';

interface Props {
  open: boolean;
  fileCount: number;
  onConfirm: (isIsometric: boolean) => void;
  onCancel: () => void;
}

export const ImportIconsDialog = ({
  open,
  fileCount,
  onConfirm,
  onCancel
}: Props) => {
  const [isIsometric, setIsIsometric] = useState(false);

  const handleConfirm = () => {
    onConfirm(isIsometric);
    setIsIsometric(false);
  };

  const handleCancel = () => {
    onCancel();
    setIsIsometric(false);
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        Import {fileCount} icon{fileCount !== 1 ? 's' : ''}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Choose how these icons should be rendered on the canvas.
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={isIsometric}
                onChange={(e) => setIsIsometric(e.target.checked)}
                size="small"
              />
            }
            label={
              <Box>
                <Typography variant="body2">
                  Apply isometric projection
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  For 3D-style icons. Uncheck for flat logos (AWS, Azure, etc.)
                </Typography>
              </Box>
            }
            sx={{ ml: 0, alignItems: 'flex-start' }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="text" onClick={handleCancel}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleConfirm}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};
