import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { StorageProvider } from '../services/storage/types';
import { StorageManager } from '../services/storage/StorageManager';
import { LocalStorageProvider } from '../services/storage/providers/LocalStorageProvider';
import { GoogleDriveProvider } from '../services/storage/providers/GoogleDriveProvider';
import { fetchRuntimeConfig, RuntimeConfig } from '../hooks/useRuntimeConfig';
import { useAuthStore } from '../stores/authStore';

interface AppStorageContextValue {
  storage: StorageProvider | null;
  storageManager: StorageManager | null;
  isServerStorage: boolean;
  isInitialized: boolean;
  /** True in the session-backend deployment (Docker/self-host). */
  serverStorageAvailable: boolean;
  /**
   * Id of the active storage provider ('local' | 'google-drive').
   *
   * Places model (2026-07-06): this is NO LONGER a user-facing mode — it
   * silently follows the OPEN diagram's place (set by the lifecycle open/create
   * paths) so every mode branch (autosave, status cluster, guards) keys off
   * the open diagram. The user-facing picker was removed.
   */
  activeProviderId: string;
  /** Follow a diagram's place (updates the manager + triggers a re-render). */
  setActiveProviderId: (id: string) => void;
  /**
   * True when storage behaves like a remote backend — either the session
   * backend OR an active Google Drive provider. Storage-behavior branches
   * (autosave, explorer, navigation guards) key off this; session-backend
   * contracts (public share links, /display/p/*) stay on serverStorageAvailable.
   */
  remoteStorageActive: boolean;
  /** True when a Google client id is configured (Drive surfaces may render). */
  googleDriveConfigured: boolean;
  /**
   * Where a NEW diagram goes when the caller doesn't say: Drive when signed in
   * on a storage-less deployment, otherwise the local place (browser session,
   * or the self-host server backend which is already durable).
   */
  defaultPlaceId: 'local' | 'google-drive';
  runtimeConfig: RuntimeConfig | null;
}

const AppStorageContext = createContext<AppStorageContextValue>({
  storage: null,
  storageManager: null,
  isServerStorage: false,
  isInitialized: false,
  serverStorageAvailable: false,
  activeProviderId: 'local',
  setActiveProviderId: () => {},
  remoteStorageActive: false,
  googleDriveConfigured: false,
  defaultPlaceId: 'local',
  runtimeConfig: null
});

// Singleton — created once outside the component so it survives re-renders.
const manager = new StorageManager();
manager.registerProvider(new LocalStorageProvider());
manager.registerProvider(new GoogleDriveProvider());
manager.setActiveProvider('local');

export function AppStorageProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isServerStorage, setIsServerStorage] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  // A2/STOR-12 — the manager singleton outlives every React tree, so IT owns
  // the active place and this state is only a mirror of it. Seeding from
  // `useState('local')` meant a remount (any /display round trip: EditorPage is
  // the element of every route) re-rendered as "local" while every read and
  // write still went to Drive — and `remoteStorageActive` picks the
  // autosave-vs-session-dirty branch, the status cluster and the guards.
  const [activeProviderId, setActiveProviderIdState] = useState(
    () => manager.activeProviderId
  );
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    (async () => {
      // ADR 0009 D2: single /api/config probe. The serverStorage boolean in
      // that response is the canonical mode signal — no second probe to
      // /api/storage/status. fetchRuntimeConfig itself swallows network
      // errors and warns; on failure its result is DEFAULT_CONFIG (serverStorage:
      // false), which is exactly the Local-mode fallback the ADR specifies.
      const config = await fetchRuntimeConfig();
      manager.setServerStorage(config.serverStorage);
      setRuntimeConfig(config);
      setIsServerStorage(manager.serverStorageAvailable);
      setIsInitialized(true);
    })();
  }, []);

  const setActiveProviderId = useCallback((id: string) => {
    manager.setActiveProvider(id);
    setActiveProviderIdState(id);
  }, []);

  // Auth status feeds defaultPlaceId (signed in ⇒ new diagrams go to Drive on
  // the storage-less deployment). authStore is a standalone zustand store, so
  // subscribing here creates no provider-order dependency on AuthProvider.
  const authStatus = useAuthStore((s) => s.status);

  const serverStorageAvailable = isServerStorage && isInitialized;
  const remoteStorageActive =
    serverStorageAvailable || activeProviderId === 'google-drive';
  const googleDriveConfigured = !!(
    runtimeConfig?.googleClientId || process.env.PUBLIC_GOOGLE_CLIENT_ID
  );
  const defaultPlaceId: 'local' | 'google-drive' =
    !serverStorageAvailable &&
    googleDriveConfigured &&
    (authStatus === 'AUTHENTICATED' || authStatus === 'REFRESHING')
      ? 'google-drive'
      : 'local';

  return (
    <AppStorageContext.Provider
      value={{
        storage: manager,
        storageManager: manager,
        isServerStorage,
        isInitialized,
        serverStorageAvailable,
        activeProviderId,
        setActiveProviderId,
        remoteStorageActive,
        googleDriveConfigured,
        defaultPlaceId,
        runtimeConfig
      }}
    >
      {children}
    </AppStorageContext.Provider>
  );
}

export const useAppStorage = () => useContext(AppStorageContext);
