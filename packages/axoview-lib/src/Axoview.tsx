import React, {
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle
} from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Box } from '@mui/material';
import { shallow } from 'zustand/shallow';
import { theme } from 'src/styles/theme';
import { AxoviewProps, AxoviewRef } from 'src/types';
import { setWindowCursor, modelFromModelStore } from 'src/utils';
import {
  useModelStore,
  ModelProvider,
  useModelStoreApi
} from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { LocaleProvider } from 'src/stores/localeStore';
import { GlobalStyles } from 'src/styles/GlobalStyles';
import { Renderer } from 'src/components/Renderer/Renderer';
import { UiOverlay } from 'src/components/UiOverlay/UiOverlay';
import {
  UiStateProvider,
  useUiStateStore,
  useUiStateStoreApi
} from 'src/stores/uiStateStore';
import { INITIAL_DATA } from 'src/config';
import {
  savePersistedSettings,
  loadPersistedSettings,
  persistableSettingsFor
} from 'src/config/persistedSettings';
import { useInitialDataManager } from 'src/hooks/useInitialDataManager';
import { useView } from 'src/hooks/useView';
import { useDirtyTracker } from 'src/hooks/useDirtyTracker';
import { ClipboardProvider } from 'src/clipboard/ClipboardContext';
import { LayerContextProvider } from 'src/hooks/useLayerContext';
import { CanvasModeProvider } from 'src/contexts/CanvasModeContext';
import { LeftDock } from 'src/components/LeftDock/LeftDock';
import { RightSidebar } from 'src/components/RightSidebar';
import { BottomDock } from 'src/components/BottomDock/BottomDock';
import enUS from 'src/i18n/en-US';

// Dock/sidebar slots — rendered inside the LayerContextProvider so they have full store access.
const LeftDockSlot = ({
  fileExplorerOpen,
  onFileExplorerToggle,
  disableWorkingTabs
}: {
  fileExplorerOpen?: boolean;
  onFileExplorerToggle?: () => void;
  disableWorkingTabs?: boolean;
}) => (
  <LeftDock
    fileExplorerOpen={fileExplorerOpen}
    onFileExplorerToggle={onFileExplorerToggle}
    disableWorkingTabs={disableWorkingTabs}
  />
);

const RightSidebarSlot = ({ editorMode }: { editorMode: string }) => {
  const open = useUiStateStore((s) => s.rightSidebarOpen);
  return <RightSidebar open={open} editorMode={editorMode} />;
};

const BottomDockSlot = ({ endSlot }: { endSlot?: React.ReactNode }) => (
  <BottomDock endSlot={endSlot} />
);

