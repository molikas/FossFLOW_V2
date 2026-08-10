/**
 * GoogleDriveProvider.authFailures.test.ts — promoted from the 2026-07
 * exploratory lane (`__explore__/S1`) when wave 2 fixed the S1 block.
 *
 * `request()` is where an HTTP answer becomes an auth *decision*, and three of
 * the four decisions it made were wrong in the same way — a status code was
 * treated as if it named the cause:
 *
 *  AUTH-06  a null token was always "Not signed in to Google", even when the
 *           session was parked in DRIVE_ACCESS_REQUIRED with the blocking
 *           re-consent dialog already on screen owning the recovery;
 *  AUTH-08  a 403 was classified as rate-limit vs permanent and then thrown as
 *           a bare 403 either way, so Drive being BUSY parked a healthy session
 *           and nulled a valid token;
 *  AUTH-09  …while a real scope 403 never reached `markDriveScopeMissing()` at
 *           all — that lived in one call site's catch, so save/load/list/rename
 *           dead-ended in a generic toast with the session still reporting
 *           itself signed in.
 *
 * AUTH-16 (per-account root caches) is here too: it is provider state.
 */
import { GoogleDriveProvider, DriveError } from '../providers/GoogleDriveProvider';
import { useAuthStore } from '../../../stores/authStore';
import { useNotificationStore } from '../../../stores/notificationStore';

const ROOT_CACHE_KEY = 'axoview-drive-root';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

const driveErrorBody = (reason: string, message = 'nope') => ({
  error: { message, errors: [{ reason }] }
});

let fetchMock: jest.Mock;

function makeProvider(): GoogleDriveProvider {
  const p = new GoogleDriveProvider();
  (p as unknown as { rootFolderId: string }).rootFolderId = 'root';
  (p as unknown as { retryDelays: number[] }).retryDelays = [0, 0, 0];
  return p;
}

beforeEach(() => {
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: 'test-token',
    expiresAt: Date.now() + 3600_000,
    user: null,
    _requestToken: null,
    _revoke: null,
    _waiters: []
  });
  useNotificationStore.setState({ queue: [] });
  localStorage.clear();
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

// ---------------------------------------------------------------------------
// AUTH-08 / AUTH-09 — a 403 says WHY
// ---------------------------------------------------------------------------
describe('403 classification', () => {
  test('an insufficient-scope 403 parks the session and names the reason', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        driveErrorBody('insufficientPermissions', 'Insufficient Permission'),
        403
      )
    );

    const err = await makeProvider()
      .loadDiagram('d1')
      .catch((e: unknown) => e as DriveError);

    // Consumers branch on `err.name` (a downlevelled `extends Error` used to
    // break `instanceof`; the constructor restores the prototype chain now, so
    // both forms work and neither is a trap).
    expect((err as DriveError).name).toBe('DriveError');
    expect(err).toBeInstanceOf(DriveError);
    expect((err as DriveError).reason).toBe('drive-scope-required');
    // AUTH-09: every Drive path inherits the recovery ladder now — this used to
    // be reachable only from `handleCreateBlankDiagram`'s catch.
    expect(useAuthStore.getState().status).toBe('DRIVE_ACCESS_REQUIRED');
    expect(useAuthStore.getState().driveScopeGranted).toBe(false);
    // Failed fast: no retry for a permanent condition.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('an exhausted rate-limit 403 does NOT park the session', async () => {
    // Retried through the full backoff, then thrown — the AUTH-08 shape.
    for (let i = 0; i < 4; i += 1) {
      fetchMock.mockResolvedValueOnce(
        mockResponse(driveErrorBody('rateLimitExceeded', 'Rate Limit Exceeded'), 403)
      );
    }

    const err = await makeProvider()
      .loadDiagram('d1')
      .catch((e: unknown) => e as DriveError);

    expect((err as DriveError).reason).toBe('rate-limit');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // The whole point: a healthy session keeps its valid token, and the user is
    // not asked to re-consent to a permission they never lost.
    expect(useAuthStore.getState().status).toBe('AUTHENTICATED');
    expect(useAuthStore.getState().accessToken).toBe('test-token');
  });

  test('an unrelated 403 (Drive API disabled) is neither', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        driveErrorBody('accessNotConfigured', 'Google Drive API has not been used…'),
        403
      )
    );

    const err = await makeProvider()
      .loadDiagram('d1')
      .catch((e: unknown) => e as DriveError);

    expect((err as DriveError).reason).toBe('unknown');
    expect((err as DriveError).message).toMatch(/has not been used/);
    expect(useAuthStore.getState().status).toBe('AUTHENTICATED');
  });

  test('a 401 still forces SESSION_EXPIRED (the 401 twin is unchanged)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(driveErrorBody('authError'), 401));

    const err = await makeProvider()
      .loadDiagram('d1')
      .catch((e: unknown) => e as DriveError);

    expect((err as DriveError).reason).toBe('session-expired');
    expect(useAuthStore.getState().status).toBe('SESSION_EXPIRED');
  });
});

