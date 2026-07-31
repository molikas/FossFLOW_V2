import React, { memo, useMemo } from 'react';
import { useScene } from 'src/hooks/useScene';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { resolveRenderOrder, findLayer } from 'src/utils/renderOrder';
import { Rectangle } from './Rectangle';

interface Props {
  rectangles: ReturnType<typeof useScene>['rectangles'];
}

export const Rectangles = memo(({ rectangles }: Props) => {
  const { visibleIds, layers } = useLayerContext();

  const visibleRectangles = useMemo(() => {
    const filtered = rectangles.filter(
      (r) => layers.length === 0 || visibleIds.has(r.id)
    );
    // F4/LAY-01: the LAYER's stack position dominates the per-element zIndex,
    // exactly as it does for nodes. This sorted on `zIndex` alone, so reordering
    // layers moved the nodes and nothing else — the Layers panel looked like it
    // controlled paint order for every element type and controlled it for one.
    // `resolveRenderOrder` is the shared key; the iso-depth tier is unused here
    // (rectangles are areas, not tiles) and passes 0.
    return [...filtered].reverse().sort(
      (a, b) =>
        resolveRenderOrder(findLayer(a.layerId, layers)?.order ?? 0, a.zIndex ?? 0, 0) -
        resolveRenderOrder(findLayer(b.layerId, layers)?.order ?? 0, b.zIndex ?? 0, 0)
    );
  }, [rectangles, visibleIds, layers]);

  return (
    <>
      {visibleRectangles.map((rectangle) => (
        <Rectangle key={rectangle.id} {...rectangle} />
      ))}
    </>
  );
});
