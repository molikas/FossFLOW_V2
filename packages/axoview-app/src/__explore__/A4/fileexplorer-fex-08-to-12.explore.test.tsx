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
  dg,
  fld,
  flush,
  makeAuth,
  makeLifecycle,
  makePlace,
  renderExplorer,
  type PlaceDouble
} from '../../testUtils/fileExplorerHarness';
import { captured, rowIds, treeProps } from '../../testUtils/arboristStub';
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

// FEX-08, FEX-09, FEX-10, FEX-11, FEX-12 and FEX-16 are FIXED (wave 4,
// 2026-08-02) and their probes are retired. Promoted to the main suite as
// `components/fileExplorer/__tests__/fileExplorerHandlers.test.tsx`.
//
// Two were re-derived rather than moved verbatim, because they pinned a
// MECHANISM and the fix took the entry's other stated option:
//   - FEX-08 asserted the canvas reset never happens. The reset-first ordering
//     is deliberate (MQA #18 — it cancels the in-flight autosave), so the fix
//     restores the canvas in the `catch` instead; the regression asserts the
//     OUTCOME (the diagram is back on screen).
//   - FEX-09 asserted a real "Replace". The dialog now says "Keep both" and
//     does that, because a real replace hides a folder DELETE behind a
//     confirmation whose copy never mentioned it.
// (Queued for the wave-6 appendix: a probe that pins a mechanism cannot flip on
// a legitimate alternative fix.)
//
// The shared harness moved out of this lane in the same change —
// `src/testUtils/fileExplorerHarness.tsx` — because the main suite must not
// import from a lane wave 6 archives.
