import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Slider, Box, TextField, Stack, IconButton, Tooltip } from '@mui/material';
import { InsertLink as InsertLinkIcon } from '@mui/icons-material';
import { ModelItem, ViewItem } from 'src/types';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';
import { useModelItem } from 'src/hooks/useModelItem';
import { useModelStore } from 'src/stores/modelStore';
import { DeleteButton } from '../../components/DeleteButton';
import { Section } from '../../components/Section';

export type NodeUpdates = {
  model: Partial<ModelItem>;
  view: Partial<ViewItem>;
};

interface Props {
  node: ViewItem;
  onModelItemUpdated: (updates: Partial<ModelItem>) => void;
  onViewItemUpdated: (updates: Partial<ViewItem>) => void;
  onDeleted: () => void;
}

export const NodeSettings = ({
  node,
  onModelItemUpdated,
  onViewItemUpdated,
  onDeleted
}: Props) => {
  const modelItem = useModelItem(node.id);
  const modelActions = useModelStore((state) => state.actions);
  const icons = useModelStore((state) => state.icons);

  // Show link input if a link is already set on this node
  const [showLinkInput, setShowLinkInput] = useState(!!modelItem?.headerLink);

  // Local state for smooth slider interaction
  const currentIcon = icons.find(icon => icon.id === modelItem?.icon);
  const [localScale, setLocalScale] = useState(currentIcon?.scale || 1);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Update local scale when icon changes
  useEffect(() => {
    setLocalScale(currentIcon?.scale || 1);
  }, [currentIcon?.scale]);

  // Debounced update to store
  const updateIconScale = useCallback((scale: number) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const updatedIcons = icons.map(icon =>
        icon.id === modelItem?.icon
          ? { ...icon, scale }
          : icon
      );
      modelActions.set({ icons: updatedIcons });
    }, 100);
  }, [icons, modelItem?.icon, modelActions]);

  // Handle slider change with local state + debounced store update
  const handleScaleChange = useCallback((e: Event, newScale: number | number[]) => {
    const scale = newScale as number;
    setLocalScale(scale);
    updateIconScale(scale);
  }, [updateIconScale]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleToggleLink = useCallback(() => {
    if (showLinkInput && modelItem?.headerLink) {
      // Turning off — clear the stored link
      onModelItemUpdated({ headerLink: undefined });
    }
    setShowLinkInput((prev) => !prev);
  }, [showLinkInput, modelItem?.headerLink, onModelItemUpdated]);

  if (!modelItem) {
    return null;
  }

  return (
    <>
      <Section title="Name">
        <Stack direction="row" spacing={0.5} alignItems="center">
          <TextField
            value={modelItem.name}
            onChange={(e) => {
              const text = e.target.value as string;
              if (modelItem.name !== text) onModelItemUpdated({ name: text });
            }}
            sx={{ flex: 1 }}
          />
          <Tooltip title={showLinkInput ? 'Remove link' : 'Add link to name'}>
            <IconButton
              size="small"
              color={modelItem.headerLink ? 'primary' : 'default'}
              onClick={handleToggleLink}
            >
              <InsertLinkIcon />
            </IconButton>
          </Tooltip>
        </Stack>
        {showLinkInput && (
          <TextField
            value={modelItem.headerLink || ''}
            placeholder="https://..."
            size="small"
            fullWidth
            sx={{ mt: 1 }}
            onChange={(e) => {
              const text = e.target.value;
              onModelItemUpdated({ headerLink: text || undefined });
            }}
          />
        )}
      </Section>
      <Section title="Description">
        <RichTextEditor
          value={modelItem.description}
          onChange={(text) => {
            const hasContent = (val: string | undefined) =>
              !!val && val.replace(/<[^>]*>/g, '').trim() !== '';
            const isEmpty = !hasContent(text);
            const storedIsEmpty = !hasContent(modelItem.description);
            if (isEmpty && storedIsEmpty) return;
            if (modelItem.description !== text)
              onModelItemUpdated({ description: isEmpty ? undefined : text });
          }}
        />
      </Section>
      {modelItem.name && (
        <Section title="Label height">
          <Slider
            marks
            step={20}
            min={60}
            max={280}
            value={node.labelHeight ?? 80}
            onChange={(e, newHeight) => {
              const labelHeight = newHeight as number;
              onViewItemUpdated({ labelHeight });
            }}
          />
        </Section>
      )}

      <Section title="Icon size">
        <Slider
          marks
          step={0.1}
          min={0.3}
          max={2.5}
          value={localScale}
          onChange={handleScaleChange}
        />
      </Section>
      <Section>
        <Box>
          <DeleteButton onClick={onDeleted} />
        </Box>
      </Section>
    </>
  );
};
