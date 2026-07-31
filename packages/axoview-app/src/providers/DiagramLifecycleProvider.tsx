import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { flattenCollections } from '@isoflow/isopacks/dist/utils';
import isoflowIsopack from '@isoflow/isopacks/dist/isoflow';
import type { AxoviewRef, InitialData, Model, Icon } from 'axoview';
import { DiagramData, SavedDiagram } from '../diagramUtils';
import {
  PersistedDiagramBlob,
  isPersistedDiagramBlob
} from '../services/storage/types';
import {
  useIconPackManager,
  IconPackInfo,
  IconPackName
} from '../services/iconPackManager';
import { useAppStorage } from './AppStorageContext';
import { useAuthStore } from '../stores/authStore';
import { fetchRuntimeConfig } from '../hooks/useRuntimeConfig';
import { readDriveDisplayFile } from '../services/drive/drivePublicRead';
import { useAutoSave, SaveStatus } from '../hooks/useAutoSave';
import { DiagramManager } from '../components/DiagramManager';
import { SaveDialog } from '../components/SaveDialog';
import { LoadDialog } from '../components/LoadDialog';
import { ExportSingleDiagramDialog } from '../components/ExportSingleDiagramDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LocalStorageInspector } from '../LocalStorageInspector';
import { notificationStore } from '../stores/notificationStore';
import { sequentialName } from '../utils/fileOperations';
import { apiBaseUrl } from '../utils/apiBaseUrl';
import { exportAsJSON } from 'axoview';

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

export type { SavedDiagram };

/**
 * Drive display route gate state (ADR 0042 §2). 'needs-signin' and
 * 'needs-grant' render the DriveDisplayGate rungs; 'failed' is terminal
 * (deleted file, declined pick, transient error) and gets the existing
 * readonly-load-failed treatment.
 */
export type DriveDisplayState =
  | 'idle'
  | 'loading'
  | 'needs-signin'
  | 'needs-grant'
  // Network / rate-limit / 5xx — recoverable; the gate offers a Retry rather
  // than the terminal 'failed' treatment.
  | 'transient'
  // S3/DRV-02: the causes that used to collapse into 'failed'. Each renders its
  // own gate copy, because "the owner moved it to the trash", "it is too big to
  // preview", "that link is not valid" and "the grant has not registered yet"
  // are four different things for the person reading them — and one of them is
  // fixed by pressing Retry.
  | 'gone'
  | 'too-large'
  | 'bad-link'
  | 'grant-not-registered'
  | 'failed'
  | 'loaded';

/** Gate states the DriveDisplayGate renders itself (rather than the terminal
 *  readonly-load-failed dialog). Kept next to the type so a new state cannot be
 *  added without deciding which side of that line it falls on. */
export const GATE_RENDERED_DRIVE_STATES: readonly DriveDisplayState[] = [
  'needs-signin',
  'needs-grant',
  'transient',
  'gone',
  'too-large',
  'bad-link',
  'grant-not-registered'
];

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
  isPublicShareUrl: boolean;
  readonlyLoadFailed: boolean;
  clearReadonlyLoadFailed: () => void;
  publicShareLoadFailed: boolean;
  clearPublicShareLoadFailed: () => void;
  // ADR 0042 §2 — Drive-file display route (`/display/drive/:driveFileId`).
  // Gate state consumed by DriveDisplayGate; mirrors the readonly/public
  // failure-flag pattern above. (`driveDisplayFileId != null` already means
  // "on the Drive display route" — no separate boolean is exposed.)
  driveDisplayFileId: string | null;
  driveDisplayState: DriveDisplayState;
  /**
   * Re-run the load ladder. `afterGrant` marks the post-Picker retry so a
   * still-unreadable file maps to terminal failure instead of another gate.
   */
  retryDriveDisplayRead: (afterGrant: boolean) => void;
  // ADR 0011 — failure-of-intent dialog state for a user-initiated save that
  // could not be persisted. `retrySave` re-runs the save action.
  saveError: boolean;
  clearSaveError: () => void;
  retrySave: () => void;
  // Auto-save status (server mode)
  saveStatus: SaveStatus;
  // Dialog state
  showExportDialog: boolean;
  setShowExportDialog: (v: boolean) => void;
  // Refs
  axoviewRef: React.RefObject<AxoviewRef | null>;
  isAfterLoadRef: React.MutableRefObject<boolean>;
  frozenInitialDataRef: React.MutableRefObject<DiagramData | null>;
  // Portal state
  toolbarPortalTarget: HTMLElement | null;
  setToolbarPortalTarget: (el: HTMLElement) => void;
  sidebarTogglePortalTarget: HTMLElement | null;
  setSidebarTogglePortalTarget: (el: HTMLElement) => void;
  styleControlsPortalTarget: HTMLElement | null;
  setStyleControlsPortalTarget: (el: HTMLElement) => void;
  // Actions
  handleSaveClick: () => Promise<void>;
  handleOpenClick: () => void;
  handlePreviewClick: () => Promise<void>;
  handleModelUpdated: (model: Model) => void;
  handleExportJSON: () => void;
  handleExportImage: () => void;
  handleExportProject: () => void;
  isProjectExportOpen: boolean;
  closeProjectExport: () => void;
  handleNewDiagram: () => Promise<void>;
  handleRenameCurrentDiagram: (newName: string) => Promise<void>;
  notifyDiagramRenamedFromTree: (id: string, newName: string) => void;
  notifyDiagramDeletedFromTree: (id: string) => void;
  saveAllDirty: () => Promise<void>;
  handleCreateBlankDiagram: (
    folderId: string | null,
    focusAfter?: 'fileExplorer' | 'elements',
    placeId?: string
  ) => Promise<void>;
  checkUnsavedBeforeNavigate: (onProceed: () => void) => void;
  /**
   * Google sign-out follow-up: when the open diagram lives in Drive, flush,
   * close it and fall back to the local place, then run `afterClose` (the
   * actual token revoke). No-op pass-through when nothing Drive-side is open.
   * (Replaces the removed user-facing provider switch — places model 2026-07-06.)
   */
  handleGoogleSignedOut: (afterClose?: () => void) => void;
  // File explorer
  fileExplorerOpen: boolean;
  setFileExplorerOpen: (open: boolean) => void;
  /**
   * Open a diagram; `placeId` names the storage place it lives in ('local' |
   * 'google-drive'). The active provider silently follows it so every mode
   * branch keys off the open diagram. Omitted = current place (legacy callers).
   */
  openDiagramById: (id: string, name: string, placeId?: string) => Promise<void>;
  fileTreeRefreshToken: number;
  refreshFileTree: () => void;
  dirtyDiagramIds: Set<string>;
  /**
   * Session-mode flag: true when the session has any work that has not been
   * exported to a project zip. Independent of `hasUnsavedChanges` (which tracks
   * "model differs from save target"). Cleared only by a successful project zip
   * export — see `markProjectExported`.
   */
  sessionWorkUnexported: boolean;
  markProjectExported: () => void;
  // Icon pack
  iconPackManagerProp: {
    lazyLoadingEnabled: boolean;
    onToggleLazyLoading: (enabled: boolean) => void;
    packInfo: IconPackInfo[];
    enabledPacks: IconPackName[];
    onTogglePack: (packName: string, enabled: boolean) => void;
  };
}

const DiagramLifecycleContext = createContext<DiagramLifecycleContextValue>(
  null as unknown as DiagramLifecycleContextValue
);

