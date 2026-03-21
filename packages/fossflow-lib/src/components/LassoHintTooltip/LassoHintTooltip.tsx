import React, { useState, useEffect, useRef } from 'react';
import { Box, IconButton, Paper, Typography, useTheme } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useTranslation } from 'src/stores/localeStore';

const STORAGE_KEY = 'fossflow_lasso_hint_dismissed';

interface Props {
  toolMenuRef?: React.RefObject<HTMLElement | null>;
}

export const LassoHintTooltip = ({ toolMenuRef }: Props) => {
  const { t } = useTranslation('lassoHintTooltip');
  const theme = useTheme();
  const modeType = useUiStateStore((state) => state.mode.type);
  const [isDismissed, setIsDismissed] = useState(true);
  const [position, setPosition] = useState({ top: 16, right: 16 });
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    // Check if the hint has been dismissed before
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== 'true') {
      setIsDismissed(false);
    }
  }, []);

  // Auto-dismiss after first viewing: once the user leaves lasso mode the
  // tooltip is marked as seen so it never shows again in this or future sessions.
  useEffect(() => {
    const isLassoMode = modeType === 'LASSO' || modeType === 'FREEHAND_LASSO';
    if (isLassoMode && !isDismissed) {
      wasVisibleRef.current = true;
    } else if (!isLassoMode && wasVisibleRef.current && !isDismissed) {
      wasVisibleRef.current = false;
      setIsDismissed(true);
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  }, [modeType, isDismissed]);

  useEffect(() => {
    // Calculate position based on toolbar
    if (toolMenuRef?.current) {
      const toolMenuRect = toolMenuRef.current.getBoundingClientRect();
      // Position tooltip below the toolbar with some spacing
      setPosition({
        top: toolMenuRect.bottom + 16,
        right: 16
      });
    } else {
      // Fallback position if no toolbar ref
      const appPadding = theme.customVars?.appPadding || { x: 16, y: 16 };
      setPosition({
        top: appPadding.y + 500, // Approximate toolbar height
        right: appPadding.x
      });
    }
  }, [toolMenuRef, theme]);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  // Only show when in LASSO or FREEHAND_LASSO mode
  if (isDismissed || (modeType !== 'LASSO' && modeType !== 'FREEHAND_LASSO')) {
    return null;
  }

  const isFreehandMode = modeType === 'FREEHAND_LASSO';

  return (
    <Box
      sx={{
        position: 'fixed',
        top: position.top,
        right: position.right,
        zIndex: 1300, // Above most UI elements
        maxWidth: 320
      }}
    >
      <Paper
        elevation={4}
        sx={{
          p: 2,
          pr: 5,
          backgroundColor: 'background.paper',
          borderLeft: '4px solid',
          borderLeftColor: 'primary.main'
        }}
      >
        <IconButton
          size="small"
          onClick={handleDismiss}
          sx={{
            position: 'absolute',
            right: 4,
            top: 4
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
          {isFreehandMode ? t('tipFreehandLasso') : t('tipLasso')}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {isFreehandMode ? (
            <>
              <strong>{t('freehandDragStart')}</strong> {t('freehandDragMiddle')} <strong>{t('freehandDragEnd')}</strong> {t('freehandComplete')}
            </>
          ) : (
            <>
              <strong>{t('lassoDragStart')}</strong> {t('lassoDragEnd')}
            </>
          )}
        </Typography>

        <Typography variant="body2" color="text.secondary">
          {t('moveStart')} <strong>{t('moveMiddle')}</strong> {t('moveEnd')}
        </Typography>
      </Paper>
    </Box>
  );
};
