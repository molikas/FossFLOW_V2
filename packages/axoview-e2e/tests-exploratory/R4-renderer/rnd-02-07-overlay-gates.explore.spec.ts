/**
 * R4 — RND-02 and RND-07: two omissions in what the Renderer's composition root
 * hands to (and mounts around) its DOM overlay layers.
 *
 * RND-02 — every scene layer the Renderer feeds gates on `useLayerContext`
 * (Nodes, Connectors, Rectangles, TextBoxes, NodeLabelHitLayer, and all four
 * bulk canvases) EXCEPT `ConnectorLabels`/`ConnectorLabel`, which never import
 * it. Hiding a layer should therefore remove a connector's body but leave its
 * label chip painted.
 *
 * RND-07 — the full-viewport `canvas-interactions` box is mounted AFTER the
 * resting `<TextBoxes>` SceneLayer (Renderer.tsx), so it wins hit-testing over
 * everything below it. `TextBox.onRestingClick` — ADR 0034's `#diagram:`
 * navigation handler, plus any plain `<a>` in the rich text — therefore never
 * receives a click. (The INLINE-EDITED box is deliberately promoted ABOVE the
 * interactions box for exactly this reason; the resting one was not.)
 *
 * Rig notes (COLDSTART):
 *  - destructure `app`, not just `page` — the fixture is lazy.
 *  - assert the PRECONDITION: that the layer really covers the connector, that
 *    the body really did disappear, that the link element really exists.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount, getViewTextBoxCount } from '../../helpers/store';
import { paintedPixels } from '../_rig/glOracles';

const LABEL_TEXT = 'ZQPLABELZQP';
const CANVAS = '[data-testid="axoview-canvas"]';

const modeType = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().mode.type as string
  );

async function drawConnector(
  page: Page,
  canvas: CanvasPOM,
  from: CanvasPoint,
  to: CanvasPoint
) {
  await page.keyboard.press('c');
  await expect.poll(() => modeType(page), { timeout: 2_000 }).toBe('CONNECTOR');
  await canvas.clickAt(from);
  await page.waitForTimeout(100);
  await canvas.clickAt(to);
  await page.keyboard.press('Escape');
}

/** Name the (single) connector on the active view, through the model store. */
const nameConnector = (page: Page, text: string) =>
  page.evaluate((name: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const views = m.views.map((v: any) =>
      v.id === viewId
        ? {
            ...v,
            connectors: (v.connectors ?? []).map((c: any, i: number) =>
              i === 0
                ? {
                    ...c,
                    name,
                    showLabel: true,
                    // getConnectorLabels renders `labels[]` (or the legacy
                    // description/start/end fields) — a bare `name` draws NO
                    // chip, which is what made the first run of this probe
                    // read 0 chips and look like the feature was absent.
                    labels: [
                      {
                        id: 'explore-rnd02-label',
                        text: name,
                        position: 50,
                        line: '1'
                      }
                    ]
                  }
                : c
            )
          }
        : v
    );
    m.actions.set({ views }, true);
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return {
      connectors: (after?.connectors ?? []).length,
      name: after?.connectors?.[0]?.name ?? null,
      labels: (after?.connectors?.[0]?.labels ?? []).length
    };
  }, text);

/**
 * Put ONE layer on the active view and assign every entity to it (the same move
 * R3/GPU-08 uses — a blank-diagram boot configures no layers, and the bulk
 * layers' escape hatch keys on `layers.length === 0`, not on `visibleIds.size`).
 */
