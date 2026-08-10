/**
 * `StorageManager` — the provider registry every storage call is routed
 * through. It had zero tests (coverage-baseline: "App storage providers,
 * transfer & storage context").
 *
 * The `setServerStorage` case is A2/STOR-10 from the 2026-07 exploratory
 * campaign: the flag was pushed onto whichever provider happened to be active
 * when boot finished, so a provider that became active later was never told
 * what kind of deploy it is running in. The campaign filed it FALSIFIED — no
 * reachable consumer *today*, because the singleton is constructed with 'local'
 * active — which makes it exactly the kind of latent seam a test should pin.
 */
import { StorageManager } from '../StorageManager';
import type { StorageProvider } from '../types';

function fakeProvider(id: string, opts: { usingServer?: boolean } = {}): StorageProvider {
  const base = {
    id,
    displayName: id,
    requiresAuth: false,
    isAvailable: async () => true,
    listDiagrams: async () => [],
    loadDiagram: async () => ({}),
    saveDiagram: async () => {},
    createDiagram: async () => 'new',
    deleteDiagram: async () => {},
    restoreDiagram: async () => {},
    renameDiagram: async () => {},
    listFolders: async () => [],
    createFolder: async () => 'f',
    deleteFolder: async () => {},
    renameFolder: async () => {},
    moveItem: async () => {},
    getTreeManifest: async () => ({ folders: [], diagrams: [] }),
    saveTreeManifest: async () => {}
  };
  return (
    opts.usingServer === undefined ? base : { ...base, usingServer: opts.usingServer }
  ) as unknown as StorageProvider;
}

describe('StorageManager', () => {
  it('reports the active provider id, defaulting to local before any switch', () => {
    const m = new StorageManager();
    expect(m.activeProviderId).toBe('local');
    m.registerProvider(fakeProvider('local'));
    m.registerProvider(fakeProvider('google-drive'));
    m.setActiveProvider('google-drive');
    expect(m.activeProviderId).toBe('google-drive');
    expect(m.getActiveProvider().id).toBe('google-drive');
  });

  it('refuses to activate a provider that was never registered', () => {
    const m = new StorageManager();
    expect(() => m.setActiveProvider('s3')).toThrow(/not registered/);
  });

  it('pushes serverStorage onto every registered provider, not just the active one', () => {
    const m = new StorageManager();
    const local = fakeProvider('local', { usingServer: false });
    m.registerProvider(local);
    m.registerProvider(fakeProvider('google-drive')); // no usingServer field
    m.setActiveProvider('google-drive');

    m.setServerStorage(true);

    expect(m.serverStorageAvailable).toBe(true);
    // The local provider was NOT active when boot resolved the deploy mode, and
    // it is the one whose reads/writes depend on knowing it.
    expect((local as unknown as { usingServer: boolean }).usingServer).toBe(true);
  });
});
