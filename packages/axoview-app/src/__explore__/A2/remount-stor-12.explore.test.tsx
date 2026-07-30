/**
 * A2/STOR-12 — the active place is stored twice: in the module-level
 * `StorageManager` singleton (which outlives every React tree) and in
 * `AppStorageProvider`'s `useState('local')` (which does not). A remount of the
 * provider therefore resets the React copy while the singleton keeps routing
 * reads and writes to Drive.
 *
 * This file settles the DESYNC half in jsdom. The remaining question — does an
 * in-app route change actually remount `EditorPage`? — is a platform behaviour,
 * so it is asked of a real browser in
 * `tests-exploratory/A2-storage/remount-stor-12.explore.spec.ts` rather than
 * inferred from the react-router docs.
 */
import { render, waitFor, act } from '@testing-library/react';

jest.mock('../../hooks/useRuntimeConfig', () => ({
  fetchRuntimeConfig: async () => ({
    serverStorage: false,
    googleClientId: null,
    googleApiKey: null,
    drivePublicPreview: false,
    googleProjectNumber: null,
    driveScopes: [],
    authMode: 'none'
  })
}));

import { AppStorageProvider, useAppStorage } from '../../providers/AppStorageContext';

type Ctx = ReturnType<typeof useAppStorage>;

function renderStorage() {
  let seen: Ctx | null = null;
  function Probe() {
    seen = useAppStorage();
    return null;
  }
  const utils = render(
    <AppStorageProvider>
      <Probe />
    </AppStorageProvider>
  );
  return { ...utils, ctx: () => seen! };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('STOR-12 — a provider remount resets the React place but not the real one', () => {
  it('characterization: after a remount the context says local while the manager still routes to Drive', async () => {
    const first = renderStorage();
    await waitFor(() => expect(first.ctx().isInitialized).toBe(true));

    // Follow a Drive diagram, exactly as `openDiagramById` does.
    act(() => first.ctx().setActiveProviderId('google-drive'));
    // PRECONDITION: both copies agree while the tree is alive.
    expect(first.ctx().activeProviderId).toBe('google-drive');
    expect(first.ctx().remoteStorageActive).toBe(true);
    expect(first.ctx().storageManager!.activeProviderId).toBe('google-drive');
    expect(first.ctx().storageManager!.getActiveProvider().id).toBe('google-drive');

    first.unmount();

    // The route changed and the tree came back.
    const second = renderStorage();
    await waitFor(() => expect(second.ctx().isInitialized).toBe(true));

    // React state is back to its initial value…
    expect(second.ctx().activeProviderId).toBe('local');
    expect(second.ctx().remoteStorageActive).toBe(false);
    // …while every actual read and write still goes to Drive, because the
    // manager is a module-level singleton that no remount touches.
    expect(second.ctx().storageManager!.activeProviderId).toBe('google-drive');
    expect(second.ctx().storageManager!.getActiveProvider().id).toBe('google-drive');
  });

  it.failing('STOR-12: the two copies of "which place is active" agree after a remount', async () => {
    const first = renderStorage();
    await waitFor(() => expect(first.ctx().isInitialized).toBe(true));
    act(() => first.ctx().setActiveProviderId('google-drive'));
    expect(first.ctx().storageManager!.activeProviderId).toBe('google-drive'); // precondition
    first.unmount();

    const second = renderStorage();
    await waitFor(() => expect(second.ctx().isInitialized).toBe(true));
    // Expected: one source of truth. Actual: `remoteStorageActive` (which picks
    // the autosave-vs-session-dirty branch, the status cluster and the
    // navigation guards) is false while the writes land in Drive.
    expect(second.ctx().activeProviderId).toBe(
      second.ctx().storageManager!.activeProviderId
    );
  });
});
