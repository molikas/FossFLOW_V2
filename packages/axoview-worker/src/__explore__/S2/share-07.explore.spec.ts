/**
 * S2 / SHARE-07 — the anonymous Drive read proxy's size cap.
 *
 * `Number(meta.size ?? '0') > 10MB` is the gate. Drive's `size` field is
 * documented as present only for files with binary content stored in Drive — it
 * is absent for shortcuts, Google-native docs, and any file the metadata read
 * does not report it for. A missing `size` therefore evaluates to `Number('0')`,
 * passes the cap, and the proxy streams the body with no bound at all.
 *
 * Drives the real Hono app through `app.request()`, the same way the regression
 * suite does; only `fetch` is stubbed.
 */
import app from '../../app';

const ENV = { GOOGLE_API_KEY: 'server-key', AUTH_MODE: 'none' as const };
const FILE_ID = 'abcdefghij1234567890';

type MetaBody = { trashed?: boolean; size?: string };

function stubDrive(meta: MetaBody, content: string) {
  const calls: string[] = [];
  const fetchMock = jest.fn(async (url: unknown) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('alt=media')) {
      return new Response(content, { status: 200 });
    }
    return new Response(JSON.stringify(meta), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  return { calls, fetchMock };
}

const realFetch = global.fetch;
afterEach(() => {
  (global as unknown as { fetch: unknown }).fetch = realFetch;
});

describe('SHARE-07 — a Drive file with no reported size bypasses the 10 MB cap', () => {
  test('CHARACTERIZATION: size absent → the body streams in full, cap not applied', async () => {
    // 30 MB of content behind metadata that reports no size.
    const oversized = 'x'.repeat(30 * 1024 * 1024);
    const { calls } = stubDrive({ trashed: false }, oversized);

    const res = await app.request(`/api/public/drive/${FILE_ID}`, {}, ENV);

    // --- preconditions: the metadata read happened and reported no size ---
    expect(calls.some((u) => u.includes('fields=trashed,size'))).toBe(true);
    // The content read happened too — the cap did not short-circuit it.
    expect(calls.some((u) => u.includes('alt=media'))).toBe(true);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toHaveLength(30 * 1024 * 1024);
  }, 60000);

  test('CHARACTERIZATION: an explicit size of "0" behaves identically — the gate cannot tell them apart', async () => {
    const { calls } = stubDrive({ trashed: false, size: '0' }, 'y'.repeat(1024));
    const res = await app.request(`/api/public/drive/${FILE_ID}`, {}, ENV);
    expect(res.status).toBe(200);
    expect(calls.some((u) => u.includes('alt=media'))).toBe(true);
  });

  test('CHARACTERIZATION: a non-numeric size is NaN, and NaN > cap is false — also a bypass', async () => {
    // Belt-and-braces on the same expression: any size Drive reports that does
    // not parse as a number disables the cap rather than failing closed.
    const { calls } = stubDrive({ trashed: false, size: 'unknown' }, 'z'.repeat(2048));
    const res = await app.request(`/api/public/drive/${FILE_ID}`, {}, ENV);
    expect(Number('unknown') > 10 * 1024 * 1024).toBe(false); // the arithmetic
    expect(res.status).toBe(200);
    expect(calls.some((u) => u.includes('alt=media'))).toBe(true);
  });

  test('CONTROL: a REPORTED oversize is capped at 413 and never reads the body', async () => {
    const { calls } = stubDrive(
      { trashed: false, size: String(11 * 1024 * 1024) },
      'never-read'
    );
    const res = await app.request(`/api/public/drive/${FILE_ID}`, {}, ENV);
    expect(res.status).toBe(413);
    expect(calls.some((u) => u.includes('alt=media'))).toBe(false);
  });

  test('CONTROL: the trashed gate on the same metadata read DOES fail closed on a missing field', async () => {
    // Shows the cap is the outlier: `meta.trashed` absent means "not trashed",
    // which is the safe reading; `meta.size` absent means "0 bytes", which is not.
    const { calls } = stubDrive({ trashed: true }, 'never-read');
    const res = await app.request(`/api/public/drive/${FILE_ID}`, {}, ENV);
    expect(res.status).toBe(410);
    expect(calls.some((u) => u.includes('alt=media'))).toBe(false);
  });
});
