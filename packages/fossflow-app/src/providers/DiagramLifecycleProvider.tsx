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
import { useAutoSave, SaveStatus } from '../hooks/useAutoSave';
import { DiagramManager } from '../components/DiagramManager';
import { SaveDialog } from '../components/SaveDialog';
import { LoadDialog } from '../components/LoadDialog';
import { ExportDialog } from '../components/ExportDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StorageManager } from '../StorageManager';
import { notificationStore } from '../stores/notificationStore';
import { sequentialName } from '../utils/fileOperations';

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

// Module-level Set helpers
function setWithAdd(prev: Set<string>, item: string): Set<string> {
  if (prev.has(item)) return prev;
  const next = new Set(prev);
  next.add(item);
  return next;
}
function setWithout(prev: Set<string>, ...items: string[]): Set<string> {
  const hasAny = items.some((i) => prev.has(i));
  if (!hasAny) return prev;
  const next = new Set(prev);
  for (const item of items) next.delete(item);
  return next;
}

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
  onDiscard?: () => void;
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
  // Auto-save status (server mode)
  saveStatus: SaveStatus;
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
  handleNewDiagram: () => Promise<void>;
  handleRenameCurrentDiagram: (newName: string) => Promise<void>;
  saveAllDirty: () => Promise<void>;
  handleCreateBlankDiagram: (folderId: string | null) => Promise<void>;
  checkUnsavedBeforeNavigate: (onProceed: () => void) => void;
  // File explorer
  fileExplorerOpen: boolean;
  setFileExplorerOpen: (open: boolean) => void;
  openDiagramById: (id: string, name: string) => Promise<void>;
  fileTreeRefreshToken: number;
  dirtyDiagramIds: Set<string>;
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
  const { storage, serverStorageAvailable, isInitialized } = useAppStorage();
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
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // ---------------------------------------------------------------------------
  // Model / save state
  // ---------------------------------------------------------------------------
  const [currentModel, setCurrentModel] = useState<DiagramData | null>(null);

  // Session-mode dirty tracking (unchanged)
  const [dirtyDiagramIds, setDirtyDiagramIds] = useState<Set<string>>(new Set());
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // In server mode the single-diagram hasUnsavedChanges is driven by saveStatus.
  // In session mode it uses dirtyDiagramIds as before.
  const hasUnsavedChanges = serverStorageAvailable
    ? false  // toolbar uses saveStatus directly in server mode
    : dirtyDiagramIds.has(currentDiagram?.id ?? '__unsaved__');

  // ---------------------------------------------------------------------------
  // Auto-save (server mode only)
  // ---------------------------------------------------------------------------
  const autoSave = useAutoSave({
    storage,
    enabled: serverStorageAvailable && !isReadonlyUrl,
    onSaved: (_id, savedAt) => {
      setLastSaved(savedAt);
      setFileTreeRefreshToken((n) => n + 1);
    },
    onError: () => {
      notificationStore.push({
        severity: 'error',
        message: t('alert.saveFailed', 'Auto-save failed — check your connection.')
      });
    }
  });

  // ---------------------------------------------------------------------------
  // File explorer panel state
  // ---------------------------------------------------------------------------
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [fileTreeRefreshToken, setFileTreeRefreshToken] = useState(0);
  const explorerInitializedRef = useRef(false);

  // Initialize fileExplorerOpen once storage check completes
  useEffect(() => {
    if (!isInitialized || explorerInitializedRef.current) return;
    explorerInitializedRef.current = true;
    if (!serverStorageAvailable) {
      setFileExplorerOpen(false);
      return;
    }
    const flag = localStorage.getItem('fossflow-explorer-initialized');
    if (!flag) {
      localStorage.setItem('fossflow-explorer-initialized', '1');
      setFileExplorerOpen(true);
    } else {
      const saved = localStorage.getItem('fossflow-explorer-open');
      setFileExplorerOpen(saved === 'true');
    }
  }, [isInitialized, serverStorageAvailable]);

  // Persist fileExplorerOpen to localStorage (server mode only)
  useEffect(() => {
    if (!isInitialized || !serverStorageAvailable) return;
    localStorage.setItem('fossflow-explorer-open', String(fileExplorerOpen));
  }, [fileExplorerOpen, isInitialized, serverStorageAvailable]);

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
        if (!Array.isArray(data.items) || !Array.isArray(data.views)) {
          console.warn('fossflow-last-opened-data had invalid structure, discarding.');
          localStorage.removeItem('fossflow-last-opened-data');
          throw new Error('invalid structure');
        }
        const importedIcons = (data.icons || []).filter(
          (icon: any) => icon.collection === 'imported'
        );
        return {
          ...data,
          icons: [...coreIcons, ...importedIcons],
          colors: data.colors?.length ? data.colors : defaultColors,
          items: data.items,
          views: data.views,
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
  // Refs
  // ---------------------------------------------------------------------------
  const isAfterLoadRef = useRef(true);
  const currentModelRef = useRef<DiagramData | null>(null);
  useEffect(() => { currentModelRef.current = currentModel; }, [currentModel]);

  const currentDiagramRef = useRef<SavedDiagram | null>(null);
  useEffect(() => { currentDiagramRef.current = currentDiagram; }, [currentDiagram]);

  const diagramNameRef = useRef(diagramName);
  useEffect(() => { diagramNameRef.current = diagramName; }, [diagramName]);

  // Session-mode scratch buffer
  const scratchBufferRef = useRef<Map<string, DiagramData>>(new Map());
  const dirtyDiagramIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { dirtyDiagramIdsRef.current = dirtyDiagramIds; }, [dirtyDiagramIds]);

  // Storage ref so callbacks don't stale
  const storageRef = useRef(storage);
  useEffect(() => { storageRef.current = storage; }, [storage]);

  // ---------------------------------------------------------------------------
  // Frozen initial data for Isoflow
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
          name: diagramInfo?.name || (data as any).title || 'Readonly Diagram',
          data,
          createdAt: new Date().toISOString(),
          updatedAt: diagramInfo?.lastModified || new Date().toISOString()
        };
        const importedIcons = ((data as any).icons || []).filter(
          (icon: any) => icon.collection === 'imported'
        );
        const dataWithIcons = {
          ...(data as any),
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
    isoflowRef.current.load(
      { ...currentModelRef.current, icons: mergedIcons } as any,
      { preserveViewport: true }
    );
  }, [iconPackManager.loadedIcons]);

  // ---------------------------------------------------------------------------
  // Load diagrams from localStorage (session mode)
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
  // Persist diagrams to localStorage (session mode)
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
  // Warn before unload
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasPending = serverStorageAvailable
        ? autoSave.saveStatus === 'saving'
        : dirtyDiagramIds.size > 0;
      if (hasPending) {
        e.preventDefault();
        e.returnValue = t('alert.beforeUnload');
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtyDiagramIds, autoSave.saveStatus, serverStorageAvailable]);

  // ---------------------------------------------------------------------------
  // Build save payload (session mode / Ctrl+S in server mode)
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
  // Session-mode save
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
      const oldKey = currentDiagram?.id ?? '__unsaved__';
      scratchBufferRef.current.delete(oldKey);
      scratchBufferRef.current.delete(newDiagram.id);
      setDirtyDiagramIds((prev) => setWithout(prev, oldKey, newDiagram.id));
      setLastSaved(new Date());
      setFileTreeRefreshToken((n) => n + 1);
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
  // Session-mode load
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
  }, [currentModel, diagramData, diagramName]);

  // ---------------------------------------------------------------------------
  // Server-mode: load diagram into canvas
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
        items: Array.isArray(data.items) ? data.items : [],
        views: Array.isArray(data.views) ? data.views : [],
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
      setLastSaved(new Date(newDiagram.updatedAt));
      autoSave.resetStatus();
      isAfterLoadRef.current = true;
      if (!isoflowRef.current) {
        // Isoflow not mounted yet (EmptyStateScreen showing) — seed initialData so it
        // mounts with the correct diagram instead of the stale frozen data.
        frozenInitialDataRef.current = mergedData;
      }
      isoflowRef.current?.load(mergedData as any);
      if (!hasDefaultIcons && storageRef.current) {
        storageRef.current.saveDiagram(id, mergedData as any).catch(() => {});
      }
    },
    [iconPackManager, autoSave.resetStatus]
  );

  // ---------------------------------------------------------------------------
  // Create blank diagram (for canvas card or file tree)
  // ---------------------------------------------------------------------------
  const handleCreateBlankDiagram = useCallback(
    async (folderId: string | null) => {
      if (!storageRef.current) return;
      try {
        const existing = await storageRef.current.listDiagrams();
        const existingNames = existing.map((d) => d.name);
        const name = sequentialName('Untitled', existingNames);
        const blankData = {
          title: name,
          name,
          icons: iconPackManager.loadedIcons,
          colors: defaultColors,
          items: [],
          views: [],
          fitToScreen: true
        };
        const id = await storageRef.current.createDiagram(blankData as any, folderId);
        setFileExplorerOpen(true);
        setFileTreeRefreshToken((n) => n + 1);
        await handleDiagramManagerLoad(id, blankData, name);
      } catch (e) {
        console.error('handleCreateBlankDiagram failed:', e);
        notificationStore.push({ severity: 'error', message: 'Failed to create diagram' });
      }
    },
    [iconPackManager.loadedIcons, handleDiagramManagerLoad]
  );

  // ---------------------------------------------------------------------------
  // Guard: check unsaved changes before navigating (session mode only)
  // ---------------------------------------------------------------------------
  const checkUnsavedBeforeNavigate = useCallback(
    (onProceed: () => void) => {
      if (serverStorageAvailable) {
        onProceed();
        return;
      }
      if (!hasUnsavedChanges) {
        onProceed();
        return;
      }
      setPendingConfirm({
        message: 'You have unsaved changes. Save before leaving?',
        onConfirm: () => { saveDiagram(); onProceed(); },
        onDiscard: onProceed
      });
    },
    [serverStorageAvailable, hasUnsavedChanges, saveDiagram]
  );

  // ---------------------------------------------------------------------------
  // New Diagram (FossFlow-owned — replaces Isoflow's ACTION.NEW)
  // ---------------------------------------------------------------------------
  const handleNewDiagram = useCallback(async () => {
    await autoSave.saveNow();

    setCurrentDiagram(null);
    setDiagramName('');
    setCurrentModel(null);
    setLastSaved(null);
    autoSave.resetStatus();

    setDirtyDiagramIds((prev) => setWithout(prev, '__unsaved__'));
    scratchBufferRef.current.delete('__unsaved__');

    const blankData: DiagramData = {
      title: '',
      icons: iconPackManager.loadedIcons,
      colors: defaultColors,
      items: [],
      views: [],
      fitToScreen: true
    };
    isAfterLoadRef.current = true;
    isoflowRef.current?.load(blankData as any);
  }, [autoSave.saveNow, autoSave.resetStatus, iconPackManager.loadedIcons]);

  // ---------------------------------------------------------------------------
  // Rename current diagram
  // ---------------------------------------------------------------------------
  const handleRenameCurrentDiagram = useCallback(
    async (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || !currentDiagramRef.current) return;
      const diag = currentDiagramRef.current;
      setDiagramName(trimmed);
      setCurrentDiagram({ ...diag, name: trimmed });
      if (serverStorageAvailable && storageRef.current) {
        try {
          await storageRef.current.renameDiagram(diag.id, trimmed);
          setFileTreeRefreshToken((n) => n + 1);
        } catch {
          notificationStore.push({ severity: 'error', message: 'Rename failed' });
          setDiagramName(diag.name);
          setCurrentDiagram(diag);
        }
      }
    },
    [serverStorageAvailable]
  );

  // ---------------------------------------------------------------------------
  // Toolbar save actions
  // ---------------------------------------------------------------------------
  const handleSaveClick = useCallback(async () => {
    if (serverStorageAvailable && storage) {
      if (currentDiagram) {
        await autoSave.saveNow();
        if (autoSave.saveStatus === 'idle') {
          try {
            const data = buildSaveData();
            await storage.saveDiagram(currentDiagram.id, data as any);
            const savedAt = new Date();
            setLastSaved(savedAt);
            notificationStore.push({ severity: 'success', message: `"${currentDiagram.name}" saved` });
          } catch {
            notificationStore.push({ severity: 'error', message: t('alert.saveFailed', 'Save failed') });
          }
        }
      }
    } else {
      if (currentDiagram) {
        saveDiagram();
      } else {
        setShowSaveDialog(true);
      }
    }
  }, [serverStorageAvailable, storage, currentDiagram, autoSave, buildSaveData, saveDiagram, t]);

  const handleOpenClick = useCallback(() => {
    if (serverStorageAvailable) {
      setShowDiagramManager(true);
    } else {
      setShowLoadDialog(true);
    }
  }, [serverStorageAvailable]);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
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

  // ---------------------------------------------------------------------------
  // Open diagram by ID (file explorer)
  // ---------------------------------------------------------------------------
  const openDiagramById = useCallback(
    async (id: string, name: string) => {
      if (!storage) return;
      try {
        await autoSave.saveNow();

        if (!serverStorageAvailable) {
          const currentId = currentDiagramRef.current?.id ?? '__unsaved__';
          if (dirtyDiagramIdsRef.current.has(currentId) && currentModelRef.current) {
            scratchBufferRef.current.set(currentId, currentModelRef.current);
          }
        }

        const buffered = scratchBufferRef.current.get(id);
        const rawData: any = buffered ?? await storage.loadDiagram(id);
        await handleDiagramManagerLoad(id, rawData, name);
      } catch (e) {
        console.error('openDiagramById failed:', e);
        notificationStore.push({ severity: 'error', message: `Failed to open "${name}"` });
      }
    },
    [storage, serverStorageAvailable, autoSave.saveNow, handleDiagramManagerLoad]
  );

  const handlePreviewClick = useCallback(async () => {
    if (!serverStorageAvailable || !currentDiagram || !storage) return;
    await autoSave.saveNow();
    window.open(`/display/${currentDiagram.id}`, '_blank');
  }, [serverStorageAvailable, currentDiagram, storage, autoSave.saveNow]);

  // ---------------------------------------------------------------------------
  // Session-mode Save All
  // ---------------------------------------------------------------------------
  const saveAllDirty = useCallback(async () => {
    if (serverStorageAvailable) return;
    const allDirtyIds = Array.from(dirtyDiagramIdsRef.current);
    if (allDirtyIds.length === 0) return;

    const resolveData = (diagId: string): DiagramData | null => {
      const activeId = currentDiagramRef.current?.id ?? '__unsaved__';
      if (diagId === activeId) return currentModelRef.current;
      return scratchBufferRef.current.get(diagId) ?? null;
    };

    const clearDirty = (diagId: string) => {
      scratchBufferRef.current.delete(diagId);
      setDirtyDiagramIds((prev) => setWithout(prev, diagId));
    };

    const sessionExistingNames = diagrams.map((d) => d.name);
    const sessionUpdates: SavedDiagram[] = [];
    let savedCount = 0;
    const failedIds: string[] = [];

    for (const dirtyId of allDirtyIds) {
      const dirtyData = resolveData(dirtyId);
      if (!dirtyData) continue;
      try {
        if (dirtyId === '__unsaved__') {
          const nameCandidate = dirtyData.title || diagramNameRef.current || 'Untitled Diagram';
          const chosenName = sequentialName(nameCandidate, sessionExistingNames);
          sessionExistingNames.push(chosenName);
          const newSessionDiagram: SavedDiagram = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: chosenName,
            data: { ...dirtyData, title: chosenName },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          sessionUpdates.push(newSessionDiagram);
          if (!currentDiagramRef.current) {
            setCurrentDiagram(newSessionDiagram);
            setDiagramName(chosenName);
            setLastSaved(new Date());
          }
        } else {
          const existingEntry = diagrams.find((d) => d.id === dirtyId);
          if (existingEntry) {
            sessionUpdates.push({ ...existingEntry, data: dirtyData, updatedAt: new Date().toISOString() });
            if (dirtyId === currentDiagramRef.current?.id) setLastSaved(new Date());
          }
        }
        clearDirty(dirtyId);
        savedCount++;
      } catch {
        failedIds.push(dirtyId);
      }
    }

    if (sessionUpdates.length > 0) {
      setDiagrams((prev) => {
        const byId = new Map(prev.map((d) => [d.id, d]));
        for (const upd of sessionUpdates) byId.set(upd.id, upd);
        return Array.from(byId.values());
      });
    }

    setFileTreeRefreshToken((n) => n + 1);
    if (failedIds.length === 0) {
      notificationStore.push({
        severity: 'success',
        message: `${savedCount} diagram${savedCount !== 1 ? 's' : ''} saved`
      });
    } else {
      notificationStore.push({
        severity: 'warning',
        message: `${savedCount} saved, ${failedIds.length} failed`
      });
    }
  }, [diagrams, serverStorageAvailable]);

  // ---------------------------------------------------------------------------
  // Model update handler
  // ---------------------------------------------------------------------------
  const handleModelUpdated = useCallback(
    (model: any) => {
      const updatedModel: DiagramData = {
        title: model.title || diagramNameRef.current || 'Untitled',
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

      if (model.title && model.title !== diagramNameRef.current) {
        if (!currentDiagramRef.current) {
          setDiagramName(model.title);
          setCurrentDiagram(null);
          setLastSaved(null);
        }
      }

      if (isReadonlyUrl) return;

      if (serverStorageAvailable) {
        // ── Server mode ──────────────────────────────────────────────────────
        const currentId = currentDiagramRef.current?.id ?? null;
        if (currentId) {
          autoSave.scheduleSave(currentId, updatedModel);
        }
        // If no diagram open, do nothing — user must create explicitly
      } else {
        // ── Session mode ─────────────────────────────────────────────────────
        const bufferKey = currentDiagramRef.current?.id ?? '__unsaved__';
        scratchBufferRef.current.set(bufferKey, updatedModel);
        if (!dirtyDiagramIdsRef.current.has(bufferKey)) {
          setDirtyDiagramIds((prev) => setWithAdd(prev, bufferKey));
        }
      }
    },
    [isReadonlyUrl, serverStorageAvailable, autoSave.scheduleSave]
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
    lastSaved: serverStorageAvailable ? autoSave.lastSaved : lastSaved,
    currentDiagram,
    diagrams,
    currentModel,
    isReadonlyUrl,
    saveStatus: autoSave.saveStatus,
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
    handleNewDiagram,
    handleRenameCurrentDiagram,
    saveAllDirty,
    handleCreateBlankDiagram,
    checkUnsavedBeforeNavigate,
    fileExplorerOpen,
    setFileExplorerOpen,
    openDiagramById,
    fileTreeRefreshToken,
    dirtyDiagramIds,
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
          confirmLabel={pendingConfirm.onDiscard ? 'Save' : 'Confirm'}
          discardLabel="Discard"
          onConfirm={() => {
            const fn = pendingConfirm.onConfirm;
            setPendingConfirm(null);
            fn();
          }}
          onDiscard={pendingConfirm.onDiscard ? () => {
            const fn = pendingConfirm.onDiscard!;
            setPendingConfirm(null);
            fn();
          } : undefined}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </DiagramLifecycleContext.Provider>
  );
}

export const useDiagramLifecycle = () => useContext(DiagramLifecycleContext);
