import React, { useRef, useEffect, memo } from 'react';
import { Box, SxProps } from '@mui/material';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';

interface Props {
  children?: React.ReactNode;
  order?: number;
  sx?: SxProps;
  disableAnimation?: boolean; // kept for API compatibility, no longer used
}

export const SceneLayer = memo(({ children, order = 0, sx }: Props) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const storeApi = useUiStateStoreApi();

  useEffect(() => {
    const applyTransform = (x: number, y: number, scale: number) => {
      if (!elementRef.current) return;
      elementRef.current.style.transform = `translateX(${x}px) translateY(${y}px) scale(${scale})`;
    };

    // Apply current values immediately on mount
    const { scroll, zoom } = storeApi.getState();
    applyTransform(scroll.position.x, scroll.position.y, zoom);

    // Subscribe to future scroll/zoom changes — bypasses React render cycle entirely
    const unsubscribe = storeApi.subscribe((state, prev) => {
      if (state.scroll === prev.scroll && state.zoom === prev.zoom) return;
      applyTransform(
        state.scroll.position.x,
        state.scroll.position.y,
        state.zoom
      );
    });

    return unsubscribe;
  }, [storeApi]);

  return (
    <Box
      ref={elementRef}
      sx={{
        position: 'absolute',
        zIndex: order,
        top: '50%',
        left: '50%',
        width: 0,
        height: 0,
        userSelect: 'none',
        willChange: 'transform',
        ...sx
      }}
    >
      {children}
    </Box>
  );
});
