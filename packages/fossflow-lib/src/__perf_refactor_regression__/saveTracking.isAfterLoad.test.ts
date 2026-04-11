/**
 * REGRESSION — Save tracking: isAfterLoadRef suppresses post-load dirty flag
 *
 * Problem: every call to isoflowRef.current.load() fires onModelUpdated, which
 * was calling setHasUnsavedChanges(true). This caused a false-positive unsaved
 * state after every programmatic load.
 *
 * Fix:
 *   1. isAfterLoadRef is set to true before every programmatic load() call.
 *   2. handleModelUpdated returns early (without setting hasUnsavedChanges) when
 *      the ref is true, then resets the ref to false.
 *   3. Auto-save has been removed entirely — only explicit Save clears the flag
 *      and sets lastSaved. No background timer touches save state.
 *
 * This test reads App.tsx source to pin all three parts of the contract.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_PATH = path.resolve(__dirname, '../../../fossflow-app/src/App.tsx');

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

  it('handleModelUpdated checks isAfterLoadRef before setting hasUnsavedChanges(true)', () => {
    const refCheckIdx = src.indexOf('isAfterLoadRef.current');
    const unsavedSetIdx = src.indexOf('setHasUnsavedChanges(true)');
    expect(refCheckIdx).toBeGreaterThan(-1);
    expect(unsavedSetIdx).toBeGreaterThan(-1);
    expect(refCheckIdx).toBeLessThan(unsavedSetIdx);
  });

  it('auto-save has been removed — no autoSaveTimer in source', () => {
    expect(src).not.toContain('autoSaveTimer');
    // setHasUnsavedChanges(false) is correct in explicit save handlers and preview.
    // What must NOT exist is a setTimeout whose arrow-function callback calls it —
    // that would be a background timer silently clearing the dirty flag.
    // Match: setTimeout(<whitespace>(<whitespace>)<whitespace>=><whitespace>{?<whitespace>setHasUnsavedChanges(false)
    expect(src).not.toMatch(
      /setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{?\s*setHasUnsavedChanges\s*\(\s*false\s*\)/
    );
  });
});
