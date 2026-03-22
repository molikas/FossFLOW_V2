import { test as base, Page } from '@playwright/test';

export class AppPage {
  constructor(readonly page: Page) {}

  async dismissHintTooltips() {
    // Dismiss ConnectorHintTooltip and ImportHintTooltip if present.
    // Both have an aria role of "tooltip" and disappear on any interaction.
    // We press Escape once to dismiss any open tooltip overlays.
    await this.page.keyboard.press('Escape');
    // Short wait for tooltip exit animation
    await this.page.waitForTimeout(300);
  }
}

async function waitForMount(page: Page) {
  // Wait for the canvas container to be present and visible
  await page.locator('[data-testid="fossflow-canvas"]').waitFor({ state: 'visible', timeout: 15_000 });
}

export const appTest = base.extend<{ app: AppPage }>({
  app: async ({ page }, use) => {
    await page.goto('/');
    await waitForMount(page);
    const app = new AppPage(page);
    await app.dismissHintTooltips();
    await use(app);
  },
});
