import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { transformFromCompactFormat } from 'fossflow';
import { flattenCollections } from '@isoflow/isopacks/dist/utils';
import isoflowIsopack from '@isoflow/isopacks/dist/isoflow';
import type { IsoflowRef } from 'fossflow';
import { DiagramData } from '../diagramUtils';
import { useIconPackManager } from '../services/iconPackManager';
import { useAppStorage } from './AppStorageContext';
import { DiagramManager } from '../components/DiagramManager';
import { SaveDialog } from '../components/SaveDialog';
import { LoadDialog } from '../components/LoadDialog';
import { ExportDialog } from '../components/ExportDialog';
import { SaveAsDialog } from '../components/SaveAsDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StorageManager } from '../StorageManager';
import { notificationStore } from '../stores/notificationStore';

// Core icons — loaded once at module level
const coreIcons = flattenCollections([isoflowIsopack]);

const defaultColors = [
  { id: 'blue', value: '#0066cc' },
  { id: 'green', value: '#00aa00' },
  { id: 'red', value: '#cc0000' },
  { id: 'orange', value: '#ff9900' },
  { id: 'purple', value: '#9900cc' },
  { id: 'black', value: '#000000' },
  { id: 'gray', value: '#666666' }
];

export interface SavedDiagram {
  id: string;
  name: string;
  data: any;
  createdAt: string;
  updatedAt: string;
}

interface PendingConfirm {
  message: string;
  onConfirm: () => void;
}

interface DiagramLifecycleContextValue {
  // Diagram state
  diagramName: string;
  setDiagramName: (name: string) => void;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  currentDiagram: SavedDiagram | null;
  diagrams: SavedDiagram[];
  currentModel: DiagramData | null;
  isReadonlyUrl: boolean;
  // Dialog state
  showExportDialog: boolean;
  setShowExportDialog: (v: boolean) => void;
  // Refs
  isoflowRef: React.RefObject<IsoflowRef | null>;
  isAfterLoadRef: React.MutableRefObject<boolean>;
  frozenInitialDataRef: React.MutableRefObject<DiagramData | null>;
  // Portal state
  toolbarPortalTarget: HTMLElement | null;
  setToolbarPortalTarget: (el: HTMLElement) => void;
  sidebarTogglePortalTarget: HTMLElement | null;
  setSidebarTogglePortalTarget: (el: HTMLElement) => void;
  // Actions
  handleSaveClick: () => Promise<void>;
  handleOpenClick: () => void;
  handlePreviewClick: () => Promise<void>;
  handleModelUpdated: (model: any) => void;
  // Icon pack
  iconPackManagerProp: {
    lazyLoadingEnabled: boolean;
    onToggleLazyLoading: () => void;
    packInfo: any[];
    enabledPacks: string[];
    onTogglePack: (packName: string, enabled: boolean) => void;
  };
}

const DiagramLifecycleContext = createContext<DiagramLifecycleContextValue>(
  null as any
);

