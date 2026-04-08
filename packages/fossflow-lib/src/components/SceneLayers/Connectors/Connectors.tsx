import React, { useMemo, memo } from 'react';
import { Connector as ConnectorType } from 'src/types';
import type { useScene } from 'src/hooks/useScene';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { Connector } from './Connector';

interface Props {
  connectors: ConnectorType[];
  currentView: ReturnType<typeof useScene>['currentView'];
}

export const Connectors = memo(({ connectors, currentView }: Props) => {
  const { visibleIds } = useLayerContext();

  const visibleConnectors = useMemo(() => {
    const filtered = connectors.filter(
      (c) => visibleIds.size === 0 || visibleIds.has(c.id)
    );
    return [...filtered].reverse();
  }, [connectors, visibleIds]);

  return (
    <>
      {visibleConnectors.map((connector) => (
        <Connector
          key={connector.id}
          connector={connector}
          currentView={currentView}
        />
      ))}
    </>
  );
});
