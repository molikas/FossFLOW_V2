/**
 * A4 — FEX-15: the `MigrateSessionDialog` auto-offer.
 *
 * The dialog is the only thing standing between session-only work and a closed
 * tab, and it offers itself exactly once per fresh grant. The hypothesis says
 * the offer can fire zero or two times, because `pendingOfferRef` is consumed
 * by `tryAutoOffer` only when `getCachedRootId()` is already set and the
 * `axoview-drive-root-ready` event can interleave with the auth-status effect
 * either way. Probed here: both halves, separately.
 */
import { act, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';

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

import { appStorageValue, dg, flush, makeAuth, makeLifecycle, makePlace } from '../../testUtils/fileExplorerHarness';
import { MigrateSessionDialog } from '../../components/MigrateSessionDialog';
import { useNotificationStore } from '../../stores/notificationStore';

const dialog = () => document.querySelector('[data-axoview-id="migrate-session-dialog"]');
const rows = () =>
  [...document.querySelectorAll('[data-axoview-id="migrate-session-dialog"] li')].map(
    (li) => li.textContent
  );

beforeEach(() => {
  useNotificationStore.getState().dismissAll();
});

/**
 * Mount signed-out, then transition to AUTHENTICATED — the only path that arms
 * the auto-offer (`prev` must be AUTHENTICATING / RECONNECTING / UNAUTHENTICATED).
 */
async function signIn(opts: { rootCached: boolean; sessionDiagrams?: number }) {
  const session = makePlace('local', {
    diagrams: Array.from({ length: opts.sessionDiagrams ?? 2 }, (_, i) =>
      dg(`d${i}`, `Diagram ${i}`)
    )
  });
  const drive = makePlace('google-drive');
  drive.rootId = opts.rootCached ? 'drive-root' : null;
  const life = makeLifecycle(session);
  appStorage = appStorageValue({ session, drive, googleDriveConfigured: true });
  lifecycleCtx = life.ctx;
  auth = makeAuth({ status: 'UNAUTHENTICATED' });

  const utils = render(<MigrateSessionDialog />);
  await flush();
  // PRECONDITION: nothing is offered while signed out.
  expect(dialog()).toBeNull();

  auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' } });
  await act(async () => { utils.rerender(<MigrateSessionDialog />); });
  await flush();
  return { session, drive, life, utils };
}

const rootReady = async () => {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('axoview-drive-root-ready'));
  });
  await flush();
};

// ---------------------------------------------------------------------------
// The offer works when nothing goes wrong — both orderings.
// ---------------------------------------------------------------------------
describe('FEX-15 — the auto-offer in its two healthy orderings', () => {
  it('characterization: root already cached — the offer fires on the auth transition', async () => {
    await signIn({ rootCached: true });
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(rows()).toEqual(['Diagram 0', 'Diagram 1']);
  });

  it('characterization: root configured later — the ready event fires the offer, ONCE', async () => {
    const { session, drive } = await signIn({ rootCached: false });
    // PRECONDITION: the offer is armed but waiting for the setup gate.
    expect(dialog()).toBeNull();
    expect(session.log.some((l) => l.startsWith('listDiagrams'))).toBe(false);

    // DriveSetupGate configures the root and announces it — twice, which it
    // really can do (`hasConfiguredRoot()` dispatches on one path and
    // `handleConfirm` on the other, and nothing dedupes the event).
    drive.rootId = 'drive-root';

    await rootReady();
    await waitFor(() => expect(dialog()).not.toBeNull());
    // Exactly one enumeration, so the checkbox list cannot be rebuilt under a
    // user who is mid-decision: `pendingOfferRef` is consumed synchronously,
    // before the first await.
    expect(session.log.filter((l) => l.startsWith('listDiagrams'))).toHaveLength(1);
    await rootReady();
    expect(session.log.filter((l) => l.startsWith('listDiagrams'))).toHaveLength(1);
  });

  it.failing('FEX-15a: a second root-ready event re-opens or rebuilds the offer', async () => {
    const { session } = await signIn({ rootCached: true });
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(session.log.filter((l) => l.startsWith('listDiagrams'))).toHaveLength(1); // precondition
    await rootReady();
    await rootReady();
    // The "fires twice" half of the hypothesis: FALSIFIED. `tryAutoOffer`
    // clears `pendingOfferRef` before its first await, so every later caller
    // returns at the first line.
    expect(session.log.filter((l) => l.startsWith('listDiagrams')).length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// The zero-fire half.
// ---------------------------------------------------------------------------
describe('FEX-15 — one transient failure consumes the whole session\'s offer', () => {
  it('characterization: a failed enumeration burns the offer and never retries', async () => {
    const session = makePlace('local', { diagrams: [dg('d0', 'Only copy')] });
    const drive = makePlace('google-drive');
    drive.rootId = 'drive-root';
    const life = makeLifecycle(session);
    appStorage = appStorageValue({ session, drive, googleDriveConfigured: true });
    lifecycleCtx = life.ctx;
    auth = makeAuth({ status: 'UNAUTHENTICATED' });
    const utils = render(<MigrateSessionDialog />);
    await flush();

    // The session listing fails once — a transient localStorage/server hiccup
    // at exactly the moment the grant lands.
    session.fail.add('listDiagrams');
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' } });
    await act(async () => { utils.rerender(<MigrateSessionDialog />); });
    await flush();

    // PRECONDITION: the enumeration really was attempted, and really failed.
    expect(session.log.filter((l) => l.startsWith('listDiagrams'))).toHaveLength(1);
    expect(dialog()).toBeNull();

    // Storage recovers, and the gate re-announces the root — but the offer was
    // consumed by the attempt that failed (`pendingOfferRef` is cleared before
    // the await, and `offeredThisGrantRef` before that), so nothing re-arms it
    // short of signing out. `enumerateSession`'s `catch` returns `[]`, which is
    // indistinguishable from "no session diagrams to move".
    session.fail.delete('listDiagrams');
    await rootReady();
    expect(dialog()).toBeNull();
    expect(session.log.filter((l) => l.startsWith('listDiagrams'))).toHaveLength(1);
    // …and the work it would have rescued is still session-only.
    expect(session.diagrams.map((d) => d.name)).toEqual(['Only copy']);
  });

  it.failing('FEX-15: a failed enumeration leaves the offer armed for the next chance', async () => {
    const session = makePlace('local', { diagrams: [dg('d0', 'Only copy')] });
    const drive = makePlace('google-drive');
    drive.rootId = 'drive-root';
    const life = makeLifecycle(session);
    appStorage = appStorageValue({ session, drive, googleDriveConfigured: true });
    lifecycleCtx = life.ctx;
    auth = makeAuth({ status: 'UNAUTHENTICATED' });
    const utils = render(<MigrateSessionDialog />);
    await flush();
    session.fail.add('listDiagrams');
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' } });
    await act(async () => { utils.rerender(<MigrateSessionDialog />); });
    await flush();
    expect(dialog()).toBeNull(); // precondition
    session.fail.delete('listDiagrams');
    await rootReady();
    // Expected: a failure is not an answer — the once-per-grant offer should be
    // spent only when the user actually saw it (or when there was genuinely
    // nothing to move). Actual: `enumerateSession` swallows the error into `[]`
    // after both refs are already consumed.
    await waitFor(() => expect(dialog()).not.toBeNull());
  });
});
