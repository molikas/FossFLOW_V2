jest.mock('../gapiLoader', () => ({ loadGapiModule: jest.fn() }));

import { launchDrivePicker, DrivePickerError } from '../drivePicker';
import { loadGapiModule } from '../gapiLoader';
import { useAuthStore } from '../../../stores/authStore';

const loadGapiModuleMock = loadGapiModule as jest.Mock;

interface FakePickerHarness {
  builderCalls: Record<string, unknown>;
  fileIds: unknown;
  setVisible: jest.Mock;
  fireCallback: (action: string, docs?: Array<{ id: string }>) => void;
}

/** Install a chainable window.google.picker fake and expose what it captured. */
function installFakePicker(): FakePickerHarness {
  const harness: FakePickerHarness = {
    builderCalls: {},
    fileIds: undefined,
    setVisible: jest.fn(),
    fireCallback: () => {
      throw new Error('picker callback not registered yet');
    }
  };
  const builder: Record<string, unknown> = {};
  for (const method of ['setAppId', 'setOAuthToken', 'setDeveloperKey', 'addView']) {
    builder[method] = (arg: unknown) => {
      harness.builderCalls[method] = arg;
      return builder;
    };
  }
  builder.setCallback = (
    cb: (data: { action?: string; docs?: Array<{ id: string }> }) => void
  ) => {
    harness.fireCallback = (action: string, docs?: Array<{ id: string }>) =>
      cb({ action, docs });
    return builder;
  };
  builder.build = () => ({ setVisible: harness.setVisible });
  (window as unknown as { google: unknown }).google = {
    picker: {
      PickerBuilder: function PickerBuilder() {
        return builder;
      },
      DocsView: function DocsView() {
        return {
          setFileIds(ids: unknown) {
            harness.fileIds = ids;
            return this;
          }
        };
      },
      Action: { PICKED: 'picked-action', CANCEL: 'cancel-action' }
    }
  };
  return harness;
}

function signedIn(): void {
  useAuthStore.setState({
    status: 'AUTHENTICATED',
    accessToken: 'picker-token',
    expiresAt: Date.now() + 3600_000,
    user: null,
    _requestToken: null,
    _revoke: null,
    _waiters: []
  });
}

/** Flush the awaits inside launchDrivePicker up to the callback registration. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  jest.clearAllMocks();
  loadGapiModuleMock.mockResolvedValue({});
  delete (window as unknown as { google?: unknown }).google;
});

describe('launchDrivePicker', () => {
  test("rejects with a typed 'unavailable' error when googleApiKey is null", async () => {
    signedIn();
    await expect(
      launchDrivePicker({ fileId: 'fid', googleApiKey: null, googleProjectNumber: '123' })
    ).rejects.toMatchObject({ name: 'DrivePickerError', reason: 'unavailable' });
    expect(loadGapiModuleMock).not.toHaveBeenCalled();
  });

  test("rejects with 'unavailable' when googleProjectNumber is null", async () => {
    signedIn();
    await expect(
      launchDrivePicker({ fileId: 'fid', googleApiKey: 'AIza', googleProjectNumber: null })
    ).rejects.toBeInstanceOf(DrivePickerError);
    expect(loadGapiModuleMock).not.toHaveBeenCalled();
  });

  test("rejects with 'no-token' when signed out", async () => {
    useAuthStore.setState({
      status: 'UNAUTHENTICATED',
      accessToken: null,
      expiresAt: null,
      _requestToken: null,
      _waiters: []
    });
    await expect(
      launchDrivePicker({ fileId: 'fid', googleApiKey: 'AIza', googleProjectNumber: '123' })
    ).rejects.toMatchObject({ reason: 'no-token' });
  });

  test('wires appId/token/key/fileIds and resolves picked on PICKED', async () => {
    signedIn();
    const harness = installFakePicker();
    const outcome = launchDrivePicker({
      fileId: 'fid',
      googleApiKey: 'AIza-key',
      googleProjectNumber: '987654321'
    });
    await flush();
    expect(loadGapiModuleMock).toHaveBeenCalledWith('picker');
    // setAppId must be the Cloud project NUMBER — a wrong value silently
    // no-ops the grant (ADR 0042 §5).
    expect(harness.builderCalls.setAppId).toBe('987654321');
    expect(harness.builderCalls.setOAuthToken).toBe('picker-token');
    expect(harness.builderCalls.setDeveloperKey).toBe('AIza-key');
    // Comma-separated STRING per the documented DocsView.setFileIds signature.
    expect(harness.fileIds).toBe('fid');
    expect(harness.setVisible).toHaveBeenCalledWith(true);
    harness.fireCallback('picked-action', [{ id: 'fid' }]);
    await expect(outcome).resolves.toBe('picked');
  });

  test('resolves wrong-file when PICKED reports a DIFFERENT file (wrong grant)', async () => {
    signedIn();
    const harness = installFakePicker();
    const outcome = launchDrivePicker({
      fileId: 'fid',
      googleApiKey: 'AIza-key',
      googleProjectNumber: '987654321'
    });
    await flush();
    // The user browsed away and picked some other file — the target never got
    // granted, so this must NOT report 'picked' (else the gate retries and 404s).
    //
    // S3/DRV-03: it must not report 'cancelled' either. That made a wrong pick
    // indistinguishable from closing the dialog deliberately, so the gate said
    // nothing and the natural next action was to pick the same wrong file
    // again. The distinction was already computed here — it just had nowhere
    // to go until the outcome type gained a third value.
    harness.fireCallback('picked-action', [{ id: 'some-other-file' }]);
    await expect(outcome).resolves.toBe('wrong-file');
  });

  test('resolves cancelled on CANCEL', async () => {
    signedIn();
    const harness = installFakePicker();
    const outcome = launchDrivePicker({
      fileId: 'fid',
      googleApiKey: 'AIza-key',
      googleProjectNumber: '987654321'
    });
    await flush();
    harness.fireCallback('cancel-action');
    await expect(outcome).resolves.toBe('cancelled');
  });

  test("rejects with 'load-failed' when the module loads without google.picker", async () => {
    signedIn();
    await expect(
      launchDrivePicker({ fileId: 'fid', googleApiKey: 'AIza', googleProjectNumber: '123' })
    ).rejects.toMatchObject({ reason: 'load-failed' });
  });
});
