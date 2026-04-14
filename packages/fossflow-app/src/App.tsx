import { useEffect, useRef } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Isoflow, allLocales } from 'fossflow';
import { AppStorageProvider, useAppStorage } from './providers/AppStorageContext';
import {
  DiagramLifecycleProvider,
  useDiagramLifecycle
} from './providers/DiagramLifecycleProvider';
import { AppToolbar } from './components/AppToolbar';
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
  const { serverStorageAvailable } = useAppStorage();
  const {
    isoflowRef,
    frozenInitialDataRef,
    iconPackManagerProp,
    handleModelUpdated,
    toolbarPortalTarget,
    sidebarTogglePortalTarget,
    isReadonlyUrl
  } = useDiagramLifecycle();

  const currentLocale =
    allLocales[i18n.language as keyof typeof allLocales] || allLocales['en-US'];

  const sessionWarnPushedRef = useRef(false);
  useEffect(() => {
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
  }, [serverStorageAvailable, isReadonlyUrl, t]);

  return (
    <div className="App">
      <AppToolbar />

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
          bottomDockEnd={<DiagnosticsToggleButton />}
        />
      </div>

      <DiagnosticsOverlay />
      <NotificationStack />
    </div>
  );
}

export default App;
