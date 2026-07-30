/**
 * A4 — `FileExplorer`'s own handlers.
 *
 * FEX-08 (the open diagram's canvas is reset before the storage delete),
 * FEX-09 (the collision dialog says "Replace" and only moves),
 * FEX-10 (`handleMove` `return`s mid-loop, abandoning the rest of a multi-drag),
 * FEX-11 (`handleRenameSubmit` decides folder-vs-diagram from possibly-stale
 * state), FEX-12 (`placeOfId` picks the wrong provider), plus FEX-16
 * (anomaly capture: a failed rename is rolled back in the tree only).
 */
import { act, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-arborist', () => require('./arboristStub'));
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
  dg,
  fld,
  flush,
  makeAuth,
  makeLifecycle,
  makePlace,
  renderExplorer,
  type PlaceDouble
} from './harness';
import { captured, rowIds, treeProps } from './arboristStub';
import { useNotificationStore } from '../../stores/notificationStore';
import type { FileNode } from '../../hooks/useFileTree';

const messages = () => useNotificationStore.getState().queue.map((n) => `${n.severity}:${n.message}`);

beforeEach(() => {
  useNotificationStore.getState().dismissAll();
  auth = makeAuth();
});

/** Boot the explorer over one or two places and wait for the first load. */
async function boot(opts: {
  session: PlaceDouble;
  drive?: PlaceDouble | null;
  lifecycle?: ReturnType<typeof makeLifecycle>;
  dual?: boolean;
  serverStorage?: boolean;
}) {
  const life = opts.lifecycle ?? makeLifecycle(opts.session);
  appStorage = appStorageValue({
    session: opts.session,
    drive: opts.drive ?? null,
    googleDriveConfigured: !!opts.dual,
    serverStorageAvailable: !!opts.serverStorage
  });
  lifecycleCtx = life.ctx;
  const utils = renderExplorer();
  await flush();
  return { ...utils, life };
}

const node = (n: Partial<FileNode> & { id: string }): FileNode =>
  ({ name: n.id, type: 'diagram', ...n }) as FileNode;

