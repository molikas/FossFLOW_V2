// Covers the 800ms abort-on-hang behavior and the singleton cache.
// The 800ms cap matters: without it, a downed backend can let the OS spend
// 2+ seconds on a dual-stack connect probe before reporting ECONNREFUSED.

describe('fetchRuntimeConfig', () => {
  beforeEach(() => {
    // resetModules + require() gives us a fresh module each test so the
    // module-level `cached` / `inflight` singletons start from null.
    jest.resetModules();
    (global as any).fetch = undefined;
    delete process.env.PUBLIC_GOOGLE_API_KEY;
    delete process.env.PUBLIC_GOOGLE_PROJECT_NUMBER;
  });

  test('returns default config when fetch rejects', async () => {
    (global as any).fetch = async () => {
      throw new Error('network');
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchRuntimeConfig } = require('../useRuntimeConfig');
    const cfg = await fetchRuntimeConfig();
    expect(cfg.authMode).toBe('none');
    expect(cfg.serverStorage).toBe(false);
    expect(cfg.googleClientId).toBeNull();
    expect(cfg.googleApiKey).toBeNull();
    expect(cfg.drivePublicPreview).toBe(false);
    expect(cfg.googleProjectNumber).toBeNull();
  });

  test('reflects backend-supplied drivePublicPreview + googleProjectNumber; the raw key is never sent (ADR 0043 #3)', async () => {
    (global as any).fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          drivePublicPreview: true,
          googleProjectNumber: '123456789012'
        })
      }) as Response;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchRuntimeConfig } = require('../useRuntimeConfig');
    const cfg = await fetchRuntimeConfig();
    expect(cfg.drivePublicPreview).toBe(true);
    expect(cfg.googleProjectNumber).toBe('123456789012');
    // The API key is no longer part of the server contract (server-side only).
    expect(cfg.googleApiKey).toBeNull();
  });

  test('re-applies PUBLIC_ build-time fallbacks when the backend nulls the fields', async () => {
    process.env.PUBLIC_GOOGLE_API_KEY = 'AIza-build-time';
    process.env.PUBLIC_GOOGLE_PROJECT_NUMBER = '999888777666';
    (global as any).fetch = async () =>
      ({
        ok: true,
        status: 200,
        // Worker/Express send explicit nulls when the env vars are unset —
        // the spread would clobber DEFAULT_CONFIG without the re-fallback.
        json: async () => ({ googleApiKey: null, googleProjectNumber: null })
      }) as Response;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchRuntimeConfig } = require('../useRuntimeConfig');
    const cfg = await fetchRuntimeConfig();
    expect(cfg.googleApiKey).toBe('AIza-build-time');
    expect(cfg.googleProjectNumber).toBe('999888777666');
  });

  test('aborts a hanging fetch via AbortSignal and falls back to defaults within ~1s', async () => {
    (global as any).fetch = (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        // Never resolves — only the timeout signal aborts it.
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchRuntimeConfig } = require('../useRuntimeConfig');
    const t0 = Date.now();
    const cfg = await fetchRuntimeConfig();
    const elapsed = Date.now() - t0;
    // 800ms timeout + jitter — must NOT take the old 5000ms.
    expect(elapsed).toBeLessThan(1500);
    expect(elapsed).toBeGreaterThanOrEqual(700);
    expect(cfg.authMode).toBe('none');
  }, 3000);

  // A2/STOR-11 (owner ruling 2026-07-30 — cache success only). A backend that
  // is merely slow used to be demoted to Local mode for the life of the page:
  // the fallback was written into the module cache and `if (cached)` won
  // forever, so a server deploy's whole workspace was invisible until reload.
  test('does not cache a transport failure — the next caller re-probes', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    (global as any).fetch = async () => {
      calls++;
      // First probe times out (what AbortSignal.timeout throws); the backend
      // was healthy all along and answers the second.
      if (calls === 1) throw new DOMException('TimeoutError', 'TimeoutError');
      return {
        ok: true,
        status: 200,
        json: async () => ({ serverStorage: true })
      } as Response;
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchRuntimeConfig } = require('../useRuntimeConfig');

    const first = await fetchRuntimeConfig();
    expect(first.serverStorage).toBe(false); // fell back for THIS caller
    expect(calls).toBe(1); // precondition: the probe really was issued

    const second = await fetchRuntimeConfig();
    expect(calls).toBe(2);
    expect(second.serverStorage).toBe(true);
  });

  test('does cache a response that was actually received, non-ok included', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    (global as any).fetch = async () => {
      calls++;
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchRuntimeConfig } = require('../useRuntimeConfig');
    await fetchRuntimeConfig();
    await fetchRuntimeConfig();
    // A 404 is this deploy saying "no config endpoint" — an answer, unlike a
    // timeout, so the single-probe fast path (ADR 0009 D2) still holds.
    expect(calls).toBe(1);
  });

  test('caches the resolved config across calls', async () => {
    let calls = 0;
    (global as any).fetch = async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ authMode: 'shared-token' as const })
      } as Response;
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchRuntimeConfig } = require('../useRuntimeConfig');
    const a = await fetchRuntimeConfig();
    const b = await fetchRuntimeConfig();
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(a.authMode).toBe('shared-token');
  });
});
