import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useViewItem } from 'src/hooks/useViewItem';
import { IconSelectionControls } from 'src/components/ItemControls/IconSelectionControls/IconSelectionControls';
import { NodePanel } from './NodeControls/NodePanel/NodePanel';
import { ConnectorControls } from './ConnectorControls/ConnectorControls';
import { TextBoxControls } from './TextBoxControls/TextBoxControls';
import { RectangleControls } from './RectangleControls/RectangleControls';

interface NodePanelWrapperProps {
  id: string;
  readOnly?: boolean;
}

const NodePanelWrapper = ({ id, readOnly }: NodePanelWrapperProps) => {
  const viewItem = useViewItem(id);
  if (!viewItem) return null;
  return <NodePanel key={id} viewItem={viewItem} readOnly={readOnly} />;
};

interface Props {
  readOnly?: boolean;
}

export const ItemControlsManager = ({ readOnly }: Props) => {
  const itemControls = useUiStateStore((state) => state.itemControls);

  const Controls = useMemo(() => {
    switch (itemControls?.type) {
      case 'ITEM':
        return <NodePanelWrapper id={itemControls.id} readOnly={readOnly} />;
      case 'CONNECTOR':
        return <ConnectorControls key={itemControls.id} id={itemControls.id} />;
      case 'TEXTBOX':
        return <TextBoxControls key={itemControls.id} id={itemControls.id} />;
      case 'RECTANGLE':
        return <RectangleControls key={itemControls.id} id={itemControls.id} />;
      case 'ADD_ITEM':
        return <IconSelectionControls />;
      default:
        return null;
    }
  }, [itemControls, readOnly]);

  return (
    <Box
      data-testid="item-controls-panel"
      sx={{ width: '100%', height: '100%' }}
    >
      {Controls}
    </Box>
  );
};