// ---------------------------------------------------------------------------
// Rig honesty — the composed tree really is what the user would see.
// ---------------------------------------------------------------------------
describe('A4 rig — the arborist capture stub sees the real composition', () => {
  it('renders both place sections, their rows, and the imperative calls', async () => {
    const session = makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [dg('d1', 'Alpha', 'f1'), dg('d2', 'Beta')]
    });
    const drive = makePlace('google-drive', { diagrams: [dg('gd1', 'Cloud')] });
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' }, driveScopeGranted: true });
    await boot({ session, drive, dual: true });

    // PRECONDITION: the stub was rendered with real composed data — the two
    // section roots plus one row per stored item, each stamped with its place.
    expect(rowIds(treeProps().data)).toEqual([
      'place:google-drive',
      'gd1',
      'place:local',
      'f1',
      'd1',
      'd2'
    ]);
    expect(captured.renders).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// FEX-08 — delete: canvas reset happens before the storage delete.
// ---------------------------------------------------------------------------
describe('FEX-08 — a failed delete of the OPEN diagram leaves the canvas already blanked', () => {
  const setup = async () => {
    const session = makePlace('local', { diagrams: [dg('d1', 'Open one')] });
    const order: string[] = [];
    const life = makeLifecycle(session, {
      currentDiagram: { id: 'd1', name: 'Open one' },
      notifyDiagramDeletedFromTree: (id: string) => order.push(`canvas-reset(${id})`)
    });
    session.before.set('deleteDiagram', () => { order.push('storage-delete'); });
    const utils = await boot({ session, lifecycle: life });
    // Select the row, then press Delete on the tree container — the explorer's
    // own keyboard path into the confirm dialog.
    act(() => { treeProps().onSelect([{ data: node({ id: 'd1', name: 'Open one' }) }]); });
    fireEvent.keyDown(document.querySelector('[data-axoview-id="file-explorer-tree"]')!, {
      key: 'Delete'
    });
    await waitFor(() =>
      expect(document.querySelector('[data-axoview-id="file-explorer-delete-confirm"]')).not.toBeNull()
    );
    return { session, order, utils };
  };

  const confirm = async () => {
    fireEvent.click(document.querySelector('[data-axoview-id="file-explorer-delete-confirm"]')!);
    await flush();
  };

  it('characterization: the delete fails, the toast says so, and the canvas was reset first', async () => {
    const { session, order } = await setup();
    session.fail.add('deleteDiagram');

    await confirm();

    // PRECONDITION: the storage delete really was attempted and really failed.
    expect(order).toContain('storage-delete');
    expect(messages()).toContain('error:Delete failed');
    // The diagram is still in storage — nothing was deleted…
    expect(session.diagrams.map((d) => d.id)).toEqual(['d1']);
    // …but the canvas was reset (and its autosave cancelled) BEFORE the attempt.
    expect(order).toEqual(['canvas-reset(d1)', 'storage-delete']);
  });

  it.failing('FEX-08: a delete that fails leaves the open diagram on the canvas', async () => {
    const { session, order } = await setup();
    session.fail.add('deleteDiagram');
    await confirm();
    expect(session.diagrams.map((d) => d.id)).toEqual(['d1']); // precondition
    // Expected: reset the canvas only after storage confirms the delete (the
    // folder branch right above needs no reset at all, so the ordering is a
    // free choice). Actual: "Delete failed" is shown over a blank canvas with
    // the work still in storage and the autosave already cancelled.
    expect(order).not.toContain('canvas-reset(d1)');
  });
});

// ---------------------------------------------------------------------------
// FEX-09 — "Replace it?" only moves.
// ---------------------------------------------------------------------------
describe('FEX-09 — confirming "Replace" leaves two identically-named siblings', () => {
  const setup = async () => {
    const session = makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [dg('a', 'Report'), dg('b', 'Report', 'f1')]
    });
    await boot({ session });
    // Drag the nested "Report" to the root, where a "Report" already lives.
    await act(async () => {
      await treeProps().onMove({ dragIds: ['b'], parentId: null, index: 0 });
    });
    await waitFor(() => expect(document.body.textContent).toContain('Name already exists'));
    return session;
  };

  it('characterization: the dialog offers Replace, and Replace only moves', async () => {
    const session = await setup();
    // PRECONDITION: this is the replace dialog, and nothing has moved yet.
    expect(document.body.textContent).toContain('Replace it?');
    expect(session.log.filter((l) => l.startsWith('moveItem'))).toEqual([]);

    const replace = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Replace')!;
    fireEvent.click(replace);
    await flush();

    // One move, no delete — both "Report"s now sit in the root folder.
    expect(session.log.filter((l) => l.startsWith('moveItem'))).toEqual(['moveItem(b,diagram,null)']);
    expect(session.log.some((l) => l.startsWith('deleteDiagram'))).toBe(false);
    expect(session.diagrams.filter((d) => d.name === 'Report' && d.folderId === null)).toHaveLength(2);
  });

  it.failing('FEX-09: confirming a replace replaces the existing item', async () => {
    const session = await setup();
    const replace = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Replace')!;
    fireEvent.click(replace);
    await flush();
    expect(session.log).toContain('moveItem(b,diagram,null)'); // precondition
    // Expected: the user answered "Replace it?" with Replace — one "Report"
    // survives. Actual: `confirmMove` calls `moveItem` and nothing else, so the
    // folder now holds two rows with the same name and no way to tell them apart.
    expect(session.diagrams.filter((d) => d.name === 'Report' && d.folderId === null)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// FEX-10 — handleMove returns instead of continuing.
// ---------------------------------------------------------------------------
describe('FEX-10 — a multi-select drag is abandoned at the first skipped item', () => {
  it('characterization: a same-parent item in the drag set silently drops the rest', async () => {
    const session = makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [dg('already', 'Already there', 'f1'), dg('mover', 'Should move')]
    });
    await boot({ session });
    // PRECONDITION: `mover` is at the root and `already` is inside f1.
    expect(session.diagrams.map((d) => `${d.id}:${d.folderId}`)).toEqual([
      'already:f1',
      'mover:null'
    ]);

    await act(async () => {
      await treeProps().onMove({ dragIds: ['already', 'mover'], parentId: 'f1', index: 0 });
    });
    await flush();

    // The first id is a same-parent reorder — the loop `return`s on it, so the
    // second id is never looked at. No storage call, no error, no toast.
    expect(session.log.filter((l) => l.startsWith('moveItem'))).toEqual([]);
    expect(session.diagrams.find((d) => d.id === 'mover')?.folderId).toBeNull();
    expect(messages()).toEqual([]);
  });

  it.failing('FEX-10: the rest of a multi-select drag still moves', async () => {
    const session = makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [dg('already', 'Already there', 'f1'), dg('mover', 'Should move')]
    });
    await boot({ session });
    await act(async () => {
      await treeProps().onMove({ dragIds: ['already', 'mover'], parentId: 'f1', index: 0 });
    });
    await flush();
    expect(session.diagrams).toHaveLength(2); // precondition
    // Expected: skipping one dragged item skips that item (`continue`).
    // Actual: `return` abandons every remaining id in the gesture.
    expect(session.diagrams.find((d) => d.id === 'mover')?.folderId).toBe('f1');
  });

  it('characterization: a collision on the first item abandons the second one too', async () => {
    const session = makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [dg('clash', 'Report'), dg('other', 'Unique'), dg('sitting', 'Report', 'f1')]
    });
    await boot({ session });
    await act(async () => {
      await treeProps().onMove({ dragIds: ['clash', 'other'], parentId: 'f1', index: 0 });
    });
    await flush();

    // PRECONDITION: the collision really was detected — the dialog is up for
    // the FIRST dragged id, and it holds exactly one dragId.
    expect(document.body.textContent).toContain('Name already exists');
    expect(document.body.textContent).toContain('“Report” already exists');
    // The colliding item is parked in the dialog; the non-colliding one, which
    // needed no decision at all, was dropped on the floor with it.
    expect(session.log.filter((l) => l.startsWith('moveItem'))).toEqual([]);
    expect(session.diagrams.find((d) => d.id === 'other')?.folderId).toBeNull();
  });

  it.failing('FEX-10b: a collision on one dragged item still moves the others', async () => {
    const session = makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [dg('clash', 'Report'), dg('other', 'Unique'), dg('sitting', 'Report', 'f1')]
    });
    await boot({ session });
    await act(async () => {
      await treeProps().onMove({ dragIds: ['clash', 'other'], parentId: 'f1', index: 0 });
    });
    await flush();
    // PRECONDITION: the collision dialog opened for the first item.
    expect(document.body.textContent).toContain('Name already exists');
    // Expected: `other` has no collision and lands in f1 regardless.
    // Actual: the collision `return`s out of the whole gesture, and the dialog
    // (which holds ONE dragId) can never resume the rest.
    expect(session.diagrams.find((d) => d.id === 'other')?.folderId).toBe('f1');
  });
});

