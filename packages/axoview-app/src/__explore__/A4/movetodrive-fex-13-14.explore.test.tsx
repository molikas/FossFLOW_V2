/**
 * A4 — move-to-Drive and the Drive section's setup state.
 *
 * FEX-13 (the move copies the PERSISTED blob, so an edit landing between the
 * flush and the source delete is lost) and FEX-14 (`driveRootMissing` is a
 * synchronous read of an asynchronously-owned value).
 */
import { act, waitFor } from '@testing-library/react';

jest.mock('react-arborist', () => require('../../testUtils/arboristStub'));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === 'string'
        ? fallback
        : typeof fallback === 'object' && fallback && 'defaultValue' in fallback
          ? (fallback as { defaultValue: string }).defaultValue
          : key,
    i18n: { language: 'en' }
  })
}));

let appStorage: Record<string, unknown> = {};
jest.mock('../../providers/AppStorageContext', () => ({
  useAppStorage: () => appStorage,
  AppStorageProvider: ({ children }: { children: unknown }) => children
}));

let lifecycleCtx: Record<string, unknown> = {};
jest.mock('../../providers/DiagramLifecycleProvider', () => ({
  useDiagramLifecycle: () => lifecycleCtx,
  DiagramLifecycleProvider: ({ children }: { children: unknown }) => children
}));

let auth: Record<string, unknown> = {};
jest.mock('../../stores/authStore', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) => sel(auth)
}));

import {
  appStorageValue,
  blobValues,
  dg,
  flush,
  makeAuth,
  makeLifecycle,
  makePlace,
  renderExplorer
} from '../../testUtils/fileExplorerHarness';
import { rowIds, treeProps } from '../../testUtils/arboristStub';
import { useNotificationStore } from '../../stores/notificationStore';

const PLACE_DRIVE = 'place:google-drive';
const messages = () => useNotificationStore.getState().queue.map((n) => `${n.severity}:${n.message}`);

beforeEach(() => {
  useNotificationStore.getState().dismissAll();
});

