import app from '../app';

type Env = Record<string, unknown>;

async function request(pathname: string, init: RequestInit = {}, env: Env = {}) {
  const res = await app.request(`http://test${pathname}`, init, env);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

describe('GET /api/config', () => {
  test('returns documented shape with defaults when env empty', async () => {
    const res = await request('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      googleClientId: null,
      drivePublicPreview: false,
      googleProjectNumber: null,
      driveScopes: ['https://www.googleapis.com/auth/drive.file'],
      authMode: 'none',
      serverStorage: false,
      publicBaseUrl: null
    });
  });

  // A5/CHR-08 (owner ruling 2026-07-30): a Drive share link minted from a
  // *.pages.dev preview build still has to point at the production site.
  test('surfaces PUBLIC_BASE_URL so the app can mint canonical links', async () => {
    const res = await request('/api/config', {}, {
      PUBLIC_BASE_URL: 'https://axoview.app'
    });
    expect(res.body.publicBaseUrl).toBe('https://axoview.app');
  });

  test('reflects GOOGLE_CLIENT_ID + AUTH_MODE from env', async () => {
    const res = await request('/api/config', {}, {
      GOOGLE_CLIENT_ID: 'client-1',
      AUTH_MODE: 'shared-token'
    });
    expect(res.body.googleClientId).toBe('client-1');
    expect(res.body.authMode).toBe('shared-token');
  });

  test('drivePublicPreview reflects GOOGLE_API_KEY presence — key never exposed (ADR 0043 #3)', async () => {
    const res = await request('/api/config', {}, {
      GOOGLE_API_KEY: 'AIza-test-key',
      GOOGLE_PROJECT_NUMBER: '123456789012'
    });
    expect(res.body.drivePublicPreview).toBe(true);
    expect(res.body.googleProjectNumber).toBe('123456789012');
    // The raw key must NEVER reach the browser — only the boolean does.
    expect(res.body.googleApiKey).toBeUndefined();
  });

  test('serverStorage is hardcoded false (§12 B2: Worker is storage-less)', async () => {
    const res = await request('/api/config');
    expect(res.body.serverStorage).toBe(false);
  });
});

