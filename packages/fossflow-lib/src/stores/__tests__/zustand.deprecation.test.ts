/**
 * REGRESSION — Zustand deprecated API
 *
 * Zustand's useStore(store, selector, equalityFn) overload is deprecated.
 * All three stores must use useStoreWithEqualityFn from 'zustand/traditional'.
 *
 * This test spies on console.warn to confirm no deprecation message fires when
 * the store modules are loaded, and verifies the hook exports are present.
 */

describe('Zustand stores — no deprecated API warning', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.resetModules();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('loading uiStateStore does not trigger a Zustand deprecation warning', () => {
    require('src/stores/uiStateStore');
    const deprecationWarnings = warnSpy.mock.calls.filter((args) =>
      args.some((a: unknown) => typeof a === 'string' && a.includes('DEPRECATED'))
    );
    expect(deprecationWarnings).toHaveLength(0);
  });

  it('loading modelStore does not trigger a Zustand deprecation warning', () => {
    require('src/stores/modelStore');
    const deprecationWarnings = warnSpy.mock.calls.filter((args) =>
      args.some((a: unknown) => typeof a === 'string' && a.includes('DEPRECATED'))
    );
    expect(deprecationWarnings).toHaveLength(0);
  });

  it('loading sceneStore does not trigger a Zustand deprecation warning', () => {
    require('src/stores/sceneStore');
    const deprecationWarnings = warnSpy.mock.calls.filter((args) =>
      args.some((a: unknown) => typeof a === 'string' && a.includes('DEPRECATED'))
    );
    expect(deprecationWarnings).toHaveLength(0);
  });

  it('useStoreWithEqualityFn is used (not useStore) in all three stores', () => {
    // Belt-and-suspenders: verify the source text contains the right import.
    // This catches a revert that the warn spy might miss if Zustand's warning
    // behaviour changes in a future version.
    const fs = require('fs');
    const path = require('path');
    const storeDir = path.resolve(__dirname, '..');

    const storeFiles = ['uiStateStore.tsx', 'modelStore.tsx', 'sceneStore.tsx'];
    storeFiles.forEach((file) => {
      const src = fs.readFileSync(path.join(storeDir, file), 'utf-8');
      expect(src).toContain('useStoreWithEqualityFn');
      expect(src).not.toMatch(/import.*useStore.*from 'zustand'/);
    });
  });
});
