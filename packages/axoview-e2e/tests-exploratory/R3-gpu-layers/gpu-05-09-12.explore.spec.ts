/**
 * R3 — LOD / hit parity (GPU-05), bulk-vs-DOM chip text (GPU-09) and the
 * RectanglesCanvas invalidation matrix (GPU-12).
 *
 * GPU-09 uses a self-locating pixel oracle rather than a screenshot: the node
 * name chip is a near-white rounded rect, so the longest horizontal near-white
 * run in the read-back buffer IS the chip, and the text colour is dark. That
 * gives a measurable answer to "did the glyphs run into the chip's right
 * padding?" — i.e. was the name hard-cut at the texture edge — and the probe
 * pairs it with a SHORT-name control so a wrong band can't read as the finding.
 */
import {
  exploreTest as test,
  expect,
  expectModelHealthy
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount, getViewRectangleCount } from '../../helpers/store';
import { layerCounters, paintedPixels, setZoom } from '../_rig/glOracles';

const NODES = 'axoview-nodes-canvas';
const RECTS = 'axoview-rectangles-canvas';

// Mirrors the product constants the probes reason about (src/config.ts,
// config/labelSettings.ts, NodesCanvas): chip max width, MUI default spacing.
const LABEL_CHIP_MAX_W = 250;
const PAD_X = 12; // theme.spacing(1.5)

const canvasCentre = async (canvas: CanvasPOM) => {
  const box = (await canvas.interactionsLayer().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const nodesData = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector(
      '[data-testid="axoview-nodes-canvas"]'
    ) as HTMLElement | null;
    if (!c) return null;
    return {
      labelsDrawn: Number(c.dataset.labelsDrawn ?? -1),
      drawCount: Number(c.dataset.drawCount ?? -1),
      buildCount: Number(c.dataset.buildCount ?? -1)
    };
  });

const setReadableLabels = (page: Page, on: boolean) =>
  page.evaluate((v: boolean) => {
    (window as any).__axoview__.ui.getState().actions.setReadableLabels(v);
  }, on);

/** Rename the first model item (the GPU chip and the DOM label share `name`). */
const renameFirstItem = (page: Page, name: string) =>
  page.evaluate((n: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const id = m.items[0]?.id;
    if (!id) return { ok: false, reason: 'no model item' };
    const items = m.items.map((it: any) =>
      it.id === id ? { ...it, name: n, label: undefined } : it
    );
    m.actions.set({ items }, true);
    const after = bridge.model
      .getState()
      .items.find((it: any) => it.id === id)?.name;
    return { ok: after === n, id, after };
  }, name);

/**
 * Locate the name chip in the read-back buffer and report whether dark (text)
 * pixels reach into its right padding band.
 *
 * The chip is a near-white rounded rect with padY of blank white above and
 * below the text, so the LONGEST near-white horizontal run is a chip padding
 * row: its start/length give the chip's left edge and width. Rows carrying a
 * run ≥ 80 % of that give the chip's vertical extent. `darkInRightPad` then
 * counts text-coloured pixels inside the last `padX` device px before the
 * border — blank for a name that fits, non-zero for one cut at the edge.
 */
