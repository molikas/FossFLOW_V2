import React, { memo, useMemo } from 'react';
import { useScene } from 'src/hooks/useScene';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { Rectangle } from './Rectangle';

interface Props {
  rectangles: ReturnType<typeof useScene>['rectangles'];
}

export const Rectangles = memo(({ rectangles }: Props) => {
  const { visibleIds } = useLayerContext();

  const visibleRectangles = useMemo(() => {
    const filtered = rectangles.filter(
      (r) => visibleIds.size === 0 || visibleIds.has(r.id)
    );
    return [...filtered].reverse();
  }, [rectangles, visibleIds]);

  return (
    <>
      {visibleRectangles.map((rectangle) => (
        <Rectangle key={rectangle.id} {...rectangle} />
      ))}
    </>
  );
});
