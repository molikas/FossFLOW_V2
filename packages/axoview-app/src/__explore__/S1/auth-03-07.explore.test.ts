/**
 * S1 / AUTH-03, AUTH-07 — the two ways the store can be parked in AUTHENTICATING
 * with nothing left to move it.
 *
 * AUTH-03: the stuck-popup safety net (ADR 0035 §3 amendment 2) routes its
 * synthetic failure through `_onError` — the one function that can decide to
 * *absorb* an error. When `_absorbStaleError` is set, the timeout is eaten and
 * no timer remains.
 * AUTH-07: `signIn()` has no in-flight guard, so a second click fires a second
 * GIS request whose fate is decided by the first popup.
 */
import {
  auth,
  installBridge,
  notices,
  resetAuth,
  settle,
  waiterCount,
  FULL_SCOPE
} from './harness';

beforeEach(resetAuth);
afterEach(resetAuth);

describe('AUTH-03 — the stuck-popup timeout is absorbed by _absorbStaleError', () => {
  test('CHARACTERIZATION: AUTHENTICATING becomes permanent when the timeout fires while a superseded silent request is flagged', async () => {
    jest.useFakeTimers();
    try {
      const bridge = installBridge();
      auth()._setUser({ name: 'Igor', email: 'i@x.y', avatarUrl: '' });

      // Boot reconnect in flight (the default state for a remembered user).
      const silent = auth().attemptSilentReconnect();
      expect(auth().status).toBe('RECONNECTING'); // precondition
      expect(bridge.requestToken).toHaveBeenCalledWith({ prompt: '', hint: 'i@x.y' });

      // The user clicks sign-in; the interactive request supersedes the silent one.
      const interactive = auth().signIn();
      // --- preconditions: the absorb flag is armed and a 120s timer is live ---
      expect(auth().status).toBe('AUTHENTICATING');
      expect(auth()._absorbStaleError).toBe(true);
      expect(bridge.requestToken).toHaveBeenCalledTimes(2);

      // Neither GIS callback ever fires (COOP-blocked popup — the exact scenario
      // the timeout exists for). The 120s safety net fires...
      jest.advanceTimersByTime(AUTH_TIMEOUT_INTERACTIVE_MS);
      // ...and is absorbed. The flag it consumed is now clear...
      expect(auth()._absorbStaleError).toBe(false);
      // ...but the timer already nulled itself, and nothing re-armed it.
      expect(auth().status).toBe('AUTHENTICATING');

      // No amount of further waiting recovers: the store is stuck, which renders
      // as AuthControl's bare CircularProgress with no way out but a reload.
      jest.advanceTimersByTime(60 * 60 * 1000);
      expect(auth().status).toBe('AUTHENTICATING');
      expect(waiterCount()).toBe(2);
      expect(await settle(interactive)).toEqual({ settled: false });
      expect(await settle(silent)).toEqual({ settled: false });
    } finally {
      jest.useRealTimers();
    }
  });

  test('CONTROL: without a superseded silent request the same timeout recovers', () => {
    jest.useFakeTimers();
    try {
      installBridge();
      void auth().signIn();
      expect(auth().status).toBe('AUTHENTICATING'); // precondition
      expect(auth()._absorbStaleError).toBe(false);

      jest.advanceTimersByTime(AUTH_TIMEOUT_INTERACTIVE_MS);
      expect(auth().status).toBe('UNAUTHENTICATED');
    } finally {
      jest.useRealTimers();
    }
  });

  it.failing(
    'the stuck-popup timeout should recover even when an absorbed stale error is pending',
    () => {
      jest.useFakeTimers();
      try {
        const bridge = installBridge();
        auth()._setUser({ name: 'Igor', email: 'i@x.y', avatarUrl: '' });
        void auth().attemptSilentReconnect();
        void auth().signIn();
        // preconditions
        expect(auth().status).toBe('AUTHENTICATING');
        expect(auth()._absorbStaleError).toBe(true);
        expect(bridge.requestToken).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(AUTH_TIMEOUT_INTERACTIVE_MS + 1000);
        expect(auth().status).toBe('UNAUTHENTICATED');
      } finally {
        jest.useRealTimers();
      }
    }
  );
});

describe('AUTH-07 — signIn() is not idempotent while a popup is already open', () => {
  test('CHARACTERIZATION: a second click opens a second GIS request, and the first popup\'s dismissal cancels it', async () => {
    const bridge = installBridge();

    const first = auth().signIn();
    // --- precondition: one request, one waiter, absorb flag clear ---
    expect(auth().status).toBe('AUTHENTICATING');
    expect(bridge.requestToken).toHaveBeenCalledTimes(1);
    expect(waiterCount()).toBe(1);

    // A second sign-in entry point fires while the first popup is open. Neither
    // LocalModeBanner's button nor the persistent expired toast's action is
    // disabled on AUTHENTICATING, so this is a plain double-click away.
    const second = auth().signIn();
    expect(bridge.requestToken).toHaveBeenCalledTimes(2); // two popups
    expect(waiterCount()).toBe(2);
    // Nothing marks the first request as superseded — signIn only sets the flag
    // when the PRIOR status was RECONNECTING/REFRESHING.
    expect(auth()._absorbStaleError).toBe(false);

    // The user closes the first (now redundant) popup.
    auth()._onError(new Error('popup_closed'));
    expect(auth().status).toBe('UNAUTHENTICATED');
    expect(notices().some((n) => n.severity === 'info')).toBe(true);
    expect(await settle(first)).toEqual({ settled: true, value: undefined });
    expect(await settle(second)).toEqual({ settled: true, value: undefined });

    // ...and the grant they complete in the second popup is discarded.
    auth()._onToken({ access_token: 'from-second-popup', expires_in: 3600, scope: FULL_SCOPE });
    expect(auth().status).toBe('UNAUTHENTICATED');
    expect(auth().accessToken).toBeNull();
  });

  it.failing(
    'signIn() called during AUTHENTICATING should piggyback on the open request, not open a second popup',
    () => {
      const bridge = installBridge();
      void auth().signIn();
      expect(auth().status).toBe('AUTHENTICATING'); // precondition
      expect(bridge.requestToken).toHaveBeenCalledTimes(1);

      void auth().signIn();

      expect(bridge.requestToken).toHaveBeenCalledTimes(1);
    }
  );
});

// The store keeps these private; mirrored here so the probe reads at the same
// scale as the code under test (a wrong value would surface as a failing CONTROL).
const AUTH_TIMEOUT_INTERACTIVE_MS = 120_000;
