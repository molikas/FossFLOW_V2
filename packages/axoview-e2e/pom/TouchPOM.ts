/**
 * TouchPOM — drives REAL touch input for the ADR 0018 touch/pen gesture specs.
 *
 * Single-finger taps use page.touchscreen.tap (the supported high-level API).
 * One-finger pan and two-finger pinch use a CDP session
 * (Input.dispatchTouchEvent) because Playwright has no high-level multi-touch
 * API and synthetic DOM PointerEvents have no setPointerCapture semantics —
 * the lib's gesture machine relies on real captured pointers.
 *
 * All tile/point inputs are interactions-box-relative; helpers add the box's
 * viewport origin so CDP/touchscreen receive absolute viewport coordinates.
 */
import { CDPSession, Page } from '@playwright/test';
import { CanvasPOM, CanvasPoint } from './CanvasPOM';

export class TouchPOM {
  constructor(
    readonly page: Page,
    readonly canvas: CanvasPOM
  ) {}

  /** Interactions-box viewport origin (shares its bbox with the canvas). */
  private async origin(): Promise<CanvasPoint> {
    const box = await this.canvas.interactionsLayer().boundingBox();
    if (!box) throw new Error('TouchPOM: interactions box has no bounding box');
    return { x: box.x, y: box.y };
  }

  /** Box-relative point → absolute viewport point. */
  private async abs(point: CanvasPoint): Promise<CanvasPoint> {
    const o = await this.origin();
    return { x: o.x + point.x, y: o.y + point.y };
  }

  /** Box-relative point for a tile (mirrors CanvasPOM.tileToScreen). */
  async tilePoint(tile: { x: number; y: number }): Promise<CanvasPoint> {
    return this.canvas.tileToScreen(tile);
  }

  /** Tap a tile (single-finger). */
  async tapTile(tile: { x: number; y: number }) {
    const p = await this.abs(await this.tilePoint(tile));
    await this.page.touchscreen.tap(p.x, p.y);
    await this.page.waitForTimeout(60);
  }

  /** Tap a box-relative point (single-finger). */
  async tapPoint(point: CanvasPoint) {
    const p = await this.abs(point);
    await this.page.touchscreen.tap(p.x, p.y);
    await this.page.waitForTimeout(60);
  }

  private async cdp(): Promise<CDPSession> {
    return this.page.context().newCDPSession(this.page);
  }

  /**
   * One-finger drag using ABSOLUTE viewport coordinates (touchStart → moves →
   * touchEnd). For gestures that begin off the canvas — e.g. dragging an
   * Elements-panel icon onto the canvas, or dragging a transform handle.
   */
  async dragAbsolute(from: CanvasPoint, to: CanvasPoint, steps = 8) {
    const client = await this.cdp();
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: from.x, y: from.y, id: 0 }]
    });
    for (let i = 1; i <= steps; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: from.x + ((to.x - from.x) * i) / steps,
            y: from.y + ((to.y - from.y) * i) / steps,
            id: 0
          }
        ]
      });
      await this.page.waitForTimeout(16);
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await client.detach();
    await this.page.waitForTimeout(80);
  }

  /** Long-press at a box-relative point, then lift (no move). */
  async hold(point: CanvasPoint, holdMs = 600) {
    const a = await this.abs(point);
    const client = await this.cdp();
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: a.x, y: a.y, id: 0 }]
    });
    await this.page.waitForTimeout(holdMs);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await client.detach();
    await this.page.waitForTimeout(80);
  }

  /** Long-press at `from`, then drag to `to`. Box-relative. */
  async holdThenDrag(
    from: CanvasPoint,
    to: CanvasPoint,
    holdMs = 600,
    steps = 8
  ) {
    const a = await this.abs(from);
    const b = await this.abs(to);
    const client = await this.cdp();
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: a.x, y: a.y, id: 0 }]
    });
    await this.page.waitForTimeout(holdMs);
    for (let i = 1; i <= steps; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: a.x + ((b.x - a.x) * i) / steps,
            y: a.y + ((b.y - a.y) * i) / steps,
            id: 0
          }
        ]
      });
      await this.page.waitForTimeout(16);
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await client.detach();
    await this.page.waitForTimeout(80);
  }

  /** One-finger drag (pan): touchStart → moves → touchEnd. Box-relative. */
  async dragOneFinger(from: CanvasPoint, to: CanvasPoint, steps = 6) {
    const a = await this.abs(from);
    const b = await this.abs(to);
    const client = await this.cdp();
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: a.x, y: a.y, id: 0 }]
    });
    for (let i = 1; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const y = a.y + ((b.y - a.y) * i) / steps;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y, id: 0 }]
      });
      await this.page.waitForTimeout(16);
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await client.detach();
    await this.page.waitForTimeout(60);
  }

  /**
   * Two-finger pinch about a centroid. `scale` > 1 zooms in, < 1 zooms out.
   * Box-relative centroid; the two fingers start `startGap` px apart and end
   * `startGap*scale` apart along the x axis.
   */
  /**
   * Finger-by-finger control, for gestures the whole-gesture helpers above
   * cannot express: adding a second finger mid-drag, cancelling ONE of two,
   * lifting them in a chosen order. Promoted from the exploratory lane with the
   * I2 fixes (TCH-06/TCH-14) — those bugs live in the transitions BETWEEN
   * fingers, which a canned pinch cannot reach.
   *
   * `Input.dispatchTouchEvent` takes the full set of ACTIVE points and derives
   * the changed one, so this just tracks the live set and re-sends it per event.
   */
  async fingers(): Promise<Fingers> {
    // Record the pointerId Chromium assigns to each finger, in press order —
    // `Fingers.cancel` needs it to take ONE pointer away (see its comment).
    await this.page.evaluate(() => {
      const w = window as unknown as { __fingerPointerIds?: number[] };
      w.__fingerPointerIds = [];
      window.addEventListener(
        'pointerdown',
        (e) => {
          if (e.pointerType !== 'mouse') w.__fingerPointerIds?.push(e.pointerId);
        },
        true
      );
    });
    return new Fingers(this.page, await this.cdp(), await this.origin());
  }

  async pinch(centroid: CanvasPoint, scale: number, startGap = 80, steps = 8) {
    const c = await this.abs(centroid);
    const half = startGap / 2;
    const endHalf = half * scale;
    const client = await this.cdp();
    const points = (h: number) => [
      { x: c.x - h, y: c.y, id: 0 },
      { x: c.x + h, y: c.y, id: 1 }
    ];
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points(half)
    });
    for (let i = 1; i <= steps; i++) {
      const h = half + ((endHalf - half) * i) / steps;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: points(h)
      });
      await this.page.waitForTimeout(16);
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await client.detach();
    await this.page.waitForTimeout(60);
  }
}