// ---------------------------------------------------------------------------
// FEX-11 — rename resolves the entity TYPE from possibly-stale state.
// ---------------------------------------------------------------------------
describe('FEX-11 — a rename can hit the wrong entity type', () => {
  const setup = async () => {
    const session = makePlace('local', { folders: [fld('f1', 'Docs')] });
    const life = makeLifecycle(session);
    const utils = await boot({ session, lifecycle: life });
    // PRECONDITION: the folder row is on screen and renameable.
    expect(rowIds(treeProps().data)).toEqual(['f1']);

    // The inline editor is open (F2) when another tab deletes the folder and
    // the tree refreshes underneath it.
    session.folders = [];
    life.ctx.fileTreeRefreshToken = 1;
    utils.update();
    await flush();
    expect(rowIds(treeProps().data)).toEqual([]);
    return { session, life };
  };

  it('characterization: the folder rename is submitted as a DIAGRAM rename', async () => {
    const { session, life } = await setup();

    await act(async () => {
      await treeProps().onRename({ id: 'f1', name: 'Renamed', node: null });
    });
    await flush();

    // `tree.folders` no longer holds f1, so `isFolder` is false and the folder
    // id is sent to `renameDiagram` — which matches no row and quietly does
    // nothing. No throw, so no error toast and no rollback refresh either.
    expect(session.log).toContain('renameDiagram(f1,Renamed)');
    expect(session.log.some((l) => l.startsWith('renameFolder'))).toBe(false);
    expect(messages()).toEqual([]);
    // The lifecycle was told a *diagram* was renamed for a folder id.
    expect(life.log).toContain('notifyDiagramRenamedFromTree(f1,Renamed)');
  });

  it.failing('FEX-11: a folder rename reaches the folder API, or fails loudly', async () => {
    const { session } = await setup();
    await act(async () => {
      await treeProps().onRename({ id: 'f1', name: 'Renamed', node: null });
    });
    await flush();
    expect(session.log.length).toBeGreaterThan(0); // precondition
    // Expected: the node's own type (arborist hands the node to `onRename`, and
    // the composed row carries `type`) decides the call — or an unresolvable id
    // surfaces an error. Actual: a boolean derived from a second, independently
    // refreshed list decides it, and being wrong is silent.
    expect(
      session.log.some((l) => l.startsWith('renameFolder')) ||
        messages().length > 0
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FEX-12 — placeOfId resolves the wrong PROVIDER.
// ---------------------------------------------------------------------------
describe('FEX-12 — a rename can reach the wrong place', () => {
  it('characterization: an id Drive owns but the map has lost routes to the session place', async () => {
    const session = makePlace('local', { diagrams: [dg('s1', 'Session one')] });
    const drive = makePlace('google-drive', { diagrams: [dg('gd1', 'Drive one')] });
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' }, driveScopeGranted: true });
    const life = makeLifecycle(session);
    const utils = await boot({ session, drive, lifecycle: life, dual: true });
    // PRECONDITION: the Drive row is live and owned by the Drive place.
    expect(rowIds(treeProps().data)).toContain('gd1');

    // The token lapses mid-rename (REFRESHING → RECONNECTING is the reconnect
    // path): `useFileTree`'s `enabled` gate closes and clears the Drive rows,
    // so `placeOfId` no longer holds any Drive id — while the open inline
    // editor still carries one.
    auth = makeAuth({ status: 'RECONNECTING', user: { email: 'a@b.c' }, driveScopeGranted: true });
    utils.update();
    await flush();
    expect(rowIds(treeProps().data)).not.toContain('gd1');

    await act(async () => {
      await treeProps().onRename({ id: 'gd1', name: 'Renamed', node: null });
    });
    await flush();

    // `placeOfId.get(id) ?? 'local'` — an unknown id is assumed to be session
    // work, so a Drive rename is executed against the session provider.
    expect(session.log).toContain('renameDiagram(gd1,Renamed)');
    expect(drive.log.some((l) => l.startsWith('renameDiagram'))).toBe(false);
  });

  it.failing('FEX-12: an unresolvable place is not silently assumed to be the session', async () => {
    const session = makePlace('local', { diagrams: [dg('s1', 'Session one')] });
    const drive = makePlace('google-drive', { diagrams: [dg('gd1', 'Drive one')] });
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' }, driveScopeGranted: true });
    const utils = await boot({ session, drive, dual: true });
    auth = makeAuth({ status: 'RECONNECTING', user: { email: 'a@b.c' }, driveScopeGranted: true });
    utils.update();
    await flush();
    await act(async () => {
      await treeProps().onRename({ id: 'gd1', name: 'Renamed', node: null });
    });
    await flush();
    expect(drive.log.length).toBeGreaterThan(0); // precondition
    // Expected: no place → no write (or an error). Actual: the fallback aims a
    // Drive operation at the session provider; with a colliding id it would
    // rename a different diagram entirely.
    expect(session.log.some((l) => l.startsWith('renameDiagram'))).toBe(false);
  });

  it('characterization: with one id in both places, every operation resolves to Drive', async () => {
    const session = makePlace('local', { diagrams: [dg('dup', 'Session copy')] });
    const drive = makePlace('google-drive', { diagrams: [dg('dup', 'Drive copy')] });
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' }, driveScopeGranted: true });
    await boot({ session, drive, dual: true });

    // PRECONDITION: both places really did load a row under the same id, and
    // both are on screen — the session row even carries `placeId: 'local'`.
    const rows = rowIds(treeProps().data).filter((id) => id === 'dup');
    expect(rows).toEqual(['dup', 'dup']);

    await act(async () => {
      await treeProps().onRename({ id: 'dup', name: 'Renamed', node: null });
    });
    await flush();

    // `placeOfId` sets session ids first and Drive ids second, so the last
    // write wins for every consumer that goes through the map by id.
    expect(drive.log).toContain('renameDiagram(dup,Renamed)');
    expect(session.log.some((l) => l.startsWith('renameDiagram'))).toBe(false);
    expect(session.diagrams[0].name).toBe('Session copy');
  });

  it.failing('FEX-12b: when one id exists in both places, the node\'s own place wins', async () => {
    // `placeOfId` writes session ids first and Drive ids second, so a shared id
    // resolves to Drive for every operation — including one started from the
    // session row (which carries `placeId: 'local'` but never gets consulted by
    // `handleRenameSubmit`).
    const session = makePlace('local', { diagrams: [dg('dup', 'Session copy')] });
    const drive = makePlace('google-drive', { diagrams: [dg('dup', 'Drive copy')] });
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' }, driveScopeGranted: true });
    await boot({ session, drive, dual: true });
    await act(async () => {
      await treeProps().onRename({ id: 'dup', name: 'Renamed', node: null });
    });
    await flush();
    expect(drive.diagrams).toHaveLength(1); // precondition
    expect(session.log.some((l) => l.startsWith('renameDiagram'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FEX-16 (anomaly capture, while probing FEX-11) — half-rolled-back rename.
// ---------------------------------------------------------------------------
describe('FEX-16 — a failed rename is rolled back in the tree only', () => {
  it('characterization: the tree reverts, the open diagram keeps the new name', async () => {
    const session = makePlace('local', { diagrams: [dg('d1', 'Original')] });
    const life = makeLifecycle(session, { currentDiagram: { id: 'd1', name: 'Original' } });
    await boot({ session, lifecycle: life });
    session.fail.add('renameDiagram');

    await act(async () => {
      await treeProps().onRename({ id: 'd1', name: 'New name', node: null });
    });
    await flush();

    // PRECONDITION: the rename really failed and said so.
    expect(messages()).toContain('error:Rename failed');
    // Storage never changed, and the catch's `tree.refresh()` restores the row…
    expect(session.diagrams[0].name).toBe('Original');
    await waitFor(() =>
      expect(treeProps().data.map((n) => n.name)).toEqual(['Original'])
    );
    // …but the lifecycle was notified BEFORE the attempt and is never told the
    // rename failed: the open diagram's title (and the model it reloads) keeps
    // a name that exists nowhere in storage.
    expect(life.log).toContain('notifyDiagramRenamedFromTree(d1,New name)');
  });

  it.failing('FEX-16: a failed rename is rolled back everywhere', async () => {
    const session = makePlace('local', { diagrams: [dg('d1', 'Original')] });
    const life = makeLifecycle(session, { currentDiagram: { id: 'd1', name: 'Original' } });
    await boot({ session, lifecycle: life });
    session.fail.add('renameDiagram');
    await act(async () => {
      await treeProps().onRename({ id: 'd1', name: 'New name', node: null });
    });
    await flush();
    expect(session.diagrams[0].name).toBe('Original'); // precondition
    // Expected: the optimistic rename's other half is undone too — the catch
    // re-notifies with the stored name. Actual: only `tree.refresh()` runs.
    expect(life.log.filter((l) => l.startsWith('notifyDiagramRenamedFromTree'))).toEqual([
      'notifyDiagramRenamedFromTree(d1,New name)',
      'notifyDiagramRenamedFromTree(d1,Original)'
    ]);
  });
});
