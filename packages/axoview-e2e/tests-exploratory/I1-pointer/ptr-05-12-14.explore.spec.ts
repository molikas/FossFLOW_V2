/**
 * I1 probes — keyboard-routing scope and key-identity bugs.
 *
 *  PTR-05  an open modal dialog does not shield the canvas from Delete
 *  PTR-12  Ctrl+C outside an input eats the native copy
 *  PTR-14  Ctrl+Shift+] is dead on a real keyboard (`e.key === '}'`)
 *
 * PTR-14 is the "synthetic-vs-real input" bug class applied to the KEYBOARD:
 * `handleZOrderShortcut` guards on `e.key !== ']' && e.key !== '['`, but a US
 * keyboard emits the SHIFTED character for a shifted key, so the documented
 * "jump to front/back" chord arrives as `}` / `{`. The probe first records what
 * Playwright's own `keyboard.press` produces (that is what `z-order.spec.ts`
 * asserts against), then re-runs the chord through CDP `Input.dispatchKeyEvent`
 * with the character a real keyboard sends.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getModelItemCount, getViewItemCount } from '../../helpers/store';

type Page = import('@playwright/test').Page;

const A: CanvasPoint = { x: 340, y: 250 };
const B: CanvasPoint = { x: 520, y: 330 };
const C: CanvasPoint = { x: 700, y: 250 };

const viewItems = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return ((view?.items ?? []) as any[]).map((i) => ({
      id: i.id,
      zIndex: i.zIndex ?? 0
    }));
  });

const zOf = async (page: Page, id: string) =>
  (await viewItems(page)).find((i) => i.id === id)?.zIndex ?? null;

const selectItem = async (page: Page, id: string) => {
  await page.evaluate((itemId) => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setSelectedIds([{ type: 'ITEM', id: itemId }]);
    ui.actions.setItemControls({ type: 'ITEM', id: itemId });
  }, id);
  await page.waitForTimeout(80);
};

/** Records `e.key` / modifiers for the next window keydown. */
const armKeyRecorder = (page: Page) =>
  page.evaluate(() => {
    (window as any).__ptrKeys = [];
    const rec = (e: KeyboardEvent) => {
      (window as any).__ptrKeys.push({
        key: e.key,
        code: e.code,
        ctrl: e.ctrlKey,
        shift: e.shiftKey
      });
    };
    (window as any).__ptrRec = rec;
    window.addEventListener('keydown', rec, true);
  });

const recordedKeys = (page: Page) =>
  page.evaluate(() => (window as any).__ptrKeys ?? []);

