/**
 * S1 / AUTH-05, AUTH-10, AUTH-11 — the consumer side of the auth store: the
 * three React surfaces that translate a status into an affordance.
 *
 * Mock policy follows the existing `DriveAccessRequiredDialog.test.tsx` pattern
 * (i18n resolves to the English fallback; the app-shell contexts are stubbed) so
 * the component under test is real and only its environment is faked.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../stores/authStore';
import { resetAuth, installBridge, auth, FULL_SCOPE } from './harness';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Resolve to the English fallback, and interpolate {{vars}} the way i18next
    // would — DriveDisplayGate passes the signed-in email that way.
    t: (key: string, fallback?: unknown) => {
      if (typeof fallback === 'string') return fallback;
      const opts = (fallback ?? {}) as Record<string, unknown> & { defaultValue?: string };
      let out = opts.defaultValue ?? key;
      for (const [k, v] of Object.entries(opts)) {
        if (k !== 'defaultValue') out = out.split(`{{${k}}}`).join(String(v));
      }
      return out;
    }
  })
}));

const storageManagerStub = {
  getProvider: () => ({ listDiagrams: async () => [], getCachedRootId: () => null }),
  activeProviderId: 'local'
};
jest.mock('../../providers/AppStorageContext', () => ({
  useAppStorage: () => ({
    googleDriveConfigured: true,
    serverStorageAvailable: true,
    storageManager: storageManagerStub,
    runtimeConfig: { googleClientId: 'test-client-id', googleApiKey: null, googleProjectNumber: null }
  })
}));

const lifecycle = {
  handleGoogleSignedOut: jest.fn((after?: () => void) => after?.()),
  driveDisplayFileId: 'file-1',
  driveDisplayState: 'needs-grant' as string,
  retryDriveDisplayRead: jest.fn()
};
jest.mock('../../providers/DiagramLifecycleProvider', () => ({
  useDiagramLifecycle: () => lifecycle
}));

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));

const loginMock = jest.fn();
jest.mock('@react-oauth/google', () => {
  const ReactLocal = jest.requireActual<typeof React>('react');
  return {
    GoogleOAuthProvider: ({
      children,
      onScriptLoadSuccess
    }: {
      children: React.ReactNode;
      onScriptLoadSuccess?: () => void;
    }) => {
      ReactLocal.useEffect(() => {
        onScriptLoadSuccess?.();
      }, [onScriptLoadSuccess]);
      return ReactLocal.createElement(ReactLocal.Fragment, null, children);
    },
    useGoogleLogin: () => loginMock
  };
});

// Imported after the mocks so the components pick them up.
/* eslint-disable @typescript-eslint/no-var-requires */
const { AuthControl } = require('../../components/AuthControl') as typeof import('../../components/AuthControl');
const { DriveDisplayGate } = require('../../components/DriveDisplayGate') as typeof import('../../components/DriveDisplayGate');
const { AuthProvider } = require('../../providers/AuthProvider') as typeof import('../../providers/AuthProvider');
/* eslint-enable @typescript-eslint/no-var-requires */

beforeEach(() => {
  resetAuth();
  loginMock.mockClear();
  lifecycle.retryDriveDisplayRead.mockClear();
  lifecycle.driveDisplayState = 'needs-grant';
});
afterEach(resetAuth);

describe('AUTH-05 — a userinfo failure leaves an AUTHENTICATED session looking signed out', () => {
  test('CHARACTERIZATION: AuthControl shows the never-signed-in person icon and offers no sign-out', async () => {
    // The real path: a full grant whose userinfo call fails (offline, CSP, 403).
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => {
      throw new Error('network');
    });
    installBridge();
    const p = auth().signIn();
    auth()._onToken({ access_token: 'working-token', expires_in: 3600, scope: FULL_SCOPE });
    await p;
    await act(async () => {
      await Promise.resolve();
    });

    // --- preconditions: the session is genuinely usable ---
    expect(auth().status).toBe('AUTHENTICATED');
    expect(auth().accessToken).toBe('working-token');
    await expect(auth().getValidToken()).resolves.toBe('working-token');
    // ...and identity is simply missing.
    expect(auth().user).toBeNull();
    expect(localStorage.getItem('axoview-google-profile')).toBeNull();

    render(<AuthControl />);
    const user = userEvent.setup();

    // AuthControl's `signedIn` requires `!!user`, so it falls all the way through
    // to the "UNAUTHENTICATED, never signed in here" branch.
    expect(screen.queryByTestId).toBeDefined();
    expect(document.querySelector('[data-axoview-id="auth-avatar"]')).toBeNull();
    const personIcon = document.querySelector('[data-axoview-id="auth-account"]');
    expect(personIcon).not.toBeNull();

    await user.click(personIcon as HTMLElement);
    // A signed-in user is offered "Sign in with Google" and NOT "Sign out".
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    expect(screen.queryByText('Sign out')).toBeNull();
    expect(document.querySelector('[data-axoview-id="auth-signout"]')).toBeNull();
  });

  test('CONTROL: with the userinfo call succeeding the same grant renders the signed-in control', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: 'Igor', email: 'i@x.y', picture: '' })
    }));
    installBridge();
    const p = auth().signIn();
    auth()._onToken({ access_token: 'working-token', expires_in: 3600, scope: FULL_SCOPE });
    await p;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(auth().user?.email).toBe('i@x.y'); // precondition

    render(<AuthControl />);
    const user = userEvent.setup();
    const avatar = document.querySelector('[data-axoview-id="auth-avatar"]');
    expect(avatar).not.toBeNull();
    await user.click(avatar as HTMLElement);
    expect(document.querySelector('[data-axoview-id="auth-signout"]')).not.toBeNull();
  });
});

