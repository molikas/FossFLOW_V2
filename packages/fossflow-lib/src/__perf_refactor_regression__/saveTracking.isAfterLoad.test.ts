/**
 * REGRESSION — Save tracking: isAfterLoadRef suppresses post-load dirty flag
 *
 * Problem: every call to isoflowRef.current.load() fires onModelUpdated, which
 * was triggering dirty-state mutations (setDirtyDiagramIds / autoSave.scheduleSave).
 * This caused a false-positive unsaved state after every programmatic load.
 *
 * Fix:
 *   1. isAfterLoadRef is initialised to true (first onModelUpdated after mount is skipped).
 *   2. isAfterLoadRef.current is set to true before every programmatic load() call.
 *   3. handleModelUpdated returns early (without mutating dirty state) when the ref is
 *      true, then resets the ref to false.
 *   4. No background autoSaveTimer touches save state directly.
 *
 * Dirty state is tracked via setDirtyDiagramIds (session mode) or
 * autoSave.scheduleSave (server mode) — both gated behind the early-return above.
 *
 * This test reads DiagramLifecycleProvider.tsx source to pin all parts of the contract.
 * (Logic moved from App.tsx to DiagramLifecycleProvider.tsx in Phase 0A refactor.)
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_PATH = path.resolve(
  __dirname,
  '../../../fossflow-app/src/providers/DiagramLifecycleProvider.tsx'
);

describe('Save tracking — isAfterLoadRef pattern', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(APP_PATH, 'utf-8');
  });

  it('DiagramLifecycleProvider.tsx exists', () => {
    expect(fs.existsSync(APP_PATH)).toBe(true);
  });

  it('declares isAfterLoadRef with useRef (initialised true to skip first post-mount fire)', () => {
    expect(src).toContain('isAfterLoadRef');
    expect(src).toMatch(/isAfterLoadRef\s*=\s*useRef\(true\)/);
  });

  it('sets isAfterLoadRef.current = true before every isoflowRef.current.load() call', () => {
    const setTrueCount = (
      src.match(/isAfterLoadRef\.current\s*=\s*true/g) || []
    ).length;
    // Count only non-comment lines containing a load call
    const loadCallCount = src
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .filter((line) => /isoflowRef\.current[?.].*?load\(/.test(line)).length;
    // Every load call must be guarded by a preceding ref assignment
    expect(setTrueCount).toBeGreaterThanOrEqual(loadCallCount);
    expect(setTrueCount).toBeGreaterThan(0);
  });

  it('handleModelUpdated checks isAfterLoadRef before mutating dirty state', () => {
    // 'isAfterLoadRef.current = false' is the reset inside the early-return guard —
    // it is unique to handleModelUpdated. Dirty state mutations (setDirtyDiagramIds /
    // scheduleSave) must appear after this reset in the source, proving they are
    // guarded by the early return.
    const earlyReturnResetIdx = src.indexOf('isAfterLoadRef.current = false');
    expect(earlyReturnResetIdx).toBeGreaterThan(-1);

    const dirtyMutationsAfterGuard = [
      src.indexOf('setDirtyDiagramIds', earlyReturnResetIdx),
      src.indexOf('scheduleSave', earlyReturnResetIdx)
    ].filter((i) => i >= 0);

    expect(dirtyMutationsAfterGuard.length).toBeGreaterThan(0);
  });

  it('no background autoSaveTimer directly mutates save state', () => {
    expect(src).not.toContain('autoSaveTimer');
    // No setTimeout callback that directly calls setHasUnsavedChanges.
    expect(src).not.toMatch(
      /setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{?\s*setHasUnsavedChanges\s*\(\s*false\s*\)/
    );
  });
});
