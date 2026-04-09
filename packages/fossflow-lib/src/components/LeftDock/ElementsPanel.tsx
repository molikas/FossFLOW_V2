import React, { useCallback, useRef, useState } from 'react';
import {
  Box,
  Button,
  FormControlLabel,
  Checkbox,
  Typography,
  Alert
} from '@mui/material';
import { FileUpload as FileUploadIcon } from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { Icon } from 'src/types';
import { Searchbox } from 'src/components/ItemControls/IconSelectionControls/Searchbox';
import { Icons } from 'src/components/ItemControls/IconSelectionControls/Icons';
import { IconGrid } from 'src/components/ItemControls/IconSelectionControls/IconGrid';
import { useIconFiltering } from 'src/hooks/useIconFiltering';
import { useIconCategories } from 'src/hooks/useIconCategories';
import { generateId } from 'src/utils';
import { useTranslation } from 'src/stores/localeStore';
import { CommonElements } from './CommonElements';

export const ElementsPanel = () => {
  const { t } = useTranslation('iconSelectionControls');
  const uiStateActions = useUiStateStore((s) => s.actions);
  const iconCategoriesState = useUiStateStore((s) => s.iconCategoriesState);
  const modelActions = useModelStore((s) => s.actions);
  const currentIcons = useModelStore((s) => s.icons);
  const { setFilter, filteredIcons, filter } = useIconFiltering();
  const { iconCategories } = useIconCategories();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [treatAsIsometric, setTreatAsIsometric] = useState(true);
  const [showAlert, setShowAlert] = useState(
    () => localStorage.getItem('fossflow-show-drag-hint') !== 'false'
  );

  const handleIconMouseDown = useCallback(
    (icon: Icon) => {
      // Enter PLACE_ICON mode with the icon already selected
      uiStateActions.setMode({
        type: 'PLACE_ICON',
        showCursor: true,
        id: icon.id
      });
    },
    [uiStateActions]
  );

  const dismissAlert = useCallback(() => {
    setShowAlert(false);
    localStorage.setItem('fossflow-show-drag-hint', 'false');
  }, []);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const newIcons: Icon[] = [];
      const existingNames = new Set(currentIcons.map((icon) => icon.name.toLowerCase()));

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        let baseName = file.name.replace(/\.[^/.]+$/, '');
        let finalName = baseName;
        let counter = 1;
        while (existingNames.has(finalName.toLowerCase())) {
          finalName = `${baseName}_${counter}`;
          counter++;
        }
        existingNames.add(finalName.toLowerCase());

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
            const original = e.target?.result as string;
            if (file.type === 'image/svg+xml') { resolve(original); return; }
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (!ctx) { resolve(original); return; }
              const TARGET = 128;
              const s = Math.min(TARGET / img.width, TARGET / img.height);
              const w = img.width * s, h = img.height * s;
              canvas.width = TARGET; canvas.height = TARGET;
              ctx.clearRect(0, 0, TARGET, TARGET);
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, (TARGET - w) / 2, (TARGET - h) / 2, w, h);
              resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = original;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newIcons.push({
          id: generateId(),
          name: finalName,
          url: dataUrl,
          collection: 'imported',
          isIsometric: treatAsIsometric
        });
      }

      if (newIcons.length > 0) {
        modelActions.set({ icons: [...currentIcons, ...newIcons] });
        const hasImported = iconCategoriesState.some((cat) => cat.id === 'imported');
        if (!hasImported) {
          uiStateActions.setIconCategoriesState([
            ...iconCategoriesState,
            { id: 'imported', isExpanded: true }
          ]);
        }
      }
      event.target.value = '';
    },
    [currentIcons, modelActions, iconCategoriesState, uiStateActions, treatAsIsometric]
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Common elements: Group, Text, Connector */}
      <Box sx={{ flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
        <CommonElements />
      </Box>

      {/* Search */}
      <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Searchbox value={filter} onChange={setFilter} />
      </Box>

      {/* Icon grid */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1 }}>
        {filteredIcons ? (
          <Box sx={{ py: 1 }}>
            <IconGrid icons={filteredIcons} onMouseDown={handleIconMouseDown} />
          </Box>
        ) : (
          <Icons iconCategories={iconCategories} onMouseDown={handleIconMouseDown} />
        )}
      </Box>

      {/* Import section */}
      <Box
        sx={{
          flexShrink: 0,
          borderTop: '1px solid',
          borderColor: 'divider',
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1
        }}
      >
        <Button
          variant="outlined"
          startIcon={<FileUploadIcon />}
          onClick={() => fileInputRef.current?.click()}
          fullWidth
          size="small"
        >
          {t('importIcons')}
        </Button>
        <FormControlLabel
          control={
            <Checkbox
              checked={treatAsIsometric}
              onChange={(e) => setTreatAsIsometric(e.target.checked)}
              size="small"
            />
          }
          label={<Typography variant="body2">{t('isometricLabel')}</Typography>}
          sx={{ ml: 0, mt: 0 }}
        />
        {showAlert && (
          <Alert severity="info" onClose={dismissAlert} sx={{ fontSize: 12 }}>
            {t('dragHint')}
          </Alert>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </Box>
    </Box>
  );
};
