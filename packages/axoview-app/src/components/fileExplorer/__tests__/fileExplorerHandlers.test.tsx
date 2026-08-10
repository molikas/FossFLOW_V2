/**
 * Promoted from the A4 explore lane (ADR 0047 flip rule) — the wave-4
 * `FileExplorer` handler cluster.
 *
 *   FEX-08  a failed delete of the OPEN diagram does not leave the canvas blank
 *   FEX-09  the collision dialog's button does what it says
 *   FEX-10  a multi-select drag is not abandoned at the first skipped item
 *   FEX-11  a rename resolves the entity TYPE from the node it was given
 *   FEX-12  …and the PLACE too, treating unresolvable as an error
 *   FEX-16  a failed rename is rolled back everywhere, not just in the tree
 *
 * These render the real component, because every claim is about a handler's
 * COMPOSITION — which provider a rename resolves to, what order `confirmDelete`
 * does two awaits in, whether a loop `return`s or `continue`s. None of it is
 * observable below `FileExplorer`, and the two `useFileTree` instances it
 * composes are what made `placeOfId` ambiguous in the first place.
 */
import { act, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-arborist', () => require('../../../testUtils/arboristStub'));
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
jest.mock('../../../providers/AppStorageContext', () => ({
  useAppStorage: () => appStorage,
  AppStorageProvider: ({ children }: { children: unknown }) => children
}));

let lifecycleCtx: Record<string, unknown> = {};
jest.mock('../../../providers/DiagramLifecycleProvider', () => ({
  useDiagramLifecycle: () => lifecycleCtx,
  DiagramLifecycleProvider: ({ children }: { children: unknown }) => children
}));

let auth: Record<string, unknown> = {};
jest.mock('../../../stores/authStore', () => ({
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
} from '../../../testUtils/fileExplorerHarness';
import { treeProps } from '../../../testUtils/arboristStub';
import { useNotificationStore } from '../../../stores/notificationStore';
import type { FileNode } from '../../../hooks/useFileTree';

const messages = () =>
  useNotificationStore.getState().queue.map((n) => `${n.severity}:${n.message}`);

beforeEach(() => {
  useNotificationStore.getState().dismissAll();
  auth = makeAuth() as unknown as Record<string, unknown>;
});

async function boot(opts: {
  session: PlaceDouble;
  drive?: PlaceDouble | null;
  lifecycle?: ReturnType<typeof makeLifecycle>;
  dual?: boolean;
}) {
  const life = opts.lifecycle ?? makeLifecycle(opts.session);
  appStorage = appStorageValue({
    session: opts.session,
    drive: opts.drive ?? null,
    googleDriveConfigured: !!opts.dual
  });
  lifecycleCtx = life.ctx;
  const utils = renderExplorer();
  await flush();
  return { ...utils, life };
}

const node = (n: Partial<FileNode> & { id: string }): FileNode =>
  ({ name: n.id, type: 'diagram', ...n }) as FileNode;

const el = (id: string) => document.querySelector(`[data-axoview-id="${id}"]`);

// ---------------------------------------------------------------------------
// FEX-08 — a failed delete must not lose the canvas.
// ---------------------------------------------------------------------------
describe('FEX-08 — a delete that FAILS leaves the open diagram on the canvas', () => {
  const setup = async () => {
    const session = makePlace('local', { diagrams: [dg('d1', 'Open one')] });
    const order: string[] = [];
    const life = makeLifecycle(session, {
      currentDiagram: { id: 'd1', name: 'Open one' },
      notifyDiagramDeletedFromTree: (id: string) => order.push(`canvas-reset(${id})`)
    });
    session.before.set('deleteDiagram', () => {
      order.push('storage-delete');
    });
    await boot({ session, lifecycle: life });
    act(() => {
      treeProps().onSelect([{ data: node({ id: 'd1', name: 'Open one' }) }]);
    });
    fireEvent.keyDown(el('file-explorer-tree')!, { key: 'Delete' });
    await waitFor(() => expect(el('file-explorer-delete-confirm')).not.toBeNull());
    return { session, order, life };
  };

  const confirm = async () => {
    fireEvent.click(el('file-explorer-delete-confirm')!);
    await flush();
  };

  /**
   * The probe demanded `order` NOT contain the canvas reset — i.e. the entry's
   * first option, "reset only after storage confirms". The fix took its SECOND
   * option, "restore the diagram into the canvas in the catch", because the
   * reset-first ordering is deliberate (MQA #18: it cancels the in-flight
   * autosave so it cannot recreate the diagram after the delete). So the
   * assertion here is the OUTCOME the user sees — the diagram is back — rather
   * than the mechanism. A probe that pins a mechanism cannot flip on a
   * legitimate alternative fix.
   */
  it('the canvas is restored when the storage delete rejects', async () => {
    const { session, order, life } = await setup();
    session.fail.add('deleteDiagram');

    await confirm();

    // PRECONDITIONS: the delete really was attempted, really failed, and the
    // work really is still in storage.
    expect(order).toContain('storage-delete');
    expect(messages()).toContain('error:Delete failed');
    expect(session.diagrams.map((d) => d.id)).toEqual(['d1']);

    // …and the user is looking at it again rather than at a blank canvas.
    expect(life.log.some((l) => l.startsWith('openDiagramById(d1'))).toBe(true);
  });

  it('CONTROL: a delete that SUCCEEDS does not re-open anything', async () => {
    const { session, life } = await setup();
    await confirm();
    expect(session.diagrams).toEqual([]);
    expect(life.log.some((l) => l.startsWith('openDiagramById'))).toBe(false);
    expect(messages().some((m) => m.startsWith('success:'))).toBe(true);
  });

  it('a failed delete of a diagram that is NOT open re-opens nothing', async () => {
    // The restore is scoped to the open diagram; re-opening an unrelated one
    // would navigate the user somewhere they never asked to go.
    const session = makePlace('local', {
      diagrams: [dg('d1', 'Open one'), dg('d2', 'Other')]
    });
    const life = makeLifecycle(session, {
      currentDiagram: { id: 'd1', name: 'Open one' }
    });
    await boot({ session, lifecycle: life });
    act(() => {
      treeProps().onSelect([{ data: node({ id: 'd2', name: 'Other' }) }]);
    });
    fireEvent.keyDown(el('file-explorer-tree')!, { key: 'Delete' });
    await waitFor(() => expect(el('file-explorer-delete-confirm')).not.toBeNull());
    session.fail.add('deleteDiagram');
    fireEvent.click(el('file-explorer-delete-confirm')!);
    await flush();

    expect(messages()).toContain('error:Delete failed');
    expect(life.log.some((l) => l.startsWith('openDiagramById'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FEX-09 / FEX-10 — the drag loop and the collision queue.
// ---------------------------------------------------------------------------
describe('FEX-10 — a multi-select drag completes past a skipped item', () => {
  const twoInAFolder = () =>
    makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [dg('already', 'Already', 'f1'), dg('mover', 'Mover')]
    });

  it('an item already in the destination does not abandon the rest', async () => {
    // The `return` that should have been a `continue`. Dragging
    // [already-in-f1, mover] into f1 used to produce ZERO moveItem calls.
    const session = twoInAFolder();
    await boot({ session });
    await act(async () => {
      await treeProps().onMove({
        dragIds: ['already', 'mover'],
        parentId: 'f1',
        index: 0
      });
    });
    await flush();
    expect(session.diagrams.find((d) => d.id === 'mover')?.folderId).toBe('f1');
  });

  it('a collision on one item does not abandon the others', async () => {
    const session = makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [
        dg('inside', 'Report', 'f1'),
        dg('clash', 'Report'),
        dg('mover', 'Mover')
      ]
    });
    await boot({ session });
    await act(async () => {
      await treeProps().onMove({
        dragIds: ['clash', 'mover'],
        parentId: 'f1',
        index: 0
      });
    });
    await flush();

    // The non-colliding item landed…
    expect(session.diagrams.find((d) => d.id === 'mover')?.folderId).toBe('f1');
    // …and the collision is queued for the user rather than dropped.
    await waitFor(() => expect(el('file-explorer-collision')).not.toBeNull());
  });

  it('every collision in one drag is offered, not just the first', async () => {
    // `collisionDialog` held a SINGLE id, so even confirming could not resume.
    const session = makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [
        dg('a-inside', 'Alpha', 'f1'),
        dg('b-inside', 'Beta', 'f1'),
        dg('a', 'Alpha'),
        dg('b', 'Beta')
      ]
    });
    await boot({ session });
    await act(async () => {
      await treeProps().onMove({ dragIds: ['a', 'b'], parentId: 'f1', index: 0 });
    });
    await waitFor(() => expect(el('file-explorer-collision')).not.toBeNull());

    fireEvent.click(el('file-explorer-collision-keep-both')!);
    await flush();
    // Still open — the second collision.
    expect(el('file-explorer-collision')).not.toBeNull();

    fireEvent.click(el('file-explorer-collision-keep-both')!);
    await flush();
    await waitFor(() => expect(el('file-explorer-collision')).toBeNull());
    expect(session.diagrams.filter((d) => d.folderId === 'f1')).toHaveLength(4);
  });
});

describe('FEX-09 — the collision dialog does what its button says', () => {
  const colliding = () =>
    makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [dg('inside', 'Report', 'f1'), dg('outside', 'Report')]
    });

  /**
   * The fix took the entry's SECOND option — "change the dialog to the honest
   * choice" — rather than implementing a real replace. A real replace has to
   * DELETE the colliding sibling inside this confirmation, and for a folder
   * that means inheriting the delete's own descendant-count semantics: a
   * destructive action behind a dialog whose copy never mentioned it. So the
   * assertion is that both survive under distinct names.
   */
  it('"Keep both" moves it in under a free name, and nothing is deleted', async () => {
    const session = colliding();
    await boot({ session });
    await act(async () => {
      await treeProps().onMove({
        dragIds: ['outside'],
        parentId: 'f1',
        index: 0
      });
    });
    await waitFor(() => expect(el('file-explorer-collision')).not.toBeNull());

    fireEvent.click(el('file-explorer-collision-keep-both')!);
    await flush();

    const inF1 = session.diagrams.filter((d) => d.folderId === 'f1');
    expect(inF1).toHaveLength(2);
    // The bug was two rows the user could not tell apart.
    expect(new Set(inF1.map((d) => d.name)).size).toBe(2);
    expect(inF1.map((d) => d.id).sort()).toEqual(['inside', 'outside']);
  });

  it('Skip leaves it where it was', async () => {
    const session = colliding();
    await boot({ session });
    await act(async () => {
      await treeProps().onMove({
        dragIds: ['outside'],
        parentId: 'f1',
        index: 0
      });
    });
    await waitFor(() => expect(el('file-explorer-collision')).not.toBeNull());

    fireEvent.click(el('file-explorer-collision-skip')!);
    await flush();
    expect(session.diagrams.find((d) => d.id === 'outside')?.folderId ?? null).toBeNull();
  });

  it('CONTROL: a non-colliding move raises no dialog at all', async () => {
    const session = makePlace('local', {
      folders: [fld('f1', 'Docs')],
      diagrams: [dg('mover', 'Unique')]
    });
    await boot({ session });
    await act(async () => {
      await treeProps().onMove({ dragIds: ['mover'], parentId: 'f1', index: 0 });
    });
    await flush();
    expect(el('file-explorer-collision')).toBeNull();
    expect(session.diagrams.find((d) => d.id === 'mover')?.folderId).toBe('f1');
  });
});

// ---------------------------------------------------------------------------
// FEX-11 / FEX-12 / FEX-16 — rename resolves from the NODE, and rolls back.
// ---------------------------------------------------------------------------
describe('FEX-11 — a rename reaches the right entity TYPE', () => {
  it('a folder rename calls the folder API even when the tree lost the folder', async () => {
    // The repro: the input is open, the tree refreshes without that folder
    // (another tab deleted it, a Drive listing dropped it), and the submit used
    // to fall through to `renameDiagram` — which a provider that no-ops on an
    // unknown id never reported.
    const session = makePlace('local', { folders: [fld('f1', 'Docs')] });
    await boot({ session });
    const folderNode = { id: 'f1', name: 'Docs', type: 'folder', placeId: 'local' };

    session.folders.length = 0; // the listing drops it mid-edit

    await act(async () => {
      await treeProps().onRename({
        id: 'f1',
        name: 'Renamed',
        node: { data: folderNode }
      });
    });
    await flush();

    expect(session.log.some((l) => l.startsWith('renameFolder(f1'))).toBe(true);
    expect(session.log.some((l) => l.startsWith('renameDiagram(f1'))).toBe(false);
  });

  it('CONTROL: a diagram rename still calls the diagram API', async () => {
    const session = makePlace('local', { diagrams: [dg('d1', 'Alpha')] });
    await boot({ session });
    await act(async () => {
      await treeProps().onRename({
        id: 'd1',
        name: 'Renamed',
        node: { data: { id: 'd1', name: 'Alpha', type: 'diagram', placeId: 'local' } }
      });
    });
    await flush();
    expect(session.log.some((l) => l.startsWith('renameDiagram(d1'))).toBe(true);
  });

  it('an id that resolves to nothing FAILS LOUDLY instead of being a diagram', async () => {
    const session = makePlace('local', {});
    await boot({ session });
    await act(async () => {
      await treeProps().onRename({ id: 'ghost', name: 'Renamed', node: null });
    });
    await flush();
    expect(messages()).toContain('error:Rename failed');
    expect(session.log.some((l) => l.startsWith('renameDiagram'))).toBe(false);
  });
});

describe('FEX-12 — a rename reaches the right PLACE', () => {
  it("a Drive rename does not fall back to the session provider", async () => {
    // `placeOfId.get(id) ?? 'local'` sent a Drive operation to local storage
    // whenever the Drive tree had been cleared by a token lapse.
    const session = makePlace('local', {});
    const drive = makePlace('google-drive', { diagrams: [dg('gd1', 'Cloud')] });
    auth = makeAuth({
      status: 'AUTHENTICATED',
      user: { email: 'a@b.c' },
      driveScopeGranted: true
    }) as unknown as Record<string, unknown>;
    await boot({ session, drive, dual: true });

    await act(async () => {
      await treeProps().onRename({
        id: 'gd1',
        name: 'Renamed',
        node: {
          data: { id: 'gd1', name: 'Cloud', type: 'diagram', placeId: 'google-drive' }
        }
      });
    });
    await flush();

    expect(drive.log.some((l) => l.startsWith('renameDiagram(gd1'))).toBe(true);
    expect(session.log.some((l) => l.startsWith('renameDiagram(gd1'))).toBe(false);
  });
});

describe('FEX-16 — a failed rename is rolled back everywhere', () => {
  it('the open diagram gets its stored name back, not the one that failed', async () => {
    // `notifyDiagramRenamedFromTree` is not display-only: it sets the diagram
    // name, the current diagram and the in-memory model's title. The catch
    // undid only `tree.optimisticRename`, so the canvas kept a name storage
    // never accepted — and the next autosave would have persisted it.
    const session = makePlace('local', { diagrams: [dg('d1', 'Original')] });
    const life = makeLifecycle(session, {
      currentDiagram: { id: 'd1', name: 'Original' }
    });
    await boot({ session, lifecycle: life });
    session.fail.add('renameDiagram');

    await act(async () => {
      await treeProps().onRename({
        id: 'd1',
        name: 'New name',
        node: { data: { id: 'd1', name: 'Original', type: 'diagram', placeId: 'local' } }
      });
    });
    await flush();

    expect(messages()).toContain('error:Rename failed');
    const notifications = life.log.filter((l) =>
      l.startsWith('notifyDiagramRenamedFromTree')
    );
    // Optimistic first, then the rollback — the last word is the stored name.
    expect(notifications[notifications.length - 1]).toBe(
      'notifyDiagramRenamedFromTree(d1,Original)'
    );
  });

  it('CONTROL: a rename that SUCCEEDS is not rolled back', async () => {
    const session = makePlace('local', { diagrams: [dg('d1', 'Original')] });
    const life = makeLifecycle(session, {
      currentDiagram: { id: 'd1', name: 'Original' }
    });
    await boot({ session, lifecycle: life });

    await act(async () => {
      await treeProps().onRename({
        id: 'd1',
        name: 'New name',
        node: { data: { id: 'd1', name: 'Original', type: 'diagram', placeId: 'local' } }
      });
    });
    await flush();

    const notifications = life.log.filter((l) =>
      l.startsWith('notifyDiagramRenamedFromTree')
    );
    expect(notifications[notifications.length - 1]).toBe(
      'notifyDiagramRenamedFromTree(d1,New name)'
    );
  });

  it('a FOLDER rename never notifies the diagram lifecycle at all', async () => {
    // It used to, unconditionally — a folder id handed to `setDiagramName`.
    const session = makePlace('local', { folders: [fld('f1', 'Docs')] });
    const life = makeLifecycle(session);
    await boot({ session, lifecycle: life });

    await act(async () => {
      await treeProps().onRename({
        id: 'f1',
        name: 'Renamed',
        node: { data: { id: 'f1', name: 'Docs', type: 'folder', placeId: 'local' } }
      });
    });
    await flush();

    expect(
      life.log.some((l) => l.startsWith('notifyDiagramRenamedFromTree'))
    ).toBe(false);
  });
});
