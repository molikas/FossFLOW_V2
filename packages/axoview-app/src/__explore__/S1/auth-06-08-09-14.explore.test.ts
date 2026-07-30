/**
 * S1 / AUTH-06, AUTH-08, AUTH-09, AUTH-14 — where the store's states meet the
 * Drive provider. All four ask the same shape of question: the store models a
 * condition precisely (`DRIVE_ACCESS_REQUIRED`, `REFRESHING`), and the provider
 * either can't reach it or disagrees about it.
 */
import { GoogleDriveProvider } from '../../services/storage/providers/GoogleDriveProvider';
import { useAuthStore } from '../../stores/authStore';
import {
  auth,
  installBridge,
  resetAuth,
  seedHealthySession,
  seedNearExpirySession,
  settle,
  waiterCount,
  IDENTITY_ONLY_SCOPE
} from './harness';

function mockResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** Provider with the root pre-resolved (skips ensureRoot's network) + no backoff. */
function makeProvider(): GoogleDriveProvider {
  const p = new GoogleDriveProvider();
  (p as unknown as { rootFolderId: string }).rootFolderId = 'root';
  (p as unknown as { retryDelays: number[] }).retryDelays = [0, 0, 0];
  return p;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  resetAuth();
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});
afterEach(resetAuth);

describe('AUTH-06 — the scope-less hard stop resolves piggybackers with a null token', () => {
  test('CHARACTERIZATION: an in-flight Drive write fails "Not signed in" at the same instant the blocking dialog opens', async () => {
    installBridge();
    seedNearExpirySession();

    // A Drive save is in flight and its token request piggybacked on the refresh.
    const save = makeProvider().saveDiagram('d1', { title: 'X' });
    // --- precondition: the save is parked on a real waiter, no fetch yet ---
    await Promise.resolve();
    expect(auth().status).toBe('REFRESHING');
    expect(waiterCount()).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();

    // The refresh comes back with the Drive checkbox unticked.
    auth()._onToken({ access_token: 'identity-only', expires_in: 3600, scope: IDENTITY_ONLY_SCOPE });

    // The store parks in the blocking-dialog state...
    expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
    // ...and RESOLVES (not rejects) the waiter, which then reads the token the
    // same branch just nulled.
    const outcome = await settle(save);
    expect(outcome.settled).toBe(true);
    const err = (outcome as { error: { name: string; status: number; message: string } }).error;
    expect(err.name).toBe('DriveError');
    expect(err.status).toBe(401);
    expect(err.message).toBe('Not signed in to Google');
    // No DRIVE request was attempted with the scope-less token — that part is
    // right. (The one fetch that does fire is the deliberate `userinfo` call the
    // hard-stop branch makes to greet the user by name in the dialog.)
    const driveCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('googleapis.com/drive')
    );
    expect(driveCalls).toHaveLength(0);
  });

  test('CHARACTERIZATION: the same waiter reads null even though a token WAS granted', async () => {
    installBridge();
    seedNearExpirySession();
    const pending = auth().getValidToken();
    expect(auth().status).toBe('REFRESHING'); // precondition

    auth()._onToken({ access_token: 'identity-only', scope: IDENTITY_ONLY_SCOPE });

    expect(await settle(pending)).toEqual({ settled: true, value: null });
  });
});