/**
 * Finger-by-finger touch driver (see `TouchPOM.fingers()`).
 *
 * Points are interactions-box-relative, like the rest of the POM; the origin is
 * captured once when the driver opens.
 */
export class Fingers {
  private readonly pts = new Map<number, CanvasPoint>();
  /** Driver ids in the order they were first pressed (see `cancel`). */
  private readonly pressOrder: number[] = [];

  constructor(
    private readonly page: Page,
    private readonly client: CDPSession,
    private readonly origin: CanvasPoint
  ) {}

  private list() {
    return [...this.pts.entries()].map(([id, p]) => ({
      x: this.origin.x + p.x,
      y: this.origin.y + p.y,
      id
    }));
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel') {
    await this.client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: this.list()
    });
    await this.page.waitForTimeout(20);
  }

  async down(id: number, p: CanvasPoint) {
    this.pts.set(id, p);
    if (!this.pressOrder.includes(id)) this.pressOrder.push(id);
    await this.send('touchStart');
  }

  async moveTo(id: number, p: CanvasPoint, steps = 6) {
    const from = this.pts.get(id);
    if (!from) throw new Error(`Fingers: pointer ${id} is not down`);
    for (let i = 1; i <= steps; i += 1) {
      this.pts.set(id, {
        x: from.x + ((p.x - from.x) * i) / steps,
        y: from.y + ((p.y - from.y) * i) / steps
      });
      await this.send('touchMove');
    }
  }

  async up(id: number) {
    this.pts.delete(id);
    await this.send('touchEnd');
  }

  /**
   * The OS takes THIS finger away (notification, palm rejection, app switch),
   * leaving any others down.
   *
   * CDP cannot express that: `Input.dispatchTouchEvent` rejects a `touchCancel`
   * that carries any touch points ("TouchCancel must not have any touch
   * points"), so it can only cancel the whole gesture. **This is a rig trap that
   * has already cost one wrong verdict** — the campaign's TCH-14 probe called
   * `cancel` with a second finger still down, the CDP call threw, and because
   * the probe was a `test.fail()` the protocol error read as a confirmed bug.
   * (The defect it named was real, but by code reading, not by that run.)
   *
   * So: one finger left → the real CDP cancel. Others still down → dispatch the
   * `pointercancel` directly, with the pointerId Chromium actually assigned to
   * this finger (recorded at press time). That is exactly the event an OS
   * takeover delivers to the page, on a gesture whose other pointers are real.
   */
  async cancel(id: number) {
    const remaining = this.pts.size - (this.pts.has(id) ? 1 : 0);
    const at = this.pts.get(id);
    const index = this.pressOrder.indexOf(id);
    this.pts.delete(id);
    if (remaining === 0) {
      await this.send('touchCancel');
      return;
    }
    const point = at
      ? { x: this.origin.x + at.x, y: this.origin.y + at.y }
      : { x: 0, y: 0 };
    await this.page.evaluate(
      ({ i, x, y }) => {
        const ids = (window as unknown as { __fingerPointerIds?: number[] })
          .__fingerPointerIds;
        const pointerId = ids?.[i];
        if (pointerId === undefined) {
          throw new Error(
            `Fingers.cancel: no pointerId recorded for press #${i} — the ` +
              'pointerdown recorder did not see this finger.'
          );
        }
        window.dispatchEvent(
          new PointerEvent('pointercancel', {
            pointerId,
            pointerType: 'touch',
            bubbles: true,
            clientX: x,
            clientY: y
          })
        );
      },
      { i: index, x: point.x, y: point.y }
    );
    await this.page.waitForTimeout(20);
  }

  async close() {
    await this.client.detach();
  }
}
