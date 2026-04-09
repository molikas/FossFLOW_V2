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

export type LayerItemType = 'ITEM' | 'CONNECTOR' | 'RECTANGLE' | 'TEXTBOX';

export interface LayerItem {
  id: string;
  type: LayerItemType;
  name: string;
}

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
  /** Items grouped by layerId. '__unassigned__' key for items with no layer. */
  itemsByLayerId: ReadonlyMap<string, LayerItem[]>;
}

const DEFAULT_CONTEXT: LayerContextValue = {
  visibleIds: new Set(),
  lockedIds: new Set(),
  layers: [],
  itemCountByLayerId: new Map(),
  unassignedCount: 0,
  itemsByLayerId: new Map()
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

/** Strip HTML tags and return first N chars of plain text. */
const stripHtml = (html: string, maxLen = 24): string => {
  return html.replace(/<[^>]*>/g, '').trim().slice(0, maxLen) || '(empty)';
};

export const LayerContextProvider = ({ children }: LayerContextProviderProps) => {
  const currentViewId = useUiStateStore((state) => state.view);
  const views = useModelStore((state) => state.views, shallow);
  const modelItems = useModelStore((state) => state.items, shallow);

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

    // Build a fast lookup: modelItemId → name
    const modelItemNameById = new Map<string, string>(
      (modelItems ?? []).map((m) => [m.id, m.name ?? 'Untitled'])
    );

    const visibleIds = new Set<string>();
    const lockedIds = new Set<string>();
    const itemCountByLayerId = new Map<string, number>();
    const itemsByLayerId = new Map<string, LayerItem[]>();
    let unassignedCount = 0;

    const UNASSIGNED = '__unassigned__';

    const pushToGroup = (key: string, item: LayerItem) => {
      const arr = itemsByLayerId.get(key);
      if (arr) {
        arr.push(item);
      } else {
        itemsByLayerId.set(key, [item]);
      }
    };

    const processEntity = (
      entity: { id: string; layerId?: string; label?: string; content?: string },
      type: LayerItemType,
      nameOverride?: string
    ) => {
      const layer = entity.layerId ? layerById.get(entity.layerId) : undefined;
      if (!layer || layer.visible) visibleIds.add(entity.id);
      if (layer?.locked) lockedIds.add(entity.id);

      const key = entity.layerId && layerById.has(entity.layerId) ? entity.layerId : UNASSIGNED;

      if (key !== UNASSIGNED) {
        itemCountByLayerId.set(key, (itemCountByLayerId.get(key) ?? 0) + 1);
      } else {
        unassignedCount++;
      }

      let name: string;
      if (nameOverride) {
        name = nameOverride;
      } else if (type === 'CONNECTOR') {
        name = (entity as any).label || 'Connector';
      } else if (type === 'RECTANGLE') {
        name = 'Rectangle';
      } else if (type === 'TEXTBOX') {
        name = stripHtml((entity as any).text || '');
      } else {
        name = 'Unknown';
      }

      pushToGroup(key, { id: entity.id, type, name });
    };

    (currentView.items ?? []).forEach((item) => {
      const name = modelItemNameById.get(item.id) ?? 'Untitled';
      processEntity(item, 'ITEM', name);
    });
    (currentView.connectors ?? []).forEach((c) => processEntity(c, 'CONNECTOR'));
    (currentView.rectangles ?? []).forEach((r) => processEntity(r, 'RECTANGLE'));
    (currentView.textBoxes ?? []).forEach((t) => processEntity(t, 'TEXTBOX'));

    return { visibleIds, lockedIds, layers, itemCountByLayerId, unassignedCount, itemsByLayerId };
  }, [currentViewId, views, modelItems]);

  return React.createElement(LayerContext.Provider, { value }, children);
};
