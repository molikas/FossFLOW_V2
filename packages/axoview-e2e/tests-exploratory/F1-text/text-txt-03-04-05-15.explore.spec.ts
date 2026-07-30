/**
 * F1 probes — text-box lifecycle, the name↔label decouple, and the notes sink.
 *
 * RIG NOTES (COLDSTART "Rig traps"):
 *  - every test destructures `app` even when unused — the fixture is LAZY and a
 *    `{ page }`-only test never boots the diagram;
 *  - every probe asserts its PRECONDITION (the box really was placed, the node
 *    really has no `label`, the payload really reached the model) before
 *    concluding anything, so a rig failure cannot masquerade as evidence.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { byAxoviewId } from '../../helpers/selectors';
import { getViewTextBoxCount } from '../../helpers/store';

type Page = import('@playwright/test').Page;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const views = bridge.model.getState().views;
    return (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
  });

const textBoxes = async (page: Page) =>
  ((await activeView(page))?.textBoxes ?? []).map((t: any) => ({
    id: t.id as string,
    content: (t.content ?? '') as string
  }));

const selectedIds = (page: Page) =>
  page.evaluate(
    () =>
      ((window as any).__axoview__.ui.getState().selectedIds ?? []) as Array<{
        type: string;
        id: string;
      }>
  );

// ---------------------------------------------------------------------------
// TXT-04 / TXT-15 — the empty-box discard
// ---------------------------------------------------------------------------

test.describe('F1 / empty-box discard', () => {
  test('TXT-15: the discard leaves the dead text box in uiState.selectedIds', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const placePixel = await canvas.tileToScreen({ x: 0, y: 0 });
    await canvas.placeTextBoxAt(placePixel, { keepEditing: true });

    // PRECONDITION: the box exists and IS the current selection (TextBox mode
    // calls setItemControls, which mirrors into selectedIds).
    await expect.poll(() => getViewTextBoxCount(page), { timeout: 5_000 }).toBe(1);
    const placed = (await textBoxes(page))[0];
    expect(placed).toBeTruthy();
    await expect
      .poll(async () => (await selectedIds(page)).map((s) => s.id), {
        timeout: 3_000
      })
      .toEqual([placed.id]);

    // Abandon the never-committed box — the ADR 0034 empty-box lifecycle
    // deletes it (`discardEmpty` → setEditingTextBoxId(null) +
    // setItemControls(null) + deleteTextBox).
    await canvas.dismissTextBoxEditor();
    await expect.poll(() => getViewTextBoxCount(page), { timeout: 5_000 }).toBe(0);

    // CHARACTERIZATION: itemControls is cleared…
    const controls = await page.evaluate(
      () => (window as any).__axoview__.ui.getState().itemControls
    );
    expect(controls).toBeNull();
    // …but selectedIds still names the deleted box.
    const stale = await selectedIds(page);
    expect(stale.map((s) => s.id)).toEqual([placed.id]);
  });

  test.fail(
    'TXT-15: the store invariants should hold after an empty-box discard (INV-2)',
    async ({ page, app }) => {
      void app;
      const canvas = new CanvasPOM(page);
      const placePixel = await canvas.tileToScreen({ x: 0, y: 0 });
      await canvas.placeTextBoxAt(placePixel, { keepEditing: true });
      await expect
        .poll(() => getViewTextBoxCount(page), { timeout: 5_000 })
        .toBe(1);
      // PRECONDITION: the setup really happened — a box exists and is selected.
      expect((await selectedIds(page)).length).toBe(1);

      await canvas.dismissTextBoxEditor();
      await expect
        .poll(() => getViewTextBoxCount(page), { timeout: 5_000 })
        .toBe(0);

      await expectStoreInvariants(page, 'after empty-box discard');
    }
  );

  test('TXT-04: undoing the discard resurrects an invisible empty text box', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const placePixel = await canvas.tileToScreen({ x: 0, y: 0 });
    await canvas.placeTextBoxAt(placePixel, { keepEditing: true });
    await expect.poll(() => getViewTextBoxCount(page), { timeout: 5_000 }).toBe(1);
    await canvas.dismissTextBoxEditor();
    await expect.poll(() => getViewTextBoxCount(page), { timeout: 5_000 }).toBe(0);

    // PRECONDITION: undo is armed (otherwise the assertion below proves nothing).
    const canUndo = await page.evaluate(() =>
      (window as any).__axoview__.model.getState().actions.canUndo()
    );
    expect(canUndo).toBe(true);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    // CHARACTERIZATION — what actually comes back, asserted explicitly (an
    // either-way assertion here would be a tautology and prove nothing).
    const after = await textBoxes(page);
    expect(after.map((t: { content: string }) => t.content)).toEqual(['']);
    // A resurrected box with '' content is an invisible ghost: it draws
    // nothing, but it is a real entity in the view with a 1×1 footprint.
    const size = await page.evaluate(
      (id: string) =>
        (window as any).__axoview__.scene.getState().textBoxes?.[id]?.size ?? null,
      after[0].id
    );
    expect(size).toEqual({ width: 1, height: 1 });
  });
});

// ---------------------------------------------------------------------------
// TXT-05 — seedNodeLabel is a load-time-only seed
// ---------------------------------------------------------------------------

test.describe('F1 / node name↔label decouple', () => {
  test('TXT-05: renaming a never-reloaded node in Layers moves its on-canvas text', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const placePixel = await canvas.tileToScreen({ x: 1, y: 1 });
    await placeIconViaMouse(page, placePixel);

    const item = await page.evaluate(() => {
      const items = (window as any).__axoview__.model.getState().items;
      const last = items[items.length - 1];
      return last ? { id: last.id, name: last.name, label: last.label } : null;
    });
    // PRECONDITION: a node was placed, with an identity `name` and NO `label`
    // — exactly the shape seedNodeLabel would have fixed at load time.
    expect(item).not.toBeNull();
    expect(item!.name).toBe('Untitled');
    expect(item!.label).toBeUndefined();

    // The name chip is painted on the bulk GPU canvas; select the node so the
    // hybrid promotes it into the DOM overlay, where its text is readable.
    // (Reading the canvas container's innerText without this returns '' — the
    // "wrong selector reads as zero" trap.)
    await page.evaluate((id: string) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'ITEM', id }, { openPanel: false });
    }, item!.id);
    // The overlay copy is present but CSS-hidden while the bulk canvas paints
    // the chip, so read its textContent rather than waiting for visibility —
    // it is the same `label ?? name` expression NodesCanvas draws.
    const nodeLabel = page.locator('[data-testid="node-label"]').first();
    await nodeLabel.waitFor({ state: 'attached', timeout: 5_000 });
    // PRECONDITION: the DOM copy really is showing the node's text.
    const labelBefore = ((await nodeLabel.textContent()) ?? '').trim();
    expect(labelBefore).toBe('Untitled');

    // Exactly what LayersPanel.handleItemRename does for an ITEM row.
    await page.evaluate((id: string) => {
      const bridge = (window as any).__axoview__;
      const model = bridge.model.getState();
      model.actions.set({
        items: model.items.map((i: any) =>
          i.id === id ? { ...i, name: 'Renamed identity' } : i
        )
      });
    }, item!.id);
    await page.waitForTimeout(250);

    const after = await page.evaluate((id: string) => {
      const items = (window as any).__axoview__.model.getState().items;
      const it = items.find((i: any) => i.id === id);
      return { name: it?.name, label: it?.label };
    }, item!.id);
    // The identity rename wrote `name` and left `label` absent…
    expect(after).toEqual({ name: 'Renamed identity', label: undefined });

    // …so the on-canvas text (label ?? name) followed the identity rename —
    // the behaviour the ADR 0032 amendment says a Layers rename must NOT have.
    await expect
      .poll(async () => ((await nodeLabel.textContent()) ?? '').trim(), {
        timeout: 3_000
      })
      .toBe('Renamed identity');
  });
});

// ---------------------------------------------------------------------------
// TXT-03 — a node's notes are never sanitized on load
// ---------------------------------------------------------------------------

test.describe('F1 / notes sink', () => {
  test('TXT-03: an unsanitized notes payload reaches the view-mode popover', async ({
    page,
    app,
    consoleOracle
  }) => {
    void app;
    // The popover renders notes through <RichTextEditor readOnly> — a Quill
    // instance, not a dangerouslySetInnerHTML sink. This probe asks whether
    // that path executes an attacker payload the loader never sanitized.
    consoleOracle.allow(
      /Failed to load resource/i,
      'The probe payload is an <img src="x"> that is expected to 404 — that 404 is the trigger under test, not a finding.'
    );

    const canvas = new CanvasPOM(page);
    const placePixel = await canvas.tileToScreen({ x: 1, y: 1 });
    await placeIconViaMouse(page, placePixel);

    const id = await page.evaluate(() => {
      const items = (window as any).__axoview__.model.getState().items;
      return items[items.length - 1]?.id ?? null;
    });
    expect(id).not.toBeNull();

    const PAYLOAD =
      '<p>brief</p><img src="x" onerror="window.__txt03_fired = true">';
    await page.evaluate(
      (args: { id: string; payload: string }) => {
        (window as any).__txt03_fired = false;
        const bridge = (window as any).__axoview__;
        const model = bridge.model.getState();
        model.actions.set({
          items: model.items.map((i: any) =>
            i.id === args.id ? { ...i, notes: args.payload } : i
          )
        });
        bridge.ui.getState().actions.setEditorMode('EXPLORABLE_READONLY');
      },
      { id: id!, payload: PAYLOAD }
    );

    // PRECONDITION: the payload really is in the model, verbatim — nothing on
    // the write path sanitized it.
    const storedNotes = await page.evaluate(
      (nodeId: string) =>
        (window as any).__axoview__.model
          .getState()
          .items.find((i: any) => i.id === nodeId)?.notes ?? '',
      id!
    );
    expect(storedNotes).toContain('onerror=');

    // Pin the view-mode info popover on the node — the surface that mounts the
    // notes editor for a viewer.
    await page.evaluate((nodeId: string) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'ITEM', id: nodeId, tile: { x: 1, y: 1 } });
    }, id!);

    const notesBox = byAxoviewId(page, 'view-mode-info-popover-notes');
    await notesBox.waitFor({ state: 'visible', timeout: 5_000 });
    // PRECONDITION: the notes surface really mounted (a missing selector would
    // otherwise read as "the payload did not fire").
    await expect(notesBox).toContainText('brief');
    await page.waitForTimeout(400);

    const fired = await page.evaluate(() => (window as any).__txt03_fired);
    const domHasHandler = await notesBox.evaluate(
      (el) => el.innerHTML.includes('onerror')
    );
    // Documented outcome, whichever way it lands.
    expect({ fired, domHasHandler }).toEqual({ fired: false, domHasHandler: false });
  });
});
