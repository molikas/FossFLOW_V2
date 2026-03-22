import { Page } from '@playwright/test';
import { appTest, AppPage } from './app.fixture';
import { getUiMode, getItemControls, getScroll, getModelHistoryLength } from '../helpers/store';

export class CanvasPage extends AppPage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Place a node on the canvas by opening the Add Item panel, picking the
   * first available icon, and clicking the given canvas coordinates.
   */
  async placeNode(x = 400, y = 300) {
    // Open the Add Item panel via the toolbar button
    await this.page.getByRole('button', { name: /Add item/i }).click();
    // Wait for the icon grid to appear and click the first icon
    const firstIcon = this.page.locator('[data-testid="icon-grid-item"]').first();
    await firstIcon.waitFor({ state: 'visible' });
    await firstIcon.click();
    // The panel closes; now click the canvas to place the node
    await this.page.locator('[data-testid="fossflow-canvas"]').click({ position: { x, y } });
  }

  /** Count the number of node images currently on the canvas. */
  async countNodes(): Promise<number> {
    return this.page.locator('[data-testid="fossflow-canvas"] img').count();
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
    // app fixture already ran goto + waitForMount + dismissHintTooltips via the base fixture.
    // We re-use the page from the extended fixture chain.
    await use(new CanvasPage(page));
  },
});
