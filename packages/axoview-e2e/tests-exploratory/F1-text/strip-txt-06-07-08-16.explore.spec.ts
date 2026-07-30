/**
 * F1 probes — the strip ⇄ inline-editor seam, and the floating Label's own
 * edit lifecycle.
 *
 * TXT-06 and TXT-08 are REAL-INPUT probes (APPROACH §3 tier T3): both turn on
 * which element a press landed on and whether the capture-phase click-away
 * listener saw it, so `page.mouse` is used rather than synthetic dispatch.
 *
 * RIG NOTES: every test destructures `app` (the fixture is lazy), and every
 * probe asserts its PRECONDITION — that the edit session really is open and
 * that the strip control really is enabled — before drawing a conclusion.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';

type Page = import('@playwright/test').Page;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const views = bridge.model.getState().views;
    return (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
  });

const labels = async (page: Page) =>
  ((await activeView(page))?.labels ?? []).map((l: any) => ({
    id: l.id as string,
    text: (l.text ?? '') as string
  }));

const firstTextBox = async (page: Page) => {
  const view = await activeView(page);
  const tb = (view?.textBoxes ?? [])[0];
  return tb
    ? {
        id: tb.id as string,
        content: (tb.content ?? '') as string,
        verticalAlign: (tb.verticalAlign ?? null) as string | null
      }
    : null;
};

/** Real mouse press+release at the centre of a locator. */
const realClick = async (page: Page, locator: ReturnType<Page['locator']>) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('realClick: locator has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
};

// ---------------------------------------------------------------------------
// TXT-06 — the click-away allowlist is not shared by useInlineRename
// ---------------------------------------------------------------------------

test.describe('F1 / inline-rename click-away vs the strip', () => {
  test('TXT-06 control: pressing a strip control during a TEXT BOX edit session keeps the session alive', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeTextBoxAt(await canvas.tileToScreen({ x: 0, y: 0 }), {
      keepEditing: true
    });
    const editor = canvas.textBoxInlineEditor();
    await editor.waitFor({ state: 'visible', timeout: 5_000 });
    await editor.click();
    await page.keyboard.type('KEEPALIVE', { delay: 10 });

    const sizeButton = page.getByTestId('strip-text-size');
    // PRECONDITION: the control exists and is enabled for a text box.
    await expect(sizeButton).toBeVisible();
    await expect(sizeButton).toBeEnabled();

    await realClick(page, sizeButton);
    await page.waitForTimeout(250);
    // The allowlist ([data-axoview-strip] / MUI portals) keeps the session.
    await expect(editor).toBeVisible();
  });

  test('TXT-06: pressing the same strip control during a LABEL inline rename ends the session', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }));

    const labelEditor = page.getByTestId('label-inline-editor');
    await labelEditor.waitFor({ state: 'visible', timeout: 5_000 });
    // PRECONDITION: the placement really opened an inline rename session on a
    // real Label (not a stray contentEditable).
    const placed = await labels(page);
    expect(placed).toHaveLength(1);

    const sizeButton = page.getByTestId('strip-text-size');
    await expect(sizeButton).toBeVisible();
    await expect(sizeButton).toBeEnabled();

    await realClick(page, sizeButton);
    await page.waitForTimeout(250);
    // CHARACTERIZATION: the rename session is gone — useInlineRename's
    // capture-phase pointerdown has no strip/portal allowlist.
    await expect(labelEditor).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// TXT-07 / TXT-16 — the floating Label's edit lifecycle
// ---------------------------------------------------------------------------

