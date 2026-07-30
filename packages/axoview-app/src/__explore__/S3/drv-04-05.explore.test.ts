/**
 * S3 / DRV-04, DRV-05 — the ACL layer's blind spots.
 *
 * DRV-04 is an enum-coverage question: `DrivePermission.type` declares four
 * values and the summariser only reasons about two.
 * DRV-05 is a partial-failure question inside a serial delete loop.
 */
import {
  getAccessOverview,
  getAccessSummary,
  setAnyoneWithLink,
  DriveShareError,
  type DrivePermission
} from '../../services/drive/driveSharing';
import { useAuthStore } from '../../stores/authStore';

function signedIn() {
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: 'tok',
    expiresAt: Date.now() + 3600_000,
    driveScopeGranted: true,
    _waiters: []
  });
}

function permsResponse(permissions: DrivePermission[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ permissions })
  } as unknown as Response;
}

let fetchMock: jest.Mock;
beforeEach(() => {
  signedIn();
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});
afterEach(() => {
  useAuthStore.setState({ status: 'UNAUTHENTICATED', accessToken: null, _waiters: [] });
});

const OWNER: DrivePermission = {
  id: 'p-owner',
  type: 'user',
  role: 'owner',
  emailAddress: 'me@corp.example'
};

describe('DRV-04 — a domain-shared file reports as restricted with nobody on it', () => {
  test('CHARACTERIZATION: type:"domain" is invisible to both the summary and the count', async () => {
    const DOMAIN: DrivePermission = {
      id: 'p-domain',
      type: 'domain',
      role: 'reader',
      displayName: 'corp.example'
    };
    fetchMock.mockResolvedValue(permsResponse([OWNER, DOMAIN]));

    const overview = await getAccessOverview('file-1');

    // --- precondition: the permission really was returned and parsed ---
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/permissions');

    // Everyone at corp.example can open the link; the UI is told otherwise.
    expect(overview.summary).toBe('restricted');
    expect(overview.peopleCount).toBe(0);
    await expect(getAccessSummary('file-1')).resolves.toBe('restricted');
  });

  test('CHARACTERIZATION: a group grant IS counted, so the omission is specific to domain', async () => {
    // Establishes that the filter is not simply broken — `group` is handled.
    const GROUP: DrivePermission = {
      id: 'p-group',
      type: 'group',
      role: 'reader',
      emailAddress: 'team@corp.example'
    };
    fetchMock.mockResolvedValue(permsResponse([OWNER, GROUP]));
    const overview = await getAccessOverview('file-1');
    expect(overview.peopleCount).toBe(1);
    expect(overview.summary).toBe('restricted');
  });

  test('CHARACTERIZATION: the toolbar and dialog copy predicates both read "not shared" from it', async () => {
    // The consumer half. Both copy paths compute sharedness the same way, so a
    // domain-shared file gets the "only people with access can open it" warning.
    const DOMAIN: DrivePermission = { id: 'p-domain', type: 'domain', role: 'reader' };
    fetchMock.mockResolvedValue(permsResponse([OWNER, DOMAIN]));
    const overview = await getAccessOverview('file-1');

    // AppToolbar.handleQuickCopyLink
    const toolbarShared =
      overview.summary === 'anyone-with-link' || (overview.peopleCount ?? 0) > 0;
    expect(toolbarShared).toBe(false);
    // DriveShareManageDialog.handleCopy, over the same permission list
    const perms = [OWNER, DOMAIN];
    const isPublic = perms.some((p) => p.type === 'anyone');
    const hasPeople = perms.some(
      (p) => (p.type === 'user' || p.type === 'group') && p.role !== 'owner'
    );
    expect(isPublic || hasPeople).toBe(false);
  });

  test('CONTROL: an anyone grant IS detected, so the summariser works for the types it knows', async () => {
    fetchMock.mockResolvedValue(
      permsResponse([OWNER, { id: 'p-any', type: 'anyone', role: 'reader' }])
    );
    await expect(getAccessSummary('file-1')).resolves.toBe('anyone-with-link');
  });
});

describe('DRV-05 — revoking link access is a serial loop with no rollback', () => {
  test('CHARACTERIZATION: a mid-loop failure leaves the file still link-readable', async () => {
    // Drive can carry more than one anyone-permission (e.g. a legacy
    // `anyoneWithLink` alongside a newer one); the module deletes them serially.
    const anyone1: DrivePermission = { id: 'p-any-1', type: 'anyone', role: 'reader' };
    const anyone2: DrivePermission = { id: 'p-any-2', type: 'anyone', role: 'reader' };
    const deleted: string[] = [];
    fetchMock.mockImplementation(async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      if (init?.method === 'DELETE') {
        const id = u.split('/permissions/')[1];
        if (id === 'p-any-2') {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: { message: 'Backend Error' } })
          } as unknown as Response;
        }
        deleted.push(id);
        return { ok: true, status: 204, json: async () => ({}) } as unknown as Response;
      }
      return permsResponse([OWNER, anyone1, anyone2]);
    });

    await expect(setAnyoneWithLink('file-1', false)).rejects.toBeInstanceOf(DriveShareError);

    // --- the partial state: one of the two anyone grants is gone, one remains ---
    expect(deleted).toEqual(['p-any-1']);
    // The caller only learns "it failed" — nothing says the file is STILL public,
    // and nothing rolled the first delete back.
  });

  test('CHARACTERIZATION: the failure is raised before any caller can re-read, so a UI showing "restricted" optimistically would be wrong', async () => {
    // `runAction` in DriveShareManageDialog does `await action(); await refresh()`
    // — on a throw the refresh is skipped, so the list the user sees is the one
    // from BEFORE the partial delete.
    const anyone: DrivePermission = { id: 'p-any', type: 'anyone', role: 'reader' };
    let listCalls = 0;
    fetchMock.mockImplementation(async (url: unknown, init?: { method?: string }) => {
      if (init?.method === 'DELETE') {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: { message: 'Insufficient permission' } })
        } as unknown as Response;
      }
      listCalls++;
      return permsResponse([OWNER, anyone]);
    });

    await expect(setAnyoneWithLink('file-1', false)).rejects.toBeInstanceOf(DriveShareError);
    expect(listCalls).toBe(1); // the list ran once, inside setAnyoneWithLink
  });

  test('CONTROL: the happy path deletes every anyone permission', async () => {
    const deleted: string[] = [];
    fetchMock.mockImplementation(async (url: unknown, init?: { method?: string }) => {
      if (init?.method === 'DELETE') {
        deleted.push(String(url).split('/permissions/')[1]);
        return { ok: true, status: 204, json: async () => ({}) } as unknown as Response;
      }
      return permsResponse([
        OWNER,
        { id: 'p-any-1', type: 'anyone', role: 'reader' },
        { id: 'p-any-2', type: 'anyone', role: 'reader' }
      ]);
    });
    await setAnyoneWithLink('file-1', false);
    expect(deleted).toEqual(['p-any-1', 'p-any-2']);
  });
});
