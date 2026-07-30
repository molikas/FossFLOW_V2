/**
 * A2/STOR-11 — `fetchRuntimeConfig` caches its result for the life of the page,
 * including the Local-mode fallback it writes when the 800 ms probe does not
 * come back in time. On a server deploy whose backend is merely slow, the whole
 * session then behaves as Local mode with a `console.warn` as the only trace.
 *
 * Own file: the module-level `cached` must be fresh per case, and a
 * `jest.resetModules()` shared with the STOR-10 probe leaked its `doMock`.
 */
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

/** A backend that answers correctly, just after `afterMs`. */
function slowBackend(afterMs: number) {
  const state = { attempts: 0 };
  (global as unknown as { fetch: unknown }).fetch = (
    _input: RequestInfo | URL,
    init?: RequestInit
  ) =>
    new Promise<Response>((resolve, reject) => {
      state.attempts++;
      const t = setTimeout(
        () => resolve(mockResponse({ serverStorage: true })),
        afterMs
      );
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('TimeoutError', 'TimeoutError'));
      });
    });
  return state;
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('STOR-11 — a slow backend is demoted to Local mode for the whole session', () => {
  it('characterization: a healthy 1.2 s /api/config resolves to serverStorage:false, warn-only, cached', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = slowBackend(1200);
    const { fetchRuntimeConfig } = await import('../../hooks/useRuntimeConfig');

    const inflight = fetchRuntimeConfig();
    // Past the 800 ms AbortSignal.timeout, before the backend answers.
    await jest.advanceTimersByTimeAsync(900);
    const first = await inflight;

    // PRECONDITION: the request really was issued and really was aborted.
    expect(backend.attempts).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][1])).toMatch(/TimeoutError/);

    // A server deploy now looks like Local mode.
    expect(first.serverStorage).toBe(false);

    // Let the backend finish answering. Nothing re-reads it, and no second
    // probe is ever issued for the life of the page.
    await jest.advanceTimersByTimeAsync(2000);
    const second = await fetchRuntimeConfig();
    expect(second.serverStorage).toBe(false);
    expect(backend.attempts).toBe(1);
  });

  it('control: the same backend answering in 400 ms is correctly detected', async () => {
    const backend = slowBackend(400);
    const { fetchRuntimeConfig } = await import('../../hooks/useRuntimeConfig');
    const inflight = fetchRuntimeConfig();
    await jest.advanceTimersByTimeAsync(500);
    const cfg = await inflight;
    // The rig can tell the two apart, so the failure above is the timeout and
    // not the harness.
    expect(backend.attempts).toBe(1);
    expect(cfg.serverStorage).toBe(true);
  });

  it.failing('STOR-11: a transport timeout is retried rather than cached as the answer', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = slowBackend(1200);
    const { fetchRuntimeConfig } = await import('../../hooks/useRuntimeConfig');

    const inflight = fetchRuntimeConfig();
    await jest.advanceTimersByTimeAsync(900);
    await inflight;
    expect(backend.attempts).toBe(1); // precondition

    await jest.advanceTimersByTimeAsync(2000);
    await fetchRuntimeConfig();
    // Expected: a timeout is not an answer — probe again (or expose a retry) so
    // a slow boot cannot hide a whole server workspace. Actual: the fallback is
    // written to `cached` and `if (cached) return cached` wins forever.
    expect(backend.attempts).toBe(2);
  });
});
