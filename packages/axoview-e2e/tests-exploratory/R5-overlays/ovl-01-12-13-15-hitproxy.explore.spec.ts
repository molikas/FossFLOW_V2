/**
 * R5 — OVL-01, OVL-12, OVL-13, OVL-15: the node-name hit proxy vs the chip it
 * is supposed to cover.
 *
 * `NodeLabelHitLayer` is the DOM affordance layer over the Canvas2D/WebGL node
 * name chip: one invisible div per unselected node, sized by RE-MEASURING the
 * chip. It is the third implementation of a measurement `NodesCanvas` and
 * `Label.tsx` also do, and it is the sibling of `LabelHitLayer` (floating
 * Labels) — two places for it to drift, and it drifts in both.
 *
 *   OVL-01 — it measures at font-weight 600 unconditionally; the canvas measures
 *            at 700 for a bold name, so the drawn chip is wider than its proxy.
 *   OVL-12 — `LabelHitLayer` scales its proxies by the ADR-0015 counter-scale;
 *            `NodeLabelHitLayer` does not.
 *   OVL-13 — `LabelHitLayer` drops proxies for `lockedIds`; `NodeLabelHitLayer`
 *            filters `visibleIds` only, so a locked node keeps its label drag
 *            handle and its double-click rename.
 *   OVL-15 — neither the proxy's anchor nor its offset reads ADR-0044
 *            `iconScale`.
 *
 * ORACLE: the proxy is a real DOM div, so its rect is directly readable. The
 * chip the canvas draws is measured in-page with a scratch 2D context using the
 * SAME font string each renderer builds — that is the comparison under test, so
 * each probe first asserts a CONTROL case where the two agree.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';
// The e2e process can import lib source directly, so the probe uses the SAME
// constants the two renderers do rather than guessing at them (the first run of
// this probe assumed 16px / the body font and its CONTROL failed by 50px).
import { LABEL_BASE_FONT_PX } from '../../../axoview-lib/src/config/labelSettings';
import { DEFAULT_FONT_FAMILY } from '../../../axoview-lib/src/config';

const PROXY = '[data-axoview-id="canvas-label-hit"]';

const firstViewItem = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model.getState().views.find((v: any) => v.id === viewId);
    return (view?.items ?? [])[0] ?? null;
  });

/** Patch the single view item and/or its model item through the bridge. */
const patchNode = (
  page: Page,
  patch: { view?: Record<string, unknown>; model?: Record<string, unknown> }
) =>
  page.evaluate((p: { view?: any; model?: any }) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const view = m.views.find((v: any) => v.id === viewId);
    const id = view.items[0].id;
    m.actions.set(
      {
        items: p.model
          ? m.items.map((i: any) => (i.id === id ? { ...i, ...p.model } : i))
          : m.items,
        views: m.views.map((v: any) =>
          v.id === viewId
            ? {
                ...v,
                items: v.items.map((i: any) =>
                  i.id === id ? { ...i, ...(p.view ?? {}) } : i
                )
              }
            : v
        )
      },
      true
    );
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return { id, item: after.items[0] };
  }, patch);

/**
 * Widths the two renderers compute for the same name, measured in-page with the
 * font string each one builds. `canvas` mirrors NodesCanvas.measureNodeLabel
 * (bold → 700, italic honoured); `proxy` mirrors NodeLabelHitLayer
 * .measureNameChip (always 600, no italic).
 */
const measuredWidths = (
  page: Page,
  name: string,
  bold: boolean,
  italic: boolean,
  fontSize: number = LABEL_BASE_FONT_PX
) =>
  page.evaluate(
    ({ name: n, fontSize: fs, bold: b, italic: i, family }) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const PAD_X = 12; // theme.spacing(1.5) / CHIP_PAD_X — the same 12 in both
      const MAX = 250;
      // NodesCanvas.measureNodeLabel: weight 700 when bold, italic honoured,
      // clamps the INNER width then adds padding back.
      ctx.font = `${i ? 'italic ' : ''}${b ? 700 : 600} ${fs}px ${family}`;
      const canvasInner = Math.min(MAX - PAD_X * 2, ctx.measureText(n).width);
      // NodeLabelHitLayer.measureNameChip: weight 600 always, clamps the OUTER.
      ctx.font = `600 ${fs}px ${family}`;
      const proxyOuter = Math.min(MAX, ctx.measureText(n).width + PAD_X * 2);
      return { canvas: canvasInner + PAD_X * 2, proxy: proxyOuter };
    },
    { name, fontSize, bold, italic, family: DEFAULT_FONT_FAMILY }
  );

