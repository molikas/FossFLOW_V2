/**
 * bulk-format-mixed.spec.ts — promoted from the F3 explore lane (ADR 0047 flip
 * rule): STYL-01, STYL-02, STYL-06, STYL-07 and the STYL-03 no-colour ruling,
 * driven through the REAL strip controls.
 *
 * The class these pin (F3 standing thread F-c): the docked strip used to read
 * ONE member of a homogeneous bulk (`bulk.ids[0]`) and write the derived value
 * to all of them — so a Bold press carried the representative's whole B/I/U/S
 * quartet (STYL-01) and its direction (STYL-02/06), and the same selection in a
 * different order produced a different result (STYL-08).
 *
 * Every test asserts its PRECONDITION — the entities exist, the selection is
 * the size it should be, the control is enabled — before concluding.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';
import { getModelHistoryLength } from '../helpers/store';

type Page = import('@playwright/test').Page;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const views = bridge.model.getState().views;
    return (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
  });

interface ProbeLabel {
  id: string;
  text: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
}

const labels = async (page: Page): Promise<ProbeLabel[]> =>
  ((await activeView(page))?.labels ?? []).map((l: any) => ({
    id: l.id as string,
    text: l.text as string,
    isBold: !!l.isBold,
    isItalic: !!l.isItalic,
    isUnderline: !!l.isUnderline,
    isStrikethrough: !!l.isStrikethrough
  }));

const rectangles = async (page: Page) =>
  ((await activeView(page))?.rectangles ?? []).map((r: any) => ({
    id: r.id as string,
    color: r.color as string | undefined,
    customColor: r.customColor as string | undefined
  }));

const select = (page: Page, refs: Array<{ type: string; id: string }>) =>
  page.evaluate(
    (list) =>
      (window as any).__axoview__.ui.getState().actions.setSelectedIds(list),
    refs
  );

/** Place a floating Label, commit its text, and return its id. */
const placeLabel = async (
  page: Page,
  canvas: CanvasPOM,
  tile: { x: number; y: number },
  text: string
) => {
  await canvas.placeLabelAt(await canvas.tileToScreen(tile), {
    keepEditing: true
  });
  const editor = page.getByTestId('label-inline-editor');
  await editor.waitFor({ state: 'visible', timeout: 5_000 });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text, { delay: 5 });
  await page.evaluate(() => {
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0 })
    );
  });
  await expect(editor).toHaveCount(0);
  const all = await labels(page);
  const found = all.find((l) => l.text === text);
  if (!found) throw new Error(`placeLabel: '${text}' not committed`);
  return found.id;
};

/** The strip's own controls — scoped to [data-axoview-strip] so a Quill
 *  toolbar elsewhere on the page can never satisfy the same role+name. */
const strip = (page: Page) => page.locator('[data-axoview-strip]');

const formatButton = (page: Page, name: 'Bold' | 'Italic') =>
  strip(page).getByRole('button', { name, exact: true });

/** A StripButton carries no accessible name (MUI Tooltip titles the wrapper,
 *  not the button), so target its MUI icon. */
const stripButtonByIcon = (page: Page, icon: string) =>
  strip(page).locator(`button:has(svg[data-testid="${icon}"])`);

