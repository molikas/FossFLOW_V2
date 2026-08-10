import React, { memo, useMemo } from 'react';
import { Connector } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { makeInteractableCheck } from 'src/utils/selectableRefs';
import { ConnectorLabel } from './ConnectorLabel';

interface Props {
  connectors: Connector[];
}

// Below this zoom, connector labels are unreadable — and, at scale, a per-frame
// DOM composite cost (measured: the residual pan wall once connector/rectangle
// bodies moved to the GPU). Mirror the node-label canvas LOD (LABEL_LOD_ZOOM):
// hide them when zoomed out (unless readable-labels is on), keeping only the
// SELECTED connector's labels live for F2 / inline-edit.
const CONNECTOR_LABEL_LOD_ZOOM = 0.25;
const NO_CONNECTORS: Connector[] = [];

export const ConnectorLabels = memo(({ connectors }: Props) => {
  // The selected connector is always mounted, even with zero labels, so its F2
  // handler ("add a new label + inline-edit it", ADR 0032 connector amendment)
  // is live before the first label exists. Without this, a fresh connector had
  // no ConnectorLabel mounted and F2 was a no-op.
  const selectedConnectorId = useUiStateStore((s) =>
    s.itemControls?.type === 'CONNECTOR' ? s.itemControls.id : null
  );
  // A boolean selector — re-renders only when it FLIPS across the LOD zoom (or
  // readable-labels toggles), never per pan frame.
  const zoomReadable = useUiStateStore(
    (s) => s.readableLabels || s.zoom >= CONNECTOR_LABEL_LOD_ZOOM
  );
  const labelsReadable = zoomReadable;

  // R4/RND-02: this layer had NO layer filter, so hiding a layer left its
  // connectors' label chips floating on the canvas over nothing — the wire
  // disappeared and its labels did not. Every other Renderer child gates on the
  // same `layers.length === 0 || visibleIds.has(id)` rule; this one was added
  // later and skipped it by omission, which is exactly the class ADR 0047 §3
  // names ("layer visible/locked filter re-application in new paint/affordance
  // layers") and what `layerFilter.contract.test.ts` now enumerates.
  //
  // Locked is NOT filtered — a locked connector's label still DRAWS, it just
  // cannot be edited. Hidden and locked are different verdicts (see
  // TransformControlsManager, which owes them different answers for the same
  // reason).
  const { visibleIds, layers } = useLayerContext();
  const isVisible = useMemo(
    () => makeInteractableCheck(new Set<string>(), visibleIds, layers.length > 0),
    [visibleIds, layers.length]
  );

  const labelledConnectors = useMemo(() => {
    const base = connectors.filter((connector) =>
      Boolean(
        isVisible(connector.id) &&
        (connector.id === selectedConnectorId ||
        (connector.name?.trim() && connector.showLabel !== false) ||
        connector.description ||
        connector.startLabel ||
        connector.endLabel ||
        (connector.labels && connector.labels.length > 0))
      )
    );
    if (labelsReadable) return base;
    // LOD: only the selected connector keeps its labels mounted when zoomed out.
    return selectedConnectorId
      ? base.filter((c) => c.id === selectedConnectorId)
      : NO_CONNECTORS;
  }, [connectors, selectedConnectorId, labelsReadable, isVisible]);

  return (
    <>
      {labelledConnectors.map((connector) => (
        <ConnectorLabel key={connector.id} connector={connector} />
      ))}
    </>
  );
});
