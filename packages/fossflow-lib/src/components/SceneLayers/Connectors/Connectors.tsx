import React, { useMemo, memo } from 'react';
import { Connector as ConnectorType } from 'src/types';
import type { useScene } from 'src/hooks/useScene';
import { Connector } from './Connector';

interface Props {
  connectors: ConnectorType[];
  currentView: ReturnType<typeof useScene>['currentView'];
}

export const Connectors = memo(({ connectors, currentView }: Props) => {
  const reversedConnectors = useMemo(() => [...connectors].reverse(), [connectors]);

  return (
    <>
      {reversedConnectors.map((connector) => (
        <Connector
          key={connector.id}
          connector={connector}
          currentView={currentView}
        />
      ))}
    </>
  );
});
