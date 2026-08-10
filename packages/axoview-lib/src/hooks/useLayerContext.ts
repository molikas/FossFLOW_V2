// Derived layer context — computed once per render, consumed by Renderer children.
//
// This is a thin React context (not a Zustand store). It is derived from model
// state and never written to directly. Any component that needs to know whether
// an entity is visible or locked reads from this context rather than re-deriving
// it independently.

import React, { createContext, useContext, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useModelStore } from 'src/stores/modelStore';
import {
  useUiStateStore,
  useUiStateStoreApi
} from 'src/stores/uiStateStore';
import { Layer, ViewItem, Connector, Rectangle, TextBox, Label } from 'src/types';
import { getItemByIdOrThrow } from 'src/utils';
import { isEntityVisibleInPreview } from 'src/utils/previewLayerVisibility';
import { stripHtmlTags } from 'src/utils/stripHtml';
import { dropUninteractableRefs } from 'src/utils/selectableRefs';

export type LayerItemType =
  | 'ITEM'
  | 'CONNECTOR'
  | 'RECTANGLE'
  | 'TEXTBOX'
  | 'LABEL';

export interface LayerItem {
  id: string;
  type: LayerItemType;
  name: string;
  iconUrl?: string;
  showLabel?: boolean;
}

export interface LayerContextValue {
  /** IDs of all canvas entities whose layer is currently visible (or have no layer). */
  visibleIds: ReadonlySet<string>;
  /** IDs of all canvas entities whose layer is currently locked. */
  lockedIds: ReadonlySet<string>;
  /**
   * Every id that can legitimately appear in a selection ref for the current
   * view — all entity ids plus connector anchor (waypoint) ids. The
   * invalidation effect below prunes `selectedIds`/`itemControls` against it
   * (E1/HIST-13, E4/CLIP-08).
   */
  liveIds: ReadonlySet<string>;
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
  liveIds: new Set(),
  layers: [],
  itemCountByLayerId: new Map(),
  unassignedCount: 0,
  itemsByLayerId: new Map()
};

export const LayerContext = createContext<LayerContextValue>(DEFAULT_CONTEXT);

/** Read the current layer context. Use inside any Renderer subtree. */
export const useLayerContext = (): LayerContextValue =>
  useContext(LayerContext);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface LayerContextProviderProps {
  children: React.ReactNode;
}

/** Strip HTML tags and return first N chars of plain text. */
const stripHtml = (html: string, maxLen = 24): string => {
  return stripHtmlTags(html).trim().slice(0, maxLen) || '(empty)';
};

