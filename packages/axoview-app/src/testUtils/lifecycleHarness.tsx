/**
 * Lifecycle test harness — renders the real `DiagramLifecycleProvider` under
 * jsdom with every out-of-scope dependency stubbed, and hands the test its
 * context value. Reusable across the whole app-shell surface (the lifecycle
 * provider is the seam every storage/save/load flow passes through).
 *
 * Why render the real provider rather than test its pieces: several lifecycle
 * behaviours are about a *closure* read (`handleSaveClick` reads
 * `autoSave.saveStatus` from the render-time closure) or about which of two
 * `beforeunload` listeners wins — neither is observable below the component.
 *
 * Originally the 2026-07 exploratory campaign's A1 harness; moved to
 * testUtils/ at the 2026-08-10 lane dissolution (ADR 0047).
 *
 * Callers MUST `jest.mock` these modules before importing (jest.mock is
 * hoisted and needs literal paths, so the block is inlined per test file —
 * see DiagramLifecycleProvider.readonlyAndLoad.test.tsx for the canonical one):
 *   react-router-dom, react-i18next, @isoflow/isopacks/dist/utils,
 *   @isoflow/isopacks/dist/isoflow, ../../services/iconPackManager,
 *   ../../hooks/useRuntimeConfig, ../../services/drive/drivePublicRead,
 *   ../AppStorageContext.
 */
import { render } from '@testing-library/react';
import { useEffect } from 'react';
import {
  DiagramLifecycleProvider,
  useDiagramLifecycle
} from '../providers/DiagramLifecycleProvider';
import type { StorageProvider } from '../services/storage/types';
import type { DiagramData, SavedDiagram } from '../diagramUtils';

export type LifecycleCtx = ReturnType<typeof useDiagramLifecycle>;

export const MODEL = (title: string, items: unknown[] = []): DiagramData =>
  ({ title, icons: [], colors: [], items, views: [], fitToScreen: true }) as DiagramData;

export interface StorageDouble {
  storage: StorageProvider;
  saveCalls: Array<{ id: string; title: string }>;
  createCalls: Array<{ title: string; folderId: string | null }>;
  deleteCalls: string[];
  renameCalls: Array<{ id: string; name: string }>;
  /** When set, every saveDiagram rejects with this. */
  failSaveWith: Error | null;
}

export function makeStorage(overrides: Partial<StorageProvider> = {}): StorageDouble {
  const d: StorageDouble = {
    saveCalls: [],
    createCalls: [],
    deleteCalls: [],
    renameCalls: [],
    failSaveWith: null,
    storage: null as unknown as StorageProvider
  };
  d.storage = {
    saveDiagram: async (id: string, model: unknown) => {
      d.saveCalls.push({ id, title: (model as DiagramData)?.title as string });
      if (d.failSaveWith) throw d.failSaveWith;
    },
    createDiagram: async (model: unknown, folderId: string | null) => {
      d.createCalls.push({ title: (model as DiagramData)?.title as string, folderId });
      return `new-${d.createCalls.length}`;
    },
    loadDiagram: async () => ({ title: 'loaded', items: [], views: [] }),
    listDiagrams: async () => [],
    deleteDiagram: async (id: string) => { d.deleteCalls.push(id); },
    renameDiagram: async (id: string, name: string) => { d.renameCalls.push({ id, name }); },
    ...overrides
  } as unknown as StorageProvider;
  return d;
}

export interface RenderOpts {
  remoteStorageActive?: boolean;
  serverStorageAvailable?: boolean;
  storage?: StorageProvider | null;
  activeProviderId?: string;
  setActiveProviderId?: (id: string) => void;
  /** Value returned by useAppStorage; built from the flags above when absent. */
  appStorage?: Record<string, unknown>;
}

/**
 * `useAppStorage` is mocked per-probe; this is the value it should return.
 * Kept here so every probe builds the same shape.
 */
export function appStorageValue(opts: RenderOpts = {}) {
  const storage = opts.storage === undefined ? makeStorage().storage : opts.storage;
  const activeProviderId = opts.activeProviderId ?? 'local';
  const storageManager = {
    activeProviderId,
    getProvider: () => storage,
    setActiveProvider: () => {}
  };
  return {
    storage,
    storageManager,
    isServerStorage: !!opts.serverStorageAvailable,
    isInitialized: true,
    serverStorageAvailable: !!opts.serverStorageAvailable,
    activeProviderId,
    setActiveProviderId: opts.setActiveProviderId ?? (() => {}),
    remoteStorageActive: opts.remoteStorageActive ?? false,
    googleDriveConfigured: false,
    defaultPlaceId: 'local' as const,
    runtimeConfig: null
  };
}

/**
 * Renders the provider and returns a live accessor for its context value plus
 * the RTL handles. `ctx()` always reads the LATEST committed value — the point
 * of several probes is that a *stale closure* differs from it.
 */
export function renderLifecycle() {
  let latest: LifecycleCtx | null = null;
  const seen: LifecycleCtx[] = [];

  function Probe() {
    const value = useDiagramLifecycle();
    latest = value;
    useEffect(() => { seen.push(value); });
    return null;
  }

  const utils = render(
    <DiagramLifecycleProvider>
      <Probe />
    </DiagramLifecycleProvider>
  );

  return {
    ...utils,
    ctx: () => {
      if (!latest) throw new Error('harness: provider context never rendered');
      return latest;
    },
    renders: seen
  };
}

export type { SavedDiagram };
