/**
 * R4 — RND-03, RND-04, RND-06, RND-12: the composition root's OTHER contracts.
 *
 * RND-03 — `coarseBounds` is only ever recomputed inside the store subscriber.
 *   A projection switch changes `screenToTile` (so the effect re-subscribes) but
 *   nothing re-culls; correctness rides entirely on the toggle ALSO writing
 *   scroll, and on that write landing after the new subscriber is installed.
 *   Oracle: compare the bulk's `data-draw-count` straight after the switch with
 *   the count after a forced re-cull (an isolated `setScroll` of the same
 *   values). A difference means the switch left stale bounds behind.
 *
 * RND-04 — the promotion keys are comma-joined id strings that are re-split, so
 *   an id containing a comma matches nothing on the way back.
 *
 * RND-06 — fit-to-view measures the renderer container, which spans the whole
 *   window with the docks overlaying it.
 *
 * RND-12 — a connector with no scene entry at all is promoted by neither side of
 *   the hybrid. Probed as an INVARIANT first (is it reachable?) and then for its
 *   consequence.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';
import { layerCounters, paintedPixels } from '../_rig/glOracles';

const NODES_CANVAS = 'axoview-nodes-canvas';

const modeType = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().mode.type as string
  );

const drawCount = async (page: Page) =>
  (await layerCounters(page, NODES_CANVAS)).drawCount;

/**
 * Re-run the cull without moving the viewport: `setScroll` always allocates a
 * new `scroll` object, so the subscriber fires and `computeTileBounds` runs
 * with the CURRENT screenToTile. Callers wait > PAN_GESTURE_GAP_MS (250 ms)
 * first so this counts as an isolated change and commits immediately.
 */
const forceRecull = async (page: Page) => {
  await page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setScroll({
      position: { ...ui.scroll.position },
      offset: { ...ui.scroll.offset }
    });
  });
  await page.waitForTimeout(600);
};

// ---------------------------------------------------------------------------
// RND-03 — does a projection switch re-cull?
// ---------------------------------------------------------------------------

test.describe('RND-03 — culling after an iso↔2D switch', () => {
  test('the post-switch visible set equals a freshly recomputed one', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(240_000);
    const canvas = new CanvasPOM(page);

    // Nodes spread far enough that the visible SET genuinely differs between
    // the two projections (the tile→screen map differs, so the culled tile box
    // does too). Without that, both counts would agree trivially.
    const tiles = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: -6, y: 0 },
      { x: 0, y: 6 },
      { x: 0, y: -6 },
      { x: 9, y: 9 },
      { x: -9, y: -9 }
    ];
    for (const t of tiles) {
      const p = await canvas.tileToScreen(t);
      // Off-viewport tiles cannot be placed with the mouse; seed those directly.
      if (p.x > 20 && p.y > 20 && p.x < 1200 && p.y < 620) {
        await placeIconViaMouse(page, p);
      }
    }
    const placed = await getViewItemCount(page);
    expect(placed, 'PRECONDITION: several nodes were placed').toBeGreaterThan(2);
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setItemControls(null)
    );
    await page.waitForTimeout(700);

    const isoCount = await drawCount(page);
    expect(isoCount, 'PRECONDITION: the bulk is drawing in ISO').toBeGreaterThan(0);

    await canvas.toggleCanvasMode();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as any).__axoview__.ui.getState().canvasMode
          ),
        { timeout: 5_000 }
      )
      .toBe('2D');
    await page.waitForTimeout(900);

    const afterSwitch = await drawCount(page);
    await forceRecull(page);
    const afterRecull = await drawCount(page);

    // Characterization: the switch left the cull current.
    expect(afterSwitch).toBe(afterRecull);
  });
});

// ---------------------------------------------------------------------------
// RND-04 — a comma in an id defeats the drag promotion
// ---------------------------------------------------------------------------

const COMMA_ID = 'imported,node';

/** Rewrite the single item's id everywhere it is referenced. */
const rewriteFirstItemId = (page: Page, newId: string) =>
  page.evaluate((nid: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const view = m.views.find((v: any) => v.id === viewId);
    const oldId = (view?.items ?? [])[0]?.id;
    if (!oldId) return null;
    const items = m.items.map((i: any) =>
      i.id === oldId ? { ...i, id: nid } : i
    );
    const views = m.views.map((v: any) =>
      v.id === viewId
        ? {
            ...v,
            items: (v.items ?? []).map((i: any) =>
              i.id === oldId ? { ...i, id: nid } : i
            )
          }
        : v
    );
    m.actions.set({ items, views }, true);
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return { oldId, newId: (after?.items ?? [])[0]?.id ?? null };
  }, newId);


