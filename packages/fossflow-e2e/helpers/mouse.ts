/**
 * Mouse gesture helpers for FossFLOW e2e tests.
 *
 * Playwright's page.mouse API maps directly to real browser events, making it
 * reliable for right-click drag, middle-click pan, and other gestures that
 * were unreliable in the old Selenium suite.
 */
import { Page } from '@playwright/test';

export interface Coords {
  x: number;
  y: number;
}

/**
 * Performs a right-button drag from `from` to `to`.
 * Used to test the transient right-click pan feature (FF-001).
 *
 * @param steps - Number of intermediate mouse positions (default 10).
 *   More steps = smoother movement, important for threshold detection.
 */
export const rightDrag = async (
  page: Page,
  from: Coords,
  to: Coords,
  steps = 10
) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up({ button: 'right' });
};

/**
 * Performs a right-click (press and release) without any drag movement.
 * Used to test deselect / context menu suppression behaviour.
 */
export const rightClick = async (page: Page, coords: Coords) => {
  await page.mouse.move(coords.x, coords.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
};

/**
 * Performs a middle-button drag from `from` to `to`.
 * Used to test middle-click pan.
 */
export const middleClickDrag = async (
  page: Page,
  from: Coords,
  to: Coords,
  steps = 10
) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up({ button: 'middle' });
};

/**
 * Performs a left-button drag from `from` to `to`.
 * Used to test lasso selection.
 */
export const leftDrag = async (
  page: Page,
  from: Coords,
  to: Coords,
  steps = 10
) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up({ button: 'left' });
};
