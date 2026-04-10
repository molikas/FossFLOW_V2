import React, { useCallback, useRef, useState } from 'react';
import { Box, Button } from '@mui/material';
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
import { ImportIconsDialog } from './ImportIconsDialog';

export const ElementsPanel = () => {
  const { t } = useTranslation('iconSelectionControls');
  const uiStateActions = useUiStateStore((s) => s.actions);
  const iconCategoriesState = useUiStateStore((s) => s.iconCategoriesState);
  const modelActions = useModelStore((s) => s.actions);
  const currentIcons = useModelStore((s) => s.icons);
  const { setFilter, filteredIcons, filter } = useIconFiltering();
  const { iconCategories } = useIconCategories();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pending files waiting for the import dialog confirmation
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const handleIconMouseDown = useCallback(
    (icon: Icon) => {
      uiStateActions.setMode({ type: 'PLACE_ICON', showCursor: true, id: icon.id });
    },
    [uiStateActions]
  );

  // Step 1: user picks files → stash them, open the dialog
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length > 0) setPendingFiles(imageFiles);

      // Reset input so the same file can be re-selected
      event.target.value = '';
    },
    []
  );

  // Step 2: user confirms in dialog → process and import
  const handleImportConfirm = useCallback(
    async (isIsometric: boolean) => {
      const newIcons: Icon[] = [];
      const existingNames = new Set(currentIcons.map((icon) => icon.name.toLowerCase()));

      for (const file of pendingFiles) {
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
          isIsometric
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

      setPendingFiles([]);
    },
    [pendingFiles, currentIcons, modelActions, iconCategoriesState, uiStateActions]
  );

  const handleImportCancel = useCallback(() => {
    setPendingFiles([]);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Common elements: Rectangle, Text, Connector */}
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

      {/* Import section — just the button, no persistent checkbox */}
      <Box
        sx={{
          flexShrink: 0,
          borderTop: '1px solid',
          borderColor: 'divider',
          p: 1.5
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </Box>

      <ImportIconsDialog
        open={pendingFiles.length > 0}
        fileCount={pendingFiles.length}
        onConfirm={handleImportConfirm}
        onCancel={handleImportCancel}
      />
    </Box>
  );
};
