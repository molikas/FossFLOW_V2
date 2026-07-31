/**
 * AuthControl.identity.test.tsx — promoted from the 2026-07 exploratory lane
 * (`__explore__/S1/auth-05-10-11`) when wave 2 fixed S1/AUTH-05.
 *
 * `AuthControl` gates its whole signed-in branch on `!!user`
 * (`signedIn = (AUTHENTICATED || REFRESHING) && !!user`), and `user` comes from
 * one best-effort `oauth2/v3/userinfo` call that the store treated as cosmetic.
 * So an authenticated, token-holding session whose userinfo failed rendered the
 * grey never-signed-in person icon: no name, no avatar and — the part that
 * matters — NO Sign out item, while Drive saves and opens kept working.
 *
 * The store now installs a placeholder identity when userinfo fails (in memory
 * only; AUTH-13 keeps it out of the persisted hint), so this asserts the DOM
 * consequence the entry was actually about. Mock policy follows the existing
 * `DriveAccessRequiredDialog.test.tsx` pattern: the component is real, only its
 * environment is faked.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';

const FULL_SCOPE =
  'openid email profile https://www.googleapis.com/auth/drive.file';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => {
      if (typeof fallback === 'string') return fallback;
      const opts = (fallback ?? {}) as Record<string, unknown> & {
        defaultValue?: string;
      };
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
    runtimeConfig: {
      googleClientId: 'test-client-id',
      googleApiKey: null,
      googleProjectNumber: null
    }
  })
}));

jest.mock('../../providers/DiagramLifecycleProvider', () => ({
  useDiagramLifecycle: () => ({
    handleGoogleSignedOut: jest.fn((after?: () => void) => after?.()),
    driveDisplayFileId: null,
    driveDisplayState: 'idle',
    retryDriveDisplayRead: jest.fn()
  })
}));

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));

jest.mock('@react-oauth/google', () => {
  const ReactLocal = jest.requireActual<typeof React>('react');
  return {
    GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) =>
      ReactLocal.createElement(ReactLocal.Fragment, null, children),
    useGoogleLogin: () => jest.fn()
  };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const { AuthControl } =
  require('../AuthControl') as typeof import('../AuthControl');
/* eslint-enable @typescript-eslint/no-var-requires */

function reset() {
  useAuthStore.setState({
    status: 'UNAUTHENTICATED',
    user: null,
    accessToken: null,
    expiresAt: null,
    driveScopeGranted: null,
    _requestToken: null,
    _revoke: null,
    _waiters: [],
    _absorbStaleError: false
  });
  useNotificationStore.setState({ queue: [] });
  localStorage.clear();
}

beforeEach(reset);
afterEach(reset);

/** A full grant whose userinfo call fails — offline blip, CSP, a 403 from Google. */
async function grantWithFailingUserinfo() {
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => {
    throw new Error('offline');
  });
  useAuthStore.getState()._setBridge({
    requestToken: jest.fn(),
    revoke: jest.fn()
  });
  const p = useAuthStore.getState().signIn();
  useAuthStore.getState()._onToken({
    access_token: 'live-token',
    expires_in: 3600,
    scope: FULL_SCOPE
  });
  await p;
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('AUTH-05 — a userinfo failure must not hide the sign-out affordance', () => {
  test('the session renders as signed in, with Sign out reachable', async () => {
    await grantWithFailingUserinfo();

    // Precondition: the session really is live — the bug was never about the
    // token, only about how it rendered.
    expect(useAuthStore.getState().status).toBe('AUTHENTICATED');
    await expect(useAuthStore.getState().getValidToken()).resolves.toBe(
      'live-token'
    );

    render(<AuthControl />);
    const avatar = document.querySelector('[data-axoview-id="auth-avatar"]');
    expect(avatar).not.toBeNull();
    expect(
      document.querySelector('[data-axoview-id="auth-account"]')
    ).toBeNull();

    await userEvent.click(avatar as Element);
    expect(
      document.querySelector('[data-axoview-id="auth-signout"]')
    ).not.toBeNull();
  });

  test('a session with a real profile is unchanged (the placeholder is a fallback, not a replacement)', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        picture: ''
      })
    }));
    useAuthStore.getState()._setBridge({
      requestToken: jest.fn(),
      revoke: jest.fn()
    });
    const p = useAuthStore.getState().signIn();
    useAuthStore.getState()._onToken({
      access_token: 'tok',
      expires_in: 3600,
      scope: FULL_SCOPE
    });
    await p;
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    render(<AuthControl />);
    await userEvent.click(
      document.querySelector('[data-axoview-id="auth-avatar"]') as Element
    );
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  test('a genuinely signed-out session still shows the never-signed-in control', () => {
    render(<AuthControl />);
    expect(
      document.querySelector('[data-axoview-id="auth-account"]')
    ).not.toBeNull();
    expect(document.querySelector('[data-axoview-id="auth-avatar"]')).toBeNull();
  });
});
