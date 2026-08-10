/**
 * authStore.sessionIntegrity.test.ts — promoted from the 2026-07 exploratory
 * lane (`__explore__/S1`) when wave 2 fixed the S1 block.
 *
 * The existing `authStore.test.ts` drives one request at a time. Every bug here
 * needed a SECOND actor arriving while a request was in flight — a Drive 401, a
 * scope-403, a second sign-in click, the safety-net timeout — which is why the
 * area's seam was the interleaving and not the happy path.
 *
 * AUTH-01 markDriveScopeMissing settles its waiters   AUTH-02 grantDriveAccess absorbs like signIn
 * AUTH-03 the timeout is never absorbed               AUTH-04 markExpired keeps off an interactive sign-in
 * AUTH-05 a userinfo failure still renders signed-in  AUTH-07 signIn is idempotent
 * AUTH-11 a cancelled chooser keeps the session       AUTH-12 the hint goes with the scope
 * AUTH-13 (ruling) a hint needs name AND email        AUTH-16 per-account caches are invalidated
 */
import { useAuthStore, onAuthSessionReset } from '../authStore';
import { useNotificationStore } from '../notificationStore';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FULL_SCOPE = `openid email profile ${DRIVE_SCOPE}`;
const IDENTITY_ONLY_SCOPE = 'openid email profile';
const HINT_KEY = 'axoview-google-profile';

const auth = () => useAuthStore.getState();
const waiterCount = () => useAuthStore.getState()._waiters.length;
const notices = () => useNotificationStore.getState().queue;

function reset() {
  useAuthStore.setState({ _revoke: null });
  // signOut() is the only exported path that calls clearAuthTimeout(), and
  // `pendingAuthTimeout` is MODULE state — a probe that leaves a request in
  // flight otherwise leaks its timer into the next test.
  useAuthStore.getState().signOut();
  useAuthStore.setState({
    status: 'UNAUTHENTICATED',
    user: null,
    accessToken: null,
    expiresAt: null,
    driveScopeGranted: null,
    _requestToken: null,
    _revoke: null,
    _waiters: [],
    _absorbStaleError: false
  });
  useNotificationStore.setState({ queue: [] });
  localStorage.clear();
}

function installBridge() {
  const bridge = {
    requestToken: jest.fn<void, [{ prompt?: string; hint?: string }?]>(),
    revoke: jest.fn<void, [string]>()
  };
  useAuthStore.getState()._setBridge(bridge);
  return bridge;
}

const seedNearExpirySession = (token = 'old-token') =>
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: token,
    expiresAt: Date.now() + 1000,
    driveScopeGranted: true
  });

const seedHealthySession = (token = 'good-token') =>
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: token,
    expiresAt: Date.now() + 60 * 60 * 1000,
    driveScopeGranted: true
  });

/** Did `p` settle? Drains microtasks only — a promise only a TIMER could settle
 *  reads as `{ settled: false }`, which is exactly what AUTH-01 asks. */
async function settle<T>(p: Promise<T>) {
  let out: { settled: boolean; value?: T } = { settled: false };
  void p.then((value) => {
    out = { settled: true, value };
  });
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  return out;
}

beforeEach(() => {
  reset();
  jest.useRealTimers();
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: false,
    status: 404,
    json: async () => ({})
  }));
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// AUTH-01 / AUTH-12 — markDriveScopeMissing leaves the same trail as its twin
// ---------------------------------------------------------------------------
describe('markDriveScopeMissing settles everything markExpired settles', () => {
  test('an in-flight getValidToken piggybacker is settled, not parked forever', async () => {
    installBridge();
    seedNearExpirySession();
    // A refresh is in flight; a second caller piggybacks on it.
    const first = auth().getValidToken();
    expect(auth().status).toBe('REFRESHING');
    const parked = auth().getValidToken();
    expect(waiterCount()).toBe(2);

    auth().markDriveScopeMissing();

    expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
    expect(waiterCount()).toBe(0);
    await expect(parked).resolves.toBeNull();
    await expect(first).resolves.toBeNull();
  });

  test('it clears the profile hint, so a reload is not "remembered"', async () => {
    installBridge();
    localStorage.setItem(
      HINT_KEY,
      JSON.stringify({ name: 'Ada', email: 'ada@example.com', avatarUrl: '' })
    );
    seedHealthySession();

    auth().markDriveScopeMissing();

    // The `_onToken` twin on the identical condition clears it "so a reload
    // lands on a clean signed-out state instead of looping back into this
    // prompt"; this path parks the session in the same state and now agrees.
    expect(localStorage.getItem(HINT_KEY)).toBeNull();
  });

  test('a second call is still a no-op (the re-entry guard survives)', () => {
    installBridge();
    seedHealthySession();
    auth().markDriveScopeMissing();
    const before = auth();
    auth().markDriveScopeMissing();
    expect(auth().status).toBe(before.status);
  });
});