const seedLayer = (page: Page, visible: boolean) =>
  page.evaluate((vis: boolean) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const LAYER_ID = 'explore-rnd02-layer';
    const layer = {
      id: LAYER_ID,
      name: 'Probe layer',
      visible: vis,
      locked: false,
      order: 0
    };
    const assign = (list: any[] | undefined) =>
      (list ?? []).map((e: any) => ({ ...e, layerId: LAYER_ID }));
    const views = m.views.map((v: any) =>
      v.id === viewId
        ? {
            ...v,
            layers: [layer],
            items: assign(v.items),
            connectors: assign(v.connectors),
            rectangles: assign(v.rectangles),
            textBoxes: assign(v.textBoxes),
            labels: assign(v.labels)
          }
        : v
    );
    m.actions.set({ views }, true);
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return {
      layers: (after?.layers ?? []).length,
      visible: after?.layers?.[0]?.visible,
      connectorsOnLayer: (after?.connectors ?? []).filter(
        (c: any) => c.layerId === LAYER_ID
      ).length,
      itemsOnLayer: (after?.items ?? []).filter(
        (i: any) => i.layerId === LAYER_ID
      ).length
    };
  }, visible);

/** Connector-label chips have no test hook — count by text INSIDE the renderer. */
const labelChipCount = (page: Page) =>
  page.locator(`${CANVAS} >> text=${LABEL_TEXT}`).count();
// ---------------------------------------------------------------------------
// RND-07 — links inside a RESTING text box are unreachable
// ---------------------------------------------------------------------------

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
    return {
      count: (after?.textBoxes ?? []).length,
      content: after?.textBoxes?.[0]?.content ?? null
    };
  }, LINK_TEXT);

test.describe('RND-07 — a link in a resting text box cannot be clicked', () => {
  test('the interactions box, not the anchor, is what is under the link', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);

    // Place a text box through the real tool, then give it linked content.
    // Canonical placement flow: land → arm → release → type → COMMIT. Escape
    // would CANCEL, and an edit session that ends empty discards the box (ADR
    // 0034 empty-content lifecycle) — that is what emptied the first run.
    const at = await canvas.tileToScreen({ x: 0, y: 0 });
    await canvas.placeTextBoxAt(at, { text: 'seed' });
    await expect.poll(() => getViewTextBoxCount(page), { timeout: 5_000 }).toBe(1);

    const seeded = await seedLinkedTextBox(page);
    expect(seeded.count, 'PRECONDITION: one text box exists').toBe(1);
    expect(seeded.content).toContain('#diagram:');
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setEditingTextBoxId(null);
      ui.actions.setItemControls(null);
      ui.actions.setSelectedIds([]);
    });
    await page.waitForTimeout(500);

    // PRECONDITION: the anchor really is in the DOM (a wrong selector reads as
    // "0 elements", which looks exactly like "the feature is absent").
    const anchor = page.locator(`${CANVAS} a[href^="#diagram:"]`);
    await expect(anchor).toHaveCount(1);
    const box = (await anchor.boundingBox())!;
    expect(box.width, 'the anchor has real layout').toBeGreaterThan(0);

    // Who actually receives a press at the anchor's centre?
    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!el) return { tag: null, id: null, isAnchor: false };
        return {
          tag: el.tagName,
          id: el.getAttribute('data-axoview-id'),
          isAnchor: Boolean(el.closest('a[href^="#diagram:"]'))
        };
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    );
    // Characterization: the interactions box owns the point, not the anchor.
    expect(hit.isAnchor).toBe(false);
    expect(hit.id).toBe('canvas-interactions');

    // And the navigation event the handler would fire never fires on a click.
    await page.evaluate(() => {
      (window as any).__rnd07 = 0;
      window.addEventListener('axoview-navigate-to-diagram', () => {
        (window as any).__rnd07 += 1;
      });
    });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as any).__rnd07)).toBe(0);
  });

  test.fail(
    'BUG: clicking a #diagram: link in a resting text box should navigate',
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
        (window as any).__rnd07b = 0;
        window.addEventListener('axoview-navigate-to-diagram', () => {
          (window as any).__rnd07b += 1;
        });
      });
      // Ctrl+click — the documented EDIT-mode navigation chord (plain click is
      // selection by Docs convention), so this is the gesture that MUST work.
      await page.keyboard.down('Control');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.up('Control');
      await page.waitForTimeout(500);

      expect(await page.evaluate(() => (window as any).__rnd07b)).toBe(1);
    }
  );
});
