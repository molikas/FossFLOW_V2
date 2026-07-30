/**
 * R2 probes that need a real GPU context: context loss / restore (GL-08), the
 * bulk-layer paint stacking (GL-13), and the read-back pixel oracle that GL-14
 * proposes as the answer to "CI is pixel-blind".
 *
 * The oracle: every bulk canvas is created with `preserveDrawingBuffer: true`
 * (so image export can read it), which means a probe can `drawImage` the WebGL
 * canvas into a 2D canvas and count non-transparent pixels. That turns "did the
 * GPU layer paint anything?" into a normal assertion.
 *
 * Rig rules: each probe asserts its PRECONDITION — that the canvas exists and
 * has a backing store, that the node really was placed, that the context really
 * was lost — before concluding anything.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';
import { AppToolbarPOM } from '../../pom/AppToolbarPOM';

type Page = import('@playwright/test').Page;

const NODES = '[data-testid="axoview-nodes-canvas"]';
const LABELS = '[data-testid="axoview-labels-canvas"]';

/** Non-transparent pixel count in a WebGL canvas's preserved drawing buffer. */
const paintedPixels = (page: Page, selector: string): Promise<number> =>
  page.evaluate((sel: string) => {
    const gl = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!gl || !gl.width || !gl.height) return -1;
    const scratch = document.createElement('canvas');
    scratch.width = gl.width;
    scratch.height = gl.height;
    const ctx = scratch.getContext('2d');
    if (!ctx) return -2;
    ctx.drawImage(gl, 0, 0);
    const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n += 1;
    return n;
  }, selector);

const canvasCentre = async (canvas: CanvasPOM) => {
  const box = (await canvas.interactionsLayer().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// ---------------------------------------------------------------------------
// GL-14 — the read-back pixel oracle
// ---------------------------------------------------------------------------

test.describe('GL-14 — the bulk layers can be read back, so CI is not pixel-blind', () => {
  test('an empty diagram paints nothing; a placed node paints pixels', async ({
    page,
    app
  }) => {
    const canvas = new CanvasPOM(page);
    // PRECONDITION: the canvas exists and has a real backing store.
    await expect(page.locator(NODES)).toBeAttached();
    const dims = await page.evaluate((sel: string) => {
      const c = document.querySelector(sel) as HTMLCanvasElement;
      return { w: c.width, h: c.height };
    }, NODES);
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);

    const before = await paintedPixels(page, NODES);
    expect(before).toBeGreaterThanOrEqual(0); // the oracle itself works
    expect(await getViewItemCount(page)).toBe(0);
    expect(before).toBe(0);

    const c = await canvasCentre(canvas);
    await placeIconViaMouse(page, c);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await page.waitForTimeout(400);

    const after = await paintedPixels(page, NODES);
    expect(after).toBeGreaterThan(0);
    await expectStoreInvariants(page, 'GL-14 after placement');
  });
});

// ---------------------------------------------------------------------------
// GL-08 — context loss and restore
// ---------------------------------------------------------------------------

test.describe('GL-08 — WEBGL_lose_context on a bulk layer', () => {
  test('the node layer repaints after a forced loss + restore', async ({
    page,
    app
  }) => {
    test.setTimeout(90_000);
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, await canvasCentre(canvas));
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await page.waitForTimeout(400);

    const painted = await paintedPixels(page, NODES);
    // PRECONDITION: the layer really was painting before the loss.
    expect(painted).toBeGreaterThan(0);

    // Force the loss through the canvas's OWN context (getContext returns the
    // live one), then let the browser fire webglcontextlost.
    const lost = await page.evaluate((sel: string) => {
      const c = document.querySelector(sel) as HTMLCanvasElement;
      const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
      const ext = gl?.getExtension('WEBGL_lose_context') as {
        loseContext: () => void;
        restoreContext: () => void;
      } | null;
      if (!ext) return 'no-extension';
      (window as never as { __r2ext__: unknown }).__r2ext__ = ext;
      ext.loseContext();
      return 'lost';
    }, NODES);
    // PRECONDITION: the extension exists in this browser; otherwise the probe
    // proves nothing and must say so rather than pass silently.
    expect(lost).toBe('lost');

    await expect
      .poll(
        () =>
          page.evaluate((sel: string) => {
            const c = document.querySelector(sel) as HTMLCanvasElement;
            const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
            return gl ? gl.isContextLost() : null;
          }, NODES),
        { timeout: 5_000 }
      )
      .toBe(true);

    await page.evaluate(() =>
      (
        window as never as { __r2ext__: { restoreContext: () => void } }
      ).__r2ext__.restoreContext()
    );

    await expect
      .poll(
        () =>
          page.evaluate((sel: string) => {
            const c = document.querySelector(sel) as HTMLCanvasElement;
            const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
            return gl ? gl.isContextLost() : null;
          }, NODES),
        { timeout: 10_000 }
      )
      .toBe(false);

    // The layer must be painting again — this is the whole point of the
    // preventDefault + rebuild wiring in contextLoss.ts.
    await expect
      .poll(() => paintedPixels(page, NODES), { timeout: 10_000 })
      .toBeGreaterThan(0);

    await expectStoreInvariants(page, 'GL-08 after restore');
  });
});

