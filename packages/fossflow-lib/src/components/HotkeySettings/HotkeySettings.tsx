import React from 'react';
import {
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { HOTKEY_PROFILES, HotkeyProfile } from 'src/config/hotkeys';
import { FIXED_SHORTCUTS } from 'src/config/shortcuts';
import { useTranslation } from 'src/stores/localeStore';

export const HotkeySettings = () => {
  const hotkeyProfile = useUiStateStore((state) => state.hotkeyProfile);
  const setHotkeyProfile = useUiStateStore((state) => state.actions.setHotkeyProfile);
  const { t } = useTranslation();

  const currentMapping = HOTKEY_PROFILES[hotkeyProfile];

  const tools = [
    { name: t('settings.hotkeys.toolSelect'), key: currentMapping.select },
    { name: t('settings.hotkeys.toolPan'), key: currentMapping.pan },
    { name: t('settings.hotkeys.toolAddItem'), key: currentMapping.addItem },
    { name: t('settings.hotkeys.toolRectangle'), key: currentMapping.rectangle },
    { name: t('settings.hotkeys.toolConnector'), key: currentMapping.connector },
    { name: t('settings.hotkeys.toolText'), key: currentMapping.text }
  ];

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {t('settings.hotkeys.title')}
      </Typography>

      <FormControl fullWidth sx={{ mb: 1 }}>
        <InputLabel>{t('settings.hotkeys.profile')}</InputLabel>
        <Select
          value={hotkeyProfile}
          label={t('settings.hotkeys.profile')}
          onChange={(e) => setHotkeyProfile(e.target.value as HotkeyProfile)}
        >
          <MenuItem value="qwerty">{t('settings.hotkeys.profileQwerty')}</MenuItem>
          <MenuItem value="smnrct">{t('settings.hotkeys.profileSmnrct')}</MenuItem>
          <MenuItem value="none">{t('settings.hotkeys.profileNone')}</MenuItem>
        </Select>
      </FormControl>

      {hotkeyProfile === 'smnrct' && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: 'block' }}>
          Keys S, M, N, R, C, T map to Select, Pan, Add item, Rectangle, Connector, Text —
          designed for left-hand tool switching while the right hand stays on the mouse.
        </Typography>
      )}
      {hotkeyProfile === 'none' && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: 'block' }}>
          All tool hotkeys are disabled. Use the toolbar buttons to switch tools.
        </Typography>
      )}
      {hotkeyProfile === 'qwerty' && <Box sx={{ mb: 3 }} />}

      {hotkeyProfile !== 'none' && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('settings.hotkeys.tool')}</TableCell>
                <TableCell>{t('settings.hotkeys.hotkey')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tools.map((tool) => (
                <TableRow key={tool.name}>
                  <TableCell>{tool.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {tool.key ? tool.key.toUpperCase() : '-'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        {t('settings.hotkeys.note')}
      </Typography>

      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
        {t('settings.hotkeys.fixedShortcutsTitle')}
      </Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('settings.hotkeys.tool')}</TableCell>
              <TableCell>{t('settings.hotkeys.hotkey')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              { name: t('settings.hotkeys.fixedCopy'), key: FIXED_SHORTCUTS.copy },
              { name: t('settings.hotkeys.fixedPaste'), key: FIXED_SHORTCUTS.paste },
              { name: t('settings.hotkeys.fixedUndo'), key: FIXED_SHORTCUTS.undo },
              { name: t('settings.hotkeys.fixedRedo'), key: `${FIXED_SHORTCUTS.redo} / ${FIXED_SHORTCUTS.redoAlt}` }
            ].map((item) => (
              <TableRow key={item.name}>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {item.key}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};