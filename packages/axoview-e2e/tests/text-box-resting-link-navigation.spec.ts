/**
 * A #diagram: link inside a RESTING text box cannot be clicked — the
 * full-viewport `canvas-interactions` box is mounted after the resting
 * <TextBoxes> SceneLayer, so it wins hit-testing over everything below it and
 * ADR 0034's navigation handler never receives the click.
 *
 * ACCEPTED OPEN by owner ruling 2026-08-10: the fix needs a new interaction
 * surface (promoting a resting linked box above the interactions box, the way
 * an inline-edited box already is) rather than a tail fix, so this ships as a
 * committed expected-fail — the detector for when that surface lands.
 *
 * known_issues: "A link inside a text box cannot be clicked" (exploratory
 * campaign RND-07). Was tests-exploratory/R4-renderer/rnd-02-07-overlay-gates.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../pom/CanvasPOM';
import { getViewTextBoxCount } from '../helpers/store';

const CANVAS = '[data-testid="axoview-canvas"]';
const LINK_TEXT = 'GOTOZQP';

/** Give the (single) text box on the active view rich content with an <a>. */
const seedLinkedTextBox = (page: Page) =>
  page.evaluate((text: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const html = `<p><a href="#diagram:other-diagram">${text}</a></p>`;
    const views = m.views.map((v: any) =>
      v.id === viewId
        ? {
            ...v,
            textBoxes: (v.textBoxes ?? []).map((t: any, i: number) =>
              i === 0 ? { ...t, content: html } : t
            )
          }
        : v
    );
    m.actions.set({ views }, true);
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return { count: (after?.textBoxes ?? []).length };
  }, LINK_TEXT);

test.fail(
  'clicking a #diagram: link in a resting text box should navigate',
  async ({ page, app }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);

    const at = await canvas.tileToScreen({ x: 0, y: 0 });
    await canvas.placeTextBoxAt(at, { text: 'seed' });
    await expect
      .poll(() => getViewTextBoxCount(page), { timeout: 5_000 })
      .toBe(1);

    const seeded = await seedLinkedTextBox(page);
    expect(seeded.count, 'PRECONDITION: one text box exists').toBe(1);
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setEditingTextBoxId(null);
      ui.actions.setItemControls(null);
      ui.actions.setSelectedIds([]);
    });
    await page.waitForTimeout(500);

    const anchor = page.locator(`${CANVAS} a[href^="#diagram:"]`);
    await expect(anchor).toHaveCount(1);
    const box = (await anchor.boundingBox())!;
    expect(box.width, 'PRECONDITION: the anchor has real layout').toBeGreaterThan(0);

    await page.evaluate(() => {
      (window as any).__rnd07nav = 0;
      window.addEventListener('axoview-navigate-to-diagram', () => {
        (window as any).__rnd07nav += 1;
      });
    });
    // Ctrl+click — the documented EDIT-mode navigation chord.
    await page.keyboard.down('Control');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);

    expect(await page.evaluate(() => (window as any).__rnd07nav)).toBe(1);
  }
);
