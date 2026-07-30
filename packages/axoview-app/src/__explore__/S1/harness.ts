/**
 * S1 (Google identity & token lifecycle) T1 harness.
 *
 * The auth state machine is fully drivable without live Google: `_setBridge`
 * accepts a fake `requestToken`/`revoke`, and `_onToken`/`_onError` stand in for
 * the GIS callbacks. What the existing suite never does is drive the *other*
 * entry points (markExpired / markDriveScopeMissing / grantDriveAccess) WHILE a
 * request is in flight — that interleaving is this area's seam.
 *
 * Rig notes (APPROACH §4, COLDSTART rig traps):
 *  - `pendingAuthTimeout` is MODULE state, not store state, so a probe that
 *    leaves a request in flight leaks a timer into the next test. `resetAuth()`
 *    drains it through a real signOut() (the only public clearAuthTimeout path).
 *  - `fetchUserInfo` fires fire-and-forget on every grant; stub `fetch` or the
 *    probe logs an unhandled rejection.
 *  - Every probe asserts its PRECONDITION (status + `_waiters.length` +
 *    requestToken call count) before acting, so a rig failure cannot masquerade
 *    as evidence.
 */
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FULL_SCOPE = `openid email profile ${DRIVE_SCOPE}`;
export const IDENTITY_ONLY_SCOPE = 'openid email profile';

export interface FakeBridge {
  requestToken: jest.Mock<void, [opts?: { prompt?: string; hint?: string }]>;
  revoke: jest.Mock<void, [string]>;
}

/** Wipe store + notification + module timer state between probes. */
export function resetAuth(): void {
  // signOut() is the only exported path that calls clearAuthTimeout(); run it
  // first so a leaked in-flight timer from the previous probe cannot fire into
  // this one.
  useAuthStore.setState({ _revoke: null });
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
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: false,
    status: 404,
    json: async () => ({})
  }));
}

export function installBridge(): FakeBridge {
  const bridge: FakeBridge = { requestToken: jest.fn(), revoke: jest.fn() };
  useAuthStore.getState()._setBridge(bridge);
  return bridge;
}

/** A healthy session whose token is inside the 5-minute refresh margin. */
export function seedNearExpirySession(token = 'old-token'): void {
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: token,
    expiresAt: Date.now() + 1000,
    driveScopeGranted: true
  });
}

/** A healthy session well outside the refresh margin. */
export function seedHealthySession(token = 'good-token'): void {
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: token,
    expiresAt: Date.now() + 60 * 60 * 1000,
    driveScopeGranted: true
  });
}

/** The store's own API shape — exported so `auth()` has a nameable return type. */
export type AuthStoreApi = ReturnType<typeof useAuthStore.getState>;

export function auth(): AuthStoreApi {
  return useAuthStore.getState();
}

export function waiterCount(): number {
  return useAuthStore.getState()._waiters.length;
}

export function notices() {
  return useNotificationStore.getState().queue;
}

/**
 * Did `p` settle? Attaches handlers and drains the microtask queue — no timer,
 * so it reads the same under real and fake timers. A promise that only a *timer*
 * could settle reads as `{ settled: false }`, which is exactly what AUTH-01 asks.
 */
export async function settle<T>(
  p: Promise<T>
): Promise<{ settled: false } | { settled: true; value: T } | { settled: true; error: unknown }> {
  let out: { settled: false } | { settled: true; value: T } | { settled: true; error: unknown } = {
    settled: false
  };
  void p.then(
    (value) => {
      out = { settled: true, value };
    },
    (error) => {
      out = { settled: true, error };
    }
  );
  // The store settles waiters synchronously inside _onToken / _onError, so one
  // tick suffices; extra ticks only make a false "unsettled" harder, never easier.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  return out;
}
