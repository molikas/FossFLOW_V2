import React, { memo } from 'react';
import { Box, Typography } from '@mui/material';
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
}

export const LayerItemRow = memo(({ item, isSelected, onClick }: Props) => {
  return (
    <Box
      onClick={() => onClick(item)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        pl: 3.5,
        pr: 0.5,
        py: 0.25,
        cursor: 'pointer',
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
    </Box>
  );
});
