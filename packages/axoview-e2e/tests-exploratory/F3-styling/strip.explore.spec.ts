/**
 * F3 probes — the docked style strip (ADR 0030) driven through its real
 * controls.
 *
 * The strip's writers are bulk-aware shadows (`applyToTargets`) over a
 * representative read (`sel = bulk.ids[0]`), so every probe here selects a
 * REAL multi-selection and presses a REAL control — a store-level shortcut
 * would skip exactly the derivation under test.
 *
 * RIG NOTES: every test destructures `app` (the fixture is lazy) and asserts
 * its PRECONDITION — the entities exist, the selection is the size it should
 * be, the control is enabled — before concluding.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getModelHistoryLength } from '../../helpers/store';

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
  await canvas.placeLabelAt(await canvas.tileToScreen(tile));
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
 *  not the button — COLDSTART "DOM selector notes"), so target its MUI icon. */
const stripButtonByIcon = (page: Page, icon: string) =>
  strip(page).locator(`button:has(svg[data-testid="${icon}"])`);

// ---------------------------------------------------------------------------
// STYL-01 / STYL-02 — the format quartet over a bulk
// ---------------------------------------------------------------------------

test.describe('F3 / bulk text formatting', () => {
  test('STYL-01: toggling Bold over a bulk overwrites every member\'s italic/underline/strike with the representative\'s', async ({
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

    // Select both with A first, so A is the representative (`bulk.ids[0]`).
    await select(page, [
      { type: 'LABEL', id: a },
      { type: 'LABEL', id: b }
    ]);
    const bold = formatButton(page, 'Bold');
    await expect(bold).toBeEnabled();
    await bold.click();
    await page.waitForTimeout(300);

    const after = await labels(page);
    // Bold landed on both — that part is the feature working.
    expect({
      a: after.find((l) => l.id === a)!.isBold,
      b: after.find((l) => l.id === b)!.isBold
    }).toEqual({ a: true, b: true });
    // …and B's italic, which nobody touched, is gone: the label branch writes
    // the whole { bold, italic, strikethrough, underline } quartet from the
    // representative on every press.
    expect(after.find((l) => l.id === b)!.isItalic).toBe(false);
  });

  test('STYL-02: a mixed bulk has no indeterminate state — one press normalises it to the representative\'s opposite', async ({
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

    // Select both with the BOLD one first.
    await select(page, [
      { type: 'LABEL', id: a },
      { type: 'LABEL', id: b }
    ]);
    const bold = formatButton(page, 'Bold');
    // The button reads the representative, so it shows "on" for a mixed set.
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await bold.click();
    await page.waitForTimeout(300);

    // One press on a mixed selection turns bold OFF for everyone — the common
    // convention (Word/Docs/Figma) is mixed → apply to all.
    const after = await labels(page);
    expect({
      a: after.find((l) => l.id === a)!.isBold,
      b: after.find((l) => l.id === b)!.isBold
    }).toEqual({ a: false, b: false });
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
    await page.waitForTimeout(300);
    expect((await labels(page)).every((l) => l.isBold)).toBe(true);
    // PRECONDITION: exactly one history entry for the whole fan-out.
    expect((await getModelHistoryLength(page)) - historyBefore).toBe(1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    expect((await labels(page)).some((l) => l.isBold)).toBe(false);

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(300);
    expect((await labels(page)).every((l) => l.isBold)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STYL-03 / STYL-04 — the two "no colour" representations
// ---------------------------------------------------------------------------

test.describe('F3 / no-colour representation', () => {
  test('STYL-03/04: clearing a rectangle fill writes the string "transparent" and leaves the legacy preset id', async ({
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
    // Open the Fill popover and press the no-colour swatch.
    const fill = stripButtonByIcon(page, 'FormatColorFillIcon').first();
    await expect(fill).toBeEnabled();
    await fill.click();
    // NoColorSwatch has no testid — target its aria-label (the ADR 0039
    // "Transparent / no colour" swatch).
    const noColor = page.getByRole('button', { name: 'No color' }).first();
    await noColor.waitFor({ state: 'visible', timeout: 5_000 });
    await noColor.click();
    await page.waitForTimeout(300);

    const after = (await rectangles(page))[0];
    // CHARACTERIZATION, recorded either way: which of the two "no colour"
    // representations the rectangle uses, and whether the legacy preset stays.
    expect({
      customColor: after.customColor,
      keptLegacyPreset: after.color === rect.color
    }).toEqual({ customColor: 'transparent', keptLegacyPreset: true });
  });
});
