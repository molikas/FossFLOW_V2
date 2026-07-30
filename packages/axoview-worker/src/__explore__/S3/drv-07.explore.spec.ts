/**
 * S3 / DRV-07 — revocation latency on the anonymous read proxy.
 *
 * The proxy's 200 response sets `Cache-Control: public, max-age=60`. The in-code
 * rationale is browser-side dedupe of repeat opens ("Cloudflare does not
 * edge-cache Function responses without a Cache Rule"), but the directive it
 * chose says more than that: `public` authorises ANY cache, and 60 s is how long
 * a revoked link keeps working in a viewer who already opened it.
 */
import app from '../../app';

const ENV = { GOOGLE_API_KEY: 'server-key', AUTH_MODE: 'none' as const };
const FILE_ID = 'abcdefghij1234567890';

const realFetch = global.fetch;
afterEach(() => {
  (global as unknown as { fetch: unknown }).fetch = realFetch;
});

function stubDrive(meta: unknown, content: string) {
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: unknown) =>
    String(url).includes('alt=media')
      ? new Response(content, { status: 200 })
      : new Response(JSON.stringify(meta), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
  );
}

describe('DRV-07 — a revoked share link stays readable from cache', () => {
  test('CHARACTERIZATION: the 200 carries `public, max-age=60`, so revocation is not immediate', async () => {
    stubDrive({ trashed: false, size: '10' }, '{"title":"secret"}');
    const res = await app.request(`/api/public/drive/${FILE_ID}`, {}, ENV);
    // --- precondition: this IS the success path, not an error response ---
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"title":"secret"}');

    const cc = res.headers.get('cache-control');
    expect(cc).toBe('public, max-age=60');
    // `public` (not `private`) authorises shared caches, and there is no
    // `must-revalidate` / `no-store`, so a viewer's browser may serve the body
    // for a full minute after the owner sets access back to Restricted.
    expect(cc).toContain('public');
    expect(cc).not.toContain('private');
    expect(cc).not.toContain('no-store');
    expect(cc).not.toContain('must-revalidate');
  });

  test('CHARACTERIZATION: the error responses are NOT cached, so only the readable body lingers', async () => {
    // Once revocation takes effect upstream the proxy 404s and that answer is
    // uncached — the asymmetry is what makes the stale 200 the whole exposure.
    (global as unknown as { fetch: unknown }).fetch = jest.fn(
      async () => new Response('{}', { status: 404 })
    );
    const res = await app.request(`/api/public/drive/${FILE_ID}`, {}, ENV);
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBeNull();
  });

  test('CONTROL: the trashed path (410) is the one revocation the proxy answers immediately', async () => {
    // Drive trash flips the metadata read, so a deleted diagram's link dies at
    // once — proof that the 60 s window is specific to an ACL change.
    stubDrive({ trashed: true }, 'never-read');
    const res = await app.request(`/api/public/drive/${FILE_ID}`, {}, ENV);
    expect(res.status).toBe(410);
    expect(res.headers.get('cache-control')).toBeNull();
  });
});
