import React, { useCallback } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { generateId, findNearestUnoccupiedTile } from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { useLayerActions } from 'src/hooks/useLayerActions';
import { VIEW_ITEM_DEFAULTS } from 'src/config';
import { ContextMenu } from './ContextMenu';

interface Props {
  anchorEl?: HTMLElement | null;
}

export const ContextMenuManager = ({ anchorEl }: Props) => {
  const scene = useScene();
  const model = useModelStore((state) => {
    return state;
  });
  const contextMenu = useUiStateStore((state) => {
    return state.contextMenu;
  });

  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });

  const { layers } = useLayerContext();
  const { assignLayerToItems } = useLayerActions();

  const onClose = useCallback(() => {
    uiStateActions.setContextMenu(null);
  }, [uiStateActions]);

  if (contextMenu?.type === 'ITEM' && contextMenu.item) {
    const itemId = contextMenu.item.id;
    const layerMenuItems = layers.length > 0
      ? [
          { label: 'Remove from layer', onClick: () => { assignLayerToItems(undefined, [{ type: 'ITEM' as const, id: itemId }]); onClose(); } },
          ...[...layers]
            .sort((a, b) => b.order - a.order)
            .map((layer) => ({
              label: `Move to "${layer.name}"`,
              onClick: () => { assignLayerToItems(layer.id, [{ type: 'ITEM' as const, id: itemId }]); onClose(); }
            }))
        ]
      : [{ label: 'No layers — add one via the Layers panel', onClick: onClose }];

    return (
      <ContextMenu
        anchorEl={anchorEl}
        onClose={onClose}
        menuItems={layerMenuItems}
      />
    );
  }

  return (
    <ContextMenu
      anchorEl={anchorEl}
      onClose={onClose}
      menuItems={[
        {
          label: 'Add Node',
          onClick: () => {
            if (!contextMenu) return;
            if (model.icons.length > 0) {
              const modelItemId = generateId();
              const firstIcon = model.icons[0];

              const targetTile = findNearestUnoccupiedTile(contextMenu.tile, scene) || contextMenu.tile;

              scene.placeIcon({
                modelItem: {
                  id: modelItemId,
                  name: 'Untitled',
                  icon: firstIcon.id
                },
                viewItem: {
                  ...VIEW_ITEM_DEFAULTS,
                  id: modelItemId,
                  tile: targetTile
                }
              });
            }
            onClose();
          }
        },
        {
          label: 'Add Rectangle',
          onClick: () => {
            if (!contextMenu) return;
            if (model.colors.length > 0) {
              scene.createRectangle({
                id: generateId(),
                color: model.colors[0].id,
                from: contextMenu.tile,
                to: contextMenu.tile
              });
            }
            onClose();
          }
        }
      ]}
    />
  );
};