test.describe('F1 / floating Label edit lifecycle', () => {
  test('TXT-07: a placed-then-abandoned Label survives as a literal "Label" chip', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }));
    const labelEditor = page.getByTestId('label-inline-editor');
    await labelEditor.waitFor({ state: 'visible', timeout: 5_000 });
    // PRECONDITION: exactly one Label, carrying LABEL_DEFAULTS.text.
    expect(await labels(page)).toEqual([
      { id: expect.any(String), text: 'Label' }
    ]);

    // Abandon it exactly as the text box's empty-box lifecycle is abandoned.
    await labelEditor.click();
    await page.keyboard.press('Escape');
    await expect(labelEditor).toHaveCount(0);

    // CHARACTERIZATION: the Label stays, showing the placeholder word.
    expect(await labels(page)).toEqual([
      { id: expect.any(String), text: 'Label' }
    ]);
  });

  test('TXT-07b: clearing a Label\'s text and committing silently restores the old text', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }));
    const labelEditor = page.getByTestId('label-inline-editor');
    await labelEditor.waitFor({ state: 'visible', timeout: 5_000 });

    await labelEditor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    // PRECONDITION: the editor really is empty before the commit.
    await expect
      .poll(async () => (await labelEditor.innerText()).trim(), { timeout: 2_000 })
      .toBe('');

    // Left-click-away commits (ADR 0022 §4).
    await page.evaluate(() => {
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 })
      );
    });
    await expect(labelEditor).toHaveCount(0);

    expect(await labels(page)).toEqual([
      { id: expect.any(String), text: 'Label' }
    ]);
  });

  test('TXT-16: a multi-line Label commits its newline, and the chip renders it', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }));
    const labelEditor = page.getByTestId('label-inline-editor');
    await labelEditor.waitFor({ state: 'visible', timeout: 5_000 });

    await labelEditor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('AAA', { delay: 10 });
    // useInlineRename's guard is `e.key === 'Enter' && (!multiline || !e.shiftKey)`.
    // With `multiline: true` (the Label), PLAIN Enter still commits and
    // SHIFT+Enter is the newline — the opposite of what the hook's own JSDoc
    // says ("plain Enter inserts a newline"). Verified by a first run of this
    // probe, where plain Enter ended the session.
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('BBB', { delay: 10 });
    // PRECONDITION: the editor really holds two lines before the commit.
    await expect
      .poll(async () => (await labelEditor.innerText()).trim(), { timeout: 2_000 })
      .toMatch(/AAA[\s\S]*BBB/);

    await page.evaluate(() => {
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 })
      );
    });
    await expect(labelEditor).toHaveCount(0);

    const committed = await labels(page);
    expect(committed).toHaveLength(1);
    // CHARACTERIZATION: what the model actually stores.
    expect(committed[0].text).toBe('AAA\nBBB');

    // …and what the chip does with it. The label chip is drawn on
    // LabelsCanvas; the hit proxy is the DOM copy that carries the text.
    const proxy = page.locator('[data-label-hit-id]').first();
    const proxyCount = await page.locator('[data-label-hit-id]').count();
    const proxyText = proxyCount ? (await proxy.textContent()) ?? '' : null;
    const proxyWhiteSpace = proxyCount
      ? await proxy.evaluate((el) => getComputedStyle(el).whiteSpace)
      : null;
    const proxyBox = proxyCount ? await proxy.boundingBox() : null;
    // CHARACTERIZATION: the proxy is a TRANSPARENT hit rect (no text of its
    // own), sized from the same measurement the chip is drawn from — and it is
    // two lines tall, so the multi-line commit propagated into the geometry.
    expect({
      proxyCount,
      proxyCarriesText: (proxyText ?? '').trim().length > 0,
      // Two rendered lines make the proxy roughly twice as tall as the ~19 px
      // single-line chip.
      tallerThanOneLine: proxyBox ? proxyBox.height > 28 : null
    }).toEqual({
      proxyCount: 1,
      proxyCarriesText: false,
      tallerThanOneLine: true
    });
    void proxyWhiteSpace;
  });

  test('TXT-16 control: a SINGLE-line Label\'s hit proxy is one line tall (so the height oracle above can tell them apart)', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }));
    const labelEditor = page.getByTestId('label-inline-editor');
    await labelEditor.waitFor({ state: 'visible', timeout: 5_000 });
    await labelEditor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('AAA', { delay: 10 });
    await page.evaluate(() => {
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 })
      );
    });
    await expect(labelEditor).toHaveCount(0);
    expect((await labels(page))[0].text).toBe('AAA');

    const box = await page.locator('[data-label-hit-id]').first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(28);
  });
});

// ---------------------------------------------------------------------------
// TXT-08 — Escape's split cancel semantics across the strip's two scopes
// ---------------------------------------------------------------------------

test.describe('F1 / mid-session strip writes vs Escape', () => {
  test('TXT-08: Escape discards the Quill-scoped strip write and keeps the element-scoped one', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const at = await canvas.tileToScreen({ x: 0, y: 0 });
    await canvas.placeTextBoxAt(at, { text: 'ALPHA' });

    const before = await firstTextBox(page);
    // PRECONDITION: a committed box with content and no alignment of either kind.
    expect(before).not.toBeNull();
    expect(before!.content).toContain('ALPHA');
    expect(before!.content).not.toContain('text-align');
    expect(before!.verticalAlign).toBeNull();

    // Re-open the on-canvas editor.
    await page.evaluate(
      (id: string) =>
        (window as any).__axoview__.ui
          .getState()
          .actions.setEditingTextBoxId(id),
      before!.id
    );
    const editor = canvas.textBoxInlineEditor();
    await editor.waitFor({ state: 'visible', timeout: 5_000 });

    // Both axes of the ONE alignment control, mid-session.
    await page.getByTestId('strip-alignment').click();
    await page.getByTestId('strip-align-h-center').click();
    await page.getByTestId('strip-align-v-middle').click();
    await page.keyboard.press('Escape'); // close the popover
    await expect(editor).toBeVisible(); // the session survived the popover

    // PRECONDITION: the vertical (element-level) write already landed in the
    // model while the session is still open — so the cancel below has
    // something to roll back.
    await expect
      .poll(async () => (await firstTextBox(page))?.verticalAlign, {
        timeout: 3_000
      })
      .toBe('middle');

    // Cancel the session (ADR 0034: Escape discards the edit).
    await editor.click();
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached', timeout: 5_000 });

    const after = await firstTextBox(page);
    // CHARACTERIZATION: the horizontal align (routed through Quill) is gone
    // with the cancelled draft; the vertical align (written straight to the
    // model) survived it.
    expect({
      horizontal: after!.content.includes('text-align'),
      vertical: after!.verticalAlign
    }).toEqual({ horizontal: false, vertical: 'middle' });
  });
});
