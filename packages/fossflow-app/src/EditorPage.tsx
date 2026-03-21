import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Isoflow } from 'fossflow';
import { flattenCollections } from '@isoflow/isopacks/dist/utils';
import isoflowIsopack from '@isoflow/isopacks/dist/isoflow';
import { useTranslation } from 'react-i18next';
import { DiagramData, mergeDiagramData, extractSavableData } from './diagramUtils';
import { StorageManager } from './StorageManager';
import { DiagramManager } from './components/DiagramManager';
import { storageManager } from './services/storageService';
import ChangeLanguage from './components/ChangeLanguage';
import { allLocales } from 'fossflow';
import { useIconPackManager, IconPackName } from './services/iconPackManager';
import './App.css';

// Load core isoflow icons (always loaded)
const coreIcons = flattenCollections([isoflowIsopack]);


interface SavedDiagram {
  id: string;
  name: string;
  data: any;
  createdAt: string;
  updatedAt: string;
}

// Stable module-level constant — must NOT be inside the component to avoid new references on every render
const emptyDiagramData: DiagramData = {
  title: 'Untitled Diagram',
  version: '',
  icons: [],
  colors: [
    { id: 'blue', value: '#0066cc' },
    { id: 'green', value: '#00aa00' },
    { id: 'red', value: '#cc0000' },
    { id: 'orange', value: '#ff6600' },
    { id: 'purple', value: '#9900cc' },
    { id: 'grey', value: '#666666' }
  ],
  items: [],
  views: []
};