// ---------------------------------------------------------------------------
// AUTH-06 — "no token" is not always "not signed in"
// ---------------------------------------------------------------------------
describe('a withheld token names its real condition', () => {
  test('DRIVE_ACCESS_REQUIRED reads as a scope problem, not a sign-in one', async () => {
    useAuthStore.setState({
      status: 'DRIVE_ACCESS_REQUIRED',
      accessToken: null,
      expiresAt: null
    });

    const err = await makeProvider()
      .loadDiagram('d1')
      .catch((e: unknown) => e as DriveError);

    expect((err as DriveError).reason).toBe('drive-scope-required');
    expect((err as DriveError).status).toBe(403);
    // The blocking dialog owns the recovery; the caller can suppress its own
    // surface rather than contradict it (ADR 0011 single-slot notifications).
    expect((err as DriveError).message).not.toMatch(/not signed in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a genuinely signed-out session still reads as one', async () => {
    useAuthStore.setState({
      status: 'UNAUTHENTICATED',
      accessToken: null,
      expiresAt: null
    });

    const err = await makeProvider()
      .loadDiagram('d1')
      .catch((e: unknown) => e as DriveError);

    expect((err as DriveError).status).toBe(401);
    expect((err as DriveError).message).toMatch(/not signed in/i);
  });
});

// ---------------------------------------------------------------------------
// AUTH-16 — per-account caches do not outlive the account
// ---------------------------------------------------------------------------
describe('per-account root cache', () => {
  test('signOut clears the in-memory root AND the localStorage copy', () => {
    const provider = makeProvider();
    localStorage.setItem(ROOT_CACHE_KEY, 'root-of-account-A');
    expect(provider.getCachedRootId()).toBe('root');

    useAuthStore.getState().signOut();

    expect(provider.getCachedRootId()).toBeNull();
    expect(localStorage.getItem(ROOT_CACHE_KEY)).toBeNull();
  });

  test("account B's first listing does not query account A's folder", async () => {
    const provider = makeProvider(); // rootFolderId = 'root' (account A)
    localStorage.setItem(ROOT_CACHE_KEY, 'root');

    useAuthStore.getState().signOut();
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      accessToken: 'token-b',
      expiresAt: Date.now() + 3600_000
    });

    // Marker discovery for B (the cache is gone, so probeRoot runs), then the
    // listing itself.
    fetchMock
      .mockResolvedValueOnce(mockResponse({ files: [{ id: 'root-of-account-B' }] }))
      .mockResolvedValueOnce(mockResponse({ files: [] }));

    await provider.listDiagrams(null);

    const queried = fetchMock.mock.calls.map(([url]) => String(url)).join('\n');
    expect(queried).not.toContain("'root' in parents");
    expect(queried).toContain('root-of-account-B');
  });
});
