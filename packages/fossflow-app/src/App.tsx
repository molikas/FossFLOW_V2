import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Isoflow, allLocales } from 'fossflow';
import { AppStorageProvider, useAppStorage } from './providers/AppStorageContext';
import {
  DiagramLifecycleProvider,
  useDiagramLifecycle
} from './providers/DiagramLifecycleProvider';
import { FileExplorerLayout } from './layout/FileExplorerLayout';
import { AppToolbar } from './components/AppToolbar';
import { EmptyStateScreen } from './components/EmptyStateScreen';
import { DiagnosticsOverlay } from './components/DiagnosticsOverlay';
import { DiagnosticsToggleButton } from './components/DiagnosticsToggleButton';
import { NotificationStack } from './components/NotificationStack';
import { notificationStore } from './stores/notificationStore';
import ChangeLanguage from './components/ChangeLanguage';
import './App.css';

const publicUrl = process.env.PUBLIC_URL || '';
const basename = publicUrl
  ? publicUrl.endsWith('/')
    ? publicUrl.slice(0, -1)
    : publicUrl
  : '/';

// Stable reference — prevents Isoflow's useEffect([mainMenuOptions]) from firing on
// every EditorShell re-render (which would call setEditorMode and reset the tool mode).
const MAIN_MENU_OPTIONS = [
  // ACTION.NEW is intentionally excluded — FossFlow owns "New diagram"
  // via its own toolbar button so it can flush auto-save first.
  'ACTION.OPEN',
  'EXPORT.JSON',
  'EXPORT.PNG',
  'ACTION.CLEAR_CANVAS',
  'LINK.GITHUB',
  'VERSION'
] as const;

function App() {
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
  return (
    <AppStorageProvider>
      <DiagramLifecycleProvider>
        <EditorShell />
      </DiagramLifecycleProvider>
    </AppStorageProvider>
  );
}

function EditorShell() {
  const { t, i18n } = useTranslation('app');
  const { storage, serverStorageAvailable, isInitialized } = useAppStorage();
  const {
    isoflowRef,
    frozenInitialDataRef,
    iconPackManagerProp,
    handleModelUpdated,
    handleCreateBlankDiagram,
    toolbarPortalTarget,
    sidebarTogglePortalTarget,
    isReadonlyUrl,
    currentDiagram,
    fileTreeRefreshToken
  } = useDiagramLifecycle();

  const [linkedDiagrams, setLinkedDiagrams] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!storage || !isInitialized) return;
    // Re-fetch whenever the file tree refreshes (diagram created/deleted/renamed)
    // or when the current diagram changes (covers session-mode saves).
    storage.listDiagrams().then((list) => {
      setLinkedDiagrams(list.map((d) => ({ id: d.id, name: d.name })));
    }).catch(() => {});
  }, [storage, isInitialized, fileTreeRefreshToken, currentDiagram]);

  const currentLocale =
    allLocales[i18n.language as keyof typeof allLocales] || allLocales['en-US'];

  const sessionWarnPushedRef = useRef(false);
  useEffect(() => {
    if (!isInitialized) return; // wait until storage check completes before deciding
    if (!serverStorageAvailable && !isReadonlyUrl && !sessionWarnPushedRef.current) {
      sessionWarnPushedRef.current = true;
      notificationStore.push({
        severity: 'warning',
        persistent: true,
        message: t(
          'status.sessionStorageNote',
          'Session storage only — diagrams will be lost when you close this tab. Use a server backend for persistence.'
        )
      });
    }
  }, [serverStorageAvailable, isInitialized, isReadonlyUrl, t]);

  // Don't render canvas until storage init completes — prevents onboarding hints from
  // briefly appearing before EmptyStateScreen takes over.
  if (!isInitialized) return null;

  return (
    <div className="App">
      <AppToolbar />

      <FileExplorerLayout>
        <div className="fossflow-container" style={{ position: 'relative' }}>
          <Isoflow
            ref={isoflowRef}
            initialData={frozenInitialDataRef.current}
            onModelUpdated={handleModelUpdated}
            editorMode={isReadonlyUrl ? 'EXPLORABLE_READONLY' : 'EDITABLE'}
            locale={currentLocale}
            iconPackManager={iconPackManagerProp}
            linkedDiagrams={linkedDiagrams}
            toolbarPortalTarget={toolbarPortalTarget}
            sidebarTogglePortalTarget={sidebarTogglePortalTarget}
            languageSelector={<ChangeLanguage />}
            bottomDockEnd={<DiagnosticsToggleButton />}
            suppressOnboardingHints={!!currentDiagram || isReadonlyUrl}
            mainMenuOptions={MAIN_MENU_OPTIONS}
          />
          {serverStorageAvailable && !currentDiagram && !isReadonlyUrl && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
              <EmptyStateScreen onCreate={() => handleCreateBlankDiagram(null)} />
            </div>
          )}
        </div>
      </FileExplorerLayout>

      <DiagnosticsOverlay />
      <NotificationStack />
    </div>
  );
}

export default App;