const chipProbe = (page: Page, padDevicePx: number) =>
  page.evaluate(
    ({ pad }: { pad: number }) => {
      const cv = document.querySelector(
        '[data-testid="axoview-nodes-canvas"]'
      ) as HTMLCanvasElement | null;
      if (!cv || !cv.width) return { error: 'no canvas' } as any;
      const s = document.createElement('canvas');
      s.width = cv.width;
      s.height = cv.height;
      const ctx = s.getContext('2d');
      if (!ctx) return { error: 'no 2d context' } as any;
      ctx.drawImage(cv, 0, 0);
      const W = s.width;
      const H = s.height;
      const d = ctx.getImageData(0, 0, W, H).data;
      const white = (i: number) =>
        d[i + 3] > 200 && d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235;
      const dark = (i: number) =>
        d[i + 3] > 120 && d[i] < 130 && d[i + 1] < 130 && d[i + 2] < 130;

      let best = { len: 0, x0: 0, y: -1 };
      const runStart = new Int32Array(H);
      const runLen = new Int32Array(H);
      for (let y = 0; y < H; y++) {
        let run = 0;
        let start = 0;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (white(i)) {
            if (run === 0) start = x;
            run += 1;
            if (run > runLen[y]) {
              runLen[y] = run;
              runStart[y] = start;
            }
          } else {
            run = 0;
          }
        }
        if (runLen[y] > best.len) best = { len: runLen[y], x0: runStart[y], y };
      }
      if (best.len < 8) return { error: `no chip found (longest white run ${best.len})` } as any;

      // Vertical extent: rows whose widest white run is within 20 % of the chip's.
      let yTop = best.y;
      let yBot = best.y;
      const near = (y: number) =>
        runLen[y] >= best.len * 0.8 &&
        Math.abs(runStart[y] - best.x0) <= Math.max(4, best.len * 0.1);
      while (yTop - 1 >= 0 && near(yTop - 1)) yTop -= 1;
      while (yBot + 1 < H && near(yBot + 1)) yBot += 1;
      // Re-expand across the TEXT rows between the two padding bands: any row
      // between the topmost and bottommost qualifying row belongs to the chip.
      let topBand = -1;
      let botBand = -1;
      for (let y = 0; y < H; y++) {
        if (near(y)) {
          if (topBand < 0) topBand = y;
          botBand = y;
        }
      }
      if (topBand >= 0) {
        yTop = topBand;
        yBot = botBand;
      }

      const right = best.x0 + best.len; // one past the chip's white interior
      const padPx = Math.max(2, Math.round(pad));
      // Per-column dark-pixel counts for the right padding band, outermost
      // column last. A name that FITS ends exactly at `right - padX`, so its
      // antialiasing can tint the first column or two of the band — only the
      // INNER half of the band (`rightHalfDark`) distinguishes "fits" from
      // "ran off the edge".
      const rightProfile: number[] = [];
      let darkInChip = 0;
      for (let x = Math.max(0, right - padPx); x < right; x++) {
        let n = 0;
        for (let y = yTop; y <= yBot; y++) if (dark((y * W + x) * 4)) n += 1;
        rightProfile.push(n);
      }
      for (let y = yTop; y <= yBot; y++) {
        for (let x = best.x0; x < right; x++) {
          if (dark((y * W + x) * 4)) darkInChip += 1;
        }
      }
      const half = Math.floor(rightProfile.length / 2);
      return {
        chipLeft: best.x0,
        chipWidth: best.len,
        chipTop: yTop,
        chipBottom: yBot,
        chipHeight: yBot - yTop + 1,
        darkInChip,
        darkInRightPad: rightProfile.reduce((a, b) => a + b, 0),
        rightHalfDark: rightProfile.slice(half).reduce((a, b) => a + b, 0),
        rightProfile
      };
    },
    { pad: padDevicePx }
  );

// ---------------------------------------------------------------------------
// GPU-05 — readableLabels widens the draw/hit gap for node names
// ---------------------------------------------------------------------------

