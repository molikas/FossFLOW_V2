import React, { useMemo } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import {
  getTilePosition,
  getAnchorTile,
  connectorPathTileToGlobal
} from 'src/utils';
import { Coords } from 'src/types';

// App accent color, matching the default connector/node palette
const ACCENT = '#a5b8f3';
const ACCENT_DARK = '#7b96e8';
const RADIUS = 11;
const INNER_RADIUS = 4;

const pulseKeyframes = `
@keyframes fossflow-anchor-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(165,184,243,0.55), 0 2px 8px rgba(0,0,0,0.18); }
  70%  { box-shadow: 0 0 0 7px rgba(165,184,243,0), 0 2px 8px rgba(0,0,0,0.18); }
  100% { box-shadow: 0 0 0 0 rgba(165,184,243,0), 0 2px 8px rgba(0,0,0,0.18); }
}
`;

export const ConnectorAnchorOverlay = () => {
  const itemControls = useUiStateStore((state) => state.itemControls);
  const mode = useUiStateStore((state) => state.mode);
  const { hitConnectors, currentView } = useScene();

  const selectedId = useMemo(() => {
    if (mode.type === 'RECONNECT_ANCHOR') return mode.connectorId;
    if (mode.type === 'CONNECTOR') return mode.id;
    if (itemControls?.type === 'CONNECTOR') return itemControls.id;
    return null;
  }, [mode, itemControls]);

  const reconnectingAnchorId =
    mode.type === 'RECONNECT_ANCHOR' ? mode.anchorId : null;

  const connector = useMemo(() => {
    if (!selectedId) return null;
    return hitConnectors.find((c) => c.id === selectedId) ?? null;
  }, [selectedId, hitConnectors]);

  if (!connector?.path?.tiles?.length) return null;

  const lastIdx = connector.anchors.length - 1;

  return (
    <>
      <style>{pulseKeyframes}</style>
      {connector.anchors.map((anchor, index) => {
        const isEndpoint = index === 0 || index === lastIdx;
        const isSource = index === 0;
        const isReconnecting = anchor.id === reconnectingAnchorId;

        let globalTile: Coords;
        if (isEndpoint && anchor.ref.item && connector.path.tiles.length > 0) {
          const pathTile =
            index === 0
              ? connector.path.tiles[0]
              : connector.path.tiles[connector.path.tiles.length - 1];
          globalTile = connectorPathTileToGlobal(
            pathTile,
            connector.path.rectangle.from
          );
        } else {
          globalTile = getAnchorTile(anchor, currentView);
        }

        const pos = getTilePosition({ tile: globalTile });
        const radius = isEndpoint ? RADIUS : RADIUS - 3;

        return (
          <div
            key={anchor.id}
            style={{
              position: 'absolute',
              left: pos.x - radius,
              top: pos.y - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(4px)',
              border: `1.5px solid rgba(0,0,0,0.10)`,
              boxShadow: isReconnecting
                ? `0 0 0 0 rgba(165,184,243,0.55), 0 2px 8px rgba(0,0,0,0.18)`
                : `0 1px 4px rgba(0,0,0,0.14), 0 0 0 1px rgba(255,255,255,0.6)`,
              animation: isReconnecting
                ? 'fossflow-anchor-pulse 1.2s ease-out infinite'
                : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none'
            }}
          >
            {/* Inner dot: filled for source, hollow ring for target, small square for waypoint */}
            {isEndpoint ? (
              isSource ? (
                <div
                  style={{
                    width: INNER_RADIUS * 2,
                    height: INNER_RADIUS * 2,
                    borderRadius: '50%',
                    backgroundColor: isReconnecting ? ACCENT_DARK : ACCENT,
                    flexShrink: 0
                  }}
                />
              ) : (
                <div
                  style={{
                    width: INNER_RADIUS * 2,
                    height: INNER_RADIUS * 2,
                    borderRadius: '50%',
                    border: `2px solid ${isReconnecting ? ACCENT_DARK : ACCENT}`,
                    backgroundColor: 'transparent',
                    flexShrink: 0
                  }}
                />
              )
            ) : (
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 1,
                  backgroundColor: 'rgba(0,0,0,0.25)',
                  flexShrink: 0
                }}
              />
            )}
          </div>
        );
      })}
    </>
  );
};
