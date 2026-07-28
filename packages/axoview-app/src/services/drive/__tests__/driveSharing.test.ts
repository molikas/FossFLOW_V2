import {
  drivePreviewUrl,
  getFileShareMeta,
  getAccessSummary,
  getAccessOverview,
  listPermissions,
  setAnyoneWithLink,
  addPersonPermission,
  removePermission,
  DriveShareError
} from '../driveSharing';
import { useAuthStore } from '../../../stores/authStore';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

let fetchMock: jest.Mock;

function bodyOf(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit | undefined;
  return init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
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
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

describe('drivePreviewUrl', () => {
  // jsdom origin is http://localhost; APP_BASENAME is '/app' (PUBLIC_URL unset).
  test('builds origin + APP_BASENAME + /display/drive/<fileId>', () => {
    expect(drivePreviewUrl('file-1')).toBe('http://localhost/app/display/drive/file-1');
  });

  test('appends ?resourceKey= only when non-null', () => {
    expect(drivePreviewUrl('file-1', 'rk-9')).toBe(
      'http://localhost/app/display/drive/file-1?resourceKey=rk-9'
    );
    expect(drivePreviewUrl('file-1', null)).toBe('http://localhost/app/display/drive/file-1');
  });

  test('URL-encodes the resourceKey', () => {
    expect(drivePreviewUrl('f', 'a/b&c')).toBe(
      'http://localhost/app/display/drive/f?resourceKey=a%2Fb%26c'
    );
  });
});

describe('getFileShareMeta', () => {
  test('requests webViewLink,resourceKey with the auth token and maps nulls', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ webViewLink: 'https://drive.google.com/file/d/f1/view' })
    );
    await expect(getFileShareMeta('f1')).resolves.toEqual({
      webViewLink: 'https://drive.google.com/file/d/f1/view',
      resourceKey: null
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/files/f1?fields=webViewLink,resourceKey');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      'Bearer test-token'
    );
  });

  test('throws a DriveShareError surfacing the API message on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ error: { message: 'File not found' } }, 404));
    await expect(getFileShareMeta('f1')).rejects.toMatchObject({
      name: 'DriveShareError',
      status: 404,
      message: 'File not found'
    });
  });
});

describe('listPermissions', () => {
  test('drains nextPageToken and returns the full mapped list', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          permissions: [{ id: 'owner', type: 'user', role: 'owner', emailAddress: 'me@x.com' }],
          nextPageToken: 'p2'
        })
      )
      .mockResolvedValueOnce(
        mockResponse({ permissions: [{ id: 'a1', type: 'anyone', role: 'reader' }] })
      );
    const perms = await listPermissions('f1');
    expect(perms.map((p) => p.id)).toEqual(['owner', 'a1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('pageToken=p2');
  });
});

describe('getAccessSummary', () => {
  test("maps a type:'anyone' permission → anyone-with-link", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        permissions: [
          { id: 'o', type: 'user', role: 'owner' },
          { id: 'a', type: 'anyone', role: 'reader' }
        ]
      })
    );
    await expect(getAccessSummary('f1')).resolves.toBe('anyone-with-link');
    expect(fetchMock.mock.calls[0][0]).toContain('/files/f1/permissions');
  });

  test('maps user-only permissions → restricted', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ permissions: [{ id: 'o', type: 'user', role: 'owner' }] })
    );
    await expect(getAccessSummary('f1')).resolves.toBe('restricted');
  });

  test("drains pages — an 'anyone' grant on page 2 → anyone-with-link", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({ permissions: [{ id: 'o', type: 'user', role: 'owner' }], nextPageToken: 'p2' })
      )
      .mockResolvedValueOnce(mockResponse({ permissions: [{ id: 'a', type: 'anyone', role: 'reader' }] }));
    await expect(getAccessSummary('f1')).resolves.toBe('anyone-with-link');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getAccessOverview', () => {
  test('returns the summary and the count of named non-owner people', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        permissions: [
          { id: 'o', type: 'user', role: 'owner' },
          { id: 'a', type: 'anyone', role: 'reader' },
          { id: 'p1', type: 'user', role: 'reader', emailAddress: 'a@x.com' },
          { id: 'p2', type: 'group', role: 'writer', emailAddress: 'g@x.com' }
        ]
      })
    );
    await expect(getAccessOverview('f1')).resolves.toEqual({
      summary: 'anyone-with-link',
      peopleCount: 2
    });
  });

  test('restricted with no extra people → peopleCount 0', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ permissions: [{ id: 'o', type: 'user', role: 'owner' }] })
    );
    await expect(getAccessOverview('f1')).resolves.toEqual({
      summary: 'restricted',
      peopleCount: 0
    });
  });
});