describe('GET /api/public/drive/:fileId — anonymous read proxy (ADR 0043 #3)', () => {
  const realFetch = global.fetch;
  const KEY_ENV = { GOOGLE_API_KEY: 'AIza-server-key' };
  const FID = 'a'.repeat(20);
  afterEach(() => {
    global.fetch = realFetch;
  });

  // The proxy makes TWO Drive calls: metadata (fields=trashed,size) THEN content.
  function driveMock(opts: { trashed?: boolean; size?: string; doc?: unknown } = {}) {
    const meta = { trashed: opts.trashed ?? false, size: opts.size ?? '64' };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(meta), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(opts.doc ?? {}), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  test('503 when no server key is configured', async () => {
    const res = await request(`/api/public/drive/${FID}`);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'preview-disabled' });
  });

  test('400 on a malformed file id', async () => {
    const res = await request('/api/public/drive/bad*id', {}, KEY_ENV);
    expect(res.status).toBe(400);
  });

  test('200 proxies the body via metadata-then-content, using the SERVER key', async () => {
    const fetchMock = driveMock({ doc: { title: 'Public', items: [] } });
    const res = await app.request(`http://test/api/public/drive/${FID}`, {}, KEY_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=60');
    expect(await res.json()).toEqual({ title: 'Public', items: [] });
    // call[0] = metadata (trashed gate), call[1] = content — both key-authed.
    expect(fetchMock.mock.calls[0][0]).toContain('fields=trashed');
    expect(fetchMock.mock.calls[1][0]).toContain('alt=media');
    expect(fetchMock.mock.calls[1][0]).toContain('key=AIza-server-key');
  });

  test('410 when the file is trashed (deleted-but-recoverable) — never reads the body', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ trashed: true }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await request(`/api/public/drive/${FID}`, {}, KEY_ENV);
    expect(res.status).toBe(410);
    expect(res.body).toEqual({ error: 'gone' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('404 when the metadata read says not public (private / permanently deleted)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('{"error":"notFound"}', { status: 404 })) as unknown as typeof fetch;
    const res = await request(`/api/public/drive/${FID}`, {}, KEY_ENV);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not-public' });
  });

  test('503 (not 404) when the upstream read is transient (5xx/429) — so the client can Retry', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 })) as unknown as typeof fetch;
    const res = await request(`/api/public/drive/${FID}`, {}, KEY_ENV);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'upstream-error' });
  });

  test('413 when the metadata size exceeds the cap — never reads the body', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ trashed: false, size: String(11 * 1024 * 1024) }), { status: 200 })
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await request(`/api/public/drive/${FID}`, {}, KEY_ENV);
    expect(res.status).toBe(413);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // S2/SHARE-07 (promoted from `__explore__/S2/share-07`). The gate used to be
  // `Number(meta.size ?? '0') > cap`, and Drive reports `size` only for files
  // with binary content stored in Drive — so an ABSENT size defaulted to a
  // zero-byte file and streamed a body of any length through the Worker. A
  // non-numeric one was as bad: `Number('unknown')` is NaN and `NaN > cap` is
  // false. The neighbouring `trashed` gate on the same metadata read already
  // failed closed on a missing field, so the size cap was the outlier.
  test.each([
    ['absent', undefined],
    ['non-numeric', 'unknown'],
    ['empty', '']
  ])('413 when Drive declares a %s size — fails closed, never reads the body', async (_label, size) => {
    const meta: Record<string, unknown> = { trashed: false };
    if (size !== undefined) meta.size = size;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(meta), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await request(`/api/public/drive/${FID}`, {}, KEY_ENV);
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'too-large' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // S3/DRV-07 (promoted from `__explore__/S3/drv-07`). `public` authorised
  // SHARED caches, so revoking a Drive link left the diagram readable from a
  // proxy that could hand it to other requesters. The in-code rationale was
  // browser-side dedupe of repeat opens, which `private` serves just as well.
  test('the 200 is cacheable by the viewer only, never by a shared cache', async () => {
    driveMock({ doc: { title: 'Public' } });
    const res = await app.request(`http://test/api/public/drive/${FID}`, {}, KEY_ENV);
    const cacheControl = res.headers.get('cache-control') ?? '';
    expect(cacheControl).toContain('private');
    expect(cacheControl).not.toContain('public');
    expect(cacheControl).toContain('must-revalidate');
  });

  test('forwards ?resourceKey= as the Drive resource-key header on both reads', async () => {
    const fetchMock = driveMock({ doc: {} });
    await app.request(`http://test/api/public/drive/${FID}?resourceKey=rk-9`, {}, KEY_ENV);
    const h0 = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const h1 = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(h0['X-Goog-Drive-Resource-Keys']).toBe(`${FID}/rk-9`);
    expect(h1['X-Goog-Drive-Resource-Keys']).toBe(`${FID}/rk-9`);
  });

  test('bypasses auth in shared-token mode (it is a public route)', async () => {
    driveMock({ doc: {} });
    const res = await request(`/api/public/drive/${FID}`, {}, {
      ...KEY_ENV,
      AUTH_MODE: 'shared-token',
      AUTH_SHARED_SECRET: 'sekret'
    });
    expect(res.status).toBe(200);
  });
});

describe('/api/* catch-all (storage disabled per app.ts:40)', () => {
  test.each([
    ['GET', '/api/diagrams'],
    ['GET', '/api/diagrams/abc'],
    ['POST', '/api/diagrams'],
    ['PUT', '/api/diagrams/abc'],
    ['PATCH', '/api/diagrams/abc'],
    ['DELETE', '/api/diagrams/abc'],
    ['GET', '/api/folders'],
    ['POST', '/api/folders'],
    ['GET', '/api/tree-manifest'],
    ['PUT', '/api/tree-manifest'],
    ['POST', '/api/diagrams/abc/share']
  ])('%s %s → 503 "Server storage is disabled"', async (method, pathname) => {
    const res = await request(pathname, { method });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Server storage is disabled' });
  });
});

describe('public namespace cutout (ADR 0010 D6) still short-circuits to 503 today', () => {
  test('GET /api/public/diagrams/:uuid → 503 (storage-less Worker has nothing to serve)', async () => {
    // Auth-bypass still applies, but the route lands on app.all('/api/*') → 503.
    // §12 B2: Worker re-implements only /api/config; everything else is hardcoded 503.
    const res = await request(`/api/public/diagrams/${'A'.repeat(21)}`);
    expect(res.status).toBe(503);
  });
});

describe('auth fires before the 503 short-circuit', () => {
  test('shared-token mode without credentials → 401 (not 503)', async () => {
    const res = await request(
      '/api/diagrams',
      {},
      { AUTH_MODE: 'shared-token', AUTH_SHARED_SECRET: 'sekret' }
    );
    expect(res.status).toBe(401);
  });

  test('shared-token mode with valid credentials still reaches the 503 sink', async () => {
    const res = await request(
      '/api/diagrams',
      { headers: { authorization: 'Bearer sekret' } },
      { AUTH_MODE: 'shared-token', AUTH_SHARED_SECRET: 'sekret' }
    );
    expect(res.status).toBe(503);
  });

  test('GET /api/config bypasses auth in shared-token mode', async () => {
    const res = await request('/api/config', {}, {
      AUTH_MODE: 'shared-token',
      AUTH_SHARED_SECRET: 'sekret'
    });
    expect(res.status).toBe(200);
  });
});