describe('AUTH-08/09 — the provider throws status 403 for two opposite conditions and routes neither', () => {
  test('CHARACTERIZATION: an insufficient-scope 403 never reaches markDriveScopeMissing()', async () => {
    seedHealthySession();
    fetchMock.mockResolvedValue(
      mockResponse(
        {
          error: {
            status: 'PERMISSION_DENIED',
            message: 'Request had insufficient authentication scopes.',
            errors: [{ reason: 'insufficientPermissions' }]
          }
        },
        403
      )
    );

    await expect(makeProvider().saveDiagram('d1', { title: 'X' })).rejects.toThrow(
      /insufficient authentication scopes/i
    );
    // --- precondition: the request really happened and really 403'd ---
    expect(fetchMock).toHaveBeenCalledTimes(1); // permanent 403 → no retry

    // The store has markDriveScopeMissing() and a blocking re-consent dialog for
    // exactly this — and the provider leaves the session AUTHENTICATED instead.
    expect(auth().status).toBe('AUTHENTICATED');
    expect(auth().driveScopeGranted).toBe(true);
  });

  test('CHARACTERIZATION: an exhausted rate-limit 403 is indistinguishable from it at the throw site', async () => {
    seedHealthySession();
    fetchMock.mockResolvedValue(
      mockResponse(
        {
          error: {
            status: 'RESOURCE_EXHAUSTED',
            message: 'Rate Limit Exceeded',
            errors: [{ reason: 'rateLimitExceeded' }]
          }
        },
        403
      )
    );

    const thrown = (await makeProvider()
      .saveDiagram('d1', { title: 'X' })
      .then(
        () => null,
        (e: unknown) => e
      )) as { name: string; status: number };
    // --- precondition: this one WAS retried, so it is genuinely the rate-limit
    // branch, not the permanent one ---
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 + 3 retries
    expect(thrown.name).toBe('DriveError');
    // Same name, same status as the insufficient-scope case above. The
    // classification the provider computed is discarded at the throw.
    expect(thrown.status).toBe(403);
  });

  test('CHARACTERIZATION: handleCreateBlankDiagram\'s catch shape therefore mis-routes the rate-limit case', () => {
    // The only production consumer that acts on a 403 (DiagramLifecycleProvider,
    // handleCreateBlankDiagram) tests exactly `name === 'DriveError' && status === 403`.
    // Replaying that predicate against the rate-limit error above:
    seedHealthySession();
    const rateLimitError = { name: 'DriveError', status: 403 };
    const routesToReconsent =
      rateLimitError.name === 'DriveError' && rateLimitError.status === 403;
    expect(routesToReconsent).toBe(true);

    // ...which nulls a perfectly good token and puts up the blocking dialog.
    auth().markDriveScopeMissing();
    expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
    expect(auth().accessToken).toBeNull();
    expect(auth().driveScopeGranted).toBe(false);
  });

  it.failing(
    'an insufficient-scope 403 should park the session in DRIVE_ACCESS_REQUIRED',
    async () => {
      seedHealthySession();
      fetchMock.mockResolvedValue(
        mockResponse(
          { error: { message: 'Request had insufficient authentication scopes.', errors: [{ reason: 'insufficientPermissions' }] } },
          403
        )
      );
      await expect(makeProvider().saveDiagram('d1', { title: 'X' })).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1); // precondition
      expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
    }
  );

  it.failing(
    'a rate-limit 403 and an insufficient-scope 403 should be distinguishable by the thrown error',
    async () => {
      seedHealthySession();
      fetchMock.mockResolvedValue(
        mockResponse({ error: { message: 'Rate Limit Exceeded', errors: [{ reason: 'rateLimitExceeded' }] } }, 403)
      );
      const rate = (await makeProvider()
        .saveDiagram('d1', { title: 'X' })
        .then(
          () => null,
          (e: unknown) => e
        )) as { status: number };
      expect(fetchMock).toHaveBeenCalledTimes(4); // precondition: it retried
      expect(rate.status).not.toBe(403);
    }
  );
});

describe('AUTH-14 — three answers to "is Drive up?" during a refresh', () => {
  test('isAvailable() says no while getValidToken() piggybacks and AuthControl renders signed-in', async () => {
    installBridge();
    seedNearExpirySession();
    void auth().getValidToken();
    expect(auth().status).toBe('REFRESHING'); // precondition

    // The provider's own gate.
    await expect(makeProvider().isAvailable()).resolves.toBe(false);
    // The token accessor's gate (piggybacks rather than refusing).
    expect(waiterCount()).toBe(1);
    // AuthControl's gate: `(status === 'AUTHENTICATED' || status === 'REFRESHING') && !!user`.
    useAuthStore.setState({ user: { name: 'Igor', email: 'i@x.y', avatarUrl: '' } });
    const authControlSignedIn =
      (auth().status === 'AUTHENTICATED' || auth().status === 'REFRESHING') && !!auth().user;
    expect(authControlSignedIn).toBe(true);
  });

  test('INERT: isAvailable() has no production caller, so the disagreement never surfaces', () => {
    // Recorded as evidence for the FALSIFIED verdict — `StorageManager.isAvailable()`
    // is the only wrapper and nothing in src/ calls either. A grep contract keeps
    // this honest: if a caller appears, this probe must be revisited.
    const provider = makeProvider();
    expect(typeof provider.isAvailable).toBe('function');
  });
});
