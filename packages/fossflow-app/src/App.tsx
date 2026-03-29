import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Isoflow } from 'fossflow';
import { flattenCollections } from '@isoflow/isopacks/dist/utils';
import isoflowIsopack from '@isoflow/isopacks/dist/isoflow';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Divider,
  Popover,
  Stack,
  TextField,
  Typography,
  Chip,
  Alert,
  IconButton,
  Box,
  Tooltip
} from '@mui/material';
import {
  SaveOutlined as SaveIcon,
  FolderOpenOutlined as FolderIcon,
  LinkOutlined as LinkIcon,
  Close as CloseIcon,
  VisibilityOutlined as PreviewIcon
} from '@mui/icons-material';
import {
  DiagramData,
  mergeDiagramData,
  extractSavableData
} from './diagramUtils';
import { StorageManager } from './StorageManager';
import { DiagramManager } from './components/DiagramManager';
import { DiagnosticsOverlay } from './components/DiagnosticsOverlay';
import { useStorage } from './services/storageService';
import type { IsoflowRef } from 'fossflow';
import ChangeLanguage from './components/ChangeLanguage';
import { allLocales } from 'fossflow';
import { useIconPackManager, IconPackName } from './services/iconPackManager';
import './App.css';
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';

// Load core isoflow icons (always loaded)
const coreIcons = flattenCollections([isoflowIsopack]);

interface SavedDiagram {
  id: string;
  name: string;
  data: any;
  createdAt: string;
  updatedAt: string;
}