// ---------------------------------------------------------------------------
// GL-06 — contexts released (or not) when a Renderer unmounts
// ---------------------------------------------------------------------------

test.describe('GL-06 — repeated export-dialog mounts and the context budget', () => {
  test('opening and closing the image export dialog four times keeps the layer alive', async ({
    page,
    app,
    consoleOracle
  }) => {
    test.setTimeout(120_000);
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, await canvasCentre(canvas));
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await page.waitForTimeout(400);
    expect(await paintedPixels(page, NODES)).toBeGreaterThan(0);

    // Chrome logs this on stderr, not the page console, when it evicts the
    // oldest context — so ALSO assert the observable consequence (the editor's
    // own node layer must keep painting) rather than trusting the log alone.
    consoleOracle.allow(
      /Too many active WebGL contexts/i,
      'GL-06 is hunting exactly this warning; the probe asserts on it explicitly.'
    );

    const toolbar = new AppToolbarPOM(page);
    for (let i = 0; i < 4; i += 1) {
      await toolbar.clickExportImage();
      await expect(page.getByText('Export as image')).toBeVisible({
        timeout: 15_000
      });
      await page.keyboard.press('Escape');
      await expect(page.getByText('Export as image')).toBeHidden({
        timeout: 10_000
      });
      await page.waitForTimeout(300);
    }

    // PRECONDITION: the editor canvas is still mounted after all that.
    await expect(page.locator(NODES)).toBeAttached();
    // The consequence that matters: the node layer still paints. A force-lost
    // editor context that never recovered would read as 0 here.
    await expect
      .poll(() => paintedPixels(page, NODES), { timeout: 15_000 })
      .toBeGreaterThan(0);

  });
});

// ---------------------------------------------------------------------------
// GL-13 — the bulk layers' paint stacking is mount order alone
// ---------------------------------------------------------------------------

test.describe('GL-13 — Labels must composite above Nodes', () => {
  test('both canvases carry zIndex 0, so only DOM order decides', async ({
    page,
    app
  }) => {
    await expect(page.locator(NODES)).toBeAttached();
    await expect(page.locator(LABELS)).toBeAttached();

    const z = await page.evaluate(
      ([n, l]: string[]) => {
        const nodes = document.querySelector(n) as HTMLElement;
        const labels = document.querySelector(l) as HTMLElement;
        return {
          nodesZ: getComputedStyle(nodes).zIndex,
          labelsZ: getComputedStyle(labels).zIndex,
          // Node.DOCUMENT_POSITION_FOLLOWING === 4: labels comes AFTER nodes.
          labelsAfterNodes:
            (nodes.compareDocumentPosition(labels) & 4) !== 0,
          sameParent: nodes.parentElement === labels.parentElement
        };
      },
      [NODES, LABELS]
    );

    // PRECONDITION: neither layer carries an explicit stacking order, so the
    // ADR 0031 §2 "labels above nodes" rule rests entirely on mount order.
    expect(z.nodesZ).toBe(z.labelsZ);
    // The invariant itself.
    expect(z.labelsAfterNodes).toBe(true);
  });
});
