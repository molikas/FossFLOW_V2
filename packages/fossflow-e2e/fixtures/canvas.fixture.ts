import { Page } from '@playwright/test';
import { appTest, AppPage } from './app.fixture';
import { getUiMode, getItemControls, getScroll, getModelHistoryLength } from '../helpers/store';

export class CanvasPage extends AppPage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Place a node on the canvas by dragging from the icon grid to canvas coords.
   *
   * Flow (matches PlaceIcon.ts):
   *   1. Click "Add item" toolbar button → enters PLACE_ICON mode
   *   2. mousedown on first icon → sets mode.id (selects the icon)
   *   3. dragTo canvas position → mouseup on renderer fires PlaceIcon.mouseup → places node
   */
  async placeNode(x = 400, y = 300) {
    await this.page.getByRole('button', { name: /Add item/i }).click();
    const firstIcon = this.page.locator('[data-testid="icon-grid-item"]').first();
    await firstIcon.waitFor({ state: 'visible' });
    const canvas = this.page.locator('[data-testid="fossflow-canvas"]');
    // dragTo: mousedown on icon (selects icon id) → move → mouseup at canvas position (places node)
    await firstIcon.dragTo(canvas, { targetPosition: { x, y } });
    // Brief wait for React to re-render the new node
    await this.page.waitForTimeout(200);
  }

  /**
   * Exit PLACE_ICON mode and enter CURSOR mode by clicking the Select toolbar button.
   * Call this after placeNode() before performing canvas interactions.
   */
  async activateCursor() {
    await this.page.getByRole('button', { name: /Select/i }).click();
  }

  /**
   * Select a node by clicking the canvas at the given position.
   * Requires CURSOR mode to be active — call activateCursor() first.
   */
  async selectAt(x: number, y: number) {
    await this.page.locator('[data-testid="fossflow-canvas"]').click({ position: { x, y } });
    // Wait for itemControls to populate
    await this.page.waitForTimeout(150);
  }

  /**
   * Place a rectangle via the canvas empty-space context menu.
   *
   * Flow: left-click on empty canvas tile → context menu appears → click "Add Rectangle"
   */
  async placeRectangle(x = 300, y = 400) {
    // Ensure CURSOR mode
    await this.activateCursor();
    // Left-click empty canvas to trigger context menu
    await this.page.locator('[data-testid="fossflow-canvas"]').click({ position: { x, y } });
    const addRect = this.page.getByRole('menuitem', { name: /Add Rectangle/i });
    await addRect.waitFor({ state: 'visible', timeout: 3000 });
    await addRect.click();
    await this.page.waitForTimeout(200);
  }

  /** Count the number of node images currently on the canvas. */
  async countNodes(): Promise<number> {
    return this.page.locator('[data-testid="fossflow-canvas"] img').count();
  }

  /** Count the number of rectangle elements on the canvas. */
  async countRectangles(): Promise<number> {
    return this.page.locator('[data-testid="fossflow-canvas"] rect[width]').count();
  }

  /** Read the current UI mode from the Zustand store. */
  async getMode() {
    return getUiMode(this.page);
  }

  /** Read the current itemControls state from the Zustand store. */
  async getItemControls() {
    return getItemControls(this.page);
  }

  /** Read the current scroll position from the Zustand store. */
  async getScroll() {
    return getScroll(this.page);
  }

  /** Read the undo history length (past entries) from the model store. */
  async getHistoryLength() {
    return getModelHistoryLength(this.page);
  }
}

export const canvasTest = appTest.extend<{ canvas: CanvasPage }>({
  canvas: async ({ page }, use) => {
    await use(new CanvasPage(page));
  },
});
