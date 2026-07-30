/**
 * S3 / DRV-11, DRV-12, DRV-15 — the resourceKey plumbing and one unclassified
 * proxy status.
 *
 * DRV-11 checks a HARVESTED INVARIANT rather than the code: the coverage
 * baseline records the worker's resourceKey allowlist as
 * `/^[A-Za-z0-9_-]{10,120}$/`, inheriting the fileId floor. If that is what
 * shipped, a short but legitimate Google resource key is silently dropped.
 * DRV-15 asks whether any of this plumbing is reachable from a link the app
 * itself produces.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readDriveDisplayFile } from '../../services/drive/drivePublicRead';
import { drivePreviewUrl } from '../../services/drive/driveSharing';
import { useAuthStore } from '../../stores/authStore';

const APP_SRC = path.resolve(__dirname, '../..');
const REPO = path.resolve(APP_SRC, '../../..');
const read = (rel: string) => fs.readFileSync(path.resolve(REPO, rel), 'utf-8');

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  useAuthStore.setState({ status: 'UNAUTHENTICATED', accessToken: null, _waiters: [] });
});

function res(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response;
}

describe('DRV-11 — the worker resourceKey allowlist floor', () => {
  test('the shipped regex is {1,120}, NOT the {10,120} the coverage baseline records', () => {
    const worker = read('packages/axoview-worker/src/app.ts');
    // --- precondition: we are reading the resourceKey validator, not fileId's ---
    expect(worker).toContain("const rawResourceKey = c.req.query('resourceKey');");
    const validator = worker
      .slice(worker.indexOf('const rawResourceKey'))
      .slice(0, 300);
    expect(validator).toContain('/^[A-Za-z0-9_-]{1,120}$/');
    expect(validator).not.toContain('{10,120}');
    // fileId keeps its own, stricter floor — so the two are deliberately distinct.
    expect(worker).toContain('/^[A-Za-z0-9_-]{10,120}$/.test(fileId)');
  });

  test('a 1-character resource key therefore passes the allowlist', () => {
    const re = /^[A-Za-z0-9_-]{1,120}$/;
    expect(re.test('a')).toBe(true);
    expect(re.test('AbC-_9')).toBe(true);
    // Only genuinely unsafe shapes are dropped.
    expect(re.test('')).toBe(false);
    expect(re.test('has space')).toBe(false);
    expect(re.test('a\r\nX-Injected: 1')).toBe(false);
  });
});

describe('DRV-12 — a malformed fileId falls through to the sign-in ladder', () => {
  test('CHARACTERIZATION: the proxy answers 400 bad-file-id and the ladder ignores the status', async () => {
    fetchMock.mockResolvedValueOnce(res(400, { error: 'bad-file-id' }));

    // Signed out, so the token rung has nothing to try.
    const out = await readDriveDisplayFile({
      fileId: 'short',
      resourceKey: null,
      publicPreview: true
    });

    // --- precondition: the proxy really was consulted and really 400'd ---
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/public/drive/short');

    // 410/413 → not-found and 429/5xx → transient are each classified; 400 is
    // not, so it falls through and the viewer is asked to sign in for a link
    // that can never resolve.
    expect(out).toEqual({ ok: false, reason: 'needs-signin' });
  });

  test('CHARACTERIZATION: signed in, the same malformed link ends on the Picker wall', async () => {
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      accessToken: 'tok',
      expiresAt: Date.now() + 3600_000,
      _waiters: []
    });
    fetchMock
      .mockResolvedValueOnce(res(400, { error: 'bad-file-id' }))
      .mockResolvedValueOnce(res(404, { error: { message: 'File not found' } }));

    const out = await readDriveDisplayFile({
      fileId: 'short',
      resourceKey: null,
      publicPreview: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // precondition: both rungs ran
    // "Open with Google Drive access" for a file id Drive rejected as malformed.
    expect(out).toEqual({ ok: false, reason: 'needs-grant' });
  });

  test('CONTROL: 410 and 413 ARE classified at rung 1 and never reach the token rung', async () => {
    for (const status of [410, 413]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(res(status, {}));
      const out = await readDriveDisplayFile({
        fileId: 'abcdefghij1234567890',
        resourceKey: null,
        publicPreview: true
      });
      expect(out).toEqual({ ok: false, reason: 'not-found' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});

describe('DRV-15 — nothing puts a resourceKey into a copied link', () => {
  test('CHARACTERIZATION: `getFileShareMeta` — the only reader of the field — has no production caller', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name === '__tests__' || e.name === '__explore__') continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
      }
    };
    walk(APP_SRC);
    const callers = files.filter((f) => {
      if (f.endsWith(path.join('services', 'drive', 'driveSharing.ts'))) return false;
      return /getFileShareMeta\s*\(/.test(fs.readFileSync(f, 'utf-8'));
    });
    expect(callers).toEqual([]);

    // Both copy paths build the link without the second argument.
    const toolbar = fs.readFileSync(path.join(APP_SRC, 'components/AppToolbar.tsx'), 'utf-8');
    expect(toolbar).toContain('drivePreviewUrl(fileId)');
    const dialog = fs.readFileSync(
      path.join(APP_SRC, 'components/DriveShareManageDialog.tsx'),
      'utf-8'
    );
    expect(dialog).toContain('const previewUrl = drivePreviewUrl(fileId);');
  });

  test('CHARACTERIZATION: the builder DOES support it, so the omission is at the call sites', () => {
    expect(drivePreviewUrl('f1')).not.toContain('resourceKey');
    expect(drivePreviewUrl('f1', 'k1')).toContain('?resourceKey=k1');
  });

  test('INERT: app-created Drive files carry no resourceKey, so no copied link needs one', () => {
    // ADR 0042 §1 states it, and the read path is where a resourceKey actually
    // arrives — from a link the viewer pasted, not one Axoview built. Recorded so
    // the dead `getFileShareMeta` is not mistaken for a live bug.
    const adr = read('docs/adr/0042-drive-native-sharing-and-readonly-preview.md');
    expect(adr).toMatch(/resourceKey/);
    // The read side IS wired end to end, and its own tests cover it.
    const publicRead = fs.readFileSync(
      path.join(APP_SRC, 'services/drive/drivePublicRead.ts'),
      'utf-8'
    );
    expect(publicRead).toContain('X-Goog-Drive-Resource-Keys');
  });
});
