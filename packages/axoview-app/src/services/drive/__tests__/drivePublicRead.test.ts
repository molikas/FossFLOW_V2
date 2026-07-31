import { readDriveDisplayFile } from '../drivePublicRead';
import { useAuthStore } from '../../../stores/authStore';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

let fetchMock: jest.Mock;

/**
 * A file id of the shape Drive actually issues. S3/DRV-12 added a client-side
 * check (the same `/^[A-Za-z0-9_-]{10,120}$/` the worker's proxy applies), so a
 * toy id like `'fid'` is now correctly refused as `bad-link` before any request
 * — which is the point of that fix, and why these fixtures are realistic.
 */
const FID = '1AbCdEfGhIjKlMnOpQrStUvWxYz09_-x';

function signedIn(): void {
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: 'test-token',
    expiresAt: Date.now() + 3600_000,
    user: null,
    _requestToken: null,
    _revoke: null,
    _waiters: []
  });
}

function signedOut(): void {
  useAuthStore.setState({
    status: 'UNAUTHENTICATED',
    accessToken: null,
    expiresAt: null,
    user: null,
    _requestToken: null,
    _revoke: null,
    _waiters: []
  });
}

function headersOf(call: unknown[]): Record<string, string> {
  return ((call[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  signedOut();
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

describe('readDriveDisplayFile — ladder ordering', () => {
  test('public proxy read succeeds → returns data without touching the token rung', async () => {
    const doc = { title: 'Public', items: [] };
    fetchMock.mockResolvedValueOnce(mockResponse(doc));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: true
    });
    expect(result).toEqual({ ok: true, data: doc });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    // Rung 1 goes to OUR server proxy — the API key never appears client-side.
    expect(url).toContain(`/api/public/drive/${FID}`);
    expect(url).not.toContain('key=');
    expect(url).not.toContain('googleapis.com');
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBeUndefined();
  });

  test('failed proxy read falls through to the token read (proxy first, Bearer second)', async () => {
    signedIn();
    const doc = { title: 'Granted' };
    fetchMock
      .mockResolvedValueOnce(mockResponse({ error: 'not-public' }, 404))
      .mockResolvedValueOnce(mockResponse(doc));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: true
    });
    expect(result).toEqual({ ok: true, data: doc });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain(`/api/public/drive/${FID}`);
    expect(fetchMock.mock.calls[1][0]).toContain('googleapis.com');
    expect(fetchMock.mock.calls[1][0]).not.toContain('/api/public/');
    expect(headersOf(fetchMock.mock.calls[1]).Authorization).toBe('Bearer test-token');
  });

  test('publicPreview false skips rung 1 — token read is the first fetch', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ title: 'Own' }));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: false
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('googleapis.com');
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBe('Bearer test-token');
  });

  test('afterGrant skips the public proxy rung (a just-granted file is private)', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ title: 'Granted' }));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: true,
      afterGrant: true
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('googleapis.com');
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBe('Bearer test-token');
  });

  // S3/DRV-02: these four used to collapse into one `not-found`, so the gate
  // rendered one sentence for four different situations — two of which it did
  // not describe, and one of which a viewer fixes by waiting a moment.
  test('proxy 410 (trashed) → gone, never falls to the token rung', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'gone' }, 410));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: true
    });
    expect(result).toEqual({ ok: false, reason: 'gone' });
    // Signed in, so a fall-through would make a 2nd (token) call — assert it didn't.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(`/api/public/drive/${FID}`);
  });

  test('proxy 413 (too-large public file) → too-large, no token rung', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'too-large' }, 413));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: true
    });
    expect(result).toEqual({ ok: false, reason: 'too-large' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // S3/DRV-12: a truncated or mistyped id used to walk the viewer through
  // "sign in with Google" and then "open with Google Drive access" for an id
  // Drive itself rejects as malformed — neither step could ever work.
  test('a malformed file id is refused before any request', async () => {
    signedIn();
    const result = await readDriveDisplayFile({
      fileId: 'too-short',
      resourceKey: null,
      publicPreview: true
    });
    expect(result).toEqual({ ok: false, reason: 'bad-link' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a proxy 400 (bad-file-id) is terminal, not a sign-in prompt', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'bad-file-id' }, 400));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: true
    });
    expect(result).toEqual({ ok: false, reason: 'bad-link' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('proxy 503 (transient) → transient/Retry for an ANONYMOUS viewer, never the sign-in gate', async () => {
    // Signed out: pre-fix, a transient outage on a public file wrongly demanded
    // sign-in (which cannot help). Now it maps to Retry without a token rung.
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'upstream-error' }, 503));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: true
    });
    expect(result).toEqual({ ok: false, reason: 'transient' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('publicPreview false + signed out → needs-signin with zero network calls', async () => {
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: false
    });
    expect(result).toEqual({ ok: false, reason: 'needs-signin' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('readDriveDisplayFile — resourceKey', () => {
  test('rides the proxy URL on rung 1 and the header on the token rung', async () => {
    signedIn();
    fetchMock
      .mockResolvedValueOnce(mockResponse({ error: 'not-public' }, 404))
      .mockResolvedValueOnce(mockResponse({ title: 'X' }));
    await readDriveDisplayFile({
      fileId: FID,
      resourceKey: 'rk-1',
      publicPreview: true
    });
    expect(fetchMock.mock.calls[0][0]).toContain('resourceKey=rk-1');
    expect(headersOf(fetchMock.mock.calls[1])['X-Goog-Drive-Resource-Keys']).toBe(`${FID}/rk-1`);
  });

  test('absent → no resourceKey on the proxy URL nor the token header', async () => {
    signedIn();
    fetchMock
      .mockResolvedValueOnce(mockResponse({ error: 'not-public' }, 404))
      .mockResolvedValueOnce(mockResponse({ title: 'X' }));
    await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: true
    });
    expect(fetchMock.mock.calls[0][0]).not.toContain('resourceKey=');
    expect(headersOf(fetchMock.mock.calls[1])['X-Goog-Drive-Resource-Keys']).toBeUndefined();
  });
});

describe('readDriveDisplayFile — failure mapping', () => {
  test('token read 403 → needs-grant (per-file Picker grant missing)', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'appNotAuthorizedToFile' }, 403));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: false
    });
    expect(result).toEqual({ ok: false, reason: 'needs-grant' });
  });

  test('token read 404 → needs-grant (drive.file hides ungranted files)', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'notFound' }, 404));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: false
    });
    expect(result).toEqual({ ok: false, reason: 'needs-grant' });
  });

  // DRV-01 + DRV-02: post-grant is not terminal. Drive grants take a moment to
  // register — the ladder's own doc comment says drive.file "hides files until
  // the Picker grant registers" — so the post-Picker retry routinely sees the
  // pre-Picker answer. It gets its own reason, and the gate offers a retry.
  test('404 after the Picker grant → grant-not-registered (retryable)', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'notFound' }, 404));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: false,
      afterGrant: true
    });
    expect(result).toEqual({ ok: false, reason: 'grant-not-registered' });
  });

  test('403 after the Picker grant → grant-not-registered too', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: 'appNotAuthorizedToFile' }, 403)
    );
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: false,
      afterGrant: true
    });
    expect(result).toEqual({ ok: false, reason: 'grant-not-registered' });
  });

  test('token read 401 → needs-signin AND arms the auth-store expiry', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'unauthorized' }, 401));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: false
    });
    expect(result).toEqual({ ok: false, reason: 'needs-signin' });
    // markExpired() nulls the token + flips to SESSION_EXPIRED so getValidToken
    // can't re-hand the dead token to the gate's auto-retry (no spin loop).
    expect(useAuthStore.getState().status).toBe('SESSION_EXPIRED');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  test('token read 403 rateLimitExceeded → transient (not needs-grant)', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
        403
      )
    );
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: false
    });
    expect(result).toEqual({ ok: false, reason: 'transient' });
  });

  test('token read 5xx → transient', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'backend' }, 503));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: false
    });
    expect(result).toEqual({ ok: false, reason: 'transient' });
  });

  test('network failure on both rungs → transient', async () => {
    signedIn();
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await readDriveDisplayFile({
      fileId: FID,
      resourceKey: null,
      publicPreview: true
    });
    expect(result).toEqual({ ok: false, reason: 'transient' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
