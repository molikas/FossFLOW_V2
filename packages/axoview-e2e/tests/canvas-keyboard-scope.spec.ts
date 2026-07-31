/**
 * canvas-keyboard-scope.spec.ts — who owns a keystroke, and does the canvas
 * keydown dispatcher know when it doesn't.
 *
 * Promoted from the 2026-07 exploratory lane when wave 3 fixed the I1 cluster
 * (`I1-pointer/ptr-04-07-08-11-13`, `ptr-05-12-14`, `ptr-06-09-10-15`). The
 * campaign's carry-forward note named the theme: `useInteractionManager` binds
 * one keydown listener to `window` whose only scope check was "am I inside an
 * input?", so it fired behind modals (PTR-05), over text selections the app
 * doesn't own (PTR-12), on entities whose layer had since been locked (PTR-11),
 * and mid-gesture with no abort (PTR-07/08, PTR-10). PTR-14 is the same
 * dispatcher failing for the opposite reason — a guard so narrow that the real
 * keyboard could not satisfy it.
 *
 * The predicates themselves are unit-pinned
 * (`axoview-lib/src/interaction/__tests__/keyboardScope.test.ts` and
 * `toolHotkeys.test.ts`). This spec proves the dispatcher actually consults
 * them, through the real app: real keystrokes, real mouse, real store.
 *
 * PTR-14 must be driven through CDP `Input.dispatchKeyEvent`, not
 * `page.keyboard.press`. That is the whole point of the bug: Playwright's
 * synthetic Ctrl+Shift+] reports `e.key === ']'`, a physical US keyboard
 * reports `'}'`, and `z-order.spec.ts` was green on the former while the
 * feature was dead under the latter.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM, CanvasPoint } from '../pom/CanvasPOM';
import { LayersPanelPOM } from '../pom/LayersPanelPOM';
import { placeIconViaMouse } from '../helpers/place';
import {
  getModelItemCount,
  getModelConnectorCount,
  getViewItemCount,
  getUiMode
} from '../helpers/store';

type Page = import('@playwright/test').Page;

// Every leg places one or more nodes through the real palette before it can
// begin, which eats most of the default 30 s budget.
test.describe.configure({ timeout: 90_000 });

const A: CanvasPoint = { x: 700, y: 300 };
const B: CanvasPoint = { x: 860, y: 380 };
const C: CanvasPoint = { x: 560, y: 250 };

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model.getState().views.find((v: any) => v.id === viewId);
  });

const itemTiles = async (page: Page) =>
  ((await activeView(page))?.items ?? []).map((i: any) => ({
    id: i.id as string,
    tile: { x: i.tile.x as number, y: i.tile.y as number }
  }));

const itemZIndexes = async (page: Page) =>
  ((await activeView(page))?.items ?? []).map((i: any) => ({
    id: i.id as string,
    zIndex: (i.zIndex ?? 0) as number
  }));

const zOf = async (page: Page, id: string) =>
  (await itemZIndexes(page)).find((i: { id: string }) => i.id === id)?.zIndex ??
  null;

const selectedIds = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().selectedIds ?? []
  );

const selectItem = async (page: Page, id: string) => {
  await page.evaluate((itemId) => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setSelectedIds([{ type: 'ITEM', id: itemId }]);
    ui.actions.setItemControls({ type: 'ITEM', id: itemId });
  }, id);
  await page.waitForTimeout(80);
};

/** Closes the Elements dock so it can't intercept real mouse events. */
async function closeElementsDock(page: Page) {
  const icon = page.locator('[data-axoview-id="canvas-icon-grid-item"]').first();
  if (await icon.isVisible().catch(() => false)) {
    await page.locator('[data-axoview-id="dock-elements-toggle"]').click();
    await icon.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// PTR-05 — a modal dialog owns the keyboard
// ---------------------------------------------------------------------------
test.describe('a modal dialog shields the canvas (PTR-05)', () => {
  test('Delete with the Help dialog open leaves the selected item alone', async ({
    app
  }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

    const [first] = await itemTiles(page);
    await selectItem(page, first.id);

    // F1 opens Help through the very dispatcher under test.
    await page.keyboard.press('F1');
    const dialog = page.locator('.MuiDialog-root').first();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    await page.keyboard.press('Delete');
    await page.waitForTimeout(400);

    expect(await getViewItemCount(page)).toBe(2);
    await expect(dialog).toBeVisible();
  });

  test('a tool hotkey behind the dialog does not arm a drawing tool', async ({
    app
  }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);

    await page.keyboard.press('F1');
    await page
      .locator('.MuiDialog-root')
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 });
    const modeBefore = await modeType(page);

    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    expect(await modeType(page)).toBe(modeBefore);
  });

  test('control: the same keystrokes work once the dialog is closed', async ({
    app
  }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

    await page.keyboard.press('F1');
    const dialog = page.locator('.MuiDialog-root').first();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 });

    const [first] = await itemTiles(page);
    await selectItem(page, first.id);
    await page.keyboard.press('Delete');

    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PTR-07 / PTR-08 — interrupting an in-flight connector
// ---------------------------------------------------------------------------
test.describe('a mid-gesture mode switch aborts the connector (PTR-07/08)', () => {
  /**
   * Arms CONNECTOR mode and performs the FIRST click of the click-to-connect
   * flow on node A. `handleClickFirst` really creates the connector in the
   * model and opens a drag transaction; only the second click — or an abort —
   * closes either.
   */
  async function armHalfDrawnConnector(page: Page, canvas: CanvasPOM) {
    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);
    await closeElementsDock(page);

    await page.keyboard.press('c');
    await expect
      .poll(() => modeType(page), { timeout: 3_000 })
      .toBe('CONNECTOR');

    await canvas.clickAt(A);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 3_000 })
      .toBe(1);
    expect(((await getUiMode(page)) as any)?.isConnecting).toBe(true);
  }

  test('control: Escape aborts the half-drawn connector', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await armHalfDrawnConnector(page, canvas);

    await page.keyboard.press('Escape');
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 3_000 })
      .toBe(0);
  });

  test('the rectangle hotkey aborts it too, instead of stranding it', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await armHalfDrawnConnector(page, canvas);

    await page.keyboard.press('r');
    await expect
      .poll(() => modeType(page), { timeout: 3_000 })
      .toBe('RECTANGLE.DRAW');
    // Nudge the pointer so the deferred mode entry/exit actually runs.
    await canvas.dispatchAt(['mousemove'], { x: 760, y: 340 });
    await page.waitForTimeout(250);

    // Before the fix this left a real, saved connector with BOTH anchors on
    // node A, unreachable by Escape because the mode had already moved on.
    expect(await getModelConnectorCount(page)).toBe(0);
  });

  test('Ctrl+A aborts it, and does not fold an orphan into the selection', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await armHalfDrawnConnector(page, canvas);

    await page.keyboard.press('Control+a');
    await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('CURSOR');
    await canvas.dispatchAt(['mousemove'], { x: 760, y: 340 });
    await page.waitForTimeout(250);

    expect(await getModelConnectorCount(page)).toBe(0);
    const selected = await selectedIds(page);
    expect(selected).toHaveLength(2);
    expect(selected.some((s: any) => s.type === 'CONNECTOR')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PTR-10 — an undo taken mid-drag stays recoverable
// ---------------------------------------------------------------------------
test.describe('undo during a live drag (PTR-10)', () => {
  /** Absolute page coordinates of a tile. */
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

  test('Ctrl+Z mid-drag then Ctrl+Y still brings the node back', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, A);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setMode({ type: 'CURSOR', showCursor: true, mousedownItem: null });
      ui.actions.setItemControls(null);
    });
    await closeElementsDock(page);

    const [item] = await itemTiles(page);
    const from = await tileToPage(page, canvas, item.tile);

    // Press and drag, stopping while the button is still DOWN.
    await page.mouse.move(from.x, from.y);
    await page.waitForTimeout(80);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.move(from.x + 80, from.y + 25, { steps: 6 });
    await page.mouse.move(from.x + 160, from.y + 50, { steps: 6 });
    await expect
      .poll(() => modeType(page), { timeout: 3_000 })
      .toBe('DRAG_ITEMS');

    await page.keyboard.press('Control+z');
    await expect.poll(() => getViewItemCount(page), { timeout: 3_000 }).toBe(0);

    // The gesture is aborted, so this mouseup must commit nothing — before the
    // fix it committed the preview tiles as a NEW action, which clears redo and
    // made the undone placement unrecoverable.
    await page.mouse.up();
    await page.waitForTimeout(400);

    await page.keyboard.press('Control+y');
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PTR-11 — the arrow nudge honours a layer locked after selection
// ---------------------------------------------------------------------------
test.describe('arrow nudge vs a layer locked after selection (PTR-11)', () => {
  test('the arrow keys do not move items on a locked layer', async ({ app }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

    const ids: string[] = ((await activeView(page))?.items ?? []).map(
      (i: any) => i.id
    );

    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    const layerName = (await activeView(page)).layers[0].name as string;
    for (const id of ids) await layers.dragItemToLayer(id, layerName);

    // Select everything while the layer is still unlocked, then lock it.
    // E2/RED-15: locking does not re-validate a live selection, which is
    // exactly why the nudge has to re-check the gate per press.
    await page.keyboard.press('Control+a');
    await expect
      .poll(async () => (await selectedIds(page)).length, { timeout: 5_000 })
      .toBeGreaterThan(0);
    await layers.toggleLock(layerName);
    await page.waitForTimeout(250);

    const before = await itemTiles(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(350);
    expect(await itemTiles(page)).toEqual(before);

    // Not a one-press check: the stale selection survives, so a missing gate
    // would let the locked layer be walked across the canvas.
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(350);
    expect(await itemTiles(page)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// PTR-12 — Ctrl+C over a page text selection
// ---------------------------------------------------------------------------
test.describe('Ctrl+C over a text selection the app does not own (PTR-12)', () => {
  /** Selects some static text and arms a one-shot `copy` listener. */
  const armSelection = (page: Page, useInput: boolean) =>
    page.evaluate((inInput: boolean) => {
      (window as any).__copyFired = false;
      document.addEventListener(
        'copy',
        () => {
          (window as any).__copyFired = true;
        },
        { once: true }
      );

      const host = document.createElement(inInput ? 'input' : 'div');
      host.setAttribute('data-ptr12', '1');
      host.style.position = 'fixed';
      host.style.left = '4px';
      host.style.top = '4px';
      host.style.zIndex = '99999';
      if (inInput) {
        (host as HTMLInputElement).value = 'copy me';
        document.body.appendChild(host);
        (host as HTMLInputElement).focus();
        (host as HTMLInputElement).setSelectionRange(0, 7);
      } else {
        host.textContent = 'copy me';
        document.body.appendChild(host);
        const range = document.createRange();
        range.selectNodeContents(host);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }, useInput);

  const copyFired = (page: Page) =>
    page.evaluate(() => (window as any).__copyFired === true);

  test('control: Ctrl+C inside an <input> fires the native copy', async ({
    app
  }) => {
    const { page } = app;
    await armSelection(page, true);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);
    expect(await copyFired(page)).toBe(true);
  });

  test('Ctrl+C over a non-input selection fires the native copy too', async ({
    app
  }) => {
    const { page } = app;
    await armSelection(page, false);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);
    // Before the fix the dispatcher preventDefaulted unconditionally: no copy
    // event, no clipboard write, no feedback — the selection just sat there.
    expect(await copyFired(page)).toBe(true);
  });

  test('with no text selected, Ctrl+C still copies the canvas selection', async ({
    app
  }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await page.evaluate(() => window.getSelection()?.removeAllRanges());

    const [item] = await itemTiles(page);
    await selectItem(page, item.id);

    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+v');

    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// PTR-14 — the z-order chord a real keyboard sends
// ---------------------------------------------------------------------------
test.describe('bring-to-front with a real key identity (PTR-14)', () => {
  /** Ctrl(+Shift)+<char> through CDP — what a physical US keyboard produces. */
  const realChord = async (
    page: Page,
    key: string,
    code: string,
    vk: number,
    withShift = true
  ) => {
    const client = await page.context().newCDPSession(page);
    const modifiers = withShift ? 2 | 8 : 2;
    for (const type of ['rawKeyDown', 'keyUp'] as const) {
      await client.send('Input.dispatchKeyEvent', {
        type,
        modifiers,
        key,
        code,
        windowsVirtualKeyCode: vk,
        nativeVirtualKeyCode: vk
      });
    }
    await client.detach();
  };

  test('Ctrl+Shift+] as `}` brings the item to front; Ctrl+Shift+[ as `{` sends it back', async ({
    app
  }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await placeIconViaMouse(page, C);
    await expect.poll(() => getModelItemCount(page), { timeout: 12_000 }).toBe(3);

    const items = await itemZIndexes(page);
    const [a, b] = items;

    // Raise A twice so "front" (max + 1 = 3) is distinguishable from a plain
    // forward nudge (0 + 1 = 1).
    await selectItem(page, a.id);
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+]');
    await expect.poll(() => zOf(page, a.id), { timeout: 3_000 }).toBe(2);

    await selectItem(page, b.id);
    expect(await zOf(page, b.id)).toBe(0);

    await realChord(page, '}', 'BracketRight', 221);
    await expect.poll(() => zOf(page, b.id), { timeout: 3_000 }).toBe(3);

    await realChord(page, '{', 'BracketLeft', 219);
    await expect.poll(() => zOf(page, b.id), { timeout: 3_000 }).toBe(-1);
  });

  test('the unshifted chord still nudges by one', async ({ app }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

    const [a] = await itemZIndexes(page);
    await selectItem(page, a.id);

    await realChord(page, ']', 'BracketRight', 221, false);
    await expect.poll(() => zOf(page, a.id), { timeout: 3_000 }).toBe(1);
  });
});
