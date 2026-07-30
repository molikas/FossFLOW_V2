/**
 * S1 / AUTH-12, AUTH-13, AUTH-15, AUTH-16 — what survives a state transition
 * that was supposed to forget it.
 *
 * The "reload" in AUTH-12/13 is simulated with `jest.isolateModules`: the profile
 * hint is read exactly once, at module-init (`user: loadProfileHint()`), so a
 * fresh module registry is a faithful stand-in for a fresh page load.
 */
import { GoogleDriveProvider } from '../../services/storage/providers/GoogleDriveProvider';
import type { useAuthStore as UseAuthStore } from '../../stores/authStore';
import {
  auth,
  installBridge,
  resetAuth,
  seedHealthySession,
  IDENTITY_ONLY_SCOPE
} from './harness';

const PROFILE_HINT_KEY = 'axoview-google-profile';
const ROOT_CACHE_KEY = 'axoview-drive-root';

function mockResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** A fresh page load: re-runs the store module, so `loadProfileHint()` runs again. */
function bootFreshStore(): typeof UseAuthStore {
  let store: typeof UseAuthStore | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    store = (require('../../stores/authStore') as { useAuthStore: typeof UseAuthStore })
      .useAuthStore;
  });
  if (!store) throw new Error('rig: store module did not load');
  return store;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  resetAuth();
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});
afterEach(resetAuth);

describe('AUTH-12 — markDriveScopeMissing() keeps the hint its _onToken twin deletes', () => {
  test('CHARACTERIZATION: a mid-session scope revocation stays "remembered", so a reload walks straight back into the dialog', () => {
    localStorage.setItem(
      PROFILE_HINT_KEY,
      JSON.stringify({ name: 'Igor', email: 'i@x.y', avatarUrl: '' })
    );
    seedHealthySession();
    auth()._setUser({ name: 'Igor', email: 'i@x.y', avatarUrl: '' });
    // --- precondition: a healthy remembered session ---
    expect(auth().status).toBe('AUTHENTICATED');
    expect(localStorage.getItem(PROFILE_HINT_KEY)).toContain('i@x.y');

    // A Drive 403 for insufficient scopes (scope revoked out-of-band).
    auth().markDriveScopeMissing();
    expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
    // The hint survives — where `_onToken`'s identical hard stop calls
    // clearProfileHint() precisely so "a reload lands on a clean signed-out
    // state instead of looping back into this prompt".
    expect(localStorage.getItem(PROFILE_HINT_KEY)).toContain('i@x.y');

    // Reload: the fresh store is remembered and UNAUTHENTICATED, which is exactly
    // the state AuthBridge's boot effect re-arms the silent reconnect from.
    const fresh = bootFreshStore();
    expect(fresh.getState().user?.email).toBe('i@x.y');
    expect(fresh.getState().status).toBe('UNAUTHENTICATED');
    const bridge = { requestToken: jest.fn(), revoke: jest.fn() };
    fresh.getState()._setBridge(bridge);
    void fresh.getState().attemptSilentReconnect();
    expect(bridge.requestToken).toHaveBeenCalledWith({ prompt: '', hint: 'i@x.y' });
    // The scope is still missing, so the reconnect lands in the same dead state.
    fresh.getState()._onToken({ access_token: 'still-identity-only', scope: IDENTITY_ONLY_SCOPE });
    expect(fresh.getState().status).toBe('DRIVE_ACCESS_REQUIRED');
  });

  test('CONTROL: the _onToken twin on the same condition DOES forget the account', async () => {
    localStorage.setItem(
      PROFILE_HINT_KEY,
      JSON.stringify({ name: 'Igor', email: 'i@x.y', avatarUrl: '' })
    );
    installBridge();
    auth()._setUser({ name: 'Igor', email: 'i@x.y', avatarUrl: '' });
    const p = auth().signIn();
    expect(auth().status).toBe('AUTHENTICATING'); // precondition

    auth()._onToken({ access_token: 'identity-only', scope: IDENTITY_ONLY_SCOPE });
    await p;

    expect(auth().status).toBe('DRIVE_ACCESS_REQUIRED');
    expect(localStorage.getItem(PROFILE_HINT_KEY)).toBeNull();
  });

  it.failing('markDriveScopeMissing() should clear the profile hint like its twin', () => {
    localStorage.setItem(
      PROFILE_HINT_KEY,
      JSON.stringify({ name: 'Igor', email: 'i@x.y', avatarUrl: '' })
    );
    seedHealthySession();
    expect(localStorage.getItem(PROFILE_HINT_KEY)).not.toBeNull(); // precondition

    auth().markDriveScopeMissing();

    expect(localStorage.getItem(PROFILE_HINT_KEY)).toBeNull();
  });
});

