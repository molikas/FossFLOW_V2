/**
 * A2/STOR-10 — `StorageManager.setServerStorage` pushes `usingServer` onto
 * `getActiveProvider()`, i.e. onto ONE provider, and `setActiveProvider` never
 * re-syncs it. The prediction was that this silently serves per-tab
 * sessionStorage on a server deploy.
 *
 * `StorageManager.ts` has zero tests, so the mechanism half is new ground; the
 * second test settles reachability by rendering the real `AppStorageProvider`
 * (the only caller) rather than reasoning about its call order.
 *
 * NOTE: kept in its own file. A `jest.doMock` of `useRuntimeConfig` plus
 * `jest.resetModules()` leaks across tests in one file (it fed the STOR-11
 * probe a stubbed `fetchRuntimeConfig` and its fetch count silently read 0),
 * and re-importing a React component through a reset module registry yields a
 * null dispatcher (`Cannot read properties of null (reading 'useState')`).
 */
import { render, waitFor } from '@testing-library/react';
import { StorageManager } from '../../services/storage/StorageManager';
import { LocalStorageProvider } from '../../services/storage/providers/LocalStorageProvider';
import { GoogleDriveProvider } from '../../services/storage/providers/GoogleDriveProvider';

jest.mock('../../hooks/useRuntimeConfig', () => ({
  fetchRuntimeConfig: async () => ({
    serverStorage: true,
    googleClientId: null,
    googleApiKey: null,
    drivePublicPreview: false,
    googleProjectNumber: null,
    driveScopes: [],
    authMode: 'none'
  })
}));

import { AppStorageProvider, useAppStorage } from '../../providers/AppStorageContext';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

function freshManager() {
  const m = new StorageManager();
  const local = new LocalStorageProvider('http://localhost:3001');
  m.registerProvider(local);
  m.registerProvider(new GoogleDriveProvider());
  return { m, local };
}

describe('STOR-10 — setServerStorage is order-dependent', () => {
  it('characterization: the desync is producible, and a provider switch never re-syncs it', () => {
    const { m, local } = freshManager();
    m.setActiveProvider('google-drive');
    m.setServerStorage(true);

    // The manager knows the deploy is server-backed…
    expect(m.serverStorageAvailable).toBe(true);
    // …the local provider never learns, so it would answer from sessionStorage.
    expect(local.usingServer).toBe(false);
    // And switching to it does not repair the state.
    m.setActiveProvider('local');
    expect(local.usingServer).toBe(false);

    // The safe order, for contrast — the same two calls, swapped.
    const good = freshManager();
    good.m.setActiveProvider('local');
    good.m.setServerStorage(true);
    expect(good.local.usingServer).toBe(true);
  });

  it('the only caller uses the safe order: after a real boot the local provider is server-backed', async () => {
    let seen: ReturnType<typeof useAppStorage> | null = null;
    function Probe() {
      seen = useAppStorage();
      return null;
    }
    render(
      <AppStorageProvider>
        <Probe />
      </AppStorageProvider>
    );

    // PRECONDITION: the config probe resolved and the deploy is server-backed —
    // otherwise `usingServer: false` below would prove nothing.
    await waitFor(() => expect(seen!.serverStorageAvailable).toBe(true));

    // The singleton runs `setActiveProvider('local')` at module scope, so the
    // flag lands on the provider that reads it. The predicted silent-
    // sessionStorage state is NOT reachable through the shipped boot path.
    const local = seen!.storageManager!.getProvider('local') as LocalStorageProvider;
    expect(local.usingServer).toBe(true);
  });
});