export function DiagramLifecycleProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { readonlyDiagramId } = useParams<{ readonlyDiagramId: string }>();
  const { t } = useTranslation('app');
  const { storage, serverStorageAvailable } = useAppStorage();
  const iconPackManager = useIconPackManager(coreIcons);

  const isReadonlyUrl =
    window.location.pathname.startsWith('/display/') && !!readonlyDiagramId;

  const isoflowRef = useRef<IsoflowRef>(null);

  // ---------------------------------------------------------------------------
  // Diagram list state
  // ---------------------------------------------------------------------------
  const [diagrams, setDiagrams] = useState<SavedDiagram[]>([]);
  const [isDiagramsInitialized, setIsDiagramsInitialized] = useState(false);
  const [currentDiagram, setCurrentDiagram] = useState<SavedDiagram | null>(null);
  const [diagramName, setDiagramName] = useState('');

  // ---------------------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------------------
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showStorageManager, setShowStorageManager] = useState(false);
  const [showDiagramManager, setShowDiagramManager] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // ---------------------------------------------------------------------------
  // Model / save state
  // ---------------------------------------------------------------------------
  const [currentModel, setCurrentModel] = useState<DiagramData | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // ---------------------------------------------------------------------------
  // Portal state
  // ---------------------------------------------------------------------------
  const [toolbarPortalTarget, setToolbarPortalTarget] =
    useState<HTMLElement | null>(null);
  const [sidebarTogglePortalTarget, setSidebarTogglePortalTarget] =
    useState<HTMLElement | null>(null);

  // ---------------------------------------------------------------------------
  // Initial diagram data (from localStorage, frozen on first render)
  // ---------------------------------------------------------------------------
  const [diagramData] = useState<DiagramData>(() => {
    const lastOpenedData = localStorage.getItem('fossflow-last-opened-data');
    if (lastOpenedData) {
      try {
        const data = JSON.parse(lastOpenedData);
        const importedIcons = (data.icons || []).filter(
          (icon: any) => icon.collection === 'imported'
        );
        return {
          ...data,
          icons: [...coreIcons, ...importedIcons],
          colors: data.colors?.length ? data.colors : defaultColors,
          fitToScreen: data.fitToScreen !== false
        };
      } catch (e) {
        console.error('Failed to load last opened data:', e);
      }
    }
    return {
      title: 'Untitled Diagram',
      icons: coreIcons,
      colors: defaultColors,
      items: [],
      views: [],
      fitToScreen: true
    };
  });

  // ---------------------------------------------------------------------------
  // Refs for suppressing spurious model updates after programmatic loads
  // ---------------------------------------------------------------------------
  const isAfterLoadRef = useRef(false);
  const currentModelRef = useRef<DiagramData | null>(null);
  useEffect(() => {
    currentModelRef.current = currentModel;
  }, [currentModel]);

  // ---------------------------------------------------------------------------
  // Frozen initial data for Isoflow (set once on first render)
  // ---------------------------------------------------------------------------
  const frozenInitialDataRef = useRef<DiagramData | null>(null);
  if (frozenInitialDataRef.current === null) {
    const importedIcons = (diagramData.icons || []).filter(
      (icon: any) => icon.collection === 'imported'
    );
    frozenInitialDataRef.current = {
      ...diagramData,
      icons: [...iconPackManager.loadedIcons, ...importedIcons]
    };
  }

  // ---------------------------------------------------------------------------
  // Load readonly diagram from URL
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isReadonlyUrl || !storage) return;
    const loadReadonlyDiagram = async () => {
      try {
        const diagramList = await storage.listDiagrams();
        const diagramInfo = diagramList.find((d) => d.id === readonlyDiagramId);
        const data = await storage.loadDiagram(readonlyDiagramId!);
        const readonlyDiagram: SavedDiagram = {
          id: readonlyDiagramId!,
          name: diagramInfo?.name || data.title || 'Readonly Diagram',
          data,
          createdAt: new Date().toISOString(),
          updatedAt: diagramInfo?.lastModified.toISOString() || new Date().toISOString()
        };
        const importedIcons = (data.icons || []).filter(
          (icon: any) => icon.collection === 'imported'
        );
        const dataWithIcons = {
          ...data,
          icons: [...iconPackManager.loadedIcons, ...importedIcons]
        };
        setCurrentDiagram(readonlyDiagram);
        setDiagramName(readonlyDiagram.name);
        setCurrentModel(dataWithIcons as DiagramData);
        setLastSaved(new Date(readonlyDiagram.updatedAt));
        isAfterLoadRef.current = true;
        isoflowRef.current?.load(dataWithIcons as any);
      } catch (_error) {
        notificationStore.push({
          severity: 'error',
          message: t('dialog.readOnly.failed')
        });
        window.location.href = '/';
      }
    };
    loadReadonlyDiagram();
  }, [readonlyDiagramId, storage]);

  // ---------------------------------------------------------------------------
  // Reload icon packs when they change
  // ---------------------------------------------------------------------------
  const iconPackEffectMountedRef = useRef(false);
  useEffect(() => {
    if (!iconPackEffectMountedRef.current) {
      iconPackEffectMountedRef.current = true;
      return;
    }
    if (!isoflowRef.current || !currentModelRef.current) return;
    const importedIcons = (currentModelRef.current.icons || []).filter(
      (icon: any) => icon.collection === 'imported'
    );
    const mergedIcons = [...iconPackManager.loadedIcons, ...importedIcons];
    isAfterLoadRef.current = true;
    // preserveViewport=true: icon pack updates must not reset the user's zoom/scroll
    isoflowRef.current.load(
      { ...currentModelRef.current, icons: mergedIcons } as any,
      { preserveViewport: true }
    );
  }, [iconPackManager.loadedIcons]);

  // ---------------------------------------------------------------------------
  // Load diagrams from localStorage on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const savedDiagrams = localStorage.getItem('fossflow-diagrams');
    if (savedDiagrams) {
      setDiagrams(JSON.parse(savedDiagrams));
      setIsDiagramsInitialized(true);
    }
    const lastOpenedId = localStorage.getItem('fossflow-last-opened');
    if (lastOpenedId && savedDiagrams) {
      try {
        const allDiagrams = JSON.parse(savedDiagrams);
        const lastDiagram = allDiagrams.find(
          (d: SavedDiagram) => d.id === lastOpenedId
        );
        if (lastDiagram) {
          setCurrentDiagram(lastDiagram);
          setDiagramName(lastDiagram.name);
          setCurrentModel(diagramData);
        }
      } catch (e) {
        console.error('Failed to restore last diagram metadata:', e);
      }
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Persist diagrams to localStorage on change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isDiagramsInitialized) return;
    try {
      const diagramsToStore = diagrams.map((d) => ({
        ...d,
        data: { ...d.data, icons: [] }
      }));
      localStorage.setItem('fossflow-diagrams', JSON.stringify(diagramsToStore));
    } catch (e) {
      console.error('Failed to save diagrams:', e);
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        notificationStore.push({
          severity: 'error',
          message: t('alert.quotaExceeded')
        });
      }
    }
  }, [diagrams]);

  // ---------------------------------------------------------------------------
  // Warn before unload on unsaved changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = t('alert.beforeUnload');
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ---------------------------------------------------------------------------
  // Build save payload
  // ---------------------------------------------------------------------------
  const buildSaveData = useCallback(() => {
    const importedIcons = (currentModel?.icons || diagramData.icons || []).filter(
      (icon: any) => icon.collection === 'imported'
    );
    return {
      title: currentModel?.title || diagramName || 'Untitled Diagram',
      icons: importedIcons,
      colors: currentModel?.colors || diagramData.colors || [],
      items: currentModel?.items || diagramData.items || [],
      views: currentModel?.views || diagramData.views || [],
      fitToScreen: true
    };
  }, [currentModel, diagramData, diagramName]);

  // ---------------------------------------------------------------------------
  // Session-mode save — core logic (after validation / confirm)
  // ---------------------------------------------------------------------------
  const executeSave = useCallback(
    (existingDiagram?: SavedDiagram) => {
      const importedIcons = (currentModel?.icons || diagramData.icons || []).filter(
        (icon) => icon.collection === 'imported'
      );
      const savedData = {
        title: diagramName,
        icons: importedIcons,
        colors: currentModel?.colors || diagramData.colors || [],
        items: currentModel?.items || diagramData.items || [],
        views: currentModel?.views || diagramData.views || [],
        fitToScreen: true
      };
      const newDiagram: SavedDiagram = {
        id: currentDiagram?.id || Date.now().toString(),
        name: diagramName,
        data: savedData,
        createdAt: currentDiagram?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (currentDiagram) {
        setDiagrams(diagrams.map((d) => (d.id === currentDiagram.id ? newDiagram : d)));
      } else if (existingDiagram) {
        setDiagrams(
          diagrams.map((d) =>
            d.id === existingDiagram.id
              ? { ...newDiagram, id: existingDiagram.id, createdAt: existingDiagram.createdAt }
              : d
          )
        );
        newDiagram.id = existingDiagram.id;
        newDiagram.createdAt = existingDiagram.createdAt;
      } else {
        setDiagrams([...diagrams, newDiagram]);
      }
      setCurrentDiagram(newDiagram);
      setShowSaveDialog(false);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
      notificationStore.push({ severity: 'success', message: `"${diagramName}" saved` });
      try {
        localStorage.setItem('fossflow-last-opened', newDiagram.id);
        localStorage.setItem('fossflow-last-opened-data', JSON.stringify(newDiagram.data));
      } catch (e) {
        console.error('Failed to save diagram:', e);
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          notificationStore.push({ severity: 'error', message: t('alert.storageFull') });
          setShowStorageManager(true);
        }
      }
    },
    [diagramName, diagrams, currentDiagram, currentModel, diagramData, t]
  );

  const saveDiagram = useCallback(() => {
    if (!diagramName.trim()) {
      notificationStore.push({ severity: 'error', message: t('alert.enterDiagramName') });
      return;
    }
    const existingDiagram = diagrams.find(
      (d) => d.name === diagramName.trim() && d.id !== currentDiagram?.id
    );
    if (existingDiagram) {
      setPendingConfirm({
        message: t('alert.diagramExists', { name: diagramName }),
        onConfirm: () => executeSave(existingDiagram)
      });
      return;
    }
    executeSave();
  }, [diagramName, diagrams, currentDiagram, t, executeSave]);

  // ---------------------------------------------------------------------------
  // Session-mode load — core logic
  // ---------------------------------------------------------------------------
  const executeLoad = useCallback(
    async (diagram: SavedDiagram) => {
      await iconPackManager.loadPacksForDiagram(diagram.data.items || []);
      const importedIcons = (diagram.data.icons || []).filter(
        (icon: any) => icon.collection === 'imported'
      );
      const dataWithIcons = {
        ...diagram.data,
        icons: [...iconPackManager.loadedIcons, ...importedIcons]
      };
      setCurrentDiagram(diagram);
      setDiagramName(diagram.name);
      setCurrentModel(dataWithIcons);
      setShowLoadDialog(false);
      setHasUnsavedChanges(false);
      setLastSaved(new Date(diagram.updatedAt));
      isAfterLoadRef.current = true;
      isoflowRef.current?.load(dataWithIcons as any);
      try {
        localStorage.setItem('fossflow-last-opened', diagram.id);
        localStorage.setItem('fossflow-last-opened-data', JSON.stringify(diagram.data));
      } catch (e) {
        console.error('Failed to save last opened:', e);
      }
    },
    [iconPackManager]
  );

  const loadDiagram = useCallback(
    async (diagram: SavedDiagram, skipUnsavedCheck = false) => {
      if (!skipUnsavedCheck && hasUnsavedChanges) {
        setPendingConfirm({
          message: t('alert.unsavedChanges'),
          onConfirm: () => executeLoad(diagram)
        });
        return;
      }
      await executeLoad(diagram);
    },
    [hasUnsavedChanges, executeLoad, t]
  );

  const deleteDiagram = useCallback(
    (id: string) => {
      setPendingConfirm({
        message: t('alert.confirmDelete'),
        onConfirm: () => {
          setDiagrams(diagrams.filter((d) => d.id !== id));
          if (currentDiagram?.id === id) {
            setCurrentDiagram(null);
            setDiagramName('');
          }
        }
      });
    },
    [diagrams, currentDiagram, t]
  );

  const exportDiagram = useCallback(() => {
    const modelToExport = currentModel || diagramData;
    const iconMap = new Map();
    (modelToExport.icons || []).forEach((icon) => iconMap.set(icon.id, icon));
    (diagramData.icons || [])
      .filter((icon) => icon.collection === 'imported')
      .forEach((icon) => {
        if (!iconMap.has(icon.id)) iconMap.set(icon.id, icon);
      });
    const exportData = {
      title: diagramName || modelToExport.title || 'Exported Diagram',
      icons: Array.from(iconMap.values()),
      colors: modelToExport.colors || [],
      items: modelToExport.items || [],
      views: modelToExport.views || [],
      fitToScreen: true
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagramName || 'diagram'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDialog(false);
    setHasUnsavedChanges(false);
  }, [currentModel, diagramData, diagramName]);

  // ---------------------------------------------------------------------------
  // Server-mode diagram manager callbacks
  // ---------------------------------------------------------------------------
  const handleDiagramManagerLoad = useCallback(
    async (id: string, rawData: any, listingName: string) => {
      const isCompact = rawData?._?.f === 'compact';
      let data: any = rawData;
      if (isCompact) {
        data = transformFromCompactFormat(rawData);
      }

      const loadedIcons = data.icons || [];
      await iconPackManager.loadPacksForDiagram(data.items || []);
      const hasDefaultIcons = loadedIcons.some(
        (icon: any) =>
          icon.collection === 'isoflow' ||
          icon.collection === 'aws' ||
          icon.collection === 'gcp'
      );
      const finalIcons = hasDefaultIcons
        ? loadedIcons
        : [
            ...iconPackManager.loadedIcons,
            ...loadedIcons.filter((icon: any) => icon.collection === 'imported')
          ];

      const name = listingName || data.title || data.name || data.t || 'Untitled Diagram';

      const mergedData: DiagramData = {
        ...data,
        title: name,
        icons: finalIcons,
        colors: data.colors?.length ? data.colors : defaultColors,
        fitToScreen: data.fitToScreen !== false
      };
      const newDiagram = {
        id,
        name,
        data: mergedData,
        createdAt: data.created || new Date().toISOString(),
        updatedAt: data.lastModified || new Date().toISOString()
      };
      setDiagramName(name);
      setCurrentDiagram(newDiagram);
      setCurrentModel(mergedData);
      setHasUnsavedChanges(false);
      setLastSaved(new Date(newDiagram.updatedAt));
      isAfterLoadRef.current = true;
      isoflowRef.current?.load(mergedData as any);
      if (!hasDefaultIcons && storage) {
        storage.saveDiagram(id, mergedData as any).catch(() => {});
      }
    },
    [iconPackManager, storage]
  );

  // ---------------------------------------------------------------------------
  // Toolbar action handlers
  // ---------------------------------------------------------------------------
  const handleSaveClick = useCallback(async () => {
    if (serverStorageAvailable && storage) {
      if (currentDiagram) {
        try {
          const data = buildSaveData();
          await storage.saveDiagram(currentDiagram.id, data as any);
          setHasUnsavedChanges(false);
          setLastSaved(new Date());
          notificationStore.push({ severity: 'success', message: `"${currentDiagram.name}" saved` });
        } catch (e) {
          console.error('Save failed:', e);
          notificationStore.push({
            severity: 'error',
            message: t('alert.saveFailed', 'Failed to save diagram. Please try again.')
          });
        }
      } else {
        setSaveAsName(currentModel?.title || 'Untitled Diagram');
        setShowSaveAsDialog(true);
      }
    } else {
      if (currentDiagram) {
        saveDiagram();
      } else {
        setShowSaveDialog(true);
      }
    }
  }, [serverStorageAvailable, storage, currentDiagram, buildSaveData, currentModel, saveDiagram, t]);

  const handleSaveAs = useCallback(async () => {
    if (!saveAsName.trim() || !storage) return;
    try {
      const name = saveAsName.trim();
      const data = { ...buildSaveData(), name, title: name };
      const id = await storage.createDiagram(data as any);
      const saved: SavedDiagram = {
        id,
        name,
        data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setCurrentDiagram(saved);
      setDiagramName(name);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
      notificationStore.push({ severity: 'success', message: `"${name}" saved` });
      setShowSaveAsDialog(false);
      setSaveAsName('');
      if (isoflowRef.current && currentModel) {
        isAfterLoadRef.current = true;
        isoflowRef.current.load({ ...currentModel, title: name } as any);
      }
    } catch (e) {
      console.error('Save As failed:', e);
      notificationStore.push({
        severity: 'error',
        message: t('alert.saveFailed', 'Failed to save diagram. Please try again.')
      });
    }
  }, [saveAsName, storage, buildSaveData, currentModel, t]);

  const handleOpenClick = useCallback(() => {
    if (serverStorageAvailable) {
      setShowDiagramManager(true);
    } else {
      setShowLoadDialog(true);
    }
  }, [serverStorageAvailable]);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts — must be after handleSaveClick + handleOpenClick
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveClick();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpenClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveClick, handleOpenClick]);

  const handlePreviewClick = useCallback(async () => {
    if (!serverStorageAvailable || !currentDiagram || !storage) return;
    if (hasUnsavedChanges) {
      try {
        const data = buildSaveData();
        await storage.saveDiagram(currentDiagram.id, data as any);
        setHasUnsavedChanges(false);
        setLastSaved(new Date());
        notificationStore.push({ severity: 'success', message: `"${currentDiagram.name}" saved` });
      } catch (e) {
        console.error('Save before preview failed:', e);
        notificationStore.push({
          severity: 'error',
          message: t('alert.saveBeforePreviewFailed', 'Failed to save before preview. Please try again.')
        });
        return;
      }
    }
    window.open(`/display/${currentDiagram.id}`, '_blank');
  }, [serverStorageAvailable, currentDiagram, storage, hasUnsavedChanges, buildSaveData, t]);

  // ---------------------------------------------------------------------------
  // Model update handler
  // ---------------------------------------------------------------------------
  const handleModelUpdated = useCallback(
    (model: any) => {
      const updatedModel = {
        title: model.title || diagramName || 'Untitled',
        icons: model.icons || [],
        colors: model.colors || defaultColors,
        items: model.items || [],
        views: model.views || [],
        fitToScreen: true
      };
      setCurrentModel(updatedModel);
      if (isAfterLoadRef.current) {
        isAfterLoadRef.current = false;
        return;
      }
      if (model.title && model.title !== diagramName) {
        setDiagramName(model.title);
        setCurrentDiagram(null);
        setLastSaved(null);
      }
      if (!isReadonlyUrl) setHasUnsavedChanges(true);
    },
    [diagramName, isReadonlyUrl]
  );

  // ---------------------------------------------------------------------------
  // Icon pack manager prop (memoised)
  // ---------------------------------------------------------------------------
  const handleTogglePack = useCallback(
    (packName: string, enabled: boolean) => {
      iconPackManager.togglePack(packName as any, enabled);
    },
    [iconPackManager.togglePack]
  );

  const iconPackManagerProp = useMemo(
    () => ({
      lazyLoadingEnabled: iconPackManager.lazyLoadingEnabled,
      onToggleLazyLoading: iconPackManager.toggleLazyLoading,
      packInfo: Object.values(iconPackManager.packInfo),
      enabledPacks: iconPackManager.enabledPacks,
      onTogglePack: handleTogglePack
    }),
    [
      iconPackManager.lazyLoadingEnabled,
      iconPackManager.toggleLazyLoading,
      iconPackManager.packInfo,
      iconPackManager.enabledPacks,
      handleTogglePack
    ]
  );

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------
  const value: DiagramLifecycleContextValue = {
    diagramName,
    setDiagramName,
    hasUnsavedChanges,
    lastSaved,
    currentDiagram,
    diagrams,
    currentModel,
    isReadonlyUrl,
    showExportDialog,
    setShowExportDialog,
    isoflowRef,
    isAfterLoadRef,
    frozenInitialDataRef,
    toolbarPortalTarget,
    setToolbarPortalTarget,
    sidebarTogglePortalTarget,
    setSidebarTogglePortalTarget,
    handleSaveClick,
    handleOpenClick,
    handlePreviewClick,
    handleModelUpdated,
    iconPackManagerProp
  };

  return (
    <DiagramLifecycleContext.Provider value={value}>
      {children}

      {showSaveDialog && (
        <SaveDialog
          diagramName={diagramName}
          onNameChange={setDiagramName}
          onSave={saveDiagram}
          onClose={() => setShowSaveDialog(false)}
        />
      )}

      {showLoadDialog && (
        <LoadDialog
          diagrams={diagrams}
          onLoad={(d) => loadDiagram(d, false)}
          onDelete={deleteDiagram}
          onClose={() => setShowLoadDialog(false)}
        />
      )}

      {showExportDialog && (
        <ExportDialog
          onExport={exportDiagram}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {showSaveAsDialog && (
        <SaveAsDialog
          name={saveAsName}
          onNameChange={setSaveAsName}
          onSave={handleSaveAs}
          onClose={() => {
            setShowSaveAsDialog(false);
            setSaveAsName('');
          }}
        />
      )}

      {showStorageManager && (
        <StorageManager onClose={() => setShowStorageManager(false)} />
      )}

      {showDiagramManager && storage && (
        <DiagramManager
          storage={storage}
          isServerStorage={true}
          onLoadDiagram={handleDiagramManagerLoad}
          onClose={() => setShowDiagramManager(false)}
        />
      )}

      {pendingConfirm && (
        <ConfirmDialog
          open
          message={pendingConfirm.message}
          onConfirm={() => {
            const fn = pendingConfirm.onConfirm;
            setPendingConfirm(null);
            fn();
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </DiagramLifecycleContext.Provider>
  );
}

export const useDiagramLifecycle = () => useContext(DiagramLifecycleContext);
