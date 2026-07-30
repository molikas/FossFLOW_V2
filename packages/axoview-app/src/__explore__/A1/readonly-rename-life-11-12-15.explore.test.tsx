/**
 * A1 — LIFE-11 (Ctrl+S writes on a read-only route), LIFE-12 (toolbar rename
 * never reaches the model title) and LIFE-15 (the Load dialog never consults
 * the storage provider, so imported icons are gone after a reload).
 *
 * `useParams` is mocked through a mutable `routeParams` so one file can render
 * both the editor route and the owner-readonly route. `isReadonlyUrl` also
 * consults `window.location.pathname`, so the probes push the real path.
 */
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let routeParams: Record<string, string | undefined> = {};
jest.mock('react-router-dom', () => ({
  useParams: () => routeParams,
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
  appStorageValue,
  consumeLoadEcho,
  makeStorage,
  MODEL
} from './harness';
import { notificationStore } from '../../stores/notificationStore';

let toasts: Array<{ severity: string; message: string }>;
beforeEach(() => {
  routeParams = {};
  localStorage.clear();
  window.history.pushState({}, '', '/');
  toasts = [];
  jest.spyOn(notificationStore, 'push').mockImplementation((n) => {
    toasts.push(n as { severity: string; message: string });
    return undefined as never;
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

const pressCtrlS = () =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })
    );
  });

// ---------------------------------------------------------------------------
// LIFE-11 — `handleSaveClick` has no `isReadonlyUrl` guard. `handleModelUpdated`
// does have one (`if (isReadonlyUrl) return;`), so the read-only contract is
// enforced on the edit path and not on the save path — the same one-direction
// asymmetry the interaction block recorded as thread C.
// ---------------------------------------------------------------------------
describe('LIFE-11 — Ctrl+S on the owner-readonly /display route writes', () => {
  async function bootReadonly() {
    routeParams = { readonlyDiagramId: 'diag-1' };
    window.history.pushState({}, '', '/display/diag-1');
    const d = makeStorage({
      listDiagrams: async () => [
        { id: 'diag-1', name: 'Shared By Owner', lastModified: '2026-01-01T00:00:00.000Z' }
      ],
      loadDiagram: async () => ({ title: 'Shared By Owner', items: [], views: [] })
    } as never);
    appStorage = appStorageValue({ remoteStorageActive: false, storage: d.storage });
    const h = renderLifecycle();

    // PRECONDITION: the readonly loader ran and the page really is in
    // read-only mode with a diagram on screen.
    await waitFor(() => expect(h.ctx().currentDiagram?.id).toBe('diag-1'));
    expect(h.ctx().isReadonlyUrl).toBe(true);
    d.saveCalls.length = 0;
    toasts.length = 0;
    return { h, d };
  }

  it('characterization: the edit path is inert on this route, the save path is not', async () => {
    const { h, d } = await bootReadonly();

    // The edit path IS guarded — a model update changes no dirty state.
    await act(async () => { h.ctx().handleModelUpdated(MODEL('typed-on-readonly') as never); });
    expect(h.ctx().dirtyDiagramIds.size).toBe(0);

    // The save path is not.
    await pressCtrlS();
    await waitFor(() => expect(d.saveCalls).toHaveLength(1));
    expect(d.saveCalls[0].id).toBe('diag-1');
    expect(toasts.filter((x) => x.severity === 'success')).toHaveLength(1);
  });

  it.failing('LIFE-11: Ctrl+S is inert on a read-only route', async () => {
    const { h, d } = await bootReadonly();
    expect(h.ctx().isReadonlyUrl).toBe(true); // precondition
    await pressCtrlS();
    // Give the async save a chance to land before asserting absence.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // Expected: a read-only view cannot write. Actual: it writes and claims
    // success.
    expect(d.saveCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// LIFE-12 — `handleRenameCurrentDiagram` updates `diagramName` and
// `currentDiagram.name` and calls `storage.renameDiagram`, but never touches
// `currentModel.title`. Its sibling `notifyDiagramRenamedFromTree` DOES
// (`{...currentModelRef.current, title: trimmed}` + a preserveViewport reload).
// `buildSaveData` prefers `currentModel?.title`, so the next save writes the
// OLD name back into the blob.
// ---------------------------------------------------------------------------
describe('LIFE-12 — the toolbar rename never reaches the saved title', () => {
  async function bootOpen() {
    const d = makeStorage({
      loadDiagram: async () => ({ title: 'Old Name', items: [], views: [] })
    } as never);
    appStorage = appStorageValue({ remoteStorageActive: true, storage: d.storage });
    const h = renderLifecycle();
    await act(async () => { await h.ctx().openDiagramById('diag-1', 'Old Name'); });
    expect(h.ctx().currentModel?.title).toBe('Old Name'); // precondition
    await consumeLoadEcho(h.ctx());
    // consumeLoadEcho's own model would overwrite the title, so restore it the
    // way a real load echo does (the lib echoes the loaded model back).
    await act(async () => { h.ctx().handleModelUpdated(MODEL('Old Name') as never); });
    // `notifyDiagramRenamedFromTree` gates its model write on
    // `axoviewRef.current` (the mounted editor). jsdom has no Axoview, so stub
    // the ref — without it the SIBLING path would look broken too and the
    // asymmetry this probe is measuring would be a rig artefact, not a finding.
    h.ctx().axoviewRef.current = { load: jest.fn() } as never;
    d.saveCalls.length = 0;
    return { h, d };
  }

  it('characterization: the two rename paths disagree about the model title', async () => {
    const { h, d } = await bootOpen();

    // (a) toolbar rename
    await act(async () => { await h.ctx().handleRenameCurrentDiagram('Toolbar Name'); });
    // PRECONDITION: the rename really took effect where it does reach.
    expect(d.renameCalls).toEqual([{ id: 'diag-1', name: 'Toolbar Name' }]);
    expect(h.ctx().diagramName).toBe('Toolbar Name');
    // …but not in the model:
    expect(h.ctx().currentModel?.title).toBe('Old Name');

    // (b) the file-tree rename, same provider, does reach it.
    await act(async () => { h.ctx().notifyDiagramRenamedFromTree('diag-1', 'Tree Name'); });
    expect(h.ctx().currentModel?.title).toBe('Tree Name');
  });

  it.failing('LIFE-12: after a toolbar rename the next save writes the new name', async () => {
    const { h, d } = await bootOpen();
    await act(async () => { await h.ctx().handleRenameCurrentDiagram('Toolbar Name'); });
    expect(d.renameCalls).toHaveLength(1); // precondition
    d.saveCalls.length = 0;

    await act(async () => { await h.ctx().handleSaveClick(); });
    // PRECONDITION: a save really happened, so the title below is the payload's.
    expect(d.saveCalls).toHaveLength(1);
    // Expected: the blob carries the name the user typed. Actual:
    // buildSaveData reads currentModel.title, which the toolbar rename skipped.
    expect(d.saveCalls[0].title).toBe('Toolbar Name');
  });
});

// ---------------------------------------------------------------------------
// LIFE-15 — session persistence writes `axoview-diagrams` with
// `data: {...d.data, icons: []}`, and `executeLoad` (the Load-dialog path)
// loads `diagram.data` straight from that in-memory list. It never asks the
// storage provider, which still holds the full blob — so opening a diagram
// through the Load dialog after a reload silently drops its imported icons,
// while opening the SAME diagram through the file explorer
// (`openDiagramById` → `storage.loadDiagram`) keeps them.
// ---------------------------------------------------------------------------
describe('LIFE-15 — the Load dialog reads the icon-stripped copy, the explorer does not', () => {
  const IMPORTED = { id: 'my-logo', name: 'my-logo', collection: 'imported', url: 'data:image/png;base64,AAA' };

  function seedStrippedSession() {
    // Exactly what the persist effect writes: the diagram list minus icons.
    localStorage.setItem(
      'axoview-diagrams',
      JSON.stringify([
        {
          id: 'diag-A',
          name: 'Alpha',
          data: { title: 'Alpha', items: [], views: [], icons: [] },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ])
    );
    // …while the provider still has the real thing.
    return makeStorage({
      loadDiagram: async () => ({
        title: 'Alpha',
        items: [],
        views: [],
        icons: [IMPORTED]
      })
    } as never);
  }

  it('characterization: the persisted list is icon-free and the dialog path never asks storage', async () => {
    const d = seedStrippedSession();
    let loadDiagramCalls = 0;
    const inner = d.storage.loadDiagram.bind(d.storage);
    d.storage.loadDiagram = (async (id: string) => { loadDiagramCalls++; return inner(id); }) as never;

    appStorage = appStorageValue({ remoteStorageActive: false, storage: d.storage });
    const h = renderLifecycle();
    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(1)); // precondition

    // PRECONDITION: the restored entry genuinely carries no icons — this is
    // the state the app itself persists, not a rigged fixture.
    expect(h.ctx().diagrams[0].data.icons).toEqual([]);

    // The explorer path DOES consult storage and gets the icon.
    await act(async () => { await h.ctx().openDiagramById('diag-A', 'Alpha'); });
    expect(loadDiagramCalls).toBe(1);
    expect(h.ctx().currentModel?.icons?.some((i) => i.id === 'my-logo')).toBe(true);
  });

  /** Opens the Load dialog and clicks the row's Load button (no test hooks — MUI icon id). */
  async function openThroughLoadDialog(h: ReturnType<typeof renderLifecycle>) {
    const user = userEvent.setup();
    await act(async () => { h.ctx().handleOpenClick(); });
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    const loadBtn = document.querySelector(
      'button:has(svg[data-testid="FileOpenOutlinedIcon"])'
    ) as HTMLElement | null;
    expect(loadBtn).not.toBeNull(); // precondition: the right control was found
    await user.click(loadBtn!);
    await waitFor(() => expect(h.ctx().currentDiagram?.id).toBe('diag-A'));
  }

  it.failing('LIFE-15: the Load dialog opens the same diagram with its imported icons', async () => {
    const d = seedStrippedSession();
    let loadDiagramCalls = 0;
    const inner = d.storage.loadDiagram.bind(d.storage);
    d.storage.loadDiagram = (async (id: string) => { loadDiagramCalls++; return inner(id); }) as never;

    appStorage = appStorageValue({ remoteStorageActive: false, storage: d.storage });
    const h = renderLifecycle();
    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(1)); // precondition

    await openThroughLoadDialog(h);

    expect(loadDiagramCalls).toBe(0); // the dialog asked storage nothing
    // Expected: the icon survives an open. Actual: the stripped copy is what
    // reaches the canvas.
    expect(h.ctx().currentModel?.icons?.some((i) => i.id === 'my-logo')).toBe(true);
  });

  it('characterization: the dialog-opened diagram lands on the canvas with zero imported icons', async () => {
    const d = seedStrippedSession();
    appStorage = appStorageValue({ remoteStorageActive: false, storage: d.storage });
    const h = renderLifecycle();
    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(1)); // precondition

    await openThroughLoadDialog(h);

    expect(h.ctx().currentModel?.icons ?? []).toEqual([]);
  });
});
