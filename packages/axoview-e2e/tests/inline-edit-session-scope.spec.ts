/**
 * inline-edit-session-scope.spec.ts — promoted from the F1 explore lane
 * (ADR 0047 flip rule): TXT-06 and TXT-08.
 *
 * Both are about the BOUNDARY of an on-canvas edit session — what counts as
 * inside it, and what a cancel takes with it.
 *
 * TXT-06: the click-away contract had two implementations and only one knew
 * about the strip. `TextBoxInlineEditor` allow-listed `[data-axoview-strip]`
 * and the MUI portals; `useInlineRename` — behind the floating Label, node-name
 * and connector-label editors — did not, so reaching for the strip mid-rename
 * ended the rename. Both now ask `isSessionPreservingTarget`.
 *
 * TXT-08: ADR 0034 §2's dual scope decides where a strip write goes, and Escape
 * only knew about one destination — the Quill draft. Element-level writes (font
 * size, line spacing, border, fill, vertical alignment) were already committed
 * when Escape arrived and survived it. One control made the split visible
 * inside itself: the alignment popover's horizontal half is content, its
 * vertical half is an element field. The session now has ONE cancel contract.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';

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
        verticalAlign: (tb.verticalAlign ?? null) as string | null,
        fontSize: (tb.fontSize ?? null) as number | null
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

test.describe('The strip is inside the edit session, for every editor', () => {
  test('CONTROL: a strip press during a TEXT BOX session keeps the session alive', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeTextBoxAt(await canvas.tileToScreen({ x: 0, y: 0 }), {
      text: 'ALPHA'
    });
    const box = await firstTextBox(page);
    expect(box).not.toBeNull();
    await page.evaluate(
      (id: string) =>
        (window as any).__axoview__.ui
          .getState()
          .actions.setEditingTextBoxId(id),
      box!.id
    );
    const editor = canvas.textBoxInlineEditor();
    await editor.waitFor({ state: 'visible', timeout: 5_000 });

    const sizeButton = page.getByTestId('strip-text-size');
    await expect(sizeButton).toBeEnabled();
    await realClick(page, sizeButton);
    await page.waitForTimeout(250);
    await expect(editor).toBeVisible();
  });

  test('TXT-06: the same strip press during a LABEL rename ALSO keeps it alive', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }), {
      keepEditing: true
    });

    const labelEditor = page.getByTestId('label-inline-editor');
    await labelEditor.waitFor({ state: 'visible', timeout: 5_000 });
    // PRECONDITION: the placement really opened a rename session on a real
    // Label (not a stray contentEditable).
    expect(await labels(page)).toHaveLength(1);
    // Give it text, so the TXT-07 empty-discard cannot be what removes it.
    await labelEditor.click();
    await page.keyboard.type('NAMED', { delay: 10 });

    const sizeButton = page.getByTestId('strip-text-size');
    await expect(sizeButton).toBeVisible();
    await expect(sizeButton).toBeEnabled();

    await realClick(page, sizeButton);
    await page.waitForTimeout(250);
    await expect(labelEditor).toBeVisible();
  });
});

test.describe('One cancel contract for the whole session (TXT-08)', () => {
  test('Escape rolls back the element-level strip writes as well as the draft', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeTextBoxAt(await canvas.tileToScreen({ x: 0, y: 0 }), {
      text: 'ALPHA'
    });

    const before = await firstTextBox(page);
    // PRECONDITION: a committed box with content and no alignment of either kind.
    expect(before).not.toBeNull();
    expect(before!.content).toContain('ALPHA');
    expect(before!.content).not.toContain('text-align');
    expect(before!.verticalAlign).toBeNull();

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

    // PRECONDITION: the vertical (element-level) write really did land in the
    // model while the session is open — so the cancel below has something to
    // roll back. This half is exactly what used to survive Escape.
    await expect
      .poll(async () => (await firstTextBox(page))?.verticalAlign, {
        timeout: 3_000
      })
      .toBe('middle');

    await editor.click();
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached', timeout: 5_000 });

    const after = await firstTextBox(page);
    // BOTH halves are gone: one gesture, one meaning.
    expect({
      horizontal: after!.content.includes('text-align'),
      vertical: after!.verticalAlign
    }).toEqual({ horizontal: false, vertical: null });
    // …and the content the session never touched is intact.
    expect(after!.content).toContain('ALPHA');
  });

  test('a COMMITTED session keeps its element-level writes', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeTextBoxAt(await canvas.tileToScreen({ x: 0, y: 0 }), {
      text: 'ALPHA'
    });
    const before = await firstTextBox(page);
    await page.evaluate(
      (id: string) =>
        (window as any).__axoview__.ui
          .getState()
          .actions.setEditingTextBoxId(id),
      before!.id
    );
    const editor = canvas.textBoxInlineEditor();
    await editor.waitFor({ state: 'visible', timeout: 5_000 });

    await page.getByTestId('strip-alignment').click();
    await page.getByTestId('strip-align-v-middle').click();
    // PRECONDITION: the element-level write landed while the session is open.
    await expect
      .poll(async () => (await firstTextBox(page))?.verticalAlign, {
        timeout: 3_000
      })
      .toBe('middle');
    await page.keyboard.press('Escape'); // close the popover only
    await expect(editor).toBeVisible();

    // Left-click-away COMMITS.
    await canvas.commitTextBoxEditor();
    await expect
      .poll(async () => (await firstTextBox(page))?.verticalAlign, {
        timeout: 3_000
      })
      .toBe('middle');
  });
});
