/**
 * S1 / AUTH-01, AUTH-02, AUTH-04 — the three "acted on the store while a GIS
 * request was in flight" seams. `signOut()` and `markExpired()` both drain
 * `_waiters` and clear the auth timeout; `markDriveScopeMissing()` does neither,
 * and `markExpired()` has no guard against landing on top of a live interactive
 * sign-in.
 *
 * Every probe asserts the PRECONDITION (status + waiter count + requestToken
 * calls) before acting — a `it.failing` whose setup never happened is
 * indistinguishable from evidence otherwise (COLDSTART rig trap #2).
 */
import {
  auth,
  installBridge,
  notices,
  resetAuth,
  seedNearExpirySession,
  settle,
  waiterCount,
  FULL_SCOPE
} from './harness';

beforeEach(resetAuth);
afterEach(resetAuth);

describe('AUTH-01 — markDriveScopeMissing() abandons in-flight waiters (markExpired does not)', () => {
  /**
   * Characterization: what actually happens. A Drive call 403s for insufficient
   * scope while a silent refresh is in flight; the refresh's awaiter never hears
   * back — not a value, not a rejection, not a timeout.
   */
  test('CHARACTERIZATION: the piggybacked getValidToken() promise is left unsettled forever', async () => {
    const bridge = installBridge();
    seedNearExpirySession();

    const pending = auth().getValidToken();
    // --- precondition: a real silent refresh IS in flight with a live waiter ---
    expect(auth().status).toBe('REFRESHING');
    expect(bridge.requestToken).toHaveBeenCalledTimes(1);
    expect(waiterCount()).toBe(1);

    // A stale Drive request comes back 403 insufficient-scope.
    auth().markDriveScopeMissing();

    expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
    // The waiter was never drained — markExpired() sets `_waiters: []` here.
    expect(waiterCount()).toBe(1);
    expect(await settle(pending)).toEqual({ settled: false });

    // Nothing can settle it after the fact either: both GIS callbacks bail on
    // the status guard, and the armed silent timeout's handler does the same.
    auth()._onToken({ access_token: 'late', scope: FULL_SCOPE });
    auth()._onError(new Error('late failure'));
    expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
    expect(await settle(pending)).toEqual({ settled: false });
  });

  test('CHARACTERIZATION: the 25s silent-request timeout cannot rescue it either', async () => {
    jest.useFakeTimers();
    try {
      installBridge();
      seedNearExpirySession();
      const pending = auth().getValidToken();
      expect(auth().status).toBe('REFRESHING'); // precondition

      auth().markDriveScopeMissing();
      // armAuthTimeout(25_000) is still pending, but its callback only acts on
      // AUTHENTICATING / RECONNECTING / REFRESHING.
      jest.advanceTimersByTime(60_000);
      expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
      expect(await settle(pending)).toEqual({ settled: false });
    } finally {
      jest.useRealTimers();
    }
  });

  test('CONTROL: the markExpired() sibling on the identical setup DOES settle it', async () => {
    installBridge();
    seedNearExpirySession();
    const pending = auth().getValidToken();
    expect(auth().status).toBe('REFRESHING'); // precondition
    expect(waiterCount()).toBe(1);

    auth().markExpired();

    expect(auth().status).toBe('SESSION_EXPIRED');
    expect(waiterCount()).toBe(0);
    expect(await settle(pending)).toEqual({ settled: true, value: null });
  });

  it.failing(
    'markDriveScopeMissing() should settle in-flight token waiters like markExpired() does',
    async () => {
      installBridge();
      seedNearExpirySession();
      const pending = auth().getValidToken();
      expect(auth().status).toBe('REFRESHING'); // precondition
      expect(waiterCount()).toBe(1);

      auth().markDriveScopeMissing();

      expect(waiterCount()).toBe(0);
      expect(await settle(pending)).toEqual({ settled: true, value: null });
    }
  );
});

