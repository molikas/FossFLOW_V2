/**
 * A1 — LIFE-09 (create-blank drops the previous diagram's pending edit) and
 * LIFE-13 (LoadDialog delete leaves storage and the last-opened pointer behind).
 *
 * Both need the real provider: LIFE-09 is about which branch the `saveNow()`
 * call sits inside, LIFE-13 goes through the rendered LoadDialog → ConfirmDialog
 * pair (the delete has no context-level entry point at all).
 */
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(notificationStore, 'push').mockImplementation(() => undefined as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// LIFE-09 — `handleCreateBlankDiagram` flushes only when the PLACE changes:
//
//   if (storageManager && storageManager.activeProviderId !== targetPlace) {
//     await autoSave.saveNow(); autoSave.resetStatus(); setActiveProviderId(...)
//   }
//
// and then `handleDiagramManagerLoad` unconditionally calls
// `autoSave.resetStatus()`, which THROWS AWAY the queued model. Creating a new
// diagram in the place you are already in therefore discards the previous
// diagram's last two seconds of edits.
// ---------------------------------------------------------------------------
describe('LIFE-09 — "New diagram" in the same place discards the pending edit', () => {
  async function bootWithPendingEdit() {
    const d = makeStorage();
    appStorage = appStorageValue({
      remoteStorageActive: true,
      storage: d.storage,
      activeProviderId: 'local' // === defaultPlaceId, so the flush branch is skipped
    });
    const h = renderLifecycle();
    await act(async () => { await h.ctx().openDiagramById('diag-1', 'Diag One'); });
    expect(h.ctx().currentDiagram?.id).toBe('diag-1'); // precondition
    await consumeLoadEcho(h.ctx());
    d.saveCalls.length = 0;

    await emitModelUpdate(h.ctx(), MODEL('precious-edit'));
    // PRECONDITION: an edit really is queued and unwritten.
    expect(h.ctx().saveStatus).toBe('saving');
    expect(d.saveCalls).toHaveLength(0);
    return { h, d };
  }

  it('characterization: the queued edit is never written, and the new diagram opens fine', async () => {
    const { h, d } = await bootWithPendingEdit();

    await act(async () => { await h.ctx().handleCreateBlankDiagram(null); });

    // PRECONDITION: the create really happened and adopted the new diagram —
    // so a zero write-count below is the discard, not a dead code path.
    expect(d.createCalls).toHaveLength(1);
    expect(h.ctx().currentDiagram?.id).toBe('new-1');

    // The previous diagram's edit was never sent anywhere.
    expect(d.saveCalls.filter((c) => c.id === 'diag-1')).toHaveLength(0);
    // And the status bar reads clean, so nothing tells the user.
    expect(h.ctx().saveStatus).toBe('idle');
  });

  it.failing('LIFE-09: creating a diagram flushes the previous one first', async () => {
    const { h, d } = await bootWithPendingEdit();
    await act(async () => { await h.ctx().handleCreateBlankDiagram(null); });
    expect(d.createCalls).toHaveLength(1); // precondition
    // Expected: same guarantee `openDiagramById` and `handleNewDiagram` give
    // (both await saveNow() unconditionally). Actual: the flush is nested in
    // the place-change branch and resetStatus() then drops the queue.
    expect(d.saveCalls.filter((c) => c.id === 'diag-1').map((c) => c.title))
      .toEqual(['precious-edit']);
  });
});

// ---------------------------------------------------------------------------
// LIFE-13 — LoadDialog's delete is `deleteDiagram`, which only filters the
// in-memory `diagrams` array. It never calls `storage.deleteDiagram`, so the
// session blob survives, and it never touches `axoview-last-opened` /
// `axoview-last-opened-data`, so the boot pointer keeps naming the deleted row.
// ---------------------------------------------------------------------------
describe('LIFE-13 — deleting from the Load dialog leaves storage and the boot pointer behind', () => {
  const SEEDED = [
    {
      id: 'diag-A',
      name: 'Alpha',
      data: { title: 'Alpha', items: [], views: [] },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  ];

  async function openLoadDialogWithSeededDiagram() {
    // The mount effect restores `diagrams` from these two keys.
    localStorage.setItem('axoview-diagrams', JSON.stringify(SEEDED));
    localStorage.setItem('axoview-last-opened', 'diag-A');
    localStorage.setItem('axoview-last-opened-data', JSON.stringify(SEEDED[0].data));

    const d = makeStorage();
    appStorage = appStorageValue({ remoteStorageActive: false, storage: d.storage });
    const h = renderLifecycle();

    // PRECONDITION: the seeded diagram really is in state (a wrong selector
    // below would otherwise read as "the feature is absent").
    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(1));
    await act(async () => { h.ctx().handleOpenClick(); });
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    return { h, d };
  }

  it('characterization: the row disappears, the blob is not deleted, the pointer still names it', async () => {
    const user = userEvent.setup();
    const { h, d } = await openLoadDialogWithSeededDiagram();

    // LoadDialog has no test hooks; the delete is the error-coloured icon
    // button carrying MUI's DeleteOutline icon.
    const delBtn = document.querySelector(
      'button:has(svg[data-testid="DeleteOutlineIcon"])'
    ) as HTMLElement | null;
    expect(delBtn).not.toBeNull(); // precondition: we found the right control

    await user.click(delBtn!);
    // ConfirmDialog: Cancel | Confirm (no onDiscard on this path).
    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    await user.click(confirm);

    // PRECONDITION: the delete really took effect in the UI.
    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(0));

    // Nothing was asked of the storage provider...
    expect(d.deleteCalls).toEqual([]);
    // ...and the boot pointer still resolves to the row the user deleted.
    expect(localStorage.getItem('axoview-last-opened')).toBe('diag-A');
    expect(localStorage.getItem('axoview-last-opened-data')).not.toBeNull();
  });

  it.failing('LIFE-13: deleting a diagram deletes it from storage', async () => {
    const user = userEvent.setup();
    const { h, d } = await openLoadDialogWithSeededDiagram();
    const delBtn = document.querySelector(
      'button:has(svg[data-testid="DeleteOutlineIcon"])'
    ) as HTMLElement | null;
    expect(delBtn).not.toBeNull(); // precondition
    await user.click(delBtn!);
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(0)); // precondition
    // Expected: the provider is told, like every other delete path
    // (`notifyDiagramDeletedFromTree`'s caller does call storage.deleteDiagram).
    // Actual: `deleteDiagram` only filters the in-memory array.
    expect(d.deleteCalls).toEqual(['diag-A']);
  });

  it.failing('LIFE-13: deleting the last-opened diagram clears the boot pointer', async () => {
    const user = userEvent.setup();
    const { h } = await openLoadDialogWithSeededDiagram();
    const delBtn = document.querySelector(
      'button:has(svg[data-testid="DeleteOutlineIcon"])'
    ) as HTMLElement | null;
    expect(delBtn).not.toBeNull(); // precondition
    await user.click(delBtn!);
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(h.ctx().diagrams).toHaveLength(0)); // precondition
    // Expected: `axoview-last-opened` no longer names a row that does not
    // exist (the triple is documented as coherent).
    expect(localStorage.getItem('axoview-last-opened')).toBeNull();
  });
});
