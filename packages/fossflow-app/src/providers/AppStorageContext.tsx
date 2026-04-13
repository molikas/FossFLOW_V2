import { createContext, useContext } from 'react';
import { useStorage, StorageService } from '../services/storageService';

interface AppStorageContextValue {
  storage: StorageService | null;
  isServerStorage: boolean;
  isInitialized: boolean;
  serverStorageAvailable: boolean;
}

const AppStorageContext = createContext<AppStorageContextValue>({
  storage: null,
  isServerStorage: false,
  isInitialized: false,
  serverStorageAvailable: false
});

export function AppStorageProvider({ children }: { children: React.ReactNode }) {
  const { storage, isServerStorage, isInitialized } = useStorage();
  const serverStorageAvailable = isServerStorage && isInitialized;

  return (
    <AppStorageContext.Provider
      value={{ storage, isServerStorage, isInitialized, serverStorageAvailable }}
    >
      {children}
    </AppStorageContext.Provider>
  );
}

export const useAppStorage = () => useContext(AppStorageContext);
