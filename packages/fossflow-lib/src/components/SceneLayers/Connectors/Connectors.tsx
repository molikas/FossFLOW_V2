import React, { useMemo, memo } from 'react';
import { Connector as ConnectorType } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import type { useScene } from 'src/hooks/useScene';
import { Connector } from './Connector';

interface Props {
  connectors: ConnectorType[];
  currentView: ReturnType<typeof useScene>['currentView'];
}

export const Connectors = memo(({ connectors, currentView }: Props) => {
  const itemControls = useUiStateStore((state) => state.itemControls);
  const mode = useUiStateStore((state) => state.mode);

  const selectedConnectorId = useMemo(() => {
    if (mode.type === 'CONNECTOR') return mode.id;
    if (itemControls?.type === 'CONNECTOR') return itemControls.id;
    return null;
  }, [mode, itemControls]);

  const reversedConnectors = useMemo(() => [...connectors].reverse(), [connectors]);

  return (
    <>
      {reversedConnectors.map((connector) => (
        <Connector
          key={connector.id}
          connector={connector}
          currentView={currentView}
          isSelected={selectedConnectorId === connector.id}
        />
      ))}
    </>
  );
});
