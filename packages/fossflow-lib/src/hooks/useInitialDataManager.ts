import { useCallback, useState } from 'react';
import { InitialData, IconCollectionState } from 'src/types';
import type { LoadOptions } from 'src/types/isoflowProps';
import {
  INITIAL_DATA,
  INITIAL_SCENE_STATE,
  INITIAL_UI_STATE
} from 'src/config';
import {
  getFitToViewParams,
  CoordsUtils,
  categoriseIcons,
  generateId,
  getItemByIdOrThrow
} from 'src/utils';
import * as reducers from 'src/stores/reducers';
import { useModelStore } from 'src/stores/modelStore';
import { useView } from 'src/hooks/useView';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { modelSchema } from 'src/schemas/model';

// Must match the threshold in IconCollection.tsx so newly-loaded large packs
// (e.g. Material Icons) are not auto-expanded (which would freeze the browser).
const LARGE_PACK_THRESHOLD = 100;

export const useInitialDataManager = () => {
  const [isReady, setIsReady] = useState(false);
  const modelActions = useModelStore((state) => state.actions);
  const modelIcons = useModelStore((state) => state.icons);
  const modelColors = useModelStore((state) => state.colors);
  const uiStateActions = useUiStateStore((state) => state.actions);
  const { changeView } = useView();
  const uiStateStoreApi = useUiStateStoreApi();

  const load = useCallback(
    (_initialData: InitialData, options?: LoadOptions) => {
      if (!_initialData) return;

      setIsReady(false);

      try {
        // Normalise and clean up data before validation.
        // Work on a plain-object copy so we can safely mutate without TS complaints.
        const rawData: Record<string, any> = { ..._initialData };

        rawData.views = ((rawData.views ?? []) as any[]).map((view: any) => {
          // Normalise: some diagrams use 'title' instead of 'name' for views
          const normView: any = { ...view };
          if (!normView.name && normView.title) {
            normView.name = normView.title;
          }

          if (!normView.connectors) return normView;

          const validConnectors = (normView.connectors as any[]).filter(
            (connector: any) => {
              const hasValidAnchors = (connector.anchors as any[]).every(
                (anchor: any) => {
                  // Reject anchors with empty refs (can happen from a broken paste operation)
                  const refKeys = Object.keys(anchor.ref ?? {});
                  if (refKeys.length === 0) return false;
                  if (anchor.ref.item) {
                    return (normView.items as any[]).some(
                      (item: any) => item.id === anchor.ref.item
                    );
                  }
                  return true;
                }
              );

              if (!hasValidAnchors) {
                console.warn(
                  `Removing connector ${connector.id} due to invalid item references`
                );
              }

              return hasValidAnchors;
            }
          );

          return { ...normView, connectors: validConnectors };
        });

        // Re-type after normalisation — Zod will validate the structure next
        const initialData = rawData as unknown as typeof _initialData;

        // Validate
        const validationResult = modelSchema.safeParse(initialData);

        if (!validationResult.success) {
          console.error(
            '[useInitialDataManager] Model validation failed:',
            validationResult.error.issues
          );
          console.error(
            '[useInitialDataManager] Validation error detail:',
            JSON.stringify(validationResult.error.issues, null, 2)
          );
          setIsReady(false);
          return;
        }

        if (initialData.views.length === 0) {
          const updates = reducers.view({
            action: 'CREATE_VIEW',
            payload: {},
            ctx: {
              state: { model: initialData, scene: INITIAL_SCENE_STATE },
              viewId: generateId()
            }
          });

          Object.assign(initialData, updates.model);
        }

        modelActions.set(initialData, true);
        modelActions.clearHistory();

        // Reset scroll/zoom for a clean slate on each load, unless the caller
        // explicitly preserves the current viewport (e.g. icon-pack updates).
        if (!options?.preserveViewport) {
          uiStateActions.setScroll({
            position: CoordsUtils.zero(),
            offset: CoordsUtils.zero()
          });
          uiStateActions.setZoom(INITIAL_UI_STATE.zoom);
        }

        const activeViewId = uiStateStoreApi.getState().view;
        const targetViewId =
          initialData.view ??
          (activeViewId && initialData.views.some((v) => v.id === activeViewId)
            ? activeViewId
            : initialData.views[0].id);
        const view = getItemByIdOrThrow(initialData.views, targetViewId);

        changeView(view.value.id, initialData);

        if (initialData.fitToView) {
          const rendererEl = uiStateStoreApi.getState().rendererEl;
          const rendererSize = rendererEl?.getBoundingClientRect();

          const { zoom, scroll } = getFitToViewParams(view.value, {
            width: rendererSize?.width ?? 0,
            height: rendererSize?.height ?? 0
          });

          uiStateActions.setScroll({
            position: scroll,
            offset: CoordsUtils.zero()
          });

          uiStateActions.setZoom(zoom);
        }

        // Build the new categories list from the incoming icons.
        // Preserve `isExpanded` for collections that were already in the UI
        // (so expanded sections survive icon-pack reloads).
        // Auto-expand any newly-introduced collection so freshly loaded packs
        // are immediately visible without the user having to click the header.
        const existingCategoriesState = uiStateStoreApi.getState().iconCategoriesState ?? [];
        const existingById = new Map(existingCategoriesState.map((c) => [c.id, c]));

        const categoriesState: IconCollectionState[] = categoriseIcons(
          initialData.icons
        ).map((collection) => {
          const existing = existingById.get(collection.name ?? '');
          return {
            id: collection.name,
            // New collection → auto-expand (unless it's a large pack, to
            // avoid rendering thousands of icons automatically).
            // Existing collection → preserve user's current expanded state.
            isExpanded: existing
              ? existing.isExpanded
              : collection.icons.length <= LARGE_PACK_THRESHOLD
          };
        });

        uiStateActions.setIconCategoriesState(categoriesState);

        setIsReady(true);
      } catch (err) {
        console.error('[useInitialDataManager] load threw unexpectedly:', err);
        setIsReady(false);
      }
    },
    [changeView, modelActions, uiStateActions, uiStateStoreApi]
  );

  const clear = useCallback(() => {
    load({ ...INITIAL_DATA, icons: modelIcons, colors: modelColors });
    uiStateActions.resetUiState();
  }, [load, modelIcons, modelColors, uiStateActions]);

  return {
    load,
    clear,
    isReady
  };
};