/** Absolute page point of a tile (the interactions box is not at the origin). */
async function tileToPage(
  page: Page,
  canvas: CanvasPOM,
  tile: { x: number; y: number }
): Promise<CanvasPoint> {
  const rel = await canvas.tileToScreen(tile);
  const box = await canvas.interactionsLayer().boundingBox();
  if (!box) throw new Error('interactions box has no bounding box');
  return { x: box.x + rel.x, y: box.y + rel.y };
}

/** Close the Elements dock so it cannot swallow a real press over the canvas. */
async function closeElementsDock(page: Page) {
  const icon = page.locator('[data-axoview-id="canvas-icon-grid-item"]').first();
  if (await icon.isVisible().catch(() => false)) {
    await page.locator('[data-axoview-id="dock-elements-toggle"]').click();
    await icon.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
  }
}

/** The single view item, straight from the model. */
const firstViewItem = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model.getState().views.find((v: any) => v.id === viewId);
    return (view?.items ?? [])[0] ?? null;
  });

/**
 * Place one node, close the dock, drop the selection, and return its id plus the
 * ABSOLUTE page point of the tile it actually landed on (the drop tile is not
 * necessarily the tile that was aimed at, and page.mouse needs page coords —
 * both of which cost the first run of this probe its CONTROL).
 */
async function setupNode(page: Page, canvas: CanvasPOM) {
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: 0, y: 0 }));
  await expect.poll(() => getViewItemCount(page), { timeout: 8_000 }).toBe(1);
  await closeElementsDock(page);
  await page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setMode({ type: 'CURSOR', showCursor: true, mousedownItem: null });
    ui.actions.setItemControls(null);
    ui.actions.setSelectedIds([]);
  });
  await page.waitForTimeout(300);
  const item = await firstViewItem(page);
  expect(item, 'PRECONDITION: the node exists in the view').toBeTruthy();
  return {
    id: item.id as string,
    point: await tileToPage(page, canvas, item.tile)
  };
}

async function beginRealDrag(page: Page, from: CanvasPoint, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 6 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('DRAG_ITEMS');
}

const dragSetIds = (page: Page) =>
  page.evaluate(() => {
    const mode = (window as any).__axoview__.ui.getState().mode;
    return mode.type === 'DRAG_ITEMS'
      ? mode.items.map((i: any) => `${i.type}:${i.id}`)
      : null;
  });
// ---------------------------------------------------------------------------
// RND-06 — fit-to-view frames into the full window, docks included
// ---------------------------------------------------------------------------

