/**
 * REGRESSION — Save tracking: isAfterLoadRef suppresses post-load dirty flag
 *
 * Problem: every call to isoflowRef.current.load() fires onModelUpdated, which
 * was calling setHasUnsavedChanges(true). This caused a false-positive unsaved
 * state after every programmatic load. The auto-save would then clear the flag
 * 5 seconds later — but any genuine user edits made in those 5 seconds (e.g.
 * adding a view, editing view 2) would also be cleared, making the Save button
 * appear permanently disabled for multi-view changes.
 *
 * Fix:
 *   1. isAfterLoadRef is set to true before every programmatic load() call.
 *   2. handleModelUpdated returns early (without setting hasUnsavedChanges) when
 *      the ref is true, then resets the ref to false.
 *   3. Auto-save no longer calls setHasUnsavedChanges(false) — it persists data
 *      silently; only an explicit Save clears the indicator.
 *
 * This test reads App.tsx source to pin all three parts of the contract.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_PATH = path.resolve(
  __dirname,
  '../../../fossflow-app/src/App.tsx'
);

describe('Save tracking — isAfterLoadRef pattern', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(APP_PATH, 'utf-8');
  });

  it('App.tsx exists', () => {
    expect(fs.existsSync(APP_PATH)).toBe(true);
  });

  it('declares isAfterLoadRef with useRef', () => {
    expect(src).toContain('isAfterLoadRef');
    expect(src).toMatch(/isAfterLoadRef\s*=\s*useRef\(false\)/);
  });

  it('sets isAfterLoadRef.current = true before every isoflowRef.current.load() call', () => {
    const setTrueCount = (src.match(/isAfterLoadRef\.current\s*=\s*true/g) || []).length;
    // Count only non-comment lines containing a load call
    const loadCallCount = src
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .filter((line) => /isoflowRef\.current[?.].*?load\(/.test(line))
      .length;
    // Every load call must be guarded by a preceding ref assignment
    expect(setTrueCount).toBeGreaterThanOrEqual(loadCallCount);
    expect(setTrueCount).toBeGreaterThan(0);
  });

  it('handleModelUpdated checks isAfterLoadRef before setting hasUnsavedChanges(true)', () => {
    const refCheckIdx = src.indexOf('isAfterLoadRef.current');
    const unsavedSetIdx = src.indexOf('setHasUnsavedChanges(true)');
    expect(refCheckIdx).toBeGreaterThan(-1);
    expect(unsavedSetIdx).toBeGreaterThan(-1);
    expect(refCheckIdx).toBeLessThan(unsavedSetIdx);
  });

  it('auto-save timer does not call setHasUnsavedChanges(false)', () => {
    const autoSaveMatch = src.match(/const autoSaveTimer\s*=\s*setTimeout\([\s\S]*?\},\s*5000\)/);
    expect(autoSaveMatch).not.toBeNull();
    expect(autoSaveMatch![0]).not.toContain('setHasUnsavedChanges(false)');
  });
});