/**
 * The proxy's box in CANVAS px. The divs live inside a `<SceneLayer>`, whose CSS
 * transform is `translate(scroll) scale(zoom)` — so `boundingBox()` returns
 * SCREEN px and has to be divided by the live zoom before it can be compared
 * with a measureText result. (The first run of this probe skipped that and its
 * CONTROL failed by exactly the zoom factor.)
 */
const proxyRect = async (page: Page) => {
  const box = await page.locator(PROXY).first().boundingBox();
  if (!box) return null;
  const zoom = await page.evaluate(
    () => (window as any).__axoview__.ui.getState().zoom as number
  );
  return {
    x: box.x,
    y: box.y,
    width: box.width / zoom,
    height: box.height / zoom,
    zoom
  };
};

const clearSelection = (page: Page) =>
  page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setItemControls(null);
    ui.actions.setSelectedIds([]);
  });

/** A node with a name long enough to show the drift but short of the 250 cap. */
const NAME = 'Warehouse Router Alpha';

async function setupNamedNode(page: Page, canvas: CanvasPOM) {
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: 0, y: 0 }));
  await expect.poll(() => getViewItemCount(page), { timeout: 8_000 }).toBe(1);
  await patchNode(page, { model: { name: NAME, label: NAME } });
  await clearSelection(page);
  await page.waitForTimeout(500);
  const item = await firstViewItem(page);
  expect(item, 'PRECONDITION: the node exists').toBeTruthy();
  return item;
}

// ---------------------------------------------------------------------------
// OVL-01 — bold names get a proxy narrower than the drawn chip
// ---------------------------------------------------------------------------