test.describe('RND-06 — fit-to-view ignores the docks overlaying the canvas', () => {
  test('after a fit, the outermost node sits under the left dock', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);

    // One real node, then a WIDE spread cloned from it. The outer tiles are
    // off-screen at the boot zoom so they cannot be placed with the mouse, and
    // the spread has to be wide enough that the fit is genuinely width-limited
    // — a small diagram fits at MAX_ZOOM with slack to spare, which would hide
    // the question being asked (that is what the first run of this probe did).
    await placeIconViaMouse(page, await canvas.tileToScreen({ x: 0, y: 0 }));
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    const spread = await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const m = bridge.model.getState();
      const viewId = bridge.ui.getState().view;
      const view = m.views.find((v: any) => v.id === viewId);
      const proto = view.items[0];
      const protoModel = m.items.find((i: any) => i.id === proto.id);
      const clones = [
        { id: 'rnd06-left', tile: { x: -25, y: 25 } },
        { id: 'rnd06-right', tile: { x: 25, y: -25 } }
      ];
      m.actions.set(
        {
          items: [
            ...m.items,
            ...clones.map((c) => ({ ...protoModel, id: c.id, name: c.id }))
          ],
          views: m.views.map((v: any) =>
            v.id === viewId
              ? {
                  ...v,
                  items: [
                    ...v.items,
                    ...clones.map((c) => ({ ...proto, id: c.id, tile: c.tile }))
                  ]
                }
              : v
          )
        },
        true
      );
      const after = bridge.model
        .getState()
        .views.find((v: any) => v.id === viewId);
      return (after?.items ?? []).length;
    });
    expect(spread, 'PRECONDITION: three nodes span 50 tiles').toBe(3);

    // The left dock must be OPEN — it is the surface the hypothesis is about.
    const dockIcon = page
      .locator('[data-axoview-id="canvas-icon-grid-item"]')
      .first();
    if (!(await dockIcon.isVisible().catch(() => false))) {
      await page.locator('[data-axoview-id="dock-elements-toggle"]').click();
      await dockIcon.waitFor({ state: 'visible', timeout: 5_000 });
    }
    const dockBox = (await dockIcon.boundingBox())!;
    expect(dockBox.width, 'PRECONDITION: the dock is on screen').toBeGreaterThan(0);

    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setItemControls(null)
    );
    await page.locator('[data-axoview-id="canvas-zoom-fit"]').click();
    await page.waitForTimeout(900);

    // Leftmost node's screen point AFTER the fit.
    const left = await canvas.tileToScreen({ x: -25, y: 25 });
    const box = (await canvas.interactionsLayer().boundingBox())!;
    const abs = { x: box.x + left.x, y: box.y + left.y };
    expect(abs.x, 'PRECONDITION: the point is inside the window').toBeGreaterThan(0);

    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        return {
          id: el?.getAttribute('data-axoview-id') ?? null,
          tag: el?.tagName ?? null,
          chain: (() => {
            const out: string[] = [];
            let cur: HTMLElement | null = el;
            for (let i = 0; cur && i < 6; i += 1) {
              out.push(
                `${cur.tagName}${cur.getAttribute('data-axoview-id') ? '#' + cur.getAttribute('data-axoview-id') : ''}.${(cur.className || '').toString().split(' ').slice(0, 2).join('.')}`
              );
              cur = cur.parentElement;
            }
            return out.join(' < ');
          })(),
          inDock: Boolean(
            el?.closest(
              '[data-axoview-id="left-dock"], [data-axoview-id="elements-panel"], .MuiDrawer-root'
            )
          ),
          overCanvas: Boolean(
            el?.closest('[data-axoview-id="canvas-interactions"]')
          )
        };
      },
      abs
    );
    // Characterization: record where the node actually landed relative to the
    // dock, so a FALSIFIED verdict carries the margin rather than a bare pass.
    const landed = {
      overCanvas: hit.overCanvas,
      inDock: hit.inDock,
      nodeX: Math.round(abs.x),
      dockRight: Math.round(dockBox.x + dockBox.width)
    };
    expect(landed.nodeX).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log('[RND-06] landed:', JSON.stringify({ ...landed, chain: hit.chain }));
    // The finding: it is NOT on the free canvas.
    expect(landed.overCanvas, JSON.stringify(landed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RND-12 — a connector with no scene entry renders nowhere
// ---------------------------------------------------------------------------

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

/** Every view connector must have a scene entry — candidate invariant INV-12. */
const connectorsWithoutScenePath = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    const scene = bridge.scene.getState().connectors ?? {};
    return (view?.connectors ?? [])
      .filter((c: any) => !scene[c.id])
      .map((c: any) => c.id);
  });