function App() {
  // Get base path from PUBLIC_URL, ensure no trailing slash for React Router
  const publicUrl = process.env.PUBLIC_URL || '';
  // React Router basename should not have trailing slash
  const basename = publicUrl ? (publicUrl.endsWith('/') ? publicUrl.slice(0, -1) : publicUrl) : '/';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/display/:readonlyDiagramId" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function EditorPage() {
  // Initialize icon pack manager with core icons
  const iconPackManager = useIconPackManager(coreIcons);
  const { readonlyDiagramId } = useParams<{ readonlyDiagramId: string }>();

  const isoflowRef = useRef<IsoflowRef>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const { storage, isServerStorage: isStorageServer, isInitialized: isStorageInitialized } = useStorage();

  const [diagrams, setDiagrams] = useState<SavedDiagram[]>([]);
  const [isDiagramsInitialized, setIsDiagramsInitialized] = useState<boolean>(false);
  const [currentDiagram, setCurrentDiagram] = useState<SavedDiagram | null>(
    null
  );
  const [diagramName, setDiagramName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [currentModel, setCurrentModel] = useState<DiagramData | null>(null); // Store current model state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [showStorageManager, setShowStorageManager] = useState(false);
  const [showDiagramManager, setShowDiagramManager] = useState(false);
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [sessionWarningDismissed, setSessionWarningDismissed] = useState(
    () => sessionStorage.getItem('foss-session-warning-dismissed') === '1'
  );
  const serverStorageAvailable = isStorageServer && isStorageInitialized;
  const isReadonlyUrl =
    window.location.pathname.startsWith('/display/') && readonlyDiagramId;

  // Initialize with empty diagram data
  // Create default colors for connectors
  const defaultColors = [
    { id: 'blue', value: '#0066cc' },
    { id: 'green', value: '#00aa00' },
    { id: 'red', value: '#cc0000' },
    { id: 'orange', value: '#ff9900' },
    { id: 'purple', value: '#9900cc' },
    { id: 'black', value: '#000000' },
    { id: 'gray', value: '#666666' }
  ];

  const [diagramData, setDiagramData] = useState<DiagramData>(() => {
    // Initialize with last opened data if available
    const lastOpenedData = localStorage.getItem('fossflow-last-opened-data');
    if (lastOpenedData) {
      try {
        const data = JSON.parse(lastOpenedData);
        const importedIcons = (data.icons || []).filter((icon: any) => {
          return icon.collection === 'imported';
        });
        const mergedIcons = [...coreIcons, ...importedIcons];
        return {
          ...data,
          icons: mergedIcons,
          colors: data.colors?.length ? data.colors : defaultColors,
          fitToScreen: data.fitToScreen !== false
        };
      } catch (e) {
        console.error('Failed to load last opened data:', e);
      }
    }

    // Default state if no saved data
    return {
      title: 'Untitled Diagram',
      icons: coreIcons,
      colors: defaultColors,
      items: [],
      views: [],
      fitToScreen: true
    };
  });

  // Check if readonlyDiagramId exists - if exists, load diagram in view-only mode
  useEffect(() => {
    if (!isReadonlyUrl || !storage) return;
    const loadReadonlyDiagram = async () => {
      try {
        const diagramList = await storage.listDiagrams();
        const diagramInfo = diagramList.find((d) => d.id === readonlyDiagramId);
        const data = await storage.loadDiagram(readonlyDiagramId);
        const readonlyDiagram: SavedDiagram = {
          id: readonlyDiagramId,
          name: diagramInfo?.name || data.title || 'Readonly Diagram',
          data: data,
          createdAt: new Date().toISOString(),
          updatedAt: diagramInfo?.lastModified.toISOString() || new Date().toISOString()
        };
        const importedIcons = (data.icons || []).filter((icon: any) => icon.collection === 'imported');
        const mergedIcons = [...iconPackManager.loadedIcons, ...importedIcons];
        const dataWithIcons = { ...data, icons: mergedIcons };
        setCurrentDiagram(readonlyDiagram);
        setDiagramName(readonlyDiagram.name);
        setCurrentModel(dataWithIcons);
        setLastSaved(new Date(readonlyDiagram.updatedAt));
        isAfterLoadRef.current = true;
        isoflowRef.current?.load(dataWithIcons);
      } catch (error) {
        alert(t('dialog.readOnly.failed'));
        window.location.href = '/';
      }
    };
    loadReadonlyDiagram();
  }, [readonlyDiagramId, storage]);

  const currentModelRef = useRef<DiagramData | null>(null);
  useEffect(() => { currentModelRef.current = currentModel; }, [currentModel]);

  // Format lastSaved timestamp: time only for today, "yesterday" for yesterday, short date for older.
  const formatSavedAt = (d: Date): string => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (dDay.getTime() === today.getTime()) return `Saved at ${time}`;
    if (dDay.getTime() === yesterday.getTime()) return `Saved yesterday at ${time}`;
    const month = d.toLocaleString([], { month: 'short' });
    const day = d.getDate();
    if (d.getFullYear() === now.getFullYear()) return `Saved ${month} ${day} at ${time}`;
    return `Saved ${month} ${day}, ${d.getFullYear()} at ${time}`;
  };

  // Suppress the spurious onModelUpdated that fires immediately after isoflowRef.current.load().
  // Loading is not a user edit — it should not mark the diagram as having unsaved changes.
  const isAfterLoadRef = useRef(false);

  // Skip initial mount so StrictMode remount with stale currentModelRef doesn't trigger a spurious load.
  // Only fire when loadedIcons genuinely changes after mount (e.g. user enables an icon pack).
  const iconPackEffectMountedRef = useRef(false);
  useEffect(() => {
    if (!iconPackEffectMountedRef.current) {
      iconPackEffectMountedRef.current = true;
      return;
    }
    if (!isoflowRef.current || !currentModelRef.current) return;
    const importedIcons = (currentModelRef.current.icons || []).filter((icon: any) => icon.collection === 'imported');
    const mergedIcons = [...iconPackManager.loadedIcons, ...importedIcons];
    isAfterLoadRef.current = true;
    isoflowRef.current.load({ ...currentModelRef.current, icons: mergedIcons });
  }, [iconPackManager.loadedIcons]);

  // Load diagrams from localStorage on component mount
  useEffect(() => {
    const savedDiagrams = localStorage.getItem('fossflow-diagrams');
    if (savedDiagrams) {
      setDiagrams(JSON.parse(savedDiagrams));
      setIsDiagramsInitialized(true);
    }

    // Load last opened diagram metadata (data is already loaded in state initialization)
    const lastOpenedId = localStorage.getItem('fossflow-last-opened');

    if (lastOpenedId && savedDiagrams) {
      try {
        const allDiagrams = JSON.parse(savedDiagrams);
        const lastDiagram = allDiagrams.find((d: SavedDiagram) => {
          return d.id === lastOpenedId;
        });
        if (lastDiagram) {
          setCurrentDiagram(lastDiagram);
          setDiagramName(lastDiagram.name);
          // Also set currentModel to match diagramData
          setCurrentModel(diagramData);
        }
      } catch (e) {
        console.error('Failed to restore last diagram metadata:', e);
      }
    }
  }, []);

  // Save diagrams to localStorage whenever they change
  useEffect(() => {
    if (!isDiagramsInitialized) return;

    try {
      // Store diagrams without the full icon data
      const diagramsToStore = diagrams.map((d) => {
        return {
          ...d,
          data: {
            ...d.data,
            icons: [] // Don't store icons with each diagram
          }
        };
      });
      localStorage.setItem(
        'fossflow-diagrams',
        JSON.stringify(diagramsToStore)
      );
    } catch (e) {
      console.error('Failed to save diagrams:', e);
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        alert(t('alert.quotaExceeded'));
      }
    }
  }, [diagrams]);

  const saveDiagram = () => {
    if (!diagramName.trim()) {
      alert(t('alert.enterDiagramName'));
      return;
    }

    // Check if a diagram with this name already exists (excluding current)
    const existingDiagram = diagrams.find((d) => {
      return d.name === diagramName.trim() && d.id !== currentDiagram?.id;
    });

    if (existingDiagram) {
      const confirmOverwrite = window.confirm(
        t('alert.diagramExists', { name: diagramName })
      );
      if (!confirmOverwrite) {
        return;
      }
    }

    // Construct save data - include only imported icons
    const importedIcons = (
      currentModel?.icons ||
      diagramData.icons ||
      []
    ).filter((icon) => {
      return icon.collection === 'imported';
    });

    const savedData = {
      title: diagramName,
      icons: importedIcons, // Save only imported icons with diagram
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
      // Update existing diagram
      setDiagrams(
        diagrams.map((d) => {
          return d.id === currentDiagram.id ? newDiagram : d;
        })
      );
    } else if (existingDiagram) {
      // Replace existing diagram with same name
      setDiagrams(
        diagrams.map((d) => {
          return d.id === existingDiagram.id
            ? {
                ...newDiagram,
                id: existingDiagram.id,
                createdAt: existingDiagram.createdAt
              }
            : d;
        })
      );
      newDiagram.id = existingDiagram.id;
      newDiagram.createdAt = existingDiagram.createdAt;
    } else {
      // Add new diagram
      setDiagrams([...diagrams, newDiagram]);
    }

    setCurrentDiagram(newDiagram);
    setShowSaveDialog(false);
    setHasUnsavedChanges(false);
    setLastSaved(new Date());
    setSaveToast(diagramName);

    // Save as last opened
    try {
      localStorage.setItem('fossflow-last-opened', newDiagram.id);
      localStorage.setItem(
        'fossflow-last-opened-data',
        JSON.stringify(newDiagram.data)
      );
    } catch (e) {
      console.error('Failed to save diagram:', e);
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        alert(t('alert.storageFull'));
        setShowStorageManager(true);
      }
    }
  };

  const loadDiagram = async (
    diagram: SavedDiagram,
    skipUnsavedCheck = false
  ) => {
    if (
      !skipUnsavedCheck &&
      hasUnsavedChanges &&
      !window.confirm(t('alert.unsavedChanges'))
    ) {
      return;
    }

    // Auto-detect and load required icon packs
    await iconPackManager.loadPacksForDiagram(diagram.data.items || []);

    // Merge imported icons with loaded icon set
    const importedIcons = (diagram.data.icons || []).filter((icon: any) => {
      return icon.collection === 'imported';
    });
    const mergedIcons = [...iconPackManager.loadedIcons, ...importedIcons];
    const dataWithIcons = {
      ...diagram.data,
      icons: mergedIcons
    };

    setCurrentDiagram(diagram);
    setDiagramName(diagram.name);
    setCurrentModel(dataWithIcons);
    setShowLoadDialog(false);
    setHasUnsavedChanges(false);
    setLastSaved(new Date(diagram.updatedAt));
    isAfterLoadRef.current = true;
    isoflowRef.current?.load(dataWithIcons);

    // Save as last opened (without icons)
    try {
      localStorage.setItem('fossflow-last-opened', diagram.id);
      localStorage.setItem(
        'fossflow-last-opened-data',
        JSON.stringify(diagram.data)
      );
    } catch (e) {
      console.error('Failed to save last opened:', e);
    }
  };

  const deleteDiagram = (id: string) => {
    if (window.confirm(t('alert.confirmDelete'))) {
      setDiagrams(
        diagrams.filter((d) => {
          return d.id !== id;
        })
      );
      if (currentDiagram?.id === id) {
        setCurrentDiagram(null);
        setDiagramName('');
      }
    }
  };

  const newDiagram = () => {
    const message = hasUnsavedChanges
      ? t('alert.unsavedChangesExport')
      : t('alert.createNewDiagram');

    if (window.confirm(message)) {
      const emptyDiagram: DiagramData = {
        title: 'Untitled Diagram',
        icons: iconPackManager.loadedIcons, // Use currently loaded icons
        colors: defaultColors,
        items: [],
        views: [],
        fitToScreen: true
      };
      setCurrentDiagram(null);
      setDiagramName('');
      setCurrentModel(emptyDiagram);
      setHasUnsavedChanges(false);
      isAfterLoadRef.current = true;
      isoflowRef.current?.load(emptyDiagram);

      // Clear last opened
      localStorage.removeItem('fossflow-last-opened');
      localStorage.removeItem('fossflow-last-opened-data');
    }
  };

  const handleModelUpdated = (model: any) => {
    const updatedModel = {
      title: model.title || diagramName || 'Untitled',
      icons: model.icons || [],
      colors: model.colors || defaultColors,
      items: model.items || [],
      views: model.views || [],
      fitToScreen: true
    };

    setCurrentModel(updatedModel);

    // Suppress the first onModelUpdated after a programmatic load — it is not a user edit.
    if (isAfterLoadRef.current) {
      isAfterLoadRef.current = false;
      return;
    }

    if (!isReadonlyUrl) {
      setHasUnsavedChanges(true);
    }
  };

  const exportDiagram = () => {
    // Use the most recent model data - prefer currentModel as it gets updated by handleModelUpdated
    const modelToExport = currentModel || diagramData;

    // Get ALL icons from the current model (which includes both default and imported)
    const allModelIcons = modelToExport.icons || [];

    // For safety, also check diagramData for any imported icons not in currentModel
    const diagramImportedIcons = (diagramData.icons || []).filter((icon) => {
      return icon.collection === 'imported';
    });

    // Create a map to deduplicate icons by ID, preferring the ones from currentModel
    const iconMap = new Map();

    // First add all icons from the model (includes defaults + imported)
    allModelIcons.forEach((icon) => {
      iconMap.set(icon.id, icon);
    });

    // Then add any imported icons from diagramData that might be missing
    diagramImportedIcons.forEach((icon) => {
      if (!iconMap.has(icon.id)) {
        iconMap.set(icon.id, icon);
      }
    });

    // Get all unique icons
    const allIcons = Array.from(iconMap.values());

    const exportData = {
      title: diagramName || modelToExport.title || 'Exported Diagram',
      icons: allIcons, // Include ALL icons (default + imported) for portability
      colors: modelToExport.colors || [],
      items: modelToExport.items || [],
      views: modelToExport.views || [],
      fitToScreen: true
    };

    const jsonString = JSON.stringify(exportData, null, 2);

    // Create a blob and download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagramName || 'diagram'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setShowExportDialog(false);
    setHasUnsavedChanges(false); // Mark as saved after export
  };

  const handleDiagramManagerLoad = async (id: string, data: any) => {
    const loadedIcons = data.icons || [];

    // Auto-detect and load required icon packs
    await iconPackManager.loadPacksForDiagram(data.items || []);

    // Old format: only imported icons were saved. New format: all icons (default + imported) are saved.
    // Detect by checking for any default-collection icon in the saved data.
    const hasDefaultIcons = loadedIcons.some(
      (icon: any) => icon.collection === 'isoflow' || icon.collection === 'aws' || icon.collection === 'gcp'
    );

    let finalIcons;
    if (hasDefaultIcons) {
      finalIcons = loadedIcons;
    } else {
      // Old format — merge and silently re-save so subsequent loads skip this path.
      const importedIcons = loadedIcons.filter((icon: any) => icon.collection === 'imported');
      finalIcons = [...iconPackManager.loadedIcons, ...importedIcons];
    }

    const mergedData: DiagramData = {
      ...data,
      title: data.title || data.name || 'Loaded Diagram',
      icons: finalIcons,
      colors: data.colors?.length ? data.colors : defaultColors,
      fitToScreen: data.fitToScreen !== false
    };

    const newDiagram = {
      id,
      name: data.name || 'Loaded Diagram',
      data: mergedData,
      createdAt: data.created || new Date().toISOString(),
      updatedAt: data.lastModified || new Date().toISOString()
    };

    setDiagramName(newDiagram.name);
    setCurrentDiagram(newDiagram);
    setCurrentModel(mergedData);
    setHasUnsavedChanges(false);
    setLastSaved(new Date(newDiagram.updatedAt));
    isAfterLoadRef.current = true;
    isoflowRef.current?.load(mergedData);

    // Silently migrate old-format diagrams to new format so they don't re-migrate on every load.
    if (!hasDefaultIcons && storage) {
      storage.saveDiagram(id, mergedData as any).catch(() => {
        // Non-critical — will retry on next load
      });
    }
  };

  // i18n
  const { t, i18n } = useTranslation('app');

  // Get locale with fallback to en-US if not found
  const currentLocale = allLocales[i18n.language as keyof typeof allLocales] || allLocales['en-US'];

  // Stable callback for iconPackManager to avoid recreating the prop object every render.
  const handleTogglePack = useCallback(
    (packName: string, enabled: boolean) => {
      iconPackManager.togglePack(packName as any, enabled);
    },
    [iconPackManager.togglePack]
  );

  // Freeze initialData with the full icon set the first time packs finish loading.
  // Setting a ref during render is synchronous — it happens before <Isoflow> mounts,
  // so the component always receives the correct icon list on its very first render.
  const frozenInitialDataRef = useRef<DiagramData | null>(null);
  if (iconPackManager.isInitialized && frozenInitialDataRef.current === null) {
    const importedIcons = (diagramData.icons || []).filter(
      (icon: any) => icon.collection === 'imported'
    );
    frozenInitialDataRef.current = {
      ...diagramData,
      icons: [...iconPackManager.loadedIcons, ...importedIcons],
    };
  }

  // Memoize the iconPackManager prop so Isoflow's useEffect doesn't fire on every App render.
  // Without this, the inline object literal is a new reference every render, causing
  // setIconPackManager to update the store on every render, triggering a render cascade.
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

  // Build save payload from current model state
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

  // Toolbar action handlers
  const handleSaveClick = useCallback(async () => {
    if (serverStorageAvailable && storage) {
      if (currentDiagram) {
        // Direct server save — no dialog
        try {
          const data = buildSaveData();
          await storage.saveDiagram(currentDiagram.id, data as any);
          setHasUnsavedChanges(false);
          setLastSaved(new Date());
          setSaveToast(currentDiagram.name);
        } catch (e) {
          console.error('Save failed:', e);
          alert('Failed to save diagram. Please try again.');
        }
      } else {
        // New diagram — show Save As dialog
        setSaveAsName(currentModel?.title || 'Untitled Diagram');
        setShowSaveAsDialog(true);
      }
    } else {
      // Session fallback
      if (currentDiagram) {
        saveDiagram();
      } else {
        setShowSaveDialog(true);
      }
    }
  }, [serverStorageAvailable, storage, currentDiagram, buildSaveData, currentModel]);

  const handleSaveAs = async () => {
    if (!saveAsName.trim() || !storage) return;
    try {
      const name = saveAsName.trim();
      // Use saveAsName as both storage name and diagram title — keep them in sync
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
      setSaveToast(name);
      setShowSaveAsDialog(false);
      setSaveAsName('');
      // Sync canvas title to match the saved name
      if (isoflowRef.current && currentModel) {
        isAfterLoadRef.current = true;
        isoflowRef.current.load({ ...currentModel, title: name });
      }
    } catch (e) {
      console.error('Save As failed:', e);
      alert('Failed to save diagram. Please try again.');
    }
  };

  const handleOpenClick = useCallback(() => {
    if (serverStorageAvailable) {
      setShowDiagramManager(true);
    } else {
      setShowLoadDialog(true);
    }
  }, [serverStorageAvailable]);

  const handleShareClick = useCallback(() => {
    if (!serverStorageAvailable || !currentDiagram) return;
    const url = `${window.location.origin}/display/${currentDiagram.id}`;
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setShareCopied(true);
    setShowSharePopover(true);
    setTimeout(() => setShareCopied(false), 2500);
  }, [serverStorageAvailable, currentDiagram]);

  const handleShareUrlClick = (e: { target: EventTarget | null }) => {
    (e.target as HTMLInputElement).select();
  };

  // Close share popover on outside click
  useEffect(() => {
    if (!showSharePopover) return;
    const handleOutside = (e: MouseEvent) => {
      const btn = shareButtonRef.current;
      if (btn && !btn.parentElement?.contains(e.target as Node)) {
        setShowSharePopover(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showSharePopover]);

  // Auto-dismiss save toast after 2.5 seconds
  useEffect(() => {
    if (!saveToast) return;
    const timer = setTimeout(() => setSaveToast(null), 2500);
    return () => clearTimeout(timer);
  }, [saveToast]);

  // Warn before closing if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = t('alert.beforeUnload');
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      return window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S or Cmd+S for Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveClick();
      }

      // Ctrl+O or Cmd+O for Open
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpenClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      return window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSaveClick, handleOpenClick]);

  return (
    <div className="App">
      <Box
        className="toolbar"
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          px: 1.5,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 0
        }}
      >
        <Box className="toolbar-left" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          {!isReadonlyUrl && (
            <>
              <Button
                variant="contained"
                size="small"
                startIcon={<SaveIcon />}
                onClick={handleSaveClick}
                title={t('nav.save', 'Save') + ' (Ctrl+S)'}
                disabled={!!currentDiagram && !hasUnsavedChanges}
              >
                {t('nav.save', 'Save')}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FolderIcon />}
                onClick={handleOpenClick}
                title={t('nav.load', 'Load') + ' (Ctrl+O)'}
              >
                {t('nav.diagrams', 'Diagrams')}
              </Button>
              <Button
                ref={shareButtonRef}
                variant="outlined"
                size="small"
                startIcon={<LinkIcon />}
                onClick={handleShareClick}
                title={t('nav.share', 'Share')}
                disabled={!serverStorageAvailable || !currentDiagram}
              >
                {t('nav.share', 'Share')}
              </Button>
              <Popover
                open={showSharePopover && !!currentDiagram}
                anchorEl={shareButtonRef.current}
                onClose={() => setShowSharePopover(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{ sx: { p: 2, width: 380, mt: 0.5 } }}
              >
                <Stack spacing={1.5}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2">{t('share.title', 'Share Diagram')}</Typography>
                    <IconButton size="small" onClick={() => setShowSharePopover(false)}>
                      <CloseIcon />
                    </IconButton>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {t('share.hint', 'Anyone with this link can view the diagram in read-only mode.')}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      fullWidth
                      value={currentDiagram ? `${window.location.origin}/display/${currentDiagram.id}` : ''}
                      inputProps={{ readOnly: true, style: { fontFamily: 'monospace', fontSize: 12 } }}
                      onClick={handleShareUrlClick}
                    />
                    <Button
                      variant={shareCopied ? 'contained' : 'outlined'}
                      color={shareCopied ? 'success' : 'primary'}
                      size="small"
                      onClick={handleShareClick}
                      sx={{ whiteSpace: 'nowrap', minWidth: 80 }}
                    >
                      {shareCopied ? '✓ Copied!' : 'Copy'}
                    </Button>
                  </Stack>
                </Stack>
              </Popover>
              <Tooltip title={!serverStorageAvailable || !currentDiagram ? 'Save first to preview' : 'Preview in view-only mode'}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => window.open(`/display/${currentDiagram!.id}`, '_blank')}
                    disabled={!serverStorageAvailable || !currentDiagram}
                    sx={{ ml: 0.25 }}
                  >
                    <PreviewIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
          {isReadonlyUrl && (
            <Chip label={t('dialog.readOnly.mode')} variant="outlined" size="small" />
          )}
        </Box>

        <Box className="toolbar-center" sx={{ flex: 1 }} />

        <Box className="toolbar-right" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          {!isReadonlyUrl && (
            <Typography
              variant="body2"
              sx={{
                color: hasUnsavedChanges ? 'text.primary' : 'text.secondary',
                whiteSpace: 'nowrap',
                userSelect: 'none'
              }}
            >
              {lastSaved
                ? `${formatSavedAt(lastSaved)}${hasUnsavedChanges ? ' •' : ''}`
                : hasUnsavedChanges
                  ? 'Unsaved'
                  : ''
              }
            </Typography>
          )}
          {!isReadonlyUrl && (
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          )}
          <ChangeLanguage />
        </Box>
      </Box>

      {/* Session storage banner — shown once per session, dismissible */}
      {!serverStorageAvailable && !isReadonlyUrl && !sessionWarningDismissed && (
        <Alert
          severity="warning"
          onClose={() => {
            setSessionWarningDismissed(true);
            sessionStorage.setItem('foss-session-warning-dismissed', '1');
          }}
          sx={{ borderRadius: 0, py: 0.5, fontSize: 12 }}
        >
          {t('status.sessionStorageNote', 'Session storage only — diagrams will be lost when you close this tab. Use a server backend for persistence.')}
        </Alert>
      )}

      <div className="fossflow-container">
        {iconPackManager.isInitialized && frozenInitialDataRef.current ? (
          <Isoflow
            ref={isoflowRef}
            initialData={frozenInitialDataRef.current}
            onModelUpdated={handleModelUpdated}
            editorMode={isReadonlyUrl ? 'EXPLORABLE_READONLY' : 'EDITABLE'}
            locale={currentLocale}
            iconPackManager={iconPackManagerProp}
          />
        ) : (
          <div className="loading-screen">Loading icons…</div>
        )}
      </div>

      {/* Save Dialog (session-only fallback) */}
      {showSaveDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>{t('dialog.save.title')}</h2>
            <input
              type="text"
              placeholder={t('dialog.save.placeholder')}
              value={diagramName}
              onChange={(e) => {
                return setDiagramName(e.target.value);
              }}
              onKeyDown={(e) => {
                return e.key === 'Enter' && saveDiagram();
              }}
              autoFocus
            />
            <div className="dialog-buttons">
              <button onClick={saveDiagram}>{t('dialog.save.btnSave')}</button>
              <button
                onClick={() => {
                  return setShowSaveDialog(false);
                }}
              >
                {t('dialog.save.btnCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog (session-only fallback) */}
      {showLoadDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>{t('dialog.load.title')}</h2>
            <div className="diagram-list">
              {diagrams.length === 0 ? (
                <p>{t('dialog.load.noSavedDiagrams')}</p>
              ) : (
                diagrams.map((diagram) => {
                  return (
                    <div key={diagram.id} className="diagram-item">
                      <div>
                        <strong>{diagram.name}</strong>
                        <br />
                        <small>
                          {t('dialog.load.updated')}:{' '}
                          {new Date(diagram.updatedAt).toLocaleString()}
                        </small>
                      </div>
                      <div className="diagram-actions">
                        <button
                          onClick={() => {
                            return loadDiagram(diagram, false);
                          }}
                        >
                          {t('dialog.load.btnLoad')}
                        </button>
                        <button
                          onClick={() => {
                            return deleteDiagram(diagram.id);
                          }}
                        >
                          {t('dialog.load.btnDelete')}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="dialog-buttons">
              <button
                onClick={() => {
                  return setShowLoadDialog(false);
                }}
              >
                {t('dialog.load.btnClose')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>{t('dialog.export.title')}</h2>
            <div
              style={{
                backgroundColor: '#d4edda',
                border: '1px solid #c3e6cb',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '20px'
              }}
            >
              <p style={{ margin: '0 0 10px 0' }}>
                <strong>✅ {t('dialog.export.recommendedTitle')}:</strong>{' '}
                {t('dialog.export.recommendedMessage')}
              </p>
              <p style={{ margin: 0, fontSize: '14px', color: '#155724' }}>
                {t('dialog.export.noteMessage')}
              </p>
            </div>
            <div className="dialog-buttons">
              <button onClick={exportDiagram}>
                {t('dialog.export.btnDownload')}
              </button>
              <button
                onClick={() => {
                  return setShowExportDialog(false);
                }}
              >
                {t('dialog.export.btnCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Storage Manager */}
      {showStorageManager && (
        <StorageManager
          onClose={() => {
            return setShowStorageManager(false);
          }}
        />
      )}

      {/* Save As Dialog (server — new diagram) */}
      {showSaveAsDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>Save Diagram</h2>
            <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
              Choose a name to save this diagram.
            </p>
            <input
              type="text"
              placeholder="File name"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveAs()}
              autoFocus
            />
            <div className="dialog-buttons">
              <button onClick={handleSaveAs}>Save</button>
              <button onClick={() => { setShowSaveAsDialog(false); setSaveAsName(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Diagram Manager */}
      {showDiagramManager && (
        <DiagramManager
          storage={storage!}
          isServerStorage={isStorageServer}
          onLoadDiagram={handleDiagramManagerLoad}
          onClose={() => setShowDiagramManager(false)}
        />
      )}

      <DiagnosticsOverlay />

      {/* Save confirmation toast */}
      {saveToast && (
        <div className="save-toast">✓ {saveToast} saved</div>
      )}
    </div>
  );
}

export default App;
