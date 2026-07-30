/**
 * S3 / DRV-01, DRV-02, DRV-03 — the gate's dead ends.
 *
 * All three are caller-side questions the ladder's own tests cannot ask: what is
 * the viewer TOLD, and what can they DO, once `readDriveDisplayFile` has returned
 * a typed failure.
 *
 * DRV-01 is driven through the real ladder with a scripted fetch so the
 * `afterGrant` flag's effect on identical Drive responses is measured, not
 * asserted from the source; the ref's lifetime is then pinned by a source
 * contract (the provider is 1800 lines of app-shell wiring — rendering it needs
 * the whole storage/lib provider tree, well past the 45-minute probe budget).
 */
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readDriveDisplayFile } from '../../services/drive/drivePublicRead';
import { launchDrivePicker } from '../../services/drive/drivePicker';
import { useAuthStore } from '../../stores/authStore';

jest.mock('../../services/drive/gapiLoader', () => ({
  loadGapiModule: jest.fn(async () => ({}))
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: unknown) =>
      typeof fallback === 'string'
        ? fallback
        : ((fallback as { defaultValue?: string })?.defaultValue ?? _k)
  })
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { ReadonlyLoadErrorDialog } =
  require('../../components/ReadonlyLoadErrorDialog') as typeof import('../../components/ReadonlyLoadErrorDialog');
/* eslint-enable @typescript-eslint/no-var-requires */

const APP_SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(APP_SRC, rel), 'utf-8');
const FILE_ID = 'abcdefghij1234567890';

function res(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response;
}

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: 'tok',
    expiresAt: Date.now() + 3600_000,
    _waiters: []
  });
});
afterEach(() => {
  useAuthStore.setState({ status: 'UNAUTHENTICATED', accessToken: null, _waiters: [] });
});