// ---------------------------------------------------------------------------
// AUTH-02 — grantDriveAccess derives the absorb flag the way signIn does
// ---------------------------------------------------------------------------
test('a superseded silent request cannot cancel the consent popup', async () => {
  const bridge = installBridge();
  seedNearExpirySession();
  void auth().getValidToken(); // REFRESHING
  auth().markDriveScopeMissing(); // the route into DRIVE_ACCESS_REQUIRED mid-refresh

  auth().grantDriveAccess();
  expect(auth().status).toBe('AUTHENTICATING');
  expect(auth()._absorbStaleError).toBe(true);

  // The superseded refresh's late error arrives while the user is consenting.
  auth()._onError({ type: 'popup_closed' });
  expect(auth().status).toBe('AUTHENTICATING');
  expect(notices().some((n) => /cancelled/i.test(String(n.message)))).toBe(false);

  // …and the consent the user actually completed lands.
  auth()._onToken({ access_token: 'granted', expires_in: 3600, scope: FULL_SCOPE });
  expect(auth().status).toBe('AUTHENTICATED');
  expect(auth().accessToken).toBe('granted');
  expect(bridge.requestToken).toHaveBeenCalledWith({ prompt: 'consent' });
});

// ---------------------------------------------------------------------------
// AUTH-03 — the safety-net timeout is not a GIS callback
// ---------------------------------------------------------------------------
describe('the stuck-request timeout survives the stale-error absorber', () => {
  test('a superseded sign-in still times out, and recovers', () => {
    jest.useFakeTimers();
    installBridge();
    useAuthStore.setState({
      user: { name: 'Ada', email: 'ada@example.com', avatarUrl: '' }
    });
    void auth().attemptSilentReconnect(); // RECONNECTING
    void auth().signIn(); // supersedes it → _absorbStaleError
    expect(auth()._absorbStaleError).toBe(true);

    // The popup never calls back (COOP-blocked window.closed polling) — the
    // exact scenario the timeout exists for.
    jest.advanceTimersByTime(120_000 + 10);

    expect(auth().status).toBe('UNAUTHENTICATED');
    expect(waiterCount()).toBe(0);
  });

  test('an absorbed error re-arms the deadline it did not spend', () => {
    jest.useFakeTimers();
    installBridge();
    useAuthStore.setState({
      user: { name: 'Ada', email: 'ada@example.com', avatarUrl: '' }
    });
    void auth().attemptSilentReconnect();
    void auth().signIn();

    // The superseded request's late error is absorbed…
    auth()._onError({ type: 'popup_closed' });
    expect(auth().status).toBe('AUTHENTICATING');

    // …and the interactive request still has a deadline. Before the fix the
    // absorb branch returned before clearAuthTimeout() and the timer callback
    // had already nulled itself, so nothing was left to recover this.
    jest.advanceTimersByTime(120_000 + 10);
    expect(auth().status).toBe('UNAUTHENTICATED');
  });
});

// ---------------------------------------------------------------------------
// AUTH-04 — markExpired must not clobber an interactive sign-in
// ---------------------------------------------------------------------------
test('a stale Drive 401 during sign-in does not discard the grant', async () => {
  installBridge();
  const p = auth().signIn();
  expect(auth().status).toBe('AUTHENTICATING');

  // A Drive request issued BEFORE the click comes back 401 — expected; it is
  // what prompted the sign-in.
  auth().markExpired();

  expect(auth().status).toBe('AUTHENTICATING');
  expect(waiterCount()).toBe(1);
  expect(notices().filter((n) => /expired/i.test(String(n.message)))).toHaveLength(0);

  auth()._onToken({ access_token: 'fresh', expires_in: 3600, scope: FULL_SCOPE });
  await p;
  expect(auth().status).toBe('AUTHENTICATED');
  expect(auth().accessToken).toBe('fresh');
});

test('markExpired still fires for a session with nothing in flight', () => {
  installBridge();
  seedHealthySession();
  auth().markExpired();
  expect(auth().status).toBe('SESSION_EXPIRED');
  expect(notices().some((n) => /expired/i.test(String(n.message)))).toBe(true);
});

// ---------------------------------------------------------------------------
// AUTH-07 — signIn is idempotent
// ---------------------------------------------------------------------------
test('a second sign-in click does not open a second Google popup', async () => {
  const bridge = installBridge();
  const first = auth().signIn();
  const second = auth().signIn();

  expect(bridge.requestToken).toHaveBeenCalledTimes(1);
  expect(waiterCount()).toBe(2);

  auth()._onToken({ access_token: 'tok', expires_in: 3600, scope: FULL_SCOPE });
  await Promise.all([first, second]);
  expect(auth().status).toBe('AUTHENTICATED');
});

