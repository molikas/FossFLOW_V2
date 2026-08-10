/**
 * Promoted from the A4 explore lane (ADR 0047 flip rule) — A4/FEX-15.
 *
 * The dialog is the only thing standing between session-only work and a closed
 * tab, and it offers itself exactly once per fresh grant. `enumerateSession`
 * swallowed every failure into `[]`, which the caller cannot tell apart from
 * "nothing to move" — so one transient listing hiccup at the moment of the
 * grant returned silently having already spent BOTH one-shot refs, and the
 * offer never came back for the rest of the session however long it stayed
 * signed in.
 *
 * The failure/empty distinction is the whole fix, so the tests are paired: the
 * once-per-grant property must SURVIVE (a spent offer stays spent) while a
 * FAILED attempt re-arms. Asserting only the second would let "always re-offer"
 * pass, which would rebuild the checkbox list under a user mid-decision.
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
import { MigrateSessionDialog } from '../MigrateSessionDialog';
import { useNotificationStore } from '../../stores/notificationStore';

const dialog = () => document.querySelector('[data-axoview-id="migrate-session-dialog"]');
// `Array.prototype.slice.call`, not a spread: this package targets es5 without
// downlevelIteration, and a NodeList spread is a tsc error here (the same class
// the harness header records for Map/Set, where it fails SILENTLY at runtime).
// Only surfaced once this file moved out of the tsc-excluded explore lane.
const rows = (): (string | null)[] =>
  Array.prototype.slice
    .call(
      document.querySelectorAll(
        '[data-axoview-id="migrate-session-dialog"] li'
      )
    )
    .map((li: Element) => li.textContent);

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
  auth = makeAuth({ status: 'UNAUTHENTICATED' }) as unknown as Record<string, unknown>;

  const utils = render(<MigrateSessionDialog />);
  await flush();
  // PRECONDITION: nothing is offered while signed out.
  expect(dialog()).toBeNull();

  auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' } }) as unknown as Record<string, unknown>;
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
describe('FEX-15 — the auto-offer in its two healthy orderings (unchanged)', () => {
  it('root already cached — the offer fires on the auth transition', async () => {
    await signIn({ rootCached: true });
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(rows()).toEqual(['Diagram 0', 'Diagram 1']);
  });

  it('root configured later — the ready event fires the offer, ONCE', async () => {
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

  it('a second root-ready event does NOT re-open or rebuild the offer', async () => {
    const { session } = await signIn({ rootCached: true });
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(session.log.filter((l) => l.startsWith('listDiagrams'))).toHaveLength(1); // precondition
    await rootReady();
    await rootReady();
    // The "fires twice" half of the hypothesis was FALSIFIED, and the FEX-15
    // fix must not turn it true: `tryAutoOffer` still clears `pendingOfferRef`
    // before its first await, so every later caller returns at the first line.
    // The refs are re-armed on the FAILURE path only.
    expect(session.log.filter((l) => l.startsWith('listDiagrams'))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The zero-fire half.
// ---------------------------------------------------------------------------
describe('FEX-15 — one transient failure consumes the whole session\'s offer', () => {
  it('a failed enumeration does not burn the offer', async () => {
    const session = makePlace('local', { diagrams: [dg('d0', 'Only copy')] });
    const drive = makePlace('google-drive');
    drive.rootId = 'drive-root';
    const life = makeLifecycle(session);
    appStorage = appStorageValue({ session, drive, googleDriveConfigured: true });
    lifecycleCtx = life.ctx;
    auth = makeAuth({ status: 'UNAUTHENTICATED' }) as unknown as Record<string, unknown>;
    const utils = render(<MigrateSessionDialog />);
    await flush();

    // The session listing fails once — a transient localStorage/server hiccup
    // at exactly the moment the grant lands.
    session.fail.add('listDiagrams');
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' } }) as unknown as Record<string, unknown>;
    await act(async () => { utils.rerender(<MigrateSessionDialog />); });
    await flush();

    // PRECONDITION: the enumeration really was attempted, and really failed.
    expect(session.log.filter((l) => l.startsWith('listDiagrams'))).toHaveLength(1);
    expect(dialog()).toBeNull();

    // Storage recovers and the gate re-announces the root. The offer was NOT
    // consumed by the attempt that failed, so it comes back and rescues the
    // work it exists for.
    session.fail.delete('listDiagrams');
    await rootReady();
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(session.log.filter((l) => l.startsWith('listDiagrams'))).toHaveLength(2);
  });

  it('the recovered offer lists the diagrams it exists to rescue', async () => {
    const session = makePlace('local', { diagrams: [dg('d0', 'Only copy')] });
    const drive = makePlace('google-drive');
    drive.rootId = 'drive-root';
    const life = makeLifecycle(session);
    appStorage = appStorageValue({ session, drive, googleDriveConfigured: true });
    lifecycleCtx = life.ctx;
    auth = makeAuth({ status: 'UNAUTHENTICATED' }) as unknown as Record<string, unknown>;
    const utils = render(<MigrateSessionDialog />);
    await flush();
    session.fail.add('listDiagrams');
    auth = makeAuth({ status: 'AUTHENTICATED', user: { email: 'a@b.c' } }) as unknown as Record<string, unknown>;
    await act(async () => { utils.rerender(<MigrateSessionDialog />); });
    await flush();
    expect(dialog()).toBeNull(); // precondition
    session.fail.delete('listDiagrams');
    await rootReady();
    // A failure is not an answer: the once-per-grant offer is spent only when
    // the user actually saw it, or when there was genuinely nothing to move.
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(rows()).toEqual(['Only copy']);
  });
});