function EditorPage() {
  // Get readonly diagram ID from route params
  const { readonlyDiagramId } = useParams<{ readonlyDiagramId: string }>();
  const navigate = useNavigate();

  // Check if we're in readonly mode based on the URL
  const isReadonlyUrl = window.location.pathname.includes('/display/') && readonlyDiagramId;

  // Log warning if in display mode
  useEffect(() => {
    if (isReadonlyUrl) {
      console.warn('FossFLOW is running in read-only display mode. Editing is disabled.');
      console.log(`Viewing diagram: ${readonlyDiagramId}`);
    }
  }, [isReadonlyUrl, readonlyDiagramId]);

  // Initialize icon pack manager with core icons
  const iconPackManager = useIconPackManager(coreIcons);

  const [diagrams, setDiagrams] = useState<SavedDiagram[]>([]);
  const [currentDiagram, setCurrentDiagram] = useState<SavedDiagram | null>(null);
  const [diagramName, setDiagramName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [fossflowKey, setFossflowKey] = useState(0); // Key to force re-render of FossFLOW
  const [currentModel, setCurrentModel] = useState<DiagramData | null>(null); // Store current model state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [showStorageManager, setShowStorageManager] = useState(false);
  const [showDiagramManager, setShowDiagramManager] = useState(false);
  const [serverStorageAvailable, setServerStorageAvailable] = useState(false);

  const [diagramData, setDiagramData] = useState<DiagramData>(emptyDiagramData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  // Load diagram for readonly mode
  useEffect(() => {
    if (isReadonlyUrl && readonlyDiagramId) {
      // Initialize storage and load diagram
      storageManager.initialize().then(async () => {
        try {
          const storage = storageManager.getStorage();
          const diagramData = await storage.loadDiagram(readonlyDiagramId);

          if (diagramData) {
            const mergedData = mergeDiagramData(emptyDiagramData, diagramData);
            setDiagramData(mergedData);
            setCurrentDiagram({
              id: readonlyDiagramId,
              name: diagramData.name || 'Diagram',
              data: mergedData,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            setDiagramName(diagramData.name || 'Diagram');
            setFossflowKey(prevKey => prevKey + 1);
          }
        } catch (error) {
          console.error(`Failed to load diagram with ID: ${readonlyDiagramId}`, error);
          // Redirect to home if diagram not found
          navigate('/');
        }
      }).catch(error => {
        console.error('Error initializing storage:', error);
        navigate('/');
      });
    }
  }, [readonlyDiagramId, isReadonlyUrl]);

  // Check server storage availability
  useEffect(() => {
    storageManager.initialize().then((storage) => {
      setServerStorageAvailable(storageManager.isServerStorage());
    });
  }, []);

  // Load saved diagrams from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('fossflow_diagrams');
    if (saved) {
      try {
        const parsedDiagrams = JSON.parse(saved);
        setDiagrams(parsedDiagrams);
      } catch (error) {
        console.error('Failed to parse saved diagrams:', error);
      }
    }
  }, []);

  // Auto-save to localStorage every 30 seconds if there are unsaved changes.
  // JSON.stringify is deferred to a browser-idle moment via requestIdleCallback
  // so it cannot block an active user interaction.
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (hasUnsavedChanges && currentModel && !isReadonlyUrl) {
        const snapshot = {
          ...currentDiagram,
          data: currentModel,
          updatedAt: new Date().toISOString()
        };
        const doSave = () => {
          localStorage.setItem('fossflow_autosave', JSON.stringify(snapshot));
          setLastAutoSave(new Date());
          console.log('Auto-saved to localStorage');
        };
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(doSave, { timeout: 5000 });
        } else {
          setTimeout(doSave, 0);
        }
      }
    }, 30000); // 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [hasUnsavedChanges, currentModel, currentDiagram, isReadonlyUrl]);

  // Load auto-save on mount
  useEffect(() => {
    if (!isReadonlyUrl) {
      const autoSaveData = localStorage.getItem('fossflow_autosave');
      if (autoSaveData) {
        try {
          const parsed = JSON.parse(autoSaveData);
          if (window.confirm('An auto-saved diagram was found. Would you like to restore it?')) {
            const mergedData = mergeDiagramData(diagramData, parsed.data);
            setDiagramData(mergedData);
            setCurrentModel(mergedData);
            setDiagramName(parsed.name || '');
            setCurrentDiagram(parsed);
            setFossflowKey(prevKey => prevKey + 1);
            localStorage.removeItem('fossflow_autosave'); // Clear auto-save after restoring
          }
        } catch (error) {
          console.error('Failed to parse auto-save data:', error);
        }
      }
    }
  }, []);

  // Warn before leaving if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && !isReadonlyUrl) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isReadonlyUrl]);

  const handleModelUpdated = useCallback((model: any) => {
    setCurrentModel(model);
    if (!isReadonlyUrl) {
      setHasUnsavedChanges(true);
    }
  }, [isReadonlyUrl]);

  const saveDiagram = () => {
    if (!diagramName.trim()) {
      alert('Please enter a name for the diagram');
      return;
    }

    const diagramToSave = currentModel || diagramData;
    const savableData = extractSavableData(diagramToSave);

    const newDiagram: SavedDiagram = currentDiagram ? {
      ...currentDiagram,
      name: diagramName,
      data: savableData,
      updatedAt: new Date().toISOString()
    } : {
      id: Date.now().toString(),
      name: diagramName,
      data: savableData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updatedDiagrams = currentDiagram
      ? diagrams.map(d => d.id === currentDiagram.id ? newDiagram : d)
      : [...diagrams, newDiagram];

    setDiagrams(updatedDiagrams);
    localStorage.setItem('fossflow_diagrams', JSON.stringify(updatedDiagrams));
    setCurrentDiagram(newDiagram);
    setShowSaveDialog(false);
    setHasUnsavedChanges(false);
    // Clear auto-save after successful save
    localStorage.removeItem('fossflow_autosave');
  };

  const loadDiagram = (diagram: SavedDiagram) => {
    const mergedData = mergeDiagramData(diagramData, diagram.data);
    setDiagramData(mergedData);
    setCurrentModel(mergedData);
    setCurrentDiagram(diagram);
    setDiagramName(diagram.name);
    setShowLoadDialog(false);
    setHasUnsavedChanges(false);
    setFossflowKey(prevKey => prevKey + 1); // Force re-render FossFLOW
  };

  const deleteDiagram = (id: string) => {
    if (window.confirm('Are you sure you want to delete this diagram?')) {
      const updatedDiagrams = diagrams.filter(d => d.id !== id);
      setDiagrams(updatedDiagrams);
      localStorage.setItem('fossflow_diagrams', JSON.stringify(updatedDiagrams));

      if (currentDiagram?.id === id) {
        setCurrentDiagram(null);
        setDiagramName('');
      }
    }
  };

  const exportDiagram = () => {
    const diagramToExport = currentModel || diagramData;
    const savableData = extractSavableData(diagramToExport);

    const exportData = {
      name: diagramName || 'fossflow-diagram',
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: savableData
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagramName || 'fossflow-diagram'}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();

    // Safely remove the temporary element
    try {
      if (a.parentNode === document.body) {
        document.body.removeChild(a);
      }
    } catch (err) {
      console.warn('Failed to remove temporary download link:', err);
    }

    URL.revokeObjectURL(url);
    setShowExportDialog(false);
  };

  const importDiagram = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        // Merge the imported data with default data structure
        const mergedData = mergeDiagramData(diagramData, parsed.data || parsed);

        setDiagramData(mergedData);
        setCurrentModel(mergedData);
        setDiagramName(parsed.name || '');
        setHasUnsavedChanges(true);
        setFossflowKey(prevKey => prevKey + 1); // Force re-render FossFLOW

        // Reset the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Failed to import diagram:', error);
        alert('Failed to import diagram. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  const createNewDiagram = () => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Do you want to continue?')) {
      return;
    }

    setDiagramData(emptyDiagramData);
    setCurrentModel(null);
    setCurrentDiagram(null);
    setDiagramName('');
    setHasUnsavedChanges(false);
    setFossflowKey(prevKey => prevKey + 1); // Force re-render FossFLOW
    // Clear auto-save when creating new diagram
    localStorage.removeItem('fossflow_autosave');
  };

  const handleDiagramManagerLoad = (id: string, data: any) => {
    console.log('[Load] handleDiagramManagerLoad called', { id, title: data?.title, views: data?.views?.length, items: data?.items?.length });
    try {
      if (!data) {
        console.error('[Load] data is null/undefined for id:', id);
        return;
      }
      // Use emptyDiagramData as the fallback base so we never inherit stale fields from a prior load
      const base = { title: '', icons: [], colors: [], items: [], views: [] };
      const mergedData = mergeDiagramData(base as any, data);
      console.log('[Load] merged title:', mergedData.title, 'views:', mergedData.views?.length, 'items:', mergedData.items?.length);
      setDiagramData(mergedData);
      setCurrentModel(mergedData);
      setCurrentDiagram({
        id,
        name: data.name || data.title || '',
        data: mergedData,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || data.lastModified || new Date().toISOString()
      });
      setDiagramName(data.name || data.title || '');
      setHasUnsavedChanges(false);
      setFossflowKey(prevKey => {
        const next = prevKey + 1;
        console.log('[Load] fossflowKey:', prevKey, '->', next);
        return next;
      });
      // Note: DiagramManager closes itself via onClose() — no need to call setShowDiagramManager here
    } catch (err) {
      console.error('[Load] handleDiagramManagerLoad failed:', err);
    }
  };

  return (
    <div className="App">
      <div className="toolbar">
        {!isReadonlyUrl ? (
          <>
            <button onClick={createNewDiagram} title={t('toolbar.new')}>
              📄 {t('toolbar.new')}
            </button>
            <button onClick={() => { if (!diagramName) setDiagramName(currentModel?.title || ''); setShowSaveDialog(true); }} title={t('toolbar.save')}>
              💾 {t('toolbar.save')}
            </button>
            <button onClick={() => setShowLoadDialog(true)} title={t('toolbar.load')}>
              📁 {t('toolbar.load')}
            </button>
            <button onClick={() => setShowExportDialog(true)} title={t('toolbar.export')}>
              ⬇️ {t('toolbar.export')}
            </button>
            <button onClick={() => fileInputRef.current?.click()} title={t('toolbar.import')}>
              ⬆️ {t('toolbar.import')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={importDiagram}
            />

            {serverStorageAvailable && (
              <>
                <div className="toolbar-separator" />
                <button onClick={() => setShowDiagramManager(true)} title={t('toolbar.serverStorage')}>
                  ☁️ {t('toolbar.serverStorage')}
                </button>
                <button onClick={() => setShowStorageManager(true)} title={t('toolbar.storageSettings')}>
                  ⚙️ {t('toolbar.storageSettings')}
                </button>
              </>
            )}

            <div className="toolbar-separator" />

            <span className="diagram-info">
              {currentDiagram ? `${t('toolbar.current')}: ${diagramName}` : t('toolbar.untitled')}
              {hasUnsavedChanges && ' *'}
            </span>

            {lastAutoSave && (
              <span className="auto-save-info">
                {t('toolbar.autoSaved')}: {lastAutoSave.toLocaleTimeString()}
              </span>
            )}
          </>
        ) : (
          <div className="readonly-badge">
            👁️ {t('dialog.readOnly.mode')} - {diagramName || readonlyDiagramId}
          </div>
        )}

        <div className="toolbar-right">
          <ChangeLanguage locales={allLocales} />
        </div>
      </div>

      <div className="main-content">
        <Isoflow
          key={fossflowKey}
          initialData={diagramData}
          onModelUpdated={handleModelUpdated}
          editorMode={isReadonlyUrl ? 'EXPLORABLE_READONLY' : 'EDITABLE'}
          icons={iconPackManager.icons}
          config={{
            onTogglePack: (packName: string, enabled: boolean) => {
              iconPackManager.togglePack(packName as any, enabled);
            }
          }}
        />
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>{t('dialog.save.title')}</h2>
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeeba',
              padding: '15px',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <strong>⚠️ {t('dialog.save.warningTitle')}:</strong> {t('dialog.save.warningMessage')}
              <br />
              <span dangerouslySetInnerHTML={{ __html: t('dialog.save.warningExport') }} />
            </div>
            <input
              type="text"
              placeholder={t('dialog.save.placeholder')}
              value={diagramName}
              onChange={(e) => setDiagramName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveDiagram()}
              autoFocus
            />
            <div className="dialog-buttons">
              <button onClick={saveDiagram}>{t('dialog.save.btnSave')}</button>
              <button onClick={() => setShowSaveDialog(false)}>{t('dialog.save.btnCancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>{t('dialog.load.title')}</h2>
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeeba',
              padding: '15px',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <strong>⚠️ {t('dialog.load.noteTitle')}:</strong> {t('dialog.load.noteMessage')}
            </div>
            <div className="diagram-list">
              {diagrams.length === 0 ? (
                <p>{t('dialog.load.noSavedDiagrams')}</p>
              ) : (
                diagrams.map(diagram => (
                  <div key={diagram.id} className="diagram-item">
                    <div>
                      <strong>{diagram.name}</strong>
                      <br />
                      <small>{t('dialog.load.updated')}: {new Date(diagram.updatedAt).toLocaleString()}</small>
                    </div>
                    <div className="diagram-actions">
                      <button onClick={() => loadDiagram(diagram)}>{t('dialog.load.btnLoad')}</button>
                      <button onClick={() => deleteDiagram(diagram.id)}>{t('dialog.load.btnDelete')}</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="dialog-buttons">
              <button onClick={() => setShowLoadDialog(false)}>{t('dialog.load.btnClose')}</button>
            </div>
          </div>
        </div>
      )}


      {/* Export Dialog */}
      {showExportDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>{t('dialog.export.title')}</h2>
            <div style={{
              backgroundColor: '#d4edda',
              border: '1px solid #c3e6cb',
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <p style={{ margin: '0 0 10px 0' }}>
                <strong>✅ {t('dialog.export.recommendedTitle')}:</strong> {t('dialog.export.recommendedMessage')}
              </p>
              <p style={{ margin: 0, fontSize: '14px', color: '#155724' }}>
                {t('dialog.export.noteMessage')}
              </p>
            </div>
            <div className="dialog-buttons">
              <button onClick={exportDiagram}>{t('dialog.export.btnDownload')}</button>
              <button onClick={() => setShowExportDialog(false)}>{t('dialog.export.btnCancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Storage Manager */}
      {showStorageManager && (
        <StorageManager onClose={() => setShowStorageManager(false)} />
      )}

      {/* Diagram Manager */}
      {showDiagramManager && (
        <DiagramManager
          onLoadDiagram={handleDiagramManagerLoad}
          currentDiagramId={currentDiagram?.id}
          currentDiagramData={currentModel || diagramData}
          onClose={() => setShowDiagramManager(false)}
        />
      )}

    </div>
  );
}

export default EditorPage;