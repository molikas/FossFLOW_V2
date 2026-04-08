import React, { memo, useMemo } from 'react';
import { ViewItem } from 'src/types';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { resolveRenderOrder, findLayer } from 'src/utils/renderOrder';
import { Node } from './Node/Node';

interface Props {
  nodes: ViewItem[];
}

export const Nodes = memo(({ nodes }: Props) => {
  const { layers, visibleIds } = useLayerContext();

  const sortedNodes = useMemo(() => {
    // Filter to visible-only, then sort by resolved render order descending
    // (higher order = rendered later = visually on top in CSS stacking).
    return [...nodes]
      .filter((node) => visibleIds.size === 0 || visibleIds.has(node.id))
      .sort((a, b) => {
        const layerA = findLayer(a.layerId, layers);
        const layerB = findLayer(b.layerId, layers);
        const orderA = resolveRenderOrder(
          layerA?.order ?? 0,
          a.zIndex ?? 0,
          -a.tile.x - a.tile.y
        );
        const orderB = resolveRenderOrder(
          layerB?.order ?? 0,
          b.zIndex ?? 0,
          -b.tile.x - b.tile.y
        );
        return orderA - orderB;
      });
  }, [nodes, layers, visibleIds]);

  return (
    <>
      {sortedNodes.map((node) => {
        const layer = findLayer(node.layerId, layers);
        const order = resolveRenderOrder(
          layer?.order ?? 0,
          node.zIndex ?? 0,
          -node.tile.x - node.tile.y
        );
        return <Node key={node.id} order={order} node={node} />;
      })}
    </>
  );
});
