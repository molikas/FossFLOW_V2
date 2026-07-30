/**
 * A1 — the manual-save entry point (LIFE-02, 03, 04, 14).
 *
 * All four are about `handleSaveClick`'s closure read of `autoSave.saveStatus`
 * and about what the two `beforeunload` listeners consider "pending", so they
 * need the REAL provider rendered (harness.tsx).
 */
import { act, waitFor } from '@testing-library/react';

// --- module stubs (see harness.MOCK_NOTES) ---------------------------------
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
jest.mock('../../providers/AppStorageContext', () => ({
  useAppStorage: () => appStorage,
  AppStorageProvider: ({ children }: { children: unknown }) => children
}));

import {
  renderLifecycle,
  emitModelUpdate,
  appStorageValue,
  consumeLoadEcho,
  makeStorage,
  MODEL
} from './harness';
import { notificationStore } from '../../stores/notificationStore';

const DEBOUNCE_MS = 2000;

/**
 * Put the provider into remote mode with a diagram open. There is no public
 * setter for `currentDiagram`, so we go through the one path that installs one
 * without touching storage twice: `openDiagramById` (which resolves the blob
 * from the storage double and routes into handleDiagramManagerLoad).
 */
async function bootRemoteWithOpenDiagram() {
  const d = makeStorage();
  appStorage = appStorageValue({ remoteStorageActive: true, storage: d.storage });
  const h = renderLifecycle();
  await act(async () => {
    await h.ctx().openDiagramById('diag-1', 'Diag One');
  });
  // PRECONDITION: a diagram really is open, in remote mode, status idle.
  expect(h.ctx().currentDiagram?.id).toBe('diag-1');
  expect(h.ctx().saveStatus).toBe('idle');
  // The load's own echo update is swallowed by isAfterLoadRef — burn it here so
  // every probe's FIRST edit is a real edit.
  await consumeLoadEcho(h.ctx());
  d.saveCalls.length = 0;
  return { h, d };
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
// LIFE-04 — Ctrl+S inside the debounce window skips the explicit save AND its
// success toast, because `handleSaveClick` gates on a closure-stale
// `autoSave.saveStatus === 'idle'`.
// ---------------------------------------------------------------------------
describe('LIFE-04 — manual save inside the debounce window gives no confirmation', () => {
  it('characterization: an edit-then-save gets zero success toast; a save from rest gets one', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();

    // (a) save from rest — the baseline that proves the toast path works.
    await act(async () => { await h.ctx().handleSaveClick(); });
    expect(d.saveCalls).toHaveLength(1);
    expect(toasts.filter((x) => x.severity === 'success')).toHaveLength(1);

    // (b) edit, then save immediately — status is 'saving' in the closure.
    toasts.length = 0;
    d.saveCalls.length = 0;
    await emitModelUpdate(h.ctx(), MODEL('edited'));
    expect(h.ctx().saveStatus).toBe('saving'); // precondition

    await act(async () => { await h.ctx().handleSaveClick(); });
    // The debounced flush still wrote the model, so no data is lost...
    expect(d.saveCalls.map((c) => c.title)).toEqual(['edited']);
    // ...but the user is told nothing at all.
    expect(toasts.filter((x) => x.severity === 'success')).toHaveLength(0);
  });

  it.failing('LIFE-04: a manual save right after an edit confirms like any other', async () => {
    const { h } = await bootRemoteWithOpenDiagram();
    await emitModelUpdate(h.ctx(), MODEL('edited'));
    expect(h.ctx().saveStatus).toBe('saving'); // precondition
    await act(async () => { await h.ctx().handleSaveClick(); });
    // Expected: same feedback as a save from rest. Actual: the closure still
    // reads 'saving', so the whole explicit-save + toast branch is skipped.
    expect(toasts.filter((x) => x.severity === 'success')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LIFE-03 — after a failed autosave the StatusCluster shows "Save failed
// [Retry]", and Retry is wired straight to `handleSaveClick`. From 'error' the
// gate blocks the explicit save, and `saveNow()` has nothing pending (LIFE-01)
// — so the retry writes nothing and reports nothing.
// ---------------------------------------------------------------------------
describe('LIFE-03 — the "Retry" after a failed autosave is inert', () => {
  it('characterization: retry from saveStatus==="error" performs no write and changes nothing', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();

    d.failSaveWith = new Error('backend down');
    await emitModelUpdate(h.ctx(), MODEL('precious'));
    await act(async () => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    await waitFor(() => expect(h.ctx().saveStatus).toBe('error'));
    // PRECONDITION: the failed write really was attempted.
    expect(d.saveCalls.map((c) => c.title)).toEqual(['precious']);

    d.failSaveWith = null; // the outage is over — a retry could now succeed
    d.saveCalls.length = 0;
    toasts.length = 0;

    await act(async () => { await h.ctx().handleSaveClick(); });

    expect(d.saveCalls).toHaveLength(0);
    expect(toasts).toHaveLength(0);
    expect(h.ctx().saveStatus).toBe('error');
    expect(h.ctx().saveError).toBe(false); // no dialog either
  });

  it.failing('LIFE-03: Retry after a failed autosave writes the unsaved model', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();
    d.failSaveWith = new Error('backend down');
    await emitModelUpdate(h.ctx(), MODEL('precious'));
    await act(async () => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    await waitFor(() => expect(h.ctx().saveStatus).toBe('error'));
    expect(d.saveCalls).toHaveLength(1); // precondition

    d.failSaveWith = null;
    d.saveCalls.length = 0;
    await act(async () => { await h.ctx().handleSaveClick(); });
    // Expected: the recovery affordance recovers. Actual: nothing happens.
    expect(d.saveCalls.map((c) => c.title)).toEqual(['precious']);
  });
});

// ---------------------------------------------------------------------------
// LIFE-02 — neither beforeunload guard treats 'error' as pending work, so in
// remote mode the tab closes silently over an unsaved edit.
// ---------------------------------------------------------------------------
function unloadIsBlocked(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

describe('LIFE-02 — a failed autosave does not arm the unload warning', () => {
  it('characterization: unload is blocked while saving and unblocked once the save has FAILED', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();
    d.failSaveWith = new Error('backend down');

    await emitModelUpdate(h.ctx(), MODEL('precious'));
    // PRECONDITION: mid-debounce the guard does fire — the listener is live.
    expect(h.ctx().saveStatus).toBe('saving');
    expect(unloadIsBlocked()).toBe(true);

    await act(async () => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    await waitFor(() => expect(h.ctx().saveStatus).toBe('error'));
    expect(d.saveCalls).toHaveLength(1); // the write really failed

    // Same unsaved edit, strictly worse situation — and now nothing objects.
    expect(unloadIsBlocked()).toBe(false);
  });

  it.failing('LIFE-02: unload stays blocked after the autosave failed', async () => {
    const { h, d } = await bootRemoteWithOpenDiagram();
    d.failSaveWith = new Error('backend down');
    await emitModelUpdate(h.ctx(), MODEL('precious'));
    await act(async () => { jest.advanceTimersByTime(DEBOUNCE_MS); });
    await waitFor(() => expect(h.ctx().saveStatus).toBe('error'));
    expect(d.saveCalls).toHaveLength(1); // precondition
    // Expected: an edit that could not be persisted still warns on close.
    // Actual: guard #1 is hard-false in remote mode and guard #2 only knows
    // 'saving', so the work leaves with the tab.
    expect(unloadIsBlocked()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LIFE-14 — the two beforeunload listeners were suspected of racing (the seed
// seam says "the warning can fire or not depending on which registered last").
// ---------------------------------------------------------------------------
describe('LIFE-14 — the two beforeunload listeners do not race', () => {
  it('guard #2 alone blocks unload while guard #1 declines — no last-registered-wins', async () => {
    const { h } = await bootRemoteWithOpenDiagram();

    // Guard #1's trigger is `hasUnsavedChangesRef || (!serverStorageAvailable
    // && sessionWorkUnexportedRef)`. In this state BOTH terms are false:
    expect(h.ctx().hasUnsavedChanges).toBe(false);   // hard-false in remote mode
    expect(h.ctx().sessionWorkUnexported).toBe(false); // no session mutation fired
    expect(unloadIsBlocked()).toBe(false);            // …and indeed nothing objects

    // Now make ONLY guard #2's condition true (saveStatus === 'saving').
    await emitModelUpdate(h.ctx(), MODEL('edited'));
    expect(h.ctx().saveStatus).toBe('saving');
    expect(h.ctx().hasUnsavedChanges).toBe(false);     // guard #1 still declines
    expect(h.ctx().sessionWorkUnexported).toBe(false);

    // The event is still cancelled, so the listener whose condition is false
    // cannot suppress the one whose condition is true: they OR, they don't race.
    expect(unloadIsBlocked()).toBe(true);
  });

  it('and the session-mode guard fires on its own terms too', async () => {
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
