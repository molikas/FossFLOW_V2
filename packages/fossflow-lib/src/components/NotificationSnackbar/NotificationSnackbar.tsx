import React, { useEffect } from 'react';
import { Snackbar, Alert } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';

const AUTO_HIDE_MS = 3000;

export const NotificationSnackbar = () => {
  const notification = useUiStateStore((state) => state.notification);
  const setNotification = useUiStateStore((state) => state.actions.setNotification);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [notification, setNotification]);

  return (
    <Snackbar
      open={!!notification}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={notification?.severity ?? 'info'}
        variant="filled"
        onClose={() => setNotification(null)}
        sx={{ minWidth: 220 }}
      >
        {notification?.message}
      </Alert>
    </Snackbar>
  );
};