describe('AUTH-11 — cancelling "Use a different Google account" leaves the viewer worse off', () => {
  test('CHARACTERIZATION: signOut() runs before signIn(), so a cancelled chooser drops the identity the gate was explaining with', async () => {
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      accessToken: 'tok',
      expiresAt: Date.now() + 3600_000,
      user: { name: 'Igor', email: 'personal@example.com', avatarUrl: '' }
    });
    installBridge();
    localStorage.setItem(
      'axoview-google-profile',
      JSON.stringify({ name: 'Igor', email: 'personal@example.com', avatarUrl: '' })
    );

    render(<DriveDisplayGate />);
    // --- precondition: the no-Picker branch, naming the signed-in account ---
    expect(screen.getByText(/personal@example\.com/)).toBeInTheDocument();
    const button = document.querySelector(
      '[data-axoview-id="drive-display-gate-switch-account"]'
    ) as HTMLElement;
    expect(button).not.toBeNull();

    const user = userEvent.setup();
    await user.click(button);
    // signOut() has already fired and the new sign-in is in flight.
    expect(auth().status).toBe('AUTHENTICATING');
    expect(auth().user).toBeNull();
    expect(localStorage.getItem('axoview-google-profile')).toBeNull();

    // The user closes the chooser without picking.
    await act(async () => {
      auth()._onError(new Error('popup_closed'));
      await Promise.resolve();
    });

    expect(auth().status).toBe('UNAUTHENTICATED');
    // The gate can no longer name the account, and the avatar's amber-dot
    // reconnect affordance (`!!user && UNAUTHENTICATED`) is gone too.
    expect(screen.queryByText(/personal@example\.com/)).toBeNull();
    expect(auth().user).toBeNull();
    const needsReconnect =
      !!auth().user &&
      (auth().status === 'SESSION_EXPIRED' || auth().status === 'UNAUTHENTICATED');
    expect(needsReconnect).toBe(false);
    // No re-read was attempted either — strictly a regression from the state
    // before the click.
    expect(lifecycle.retryDriveDisplayRead).not.toHaveBeenCalled();
  });
});

describe('AUTH-10 — the boot-reconnect gesture listeners vs the effect cleanup', () => {
  /**
   * The claim is a leak, so the probe has to separate three outcomes:
   * (a) the listeners were never armed (setup failure — must not read as a leak),
   * (b) armed and removed on unmount (no leak),
   * (c) armed and NOT removed (the leak).
   * Spying on add/removeEventListener answers all three; a post-unmount gesture
   * then confirms behaviourally.
   */
  async function mountAndArm(strict: boolean) {
    localStorage.setItem(
      'axoview-google-profile',
      JSON.stringify({ name: 'Igor', email: 'i@x.y', avatarUrl: '' })
    );
    useAuthStore.setState({ user: { name: 'Igor', email: 'i@x.y', avatarUrl: '' } });
    // spyOn returns the EXISTING spy on a second call, so calls accumulate across
    // tests unless cleared here (that artifact cost one wrong precondition).
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    add.mockClear();
    remove.mockClear();

    const tree = (
      <AuthProvider>
        <div>child</div>
      </AuthProvider>
    );
    const view = render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);

    await act(async () => {
      await Promise.resolve();
    });
    // --- precondition: the silent boot attempt really ran ---
    expect(loginMock).toHaveBeenCalledWith({ prompt: '', hint: 'i@x.y' });
    // It fails the way a popup-blocked boot attempt does.
    await act(async () => {
      auth()._onError(new Error('popup_failed_to_open'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(auth().status).toBe('UNAUTHENTICATED'); // quiet degradation
    // --- precondition (b) vs (a): the one-shot retry IS armed ---
    const armed = add.mock.calls.filter((c) => c[0] === 'pointerdown' && c[2] === true);
    expect(armed).toHaveLength(1);

    return { view, add, remove };
  }

  test('RIG: StrictMode really does double-invoke effects in this environment', () => {
    // Without this, "no leak under StrictMode" could just mean "StrictMode never
    // double-invoked", which is a rig result masquerading as a verdict.
    let runs = 0;
    function Probe() {
      React.useEffect(() => {
        runs++;
      }, []);
      return null;
    }
    render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>
    );
    expect(runs).toBe(2);
  });

  test('CHARACTERIZATION (StrictMode, the dev default in index.tsx)', async () => {
    const { view, remove } = await mountAndArm(true);
    remove.mockClear();
    loginMock.mockClear();

    view.unmount();

    const removed = remove.mock.calls.filter((c) => c[0] === 'pointerdown');
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    // Whatever the answer, both facts are recorded together so the verdict can't
    // be read off a half-observation.
    expect({
      removedOnUnmount: removed.length > 0,
      firedAfterUnmount: loginMock.mock.calls.length > 0
    }).toEqual({ removedOnUnmount: true, firedAfterUnmount: false });
  });

  test('CONTROL (no StrictMode): the effect cleanup removes the listeners on unmount', async () => {
    const { view, remove } = await mountAndArm(false);
    remove.mockClear();
    loginMock.mockClear();

    view.unmount();

    expect(remove.mock.calls.filter((c) => c[0] === 'pointerdown').length).toBeGreaterThan(0);
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(loginMock).not.toHaveBeenCalled();
  });
});
