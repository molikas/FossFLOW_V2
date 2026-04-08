// Derived layer context — computed once per render, consumed by Renderer children.
//
// This is a thin React context (not a Zustand store). It is derived from model
// state and never written to directly. Any component that needs to know whether
// an entity is visible or locked reads from this context rather than re-deriving
// it independently.

import React, { createContext, useContext, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { Layer } from 'src/types';
import { getItemByIdOrThrow } from 'src/utils';

export interface LayerContextValue {
  /** IDs of all canvas entities whose layer is currently visible (or have no layer). */
  visibleIds: ReadonlySet<string>;
  /** IDs of all canvas entities whose layer is currently locked. */
  lockedIds: ReadonlySet<string>;
  /** The ordered layer definitions for the current view. */
  layers: Layer[];
  /** Number of entities assigned to each layer, keyed by layerId. */
  itemCountByLayerId: ReadonlyMap<string, number>;
  /** Number of entities with no layer assigned. */
  unassignedCount: number;
}

const DEFAULT_CONTEXT: LayerContextValue = {
  visibleIds: new Set(),
  lockedIds: new Set(),
  layers: [],
  itemCountByLayerId: new Map(),
  unassignedCount: 0
};

export const LayerContext = createContext<LayerContextValue>(DEFAULT_CONTEXT);

/** Read the current layer context. Use inside any Renderer subtree. */
export const useLayerContext = (): LayerContextValue => useContext(LayerContext);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface LayerContextProviderProps {
  children: React.ReactNode;
}

export const LayerContextProvider = ({ children }: LayerContextProviderProps) => {
  const currentViewId = useUiStateStore((state) => state.view);
  const views = useModelStore((state) => state.views, shallow);

  const value = useMemo<LayerContextValue>(() => {
    if (!currentViewId || !views?.length) {
      return DEFAULT_CONTEXT;
    }

    let currentView;
    try {
      currentView = getItemByIdOrThrow(views, currentViewId).value;
    } catch {
      currentView = views[0];
    }

    if (!currentView) return DEFAULT_CONTEXT;

    const layers: Layer[] = currentView.layers ?? [];

    // Build a fast lookup: layerId → Layer
    const layerById = new Map<string, Layer>(layers.map((l) => [l.id, l]));

    const visibleIds = new Set<string>();
    const lockedIds = new Set<string>();
    const itemCountByLayerId = new Map<string, number>();
    let unassignedCount = 0;

    const processEntity = (entity: { id: string; layerId?: string }) => {
      const layer = entity.layerId ? layerById.get(entity.layerId) : undefined;
      // No layer assigned → always visible, never locked (default layer behaviour)
      if (!layer || layer.visible) visibleIds.add(entity.id);
      if (layer?.locked) lockedIds.add(entity.id);
      if (entity.layerId && layerById.has(entity.layerId)) {
        itemCountByLayerId.set(entity.layerId, (itemCountByLayerId.get(entity.layerId) ?? 0) + 1);
      } else {
        unassignedCount++;
      }
    };

    (currentView.items ?? []).forEach(processEntity);
    (currentView.connectors ?? []).forEach(processEntity);
    (currentView.rectangles ?? []).forEach(processEntity);
    (currentView.textBoxes ?? []).forEach(processEntity);

    return { visibleIds, lockedIds, layers, itemCountByLayerId, unassignedCount };
  }, [currentViewId, views]);

  return React.createElement(LayerContext.Provider, { value }, children);
};
