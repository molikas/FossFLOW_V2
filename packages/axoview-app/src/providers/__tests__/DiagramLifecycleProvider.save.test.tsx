/**
 * `DiagramLifecycleProvider` — the manual-save entry point and the unsaved-work
 * guard, exercised through the real provider under jsdom.
 *
 * Promoted from the 2026-07 exploratory campaign's probe lane
 * (`__explore__/A1/save-life-02-03-04-14`) with the bugs fixed — A1/LIFE-02,
 * LIFE-03, LIFE-04, plus LIFE-14's characterization of the (now single) guard.
 *
 * Why the real provider rather than its pieces: all three defects were about a
 * *closure* read (`handleSaveClick` reading `autoSave.saveStatus` a render
 * behind the flush it just awaited) or about which of two `beforeunload`
 * listeners answered — neither is observable below the component.
 */
import { render, act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';

// --- module stubs ----------------------------------------------------------
jest.mock('react-router-dom', () => ({
  useParams: () => ({}),
  useNavigate: () => jest.fn()
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === 'string' ? fallback : key,
    i18n: { language: 'en' }
  })
}));
jest.mock('@isoflow/isopacks/dist/utils', () => ({ flattenCollections: () => [] }));
jest.mock('@isoflow/isopacks/dist/isoflow', () => ({}), { virtual: true });
jest.mock('../../services/iconPackManager', () => ({
  useIconPackManager: () => ({
    loadedIcons: [],
    loadPacksForDiagram: async () => {},
    togglePack: () => {},
    toggleLazyLoading: () => {},
    lazyLoadingEnabled: false,
    packInfo: {},
    enabledPacks: []
  })
}));
jest.mock('../../hooks/useRuntimeConfig', () => ({
  fetchRuntimeConfig: async () => ({ serverStorage: false, drivePublicPreview: false })
}));
jest.mock('../../services/drive/drivePublicRead', () => ({
  readDriveDisplayFile: async () => ({ ok: false, reason: 'not-found' })
}));

let appStorage: Record<string, unknown> = {};
jest.mock('../AppStorageContext', () => ({
  useAppStorage: () => appStorage,
  AppStorageProvider: ({ children }: { children: unknown }) => children
}));

import { DiagramLifecycleProvider, useDiagramLifecycle } from '../DiagramLifecycleProvider';
import { notificationStore } from '../../stores/notificationStore';
import type { StorageProvider } from '../../services/storage/types';
import type { DiagramData } from '../../diagramUtils';

const DEBOUNCE_MS = 2000;

type LifecycleCtx = ReturnType<typeof useDiagramLifecycle>;

const MODEL = (title: string): DiagramData =>
  ({ title, icons: [], colors: [], items: [], views: [], fitToScreen: true }) as DiagramData;

interface StorageDouble {
  storage: StorageProvider;
  saveCalls: Array<{ id: string; title: string }>;
  createCalls: Array<{ title: string }>;
  /** When set, every saveDiagram rejects with this. */
  failSaveWith: Error | null;
}

function makeStorage(): StorageDouble {
  const d: StorageDouble = {
    saveCalls: [],
    createCalls: [],
    failSaveWith: null,
    storage: null as unknown as StorageProvider
  };
  d.storage = {
    saveDiagram: async (id: string, model: unknown) => {
      d.saveCalls.push({ id, title: (model as DiagramData)?.title as string });
      if (d.failSaveWith) throw d.failSaveWith;
    },
    createDiagram: async (model: unknown) => {
      d.createCalls.push({ title: (model as DiagramData)?.title as string });
      return 'new-1';
    },
    loadDiagram: async () => ({ title: 'loaded', items: [], views: [] }),
    listDiagrams: async () => [],
    deleteDiagram: async () => {},
    renameDiagram: async () => {}
  } as unknown as StorageProvider;
  return d;
}

