import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, IconButton, Tooltip } from '@mui/material';
import { ChevronLeft as CollapseIcon } from '@mui/icons-material';
import {
  Axoview,
  allLocales,
  type IconUsageReport
} from 'axoview';
import { scanIconUsage } from './services/iconUsage';
import { isPersistedDiagramBlob } from './services/storage/types';
import { AppStorageProvider, useAppStorage } from './providers/AppStorageContext';
import { AuthProvider } from './providers/AuthProvider';
import {
  DiagramLifecycleProvider,
  useDiagramLifecycle
} from './providers/DiagramLifecycleProvider';
import { DriveSetupGate } from './components/DriveSetupGate';
import { DriveDisplayGate } from './components/DriveDisplayGate';
import { MigrateSessionDialog } from './components/MigrateSessionDialog';
import { DriveAccessRequiredDialog } from './components/DriveAccessRequiredDialog';
import { useAuthStore } from './stores/authStore';
import { FileExplorer } from './components/fileExplorer/FileExplorer';
import { AppToolbar } from './components/AppToolbar';
import { EmptyStateScreen } from './components/EmptyStateScreen';
import { NotFound } from './components/NotFound';
import { dismissBootScreens } from './utils/bootScreen';
import { buildZipImportSummary } from './utils/importSummary';
import { APP_BASENAME } from './appBase';
import { DiagnosticsOverlay } from './components/DiagnosticsOverlay';
import { DiagnosticsToggleButton } from './components/DiagnosticsToggleButton';
import { NotificationStack } from './components/NotificationStack';
import { LocalModeBanner } from './components/LocalModeBanner';
import { LocalModeShareErrorDialog } from './components/LocalModeShareErrorDialog';
import { ReadonlyLoadErrorDialog } from './components/ReadonlyLoadErrorDialog';
import { PublicShareLoadErrorDialog } from './components/PublicShareLoadErrorDialog';
import { SaveErrorDialog } from './components/SaveErrorDialog';
import { ImportErrorDialog } from './components/ImportErrorDialog';
import { ExportProjectZipDialog } from './components/fileExplorer/ExportProjectZipDialog';
import { ImportDialog } from './components/fileExplorer/ImportDialog';
import { parseProject, importProject } from './services/project/projectZip';
import { notificationStore } from './stores/notificationStore';
import { diagnosticsStore } from './stores/diagnosticsStore';
import ChangeLanguage from './components/ChangeLanguage';
import './App.css';

// R1 (ADR 0040): the editor SPA mounts under /app (the marketing landing owns
// the site root). APP_BASENAME = `${PUBLIC_URL}/app`.
const basename = APP_BASENAME;

const EXPORTER_TAG = `axoview-app@${process.env.REACT_APP_VERSION ?? 'dev'}`;

function parseJsonOrThrow(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
}

// Prefer the diagram's embedded title/name; fall back to the file basename
// (minus the .json / .compact.json suffix).
function resolveImportedDiagramName(file: File, data: unknown): string {
  const blob = isPersistedDiagramBlob(data) ? data : {};
  const embedded = blob.title || blob.name || blob.t || '';
  const fileBase = file.name.replace(/\.(?:compact\.)?json$/i, '');
  return typeof embedded === 'string' && embedded.trim()
    ? embedded.trim()
    : fileBase;
}

