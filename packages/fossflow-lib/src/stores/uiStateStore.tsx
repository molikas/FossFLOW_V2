import React, { createContext, useContext, useRef } from 'react';
import { createStore } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import {
  CoordsUtils,
  incrementZoom,
  decrementZoom,
  getStartingMode
} from 'src/utils';
import { UiStateStore } from 'src/types';
import { INITIAL_UI_STATE } from 'src/config';
import { DEFAULT_HOTKEY_PROFILE, HotkeyProfile } from 'src/config/hotkeys';
import { DEFAULT_PAN_SETTINGS } from 'src/config/panSettings';
import { DEFAULT_ZOOM_SETTINGS } from 'src/config/zoomSettings';
import { DEFAULT_LABEL_SETTINGS } from 'src/config/labelSettings';
import { loadPersistedSettings } from 'src/config/persistedSettings';

const initialState = () => {
  // Load any previously saved user preferences — fall back to defaults if absent/corrupt.
  const persisted = loadPersistedSettings();

  return createStore<UiStateStore>((set, get) => {
    return {
      zoom: INITIAL_UI_STATE.zoom,
      scroll: INITIAL_UI_STATE.scroll,
      view: '',
      mainMenuOptions: [],
      editorMode: 'EXPLORABLE_READONLY',
      mode: getStartingMode('EXPLORABLE_READONLY'),
      iconCategoriesState: [],
      isMainMenuOpen: false,
      dialog: null,
      rendererEl: null,
      rendererSize: { width: 0, height: 0 },
      contextMenu: null,
      mouse: {
        position: { screen: CoordsUtils.zero(), tile: CoordsUtils.zero() },
        mousedown: null,
        delta: null
      },
      itemControls: null,
      enableDebugTools: false,
      hotkeyProfile: persisted?.hotkeyProfile ?? DEFAULT_HOTKEY_PROFILE,
      panSettings: persisted?.panSettings ?? DEFAULT_PAN_SETTINGS,
      zoomSettings: persisted?.zoomSettings ?? DEFAULT_ZOOM_SETTINGS,
      labelSettings: persisted?.labelSettings ?? DEFAULT_LABEL_SETTINGS,
      connectorInteractionMode: persisted?.connectorInteractionMode ?? 'click',
      expandLabels: persisted?.expandLabels ?? false,
      canvasMode: persisted?.canvasMode ?? 'ISOMETRIC',
      iconPackManager: null, // Will be set by Isoflow if provided
      linkedDiagrams: [],
      notification: null,
      activeLeftTab: null,
      rightSidebarOpen: false,
      rightSidebarAutoOpened: false,
      isDirty: false,

      actions: {
        setView: (view) => {
          set({ view });
        },
        setMainMenuOptions: (mainMenuOptions) => {
          set({ mainMenuOptions });
        },
        setEditorMode: (mode) => {
          set({ editorMode: mode, mode: getStartingMode(mode) });
        },
        setIconCategoriesState: (iconCategoriesState) => {
          set({ iconCategoriesState });
        },
        resetUiState: () => {
          set({
            mode: getStartingMode(get().editorMode),
            scroll: {
              position: CoordsUtils.zero(),
              offset: CoordsUtils.zero()
            },
            itemControls: null,
            zoom: INITIAL_UI_STATE.zoom
          });
        },
        setMode: (mode) => {
          set({ mode });
        },
        setDialog: (dialog) => {
          set({ dialog });
        },
        setIsMainMenuOpen: (isMainMenuOpen) => {
          set({ isMainMenuOpen, itemControls: null });
        },
        incrementZoom: () => {
          const { zoom } = get();
          set({ zoom: incrementZoom(zoom) });
        },
        decrementZoom: () => {
          const { zoom } = get();
          set({ zoom: decrementZoom(zoom) });
        },
        setZoom: (zoom) => {
          set({ zoom });
        },
        setScroll: ({ position, offset }) => {
          set({ scroll: { position, offset: offset ?? get().scroll.offset } });
        },
        setItemControls: (itemControls) => {
          if (itemControls !== null) {
            const { rightSidebarOpen, rightSidebarAutoOpened } = get();
            // If user manually pinned the panel open, don't mark it as auto-opened
            const alreadyPinned = rightSidebarOpen && !rightSidebarAutoOpened;
            set({
              itemControls,
              rightSidebarOpen: true,
              ...(!alreadyPinned && { rightSidebarAutoOpened: true })
            });
          } else {
            const autoOpened = get().rightSidebarAutoOpened;
            set({
              itemControls,
              ...(autoOpened && {
                rightSidebarOpen: false,
                rightSidebarAutoOpened: false
              })
            });
          }
        },
        setContextMenu: (contextMenu) => {
          set({ contextMenu });
        },
        setMouse: (mouse) => {
          set({ mouse });
        },
        setEnableDebugTools: (enableDebugTools) => {
          set({ enableDebugTools });
        },
        setRendererEl: (el: HTMLDivElement) => {
          set({ rendererEl: el });
        },
        setRendererSize: (size) => {
          set({ rendererSize: size });
        },
        setHotkeyProfile: (hotkeyProfile: HotkeyProfile) => {
          set({ hotkeyProfile });
        },
        setPanSettings: (panSettings) => {
          set({ panSettings });
        },
        setZoomSettings: (zoomSettings) => {
          set({ zoomSettings });
        },
        setLabelSettings: (labelSettings) => {
          set({ labelSettings });
        },
        setConnectorInteractionMode: (connectorInteractionMode) => {
          set({ connectorInteractionMode });
        },
        setExpandLabels: (expandLabels) => {
          set({ expandLabels });
        },
        setIconPackManager: (iconPackManager) => {
          set({ iconPackManager });
        },
        setLinkedDiagrams: (linkedDiagrams) => {
          set({ linkedDiagrams });
        },
        setNotification: (notification) => {
          set({ notification });
        },
        setActiveLeftTab: (activeLeftTab) => {
          set({ activeLeftTab });
        },
        setRightSidebarOpen: (rightSidebarOpen) => {
          set({ rightSidebarOpen, rightSidebarAutoOpened: false });
        },
        setIsDirty: (isDirty) => {
          set({ isDirty });
        },
        setCanvasMode: (canvasMode) => {
          set({ canvasMode });
        }
      }
    };
  });
};

const UiStateContext = createContext<ReturnType<typeof initialState> | null>(
  null
);

interface ProviderProps {
  children: React.ReactNode;
}

// TODO: Typings below are pretty gnarly due to the way Zustand works.
// see https://github.com/pmndrs/zustand/discussions/1180#discussioncomment-3439061
export const UiStateProvider = ({ children }: ProviderProps) => {
  const storeRef = useRef<ReturnType<typeof initialState> | undefined>(
    undefined
  );

  if (!storeRef.current) {
    storeRef.current = initialState();
  }

  return (
    <UiStateContext.Provider value={storeRef.current}>
      {children}
    </UiStateContext.Provider>
  );
};

export function useUiStateStore<T>(
  selector: (state: UiStateStore) => T,
  equalityFn?: (left: T, right: T) => boolean
) {
  const store = useContext(UiStateContext);

  if (store === null) {
    throw new Error('Missing provider in the tree');
  }

  const value = useStoreWithEqualityFn(store, selector, equalityFn);
  return value;
}

// Hook to get store API for imperative access (getState without subscribing)
export function useUiStateStoreApi() {
  const store = useContext(UiStateContext);

  if (store === null) {
    throw new Error('Missing provider in the tree');
  }

  return store;
}