describe('AUTH-04 — markExpired() discards a completing interactive sign-in', () => {
  test('CHARACTERIZATION: a stale 401 mid-sign-in ends with the user signed OUT despite a granted token', async () => {
    const bridge = installBridge();
    // The user is signed in, near expiry, and clicks "Sign in again".
    seedNearExpirySession();
    const signInPromise = auth().signIn();

    // --- precondition: the interactive popup is genuinely in flight ---
    expect(auth().status).toBe('AUTHENTICATING');
    expect(bridge.requestToken).toHaveBeenCalledTimes(1);
    expect(waiterCount()).toBe(1);

    // A Drive request issued before the click comes back 401 → markExpired().
    // There is no in-flight guard: it steamrolls the live sign-in.
    auth().markExpired();
    expect(auth().status).toBe('SESSION_EXPIRED');
    expect(waiterCount()).toBe(0);
    // signIn()'s waiter uses resolve for BOTH outcomes, so the caller sees a
    // "completed" sign-in.
    expect(await settle(signInPromise)).toEqual({ settled: true, value: undefined });

    // ...and it tells the user their session expired while they are mid-popup.
    expect(notices().filter((n) => n.severity === 'warning' && n.persistent)).toHaveLength(1);

    // The user finishes consent. The grant is discarded on the status guard.
    auth()._onToken({ access_token: 'freshly-granted', expires_in: 3600, scope: FULL_SCOPE });
    expect(auth().status).toBe('SESSION_EXPIRED');
    expect(auth().accessToken).toBeNull();
  });

  it.failing(
    'a completed interactive grant should survive a stale 401 that landed mid-flight',
    async () => {
      const bridge = installBridge();
      seedNearExpirySession();
      const signInPromise = auth().signIn();
      expect(auth().status).toBe('AUTHENTICATING'); // precondition
      expect(bridge.requestToken).toHaveBeenCalledTimes(1);

      auth().markExpired();
      auth()._onToken({ access_token: 'freshly-granted', expires_in: 3600, scope: FULL_SCOPE });
      await settle(signInPromise);

      expect(auth().status).toBe('AUTHENTICATED');
      expect(auth().accessToken).toBe('freshly-granted');
    }
  );
});

describe('AUTH-02 — grantDriveAccess() cannot absorb the superseded request it inherits', () => {
  /**
   * The full chain a real user walks: refresh in flight → scope-403 parks the
   * session → the blocking dialog's "Grant Drive access" → the superseded
   * refresh's late error → the user's actual consent grant.
   */
  test('CHARACTERIZATION: the user completes consent and lands signed out with a "Sign-in cancelled" toast', async () => {
    const bridge = installBridge();
    seedNearExpirySession();

    // 1. silent refresh in flight
    const pending = auth().getValidToken();
    expect(auth().status).toBe('REFRESHING'); // precondition
    expect(bridge.requestToken).toHaveBeenCalledTimes(1);

    // 2. a Drive 403 parks the session (AUTH-01's state)
    auth().markDriveScopeMissing();
    expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');

    // 3. the dialog's primary action
    auth().grantDriveAccess();
    expect(auth().status).toBe('AUTHENTICATING');
    expect(bridge.requestToken).toHaveBeenLastCalledWith({ prompt: 'consent' });
    // signIn() would have set this from the prior status; grantDriveAccess pins
    // it to false unconditionally.
    expect(auth()._absorbStaleError).toBe(false);

    // 4. the superseded silent request finally errors
    auth()._onError(new Error('popup_failed_to_open'));
    expect(auth().status).toBe('UNAUTHENTICATED');
    expect(notices().some((n) => n.severity === 'info')).toBe(true);

    // 5. the consent the user actually completed is discarded
    auth()._onToken({ access_token: 'consented', expires_in: 3600, scope: FULL_SCOPE });
    expect(auth().status).toBe('UNAUTHENTICATED');
    expect(auth().accessToken).toBeNull();
    expect(await settle(pending)).toEqual({ settled: true, value: null });
  });

  test('CONTROL: signIn() on the identical chain absorbs the stale error and the grant lands', async () => {
    installBridge();
    seedNearExpirySession();
    const pending = auth().getValidToken();
    expect(auth().status).toBe('REFRESHING'); // precondition

    // signIn() derives the flag from the superseded status — the only difference.
    const interactive = auth().signIn();
    expect(auth().status).toBe('AUTHENTICATING');
    expect(auth()._absorbStaleError).toBe(true);

    auth()._onError(new Error('popup_failed_to_open'));
    expect(auth().status).toBe('AUTHENTICATING'); // absorbed

    auth()._onToken({ access_token: 'consented', expires_in: 3600, scope: FULL_SCOPE });
    expect(auth().status).toBe('AUTHENTICATED');
    expect(auth().accessToken).toBe('consented');
    await settle(interactive);
    await settle(pending);
  });

  it.failing(
    'grantDriveAccess() should absorb the superseded silent request the same way signIn() does',
    async () => {
      const bridge = installBridge();
      seedNearExpirySession();
      auth().getValidToken();
      expect(auth().status).toBe('REFRESHING'); // precondition

      auth().markDriveScopeMissing();
      auth().grantDriveAccess();
      expect(bridge.requestToken).toHaveBeenLastCalledWith({ prompt: 'consent' }); // precondition

      auth()._onError(new Error('popup_failed_to_open'));
      expect(auth().status).toBe('AUTHENTICATING');

      auth()._onToken({ access_token: 'consented', expires_in: 3600, scope: FULL_SCOPE });
      expect(auth().status).toBe('AUTHENTICATED');
    }
  );
});
