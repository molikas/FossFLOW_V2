import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert } from '@mui/material';
import { Isoflow, allLocales } from 'fossflow';
import { AppStorageProvider, useAppStorage } from './providers/AppStorageContext';
import {
  DiagramLifecycleProvider,
  useDiagramLifecycle
} from './providers/DiagramLifecycleProvider';
import { AppToolbar } from './components/AppToolbar';
import { DiagnosticsOverlay } from './components/DiagnosticsOverlay';
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
    isReadonlyUrl,
    sessionWarningDismissed,
    setSessionWarningDismissed,
    saveToast
  } = useDiagramLifecycle();

  const currentLocale =
    allLocales[i18n.language as keyof typeof allLocales] || allLocales['en-US'];

  return (
    <div className="App">
      <AppToolbar />

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

      <DiagnosticsOverlay />

      {saveToast && <div className="save-toast">✓ {saveToast} saved</div>}
    </div>
  );
}

export default App;
