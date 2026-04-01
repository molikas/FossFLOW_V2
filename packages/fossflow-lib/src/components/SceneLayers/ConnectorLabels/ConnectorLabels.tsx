import React, { memo, useMemo } from 'react';
import { Connector } from 'src/types';
import { ConnectorLabel } from './ConnectorLabel';

interface Props {
  connectors: Connector[];
}

export const ConnectorLabels = memo(({ connectors }: Props) => {
  const labelledConnectors = useMemo(
    () =>
      connectors.filter((connector) =>
        Boolean(
          connector.description ||
            connector.startLabel ||
            connector.endLabel ||
            (connector.labels && connector.labels.length > 0)
        )
      ),
    [connectors]
  );

  return (
    <>
      {labelledConnectors.map((connector) => (
        <ConnectorLabel key={connector.id} connector={connector} />
      ))}
    </>
  );
});