test.describe('GPU-05 — readableLabels forces chips below the hit threshold', () => {
  test('at zoom 0.15 the setting turns chips ON while hit proxies stay absent', async ({
    page,
    app
  }) => {
    test.setTimeout(120_000);
    const canvas = new CanvasPOM(page);
    const c = await canvasCentre(canvas);
    await placeIconViaMouse(page, c);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await page.waitForTimeout(400);

    // The node-name hit proxies specifically (the floating-Label layer publishes
    // the same data-label-hit-id, so count the node one by its axoview id).
    const nodeHits = () =>
      page.evaluate(
        () =>
          document.querySelectorAll('[data-axoview-id="canvas-label-hit"]')
            .length
      );

    // PRECONDITION: at default zoom the node name is BOTH drawn and grabbable —
    // this is what proves the selector and the labelsDrawn counter work at all.
    const zoom0 = await page.evaluate(
      () => (window as any).__axoview__.ui.getState().zoom
    );
    expect(zoom0, 'default zoom must be above HIT_MIN_ZOOM').toBeGreaterThanOrEqual(0.4);
    const base = await nodesData(page);
    expect(base!.labelsDrawn, 'the node name chip must draw at default zoom').toBeGreaterThan(0);
    await expect.poll(nodeHits, { timeout: 5_000 }).toBeGreaterThan(0);

    // Below LABEL_LOD_ZOOM (0.25) with the setting OFF: no chips at all, so
    // nothing is visible-but-inert.
    await setReadableLabels(page, false);
    await setZoom(page, 0.15);
    await page.waitForTimeout(700);
    const offState = await nodesData(page);
    const offHits = await nodeHits();

    // Same zoom with the setting ON: chips are forced back on…
    await setReadableLabels(page, true);
    await page.waitForTimeout(700);
    const onState = await nodesData(page);
    const onHits = await nodeHits();

    test.info().annotations.push({
      type: 'GPU-05',
      description: `zoom 0.15 — readableLabels OFF: labelsDrawn=${offState!.labelsDrawn} hits=${offHits} | ON: labelsDrawn=${onState!.labelsDrawn} hits=${onHits}`
    });

    // Restore the persisted setting before the assertions so a failure can't
    // leak `readableLabels: true` into another probe's localStorage.
    await setReadableLabels(page, false);

    expect(offState!.labelsDrawn, 'below LABEL_LOD_ZOOM with the setting off, no chip should draw').toBe(0);
    expect(offHits, 'no hit proxies below HIT_MIN_ZOOM').toBe(0);
    // The finding: turning the accessibility setting ON produces a chip that is
    // visible and completely inert — the hit layer is still gated at 0.4.
    expect(onState!.labelsDrawn, 'readableLabels must force the chip to draw').toBeGreaterThan(0);
    expect(onHits, 'hit proxies with readableLabels ON below 0.4').toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GPU-09 — the bulk chip hard-cuts a long name; the DOM chip wraps it
// ---------------------------------------------------------------------------

test.describe('GPU-09 — bulk chip text vs the DOM label', () => {
  test('a long name is cut at the texture edge on the GPU and wrapped in the DOM', async ({
    page,
    app
  }) => {
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const c = await canvasCentre(canvas);
    await placeIconViaMouse(page, c);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await page.waitForTimeout(400);

    const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
    const zoom = await page.evaluate(
      () => (window as any).__axoview__.ui.getState().zoom
    );
    const scale = zoom * dpr;

    // CONTROL: a short name must NOT put glyphs in the chip's right padding.
    expect((await renameFirstItem(page, 'Short')).ok).toBe(true);
    await page.waitForTimeout(700);
    const shortChip = await chipProbe(page, PAD_X * scale);
    expect(shortChip.error, `short-name chip probe: ${shortChip.error}`).toBeUndefined();
    expect(
      shortChip.darkInChip,
      'the control must actually find text pixels in the chip'
    ).toBeGreaterThan(0);

    const LONG =
      'Warehouse Distribution Hub Northwest Regional Failover Cluster Alpha';
    expect((await renameFirstItem(page, LONG)).ok).toBe(true);
    await page.waitForTimeout(700);
    const longChip = await chipProbe(page, PAD_X * scale);
    expect(longChip.error, `long-name chip probe: ${longChip.error}`).toBeUndefined();

    // How wide would the name be if it were allowed to draw in full? Measured
    // with the same font string NodesCanvas builds.
    const textWidth = await page.evaluate(
      ({ name, fontPx }: { name: string; fontPx: number }) => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.font = `600 ${fontPx}px Roboto, Arial, sans-serif`;
        return ctx.measureText(name).width;
      },
      { name: LONG, fontPx: 18 }
    );

    test.info().annotations.push({
      type: 'GPU-09',
      description:
        `zoom=${zoom} dpr=${dpr} | short: w=${shortChip.chipWidth} rightPad=${JSON.stringify(shortChip.rightProfile)} innerHalf=${shortChip.rightHalfDark}` +
        ` | long: w=${longChip.chipWidth} rightPad=${JSON.stringify(longChip.rightProfile)} innerHalf=${longChip.rightHalfDark} darkInChip=${longChip.darkInChip}` +
        ` | full text needs ${Math.round(textWidth)}px, chip inner max ${LABEL_CHIP_MAX_W - 2 * PAD_X}px`
    });

    // PRECONDITION: the name genuinely cannot fit on one clamped line.
    expect(textWidth).toBeGreaterThan(LABEL_CHIP_MAX_W - 2 * PAD_X);
    // The chip is clamped to LABEL_CHIP_MAX_W (within a few px of border/AA)…
    expect(longChip.chipWidth).toBeLessThanOrEqual(Math.ceil(LABEL_CHIP_MAX_W * scale) + 4);
    expect(longChip.chipWidth).toBeGreaterThan(shortChip.chipWidth);
    // …the control chip leaves the inner half of its right padding blank (a
    // name that fits ends exactly at `chipW - padX`, so only its AA can tint
    // the band's outermost columns)…
    expect(
      shortChip.rightHalfDark,
      `a fitting name must not reach the border: ${JSON.stringify(shortChip.rightProfile)}`
    ).toBe(0);
    // …and the long name paints right up to it: no maxWidth, no clip path, no
    // ellipsis — `fillText` runs off the texture edge.
    expect(
      longChip.rightHalfDark,
      `the long name must overrun the chip padding: ${JSON.stringify(longChip.rightProfile)}`
    ).toBeGreaterThan(0);

    // The DOM half of the parity gap: selecting the node promotes it to a DOM
    // <Node>, whose LabelTitle wraps (wordBreak: break-word) inside maxWidth.
    await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const ui = bridge.ui.getState();
      const id = bridge.model.getState().items[0].id;
      ui.actions.setSelectedIds([{ type: 'ITEM', id }]);
      ui.actions.setItemControls({ type: 'ITEM', id });
    });
    await page.waitForTimeout(700);
    // SCOPE THE SELECTOR: the right sidebar also renders the item name, and a
    // <p> match there would look exactly like the on-canvas label. Only a match
    // INSIDE the renderer subtree counts.
    const dom = await page.evaluate(() => {
      const renderer = document.querySelector('[data-testid="axoview-canvas"]');
      const all = Array.from(document.querySelectorAll('p')).filter((p) =>
        (p.textContent ?? '').startsWith('Warehouse Distribution Hub')
      );
      const onCanvas = all.filter((p) => !!renderer && renderer.contains(p));
      const el = onCanvas[0];
      if (!el) {
        return {
          matches: all.length,
          onCanvas: 0,
          rendererFound: !!renderer
        } as any;
      }
      const r = el.getBoundingClientRect();
      // The chip is the scrolling/clipping ancestor (Label's overflow:hidden box).
      const chip = el.closest('div[style*="max-height"], div') as HTMLElement;
      return {
        matches: all.length,
        onCanvas: onCanvas.length,
        rendererFound: true,
        text: el.textContent,
        width: Math.round(r.width),
        height: Math.round(r.height),
        scrollHeight: el.scrollHeight,
        clipHeight: chip ? chip.clientHeight : null,
        clipScrollHeight: chip ? chip.scrollHeight : null,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight) || 27
      };
    });
    test.info().annotations.push({
      type: 'GPU-09-dom',
      description: JSON.stringify(dom)
    });
    // PRECONDITION: exactly the on-canvas label was measured, not a sidebar copy.
    expect(dom.rendererFound, 'renderer subtree not found').toBe(true);
    expect(
      dom.onCanvas,
      `no on-canvas DOM label (total <p> matches: ${dom.matches})`
    ).toBeGreaterThan(0);
    // The DOM path holds the WHOLE name in the box and WRAPS it over several
    // lines (wordBreak: break-word) inside the same 250 px budget the GPU chip
    // clamps to — a different truncation, at a line boundary, with the expand
    // affordance available. The GPU chip has one line and a mid-glyph cut.
    expect(dom.text).toBe(LONG);
    expect(
      dom.height,
      'the DOM label must wrap to more than one line'
    ).toBeGreaterThan(dom.lineHeight * 1.5);
    expect(dom.width).toBeLessThanOrEqual(LABEL_CHIP_MAX_W);

    await expectModelHealthy(page, 'GPU-09 after renaming to a long name');
  });
});