function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/display/p/:shareUuid" element={<EditorPage />} />
        {/* ADR 0042 §2 — live Drive-file preview. The static `drive` segment
            ranks above :readonlyDiagramId, so the routes cannot collide. */}
        <Route path="/display/drive/:driveFileId" element={<EditorPage />} />
        <Route path="/display/:readonlyDiagramId" element={<EditorPage />} />
        {/* Any unknown path (e.g. a mistyped /whatever.html served to the SPA by
            the nginx/Pages fallback) renders a graceful 404 that clears the boot
            splash — previously such paths matched no route and spun forever. */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

function EditorPage() {
  return (
    <AppStorageProvider>
      <AuthProvider>
        <DiagramLifecycleProvider>
          <EditorShell />
        </DiagramLifecycleProvider>
      </AuthProvider>
    </AppStorageProvider>
  );
}

function EditorShell() {
  const { t, i18n } = useTranslation('app');
  const navigate = useNavigate();
  const {
    storage,
    serverStorageAvailable,
    remoteStorageActive,
    googleDriveConfigured,
    isInitialized
  } = useAppStorage();
  const authStatus = useAuthStore((s) => s.status);
  const signIn = useAuthStore((s) => s.signIn);
  const {
    axoviewRef,
    frozenInitialDataRef,
    iconPackManagerProp,
    handleModelUpdated,
    handleCreateBlankDiagram,
    sidebarTogglePortalTarget,
    styleControlsPortalTarget,
    isReadonlyUrl,
    isPublicShareUrl,
    readonlyLoadFailed,
    clearReadonlyLoadFailed,
    publicShareLoadFailed,
    clearPublicShareLoadFailed,
    saveError,
    clearSaveError,
    retrySave,
    currentDiagram,
    fileTreeRefreshToken,
    refreshFileTree,
    openDiagramById,
    fileExplorerOpen,
    setFileExplorerOpen,
    markProjectExported,
    isProjectExportOpen,
    closeProjectExport,
    currentModel
  } = useDiagramLifecycle();

  // When the perf-monitoring overlay is on, also expose the lib's read-only
  // store bridge (window.__axoview__) so DiagnosticsOverlay can read live
  // node/connector/textbox counts. The bridge is gated out of production builds
  // otherwise (lib Axoview.tsx) — which is why ni/nc/ntb logged 0 in the Docker
  // captures. Dev builds expose it regardless of this flag.
  const perfMonitoringEnabled = useSyncExternalStore(
    diagnosticsStore.subscribe,
    diagnosticsStore.getEnabled
  );

  // Workspace-wide icon usage scan injected into <Axoview>. The lib's
  // ElementsPanel calls this from the delete-imported-icon confirm flow.
  // Latest currentDiagram + currentModel are read via refs so the callback
  // identity stays stable across renders (otherwise the store-update effect
  // in Axoview would fire on every render).
  const scanRef = useRef({ storage, currentDiagram, currentModel });
  useEffect(() => {
    scanRef.current = { storage, currentDiagram, currentModel };
  }, [storage, currentDiagram, currentModel]);
  const iconUsageScan = useMemo(
    () =>
      async (iconId: string): Promise<IconUsageReport[]> => {
        const ctx = scanRef.current;
        if (!ctx.storage) return [];
        return scanIconUsage({
          storage: ctx.storage,
          iconId,
          currentDiagramId: ctx.currentDiagram?.id ?? null,
          currentDiagramName: ctx.currentDiagram?.name ?? null,
          currentDiagramItems:
            (ctx.currentModel as { items?: Array<{ icon?: string }> } | null)
              ?.items ?? null
        });
      },
    []
  );

  const [linkedDiagrams, setLinkedDiagrams] = useState<Array<{ id: string; name: string }>>([]);
  const [treeIsEmpty, setTreeIsEmpty] = useState(true);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importError, setImportError] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Lib dispatches two custom events for diagram-link affordances:
  // - `axoview-navigate-to-diagram` (from the NodePanel readonly link) →
  //   navigate to /display/<id> (readonly). Propagate the `fromEditor`
  //   location-state flag so the "Back to editing" button survives across
  //   readonly→readonly hops.
  // - `axoview-open-diagram-in-editor` (from the top-bar strip Link control's
  //   open-linked-diagram button) → swap the editor onto the
  //   linked diagram via openDiagramById (no URL change; same tab; stays
  //   in edit mode).
  const location = useLocation();
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const fromEditor = (location.state as { fromEditor?: boolean } | null)?.fromEditor;
      navigate(`/display/${id}`, fromEditor ? { state: { fromEditor: true } } : undefined);
    };
    window.addEventListener('axoview-navigate-to-diagram', handler);
    return () => window.removeEventListener('axoview-navigate-to-diagram', handler);
  }, [navigate, location.state]);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const meta = linkedDiagrams.find((d) => d.id === id);
      openDiagramById(id, meta?.name ?? 'Diagram');
    };
    window.addEventListener('axoview-open-diagram-in-editor', handler);
    return () => window.removeEventListener('axoview-open-diagram-in-editor', handler);
  }, [openDiagramById, linkedDiagrams]);

  const splashFadedRef = useRef(false);
  useEffect(() => {
    if (!isInitialized || splashFadedRef.current) return;
    splashFadedRef.current = true;
    // Fade out the boot splash now that the editor is live. Shared with the 404
    // route (NotFound) so every render path clears it identically.
    dismissBootScreens();
  }, [isInitialized]);

  useEffect(() => {
    if (!storage || !isInitialized) return;
    // Re-fetch whenever the file tree refreshes (diagram created/deleted/renamed)
    // or when the current diagram changes (covers session-mode saves).
    // Filter out the current diagram so the link picker cannot self-reference
    // (baseline finding #2 / B-2).
    Promise.all([
      storage.listDiagrams(),
      storage.listFolders()
    ]).then(([diagrams, folders]) => {
      const currentId = currentDiagram?.id;
      setLinkedDiagrams(
        diagrams
          .filter((d) => d.id !== currentId)
          .map((d) => ({ id: d.id, name: d.name }))
      );
      setTreeIsEmpty(diagrams.length === 0 && folders.length === 0);
    }).catch(() => {});
  }, [storage, isInitialized, fileTreeRefreshToken, currentDiagram]);

  const handleDirectImportFile = useCallback(async (file: File) => {
    if (!storage) return;
    try {
      const isZip = /\.zip$/i.test(file.name);
      if (isZip) {
        const parsed = await parseProject(file);
        const imported = await importProject({ storage }, parsed, {
          destination: { kind: 'root' }
        });
        refreshFileTree();
        setFileExplorerOpen(true);
        notificationStore.push({
          severity: imported.diagramCount < parsed.manifest.diagrams.length
            ? 'warning'
            : 'success',
          message: buildZipImportSummary(
            imported.diagramCount,
            imported.folderCount,
            parsed.manifest.diagrams.length
          )
        });
      } else {
        const text = await file.text();
        const data = parseJsonOrThrow(text);
        const blob = isPersistedDiagramBlob(data) ? data : {};
        const name = resolveImportedDiagramName(file, data);
        const newId = await storage.createDiagram({ ...blob, name, title: name }, null);
        refreshFileTree();
        setFileExplorerOpen(true);
        notificationStore.push({ severity: 'success', message: `Imported diagram "${name}"` });
        await openDiagramById(newId, name);
      }
    } catch (err) {
      // ADR 0011 — failure-of-intent: the user picked a file to import and it
      // could not be parsed. Surface the explicit dialog instead of a toast.
      console.error('handleDirectImportFile failed:', err);
      setImportError(true);
    }
  }, [storage, refreshFileTree, openDiagramById, setFileExplorerOpen]);

  const handleImportClick = useCallback(() => {
    if (treeIsEmpty) {
      importFileInputRef.current?.click();
    } else {
      setShowImportDialog(true);
    }
  }, [treeIsEmpty]);

  const currentLocale =
    allLocales[i18n.language as keyof typeof allLocales] || allLocales['en-US'];

  // Don't render canvas until storage init completes — prevents onboarding hints from
  // briefly appearing before EmptyStateScreen takes over.
  if (!isInitialized) return null;

  // Drive mode is remote storage — the "your work lives in this browser tab"
  // banner is session-mode-only, so gate it on remoteStorageActive.
  const showLocalModeBanner =
    !remoteStorageActive && !isReadonlyUrl && linkedDiagrams.length > 0;

  // ADR 0009 Decision 3 (addendum 2026-05-22): only the share-UUID form
  // `/display/p/<uuid>` requires a session backend. The owner-readonly form
  // `/display/<diagramId>` works in Local mode against localStorage, so it
  // must NOT trigger the share-error dialog.
  const showLocalModeShareError = isPublicShareUrl && !serverStorageAvailable;

  return (
    <div className="App">
      <AppToolbar />

      {showLocalModeBanner && <LocalModeBanner />}

      {/* Main flex region for the canvas. The file explorer renders as an
          absolute overlay inside .axoview-container — it does not push the
          canvas. */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0
          }}
        >
        <div className="axoview-container" style={{ position: 'relative' }}>
          <Axoview
            ref={axoviewRef}
            initialData={frozenInitialDataRef.current ?? undefined}
            onModelUpdated={handleModelUpdated}
            exposeStoreBridge={perfMonitoringEnabled}
            editorMode={isReadonlyUrl ? 'EXPLORABLE_READONLY' : 'EDITABLE'}
            locale={currentLocale}
            iconPackManager={iconPackManagerProp}
            iconUsageScan={iconUsageScan}
            linkedDiagrams={linkedDiagrams}
            sidebarTogglePortalTarget={sidebarTogglePortalTarget}
            styleControlsPortalTarget={styleControlsPortalTarget}
            languageSelector={<ChangeLanguage />}
            bottomDockEnd={<DiagnosticsToggleButton />}
            suppressOnboardingHints={!!currentDiagram || isReadonlyUrl}
            fileExplorerOpen={fileExplorerOpen}
            onFileExplorerToggle={() => setFileExplorerOpen(!fileExplorerOpen)}
            disableLeftDockWorkingTabs={!currentDiagram}
          />
          {/* File Explorer overlay — sits to the right of the LeftDock strip,
              never pushes the canvas. z=15 places it above the canvas/empty
              state but below the strip (z=20) and BottomDock (z=20). The Box
              wrapper is the hover/focus group that reveals the collapse tab
              (§2.3) — the tab is a DOM child so hovering it (even where it
              protrudes past the 280px edge) keeps the group hovered. */}
          {!isReadonlyUrl && fileExplorerOpen && (
            <Box
              sx={{
                '&:hover .ax-collapse-tab, &:focus-within .ax-collapse-tab': {
                  opacity: 1,
                  pointerEvents: 'all'
                }
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 40,
                  left: 40,
                  width: 280,
                  zIndex: 15,
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--mui-palette-background-paper, #fff)',
                  borderRight: '1px solid rgba(0,0,0,0.12)',
                  boxShadow: '0 0 8px rgba(0,0,0,0.08)',
                  overflow: 'hidden'
                }}
              >
                <FileExplorer />
              </div>
              {/* Collapse tab — edge tab on the explorer's right border,
                  invisible + inert until the explorer is hovered/focused. When a
                  working panel stacks on top (z=20) it is occluded, which reads
                  as "collapse the outermost panel first". */}
              <Tooltip
                title={t('fileExplorer.collapse', 'Collapse panel')}
                placement="right"
              >
                <IconButton
                  className="ax-collapse-tab"
                  size="small"
                  onClick={() => setFileExplorerOpen(false)}
                  data-axoview-id="file-explorer-collapse"
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: 40 + 280 - 1,
                    transform: 'translateY(-50%)',
                    zIndex: 16,
                    width: 22,
                    height: 44,
                    borderRadius: '0 8px 8px 0',
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderLeft: 'none',
                    color: 'text.secondary',
                    boxShadow: 2,
                    opacity: 0,
                    pointerEvents: 'none',
                    transition: 'opacity 120ms ease',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                    '&:focus-visible': { opacity: 1, pointerEvents: 'all' }
                  }}
                >
                  <CollapseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          {!currentDiagram && !isReadonlyUrl && (
            // Confined to the canvas area only — leaves left strip (40px) and
            // bottom dock (40px) visually uncovered, which sidesteps the
            // stacking-context trap created by Axoview's translateZ(0).
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 40,
                right: 0,
                bottom: 40,
                zIndex: 5
              }}
            >
              <EmptyStateScreen
                onCreate={() => handleCreateBlankDiagram(null, 'elements')}
                onImport={handleImportClick}
                showSignIn={
                  // The sign-in nudge (owner pick 2026-07-06 — no blocking
                  // first-run gate): storage-less deploy, signed out only.
                  !serverStorageAvailable &&
                  googleDriveConfigured &&
                  authStatus !== 'AUTHENTICATED' &&
                  authStatus !== 'REFRESHING' &&
                  authStatus !== 'RECONNECTING'
                }
                onSignIn={() => void signIn()}
              />
            </div>
          )}
        </div>
        </Box>
      </Box>

      {/* Hidden file input for empty-tree direct import */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleDirectImportFile(f);
          e.target.value = '';
        }}
      />

      {/* Import dialog for non-empty tree */}
      {showImportDialog && storage && (
        <ImportDialog
          open
          onClose={() => setShowImportDialog(false)}
          storage={storage}
          onImported={async () => {
            refreshFileTree();
            setFileExplorerOpen(true);
            notificationStore.push({ severity: 'success', message: 'Import complete' });
          }}
          onImportSingleJson={async (data, suggestedName) => {
            const newId = await storage.createDiagram(
              { ...(data as object), name: suggestedName, title: suggestedName },
              null
            );
            refreshFileTree();
            await openDiagramById(newId, suggestedName);
          }}
        />
      )}

      {storage && (
        <ExportProjectZipDialog
          open={isProjectExportOpen}
          onClose={closeProjectExport}
          scope="project"
          storage={storage}
          exporterTag={EXPORTER_TAG}
          onProjectZipExported={() => {
            // `storage` follows the ACTIVE place — with a Drive diagram open
            // the zip held Drive content only, so the session exit guard
            // (sessionWorkUnexported) must stay armed.
            if (!remoteStorageActive) markProjectExported?.();
          }}
        />
      )}

      <LocalModeShareErrorDialog
        open={showLocalModeShareError}
        onDismiss={() => navigate('/', { replace: true })}
      />

      {/* ADR 0042 §2 rungs 3–4 — sign-in / Picker-grant / terminal-failure
          gate for the Drive display route. Renders nothing off that route. */}
      <DriveDisplayGate />

      <ReadonlyLoadErrorDialog
        open={readonlyLoadFailed}
        onDismiss={() => {
          clearReadonlyLoadFailed();
          navigate('/', { replace: true });
        }}
      />

      <PublicShareLoadErrorDialog
        open={publicShareLoadFailed}
        onDismiss={() => {
          clearPublicShareLoadFailed();
          navigate('/', { replace: true });
        }}
      />

      {/* ADR 0011 §3 in-editor case: dismiss clears the error but leaves editor
          state intact (no navigation); "Try again" re-runs the save. */}
      <SaveErrorDialog
        open={saveError}
        onDismiss={clearSaveError}
        onRetry={retrySave}
      />

      {/* ADR 0011 — direct (empty-tree) file import parse failure. No retry;
          re-picking a file is the recovery affordance. */}
      <ImportErrorDialog
        open={importError}
        onDismiss={() => setImportError(false)}
      />

      {/* First-connect Google Drive root-folder chooser (default vs custom). */}
      <DriveSetupGate />

      {/* Post-sign-in "move session diagrams to Drive?" offer + on-demand entry
          (avatar menu, session section header, banner). */}
      <MigrateSessionDialog />

      {/* Hard stop when sign-in granted identity but not the Drive scope. */}
      <DriveAccessRequiredDialog />

      <DiagnosticsOverlay />
      <NotificationStack />
    </div>
  );
}

export default App;