describe('DRV-01 — the afterGrant flag makes a slow Drive grant a permanent dead end', () => {
  test('CHARACTERIZATION: the SAME 404 is recoverable pre-grant and terminal after, and the flag never clears mid-route', async () => {
    // Drive hides an ungranted file as 404 and the grant takes time to
    // propagate, so the post-Picker retry can see exactly the pre-Picker answer.
    const drive404 = () => res(404, { error: { message: 'File not found' } });

    fetchMock.mockResolvedValue(drive404());
    const before = await readDriveDisplayFile({
      fileId: FILE_ID,
      resourceKey: null,
      publicPreview: false,
      afterGrant: false
    });
    expect(before).toEqual({ ok: false, reason: 'needs-grant' }); // recoverable

    fetchMock.mockResolvedValue(drive404());
    const after = await readDriveDisplayFile({
      fileId: FILE_ID,
      resourceKey: null,
      publicPreview: false,
      afterGrant: true
    });
    // --- precondition: the token rung really ran both times ---
    expect(fetchMock).toHaveBeenCalled();
    expect(after).toEqual({ ok: false, reason: 'not-found' }); // terminal

    // And the flag that decides which of those two the viewer gets is a ref that
    // is only reset when the route unmounts.
    const provider = read('providers/DiagramLifecycleProvider.tsx');
    expect(provider).toContain('driveAfterGrantRef.current = afterGrant;');
    // Exactly two writes: the retry callback, and the leaving-the-route effect.
    const writes = provider.match(/driveAfterGrantRef\.current = /g) ?? [];
    expect(writes).toHaveLength(2);
    expect(provider).toContain('if (!driveFileId) {');
    // `not-found` is the only reason mapped to 'failed' — the terminal state.
    expect(provider).toContain("result.reason === 'needs-signin' ||");
    expect(provider).toContain("? result.reason\n              : 'failed'");
  });

  test('CHARACTERIZATION: the terminal state offers no retry — only a navigate-away', async () => {
    // DriveDisplayGate renders ReadonlyLoadErrorDialog for `failed`, whose sole
    // action is onDismiss → navigate('/', { replace: true }).
    const gate = read('components/DriveDisplayGate.tsx');
    expect(gate).toContain("if (driveDisplayState === 'failed')");
    expect(gate).toContain("onDismiss={() => navigate('/', { replace: true })}");

    const onDismiss = jest.fn();
    render(<ReadonlyLoadErrorDialog open onDismiss={onDismiss} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Back to editor');
    await userEvent.click(buttons[0]);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // No Retry, and no way back to the gate's Picker rung.
    expect(screen.queryByText(/try again/i)).toBeNull();
    expect(screen.queryByText(/Google Drive access/i)).toBeNull();
  });
});

describe('DRV-02 — four distinct terminal causes render one generic message', () => {
  test('CHARACTERIZATION: trashed, too-large, post-grant 403 and post-grant 404 all map to `not-found`', async () => {
    const cases: Array<[string, () => void, Parameters<typeof readDriveDisplayFile>[0]]> = [
      [
        'proxy 410 — the owner trashed it',
        () => fetchMock.mockResolvedValueOnce(res(410, { error: 'gone' })),
        { fileId: FILE_ID, resourceKey: null, publicPreview: true }
      ],
      [
        'proxy 413 — the file is over 10 MB',
        () => fetchMock.mockResolvedValueOnce(res(413, { error: 'too-large' })),
        { fileId: FILE_ID, resourceKey: null, publicPreview: true }
      ],
      [
        'post-grant 403 — access revoked',
        () =>
          fetchMock.mockResolvedValueOnce(
            res(403, { error: { errors: [{ reason: 'insufficientFilePermissions' }] } })
          ),
        { fileId: FILE_ID, resourceKey: null, publicPreview: false, afterGrant: true }
      ],
      [
        'post-grant 404 — the grant never registered',
        () => fetchMock.mockResolvedValueOnce(res(404, {})),
        { fileId: FILE_ID, resourceKey: null, publicPreview: false, afterGrant: true }
      ]
    ];

    for (const [label, arrange, req] of cases) {
      fetchMock.mockReset();
      arrange();
      const out = await readDriveDisplayFile(req);
      // --- precondition: each case really issued its request ---
      expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
      expect({ label, out }).toEqual({ label, out: { ok: false, reason: 'not-found' } });
    }
  });

  test('CHARACTERIZATION: the one message they collapse into names only two of the four', () => {
    render(<ReadonlyLoadErrorDialog open onDismiss={() => {}} />);
    expect(screen.getByText('Could not open this diagram.')).toBeInTheDocument();
    const body = screen.getByText(
      'The diagram may have been deleted, or you may not have access to it.'
    );
    expect(body).toBeInTheDocument();
    // Nothing about size, and nothing about a grant that may simply need a moment
    // — the two causes a viewer could act on.
    expect(body.textContent).not.toMatch(/large|size/i);
    expect(body.textContent).not.toMatch(/again|moment|retry/i);
  });

  test('CONTROL: the NON-terminal reasons do get distinct, actionable rungs', () => {
    // Establishes that the gate can differentiate when the ladder gives it
    // something to differentiate on — so the collapse is the ladder's, not the UI's.
    const gate = read('components/DriveDisplayGate.tsx');
    expect(gate).toContain("driveDisplayState === 'transient'");
    expect(gate).toContain("driveDisplayState === 'needs-signin'");
    expect(gate).toContain('drive-display-gate-retry');
    expect(gate).toContain('drive-display-gate-signin');
    expect(gate).toContain('drive-display-gate-grant');
  });
});

describe('DRV-03 — picking the wrong file in the Picker says nothing', () => {
  test('CHARACTERIZATION: a PICKED response omitting the target resolves `cancelled`', async () => {
    // Real launchDrivePicker against the same chainable google.picker fake the
    // regression suite installs (gapiLoader is mocked at the top of this file).
    let fire: (action: string, docs?: Array<{ id: string }>) => void = () => {
      throw new Error('rig: picker callback not registered');
    };
    const builder: Record<string, unknown> = {};
    for (const m of ['setAppId', 'setOAuthToken', 'setDeveloperKey', 'addView']) {
      builder[m] = () => builder;
    }
    builder.setCallback = (cb: (d: { action?: string; docs?: Array<{ id: string }> }) => void) => {
      fire = (action, docs) => cb({ action, docs });
      return builder;
    };
    builder.build = () => ({ setVisible: jest.fn() });
    (window as unknown as { google: unknown }).google = {
      picker: {
        PickerBuilder: function PickerBuilder() {
          return builder;
        },
        DocsView: function DocsView() {
          return {
            setFileIds() {
              return this;
            }
          };
        },
        Action: { PICKED: 'picked-action', CANCEL: 'cancel-action' }
      }
    };

    const promise = launchDrivePicker({
      fileId: FILE_ID,
      googleApiKey: 'browser-key',
      googleProjectNumber: '123456'
    });
    await new Promise((r) => setTimeout(r, 0));

    // The user picked a DIFFERENT file — the documented silent-grant trap.
    fire('picked-action', [{ id: 'some-other-file-id' }]);
    await expect(promise).resolves.toBe('cancelled');

    // CONTROL: the target file resolves 'picked', so the fake drives the real
    // discrimination and 'cancelled' above is a verdict, not a rig failure.
    const ok = launchDrivePicker({
      fileId: FILE_ID,
      googleApiKey: 'browser-key',
      googleProjectNumber: '123456'
    });
    await new Promise((r) => setTimeout(r, 0));
    fire('picked-action', [{ id: FILE_ID }]);
    await expect(ok).resolves.toBe('picked');
  });

  test('CHARACTERIZATION: the gate treats that identically to a deliberate cancel — no message, same wall', () => {
    const gate = read('components/DriveDisplayGate.tsx');
    // Only 'picked' does anything...
    expect(gate).toContain("if (outcome === 'picked') retryDriveDisplayRead(true);");
    // ...and the only `setPickerError` is in the catch, which a resolved
    // 'cancelled' never reaches.
    // Two call sites only: the reset-to-null at the top of handleGrant, and the catch.
    const setErrors = gate.match(/setPickerError\(/g) ?? [];
    expect(setErrors).toHaveLength(2);
    const handleGrant = gate.slice(gate.indexOf('const handleGrant'), gate.indexOf('// Wrong-account'));
    expect(handleGrant).toContain('setPickerError(null)');
    expect(handleGrant).toContain('} catch (err) {');
    // No branch for the cancelled outcome at all.
    expect(handleGrant).not.toContain("=== 'cancelled'");
    // The gate's own comment states the intent — which is right for a real
    // cancel and wrong for a wrong-file pick, because both arrive as 'cancelled'.
    expect(handleGrant).toContain("'cancelled' keeps the gate up");
  });
});