const App = forwardRef<AxoviewRef, AxoviewProps>(
  (
    {
      initialData,
      width = '100%',
      height = '100%',
      onModelUpdated,
      enableDebugTools = false,
      exposeStoreBridge = false,
      editorMode = 'EDITABLE',
      renderer,
      iconPackManager,
      iconUsageScan,
      linkedDiagrams,
      toolbarPortalTarget,
      sidebarTogglePortalTarget,
      styleControlsPortalTarget,
      languageSelector,
      bottomDockEnd,
      suppressOnboardingHints,
      fileExplorerOpen,
      onFileExplorerToggle,
      disableLeftDockWorkingTabs,
      /** @deprecated use toolbarPortalTarget */
      menuPortalTarget
    },
    ref
  ) => {
    const portalTarget = toolbarPortalTarget ?? menuPortalTarget;
    const uiStateActions = useUiStateStore((state) => {
      return state.actions;
    });
    // View-only "hide all controls" — also drops the bottom dock for a clean
    // screenshot. Only ever true in EXPLORABLE_READONLY (cleared on mode switch).
    const hideViewControls = useUiStateStore((state) => state.hideViewControls);
    const persistableSettings = useUiStateStore(
      (state) => ({
        zoomSettings: state.zoomSettings,
        labelSettings: state.labelSettings,
        connectorInteractionMode: state.connectorInteractionMode,
        expandLabels: state.expandLabels,
        readableLabels: state.readableLabels,
        canvasMode: state.canvasMode,
        snapToGrid: state.snapToGrid
      }),
      shallow
    );
    const initialDataManager = useInitialDataManager();
    // Use shallow equality so that history-only store writes (saveToHistory updating
    // history.past) do not produce a new model reference and fire onModelUpdated.
    // Without this, every user action triggers onModelUpdated twice: once for the
    // actual change and once for the preceding saveToHistory call.
    const model = useModelStore((state) => modelFromModelStore(state), shallow);

    // Expose Zustand store instances for Playwright e2e tests AND the
    // DiagnosticsOverlay (which needs them to populate ni/nc/ntb scene counts
    // in non-production builds). The `NODE_ENV !== 'production'` literal lets
    // the bundler tree-shake the whole block out of prod builds; in prod the
    // bridge only appears when the consumer explicitly opts in via
    // `enableDebugTools`.
    const uiStore = useUiStateStoreApi();
    const modelStore = useModelStoreApi();
    const sceneStore = useSceneStoreApi();
    // Exposed on the debug bridge below so the perf harness can route connectors
    // after a bulk model.set — the synchronous SYNC_SCENE diagram-open path.
    // Stable (useCallback over stable store actions), so the bridge effect's
    // [enableDebugTools] dep list still captures the current ref.
    const { changeView } = useView();
    useEffect(() => {
      const shouldExpose =
        enableDebugTools ||
        exposeStoreBridge ||
        process.env.NODE_ENV !== 'production';
      if (!shouldExpose) return;
      const debugBridge = {
        ui: uiStore,
        model: modelStore,
        scene: sceneStore,
        // SYNC_SCENE-routes a view's connectors into the scene store (mirrors
        // diagram-open). Debug-only; tree-shaken from production builds.
        changeView
      };
      type DebugBridge = typeof debugBridge;
      type WindowWithDebug = Window & {
        __axoview__?: DebugBridge;
        __fossflow__?: DebugBridge;
      };
      const win = window as WindowWithDebug;
      win.__axoview__ = debugBridge;

      // Backwards-compat alias: `window.__fossflow__` is the pre-rename name.
      // Keep as a getter that warns once on first access, so any external
      // tooling (Selenium fragments, browser snippets, README copy-paste)
      // surviving the rename still works for one release window.
      let warned = false;
      try {
        Object.defineProperty(window, '__fossflow__', {
          configurable: true,
          get() {
            if (!warned) {
              warned = true;
              console.warn(
                '[Axoview] window.__fossflow__ is deprecated; use window.__axoview__. ' +
                  'The alias will be removed in a future release.'
              );
            }
            return debugBridge;
          }
        });
      } catch {
        // defineProperty can throw if a non-configurable __fossflow__ was set
        // already (e.g. by a userscript). Best-effort only.
      }

      return () => {
        delete win.__axoview__;
        try {
          delete win.__fossflow__;
        } catch {
          // ignore
        }
      };
      // Store instances are stable (created once in Provider via useRef)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enableDebugTools, exposeStoreBridge]);

    const { load } = initialDataManager;
    const { markClean } = useDirtyTracker(initialDataManager.isReady);

    // Wrap the exposed load so every programmatic load resets Axoview's
    // internal dirty flag.  Without this, axoviewRef.current.load() triggers
    // useDirtyTracker's modelStore subscription and marks the diagram dirty
    // even though no user edit occurred, causing dirty-state guards to fire
    // spuriously.
    useImperativeHandle(
      ref,
      () => ({
        load: (data, opts) => {
          load(data, opts);
          markClean();
        },
        openExportImageDialog: () => {
          uiStateActions.setDialog('EXPORT_IMAGE');
        }
      }),
      [load, markClean, uiStateActions]
    );

    const mergedInitialData = useMemo(() => {
      // Strip undefined values so they don't override INITIAL_DATA defaults
      // (e.g. saved data missing 'title' should fall back to INITIAL_DATA.title, not override with undefined)
      const defined = Object.fromEntries(
        Object.entries(initialData || {}).filter(([, v]) => v !== undefined)
      ) as Partial<typeof INITIAL_DATA>;
      return { ...INITIAL_DATA, ...defined };
    }, [initialData]);

    // Keep a ref to the latest load function so we can call it without adding it to effect deps.
    // This prevents load-reference churn (from cascading store updates) from re-triggering the effect.
    const loadRef = useRef(load);
    useEffect(() => {
      loadRef.current = load;
    });

    // Guard against React 18 StrictMode double-invoke: track which data ref was last loaded.
    // Same object reference → already loaded (StrictMode remount). New reference → real prop change.
    // Effect only depends on mergedInitialData, not load, so load-ref churn never triggers a reload.
    const loadedForRef = useRef<typeof mergedInitialData | null>(null);
    useEffect(() => {
      if (loadedForRef.current === mergedInitialData) return;
      loadedForRef.current = mergedInitialData;
      loadRef.current(mergedInitialData);
    }, [mergedInitialData]);

    useEffect(() => {
      uiStateActions.setEditorMode(editorMode);
    }, [editorMode, uiStateActions]);

    useEffect(() => {
      return () => {
        setWindowCursor('default');
      };
    }, []);

    // Use a ref so onModelUpdated changes never re-trigger this effect (prevents infinite re-render loop)
    const onModelUpdatedRef = useRef(onModelUpdated);
    useEffect(() => {
      onModelUpdatedRef.current = onModelUpdated;
    });

    useEffect(() => {
      if (!initialDataManager.isReady || !onModelUpdatedRef.current) return;

      onModelUpdatedRef.current(model);
    }, [model, initialDataManager.isReady]);

    useEffect(() => {
      uiStateActions.setEnableDebugTools(enableDebugTools);
    }, [enableDebugTools, uiStateActions]);

    // Persist user preferences to localStorage whenever they change.
    // Uses shallow equality on the selector above so this only fires on real changes.
    // NON_INTERACTIVE instances (the export dialog's hidden Axoview, thumbnails)
    // set renderer-driven label flags (expandLabels/readableLabels) on their own
    // scoped store; persisting from them would leak those transient export values
    // into the shared settings and flip the live canvas (ADR 0025).
    useEffect(() => {
      // F2/VIEW-08 — which keys this mode may persist. The rule lives in
      // `persistableSettingsFor` so it can be pinned without mounting the
      // editor; `null` means "write nothing" (NON_INTERACTIVE).
      const toPersist = persistableSettingsFor(
        editorMode,
        persistableSettings,
        loadPersistedSettings()
      );
      if (toPersist) savePersistedSettings(toPersist);
    }, [persistableSettings, editorMode]);

    useEffect(() => {
      if (renderer?.expandLabels !== undefined) {
        uiStateActions.setExpandLabels(renderer.expandLabels);
      }
    }, [renderer?.expandLabels, uiStateActions]);

    // Image-export label controls (ADR 0025 §3). Scoped to this Axoview's own
    // store, so the export dialog's hidden instance can keep labels legible and
    // toggle their visibility without affecting the live canvas.
    useEffect(() => {
      if (renderer?.readableLabels !== undefined) {
        uiStateActions.setReadableLabels(renderer.readableLabels);
      }
    }, [renderer?.readableLabels, uiStateActions]);

    useEffect(() => {
      if (renderer?.showLabels !== undefined) {
        uiStateActions.setExportHideLabels(!renderer.showLabels);
      }
    }, [renderer?.showLabels, uiStateActions]);

    useEffect(() => {
      uiStateActions.setIconPackManager(iconPackManager || null);
    }, [iconPackManager, uiStateActions]);

    useEffect(() => {
      uiStateActions.setIconUsageScan(iconUsageScan || null);
    }, [iconUsageScan, uiStateActions]);

    useEffect(() => {
      uiStateActions.setLinkedDiagrams(linkedDiagrams || []);
    }, [linkedDiagrams, uiStateActions]);

    if (!initialDataManager.isReady) return null;

    return (
      <>
        <GlobalStyles />
        <Box
          sx={{
            width,
            height,
            position: 'relative',
            overflow: 'hidden',
            transform: 'translateZ(0)'
          }}
        >
          <CanvasModeProvider>
          <LayerContextProvider>
            {/* Canvas always fills the full container — sidebars overlay on top */}
            <Box sx={{ position: 'absolute', inset: 0 }}>
              <Renderer {...renderer} />
              <UiOverlay
                toolbarPortalTarget={portalTarget}
                sidebarTogglePortalTarget={sidebarTogglePortalTarget}
                styleControlsPortalTarget={styleControlsPortalTarget}
                languageSelector={languageSelector}
                suppressOnboardingHints={suppressOnboardingHints}
              />
            </Box>
            {/* NON_INTERACTIVE is a pure snapshot surface (image export +
                thumbnails): render only the diagram, never the editor chrome.
                Without this the docks (left tools, right sidebar, the bottom
                zoom/Aa/help cluster) get captured into the exported image. */}
            {editorMode !== 'NON_INTERACTIVE' && (
              <>
                {editorMode !== 'EXPLORABLE_READONLY' && (
                  <LeftDockSlot
                    fileExplorerOpen={fileExplorerOpen}
                    onFileExplorerToggle={onFileExplorerToggle}
                    disableWorkingTabs={disableLeftDockWorkingTabs}
                  />
                )}
                <RightSidebarSlot editorMode={editorMode} />
                {!hideViewControls && <BottomDockSlot endSlot={bottomDockEnd} />}
              </>
            )}
          </LayerContextProvider>
          </CanvasModeProvider>
        </Box>
      </>
    );
  }
);

export const Axoview = forwardRef<AxoviewRef, AxoviewProps>((props, ref) => {
  return (
    <ThemeProvider theme={theme}>
      <LocaleProvider locale={props.locale || enUS}>
        <ModelProvider>
          <SceneProvider>
            <UiStateProvider>
              <ClipboardProvider>
                <App {...props} ref={ref} />
              </ClipboardProvider>
            </UiStateProvider>
          </SceneProvider>
        </ModelProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
});

const useAxoview = () => {
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });

  const ModelActions = useModelStore((state) => {
    return state.actions;
  });

  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });

  return {
    Model: ModelActions,
    uiState: uiStateActions,
    rendererEl
  };
};

export { useAxoview };
export * from 'src/standaloneExports';
export default Axoview;
