import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { WidgetsOutlined, LayersOutlined } from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { ElementsPanel } from './ElementsPanel';
import { LayersPanel } from 'src/components/LayersPanel/LayersPanel';

const STRIP_WIDTH = 40;
const PANEL_WIDTH = 240;

type LeftTabId = 'ELEMENTS' | 'LAYERS';

const TABS: { id: LeftTabId; icon: React.ReactNode; tooltip: string }[] = [
  {
    id: 'ELEMENTS',
    icon: <WidgetsOutlined sx={{ fontSize: 20 }} />,
    tooltip: 'Elements'
  },
  {
    id: 'LAYERS',
    icon: <LayersOutlined sx={{ fontSize: 20 }} />,
    tooltip: 'Layers'
  }
];

export const LeftDock = () => {
  const activeLeftTab = useUiStateStore((s) => s.activeLeftTab);
  const setActiveLeftTab = useUiStateStore((s) => s.actions.setActiveLeftTab);

  const panelOpen = activeLeftTab !== null;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        display: 'flex',
        zIndex: 10,
        pointerEvents: 'none'
      }}
    >
      {/* Icon strip — always visible */}
      <Box
        sx={{
          width: STRIP_WIDTH,
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pt: 1,
          gap: 0.5,
          flexShrink: 0,
          pointerEvents: 'all',
          boxShadow: panelOpen ? 0 : 1
        }}
      >
        {TABS.map((tab) => (
          <Tooltip key={tab.id} title={tab.tooltip} placement="right">
            <IconButton
              size="small"
              onClick={() =>
                setActiveLeftTab(activeLeftTab === tab.id ? null : tab.id)
              }
              sx={{
                borderRadius: 1,
                color:
                  activeLeftTab === tab.id ? 'primary.main' : 'text.secondary',
                bgcolor:
                  activeLeftTab === tab.id ? 'action.selected' : 'transparent',
                width: 32,
                height: 32
              }}
            >
              {tab.icon}
            </IconButton>
          </Tooltip>
        ))}
      </Box>

      {/* Sliding panel */}
      <Box
        sx={{
          width: PANEL_WIDTH,
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transform: panelOpen
            ? 'translateX(0)'
            : `translateX(-${PANEL_WIDTH + STRIP_WIDTH}px)`,
          transition: 'transform 0.2s ease',
          boxShadow: panelOpen ? 3 : 0,
          pointerEvents: panelOpen ? 'all' : 'none'
        }}
      >
        {activeLeftTab === 'ELEMENTS' && <ElementsPanel />}
        {activeLeftTab === 'LAYERS' && <LayersPanel />}
      </Box>
    </Box>
  );
};