// ---------------------------------------------------------------------------
// PTR-05 — an open modal dialog does not block the canvas keydown handler
// ---------------------------------------------------------------------------
test.describe('PTR-05 — Delete while a modal dialog is open', () => {
  test.fail(
    'BUG: Delete with the Help dialog open destroys the item behind it',
    async ({ app }) => {
      const { page } = app;

      await placeIconViaMouse(page, A);
      await placeIconViaMouse(page, B);
      await expect
        .poll(() => getModelItemCount(page), { timeout: 5_000 })
        .toBe(2);

      const [first] = await viewItems(page);
      await selectItem(page, first.id);

      // F1 opens the help dialog — the same keydown dispatcher does it.
      await page.keyboard.press('F1');
      await page.locator('.MuiDialog-root').first().waitFor({
        state: 'visible',
        timeout: 5_000
      });

      await page.keyboard.press('Delete');
      await page.waitForTimeout(400);

      // A modal is open: the canvas is not the focused surface, so Delete must
      // not reach it.
      expect(await getViewItemCount(page)).toBe(2);
    }
  );

  test('characterization: the dialog stays open while the canvas silently loses the item', async ({
    app
  }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

    const [first] = await viewItems(page);
    await selectItem(page, first.id);

    await page.keyboard.press('F1');
    const dialog = page.locator('.MuiDialog-root').first();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    await page.keyboard.press('Delete');
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);

    // The dialog is still up — the user never saw the canvas change.
    await expect(dialog).toBeVisible();
    const remaining = await viewItems(page);
    expect(remaining.some((i) => i.id === first.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PTR-12 — Ctrl+C outside an input eats the native copy
// ---------------------------------------------------------------------------
test.describe('PTR-12 — Ctrl+C over a page text selection', () => {
  /** Selects the given element's text and reports whether a `copy` event fired. */
  const copyFiredForSelection = async (page: Page, useInput: boolean) =>
    page.evaluate((inInput: boolean) => {
      (window as any).__copyFired = false;
      const onCopy = () => {
        (window as any).__copyFired = true;
      };
      document.addEventListener('copy', onCopy, { once: true });

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

  test('positive control: Ctrl+C inside an <input> still fires the native copy', async ({
    app
  }) => {
    const { page } = app;
    await copyFiredForSelection(page, true);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);
    // isEditableTarget lets the keystroke through untouched.
    expect(await copyFired(page)).toBe(true);
  });

  test.fail(
    'BUG: Ctrl+C over a non-input text selection is swallowed — no native copy',
    async ({ app }) => {
      const { page } = app;
      await copyFiredForSelection(page, false);
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(200);
      expect(await copyFired(page)).toBe(true);
    }
  );

  test('characterization: the keystroke is preventDefaulted and no copy event fires', async ({
    app
  }) => {
    const { page } = app;
    await copyFiredForSelection(page, false);
    await page.evaluate(() => {
      (window as any).__ptrPrevented = null;
      window.addEventListener(
        'keydown',
        (e) => {
          if (e.key.toLowerCase() === 'c' && e.ctrlKey) {
            (window as any).__ptrPrevented = e.defaultPrevented;
          }
        },
        false
      );
    });
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);

    expect(await copyFired(page)).toBe(false);
    // The bubble-phase listener runs after the app's, so it sees the verdict.
    expect(
      await page.evaluate(() => (window as any).__ptrPrevented)
    ).toBe(true);
    // The selected text is still selected — the user sees no feedback at all.
    expect(
      await page.evaluate(() => window.getSelection()?.toString() ?? '')
    ).toBe('copy me');
  });
});

// ---------------------------------------------------------------------------
// PTR-14 — Ctrl+Shift+] on a real keyboard
// ---------------------------------------------------------------------------
test.describe('PTR-14 — bring-to-front chord with a real key identity', () => {
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

  test('diagnostic: Playwright and a real keyboard disagree on e.key for Shift+]', async ({
    app
  }) => {
    const { page } = app;
    await armKeyRecorder(page);

    await page.keyboard.press('Control+Shift+]');
    await page.waitForTimeout(120);
    await realChord(page, '}', 'BracketRight', 221);
    await page.waitForTimeout(120);

    const keys = (await recordedKeys(page)).filter(
      (k: any) => k.code === 'BracketRight'
    );
    expect(keys.length).toBeGreaterThanOrEqual(2);
    // Recorded for the record: whatever these are, the handler only accepts ']'.
    // eslint-disable-next-line no-console
    console.log('PTR-14 recorded keys:', JSON.stringify(keys));
    expect(keys[0].ctrl && keys[0].shift).toBe(true);
  });

  test.fail(
    'BUG: the real-keyboard Ctrl+Shift+] does not bring the item to front',
    async ({ app }) => {
      const { page } = app;

      await placeIconViaMouse(page, A);
      await placeIconViaMouse(page, B);
      await placeIconViaMouse(page, C);
      await expect
        .poll(() => getModelItemCount(page), { timeout: 8_000 })
        .toBe(3);

      const items = await viewItems(page);
      const [a, b] = items;

      // Raise A twice so "front" (max+1 = 3) is distinguishable from a plain
      // forward nudge (0 + 1 = 1).
      await selectItem(page, a.id);
      await page.keyboard.press('Control+]');
      await page.waitForTimeout(150);
      await page.keyboard.press('Control+]');
      await expect.poll(() => zOf(page, a.id), { timeout: 3_000 }).toBe(2);

      await selectItem(page, b.id);
      expect(await zOf(page, b.id)).toBe(0);

      await realChord(page, '}', 'BracketRight', 221);
      await page.waitForTimeout(400);

      expect(await zOf(page, b.id)).toBe(3);
    }
  );

  test('characterization: the chord is a complete no-op — zIndex never moves', async ({
    app
  }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await placeIconViaMouse(page, C);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(3);

    const items = await viewItems(page);
    const [a, b] = items;

    await selectItem(page, a.id);
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+]');
    await expect.poll(() => zOf(page, a.id), { timeout: 3_000 }).toBe(2);

    await selectItem(page, b.id);
    const before = await viewItems(page);

    // Both halves of the absolute chord, exactly as a US keyboard emits them.
    await realChord(page, '}', 'BracketRight', 221);
    await page.waitForTimeout(250);
    await realChord(page, '{', 'BracketLeft', 219);
    await page.waitForTimeout(250);

    expect(await viewItems(page)).toEqual(before);

    // Positive control on the same rig: the UNSHIFTED chord, which a real
    // keyboard emits as ']', DOES reach the handler — so the CDP path can drive
    // it and the two no-ops above are the guard rejecting '}' / '{'.
    await realChord(page, ']', 'BracketRight', 221, false);
    await expect.poll(() => zOf(page, b.id), { timeout: 3_000 }).toBe(1);
    await expectStoreInvariants(page, 'after real-key z-order chords');
  });
});