describe('secureHeaders middleware applied to all routes', () => {
  test('GET /api/config response carries security headers from hono/secure-headers', async () => {
    const res = await request('/api/config');
    // hono/secure-headers sets a baseline set; X-Content-Type-Options: nosniff is
    // one of the always-on defaults. Smoke check that the middleware ran at all.
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('503 sink path also carries security headers (middleware not skipped on errors)', async () => {
    const res = await request('/api/diagrams');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('non-/api/* routes are not handled by this Worker', () => {
  test('GET / → 404 (no static handler in app.ts)', async () => {
    const res = await request('/');
    expect(res.status).toBe(404);
  });

  test('GET /index.html → 404 (Worker serves only /api/*)', async () => {
    const res = await request('/index.html');
    expect(res.status).toBe(404);
  });
});

// DP4 (v1.1 CF hardening): Hono onError handler in app.ts logs
// method + path + err.name on any uncaught 500 and returns a stack-free
// JSON 500. The handler is the observability seam that wrangler tail
// will surface in production. Mocking authMiddleware to throw is the
// minimal way to force an uncaught error through the chain without
// adding a test-only route to the 45-LOC app.ts.
describe('onError handler (DP4 — log method+path+errorName on uncaught 500)', () => {
  test('uncaught error in middleware: logs method+path+errorName, returns JSON 500', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let throwingApp: typeof app;
      jest.isolateModules(() => {
        jest.doMock('../auth', () => ({
          isPublicRoute: () => false,
          authMiddleware: () => async () => {
            throw new TypeError('forced by test');
          }
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        throwingApp = require('../app').default;
      });
      const res = await throwingApp!.request('http://test/api/diagrams', { method: 'GET' }, {});
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: 'Internal Server Error' });
      expect(spy).toHaveBeenCalledTimes(1);
      const message = spy.mock.calls[0][0] as string;
      expect(message).toContain('GET');
      expect(message).toContain('/api/diagrams');
      expect(message).toContain('TypeError');
    } finally {
      spy.mockRestore();
    }
  });
});

// v1.1 Cloudflare hardening — Workstream A.1.
// 30-day CF Analytics review recorded 5xx responses on the paths below in
// production. This block reproduces the exact inputs against the current
// integration bundle: a 503 (for `/api/*`) or 404 (for non-`/api/*` —
// scoped out of the Worker by `_routes.json` in prod, returned by Hono with
// no static handler in tests) is the expected, healthy outcome. A 500
// surfacing on any of these inputs IS the diagnosis — the test failure
// stack identifies the originating middleware.
describe('probe-input surface (CF analytics 5xx fingerprints)', () => {
  const apiProbes = [
    '/api/.env',
    '/api/v2/.env',
    '/api/config.js',
    '/api/node/constant.js',
    '/api/admin/role/id',
    '/api/v1/executions'
  ];
  const nonApiProbes = [
    '/.env',
    '/.docker/secrets.json',
    '/.git/config',
    '/wp-config.php~',
    '/wp-config.php.old',
    '/graphql',
    '/graphql/api',
    '/__nextjs_action',
    '/_next/foo'
  ];

  describe('AUTH_MODE=none (default)', () => {
    test.each(apiProbes)('GET %s → 503 (catch-all sink, no 500 leak)', async (path) => {
      const res = await request(path);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Server storage is disabled' });
    });

    test.each(nonApiProbes)('GET %s → 404 (no Worker route)', async (path) => {
      const res = await request(path);
      expect(res.status).toBe(404);
    });
  });

  describe('AUTH_MODE=shared-token without credentials', () => {
    const env = { AUTH_MODE: 'shared-token', AUTH_SHARED_SECRET: 'sekret' };

    test.each(apiProbes)('GET %s → 401 (auth middleware fires before catch-all)', async (path) => {
      const res = await request(path, {}, env);
      expect(res.status).toBe(401);
    });

    test.each(nonApiProbes)('GET %s → 404 (Worker scope unchanged by AUTH_MODE)', async (path) => {
      const res = await request(path, {}, env);
      expect(res.status).toBe(404);
    });
  });
});