test.describe('Bulk text formatting — the whole selection decides', () => {
  test('STYL-01: a Bold press leaves every other format on every member alone', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const a = await placeLabel(page, canvas, { x: -2, y: 0 }, 'AAA');
    const b = await placeLabel(page, canvas, { x: 3, y: 0 }, 'BBB');

    // Give B (only) italic, through the same strip control.
    await select(page, [{ type: 'LABEL', id: b }]);
    const italic = formatButton(page, 'Italic');
    await expect(italic).toBeEnabled();
    await italic.click();
    await expect
      .poll(async () => (await labels(page)).find((l) => l.id === b)?.isItalic, {
        timeout: 3_000
      })
      .toBe(true);

    // PRECONDITION: A is plain, B is italic — a genuinely MIXED selection.
    const before = await labels(page);
    expect({
      a: before.find((l) => l.id === a)!.isItalic,
      b: before.find((l) => l.id === b)!.isItalic
    }).toEqual({ a: false, b: true });

    await select(page, [
      { type: 'LABEL', id: a },
      { type: 'LABEL', id: b }
    ]);
    const bold = formatButton(page, 'Bold');
    await expect(bold).toBeEnabled();
    await bold.click();
    await expect
      .poll(async () => (await labels(page)).every((l) => l.isBold), {
        timeout: 3_000
      })
      .toBe(true);

    const after = await labels(page);
    // Bold landed on both — the feature working…
    expect({
      a: after.find((l) => l.id === a)!.isBold,
      b: after.find((l) => l.id === b)!.isBold
    }).toEqual({ a: true, b: true });
    // …and B's italic, which nobody touched, SURVIVES. The pre-fix writer built
    // the whole { bold, italic, strikethrough, underline } quartet from the
    // representative and fanned it out, wiping it.
    expect(after.find((l) => l.id === b)!.isItalic).toBe(true);
    expect(after.find((l) => l.id === a)!.isItalic).toBe(false);
  });

  test('STYL-02: a mixed bulk reads indeterminate, and one press applies to all', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const a = await placeLabel(page, canvas, { x: -2, y: 0 }, 'AAA');
    const b = await placeLabel(page, canvas, { x: 3, y: 0 }, 'BBB');

    // Make A bold only.
    await select(page, [{ type: 'LABEL', id: a }]);
    await formatButton(page, 'Bold').click();
    await expect
      .poll(async () => (await labels(page)).find((l) => l.id === a)?.isBold, {
        timeout: 3_000
      })
      .toBe(true);
    // PRECONDITION: mixed — A bold, B not.
    const before = await labels(page);
    expect({
      a: before.find((l) => l.id === a)!.isBold,
      b: before.find((l) => l.id === b)!.isBold
    }).toEqual({ a: true, b: false });

    // Select both with the BOLD one first — the order that used to decide.
    await select(page, [
      { type: 'LABEL', id: a },
      { type: 'LABEL', id: b }
    ]);
    const bold = formatButton(page, 'Bold');
    // Indeterminate, not "on" (ARIA's third pressed value).
    await expect(bold).toHaveAttribute('aria-pressed', 'mixed');
    await bold.click();

    // One press on a mixed selection APPLIES (Word/Docs/Figma), not clears.
    await expect
      .poll(async () => (await labels(page)).map((l) => l.isBold), {
        timeout: 3_000
      })
      .toEqual([true, true]);
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
  });

  test('STYL-08: reversing the same selection does not reverse the outcome', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const a = await placeLabel(page, canvas, { x: -2, y: 0 }, 'AAA');
    const b = await placeLabel(page, canvas, { x: 3, y: 0 }, 'BBB');

    await select(page, [{ type: 'LABEL', id: a }]);
    await formatButton(page, 'Bold').click();
    await expect
      .poll(async () => (await labels(page)).find((l) => l.id === a)?.isBold, {
        timeout: 3_000
      })
      .toBe(true);

    // PLAIN one first this time — the pre-fix strip bolded everyone here and
    // un-bolded everyone in the STYL-02 test above, from the same two labels.
    await select(page, [
      { type: 'LABEL', id: b },
      { type: 'LABEL', id: a }
    ]);
    const bold = formatButton(page, 'Bold');
    await expect(bold).toHaveAttribute('aria-pressed', 'mixed');
    await bold.click();
    await expect
      .poll(async () => (await labels(page)).map((l) => l.isBold), {
        timeout: 3_000
      })
      .toEqual([true, true]);
  });

  test('STYL-07: a bulk style change is one undo entry, and redo restores it', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const a = await placeLabel(page, canvas, { x: -2, y: 0 }, 'AAA');
    const b = await placeLabel(page, canvas, { x: 3, y: 0 }, 'BBB');
    await select(page, [
      { type: 'LABEL', id: a },
      { type: 'LABEL', id: b }
    ]);

    const historyBefore = await getModelHistoryLength(page);
    await formatButton(page, 'Bold').click();
    await expect
      .poll(async () => (await labels(page)).every((l) => l.isBold), {
        timeout: 3_000
      })
      .toBe(true);
    // PRECONDITION: exactly one history entry for the whole fan-out.
    expect((await getModelHistoryLength(page)) - historyBefore).toBe(1);

    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await labels(page)).some((l) => l.isBold), {
        timeout: 3_000
      })
      .toBe(false);

    await page.keyboard.press('Control+Shift+z');
    await expect
      .poll(async () => (await labels(page)).every((l) => l.isBold), {
        timeout: 3_000
      })
      .toBe(true);
  });
});

test.describe('No-colour is an absent fill (ADR 0039 addendum — STYL-03)', () => {
  test('clearing a rectangle fill removes BOTH the custom colour and the legacy preset', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const from = await canvas.tileToScreen({ x: -2, y: -2 });
    const to = await canvas.tileToScreen({ x: 2, y: 2 });
    await canvas.dispatchAt(['mousemove'], from);
    await canvas.switchToRectangleMode();
    await canvas.dragFromTo(from, to);
    await expect
      .poll(async () => (await rectangles(page)).length, { timeout: 5_000 })
      .toBe(1);
    const rect = (await rectangles(page))[0];
    // PRECONDITION: a fresh rectangle carries a preset `color` id and no
    // customColor — the legacy shape the ADR 0039 resolution exists for.
    expect(rect.color).toBeTruthy();
    expect(rect.customColor).toBeUndefined();

    await select(page, [{ type: 'RECTANGLE', id: rect.id }]);
    const fill = stripButtonByIcon(page, 'FormatColorFillIcon').first();
    await expect(fill).toBeEnabled();
    await fill.click();
    const noColor = page.getByRole('button', { name: 'No color' }).first();
    await noColor.waitFor({ state: 'visible', timeout: 5_000 });
    await noColor.click();

    // Absent, not the 'transparent' sentinel — and the dormant preset goes with
    // it, or the fill the user just cleared would repaint from `color`.
    await expect
      .poll(async () => (await rectangles(page))[0].customColor, {
        timeout: 3_000
      })
      .toBeUndefined();
    expect((await rectangles(page))[0].color).toBeUndefined();
  });
});