// ---------------------------------------------------------------------------
// GPU-12 — does a non-colour rectangle style change reach RectanglesCanvas?
// ---------------------------------------------------------------------------

test.describe('GPU-12 — RectanglesCanvas invalidation on a non-colour style edit', () => {
  test('a borderStyle / borderWidth change repaints the bulk rectangle', async ({
    page,
    app
  }) => {
    test.setTimeout(120_000);
    const canvas = new CanvasPOM(page);
    // Tile-planned like `rectangle-move-resize.spec.ts` — `dragFromTo` takes
    // interactions-box-relative coords, which is exactly what tileToScreen
    // returns.
    const from = await canvas.tileToScreen({ x: -2, y: -2 });
    const to = await canvas.tileToScreen({ x: 2, y: 2 });
    await canvas.switchToRectangleMode();
    await canvas.dragFromTo(from, to);
    await expect.poll(() => getViewRectangleCount(page), { timeout: 5_000 }).toBe(1);
    await page.waitForTimeout(600);

    // PRECONDITION: the bulk layer is actually painting this rectangle.
    const before = await layerCounters(page, RECTS);
    const paintedBefore = await paintedPixels(page, RECTS);
    expect(before.buildCount, 'RectanglesCanvas publishes data-build-count').not.toBeNull();
    expect(paintedBefore, 'the rectangle must paint on the bulk layer').toBeGreaterThan(0);

    // A style change that is NOT a colour: dashed border, 3× width.
    const styled = await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const m = bridge.model.getState();
      const ui = bridge.ui.getState();
      const views = m.views.map((v: any) => {
        if (v.id !== ui.view) return v;
        return {
          ...v,
          rectangles: (v.rectangles ?? []).map((r: any) => ({
            ...r,
            borderStyle: 'DOTTED',
            borderWidth: 4
          }))
        };
      });
      m.actions.set({ views }, true);
      const after = bridge.model
        .getState()
        .views.find((v: any) => v.id === ui.view)?.rectangles?.[0];
      return {
        ok: after?.borderStyle === 'DOTTED' && after?.borderWidth === 4,
        after: { borderStyle: after?.borderStyle, borderWidth: after?.borderWidth }
      };
    });
    // PRECONDITION: the store really carries the new style.
    expect(styled.ok, `style write failed: ${JSON.stringify(styled)}`).toBe(true);
    await page.waitForTimeout(900);

    const after = await layerCounters(page, RECTS);
    const paintedAfter = await paintedPixels(page, RECTS);
    test.info().annotations.push({
      type: 'GPU-12',
      description: `build ${before.buildCount}->${after.buildCount} painted ${paintedBefore}->${paintedAfter}`
    });

    // The hypothesis says the only store subscription is model.colors, so a
    // non-colour style edit should NOT rebuild. Rectangle style arrives via the
    // `rectangles` PROP instead, so this asserts what actually happens.
    expect(
      after.buildCount,
      `RectanglesCanvas did not rebuild after a borderStyle change (build ${before.buildCount}->${after.buildCount})`
    ).toBeGreaterThan(before.buildCount!);
    expect(
      paintedAfter,
      `the painted buffer did not change (${paintedBefore}->${paintedAfter})`
    ).not.toBe(paintedBefore);

    await expectModelHealthy(page, 'GPU-12 after a rectangle style change');
  });
});
