/**
 * A1 shared harness — renders the real `DiagramLifecycleProvider` under jsdom
 * with every out-of-scope dependency stubbed, and hands the test its context
 * value. Reusable by A2–A5 (the whole app-shell track keys off this provider).
 *
 * Why render the real provider rather than test its pieces: several A1
 * hypotheses are about a *closure* read (`handleSaveClick` reads
 * `autoSave.saveStatus` from the render-time closure) or about which of two
 * `beforeunload` listeners wins — neither is observable below the component.
 * This is the same lesson S1 recorded (rendering the real component is what
 * turned store-level findings into user-visible ones).
 *
 * Callers MUST `jest.mock` the module list in `MOCK_NOTES` before importing —
 * see any A1 probe for the canonical block.
 */
import { render, act } from '@testing-library/react';
import { useEffect } from 'react';
import {
  DiagramLifecycleProvider,
  useDiagramLifecycle
} from '../../providers/DiagramLifecycleProvider';
import type { StorageProvider } from '../../services/storage/types';
import type { DiagramData, SavedDiagram } from '../../diagramUtils';

export const MOCK_NOTES = [
  'react-router-dom',
  'react-i18next',
  '@isoflow/isopacks/dist/utils',
  '@isoflow/isopacks/dist/isoflow',
  '../../services/iconPackManager',
  '../../hooks/useRuntimeConfig',
  '../../services/drive/drivePublicRead',
  '../../providers/AppStorageContext'
] as const;

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

/** Drive the model-update callback the lib would fire, as one act() batch. */
export async function emitModelUpdate(ctx: LifecycleCtx, model: DiagramData) {
  await act(async () => {
    ctx.handleModelUpdated(model as never);
  });
}

/**
 * The provider swallows exactly one `handleModelUpdated` per load
 * (`isAfterLoadRef`) — including the very first one after mount, since the ref
 * is seeded `true`. A probe that skips this reads its first real edit as a
 * no-op and silently loses its precondition, so this asserts both ends of the
 * protocol rather than just calling through.
 */
export async function consumeLoadEcho(ctx: LifecycleCtx) {
  expect(ctx.isAfterLoadRef.current).toBe(true);
  await emitModelUpdate(ctx, MODEL('load-echo'));
  expect(ctx.isAfterLoadRef.current).toBe(false);
}

export type { SavedDiagram };