export const LayerContextProvider = ({
  children
}: LayerContextProviderProps) => {
  const currentViewId = useUiStateStore((state) => state.view);
  const editorMode = useUiStateStore((state) => state.editorMode);
  const previewLayerOverrides = useUiStateStore(
    (state) => state.previewLayerOverrides
  );
  const views = useModelStore((state) => state.views, shallow);
  const modelItems = useModelStore((state) => state.items, shallow);
  const icons = useModelStore((state) => state.icons, shallow);

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

    // Build lookup: iconId → url
    const iconUrlById = new Map<string, string>(
      (icons ?? []).map((ic) => [ic.id, ic.url])
    );

    // Build lookup: modelItemId → iconUrl
    const itemIconUrlById = new Map<string, string>();
    for (const m of modelItems ?? []) {
      if (m.icon) {
        const url = iconUrlById.get(m.icon);
        if (url) itemIconUrlById.set(m.id, url);
      }
    }

    const visibleIds = new Set<string>();
    const lockedIds = new Set<string>();
    const liveIds = new Set<string>();
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

    type Entity = ViewItem | Connector | Rectangle | TextBox | Label;

    const inPreview = editorMode === 'EXPLORABLE_READONLY';

    const processEntity = (
      entity: Entity,
      type: LayerItemType,
      nameOverride?: string
    ) => {
      liveIds.add(entity.id);
      if (type === 'CONNECTOR') {
        // Waypoint (CONNECTOR_ANCHOR) selection refs resolve by anchor id.
        ((entity as Connector).anchors ?? []).forEach((a) => liveIds.add(a.id));
      }
      const layer = entity.layerId ? layerById.get(entity.layerId) : undefined;
      // Base model visibility — authoritative in EDITABLE. In preview the
      // UI-only override (solo wins; else base minus hidden) takes over,
      // never touching `layer.visible`. (ADR 0013 precedence rule.)
      const baseVisible = !layer || layer.visible;
      const visible = inPreview
        ? isEntityVisibleInPreview(
            entity.layerId,
            baseVisible,
            previewLayerOverrides
          )
        : baseVisible;
      if (visible) visibleIds.add(entity.id);
      if (layer?.locked) lockedIds.add(entity.id);

      const key =
        entity.layerId && layerById.has(entity.layerId)
          ? entity.layerId
          : UNASSIGNED;

      if (key !== UNASSIGNED) {
        itemCountByLayerId.set(key, (itemCountByLayerId.get(key) ?? 0) + 1);
      } else {
        unassignedCount++;
      }

      let name: string;
      if (nameOverride) {
        name = nameOverride;
      } else if (type === 'CONNECTOR') {
        const c = entity as Connector;
        // Derive-then-override (Option A): the connector's primary `name` is the
        // identity, but when it's unset fall back to its FIRST visible label so a
        // labels[]-only connector still reads meaningfully here. The old
        // derivation ignored labels[] and surfaced only the legacy `description`,
        // so a modern labels[]-only connector showed the literal 'Connector'.
        const firstLabelText = c.labels
          ?.find((l) => l.text && l.text.trim())
          ?.text?.trim();
        name =
          c.name?.trim() || firstLabelText || c.description?.trim() || 'Connector';
      } else if (type === 'RECTANGLE') {
        const r = entity as Rectangle;
        name = r.name?.trim() || 'Rectangle';
      } else if (type === 'TEXTBOX') {
        const tb = entity as TextBox;
        name = tb.name?.trim() || stripHtml(tb.content || '');
      } else if (type === 'LABEL') {
        const l = entity as Label;
        name = l.text?.trim() || '(empty)';
      } else {
        name = 'Unknown';
      }

      const iconUrl = type === 'ITEM' ? itemIconUrlById.get(entity.id) : undefined;
      const showLabel =
        type === 'ITEM' ? (entity as ViewItem).showLabel : undefined;
      pushToGroup(key, { id: entity.id, type, name, iconUrl, showLabel });
    };

    (currentView.items ?? []).forEach((item) => {
      const name = modelItemNameById.get(item.id) ?? 'Untitled';
      processEntity(item, 'ITEM', name);
    });
    (currentView.connectors ?? []).forEach((c) =>
      processEntity(c, 'CONNECTOR')
    );
    (currentView.rectangles ?? []).forEach((r) =>
      processEntity(r, 'RECTANGLE')
    );
    (currentView.textBoxes ?? []).forEach((t) => processEntity(t, 'TEXTBOX'));
    (currentView.labels ?? []).forEach((l) => processEntity(l, 'LABEL'));

    return {
      visibleIds,
      lockedIds,
      liveIds,
      layers,
      itemCountByLayerId,
      unassignedCount,
      itemsByLayerId
    };
  }, [
    currentViewId,
    views,
    modelItems,
    icons,
    editorMode,
    previewLayerOverrides
  ]);

  // E2/RED-15 — the invalidation step the acquisition guards never had a twin
  // for. `selectedIds` may only contain interactable refs (ADR 0006 §3 /
  // canvas-interaction I-1), and every acquisition path filters through
  // `makeInteractableCheck` — but a selection that was legal when it was made
  // stayed in the store after its layer was hidden or locked. Delete then
  // removed items the user could no longer see, and a group drag moved
  // entities the panel presented as locked.
  //
  // This is the one place that sees every input to that verdict (the layer
  // rows, the preview overrides, the entity→layer assignment), so it is where
  // the re-check belongs. Layer state lives in the model and selection in
  // ui-state with no subscription between them; this effect IS that
  // subscription.
  const uiStoreApi = useUiStateStoreApi();
  React.useEffect(() => {
    const {
      selectedIds,
      itemControls,
      previewLayerOverrides: overrides,
      actions
    } = uiStoreApi.getState();

    // E1/HIST-13 / E4/CLIP-08 (mop-up 2026-08-10): the invalidation must also
    // drop refs whose ENTITY is gone — a delete, an undo/redo of one, or a
    // model swap under preserveViewport left the selection naming ids that no
    // longer resolve (INV-2), and the next selection-routed action (a style
    // write, a nudge, a second Delete) hit `getItemByIdOrThrow`. Same rule for
    // the properties-panel target: a dead id there rendered the panel "open
    // but blank". This effect fires on every model change (its deps include
    // `views`), so it is the one subscription between the two stores.
    if (selectedIds.length > 0) {
      const alive = selectedIds.filter((r) => value.liveIds.has(r.id));
      const { refs, dropped } = dropUninteractableRefs(
        alive,
        value.lockedIds,
        value.visibleIds,
        value.layers.length > 0
      );
      if (dropped > 0 || alive.length !== selectedIds.length) {
        actions.setSelectedIds(refs);
      }
    }
    if (
      itemControls &&
      itemControls.type !== 'ADD_ITEM' &&
      'id' in itemControls &&
      typeof itemControls.id === 'string' &&
      !value.liveIds.has(itemControls.id)
    ) {
      actions.setItemControls(null);
    }

    // E4/CLIP-09: a preview override naming a layer that no longer exists.
    // Solo is the harmful one — `isEntityVisibleInPreview` shows ONLY the
    // solo'd layer's entities, so a dead solo id blanked the whole canvas
    // until a page switch. (`setPreviewSoloLayer` is a toggle: passing the
    // current id clears it.) Dead hidden ids are pruned for hygiene.
    const layerIdSet = new Set(value.layers.map((l) => l.id));
    if (overrides.soloLayerId && !layerIdSet.has(overrides.soloLayerId)) {
      actions.setPreviewSoloLayer(overrides.soloLayerId);
    } else {
      overrides.hiddenLayerIds
        .filter((id) => !layerIdSet.has(id))
        .forEach((id) => actions.togglePreviewLayerHidden(id));
    }
  }, [value, uiStoreApi]);

  return React.createElement(LayerContext.Provider, { value }, children);
};
