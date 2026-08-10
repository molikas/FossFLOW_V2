/**
 * A2/STOR-12 — "which place is active" is held in two objects: the module-level
 * `StorageManager` singleton, which outlives every React tree, and
 * `AppStorageProvider`'s state, which does not. The state used to be seeded
 * `'local'`, so a remount (any /display round trip — `EditorPage` is the element
 * of every route) re-rendered as Local while every read and write still went to
 * Drive, and `remoteStorageActive` picks the autosave-vs-session-dirty branch,
 * the status cluster and the navigation guards.
 *
 * Promoted from the probe lane (`__explore__/A2/remount-stor-12`) with the bug
 * fixed. Own file: `AppStorageProvider`'s singleton is per module registry, and
 * this suite deliberately mutates it.
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

import { AppStorageProvider, useAppStorage } from '../AppStorageContext';

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

describe('the active place survives a provider remount', () => {
  it('re-reads it from the manager rather than resetting to local', async () => {
    const first = renderStorage();
    await waitFor(() => expect(first.ctx().isInitialized).toBe(true));

    // Follow a Drive diagram, exactly as `openDiagramById` does.
    act(() => first.ctx().setActiveProviderId('google-drive'));
    // PRECONDITION: both copies agree while the tree is alive.
    expect(first.ctx().activeProviderId).toBe('google-drive');
    expect(first.ctx().remoteStorageActive).toBe(true);
    expect(first.ctx().storageManager!.getActiveProvider().id).toBe('google-drive');

    first.unmount();

    // The route changed and the tree came back.
    const second = renderStorage();
    await waitFor(() => expect(second.ctx().isInitialized).toBe(true));

    expect(second.ctx().activeProviderId).toBe(
      second.ctx().storageManager!.activeProviderId
    );
    expect(second.ctx().activeProviderId).toBe('google-drive');
    // …and the branch every mode-sensitive consumer reads follows it.
    expect(second.ctx().remoteStorageActive).toBe(true);
    expect(second.ctx().storageManager!.getActiveProvider().id).toBe('google-drive');
  });
});
