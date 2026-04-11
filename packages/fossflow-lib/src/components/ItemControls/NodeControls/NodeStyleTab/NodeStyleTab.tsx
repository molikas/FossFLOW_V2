import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Stack, Box, Slider, Collapse, Button } from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { ModelItem, ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { useModelStore } from 'src/stores/modelStore';
import { Section } from '../../components/Section';
import { LabelColorPicker } from '../../components/LabelColorPicker';
import { QuickIconSelector } from '../QuickIconSelector';
import { useTranslation } from 'src/stores/localeStore';

interface Props {
  node: ViewItem;
  iconUrl: string;
  onModelItemUpdated: (updates: Partial<ModelItem>) => void;
  onViewItemUpdated: (updates: Partial<ViewItem>) => void;
}

export const NodeStyleTab = ({
  node,
  iconUrl,
  onModelItemUpdated,
  onViewItemUpdated
}: Props) => {
  const { t } = useTranslation('nodeStyleTab');
  const modelItem = useModelItem(node.id);
  const modelActions = useModelStore((state) => state.actions);
  const icons = useModelStore((state) => state.icons);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const currentIcon = icons.find((icon) => icon.id === modelItem?.icon);
  const [localScale, setLocalScale] = useState(currentIcon?.scale || 1);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    setLocalScale(currentIcon?.scale || 1);
  }, [currentIcon?.scale]);

  const updateIconScale = useCallback(
    (scale: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const updatedIcons = icons.map((icon) =>
          icon.id === modelItem?.icon ? { ...icon, scale } : icon
        );
        modelActions.set({ icons: updatedIcons });
      }, 100);
    },
    [icons, modelItem?.icon, modelActions]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!modelItem) return null;

  return (
    <Stack>
      {/* Icon */}
      <Section title={t('icon')}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            component="img"
            src={iconUrl}
            sx={{ width: 48, height: 48, flexShrink: 0 }}
          />
          <Button
            variant="outlined"
            size="small"
            endIcon={iconPickerOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setIconPickerOpen((v) => !v)}
            sx={{ fontSize: 11 }}
          >
            {iconPickerOpen ? t('close') : t('change')}
          </Button>
        </Stack>
        <Collapse in={iconPickerOpen} unmountOnExit>
          <Box sx={{ mt: 1 }}>
            <QuickIconSelector
              currentIconId={modelItem.icon}
              onIconSelected={(_icon) => {
                onModelItemUpdated({ icon: _icon.id });
                setIconPickerOpen(false);
              }}
              onClose={() => setIconPickerOpen(false)}
            />
          </Box>
        </Collapse>
      </Section>

      {/* Icon size */}
      <Section title={t('iconSize')}>
        <Slider
          marks
          step={0.1}
          min={0.3}
          max={2.5}
          value={localScale}
          onChange={(_, v) => {
            const scale = v as number;
            setLocalScale(scale);
            updateIconScale(scale);
          }}
        />
      </Section>

      {/* Font size */}
      {modelItem.name && (
        <Section title={t('labelFontSize')}>
          <Slider
            marks
            step={2}
            min={10}
            max={24}
            value={node.labelFontSize ?? 14}
            onChange={(_, v) =>
              onViewItemUpdated({ labelFontSize: v as number })
            }
          />
        </Section>
      )}

      {/* Label colour */}
      {modelItem.name && (
        <Section title={t('labelColor')}>
          <LabelColorPicker
            value={node.labelColor}
            onChange={(color) => onViewItemUpdated({ labelColor: color })}
          />
        </Section>
      )}

      {/* Label height */}
      {modelItem.name && (
        <Section title={t('labelHeight')}>
          <Slider
            marks
            step={20}
            min={60}
            max={280}
            value={node.labelHeight ?? 80}
            onChange={(_, v) => onViewItemUpdated({ labelHeight: v as number })}
          />
        </Section>
      )}
    </Stack>
  );
};