describe('setAnyoneWithLink', () => {
  test('enable → POST {type:anyone, role:reader}', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'anyoneWithLink' }));
    await setAnyoneWithLink('f1', true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/files/f1/permissions');
    expect((init as RequestInit).method).toBe('POST');
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ role: 'reader', type: 'anyone' });
  });

  test('disable → lists then DELETEs every anyone permission', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          permissions: [
            { id: 'o', type: 'user', role: 'owner' },
            { id: 'anyoneWithLink', type: 'anyone', role: 'reader' }
          ]
        })
      )
      .mockResolvedValueOnce(mockResponse(null, 204));
    await setAnyoneWithLink('f1', false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [delUrl, delInit] = fetchMock.mock.calls[1];
    expect(delUrl).toContain('/permissions/anyoneWithLink');
    expect((delInit as RequestInit).method).toBe('DELETE');
  });
});

describe('addPersonPermission', () => {
  test('POSTs {type:user, role, emailAddress} with sendNotificationEmail', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'p1' }));
    await addPersonPermission('f1', 'jane@example.com', 'reader');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/files/f1/permissions?sendNotificationEmail=true');
    expect((init as RequestInit).method).toBe('POST');
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      role: 'reader',
      type: 'user',
      emailAddress: 'jane@example.com'
    });
  });

  test('appends the URL-encoded emailMessage when notifying', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'p1' }));
    await addPersonPermission('f1', 'jane@example.com', 'reader', true, 'come see this: https://x/y');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('sendNotificationEmail=true');
    expect(url).toContain('emailMessage=come%20see%20this%3A%20https%3A%2F%2Fx%2Fy');
  });

  test('omits emailMessage when not sending a notification', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'p1' }));
    await addPersonPermission('f1', 'jane@example.com', 'reader', false, 'ignored');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('sendNotificationEmail=false');
    expect(url).not.toContain('emailMessage');
  });

  test('surfaces the Google error message via DriveShareError', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: { message: 'The user nope@x.com could not be found.' } }, 400)
    );
    await expect(addPersonPermission('f1', 'nope@x.com', 'writer')).rejects.toMatchObject({
      name: 'DriveShareError',
      status: 400,
      message: 'The user nope@x.com could not be found.'
    });
  });
});

// Owner repro 2026-07-28 (corporate Workspace account): the verbatim 400 body
// Drive returns when domain policy forbids link sharing. Google's message is an
// EMPTY user message, so surfacing it showed the user `Bad Request. User
// message: ""`. The cause lives only in errors[0].reason.
describe('policy rejection with an empty user message', () => {
  const POLICY_400 = {
    error: {
      code: 400,
      message: 'Bad Request. User message: ""',
      errors: [
        {
          message: 'Bad Request. User message: ""',
          domain: 'global',
          reason: 'publishOutNotPermitted'
        }
      ]
    }
  };

  test('carries reason and does NOT surface the empty user message', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(POLICY_400, 400));
    await expect(setAnyoneWithLink('f1', true)).rejects.toMatchObject({
      name: 'DriveShareError',
      status: 400,
      reason: 'publishOutNotPermitted'
    });
  });

  test('falls back to our own message rather than Google\'s empty one', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(POLICY_400, 400));
    const err = await setAnyoneWithLink('f1', true).then(
      () => null,
      (e: Error) => e
    );
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).not.toContain('User message');
    expect(err!.message).toContain('permissions.create(anyone) failed');
  });
});

describe('removePermission', () => {
  test('DELETEs the permission id', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(null, 204));
    await removePermission('f1', 'p1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/files/f1/permissions/p1');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  test('treats a 404 (already gone) as success', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ error: { message: 'not found' } }, 404));
    await expect(removePermission('f1', 'p1')).resolves.toBeUndefined();
  });

  test('throws on a real failure', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ error: { message: 'insufficient' } }, 403));
    await expect(removePermission('f1', 'p1')).rejects.toMatchObject({ status: 403 });
  });
});

describe('signed out', () => {
  test('every call rejects before touching the network', async () => {
    useAuthStore.setState({
      status: 'UNAUTHENTICATED',
      accessToken: null,
      expiresAt: null,
      user: null,
      _requestToken: null,
      _revoke: null,
      _waiters: []
    });
    await expect(listPermissions('f1')).rejects.toBeInstanceOf(DriveShareError);
    await expect(addPersonPermission('f1', 'a@b.com', 'reader')).rejects.toBeInstanceOf(
      DriveShareError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
