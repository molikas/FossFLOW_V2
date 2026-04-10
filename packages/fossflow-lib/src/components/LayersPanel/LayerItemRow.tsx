import React, { memo, useState, useRef, useCallback } from 'react';
import { Box, Typography, InputBase } from '@mui/material';
import {
  DeviceHubOutlined,
  RectangleOutlined,
  TextFieldsOutlined,
  WidgetsOutlined
} from '@mui/icons-material';
import { LayerItem, LayerItemType } from 'src/hooks/useLayerContext';

const TYPE_ICON: Record<LayerItemType, React.ReactElement> = {
  ITEM: <WidgetsOutlined sx={{ fontSize: 12 }} />,
  CONNECTOR: <DeviceHubOutlined sx={{ fontSize: 12 }} />,
  RECTANGLE: <RectangleOutlined sx={{ fontSize: 12 }} />,
  TEXTBOX: <TextFieldsOutlined sx={{ fontSize: 12 }} />
};

interface Props {
  item: LayerItem;
  isSelected: boolean;
  onClick: (item: LayerItem) => void;
  onRename?: (item: LayerItem, newName: string) => void;
  onDragStart?: (item: LayerItem) => void;
}

export const LayerItemRow = memo(({ item, isSelected, onClick, onRename, onDragStart }: Props) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRename) return;
    setDraft(item.name);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  }, [item.name, onRename]);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.name) {
      onRename?.(item, trimmed);
    }
    setEditing(false);
  }, [editing, draft, item, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { setEditing(false); }
  }, [commitEdit]);

  return (
    <Box
      onClick={() => !editing && onClick(item)}
      onDoubleClick={startEdit}
      onMouseDown={(e) => { if (!editing) { e.preventDefault(); onDragStart?.(item); } }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        pl: 3.5,
        pr: 0.5,
        py: 0.25,
        cursor: editing ? 'text' : 'pointer',
        borderRadius: 1,
        bgcolor: isSelected ? 'primary.main' : 'transparent',
        color: isSelected ? 'primary.contrastText' : 'text.secondary',
        '&:hover': {
          bgcolor: isSelected ? 'primary.main' : 'action.hover'
        },
        userSelect: 'none'
      }}
    >
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', opacity: 0.7 }}>
        {TYPE_ICON[item.type]}
      </Box>
      {editing ? (
        <InputBase
          inputRef={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          sx={{
            flex: 1,
            fontSize: '0.7rem',
            color: isSelected ? 'primary.contrastText' : 'text.primary',
            '& input': { p: 0, height: 'auto' }
          }}
        />
      ) : (
        <Typography
          variant="caption"
          sx={{
            flex: 1,
            fontSize: '0.7rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {item.name}
        </Typography>
      )}
    </Box>
  );
});