function appStorageValue(opts: { remoteStorageActive?: boolean; storage?: StorageProvider }) {
  const storage = opts.storage ?? makeStorage().storage;
  return {
    storage,
    storageManager: {
      activeProviderId: 'local',
      getProvider: () => storage,
      setActiveProvider: () => {}
    },
    isServerStorage: false,
    isInitialized: true,
    serverStorageAvailable: false,
    activeProviderId: 'local',
    setActiveProviderId: () => {},
    remoteStorageActive: opts.remoteStorageActive ?? false,
    googleDriveConfigured: false,
    defaultPlaceId: 'local' as const,
    runtimeConfig: null
  };
}

/** Renders the provider and returns a live accessor for its context value. */
function renderLifecycle() {
  let latest: LifecycleCtx | null = null;
  function Probe() {
    const value = useDiagramLifecycle();
    latest = value;
    useEffect(() => {});
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
    }
  };
}

/** Drive the model-update callback the lib would fire, as one act() batch. */
async function emitModelUpdate(ctx: LifecycleCtx, model: DiagramData) {
  await act(async () => { ctx.handleModelUpdated(model as never); });
}

/**
 * The provider swallows exactly one `handleModelUpdated` per load
 * (`isAfterLoadRef`), including the first one after mount — so burn it before
 * the test's first real edit, and assert both ends of the protocol.
 */
async function consumeLoadEcho(ctx: LifecycleCtx) {
  expect(ctx.isAfterLoadRef.current).toBe(true);
  await emitModelUpdate(ctx, MODEL('load-echo'));
  expect(ctx.isAfterLoadRef.current).toBe(false);
}

/** Remote mode with a diagram open, status idle, save log cleared. */
async function bootRemoteWithOpenDiagram() {
  const d = makeStorage();
  appStorage = appStorageValue({ remoteStorageActive: true, storage: d.storage });
  const h = renderLifecycle();
  await act(async () => { await h.ctx().openDiagramById('diag-1', 'Diag One'); });
  expect(h.ctx().currentDiagram?.id).toBe('diag-1'); // precondition
  expect(h.ctx().saveStatus).toBe('idle');
  await consumeLoadEcho(h.ctx());
  d.saveCalls.length = 0;
  return { h, d };
}

