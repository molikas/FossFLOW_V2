/**
 * `DiagramLifecycleProvider` — boot recovery, the read-only save guard, and the
 * Load-dialog delete/open flows, through the real provider under jsdom.
 *
 * Promoted from the retired exploratory lane (mop-up wave, 2026-08-10):
 * - A1/LIFE-10: a corrupt `axoview-diagrams` value recovers instead of
 *   crash-looping the boot.
 * - A1/LIFE-11: Ctrl+S / Ctrl+O are inert on a read-only /display route.
 * - A1/LIFE-13: the Load-dialog delete routes through the storage provider and
 *   clears the last-opened pointer.
 * - A1/LIFE-15: the Load dialog fetches the full blob from storage, so
 *   imported icons survive an open after a session reload.
 *
 * known_issues: "A corrupt session list makes the app unbootable", "Ctrl+S on
 * a read-only /display page saves", "Deleting a diagram from the Load dialog
 * does not delete it", "Diagrams opened from the Load dialog lose their
 * imported icons".
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
jest.mock('../AppStorageContext', () => ({
  useAppStorage: () => appStorage,
  AppStorageProvider: ({ children }: { children: unknown }) => children
}));

import {
  renderLifecycle,
  appStorageValue,
  makeStorage,
  MODEL
} from '../../testUtils/lifecycleHarness';
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

const pressChord = (key: string) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true })
    );
  });

// ---------------------------------------------------------------------------
// LIFE-10 — a corrupt localStorage session recovers rather than crash-looping.
// ---------------------------------------------------------------------------
describe('LIFE-10 — corrupt axoview-diagrams recovers on boot', () => {
  it('discards the bad value and boots with an empty list', () => {
    localStorage.setItem('axoview-diagrams', '{ this is not json');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    appStorage = appStorageValue({ remoteStorageActive: false });

    // The unguarded parse used to throw out of the mount effect, tripping the
    // root ErrorBoundary; renderLifecycle would reject. It resolves now.
    const h = renderLifecycle();
    expect(h.ctx().diagrams).toEqual([]);
    // …and the bad value is gone, so a refresh cannot reproduce it.
    expect(localStorage.getItem('axoview-diagrams')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a well-formed value still boots normally', () => {
    localStorage.setItem(
      'axoview-diagrams',
      JSON.stringify([
        {
          id: 'diag-A',
          name: 'Alpha',
          data: { title: 'Alpha', items: [], views: [] },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ])
    );
    appStorage = appStorageValue({ remoteStorageActive: false });
    const h = renderLifecycle();
    expect(h.ctx().diagrams).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LIFE-11 — the read-only routes must not save.
// ---------------------------------------------------------------------------
describe('LIFE-11 — Ctrl+S / Ctrl+O inert on a read-only /display route', () => {
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
    await waitFor(() => expect(h.ctx().currentDiagram?.id).toBe('diag-1'));
    expect(h.ctx().isReadonlyUrl).toBe(true);
    d.saveCalls.length = 0;
    toasts.length = 0;
    return { h, d };
  }

  it('Ctrl+S writes nothing and shows no success toast', async () => {
    const { d } = await bootReadonly();
    await pressChord('s');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(d.saveCalls).toHaveLength(0);
    expect(toasts.filter((x) => x.severity === 'success')).toHaveLength(0);
  });

  it('the edit path stays inert too (unchanged)', async () => {
    const { h } = await bootReadonly();
    await act(async () => { h.ctx().handleModelUpdated(MODEL('typed') as never); });
    expect(h.ctx().dirtyDiagramIds.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LIFE-13 — the Load-dialog delete reclaims storage and the boot pointer.
// ---------------------------------------------------------------------------
describe('LIFE-13 — Load-dialog delete removes the diagram from storage', () => {
  const SEEDED = [
    {
      id: 'diag-A',
      name: 'Alpha',
      data: { title: 'Alpha', items: [], views: [] },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  ];

  function seed() {
    localStorage.setItem('axoview-diagrams', JSON.stringify(SEEDED));
    localStorage.setItem('axoview-last-opened', 'diag-A');
    localStorage.setItem('axoview-last-opened-data', JSON.stringify(SEEDED[0].data));
    const d = makeStorage();
    appStorage = appStorageValue({ remoteStorageActive: false, storage: d.storage });
    return d;
  }

  async function openDialogAndDelete(h: ReturnType<typeof renderLifecycle>) {
    const user = userEvent.setup();
    await act(async () => { h.ctx().handleOpenClick(); });
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    // LoadDialog has no test hooks; the delete is the error-coloured icon
    // button carrying MUI's DeleteOutline icon.
    const delBtn = document.querySelector(
      'button:has(svg[data-testid="DeleteOutlineIcon"])'
    ) as HTMLElement | null;
    expect(delBtn).not.toBeNull();
    await user.click(delBtn!);
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
  }

  it('routes the delete through storage and clears the last-opened pair', async () => {
    const d = seed();
    const h = renderLifecycle();
    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(1));

    await openDialogAndDelete(h);

    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(0));
    expect(d.deleteCalls).toEqual(['diag-A']);
    expect(localStorage.getItem('axoview-last-opened')).toBeNull();
    expect(localStorage.getItem('axoview-last-opened-data')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LIFE-15 — the Load dialog fetches the full blob, so imported icons survive.
// ---------------------------------------------------------------------------
describe('LIFE-15 — the Load dialog keeps imported icons', () => {
  const IMPORTED = {
    id: 'my-logo',
    name: 'my-logo',
    collection: 'imported',
    url: 'data:image/png;base64,AAA'
  };

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
    return makeStorage({
      loadDiagram: async () => ({
        title: 'Alpha',
        items: [],
        views: [],
        icons: [IMPORTED]
      })
    } as never);
  }

  async function openThroughLoadDialog(h: ReturnType<typeof renderLifecycle>) {
    const user = userEvent.setup();
    await act(async () => { h.ctx().handleOpenClick(); });
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    const loadBtn = document.querySelector(
      'button:has(svg[data-testid="FileOpenOutlinedIcon"])'
    ) as HTMLElement | null;
    expect(loadBtn).not.toBeNull();
    await user.click(loadBtn!);
    await waitFor(() => expect(h.ctx().currentDiagram?.id).toBe('diag-A'));
  }

  it('the dialog-opened diagram lands with its imported icon', async () => {
    const d = seedStrippedSession();
    let loadDiagramCalls = 0;
    const inner = d.storage.loadDiagram.bind(d.storage);
    d.storage.loadDiagram = (async (id: string) => {
      loadDiagramCalls++;
      return inner(id);
    }) as never;

    appStorage = appStorageValue({ remoteStorageActive: false, storage: d.storage });
    const h = renderLifecycle();
    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(1));
    expect(h.ctx().diagrams[0].data.icons).toEqual([]); // the persisted copy is stripped

    await openThroughLoadDialog(h);

    expect(loadDiagramCalls).toBeGreaterThan(0); // the dialog DID ask storage
    expect(
      h.ctx().currentModel?.icons?.some((i) => i.id === 'my-logo')
    ).toBe(true);
  });
});
