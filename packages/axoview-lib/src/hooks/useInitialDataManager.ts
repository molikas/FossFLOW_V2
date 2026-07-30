import { useCallback, useState } from 'react';
import { InitialData, IconCollectionState } from 'src/types';
import type { LoadOptions } from 'src/types/axoviewProps';
import {
  INITIAL_DATA,
  INITIAL_SCENE_STATE,
  INITIAL_UI_STATE
} from 'src/config';
import {
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
import { mergeBundledFixtures } from 'src/utils/leanSave';
import { sanitizeHtml } from 'src/utils/sanitizeHtml';
import { foldNodeDescription } from 'src/utils/foldNodeDescription';
import { seedNodeLabel } from 'src/utils/seedNodeLabel';
import { seedConnectorLabel } from 'src/utils/seedConnectorLabel';
import { foldTextBoxStyleFlags } from 'src/utils/foldTextBoxStyleFlags';
import { normalizeQuillHtmlSpaces } from 'src/utils/richTextTransform';
import {
  repairModelIdentity,
  isCleanRepair,
  describeRepair
} from 'src/utils/repairModel';

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
        // Treated as Record<string, unknown> during normalisation; modelSchema
        // re-types the result below.
        type RawObject = Record<string, unknown>;
        const isObj = (v: unknown): v is RawObject =>
          typeof v === 'object' && v !== null;
        const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

        const rawData: RawObject = { ..._initialData };

        rawData.views = asArray(rawData.views).map((view) => {
          // Normalise: some diagrams use 'title' instead of 'name' for views
          const normView: RawObject = { ...(isObj(view) ? view : {}) };
          if (!normView.name && typeof normView.title === 'string') {
            normView.name = normView.title;
          }

          // ADR 0029 (defense-in-depth): sanitize text-box rich text once on the
          // way in, so an imported/shared diagram can't carry a stored-XSS
          // payload into the TextBox dangerouslySetInnerHTML sink. The sink
          // re-sanitizes at render too; cleaning here also keeps the stored and
          // exported model clean.
          // ADR 0034 §4: first fold the legacy element-level isBold/isItalic/
          // isUnderline flags into the content HTML (content is the single
          // formatting layer now — the renderer no longer reads the flags),
          // normalize Quill's &nbsp;-for-space serialization back to real
          // spaces (legacy content must gain wrap opportunities too — the
          // manual-width addendum), then sanitize the result. Idempotent,
          // mirrors seedConnectorLabel.
          if (Array.isArray(normView.textBoxes)) {
            normView.textBoxes = normView.textBoxes.map((tb) => {
              if (!isObj(tb)) return tb;
              const folded = foldTextBoxStyleFlags(tb);
              return typeof folded.content === 'string'
                ? {
                    ...folded,
                    content: sanitizeHtml(
                      normalizeQuillHtmlSpaces(folded.content)
                    )
                  }
                : folded;
            });
          }

          if (!normView.connectors) return normView;

          const itemIds = new Set(
            asArray(normView.items)
              .filter(isObj)
              .map((item) => item.id)
              .filter((v): v is string => typeof v === 'string')
          );

          const validConnectors = asArray(normView.connectors)
            .filter(isObj)
            .filter((connector) => {
              const hasValidAnchors = asArray(connector.anchors)
                .filter(isObj)
                .every((anchor) => {
                  // Reject anchors with empty refs (can happen from a broken paste operation)
                  const ref = isObj(anchor.ref) ? anchor.ref : {};
                  const refKeys = Object.keys(ref);
                  if (refKeys.length === 0) return false;
                  if (typeof ref.item === 'string') {
                    return itemIds.has(ref.item);
                  }
                  return true;
                });

              if (!hasValidAnchors) {
                console.warn(
                  `Removing connector ${String(connector.id)} due to invalid item references`
                );
              }

              return hasValidAnchors;
            })
            // ADR 0032 connector amendment (2026-07-02): fold each existing
            // connector's identity `name` into a labels[] entry (idempotent via
            // the nameSeeded marker) so the name↔label decouple keeps saved
            // diagrams' visible text. Mirrors the node seedNodeLabel pass.
            .map(seedConnectorLabel);

          return { ...normView, connectors: validConnectors };
        });

        // Option A migration (name/caption/label model): a node's rich
        // `description` was the on-canvas "caption" — a second text competing
        // with the name. It now folds into `notes` (the canvas shows only the
        // name). Doing it here, on the way in and before save-tracking's load
        // baseline, means existing diagrams don't lose the content and the
        // stored/exported model converges on the new shape without dirtying the
        // doc. See foldNodeDescription (ADR 0032): idempotent, block-separated,
        // `description` dropped after fold (kept in schema for round-trip).
        // ADR 0032 amendment (2026-06-30): the on-canvas text is now `label`,
        // decoupled from the identity `name`. Seed `label = name` for saved
        // nodes (idempotent) so existing diagrams keep their visible text and a
        // later Layers rename of `name` doesn't move the canvas label.
        rawData.items = asArray(rawData.items)
          .map(foldNodeDescription)
          .map(seedNodeLabel);

        // Identity & range repair (owner ruling 2026-07-30: repair, don't
        // reject). Duplicate ids, dangling layer refs and non-finite/absurd
        // coordinates all pass the schema today, so files carrying them exist;
        // making them schema errors here would stop those files opening, which
        // is the E4/CLIP-02 harm. Repair, then tell the user what changed — a
        // silent rewrite of their document is its own failure (ADR 0011).
        const repaired = repairModelIdentity(rawData);
        Object.assign(rawData, repaired.data);
        if (!isCleanRepair(repaired.report)) {
          console.warn(
            '[useInitialDataManager] repaired the loaded model:',
            repaired.report
          );
          uiStateActions.setNotification({
            severity: 'warning',
            message: `Repaired this diagram on load — ${describeRepair(repaired.report)}. Save to keep the repair.`
          });
        }

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

          // Per UX §6.3 — surface validation failures to the user, not just devtools.
          const summary = validationResult.error.issues
            .slice(0, 2)
            .map((issue) => {
              const path = issue.path.length ? issue.path.join('.') : '(root)';
              return `${path}: ${issue.message}`;
            })
            .join('; ');

          uiStateActions.setNotification({
            severity: 'error',
            message: `Could not load diagram: ${summary || 'unknown validation error'}`
          });

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

        // ADR 0002: union bundled fixtures into the model's icons before storing,
        // so the side dock always has the full catalog regardless of what was saved.
        const merged = mergeBundledFixtures(initialData);

        modelActions.set(merged, true);
        modelActions.clearHistory();

        // Reset scroll/zoom for a clean slate on each load, unless the caller
        // explicitly preserves the current viewport (e.g. icon-pack updates).
        // Selection is reset on the same condition — selectedIds carried over
        // from the previous diagram point at items that no longer exist in
        // the new model, leaving the properties panel "open but blank" instead
        // of showing the no-selection placeholder.
        if (!options?.preserveViewport) {
          uiStateActions.setScroll({
            position: CoordsUtils.zero(),
            offset: CoordsUtils.zero()
          });
          uiStateActions.setZoom(INITIAL_UI_STATE.zoom);
          uiStateActions.setSelectedIds([]);
        }

        const activeViewId = uiStateStoreApi.getState().view;
        const targetViewId =
          merged.view ??
          (activeViewId && merged.views.some((v) => v.id === activeViewId)
            ? activeViewId
            : merged.views[0].id);
        const view = getItemByIdOrThrow(merged.views, targetViewId);

        changeView(view.value.id, merged);

        // Fit-to-view on open — routed through a deferred flag rather than
        // applied here. On FIRST mount the Renderer isn't in the tree yet
        // (Axoview renders null until isReady, which `load` only sets at its
        // end), so rendererEl is null/0-sized and a fit computed now yields
        // zoom 0. The effect in Renderer applies it once rendererSize is known,
        // using the mode-aware getTilePosition (correct 2D centring — the util's
        // default is isometric-only). `fitToScreen` is the app-facing alias.
        // Skipped on preserveViewport reloads (icon-pack swaps) so they don't
        // re-centre; cleared otherwise so a stale request can't fire later.
        // Only fit when there is CONTENT to frame. Fitting an empty diagram to
        // its padding-only bounds just maxes the zoom (jarring on a blank canvas,
        // and it disables the zoom-in control). Mirror getProjectBounds' content
        // set (items / connectors / rectangles / text boxes).
        const v = view.value;
        const hasContent =
          (v.items?.length ?? 0) > 0 ||
          (v.connectors?.length ?? 0) > 0 ||
          (v.rectangles?.length ?? 0) > 0 ||
          (v.textBoxes?.length ?? 0) > 0;
        const wantsFit =
          Boolean(merged.fitToView || merged.fitToScreen) &&
          !options?.preserveViewport &&
          hasContent;
        uiStateActions.setPendingFitToView(wantsFit);

        // Build the new categories list from the incoming icons.
        // Two regimes:
        //  - First load (existingCategoriesState empty): apply the size guard so
        //    bulk-imported large packs (Material, AWS) don't auto-render thousands
        //    of icons on first paint.
        //  - Incremental load (user toggled a pack, swapped a diagram): user is
        //    actively waiting on the result — auto-expand every new collection,
        //    and mark it freshly-loaded so the header gets a soft pulse. The
        //    PREVIEW_COUNT cap in IconCollection keeps the render bounded.
        const existingCategoriesState = uiStateStoreApi.getState().iconCategoriesState ?? [];
        const existingById = new Map(existingCategoriesState.map((c) => [c.id, c]));
        const isIncrementalLoad = existingCategoriesState.length > 0;

        const freshlyLoadedIds: string[] = [];

        const categoriesState: IconCollectionState[] = categoriseIcons(
          merged.icons
        ).map((collection) => {
          const existing = existingById.get(collection.name ?? '');
          if (existing) {
            return { id: collection.name, isExpanded: existing.isExpanded };
          }
          if (isIncrementalLoad && collection.name) {
            freshlyLoadedIds.push(collection.name);
          }
          return {
            id: collection.name,
            isExpanded: isIncrementalLoad
              ? true
              : collection.icons.length <= LARGE_PACK_THRESHOLD
          };
        });

        uiStateActions.setIconCategoriesState(categoriesState);
        uiStateActions.setFreshlyLoadedCategoryIds(freshlyLoadedIds);

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