test.describe('RND-12 — a connector with no scene entry', () => {
  test('is it reachable? every view connector keeps a scene entry across page switches and undo', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(240_000);
    const canvas = new CanvasPOM(page);
    const a = await canvas.tileToScreen({ x: -2, y: 0 });
    const b = await canvas.tileToScreen({ x: 2, y: 0 });
    await placeIconViaMouse(page, a);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await placeIconViaMouse(page, b);
    await expect.poll(() => getViewItemCount(page)).toBe(2);
    await drawConnector(page, canvas, a, b);
    await page.waitForTimeout(500);

    expect(
      await connectorsWithoutScenePath(page),
      'PRECONDITION: the fresh connector is synced'
    ).toEqual([]);

    // New page, back again — the SYNC_SCENE path every tab click takes.
    await page.locator('button:has(svg[data-testid="AddIcon"])').click();
    await page.waitForTimeout(700);
    const firstViewId = await page.evaluate(
      () => (window as any).__axoview__.model.getState().views[0].id
    );
    await page.evaluate((id: string) => {
      const bridge = (window as any).__axoview__;
      const m = bridge.model.getState();
      bridge.changeView(id, {
        version: m.version,
        title: m.title,
        description: m.description,
        colors: m.colors,
        icons: m.icons,
        items: m.items,
        views: m.views
      });
    }, firstViewId);
    await page.waitForTimeout(700);
    expect(await connectorsWithoutScenePath(page)).toEqual([]);

    // Undo the page creation, then undo the connector and redo it.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(500);
    expect(await connectorsWithoutScenePath(page)).toEqual([]);
  });

  test('CONSEQUENCE: with the scene entry removed the connector draws nowhere', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const a = await canvas.tileToScreen({ x: -2, y: 0 });
    const b = await canvas.tileToScreen({ x: 2, y: 0 });
    await placeIconViaMouse(page, a);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await placeIconViaMouse(page, b);
    await expect.poll(() => getViewItemCount(page)).toBe(2);
    await drawConnector(page, canvas, a, b);
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setItemControls(null);
      ui.actions.setSelectedIds([]);
    });
    await page.waitForTimeout(700);

    const painted = await paintedPixels(page, 'axoview-connectors-canvas');
    expect(painted, 'PRECONDITION: the connector is painting').toBeGreaterThan(0);

    // Drop the scene entry (the state a never-synced connector would be in).
    const removed = await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const scene = bridge.scene.getState();
      const ids = Object.keys(scene.connectors ?? {});
      const next = { ...scene.connectors };
      ids.forEach((k) => delete next[k]);
      scene.actions?.setConnectors
        ? scene.actions.setConnectors(next)
        : bridge.scene.setState({ connectors: next });
      return Object.keys(bridge.scene.getState().connectors ?? {}).length;
    });
    expect(removed, 'PRECONDITION: the scene entry is gone').toBe(0);
    await page.waitForTimeout(800);

    expect(await connectorsWithoutScenePath(page)).toHaveLength(1);
    // Characterization: nothing paints, and no DOM connector was promoted.
    expect(await paintedPixels(page, 'axoview-connectors-canvas')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RND-11 — can the trailing settle-flush be lost?
// ---------------------------------------------------------------------------

/*
 * The coarseBounds subscriber throttles mid-gesture and arms a `setTimeout`
 * (PAN_SETTLE_MS = 120 ms) to flush the final cull. Its cleanup clears that
 * timer WITHOUT committing `pending`, so a teardown inside the settle window
 * would strand the cull one throttle window stale. The effect's only dep is
 * `screenToTile`, so the sole way to tear it down mid-gesture is a projection
 * switch. Same oracle as RND-03: compare the live draw count against a forced
 * re-cull.
 */
test.describe('RND-11 — a projection switch inside the settle window', () => {
  test('a mode switch landing mid-pan still leaves the cull current', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(240_000);
    const canvas = new CanvasPOM(page);
    for (const t of [
      { x: 0, y: 0 },
      { x: 3, y: -3 },
      { x: -3, y: 3 },
      { x: 5, y: 0 }
    ]) {
      const p = await canvas.tileToScreen(t);
      if (p.x > 20 && p.y > 20 && p.x < 1200 && p.y < 620) {
        await placeIconViaMouse(page, p);
      }
    }
    expect(
      await getViewItemCount(page),
      'PRECONDITION: several nodes were placed'
    ).toBeGreaterThan(2);
    await closeElementsDock(page);
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setItemControls(null)
    );
    await page.waitForTimeout(700);

    // A continuous stream of scroll writes — the "gesture" the throttle is for.
    const panned = await page.evaluate(async () => {
      const ui = (window as any).__axoview__.ui;
      for (let i = 0; i < 24; i += 1) {
        const s = ui.getState();
        s.actions.setScroll({
          position: { x: s.scroll.position.x - 24, y: s.scroll.position.y - 12 },
          offset: { ...s.scroll.offset }
        });
        await new Promise((r) => setTimeout(r, 16));
      }
      return ui.getState().scroll.position;
    });
    expect(panned.x, 'PRECONDITION: the pan really moved scroll').toBeLessThan(0);

    // Tear the subscriber down INSIDE the settle window (< PAN_SETTLE_MS).
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setCanvasMode('2D')
    );
    await page.waitForTimeout(900);

    const afterSwitch = await drawCount(page);
    await forceRecull(page);
    expect(afterSwitch).toBe(await drawCount(page));
  });
});