describe('AUTH-13 — a hint with no usable email arms a reconnect that cannot stay silent', () => {
  test('CHARACTERIZATION: {name: ""} passes validation and yields a truthy, unnameable user', () => {
    localStorage.setItem(PROFILE_HINT_KEY, JSON.stringify({ name: '', email: '', avatarUrl: '' }));
    const fresh = bootFreshStore();

    // Validation only type-checks `name`, so this is a "remembered" account.
    expect(fresh.getState().user).toEqual({ name: '', email: '', avatarUrl: '' });
    // AuthControl's predicate: `!!user && (SESSION_EXPIRED || UNAUTHENTICATED)`.
    const needsReconnect =
      !!fresh.getState().user &&
      (fresh.getState().status === 'SESSION_EXPIRED' ||
        fresh.getState().status === 'UNAUTHENTICATED');
    expect(needsReconnect).toBe(true);
    // ...rendering an avatar whose initial falls back to '?'.
    expect((fresh.getState().user?.name || '?').charAt(0).toUpperCase()).toBe('?');
  });

  test('CHARACTERIZATION: an email-less hint fires the hint-less prompt:"" the login_hint exists to avoid', () => {
    // Reachable without corruption: fetchUserInfo persists `email: data.email || ''`,
    // so any userinfo response without an email writes exactly this hint.
    localStorage.setItem(
      PROFILE_HINT_KEY,
      JSON.stringify({ name: 'Igor', email: '', avatarUrl: '' })
    );
    const fresh = bootFreshStore();
    expect(fresh.getState().user?.name).toBe('Igor'); // precondition

    const bridge = { requestToken: jest.fn(), revoke: jest.fn() };
    fresh.getState()._setBridge(bridge);
    void fresh.getState().attemptSilentReconnect();

    expect(fresh.getState().status).toBe('RECONNECTING');
    // No `hint` key — the documented multi-account "interaction required" failure.
    expect(bridge.requestToken).toHaveBeenCalledWith({ prompt: '' });
  });

  test('CONTROL: non-string / absent name IS rejected, so validation is not simply absent', () => {
    localStorage.setItem(PROFILE_HINT_KEY, JSON.stringify({ email: 'i@x.y' }));
    expect(bootFreshStore().getState().user).toBeNull();
    localStorage.setItem(PROFILE_HINT_KEY, JSON.stringify({ name: 42 }));
    expect(bootFreshStore().getState().user).toBeNull();
  });
});

describe('AUTH-15 — ADR 0035 rule 1 across all four storage sinks, not just localStorage.setItem', () => {
  test('a full grant + getValidToken + signOut writes the token to no storage sink', async () => {
    const SECRET = 'super-secret-access-token';
    const cookieBefore = document.cookie;
    installBridge();

    const p = auth().signIn();
    expect(auth().status).toBe('AUTHENTICATING'); // precondition
    auth()._onToken({ access_token: SECRET, expires_in: 3600 });
    await p;
    expect(auth().accessToken).toBe(SECRET); // precondition: the token IS held
    await auth().getValidToken();
    auth().signOut();

    const dump = (s: Storage) =>
      Object.keys(s)
        .map((k) => `${k}=${s.getItem(k)}`)
        .join('|');
    expect(dump(localStorage)).not.toContain(SECRET);
    expect(dump(sessionStorage)).not.toContain(SECRET);
    expect(document.cookie).toBe(cookieBefore);
    expect(document.cookie).not.toContain(SECRET);
    // No IndexedDB database is opened at all (jsdom has no indexedDB by default;
    // a store that used it would have thrown on the missing global first).
    expect((globalThis as { indexedDB?: unknown }).indexedDB).toBeUndefined();
  });
});

describe('AUTH-16 — the Drive root cache outlives the account that owns it', () => {
  test('CHARACTERIZATION: after signOut the next account inherits the previous account\'s root id, unvalidated', async () => {
    const provider = new GoogleDriveProvider();
    (provider as unknown as { retryDelays: number[] }).retryDelays = [0, 0, 0];
    localStorage.setItem(ROOT_CACHE_KEY, 'root-of-account-A');
    seedHealthySession('token-A');

    // Account A resolves its root: cache hit + folderExists() validation.
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'root-of-account-A', trashed: false }));
    await expect(provider.hasConfiguredRoot()).resolves.toBe(true);
    // --- precondition: the id is now held in MEMORY, not just localStorage ---
    expect(provider.getCachedRootId()).toBe('root-of-account-A');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Sign out. The hint goes; neither cache does.
    installBridge();
    auth().signOut();
    expect(localStorage.getItem(ROOT_CACHE_KEY)).toBe('root-of-account-A');
    expect(provider.getCachedRootId()).toBe('root-of-account-A');

    // Account B signs in on the same page — StorageManager holds ONE provider
    // instance for the page lifetime, so this is the same object.
    seedHealthySession('token-B');
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(mockResponse({ files: [] }));
    // `listDiagrams(null)` is the file tree's "root folder contents" call.
    const listed = await provider.listDiagrams(null);

    // `resolveRoot()` short-circuits on the in-memory id: no folderExists(), no
    // marker query — account B's tree is read out of account A's folder.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain(
      "'root-of-account-A' in parents"
    );
    expect(
      (fetchMock.mock.calls[0][1] as { headers: Record<string, string> } | undefined)?.headers
        ?.Authorization
    ).toBe('Bearer token-B');
    // ...and returns an empty tree rather than account B's own diagrams.
    expect(listed).toEqual([]);

    // The write path is worse: ensureRoot() takes the same short-circuit, so a
    // new diagram is POSTed with account A's folder as its parent.
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'new-file' }));
    await provider.createDiagram({ title: 'B diagram' }, null);
    const body = String((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toContain('"parents":["root-of-account-A"]');
  });

  it.failing('signOut() should drop the per-account Drive root caches', () => {
    const provider = new GoogleDriveProvider();
    localStorage.setItem(ROOT_CACHE_KEY, 'root-of-account-A');
    (provider as unknown as { rootFolderId: string }).rootFolderId = 'root-of-account-A';
    seedHealthySession('token-A');
    installBridge();
    expect(provider.getCachedRootId()).toBe('root-of-account-A'); // precondition

    auth().signOut();

    expect(localStorage.getItem(ROOT_CACHE_KEY)).toBeNull();
  });
});
