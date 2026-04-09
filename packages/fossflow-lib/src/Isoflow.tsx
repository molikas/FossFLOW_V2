import React, { useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Box } from '@mui/material';
import { shallow } from 'zustand/shallow';
import { theme } from 'src/styles/theme';
import { IsoflowProps, IsoflowRef } from 'src/types';
import { setWindowCursor, modelFromModelStore } from 'src/utils';
import { useModelStore, ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { LocaleProvider } from 'src/stores/localeStore';
import { GlobalStyles } from 'src/styles/GlobalStyles';
import { Renderer } from 'src/components/Renderer/Renderer';
import { UiOverlay } from 'src/components/UiOverlay/UiOverlay';
import { UiStateProvider, useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { INITIAL_DATA, MAIN_MENU_OPTIONS } from 'src/config';
import { savePersistedSettings } from 'src/config/persistedSettings';
import { useInitialDataManager } from 'src/hooks/useInitialDataManager';
import { ClipboardProvider } from 'src/clipboard/ClipboardContext';
import { LayerContextProvider } from 'src/hooks/useLayerContext';
import { LeftSidebar } from 'src/components/Sidebars/LeftSidebar';
import { RightSidebar } from 'src/components/Sidebars/RightSidebar';
import enUS from 'src/i18n/en-US';

// Sidebar slots — rendered inside the LayerContextProvider so they have full store access.
const LeftSidebarSlot = () => {
  const open = useUiStateStore((s) => s.leftSidebarOpen);
  return <LeftSidebar open={open} />;
};

const RightSidebarSlot = ({ editorMode }: { editorMode: string }) => {
  const open = useUiStateStore((s) => s.rightSidebarOpen);
  return <RightSidebar open={open} editorMode={editorMode} />;
};

const App = forwardRef<IsoflowRef, IsoflowProps>(({
  initialData,
  mainMenuOptions = MAIN_MENU_OPTIONS,
  width = '100%',
  height = '100%',
  onModelUpdated,
  enableDebugTools = false,
  editorMode = 'EDITABLE',
  renderer,
  locale = enUS,
  iconPackManager,
  toolbarPortalTarget,
  sidebarTogglePortalTarget,
  languageSelector,
  /** @deprecated use toolbarPortalTarget */
  menuPortalTarget,
}, ref) => {
  const portalTarget = toolbarPortalTarget ?? menuPortalTarget;
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const persistableSettings = useUiStateStore(
    (state) => ({
      hotkeyProfile: state.hotkeyProfile,
      panSettings: state.panSettings,
      zoomSettings: state.zoomSettings,
      labelSettings: state.labelSettings,
      connectorInteractionMode: state.connectorInteractionMode,
      expandLabels: state.expandLabels
    }),
    shallow
  );
  const initialDataManager = useInitialDataManager();
  // Use shallow equality so that history-only store writes (saveToHistory updating
  // history.past) do not produce a new model reference and fire onModelUpdated.
  // Without this, every user action triggers onModelUpdated twice: once for the
  // actual change and once for the preceding saveToHistory call.
  const model = useModelStore(
    (state) => modelFromModelStore(state),
    shallow
  );

  // Expose Zustand store instances for Playwright e2e tests.
  // Completely tree-shaken from production builds by the bundler.
  const uiStore = useUiStateStoreApi();
  const modelStore = useModelStoreApi();
  const sceneStore = useSceneStoreApi();
  useEffect(() => {
    if (!enableDebugTools) return;
    (window as any).__fossflow__ = { ui: uiStore, model: modelStore, scene: sceneStore };
    return () => { delete (window as any).__fossflow__; };
  // Store instances are stable (created once in Provider via useRef)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableDebugTools]);

  const { load } = initialDataManager;

  useImperativeHandle(ref, () => ({ load }), [load]);

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
  useEffect(() => { loadRef.current = load; });

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
    uiStateActions.setMainMenuOptions(mainMenuOptions);
  }, [editorMode, uiStateActions, mainMenuOptions]);

  useEffect(() => {
    return () => {
      setWindowCursor('default');
    };
  }, []);

  // Use a ref so onModelUpdated changes never re-trigger this effect (prevents infinite re-render loop)
  const onModelUpdatedRef = useRef(onModelUpdated);
  useEffect(() => { onModelUpdatedRef.current = onModelUpdated; });

  useEffect(() => {
    if (!initialDataManager.isReady || !onModelUpdatedRef.current) return;

    onModelUpdatedRef.current(model);
  }, [model, initialDataManager.isReady]);

  useEffect(() => {
    uiStateActions.setEnableDebugTools(enableDebugTools);
  }, [enableDebugTools, uiStateActions]);

  // Persist user preferences to localStorage whenever they change.
  // Uses shallow equality on the selector above so this only fires on real changes.
  useEffect(() => {
    savePersistedSettings(persistableSettings);
  }, [persistableSettings]);

  useEffect(() => {
    if (renderer?.expandLabels !== undefined) {
      uiStateActions.setExpandLabels(renderer.expandLabels);
    }
  }, [renderer?.expandLabels, uiStateActions]);

  useEffect(() => {
    uiStateActions.setIconPackManager(iconPackManager || null);
  }, [iconPackManager, uiStateActions]);

  if (!initialDataManager.isReady) return null;

  return (
    <>
      <GlobalStyles />
      <Box
        sx={{
          width,
          height,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          transform: 'translateZ(0)'
        }}
      >
        <LayerContextProvider>
          <LeftSidebarSlot />
          {/* Canvas area — flex:1 so it fills all space not taken by sidebars */}
          <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
            <Renderer {...renderer} />
            <UiOverlay toolbarPortalTarget={portalTarget} sidebarTogglePortalTarget={sidebarTogglePortalTarget} languageSelector={languageSelector} />
          </Box>
          <RightSidebarSlot editorMode={editorMode} />
        </LayerContextProvider>
      </Box>
    </>
  );
});

export const Isoflow = forwardRef<IsoflowRef, IsoflowProps>((props, ref) => {
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

const useIsoflow = () => {
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

export { useIsoflow };
export * from 'src/standaloneExports';
export default Isoflow;
