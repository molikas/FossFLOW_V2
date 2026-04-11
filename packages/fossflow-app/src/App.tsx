import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Isoflow, transformFromCompactFormat } from 'fossflow';
import { flattenCollections } from '@isoflow/isopacks/dist/utils';
import isoflowIsopack from '@isoflow/isopacks/dist/isoflow';
import { useTranslation } from 'react-i18next';
import { Alert } from '@mui/material';
import { DiagramData } from './diagramUtils';
import { StorageManager } from './StorageManager';
import { DiagramManager } from './components/DiagramManager';
import { DiagnosticsOverlay } from './components/DiagnosticsOverlay';
import { AppToolbar } from './components/AppToolbar';
import { SaveDialog } from './components/SaveDialog';
import { LoadDialog } from './components/LoadDialog';
import { ExportDialog } from './components/ExportDialog';
import { SaveAsDialog } from './components/SaveAsDialog';
import { useStorage } from './services/storageService';
import type { IsoflowRef } from 'fossflow';
import ChangeLanguage from './components/ChangeLanguage';
import { allLocales } from 'fossflow';
import { useIconPackManager } from './services/iconPackManager';
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
  const publicUrl = process.env.PUBLIC_URL || '';
  const basename = publicUrl
    ? publicUrl.endsWith('/')
      ? publicUrl.slice(0, -1)
      : publicUrl
    : '/';

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
  const iconPackManager = useIconPackManager(coreIcons);
  const { readonlyDiagramId } = useParams<{ readonlyDiagramId: string }>();
  const { t, i18n } = useTranslation('app');

  const isoflowRef = useRef<IsoflowRef>(null);
  const [toolbarPortalTarget, setToolbarPortalTarget] = useState<HTMLElement | null>(null);
  const [sidebarTogglePortalTarget, setSidebarTogglePortalTarget] = useState<HTMLElement | null>(null);

  const {
    storage,
    isServerStorage: isStorageServer,
    isInitialized: isStorageInitialized
  } = useStorage();

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

  // ---------------------------------------------------------------------------
  // Model / save state
  // ---------------------------------------------------------------------------
  const [currentModel, setCurrentModel] = useState<DiagramData | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [sessionWarningDismissed, setSessionWarningDismissed] = useState(
    () => sessionStorage.getItem('foss-session-warning-dismissed') === '1'
  );

  const serverStorageAvailable = isStorageServer && isStorageInitialized;
  const isReadonlyUrl =
    window.location.pathname.startsWith('/display/') && !!readonlyDiagramId;

  // ---------------------------------------------------------------------------
  // Default data
  // ---------------------------------------------------------------------------
  const defaultColors = [
    { id: 'blue', value: '#0066cc' },
    { id: 'green', value: '#00aa00' },
    { id: 'red', value: '#cc0000' },
    { id: 'orange', value: '#ff9900' },
    { id: 'purple', value: '#9900cc' },
    { id: 'black', value: '#000000' },
    { id: 'gray', value: '#666666' }
  ];

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
        setCurrentModel(dataWithIcons);
        setLastSaved(new Date(readonlyDiagram.updatedAt));
        isAfterLoadRef.current = true;
        isoflowRef.current?.load(dataWithIcons);
      } catch (_error) {
        alert(t('dialog.readOnly.failed'));
        window.location.href = '/';
      }
    };
    loadReadonlyDiagram();
  }, [readonlyDiagramId, storage]);

  // ---------------------------------------------------------------------------
  // Reload icon packs when they change (skip initial mount to avoid StrictMode double-fire)
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
    isoflowRef.current.load({ ...currentModelRef.current, icons: mergedIcons });
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
        const lastDiagram = allDiagrams.find((d: SavedDiagram) => d.id === lastOpenedId);
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
        alert(t('alert.quotaExceeded'));
      }
    }
  }, [diagrams]);

  // ---------------------------------------------------------------------------
  // Auto-dismiss save toast
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!saveToast) return;
    const timer = setTimeout(() => setSaveToast(null), 2500);
    return () => clearTimeout(timer);
  }, [saveToast]);

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
  // Session-mode save/load/delete
  // ---------------------------------------------------------------------------
  const saveDiagram = () => {
    if (!diagramName.trim()) {
      alert(t('alert.enterDiagramName'));
      return;
    }
    const existingDiagram = diagrams.find(
      (d) => d.name === diagramName.trim() && d.id !== currentDiagram?.id
    );
    if (existingDiagram) {
      if (!window.confirm(t('alert.diagramExists', { name: diagramName }))) return;
    }
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
    setSaveToast(diagramName);
    try {
      localStorage.setItem('fossflow-last-opened', newDiagram.id);
      localStorage.setItem('fossflow-last-opened-data', JSON.stringify(newDiagram.data));
    } catch (e) {
      console.error('Failed to save diagram:', e);
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        alert(t('alert.storageFull'));
        setShowStorageManager(true);
      }
    }
  };

  const loadDiagram = async (diagram: SavedDiagram, skipUnsavedCheck = false) => {
    if (!skipUnsavedCheck && hasUnsavedChanges && !window.confirm(t('alert.unsavedChanges'))) {
      return;
    }
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
    isoflowRef.current?.load(dataWithIcons);
    try {
      localStorage.setItem('fossflow-last-opened', diagram.id);
      localStorage.setItem('fossflow-last-opened-data', JSON.stringify(diagram.data));
    } catch (e) {
      console.error('Failed to save last opened:', e);
    }
  };

  const deleteDiagram = (id: string) => {
    if (window.confirm(t('alert.confirmDelete'))) {
      setDiagrams(diagrams.filter((d) => d.id !== id));
      if (currentDiagram?.id === id) {
        setCurrentDiagram(null);
        setDiagramName('');
      }
    }
  };

  const exportDiagram = () => {
    const modelToExport = currentModel || diagramData;
    const iconMap = new Map();
    (modelToExport.icons || []).forEach((icon) => iconMap.set(icon.id, icon));
    (diagramData.icons || [])
      .filter((icon) => icon.collection === 'imported')
      .forEach((icon) => { if (!iconMap.has(icon.id)) iconMap.set(icon.id, icon); });
    const exportData = {
      title: diagramName || modelToExport.title || 'Exported Diagram',
      icons: Array.from(iconMap.values()),
      colors: modelToExport.colors || [],
      items: modelToExport.items || [],
      views: modelToExport.views || [],
      fitToScreen: true
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagramName || 'diagram'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDialog(false);
    setHasUnsavedChanges(false);
  };

  // ---------------------------------------------------------------------------
  // Server-mode diagram manager callbacks
  // ---------------------------------------------------------------------------
  const handleDiagramManagerLoad = async (id: string, rawData: any, listingName: string) => {
    // Detect and expand compact format ({"t":..., "i":..., "v":..., "_":{"f":"compact"}})
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
      : [...iconPackManager.loadedIcons,
         ...loadedIcons.filter((icon: any) => icon.collection === 'imported')];

    // Use the listing name (always correct) rather than whatever field exists in raw data
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
    isoflowRef.current?.load(mergedData);
    if (!hasDefaultIcons && storage) {
      storage.saveDiagram(id, mergedData as any).catch(() => {});
    }
  };

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
          setSaveToast(currentDiagram.name);
        } catch (e) {
          console.error('Save failed:', e);
          alert('Failed to save diagram. Please try again.');
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
  }, [serverStorageAvailable, storage, currentDiagram, buildSaveData, currentModel]);

  const handleSaveAs = async () => {
    if (!saveAsName.trim() || !storage) return;
    try {
      const name = saveAsName.trim();
      const data = { ...buildSaveData(), name, title: name };
      const id = await storage.createDiagram(data as any);
      const saved: SavedDiagram = {
        id, name, data,
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

  const handlePreviewClick = useCallback(async () => {
    if (!serverStorageAvailable || !currentDiagram || !storage) return;
    if (hasUnsavedChanges) {
      try {
        const data = buildSaveData();
        await storage.saveDiagram(currentDiagram.id, data as any);
        setHasUnsavedChanges(false);
        setLastSaved(new Date());
        setSaveToast(currentDiagram.name);
      } catch (e) {
        console.error('Save before preview failed:', e);
        alert('Failed to save before preview. Please try again.');
        return;
      }
    }
    window.open(`/display/${currentDiagram.id}`, '_blank');
  }, [serverStorageAvailable, currentDiagram, storage, hasUnsavedChanges, buildSaveData]);

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
  // Icon pack manager props (memoised to avoid render cascades)
  // ---------------------------------------------------------------------------
  const handleTogglePack = useCallback(
    (packName: string, enabled: boolean) => {
      iconPackManager.togglePack(packName as any, enabled);
    },
    [iconPackManager.togglePack]
  );

  // Set once on first render with whatever icons are available at that moment
  // (core icons always, plus any packs already loaded). Subsequent pack loads
  // update the canvas via the iconPackManager.loadedIcons effect below.
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

  const currentLocale =
    allLocales[i18n.language as keyof typeof allLocales] || allLocales['en-US'];

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
    if (isAfterLoadRef.current) {
      isAfterLoadRef.current = false;
      return;
    }
    // Sync toolbar name when the library's own New/Open changed the model title.
    // This happens when the user picks "New Diagram" or "Open file" from the
    // library's MainMenu — those actions bypass App.tsx's handlers entirely.
    if (model.title && model.title !== diagramName) {
      setDiagramName(model.title);
      setCurrentDiagram(null);  // old save reference is no longer valid
      setLastSaved(null);
    }
    if (!isReadonlyUrl) setHasUnsavedChanges(true);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="App">
      <AppToolbar
        diagramName={diagramName}
        hasUnsavedChanges={hasUnsavedChanges}
        lastSaved={lastSaved}
        isReadonlyUrl={isReadonlyUrl}
        serverStorageAvailable={serverStorageAvailable}
        currentDiagramId={currentDiagram?.id}
        onToolbarPortalReady={setToolbarPortalTarget}
        onSidebarTogglePortalReady={setSidebarTogglePortalTarget}
        onSaveClick={handleSaveClick}
        onOpenClick={handleOpenClick}
        onPreviewClick={handlePreviewClick}
      />

      {!serverStorageAvailable && !isReadonlyUrl && !sessionWarningDismissed && (
        <Alert
          severity="warning"
          onClose={() => {
            setSessionWarningDismissed(true);
            sessionStorage.setItem('foss-session-warning-dismissed', '1');
          }}
          sx={{ borderRadius: 0, py: 0.5, fontSize: 12 }}
        >
          {t(
            'status.sessionStorageNote',
            'Session storage only — diagrams will be lost when you close this tab. Use a server backend for persistence.'
          )}
        </Alert>
      )}

      <div className="fossflow-container">
        <Isoflow
          ref={isoflowRef}
          initialData={frozenInitialDataRef.current}
          onModelUpdated={handleModelUpdated}
          editorMode={isReadonlyUrl ? 'EXPLORABLE_READONLY' : 'EDITABLE'}
          locale={currentLocale}
          iconPackManager={iconPackManagerProp}
          toolbarPortalTarget={toolbarPortalTarget}
          sidebarTogglePortalTarget={sidebarTogglePortalTarget}
          languageSelector={<ChangeLanguage />}
        />
      </div>

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
        <ExportDialog onExport={exportDiagram} onClose={() => setShowExportDialog(false)} />
      )}

      {showSaveAsDialog && (
        <SaveAsDialog
          name={saveAsName}
          onNameChange={setSaveAsName}
          onSave={handleSaveAs}
          onClose={() => { setShowSaveAsDialog(false); setSaveAsName(''); }}
        />
      )}

      {showStorageManager && (
        <StorageManager onClose={() => setShowStorageManager(false)} />
      )}

      {showDiagramManager && (
        <DiagramManager
          storage={storage!}
          isServerStorage={isStorageServer}
          onLoadDiagram={handleDiagramManagerLoad}
          onClose={() => setShowDiagramManager(false)}
        />
      )}

      <DiagnosticsOverlay />

      {saveToast && <div className="save-toast">✓ {saveToast} saved</div>}
    </div>
  );
}

export default App;
