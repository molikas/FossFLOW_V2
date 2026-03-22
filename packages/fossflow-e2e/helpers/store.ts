/**
 * Typed wrappers around window.__fossflow__ — the Zustand store instances
 * exposed in development builds by Isoflow.tsx.
 *
 * These helpers are the single point of truth for reading app state in tests.
 * They replace the ~100-line React fiber-tree injection used by the old Selenium suite.
 *
 * Production builds are completely unaffected: the exposure block in Isoflow.tsx
 * is inside `process.env.NODE_ENV !== 'production'` which the bundler tree-shakes.
 */
import { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// UI state reads
// ---------------------------------------------------------------------------

/** Returns the full mode state object (type, mousedownHandled, selection, etc.) */
export const getUiMode = (page: Page) =>
  page.evaluate(() => (window as any).__fossflow__.ui.getState().mode);

/** Returns the current scroll position ({ x, y }). */
export const getScroll = (page: Page) =>
  page.evaluate(() => (window as any).__fossflow__.ui.getState().scroll);

/** Returns the current itemControls state (null when nothing is selected). */
export const getItemControls = (page: Page) =>
  page.evaluate(() => (window as any).__fossflow__.ui.getState().itemControls);

/** Returns the zoom level (e.g. 0.9 for 90%). */
export const getZoom = (page: Page) =>
  page.evaluate(() => (window as any).__fossflow__.ui.getState().zoom);

// ---------------------------------------------------------------------------
// Model / history reads
// ---------------------------------------------------------------------------

/** Returns the number of undo steps available (past entries in history). */
export const getModelHistoryLength = (page: Page) =>
  page.evaluate(() => (window as any).__fossflow__.model.getState().history.past.length);

// ---------------------------------------------------------------------------
// UI state writes (for test setup, e.g. disabling pan settings)
// ---------------------------------------------------------------------------

/** Update pan settings without touching the UI. Useful for P-9 (rightClickPan=false). */
export const setPanSettings = (page: Page, settings: Record<string, boolean>) =>
  page.evaluate((s) => {
    (window as any).__fossflow__.ui.getState().actions.setPanSettings(s);
  }, settings);