function unloadIsBlocked(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

let toasts: Array<{ severity: string; message: string }>;
beforeEach(() => {
  jest.useFakeTimers();
  toasts = [];
  jest.spyOn(notificationStore, 'push').mockImplementation((n) => {
    toasts.push(n as { severity: string; message: string });
    return undefined as never;
  });
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// LIFE-04 — Ctrl+S inside the 2 s debounce window used to skip the explicit
// save and its success toast, because the gate read a closure-stale
// `saveStatus === 'idle'`.
// ---------------------------------------------------------------------------
describe('manual save inside the debounce window', () => {
  it('confirms like a save from rest, and writes the edit exactly once', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();

    // (a) baseline — a save from rest toasts.
    await act(async () => { await h.ctx().handleSaveClick(); });
    expect(d.saveCalls).toHaveLength(1);
    expect(toasts.filter((x) => x.severity === 'success')).toHaveLength(1);

    // (b) edit, then save immediately — status is 'saving' when the click lands.
    toasts.length = 0;
    d.saveCalls.length = 0;
    await emitModelUpdate(h.ctx(), MODEL('edited'));
    expect(h.ctx().saveStatus).toBe('saving'); // precondition

    await act(async () => { await h.ctx().handleSaveClick(); });

    expect(d.saveCalls.map((c) => c.title)).toEqual(['edited']);
    expect(toasts.filter((x) => x.severity === 'success')).toHaveLength(1);
    await waitFor(() => expect(h.ctx().saveStatus).toBe('idle'));
  });
});

// ---------------------------------------------------------------------------
// LIFE-03 — the StatusCluster's "Retry" after a failed autosave is wired
// straight to `handleSaveClick`. From 'error' the stale gate blocked the
// explicit save and the flush had nothing pending (LIFE-01), so the retry
// wrote nothing and reported nothing.
// ---------------------------------------------------------------------------
describe('retry after a failed autosave', () => {
  it('writes the unsaved model and reports success', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();

    d.failSaveWith = new Error('backend down');
    await emitModelUpdate(h.ctx(), MODEL('precious'));
    await act(async () => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    await waitFor(() => expect(h.ctx().saveStatus).toBe('error'));
    expect(d.saveCalls.map((c) => c.title)).toEqual(['precious']); // precondition

    d.failSaveWith = null; // the outage is over
    d.saveCalls.length = 0;
    toasts.length = 0;

    await act(async () => { await h.ctx().handleSaveClick(); });

    expect(d.saveCalls.map((c) => c.title)).toEqual(['precious']);
    expect(toasts.filter((x) => x.severity === 'success')).toHaveLength(1);
    await waitFor(() => expect(h.ctx().saveStatus).toBe('idle'));
  });

  it('surfaces a dialog (not a toast) when the retry fails too — ADR 0011', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();
    d.failSaveWith = new Error('backend down');
    await emitModelUpdate(h.ctx(), MODEL('precious'));
    await act(async () => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    await waitFor(() => expect(h.ctx().saveStatus).toBe('error'));

    await act(async () => { await h.ctx().handleSaveClick(); });

    expect(h.ctx().saveError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LIFE-02 — a failed autosave is the state where the work is most at risk, and
// it used to be the state in which nothing objected to closing the tab: guard
// #1 was hard-false in remote mode and guard #2 knew only 'saving'.
// ---------------------------------------------------------------------------
describe('the unsaved-work guard', () => {
  it('blocks unload after an autosave has failed', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();
    d.failSaveWith = new Error('backend down');

    await emitModelUpdate(h.ctx(), MODEL('precious'));
    expect(unloadIsBlocked()).toBe(true); // mid-debounce

    await act(async () => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    await waitFor(() => expect(h.ctx().saveStatus).toBe('error'));
    expect(d.saveCalls).toHaveLength(1); // the write really failed

    expect(unloadIsBlocked()).toBe(true);
  });

  it('stays quiet when everything has landed', async () => {
    const { h } = await bootRemoteWithOpenDiagram();
    expect(unloadIsBlocked()).toBe(false); // precondition: clean boot

    await emitModelUpdate(h.ctx(), MODEL('edited'));
    expect(unloadIsBlocked()).toBe(true);

    await act(async () => { await h.ctx().handleSaveClick(); });
    await waitFor(() => expect(h.ctx().saveStatus).toBe('idle'));

    expect(unloadIsBlocked()).toBe(false);
  });

  it('blocks unload on session-place dirty work too (LIFE-14)', async () => {
    const d = makeStorage();
    appStorage = appStorageValue({ remoteStorageActive: false, storage: d.storage });
    const h = renderLifecycle();

    expect(unloadIsBlocked()).toBe(false); // precondition: clean boot, no warn
    await consumeLoadEcho(h.ctx());

    // Session mode, nothing open ⇒ the edit lands under '__unsaved__'.
    await emitModelUpdate(h.ctx(), MODEL('scratch'));
    expect(h.ctx().dirtyDiagramIds.has('__unsaved__')).toBe(true); // precondition

    expect(unloadIsBlocked()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LIFE-09 — `handleCreateBlankDiagram` flushed only when the PLACE changed, and
// `handleDiagramManagerLoad`'s `resetStatus()` then threw the queued model
// away: creating a diagram in the place you were already in discarded the open
// diagram's last two seconds of edits, silently.
// ---------------------------------------------------------------------------
describe('creating a blank diagram', () => {
  it('flushes the open diagram first, even in the same place', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();

    await emitModelUpdate(h.ctx(), MODEL('precious-edit'));
    expect(h.ctx().saveStatus).toBe('saving'); // precondition: queued, unwritten
    expect(d.saveCalls).toHaveLength(0);

    await act(async () => { await h.ctx().handleCreateBlankDiagram(null); });

    // The create really happened and adopted the new diagram, so the write
    // count below is about the flush, not a dead code path.
    expect(d.createCalls).toHaveLength(1);
    expect(h.ctx().currentDiagram?.id).toBe('new-1');
    expect(d.saveCalls.filter((c) => c.id === 'diag-1').map((c) => c.title))
      .toEqual(['precious-edit']);
  });
});