test.describe('OVL-01 — the hit proxy ignores labelBold / labelItalic', () => {
  test('CONTROL: at the default weight the proxy width matches the drawn chip', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    await setupNamedNode(page, canvas);
    await expect(page.locator(PROXY)).toHaveCount(1);

    const w = await measuredWidths(page, NAME, false, false);
    expect(w.canvas, 'the name is under the 250 cap').toBeLessThan(250);
    const rect = (await proxyRect(page))!;
    expect(rect.width).toBeCloseTo(w.proxy, 0);
    // Same string, same weight → the two formulas agree.
    expect(w.proxy).toBeCloseTo(w.canvas, 0);
  });

  test('a BOLD name is drawn wider than the box that can grab it', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    await setupNamedNode(page, canvas);
    await patchNode(page, { view: { labelBold: true } });
    await clearSelection(page);
    await page.waitForTimeout(600);

    const item = await firstViewItem(page);
    expect(item.labelBold, 'PRECONDITION: the node really is bold').toBe(true);
    await expect(page.locator(PROXY)).toHaveCount(1);

    // Ask the BROWSER whether the weight/style difference the two formulas
    // disagree about is even measurable in this font stack — the source
    // asymmetry is real, but a drift nobody can observe is not a finding
    // (COLDSTART: do not conclude a platform behaviour from the spec).
    const variants = await page.evaluate((family: string) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const at = (font: string) => {
        ctx.font = font;
        return ctx.measureText('Warehouse Router Alpha').width;
      };
      return {
        w600: at(`600 18px ${family}`),
        w700: at(`700 18px ${family}`),
        i600: at(`italic 600 18px ${family}`),
        i700: at(`italic 700 18px ${family}`),
        resolved: (() => {
          ctx.font = `600 18px ${family}`;
          return ctx.font;
        })()
      };
    }, DEFAULT_FONT_FAMILY);
    // eslint-disable-next-line no-console
    console.log('[OVL-01] measureText variants:', JSON.stringify(variants));

    const w = await measuredWidths(page, NAME, true, false);
    expect(w.canvas, 'the name is under the 250 cap').toBeLessThan(250);

    const rect = (await proxyRect(page))!;
    // The proxy is sized at weight 600 — that much is certain.
    expect(rect.width).toBeCloseTo(w.proxy, 0);
    // Characterization of the ACTUAL drift in this environment.
    expect(w.canvas - w.proxy).toBe(variants.w700 - variants.w600);
  });

  /**
   * VERDICT (FALSIFIED, not a bug): the source asymmetry is real —
   * `measureNameChip` builds `600 ${size}px` unconditionally while
   * `measureNodeLabel` builds `700` / `italic` — but the browser answers that it
   * costs nothing. In this font stack `measureText` returns byte-identical
   * widths for 600 and 700, and italic differs by 0.34px on a 214px string, so
   * the proxy covers the drawn chip regardless. Pinned here so a webfont change
   * (a real Roboto 700 face) turns this red instead of silently opening the gap.
   */
  test('the drift the two formulas allow is 0px in the shipped font stack', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    await setupNamedNode(page, canvas);
    await patchNode(page, { view: { labelBold: true, labelItalic: true } });
    await clearSelection(page);
    await page.waitForTimeout(600);
    const item = await firstViewItem(page);
    expect(item.labelBold, 'PRECONDITION: the node is bold + italic').toBe(true);
    expect(item.labelItalic).toBe(true);
    await expect(page.locator(PROXY)).toHaveCount(1);

    const w = await measuredWidths(page, NAME, true, true);
    const rect = (await proxyRect(page))!;
    // The proxy is within a pixel of the drawn chip even at bold + italic.
    expect(Math.abs(rect.width - w.canvas)).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// OVL-12 — the proxy does not follow the readable-labels counter-scale
// ---------------------------------------------------------------------------

const setReadable = (page: Page, on: boolean) =>
  page.evaluate(
    (v: boolean) =>
      (window as any).__axoview__.ui.getState().actions.setReadableLabels(v),
    on
  );

const setZoom = (page: Page, z: number) =>
  page.evaluate(
    (v: number) => (window as any).__axoview__.ui.getState().actions.setZoom(v),
    z
  );

test.describe('OVL-12 — the node-name proxy ignores the counter-scale', () => {
  test('the chip grows with the accessibility toggle; the grab box does not', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    await setupNamedNode(page, canvas);

    // Zoom 0.5: above the proxy's HIT_MIN_ZOOM (0.4) but below the readable
    // floor (11 / 16 ≈ 0.69), so the counter-scale is > 1 there.
    await setZoom(page, 0.5);
    await setReadable(page, false);
    await page.waitForTimeout(700);
    await expect(page.locator(PROXY)).toHaveCount(1);
    const before = (await proxyRect(page))!;

    await setReadable(page, true);
    await page.waitForTimeout(700);

    // PRECONDITION: the canvas really is drawing bigger now.
    const glScale = await page.evaluate(() => {
      const c = document.querySelector(
        '[data-testid="axoview-nodes-canvas"]'
      ) as HTMLElement | null;
      return Number(c?.dataset.labelScale ?? '1');
    });
    expect(glScale, 'the GL counter-scale is engaged').toBeGreaterThan(1.2);

    const after = (await proxyRect(page))!;
    // Characterization: the grab box is byte-identical.
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.height).toBeCloseTo(before.height, 1);
  });

  test.fail(
    'BUG: the grab box must grow with the counter-scaled chip',
    async ({ page, app }) => {
      void app;
      test.setTimeout(180_000);
      const canvas = new CanvasPOM(page);
      await setupNamedNode(page, canvas);
      await setZoom(page, 0.5);
      await setReadable(page, false);
      await page.waitForTimeout(700);
      await expect(page.locator(PROXY)).toHaveCount(1);
      const before = (await proxyRect(page))!;

      await setReadable(page, true);
      await page.waitForTimeout(700);
      const glScale = await page.evaluate(() => {
        const c = document.querySelector(
          '[data-testid="axoview-nodes-canvas"]'
        ) as HTMLElement | null;
        return Number(c?.dataset.labelScale ?? '1');
      });
      expect(
        glScale,
        'PRECONDITION: the GL counter-scale is engaged'
      ).toBeGreaterThan(1.2);

      const after = (await proxyRect(page))!;
      expect(after.width).toBeGreaterThan(before.width * 1.1);
    }
  );
});

// ---------------------------------------------------------------------------
// OVL-13 — a LOCKED layer keeps its node-name drag/rename handle
// ---------------------------------------------------------------------------