// ---------------------------------------------------------------------------
// AUTH-05 — a cosmetic fetch must not decide whether the user can sign out
// ---------------------------------------------------------------------------
describe('a userinfo failure leaves a usable identity', () => {
  test('a rejecting fetch still yields a user (so the sign-out control renders)', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    installBridge();
    const p = auth().signIn();
    auth()._onToken({ access_token: 'tok', expires_in: 3600, scope: FULL_SCOPE });
    await p;
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(auth().status).toBe('AUTHENTICATED');
    await expect(auth().getValidToken()).resolves.toBe('tok');
    expect(auth().user).not.toBeNull();
  });

  test('…but the placeholder is never persisted as a hint (AUTH-13)', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    installBridge();
    const p = auth().signIn();
    auth()._onToken({ access_token: 'tok', expires_in: 3600, scope: FULL_SCOPE });
    await p;
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    // No email → not a usable login_hint → nothing to remember.
    expect(localStorage.getItem(HINT_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AUTH-13 (owner ruling 2026-07-30) — a hint needs a non-empty name AND email
// ---------------------------------------------------------------------------
describe('profile hint validity', () => {
  test('an email-less profile is not persisted', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: 'Ada', picture: 'p.png' }) // no email
    }));
    installBridge();
    const p = auth().signIn();
    auth()._onToken({ access_token: 'tok', expires_in: 3600, scope: FULL_SCOPE });
    await p;
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(auth().user?.name).toBe('Ada');
    expect(localStorage.getItem(HINT_KEY)).toBeNull();
  });

  test('a complete profile IS persisted (the rule is not a blanket refusal)', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: 'Ada', email: 'ada@example.com', picture: '' })
    }));
    installBridge();
    const p = auth().signIn();
    auth()._onToken({ access_token: 'tok', expires_in: 3600, scope: FULL_SCOPE });
    await p;
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(JSON.parse(localStorage.getItem(HINT_KEY)!).email).toBe(
      'ada@example.com'
    );
  });
});

// ---------------------------------------------------------------------------
// AUTH-11 — a cancelled account chooser keeps the session that was working
// ---------------------------------------------------------------------------
test('cancelling an account chooser does not sign the viewer out', async () => {
  const bridge = installBridge();
  seedHealthySession('live-token');
  useAuthStore.setState({
    user: { name: 'Ada', email: 'ada@example.com', avatarUrl: '' }
  });

  const p = auth().signIn({ prompt: 'select_account' });
  expect(bridge.requestToken).toHaveBeenCalledWith({ prompt: 'select_account' });

  auth()._onError({ type: 'popup_closed' });
  await p;

  // The identity the gate explains with, and the token, both survive.
  expect(auth().user?.email).toBe('ada@example.com');
  expect(auth().status).toBe('AUTHENTICATED');
  await expect(auth().getValidToken()).resolves.toBe('live-token');
});

test('a cancelled sign-in with no live session still lands signed out', async () => {
  installBridge();
  const p = auth().signIn();
  auth()._onError({ type: 'popup_closed' });
  await p;
  expect(auth().status).toBe('UNAUTHENTICATED');
});

// ---------------------------------------------------------------------------
// AUTH-16 — per-account caches do not outlive the account
// ---------------------------------------------------------------------------
describe('per-account cache invalidation', () => {
  test('signOut fires the session-reset handlers', () => {
    const handler = jest.fn();
    const off = onAuthSessionReset(handler);
    installBridge();
    seedHealthySession();

    auth().signOut();

    expect(handler).toHaveBeenCalledTimes(1);
    off();
    auth().signOut();
    expect(handler).toHaveBeenCalledTimes(1); // unsubscribed
  });

  test('a grant naming a different email fires them too', async () => {
    const handler = jest.fn();
    const off = onAuthSessionReset(handler);
    useAuthStore.setState({
      user: { name: 'A', email: 'a@example.com', avatarUrl: '' }
    });
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: 'B', email: 'b@example.com', picture: '' })
    }));
    installBridge();

    const p = auth().signIn();
    auth()._onToken({ access_token: 'tok-b', expires_in: 3600, scope: FULL_SCOPE });
    await p;
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(handler).toHaveBeenCalled();
    off();
  });

  test('re-granting the SAME account does not (no spurious invalidation)', async () => {
    const handler = jest.fn();
    const off = onAuthSessionReset(handler);
    useAuthStore.setState({
      user: { name: 'A', email: 'a@example.com', avatarUrl: '' }
    });
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: 'A', email: 'a@example.com', picture: '' })
    }));
    installBridge();

    const p = auth().signIn();
    auth()._onToken({ access_token: 'tok-a', expires_in: 3600, scope: FULL_SCOPE });
    await p;
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
    off();
  });
});

// ---------------------------------------------------------------------------
// AUTH-06 — a scope-less grant is distinguishable from "signed out"
// ---------------------------------------------------------------------------
test('a scope-less grant settles piggybackers and parks the session', async () => {
  installBridge();
  seedNearExpirySession();
  const parked = auth().getValidToken();
  expect(auth().status).toBe('REFRESHING');

  auth()._onToken({
    access_token: 'identity-only',
    expires_in: 3600,
    scope: IDENTITY_ONLY_SCOPE
  });

  // The caller gets null (the token IS correctly withheld) — what changed is
  // that `GoogleDriveProvider.request()` reads the status and reports "Drive
  // access is required" rather than "Not signed in to Google", so its error
  // surface no longer contradicts the blocking dialog. See the provider suite.
  expect((await settle(parked)).settled).toBe(true);
  await expect(parked).resolves.toBeNull();
  expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
});