// ---------------------------------------------------------------------------
// FEX-13 — the move takes the persisted blob, not the in-memory model.
// ---------------------------------------------------------------------------
describe('FEX-13 — an edit landing during the move to Drive is lost with the source', () => {
  const setup = async () => {
    const session = makePlace('local', {
      diagrams: [dg('d1', 'Notes')],
      blobs: { d1: { title: 'Notes', items: ['saved-state'] } }
    });
    const drive = makePlace('google-drive');
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' }, driveScopeGranted: true });
    const life = makeLifecycle(session, { currentDiagram: { id: 'd1', name: 'Notes' } });
    appStorage = appStorageValue({ session, drive, googleDriveConfigured: true });
    lifecycleCtx = life.ctx;
    const utils = renderExplorer();
    await flush();
    // PRECONDITION: the Drive section is usable, so the cross-place drag is on.
    expect(rowIds(treeProps().data)).toContain(PLACE_DRIVE);
    expect(
      treeProps().disableDrop({
        parentNode: { data: { id: PLACE_DRIVE, type: 'place', placeId: 'google-drive' } },
        dragNodes: [{ data: { id: 'd1', type: 'diagram', placeId: 'local' } }]
      })
    ).toBe(false);
    return { session, drive, life, utils };
  };

  /** Drag the open session diagram onto the Google Drive section root. */
  const dragToDrive = async () => {
    await act(async () => {
      await treeProps().onMove({ dragIds: ['d1'], parentId: PLACE_DRIVE, index: 0 });
    });
    await flush();
  };

  it('characterization: the flush happens, then a later edit is copied over and deleted', async () => {
    const { session, drive, life } = await setup();

    // The user keeps typing: one edit is dirty when the move starts (it flushes
    // fine), and another lands while the Drive round-trips are in flight — the
    // window between `saveAllDirty()` and `source.loadDiagram()`, which is at
    // minimum two Drive listings wide.
    life.pendingFlush.set('d1', { title: 'Notes', items: ['edit-before-move'] });
    drive.before.set('listFolders', () => {
      life.pendingFlush.set('d1', { title: 'Notes', items: ['edit-during-move'] });
    });

    await dragToDrive();

    // PRECONDITION: the move succeeded and the source is gone.
    // (the `t` double returns defaultValue verbatim — {{name}} is not filled in)
    expect(messages()).toEqual(['success:"{{name}}" moved to Google Drive']);
    expect(session.diagrams.map((d) => d.id)).toEqual([]);

    // The Drive copy holds the pre-move flush…
    const moved = blobValues(drive)[0] as { items: string[] };
    expect(moved.items).toEqual(['edit-before-move']);
    // …the later edit was never persisted anywhere…
    expect(life.pendingFlush.get('d1')).toEqual({
      title: 'Notes',
      items: ['edit-during-move']
    });
    // …and the diagram it belonged to has been deleted from the session place
    // and reopened from Drive, so nothing can ever flush it.
    expect(life.log).toContain('notifyDiagramDeletedFromTree(d1)');
    expect(life.log.some((l) => l.startsWith('openDiagramById(google-drive-new-1'))).toBe(true);
  });

  it.failing('FEX-13: the moved diagram carries the edits made while it moved', async () => {
    const { session, drive, life } = await setup();
    life.pendingFlush.set('d1', { title: 'Notes', items: ['edit-before-move'] });
    drive.before.set('listFolders', () => {
      life.pendingFlush.set('d1', { title: 'Notes', items: ['edit-during-move'] });
    });
    await dragToDrive();
    expect(session.diagrams).toHaveLength(0); // precondition
    // Expected: a MOVE either takes the current state or refuses while the
    // source is dirty. Actual: `moveDiagramsToDrive` reads
    // `source.loadDiagram(id)` — the persisted blob — and then deletes the
    // source, so anything written after the flush dies with it.
    const moved = blobValues(drive)[0] as { items: string[] };
    expect(moved.items).toEqual(['edit-during-move']);
  });

  it.failing('FEX-13b: a move of the OPEN diagram re-flushes before deleting the source', async () => {
    const { session, drive, life } = await setup();
    drive.before.set('createDiagram', () => {
      life.pendingFlush.set('d1', { title: 'Notes', items: ['edit-during-move'] });
    });
    await dragToDrive();
    expect(drive.blobs.size).toBe(1); // precondition
    // Expected: the source delete is the last chance to notice the diagram went
    // dirty again — `saveAllDirty` (or a dirty check) belongs there too.
    // Actual: `deleteDiagram` runs unconditionally once the create verifies.
    expect(session.log.filter((l) => l.startsWith('saveDiagram')).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// FEX-14 — driveRootMissing reads a non-reactive value.
// ---------------------------------------------------------------------------
describe('FEX-14 — the Drive "finish setup" row is derived from a non-reactive read', () => {
  const setup = async () => {
    const session = makePlace('local', { diagrams: [dg('s1', 'Session one')] });
    const drive = makePlace('google-drive');
    drive.rootId = null; // first connect: the chooser was cancelled/pending
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' }, driveScopeGranted: true });
    const life = makeLifecycle(session);
    appStorage = appStorageValue({ session, drive, googleDriveConfigured: true });
    lifecycleCtx = life.ctx;
    const utils = renderExplorer();
    await flush();
    return { session, drive, life, utils };
  };

  const driveRows = () =>
    (treeProps().data.find((n) => n.id === PLACE_DRIVE)?.children ?? []).map(
      (n) => `${n.type}:${n.stateKind ?? n.id}`
    );

  it('characterization: with no cached root the section shows setup, and Drive drops are refused', async () => {
    const { drive } = await setup();
    // PRECONDITION: the Drive tree finished loading — this is not a skeleton.
    expect(drive.log).toContain('listDiagrams()');
    expect(driveRows()).toEqual(['placeState:setup']);
    // …and `driveReady` is false, so the one cross-place gesture is blocked.
    expect(
      treeProps().disableDrop({
        parentNode: { data: { id: PLACE_DRIVE, type: 'place', placeId: 'google-drive' } },
        dragNodes: [{ data: { id: 's1', type: 'diagram', placeId: 'local' } }]
      })
    ).toBe(true);
  });

  it('characterization: the root becoming ready does not reach the explorer by itself', async () => {
    const { drive, life, utils } = await setup();
    expect(driveRows()).toEqual(['placeState:setup']); // precondition

    // Another tab (or `ensureRoot()` on a write) configures the root and the
    // gate announces it. FileExplorer listens to nothing and re-derives
    // `driveRootMissing` only when something else re-renders it.
    drive.rootId = 'drive-root';
    drive.diagrams.push(dg('gd1', 'Cloud one'));
    await act(async () => {
      window.dispatchEvent(new CustomEvent('axoview-drive-root-ready'));
    });
    await flush();
    expect(driveRows()).toEqual(['placeState:setup']);

    // The ONE thing that clears it is an unrelated re-render — which
    // `DriveSetupGate.handleConfirm` happens to cause (`refreshFileTree()`),
    // and the `hasConfiguredRoot()` branch that dispatches the same event does
    // not. So the row is stale-by-construction and recovers by luck of who
    // configured the root.
    life.ctx.fileTreeRefreshToken = 1;
    await act(async () => { utils.update(); });
    await flush();
    expect(driveRows()).toEqual(['diagram:gd1']);
  });

  it.failing('FEX-14: the Drive section follows the root becoming ready', async () => {
    const { drive } = await setup();
    drive.rootId = 'drive-root';
    drive.diagrams.push(dg('gd1', 'Cloud one'));
    await act(async () => {
      window.dispatchEvent(new CustomEvent('axoview-drive-root-ready'));
    });
    await flush();
    expect(drive.rootId).toBe('drive-root'); // precondition
    // Expected: the row that says "Finish Google Drive setup…" disappears once
    // setup is finished, by whatever route. Actual: `getCachedRootId()` is read
    // during render with no subscription, so the stale row survives until an
    // unrelated re-render.
    expect(driveRows()).not.toContain('placeState:setup');
  });
});
