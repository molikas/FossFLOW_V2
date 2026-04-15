import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { StorageProvider } from '../services/storage/types';
import { StorageManager } from '../services/storage/StorageManager';
import { LocalStorageProvider } from '../services/storage/providers/LocalStorageProvider';
import { GoogleDriveProvider } from '../services/storage/providers/GoogleDriveProvider';
import { S3Provider } from '../services/storage/providers/S3Provider';

interface AppStorageContextValue {
  storage: StorageProvider | null;
  storageManager: StorageManager | null;
  isServerStorage: boolean;
  isInitialized: boolean;
  serverStorageAvailable: boolean;
}

const AppStorageContext = createContext<AppStorageContextValue>({
  storage: null,
  storageManager: null,
  isServerStorage: false,
  isInitialized: false,
  serverStorageAvailable: false
});

// Singleton — created once outside the component so it survives re-renders.
const manager = new StorageManager();
const localProvider = new LocalStorageProvider();
manager.registerProvider(localProvider);
manager.registerProvider(new GoogleDriveProvider());
manager.registerProvider(new S3Provider());
manager.setActiveProvider('local');

export function AppStorageProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isServerStorage, setIsServerStorage] = useState(false);
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    manager.initialize().then(() => {
      setIsServerStorage(manager.serverStorageAvailable);
      setIsInitialized(true);
    });
  }, []);

  const serverStorageAvailable = isServerStorage && isInitialized;

  return (
    <AppStorageContext.Provider
      value={{
        storage: manager,
        storageManager: manager,
        isServerStorage,
        isInitialized,
        serverStorageAvailable
      }}
    >
      {children}
    </AppStorageContext.Provider>
  );
}

export const useAppStorage = () => useContext(AppStorageContext);