export function DiagramLifecycleProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { readonlyDiagramId, shareUuid, driveFileId } = useParams<{
    readonlyDiagramId: string;
    shareUuid: string;
    driveFileId: string;
  }>();
  const navigate = useNavigate();
  const { t } = useTranslation('app');
  const {
    storage,
    storageManager,
    serverStorageAvailable,
    remoteStorageActive,
    setActiveProviderId,
    defaultPlaceId,
    isInitialized
  } = useAppStorage();
  const iconPackManager = useIconPackManager(coreIcons);

  const isPublicShareUrl = !!shareUuid;
  // `readonlyDiagramId` is the basename-stripped route param (react-router), so
  // it is authoritative. The pathname guard is a belt-and-suspenders check that
  // must tolerate the R1 `/app` basename (ADR 0040): the raw browser path is
  // `/app/display/<id>`, not `/display/<id>` — hence `includes`, not
  // `startsWith`, so readonly mode still resolves under the /app prefix (and at
  // the bare `/display/*` used by other deploys / pre-R1 links).
  // ADR 0042 §2: the Drive-file display route is readonly too. It must NOT
  // fold into isPublicShareUrl — LocalModeShareError stays keyed on the
  // share-uuid form only.
  const isDriveDisplayUrl = !!driveFileId;
  const isReadonlyUrl =
    isPublicShareUrl ||
    isDriveDisplayUrl ||
    (window.location.pathname.includes('/display/') && !!readonlyDiagramId);

  const axoviewRef = useRef<AxoviewRef>(null);

  // ---------------------------------------------------------------------------
  // Diagram list state
  // ---------------------------------------------------------------------------
  const [diagrams, setDiagrams] = useState<SavedDiagram[]>([]);
  const [isDiagramsInitialized, setIsDiagramsInitialized] = useState(false);
  const [currentDiagram, setCurrentDiagram] = useState<SavedDiagram | null>(null);
  const [diagramName, setDiagramName] = useState('');
  const [readonlyLoadFailed, setReadonlyLoadFailed] = useState(false);
  const clearReadonlyLoadFailed = useCallback(() => setReadonlyLoadFailed(false), []);
  const [publicShareLoadFailed, setPublicShareLoadFailed] = useState(false);
  const clearPublicShareLoadFailed = useCallback(() => setPublicShareLoadFailed(false), []);

  // Drive display gate (ADR 0042 §2). driveRetryToken re-fires the loader
  // effect after sign-in / a Picker grant; the afterGrant flag rides a ref so
  // the retry doesn't need an effect dep of its own.
  const [driveDisplayState, setDriveDisplayState] = useState<DriveDisplayState>('idle');
  const [driveRetryToken, setDriveRetryToken] = useState(0);
  const driveAfterGrantRef = useRef(false);
  const retryDriveDisplayRead = useCallback((afterGrant: boolean) => {
    driveAfterGrantRef.current = afterGrant;
    setDriveRetryToken((n) => n + 1);
  }, []);

  // ADR 0011 — save failure-of-intent. `retrySave` re-runs the canonical
  // user-save entry (handleSaveClick) via a ref so the callback identity stays
  // stable and both server- and session-mode saves funnel through one retry.
  const [saveError, setSaveError] = useState(false);
  const clearSaveError = useCallback(() => setSaveError(false), []);
  const handleSaveClickRef = useRef<() => void>(() => {});
  const retrySave = useCallback(() => {
    setSaveError(false);
    handleSaveClickRef.current();
  }, []);

  // Clear stale failure flags when the user leaves the readonly route — covers
  // the preview → back-to-editing case where an in-flight load could surface
  // its error dialog on the editor route in spite of the cancel guard.
  useEffect(() => {
    if (!isReadonlyUrl) {
      setReadonlyLoadFailed(false);
      setPublicShareLoadFailed(false);
    }
  }, [isReadonlyUrl]);

  // Same stale-state guard for the Drive display gate: leaving the route
  // resets the gate so it can't linger over the editor.
  useEffect(() => {
    if (!driveFileId) {
      setDriveDisplayState('idle');
      driveAfterGrantRef.current = false;
    }
  }, [driveFileId]);

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

  // ADR — session-mode "work needs to be exported to a file" flag, decoupled
  // from hasUnsavedChanges. Listens to the same custom event the gauge uses,
  // since every session mutation already dispatches it.
  const [sessionWorkUnexported, setSessionWorkUnexported] = useState(false);
  const markProjectExported = useCallback(() => {
    setSessionWorkUnexported(false);
  }, []);
  const sessionWorkUnexportedRef = useRef(false);
  useEffect(() => {
    sessionWorkUnexportedRef.current = sessionWorkUnexported;
  }, [sessionWorkUnexported]);
  useEffect(() => {
    if (serverStorageAvailable) return; // server deploys have no session place
    const handler = () => setSessionWorkUnexported(true);
    window.addEventListener('axoview-session-changed', handler);
    return () => window.removeEventListener('axoview-session-changed', handler);
  }, [serverStorageAvailable]);

  // In server mode the single-diagram hasUnsavedChanges is driven by saveStatus.
  // In session mode it uses dirtyDiagramIds as before.
  const hasUnsavedChanges = remoteStorageActive
    ? false  // toolbar uses saveStatus directly in server mode
    : dirtyDiagramIds.has(currentDiagram?.id ?? '__unsaved__');

  // ---------------------------------------------------------------------------
  // Auto-save (server mode only)
  // ---------------------------------------------------------------------------
  const lastAutoSavedIdRef = useRef<string | null>(null);
  const autoSave = useAutoSave({
    storage,
    enabled: !!storage && !isReadonlyUrl,
    onSaved: (id, savedAt) => {
      setLastSaved(savedAt);
      // Refresh the tree only on the first save of a given id (the save that
      // can add a row). Steady-state autosaves change no tree structure, and
      // in Drive mode each refresh costs a full listing (~4 API calls) per
      // 2-second autosave tick.
      if (lastAutoSavedIdRef.current !== id) {
        lastAutoSavedIdRef.current = id;
        setFileTreeRefreshToken((n) => n + 1);
      }
      // In session mode, clear the dirty bit so the badge + unsaved indicator update.
      if (!remoteStorageActive) {
        setDirtyDiagramIds((prev) => setWithout(prev, id));
        scratchBufferRef.current.delete(id);
      }
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
    if (!remoteStorageActive) {
      setFileExplorerOpen(false);
      return;
    }
    const flag = localStorage.getItem('axoview-explorer-initialized');
    if (!flag) {
      localStorage.setItem('axoview-explorer-initialized', '1');
      setFileExplorerOpen(true);
    } else {
      const saved = localStorage.getItem('axoview-explorer-open');
      setFileExplorerOpen(saved === 'true');
    }
  }, [isInitialized, remoteStorageActive]);

  // Persist fileExplorerOpen to localStorage (server mode only)
  useEffect(() => {
    if (!isInitialized || !remoteStorageActive) return;
    localStorage.setItem('axoview-explorer-open', String(fileExplorerOpen));
  }, [fileExplorerOpen, isInitialized, remoteStorageActive]);

  // ---------------------------------------------------------------------------
  // Portal state
  // ---------------------------------------------------------------------------
  const [toolbarPortalTarget, setToolbarPortalTarget] =
    useState<HTMLElement | null>(null);
  const [sidebarTogglePortalTarget, setSidebarTogglePortalTarget] =
    useState<HTMLElement | null>(null);
  const [styleControlsPortalTarget, setStyleControlsPortalTarget] =
    useState<HTMLElement | null>(null);

  // ---------------------------------------------------------------------------
  // Initial diagram data (from localStorage, frozen on first render)
  // ---------------------------------------------------------------------------
  const [diagramData] = useState<DiagramData>(() => {
    const lastOpenedData = localStorage.getItem('axoview-last-opened-data');
    if (lastOpenedData) {
      try {
        const parsed: unknown = JSON.parse(lastOpenedData);
        if (
          !isPersistedDiagramBlob(parsed) ||
          !Array.isArray(parsed.items) ||
          !Array.isArray(parsed.views)
        ) {
          console.warn('axoview-last-opened-data had invalid structure, discarding.');
          localStorage.removeItem('axoview-last-opened-data');
          throw new Error('invalid structure');
        }
        const data: PersistedDiagramBlob = parsed;
        const importedIcons: Icon[] = (data.icons || []).filter(
          (icon) => icon.collection === 'imported'
        );
        return {
          title: data.title || 'Untitled Diagram',
          version: data.version,
          description: data.description,
          icons: [...coreIcons, ...importedIcons] as Icon[],
          colors: data.colors?.length ? data.colors : defaultColors,
          items: data.items ?? [],
          views: data.views ?? [],
          fitToScreen: data.fitToScreen !== false,
          requiredPacks: data.requiredPacks
        };
      } catch (e) {
        console.error('Failed to load last opened data:', e);
      }
    }
    return {
      title: 'Untitled Diagram',
      icons: coreIcons as Icon[],
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

  // ---------------------------------------------------------------------------
  // "Leaving now loses work" — single owner (thread A-a)
  // ---------------------------------------------------------------------------
  // This question used to have two beforeunload listeners answering it with
  // different conditions: one hard-false in remote mode, the other keyed on
  // `saveStatus === 'saving'` only — so a FAILED autosave, the state where the
  // work is most at risk, waved the user out of the tab (A1/LIFE-02). One
  // predicate now, read live from refs so the listener never re-binds.
  //
  // Places model: un-exported session work needs the warning even while a Drive
  // diagram is open (remote autosave covers only the OPEN diagram, never the
  // session place), so the session terms are keyed on the deploy, not the mode.
  const hasUnsavedWork = useCallback(
    (): boolean =>
      autoSave.hasUnsavedWork() ||             // queued, in flight, or failed
      dirtyDiagramIdsRef.current.size > 0 ||   // session-place work not written
      (!serverStorageAvailable && sessionWorkUnexportedRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoSave.hasUnsavedWork is stable; the rest are refs
    [autoSave.hasUnsavedWork, serverStorageAvailable]
  );
  const hasUnsavedWorkRef = useRef(hasUnsavedWork);
  useEffect(() => { hasUnsavedWorkRef.current = hasUnsavedWork; }, [hasUnsavedWork]);
  const beforeUnloadMessageRef = useRef('');
  useEffect(() => { beforeUnloadMessageRef.current = t('alert.beforeUnload'); }, [t]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedWorkRef.current()) return;
      e.preventDefault();
      e.returnValue = beforeUnloadMessageRef.current;
      return e.returnValue;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Storage ref so callbacks don't stale
  const storageRef = useRef(storage);
  useEffect(() => { storageRef.current = storage; }, [storage]);

  // ---------------------------------------------------------------------------
  // Frozen initial data for Axoview
  // ---------------------------------------------------------------------------
  const frozenInitialDataRef = useRef<DiagramData | null>(null);
  if (frozenInitialDataRef.current === null) {
    const importedIcons: Icon[] = (diagramData.icons || []).filter(
      (icon) => icon.collection === 'imported'
    );
    frozenInitialDataRef.current = {
      ...diagramData,
      icons: [...iconPackManager.loadedIcons, ...importedIcons]
    };
  }

  // Shared hydration tail for the three read-only URL loaders (public snapshot,
  // owner-readonly, Drive display). Each builds its own SavedDiagram (id / name
  // / timestamps legitimately differ), then hands it here to commit to canvas +
  // state identically — one place to keep the load contract from drifting. Only
  // stable setters / refs are captured, so its identity never changes.
  const applyLoadedDiagram = useCallback((diagram: SavedDiagram) => {
    setCurrentDiagram(diagram);
    setDiagramName(diagram.name);
    setCurrentModel(diagram.data);
    setLastSaved(new Date(diagram.updatedAt));
    isAfterLoadRef.current = true;
    // Axoview may not be mounted yet (EmptyStateScreen showing) — seed the
    // frozen initialData so it mounts with the right diagram, not stale data.
    if (!axoviewRef.current) {
      frozenInitialDataRef.current = diagram.data;
    }
    axoviewRef.current?.load(diagram.data as InitialData);
  }, []);

  // ---------------------------------------------------------------------------
  // Load public-share snapshot from URL (no auth, no diagram-list fetch)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isPublicShareUrl || !shareUuid) return;
    // ADR 0009 Decision 3: share routes are session-mode only. In Local mode
    // the LocalModeShareErrorDialog handles the user-visible feedback;
    // suppress the fetch so the generic error toast doesn't also fire.
    // NOTE: session-backend contract — stays on serverStorageAvailable, NOT
    // remoteStorageActive (Drive mode cannot serve /api/public/diagrams).
    if (!serverStorageAvailable) return;
    const loadPublicSnapshot = async () => {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/public/diagrams/${shareUuid}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw: unknown = await response.json();
        if (!isPersistedDiagramBlob(raw)) throw new Error('public snapshot is not an object');
        const data: PersistedDiagramBlob = raw;
        const name = data.title || data.name || 'Shared Diagram';
        await iconPackManager.loadPacksForDiagram(data);
        const importedIcons: Icon[] = (data.icons || []).filter(
          (icon) => icon.collection === 'imported'
        );
        const dataWithIcons: DiagramData = {
          ...data,
          title: name,
          icons: [...iconPackManager.loadedIcons, ...importedIcons],
          colors: data.colors?.length ? data.colors : defaultColors,
          items: Array.isArray(data.items) ? data.items : [],
          views: Array.isArray(data.views) ? data.views : [],
          fitToScreen: data.fitToScreen !== false
        };
        const sharedDiagram: SavedDiagram = {
          id: shareUuid,
          name,
          data: dataWithIcons,
          createdAt: data.sharedAt || new Date().toISOString(),
          updatedAt: data.sharedAt || new Date().toISOString()
        };
        applyLoadedDiagram(sharedDiagram);
      } catch (_error) {
        setPublicShareLoadFailed(true);
      }
    };
    loadPublicSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on share-URL identity only; iconPackManager is a stable singleton
  }, [isPublicShareUrl, shareUuid, serverStorageAvailable]);

  // ---------------------------------------------------------------------------
  // Load readonly diagram from URL (owner-only, requires auth)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Self-keyed on the owner-readonly route param: react-router populates
    // `readonlyDiagramId` ONLY on `/display/:readonlyDiagramId`, so it is falsy
    // on the public-share (`/display/p/:shareUuid`) and Drive
    // (`/display/drive/:driveFileId`) routes. This single guard replaces the
    // per-sibling co-fire exclusions (ADR 0042 §2 mutual exclusion — a fourth
    // readonly route needs zero new guards here) and still leaves
    // listDiagrams()/loadDiagram(undefined) unreachable off this route.
    if (!readonlyDiagramId || !storage) return;
    // Cancel the in-flight load if the user navigates away (Back to editing)
    // before the async chain settles — otherwise a late-resolving catch
    // surfaces ReadonlyLoadErrorDialog on the editor route after the readonly
    // view already unmounted, which is what the user reported on the
    // preview → back-to-editing flow.
    let cancelled = false;
    const loadReadonlyDiagram = async () => {
      try {
        const diagramList = await storage.listDiagrams();
        if (cancelled) return;
        const diagramInfo = diagramList.find((d) => d.id === readonlyDiagramId);
        const raw: unknown = await storage.loadDiagram(readonlyDiagramId!);
        if (cancelled) return;
        await iconPackManager.loadPacksForDiagram(raw);
        if (cancelled) return;
        const data: PersistedDiagramBlob = isPersistedDiagramBlob(raw) ? raw : {};
        const importedIcons: Icon[] = (data.icons || []).filter(
          (icon) => icon.collection === 'imported'
        );
        const dataWithIcons: DiagramData = {
          ...data,
          title: data.title || diagramInfo?.name || 'Readonly Diagram',
          icons: [...iconPackManager.loadedIcons, ...importedIcons],
          colors: data.colors?.length ? data.colors : defaultColors,
          items: Array.isArray(data.items) ? data.items : [],
          views: Array.isArray(data.views) ? data.views : [],
          fitToScreen: data.fitToScreen !== false
        };
        const readonlyDiagram: SavedDiagram = {
          id: readonlyDiagramId!,
          name: diagramInfo?.name || data.title || 'Readonly Diagram',
          data: dataWithIcons,
          createdAt: new Date().toISOString(),
          updatedAt: diagramInfo?.lastModified || new Date().toISOString()
        };
        applyLoadedDiagram(readonlyDiagram);
      } catch (_error) {
        if (cancelled) return;
        setReadonlyLoadFailed(true);
      }
    };
    loadReadonlyDiagram();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on readonlyDiagramId/storage; the URL-guard booleans recompute each render and iconPackManager is a stable singleton
  }, [readonlyDiagramId, storage]);

  // ---------------------------------------------------------------------------
  // Load Drive-file diagram from URL (ADR 0042 §2: key read → token read →
  // grant gate). Provider-less by design — the recipient may have no Drive
  // root/manifest/place, so this never touches `storage` (no listDiagrams).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!driveFileId) return;
    // Cancel-on-navigate guard, same reason as the owner-readonly loader: a
    // late-settling load must not paint gate/error state over another route.
    let cancelled = false;
    const loadDriveDiagram = async () => {
      setDriveDisplayState('loading');
      try {
        // Config comes straight from the cached runtime-config fetch rather
        // than provider state, so the effect doesn't refire on init timing.
        const config = await fetchRuntimeConfig();
        if (cancelled) return;
        // resourceKey rides OUR preview URL as a search param (expected
        // absent on app-created files — ADR 0042 §1).
        const resourceKey = new URLSearchParams(window.location.search).get('resourceKey');
        const result = await readDriveDisplayFile({
          fileId: driveFileId,
          resourceKey,
          publicPreview: config.drivePublicPreview,
          afterGrant: driveAfterGrantRef.current
        });
        if (cancelled) return;
        // S3/DRV-01: the post-Picker flag lives exactly as long as the read it
        // was set for. It used to be cleared in ONE other place — the effect
        // that fires when `driveFileId` goes falsy, i.e. when the route
        // unmounts — so once the Picker had been used, EVERY subsequent read on
        // that route was an `afterGrant` read, and `afterGrant` is precisely
        // what turns a recoverable answer into a terminal one. Drive grants
        // take a moment to register (the ladder's own doc comment says
        // drive.file "hides files until the Picker grant registers"), so the
        // post-Picker retry routinely saw the pre-Picker answer and mapped it
        // to a dead end whose only button navigated away from the link.
        driveAfterGrantRef.current = false;
        if (!result.ok) {
          // Everything the gate can render itself stays on the gate; only a
          // genuinely terminal 'not-found' falls through to 'failed'.
          setDriveDisplayState(
            (GATE_RENDERED_DRIVE_STATES as readonly string[]).includes(
              result.reason
            )
              ? (result.reason as DriveDisplayState)
              : 'failed'
          );
          return;
        }
        const raw: unknown = result.data;
        if (!isPersistedDiagramBlob(raw)) throw new Error('drive file is not a diagram blob');
        const data: PersistedDiagramBlob = raw;
        const name = data.title || data.name || 'Shared Diagram';
        await iconPackManager.loadPacksForDiagram(data);
        if (cancelled) return;
        const importedIcons: Icon[] = (data.icons || []).filter(
          (icon) => icon.collection === 'imported'
        );
        const dataWithIcons: DiagramData = {
          ...data,
          title: name,
          icons: [...iconPackManager.loadedIcons, ...importedIcons],
          colors: data.colors?.length ? data.colors : defaultColors,
          items: Array.isArray(data.items) ? data.items : [],
          views: Array.isArray(data.views) ? data.views : [],
          fitToScreen: data.fitToScreen !== false
        };
        const driveDiagram: SavedDiagram = {
          id: driveFileId,
          name,
          data: dataWithIcons,
          createdAt: data.created || new Date().toISOString(),
          updatedAt: data.lastModified || new Date().toISOString()
        };
        applyLoadedDiagram(driveDiagram);
        setDriveDisplayState('loaded');
      } catch (_error) {
        if (cancelled) return;
        setDriveDisplayState('failed');
      }
    };
    loadDriveDiagram();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on driveFileId + retry token; iconPackManager is a stable singleton
  }, [driveFileId, driveRetryToken]);

  // ---------------------------------------------------------------------------
  // Reload icon packs when they change
  // ---------------------------------------------------------------------------
  const iconPackEffectMountedRef = useRef(false);
  useEffect(() => {
    if (!iconPackEffectMountedRef.current) {
      iconPackEffectMountedRef.current = true;
      return;
    }
    if (!axoviewRef.current || !currentModelRef.current) return;
    const importedIcons: Icon[] = (currentModelRef.current.icons || []).filter(
      (icon) => icon.collection === 'imported'
    );
    const mergedIcons = [...iconPackManager.loadedIcons, ...importedIcons];
    isAfterLoadRef.current = true;
    axoviewRef.current.load(
      { ...currentModelRef.current, icons: mergedIcons } as InitialData,
      { preserveViewport: true }
    );
  }, [iconPackManager.loadedIcons]);

  // ---------------------------------------------------------------------------
  // Load diagrams from localStorage (session mode)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const savedDiagrams = localStorage.getItem('axoview-diagrams');
    if (savedDiagrams) {
      setDiagrams(JSON.parse(savedDiagrams));
      setIsDiagramsInitialized(true);
    }
    const lastOpenedId = localStorage.getItem('axoview-last-opened');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: restore last session from localStorage once
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
      localStorage.setItem('axoview-diagrams', JSON.stringify(diagramsToStore));
    } catch (e) {
      console.error('Failed to save diagrams:', e);
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        notificationStore.push({
          severity: 'error',
          message: t('alert.quotaExceeded')
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist keyed on diagrams; isDiagramsInitialized is a one-way guard and t only affects the error toast
  }, [diagrams]);

  // (The second beforeunload listener that lived here is gone — `hasUnsavedWork`
  // above is the single owner of "leaving now loses work". A1/LIFE-02.)

  // ---------------------------------------------------------------------------
  // Build save payload (session mode / Ctrl+S in server mode)
  // ---------------------------------------------------------------------------
  const buildSaveData = useCallback(() => {
    const importedIcons: Icon[] = (currentModel?.icons || diagramData.icons || []).filter(
      (icon) => icon.collection === 'imported'
    );
    const preservedRequiredPacks = currentModel?.requiredPacks;
    return {
      title: currentModel?.title || diagramName || 'Untitled Diagram',
      icons: importedIcons,
      colors: currentModel?.colors || diagramData.colors || [],
      items: currentModel?.items || diagramData.items || [],
      views: currentModel?.views || diagramData.views || [],
      fitToScreen: true,
      ...(Array.isArray(preservedRequiredPacks)
        ? { requiredPacks: preservedRequiredPacks }
        : {})
    };
  }, [currentModel, diagramData, diagramName]);

  // ---------------------------------------------------------------------------
  // Session-mode save
  // ---------------------------------------------------------------------------
  const executeSave = useCallback(
    async (existingDiagram?: SavedDiagram) => {
      const s = storageRef.current;
      const importedIcons = (currentModel?.icons || diagramData.icons || []).filter(
        (icon) => icon.collection === 'imported'
      );
      const preservedRequiredPacks = currentModel?.requiredPacks;
      const savedData = {
        title: diagramName,
        icons: importedIcons,
        colors: currentModel?.colors || diagramData.colors || [],
        items: currentModel?.items || diagramData.items || [],
        views: currentModel?.views || diagramData.views || [],
        fitToScreen: true,
        ...(Array.isArray(preservedRequiredPacks)
          ? { requiredPacks: preservedRequiredPacks }
          : {})
      };

      // Resolve the diagram ID — new diagrams must go through createDiagram so
      // the storage provider (and the file tree) knows about them. Returns null
      // when the storage op fails (the user has already been notified).
      const resolveSaveTarget = async (): Promise<{
        id: string;
        createdAt: string;
      } | null> => {
        try {
          if (currentDiagram) {
            if (s) await s.saveDiagram(currentDiagram.id, savedData);
            return {
              id: currentDiagram.id,
              createdAt: currentDiagram.createdAt
            };
          }
          if (existingDiagram) {
            if (s) await s.saveDiagram(existingDiagram.id, savedData);
            return {
              id: existingDiagram.id,
              createdAt: existingDiagram.createdAt
            };
          }
          // Brand-new diagram: let the storage provider allocate the ID.
          const newId = s
            ? await s.createDiagram(savedData, null)
            : Date.now().toString();
          return { id: newId, createdAt: new Date().toISOString() };
        } catch (e) {
          console.error('executeSave: storage op failed', e);
          // ADR 0011 — failure-of-intent: the user pressed Save and it didn't
          // persist. Surface the explicit dialog instead of a toast.
          setSaveError(true);
          return null;
        }
      };

      const applyDiagramsUpdate = (saved: SavedDiagram) => {
        if (currentDiagram) {
          setDiagrams(
            diagrams.map((d) => (d.id === currentDiagram.id ? saved : d))
          );
        } else if (existingDiagram) {
          setDiagrams(
            diagrams.map((d) =>
              d.id === existingDiagram.id
                ? { ...saved, id: existingDiagram.id, createdAt: existingDiagram.createdAt }
                : d
            )
          );
        } else {
          setDiagrams([...diagrams, saved]);
        }
      };

      const persistLastOpened = (saved: SavedDiagram) => {
        try {
          localStorage.setItem('axoview-last-opened', saved.id);
          localStorage.setItem(
            'axoview-last-opened-data',
            JSON.stringify(saved.data)
          );
        } catch (e) {
          console.error('Failed to save diagram:', e);
          if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            notificationStore.push({ severity: 'error', message: t('alert.storageFull') });
            setShowStorageManager(true);
          }
        }
      };

      const target = await resolveSaveTarget();
      if (!target) return;

      const newDiagram: SavedDiagram = {
        id: target.id,
        name: diagramName,
        data: savedData,
        createdAt: target.createdAt,
        updatedAt: new Date().toISOString()
      };
      applyDiagramsUpdate(newDiagram);
      setCurrentDiagram(newDiagram);
      setShowSaveDialog(false);
      const oldKey = currentDiagram?.id ?? '__unsaved__';
      scratchBufferRef.current.delete(oldKey);
      scratchBufferRef.current.delete(newDiagram.id);
      setDirtyDiagramIds((prev) => setWithout(prev, oldKey, newDiagram.id));
      setLastSaved(new Date());
      setFileTreeRefreshToken((n) => n + 1);
      notificationStore.push({ severity: 'success', message: `"${diagramName}" saved` });
      persistLastOpened(newDiagram);
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
      await iconPackManager.loadPacksForDiagram(diagram.data);
      const importedIcons: Icon[] = (diagram.data.icons || []).filter(
        (icon) => icon.collection === 'imported'
      );
      const dataWithIcons: DiagramData = {
        ...diagram.data,
        icons: [...iconPackManager.loadedIcons, ...importedIcons]
      };
      setCurrentDiagram(diagram);
      setDiagramName(diagram.name);
      setCurrentModel(dataWithIcons);
      setShowLoadDialog(false);
      setLastSaved(new Date(diagram.updatedAt));
      isAfterLoadRef.current = true;
      axoviewRef.current?.load(dataWithIcons as InitialData);
      try {
        localStorage.setItem('axoview-last-opened', diagram.id);
        localStorage.setItem('axoview-last-opened-data', JSON.stringify(diagram.data));
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
    const filename = `${diagramName || 'diagram'}-${new Date().toISOString().split('T')[0]}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDialog(false);
    // F-10: confirm the silent download succeeded (H11 feedback). The browser's
    // own download chrome is easy to miss, so a short success toast closes the loop.
    notificationStore.push({
      severity: 'success',
      message: t('exportMenu.jsonExported', { filename })
    });
  }, [currentModel, diagramData, diagramName, t]);

  // ---------------------------------------------------------------------------
  // Server-mode: load diagram into canvas
  // ---------------------------------------------------------------------------
  const handleDiagramManagerLoad = useCallback(
    async (id: string, rawData: unknown, listingName: string) => {
      const data: PersistedDiagramBlob = isPersistedDiagramBlob(rawData) ? rawData : {};

      const loadedIcons: Icon[] = data.icons || [];
      await iconPackManager.loadPacksForDiagram(data);
      const hasDefaultIcons = loadedIcons.some(
        (icon) =>
          icon.collection === 'isoflow' ||
          icon.collection === 'aws' ||
          icon.collection === 'gcp'
      );
      const finalIcons = hasDefaultIcons
        ? loadedIcons
        : [
            ...iconPackManager.loadedIcons,
            ...loadedIcons.filter((icon) => icon.collection === 'imported')
          ];

      const name = listingName || data.title || data.name || data.t || 'Untitled Diagram';

      const mergedData: DiagramData = {
        title: name,
        version: data.version,
        description: data.description,
        icons: finalIcons,
        colors: data.colors?.length ? data.colors : defaultColors,
        items: Array.isArray(data.items) ? data.items : [],
        views: Array.isArray(data.views) ? data.views : [],
        fitToScreen: data.fitToScreen !== false,
        requiredPacks: data.requiredPacks
      };
      const newDiagram: SavedDiagram = {
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
      if (!axoviewRef.current) {
        // Axoview not mounted yet (EmptyStateScreen showing) — seed initialData so it
        // mounts with the correct diagram instead of the stale frozen data.
        frozenInitialDataRef.current = mergedData;
      }
      axoviewRef.current?.load(mergedData as InitialData);
      if (!hasDefaultIcons && storageRef.current) {
        storageRef.current.saveDiagram(id, mergedData).catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on stable autoSave.resetStatus; whole autoSave churns on every save-status change
    [iconPackManager, autoSave.resetStatus]
  );

  // ---------------------------------------------------------------------------
  // Create blank diagram (for canvas card or file tree)
  // ---------------------------------------------------------------------------
  const handleCreateBlankDiagram = useCallback(
    async (
      folderId: string | null,
      focusAfter: 'fileExplorer' | 'elements' = 'fileExplorer',
      placeId?: string
    ) => {
      if (!storageRef.current) return;
      try {
        // Flush pending writes for the OPEN diagram before anything moves.
        // Unconditionally: nesting this in the place-change branch meant that
        // creating a blank diagram in the SAME place carried a queued edit into
        // `handleDiagramManagerLoad`, which discarded it (A1/LIFE-09).
        await autoSave.saveNow();
        // Places model: a new diagram is born into an explicit place, or the
        // default one (Drive when signed in on the storage-less deploy). The
        // active provider follows it BEFORE the create so the manager routes
        // the write.
        const targetPlace = placeId ?? defaultPlaceId;
        if (storageManager && storageManager.activeProviderId !== targetPlace) {
          autoSave.resetStatus();
          setActiveProviderId(targetPlace);
        }
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
        const id = await storageRef.current.createDiagram(blankData, folderId);
        // The empty-state "New diagram" wants to start diagramming, not manage
        // files — open the Elements deck and leave the file explorer closed.
        // The file-explorer creation paths keep opening the tree (default).
        if (focusAfter === 'elements') {
          setFileExplorerOpen(false);
        } else {
          setFileExplorerOpen(true);
        }
        setFileTreeRefreshToken((n) => n + 1);
        await handleDiagramManagerLoad(id, blankData, name);
        if (focusAfter === 'elements') {
          // Bridge into the lib store (separate provider tree) the same way the
          // other cross-boundary commands do — a window event the LeftDock
          // listens for. rAF so the editor has mounted/enabled its working tabs.
          requestAnimationFrame(() =>
            window.dispatchEvent(new CustomEvent('axoview-open-elements'))
          );
        }
      } catch (e) {
        // A Drive insufficient-scope 403 (scope revoked out-of-band, or a stale
        // grant) surfaces the blocking re-consent dialog instead of a dead-end
        // "Failed to create diagram" toast the user can't act on.
        //
        // S1/AUTH-08: this used to test `status === 403` alone, and `request()`
        // threw 403 for an exhausted RATE LIMIT too — so Drive being busy parked
        // a healthy session in DRIVE_ACCESS_REQUIRED and nulled a valid token,
        // asking the user to re-consent to a permission they never lost. The
        // classification travels on the error now, and `request()` itself calls
        // `markDriveScopeMissing()` for the scope case (AUTH-09), so this branch
        // is only about swallowing the toast the dialog replaces.
        const err = e as { name?: string; status?: number; reason?: string };
        if (err?.name === 'DriveError' && err.reason === 'drive-scope-required') {
          useAuthStore.getState().markDriveScopeMissing();
          return;
        }
        console.error('handleCreateBlankDiagram failed:', e);
        notificationStore.push({ severity: 'error', message: 'Failed to create diagram' });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on stable autoSave.saveNow/resetStatus; whole autoSave churns on every save-status change
    [iconPackManager.loadedIcons, handleDiagramManagerLoad, storageManager, setActiveProviderId, defaultPlaceId, autoSave.saveNow, autoSave.resetStatus]
  );

  // ---------------------------------------------------------------------------
  // Guard: check unsaved changes before navigating (session mode only)
  // ---------------------------------------------------------------------------
  const checkUnsavedBeforeNavigate = useCallback(
    (onProceed: () => void) => {
      if (remoteStorageActive) {
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
    [remoteStorageActive, hasUnsavedChanges, saveDiagram]
  );

  // ---------------------------------------------------------------------------
  // Places model (2026-07-06): the active provider silently follows the open
  // diagram. The only surviving whole-canvas "switch" is the Google sign-out
  // fallback below; the user-facing provider picker was removed.
  // ---------------------------------------------------------------------------
  const handleGoogleSignedOut = useCallback(
    (afterClose?: () => void) => {
      if (!storageManager || storageManager.activeProviderId !== 'google-drive') {
        // Nothing Drive-side open — the session place is untouched by sign-out.
        afterClose?.();
        return;
      }
      const doClose = async () => {
        // Flush any pending debounced autosave to Drive while the token is
        // still valid — this must run BEFORE the caller revokes it.
        await autoSave.saveNow();
        setActiveProviderId('local');
        // The Drive diagram is unreachable without a token — reset the open
        // diagram so autosave doesn't write the current scene into the session.
        autoSave.resetStatus();
        const driveDiagId = currentDiagramRef.current?.id;
        currentDiagramRef.current = null;
        setCurrentDiagram(null);
        setLastSaved(null);
        // Scope buffer cleanup to the Drive diagram: dirty session-place edits
        // stashed while it was open must survive sign-out (the session place is
        // untouched by it).
        if (driveDiagId) {
          scratchBufferRef.current.delete(driveDiagId);
          setDirtyDiagramIds((prev) => setWithout(prev, driveDiagId));
        }
        // Unsaved session work stashed when the Drive diagram was opened goes
        // back on the canvas; otherwise load a blank scene.
        const stashed = scratchBufferRef.current.get('__unsaved__') ?? null;
        setCurrentModel(stashed);
        setDiagramName(stashed?.title ?? '');
        const nextData: DiagramData = stashed ?? {
          title: '',
          icons: iconPackManager.loadedIcons,
          colors: defaultColors,
          items: [],
          views: [],
          fitToScreen: true
        };
        isAfterLoadRef.current = true;
        axoviewRef.current?.load(nextData as InitialData);
        setFileExplorerOpen(true);
        setFileTreeRefreshToken((n) => n + 1);
        afterClose?.();
      };
      checkUnsavedBeforeNavigate(() => void doClose());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on stable autoSave.saveNow/resetStatus; whole autoSave churns on every save-status change
    [storageManager, setActiveProviderId, checkUnsavedBeforeNavigate, iconPackManager.loadedIcons, autoSave.saveNow, autoSave.resetStatus]
  );

  // With nothing open, the active place follows the default: a successful
  // sign-in on the storage-less deploy lands the user in Drive behavior
  // (autosave chrome, Drive-first tree) with no mode flip and no canvas reset.
  // A restored session diagram keeps the session place active.
  const authStatus = useAuthStore((s) => s.status);
  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED') return;
    if (serverStorageAvailable) return;
    if (currentDiagramRef.current) return;
    if (storageManager && storageManager.activeProviderId !== 'google-drive') {
      setActiveProviderId('google-drive');
      setFileTreeRefreshToken((n) => n + 1);
    }
  }, [authStatus, serverStorageAvailable, storageManager, setActiveProviderId]);

  // ---------------------------------------------------------------------------
  // New Diagram (Axoview-owned — replaces Axoview's ACTION.NEW)
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
    axoviewRef.current?.load(blankData as InitialData);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on the stable autoSave.* methods it calls; whole autoSave churns on every save-status change
  }, [autoSave.saveNow, autoSave.resetStatus, iconPackManager.loadedIcons]);

  // ---------------------------------------------------------------------------
  // Rename current diagram
  // ---------------------------------------------------------------------------
  /**
   * Single owner of "the open diagram is now called X" (thread A-a).
   *
   * The toolbar rename used to update the breadcrumb and the storage row while
   * leaving `currentModel.title` on the old name — and `buildSaveData` prefers
   * `currentModel.title`, so the next save wrote the stale name back into the
   * blob and Export JSON shipped it (A1/LIFE-12). Its file-tree sibling, three
   * functions away, did it correctly. Both go through here now.
   *
   * Storage is the caller's business: this only owns the in-memory copies.
   */
  const applyDiagramName = useCallback((name: string) => {
    setDiagramName(name);
    setCurrentDiagram((prev) => (prev ? { ...prev, name } : prev));
    if (!currentModelRef.current) return;
    const updatedModel = { ...currentModelRef.current, title: name };
    setCurrentModel(updatedModel);
    currentModelRef.current = updatedModel;
    if (axoviewRef.current) {
      // Push it into the canvas so the lib's model agrees. The echo is
      // swallowed by isAfterLoadRef, so this is not a user edit.
      isAfterLoadRef.current = true;
      axoviewRef.current.load(updatedModel as InitialData, { preserveViewport: true });
    }
  }, []);

  const handleRenameCurrentDiagram = useCallback(
    async (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || !currentDiagramRef.current) return;
      const diag = currentDiagramRef.current;
      applyDiagramName(trimmed);
      if (remoteStorageActive && storageRef.current) {
        try {
          await storageRef.current.renameDiagram(diag.id, trimmed);
          setFileTreeRefreshToken((n) => n + 1);
        } catch {
          notificationStore.push({ severity: 'error', message: 'Rename failed' });
          // Revert every copy, model title included — a half-revert is what
          // A4/FEX-16 is about on the tree side.
          applyDiagramName(diag.name);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyDiagramName is stable
    [remoteStorageActive]
  );

  // MQA #18: when the currently-open diagram is deleted from the file tree, the
  // canvas was left holding stale data and the next autosave tick recreated the
  // diagram (with the same scene under a new id). Reset everything synchronously:
  // cancel any pending autosave, drop the scratch buffer + dirty bit, clear the
  // active diagram reference, and load a blank scene so the empty-state condition
  // routes to the initial-load screen.
  const notifyDiagramDeletedFromTree = useCallback((id: string) => {
    if (currentDiagramRef.current?.id !== id) return;
    autoSave.resetStatus();
    scratchBufferRef.current.delete(id);
    setDirtyDiagramIds((prev) => setWithout(prev, id));
    // Null the ref synchronously so any in-flight model update dispatched between
    // here and the next render doesn't see a stale currentId and re-schedule a save.
    currentDiagramRef.current = null;
    setCurrentDiagram(null);
    setDiagramName('');
    setCurrentModel(null);
    setLastSaved(null);
    const blankData: DiagramData = {
      title: '',
      icons: iconPackManager.loadedIcons,
      colors: defaultColors,
      items: [],
      views: [],
      fitToScreen: true
    };
    isAfterLoadRef.current = true;
    axoviewRef.current?.load(blankData as InitialData);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on stable autoSave.resetStatus; whole autoSave churns on every save-status change
  }, [autoSave.resetStatus, iconPackManager.loadedIcons]);

  // Sync in-memory state (diagramName, currentDiagram, model store title) when
  // the file tree renames the currently-open diagram. Storage is already updated
  // by the caller — this only keeps the canvas breadcrumb in sync.
  const notifyDiagramRenamedFromTree = useCallback((id: string, newName: string) => {
    if (!currentDiagramRef.current || currentDiagramRef.current.id !== id) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    applyDiagramName(trimmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyDiagramName is stable
  }, []);

  // ---------------------------------------------------------------------------
  // Toolbar save actions
  // ---------------------------------------------------------------------------
  const handleSaveClick = useCallback(async () => {
    if (remoteStorageActive && storage) {
      if (currentDiagram) {
        // The flush reports its own outcome. Reading `autoSave.saveStatus` back
        // out of this closure was a render behind the flush just awaited, so a
        // save inside the debounce window ('saving') skipped the whole branch
        // and a retry from 'error' did nothing at all (A1/LIFE-03, A1/LIFE-04).
        const flushed = await autoSave.saveNow();
        if (flushed === 'saved') {
          // The queued model is what every autosave tick writes — it just
          // landed, so confirm it rather than writing the same bytes twice.
          notificationStore.push({ severity: 'success', message: `"${currentDiagram.name}" saved` });
          return;
        }
        if (flushed === 'error') {
          // ADR 0011 — failure-of-intent: explicit dialog, not a toast.
          setSaveError(true);
          return;
        }
        try {
          const data = buildSaveData();
          await storage.saveDiagram(currentDiagram.id, data);
          const savedAt = new Date();
          setLastSaved(savedAt);
          notificationStore.push({ severity: 'success', message: `"${currentDiagram.name}" saved` });
        } catch {
          setSaveError(true);
        }
      }
    } else {
      if (currentDiagram) {
        saveDiagram();
      } else {
        setShowSaveDialog(true);
      }
    }
  }, [remoteStorageActive, storage, currentDiagram, autoSave, buildSaveData, saveDiagram]);

  // Keep the retry ref pointed at the latest handleSaveClick so SaveErrorDialog's
  // "Try again" re-runs the canonical save entry without re-binding retrySave.
  useEffect(() => {
    handleSaveClickRef.current = handleSaveClick;
  }, [handleSaveClick]);

  const handleOpenClick = useCallback(() => {
    if (remoteStorageActive) {
      setShowDiagramManager(true);
    } else {
      setShowLoadDialog(true);
    }
  }, [remoteStorageActive]);

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
    async (id: string, name: string, placeId?: string) => {
      if (!storage) return;
      try {
        // Flush pending writes to the CURRENT place before anything moves.
        await autoSave.saveNow();

        if (!remoteStorageActive) {
          const currentId = currentDiagramRef.current?.id ?? '__unsaved__';
          if (dirtyDiagramIdsRef.current.has(currentId) && currentModelRef.current) {
            scratchBufferRef.current.set(currentId, currentModelRef.current);
          }
        }

        // Places model: follow the diagram's place before loading so every
        // downstream branch (autosave vs session-dirty, status cluster,
        // guards) keys off the OPEN diagram. Manager switch is synchronous.
        if (placeId && storageManager && storageManager.activeProviderId !== placeId) {
          autoSave.resetStatus();
          setActiveProviderId(placeId);
        }

        const buffered = scratchBufferRef.current.get(id);
        const rawData: unknown = buffered ?? await storage.loadDiagram(id);
        await handleDiagramManagerLoad(id, rawData, name);
      } catch (e) {
        console.error('openDiagramById failed:', e);
        notificationStore.push({ severity: 'error', message: `Failed to open "${name}"` });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on stable autoSave.saveNow/resetStatus; whole autoSave churns on every save-status change
    [storage, storageManager, setActiveProviderId, remoteStorageActive, autoSave.saveNow, autoSave.resetStatus, handleDiagramManagerLoad]
  );

  const handlePreviewClick = useCallback(async () => {
    if (!currentDiagram || !storage) return;
    await autoSave.saveNow();
    // `fromEditor: true` tells the readonly toolbar (AppToolbar) to render
    // the "Back to editing" button. The flag rides location.state so direct
    // /display/<id> URLs (typed, shared, opened in a new tab) don't grow a
    // back button that would go somewhere the user didn't come from.
    navigate(`/display/${currentDiagram.id}`, { state: { fromEditor: true } });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on stable autoSave.saveNow; whole autoSave churns on every save-status change
  }, [currentDiagram, storage, autoSave.saveNow, navigate]);

  // ---------------------------------------------------------------------------
  // Export actions (toolbar Export popover)
  // ---------------------------------------------------------------------------
  const handleExportJSON = useCallback(() => {
    exportAsJSON(buildSaveData() as Model);
  }, [buildSaveData]);

  const handleExportImage = useCallback(() => {
    axoviewRef.current?.openExportImageDialog();
  }, []);

  // "Export project" — full bundled-zip export. State lives here so the toolbar
  // popover and any other UI surface can trigger it without prop-drilling.
  const [isProjectExportOpen, setIsProjectExportOpen] = useState(false);
  const handleExportProject = useCallback(() => {
    setIsProjectExportOpen(true);
  }, []);
  const closeProjectExport = useCallback(() => {
    setIsProjectExportOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Save All — flushes SESSION-place dirty buffers. The dirty set and scratch
  // buffer only ever hold session ids (Drive diagrams autosave), so this must
  // run even while a Drive diagram is open: move-to-Drive relies on it to make
  // the persisted session copy current before the source is deleted.
  // ---------------------------------------------------------------------------
  const saveAllDirty = useCallback(async () => {
    if (serverStorageAvailable) return; // server deploys have no session place
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

    // Write to the session place explicitly — storageRef follows the ACTIVE
    // place, which may be Drive while session buffers still need flushing.
    const s = storageManager?.getProvider('local') ?? storageRef.current;

    // Persist a never-saved (__unsaved__) buffer: allocate a unique name + id
    // and adopt it as the active diagram when nothing else is open.
    const saveNewDirty = async (dirtyData: DiagramData) => {
      const nameCandidate = dirtyData.title || diagramNameRef.current || 'Untitled Diagram';
      const chosenName = sequentialName(nameCandidate, sessionExistingNames);
      sessionExistingNames.push(chosenName);
      const savedPayload = { ...dirtyData, title: chosenName };
      const newId = s
        ? await s.createDiagram(savedPayload, null)
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const newSessionDiagram: SavedDiagram = {
        id: newId,
        name: chosenName,
        data: savedPayload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      sessionUpdates.push(newSessionDiagram);
      // Adopt as the open diagram only while the session place is active — a
      // session diagram must not become current under a Drive-active canvas.
      if (!currentDiagramRef.current && storageManager?.activeProviderId !== 'google-drive') {
        setCurrentDiagram(newSessionDiagram);
        setDiagramName(chosenName);
        setLastSaved(new Date());
      }
    };

    // Persist an already-tracked diagram in place; no-op if it has vanished
    // from the diagrams list.
    const saveExistingDirty = async (dirtyId: string, dirtyData: DiagramData) => {
      const existingEntry = diagrams.find((d) => d.id === dirtyId);
      if (!existingEntry) return;
      if (s) await s.saveDiagram(dirtyId, dirtyData);
      sessionUpdates.push({ ...existingEntry, data: dirtyData, updatedAt: new Date().toISOString() });
      if (dirtyId === currentDiagramRef.current?.id) setLastSaved(new Date());
    };

    for (const dirtyId of allDirtyIds) {
      const dirtyData = resolveData(dirtyId);
      if (!dirtyData) continue;
      try {
        if (dirtyId === '__unsaved__') {
          await saveNewDirty(dirtyData);
        } else {
          await saveExistingDirty(dirtyId, dirtyData);
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
  }, [diagrams, serverStorageAvailable, storageManager]);

  // ---------------------------------------------------------------------------
  // Model update handler
  // ---------------------------------------------------------------------------
  const handleModelUpdated = useCallback(
    (model: Model) => {
      // isoflow's model schema doesn't include `requiredPacks`, so the field
      // is dropped from `model` here. Re-attach from the in-memory ref so the
      // hint survives autosave round-trips when the icons array hasn't been
      // fully rehydrated (e.g. a pack is still loading on first open).
      const preservedRequiredPacks = currentModelRef.current?.requiredPacks;
      const updatedModel: DiagramData = {
        title: model.title || diagramNameRef.current || 'Untitled',
        icons: model.icons || [],
        colors: model.colors || defaultColors,
        items: model.items || [],
        views: model.views || [],
        fitToScreen: true,
        ...(Array.isArray(preservedRequiredPacks)
          ? { requiredPacks: preservedRequiredPacks }
          : {})
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

      if (remoteStorageActive) {
        // ── Server mode ──────────────────────────────────────────────────────
        const currentId = currentDiagramRef.current?.id ?? null;
        if (currentId) {
          autoSave.scheduleSave(currentId, updatedModel);
        }
        // If no diagram open, do nothing — user must create explicitly
      } else {
        // ── Session mode ─────────────────────────────────────────────────────
        const currentId = currentDiagramRef.current?.id ?? null;
        const bufferKey = currentId ?? '__unsaved__';
        scratchBufferRef.current.set(bufferKey, updatedModel);
        if (!dirtyDiagramIdsRef.current.has(bufferKey)) {
          setDirtyDiagramIds((prev) => setWithAdd(prev, bufferKey));
        }
        // Auto-save to session storage when a diagram is open (no ID = unsaved new
        // diagram, must be explicitly saved first via Ctrl+S).
        if (currentId) {
          autoSave.scheduleSave(currentId, updatedModel);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on stable autoSave.scheduleSave; whole autoSave churns on every save-status change
    [isReadonlyUrl, remoteStorageActive, autoSave.scheduleSave]
  );

  // ---------------------------------------------------------------------------
  // Icon pack manager prop (memoised)
  // ---------------------------------------------------------------------------
  const handleTogglePack = useCallback(
    (packName: string, enabled: boolean) => {
      iconPackManager.togglePack(packName as IconPackName, enabled);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- iconPackManager.togglePack is a stable method; whole iconPackManager churns on every pack-state change
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

  const refreshFileTree = useCallback(
    () => setFileTreeRefreshToken((n) => n + 1),
    []
  );

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------
  const value: DiagramLifecycleContextValue = {
    diagramName,
    setDiagramName,
    hasUnsavedChanges,
    lastSaved: remoteStorageActive ? autoSave.lastSaved : lastSaved,
    currentDiagram,
    diagrams,
    currentModel,
    isReadonlyUrl,
    isPublicShareUrl,
    readonlyLoadFailed,
    clearReadonlyLoadFailed,
    publicShareLoadFailed,
    clearPublicShareLoadFailed,
    driveDisplayFileId: driveFileId ?? null,
    driveDisplayState,
    retryDriveDisplayRead,
    saveError,
    clearSaveError,
    retrySave,
    saveStatus: autoSave.saveStatus,
    showExportDialog,
    setShowExportDialog,
    axoviewRef,
    isAfterLoadRef,
    frozenInitialDataRef,
    toolbarPortalTarget,
    setToolbarPortalTarget,
    sidebarTogglePortalTarget,
    setSidebarTogglePortalTarget,
    styleControlsPortalTarget,
    setStyleControlsPortalTarget,
    handleSaveClick,
    handleOpenClick,
    handlePreviewClick,
    handleModelUpdated,
    handleExportJSON,
    handleExportImage,
    handleExportProject,
    isProjectExportOpen,
    closeProjectExport,
    handleNewDiagram,
    handleRenameCurrentDiagram,
    notifyDiagramRenamedFromTree,
    notifyDiagramDeletedFromTree,
    saveAllDirty,
    handleCreateBlankDiagram,
    checkUnsavedBeforeNavigate,
    handleGoogleSignedOut,
    fileExplorerOpen,
    setFileExplorerOpen,
    openDiagramById,
    fileTreeRefreshToken,
    refreshFileTree,
    dirtyDiagramIds,
    sessionWorkUnexported,
    markProjectExported,
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
        <ExportSingleDiagramDialog
          onExport={exportDiagram}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {showStorageManager && (
        <LocalStorageInspector onClose={() => setShowStorageManager(false)} />
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