/** One layer over every entity on the view, with the given flags. */
const seedLayer = (page: Page, flags: { visible: boolean; locked: boolean }) =>
  page.evaluate((f: { visible: boolean; locked: boolean }) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const LAYER_ID = 'explore-ovl13-layer';
    const assign = (list: any[] | undefined) =>
      (list ?? []).map((e: any) => ({ ...e, layerId: LAYER_ID }));
    const views = m.views.map((v: any) =>
      v.id === viewId
        ? {
            ...v,
            layers: [
              {
                id: LAYER_ID,
                name: 'Probe layer',
                visible: f.visible,
                locked: f.locked,
                order: 0
              }
            ],
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
      locked: after?.layers?.[0]?.locked,
      itemsOnLayer: (after?.items ?? []).filter(
        (i: any) => i.layerId === LAYER_ID
      ).length
    };
  }, flags);

test.describe('OVL-13 — the node-name proxy has no lock gate', () => {
  test('CONTROL: hiding the layer DOES remove the proxy', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    await setupNamedNode(page, canvas);
    await expect(page.locator(PROXY)).toHaveCount(1);

    const seeded = await seedLayer(page, { visible: false, locked: false });
    expect(seeded.layers).toBe(1);
    expect(seeded.visible).toBe(false);
    expect(seeded.itemsOnLayer).toBe(1);
    await page.waitForTimeout(700);
    await expect(page.locator(PROXY)).toHaveCount(0);
  });

  test('a LOCKED (but visible) layer keeps the label drag handle mounted', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    await setupNamedNode(page, canvas);
    await expect(page.locator(PROXY)).toHaveCount(1);

    const seeded = await seedLayer(page, { visible: true, locked: true });
    expect(seeded.locked, 'PRECONDITION: the layer really is locked').toBe(true);
    expect(seeded.visible).toBe(true);
    expect(seeded.itemsOnLayer).toBe(1);
    await page.waitForTimeout(700);

    // Characterization: the proxy is still there, and still advertises a grab
    // cursor + its rename double-click target.
    await expect(page.locator(PROXY)).toHaveCount(1);
    const cursor = await page
      .locator(PROXY)
      .first()
      .evaluate((el) => (el as HTMLElement).style.cursor);
    expect(cursor).toBe('grab');
  });

  test.fail(
    'BUG: a locked layer must not expose a label drag/rename handle',
    async ({ page, app }) => {
      void app;
      test.setTimeout(180_000);
      const canvas = new CanvasPOM(page);
      await setupNamedNode(page, canvas);
      await expect(page.locator(PROXY)).toHaveCount(1);
      const seeded = await seedLayer(page, { visible: true, locked: true });
      expect(seeded.locked, 'PRECONDITION: the layer really is locked').toBe(
        true
      );
      await page.waitForTimeout(700);
      expect(await page.locator(PROXY).count()).toBe(0);
    }
  );

  test('and the drag actually MOVES the locked node’s label', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    await setupNamedNode(page, canvas);
    const seeded = await seedLayer(page, { visible: true, locked: true });
    expect(seeded.locked, 'PRECONDITION: the layer is locked').toBe(true);
    await page.waitForTimeout(700);

    const before = (await firstViewItem(page)).labelHeight ?? 20;
    const rect = (await proxyRect(page))!;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 40, { steps: 8 });
    await page.mouse.move(cx, cy + 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const after = (await firstViewItem(page)).labelHeight;
    // Characterization: the model was written for an entity on a locked layer.
    expect(after).not.toBe(before);
  });
});

// ---------------------------------------------------------------------------
// OVL-15 — the proxy anchor ignores iconScale
// ---------------------------------------------------------------------------

test.describe('OVL-15 — the name proxy does not move for an enlarged icon', () => {
  test('tripling iconScale grows the drawn icon but leaves the proxy put', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    await setupNamedNode(page, canvas);
    await expect(page.locator(PROXY)).toHaveCount(1);
    const before = (await proxyRect(page))!;

    await patchNode(page, { view: { iconScale: 3 } });
    await clearSelection(page);
    await page.waitForTimeout(700);
    const item = await firstViewItem(page);
    expect(item.iconScale, 'PRECONDITION: the icon really is 3x').toBe(3);

    const after = (await proxyRect(page))!;
    // Characterization: identical position and size.
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
    expect(after.width).toBeCloseTo(before.width, 1);
  });
});
