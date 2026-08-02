/**
 * preview-layer-switcher.spec.ts — Thread B (ADR 0013).
 *
 * The preview-mode layer switcher is a bottom-left overlay shown only in
 * EXPLORABLE_READONLY with ≥2 layers. Its toggles are a UI-only override
 * (uiState.previewLayerOverrides) that must NEVER mutate the model's
 * layer.visible, never dirty the diagram, and clear when leaving preview.
 *
 * The app drives editorMode from a prop and only re-syncs when the prop
 * changes, so forcing EXPLORABLE_READONLY via the debug bridge sticks — the
 * realistic way to exercise the lib surface without a readonly share URL.
 */
import path from 'path';
import { appTest as test, expect } from '../fixtures/app.fixture';
import { LayersPanelPOM } from '../pom/LayersPanelPOM';
import { EmptyStateScreenPOM } from '../pom/EmptyStateScreenPOM';
import { importFileViaDialog } from '../helpers/import';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import { waitForDebugBridge } from '../helpers/store';

type Page = import('@playwright/test').Page;

const FIXTURE_JSON = path.join(__dirname, '..', 'fixtures', 'sample-diagram.json');

const LOCAL_STORAGE_KEYS = [
  'axoview-diagrams',
  'axoview-last-opened',
  'axoview-last-opened-data',
  'axoview-explorer-initialized',
  'axoview-explorer-open'
];

const ONBOARDING_DISMISS_FLAGS: Array<[string, string]> = [
  ['axoview-lazy-loading-welcome-dismissed', 'true'],
  ['axoview-show-drag-hint', 'false']
];

async function pinOnboardingDismissed(page: Page) {
  await page.addInitScript((flags: Array<[string, string]>) => {
    try {
      for (const [k, v] of flags) localStorage.setItem(k, v);
    } catch {
      /* localStorage may not be available pre-navigation */
    }
  }, ONBOARDING_DISMISS_FLAGS);
}

async function bootBlankDiagram(page: Page) {
  await page.evaluate((keys: string[]) => {
    for (const k of keys) localStorage.removeItem(k);
  }, LOCAL_STORAGE_KEYS);
  await page.reload();
  const createBtn = byAxoviewId(page, 'screen-empty-create');
  await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await createBtn.click();
  await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForDebugBridge(page);
}

// The blank diagram has no items; the hide-labels DOM check needs named nodes.
// Import the shared sample (items Alpha/Beta, both showLabel-default) the same
// way readable-labels.spec does.
async function importSampleDiagram(page: Page) {
  await page.evaluate((keys: string[]) => {
    for (const k of keys) localStorage.removeItem(k);
  }, LOCAL_STORAGE_KEYS);
  await page.reload();
  const emptyState = new EmptyStateScreenPOM(page);
  await emptyState.expectVisible();
  // A3/ZIP-09 (owner ruling 2026-07-30): one import flow — the Import
  // button opens `ImportDialog` for an empty tree as much as a populated
  // one, and the import is confirmed with its destination on screen.
  await emptyState.clickImport();
  await importFileViaDialog(page, FIXTURE_JSON);
  await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForDebugBridge(page);
  // Named nodes render either as DOM (`node-label`) or, under the default canvas
  // node renderer (ADR 0019), as canvas pixels (`axoview-scene-canvas`). Wait for
  // whichever surface this run uses.
  await page
    .locator('[data-testid="node-label"], [data-testid="axoview-scene-canvas"]')
    .first()
    .waitFor({ state: 'attached', timeout: 10_000 });
}

/**
 * Number of name labels currently painted, read renderer-agnostically.
 * Canvas renderer: NodesCanvas publishes `data-labels-drawn` (chips painted this
 * frame). DOM renderer: count the `node-label` elements. Either way, 0 ⇒ hidden.
 */
const getVisibleLabelCount = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const canvas = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    );
    if (canvas) {
      return parseInt(
        (canvas as HTMLElement).dataset.labelsDrawn ?? '0',
        10
      );
    }
    return document.querySelectorAll('[data-testid="node-label"]').length;
  });

const setEditorMode = (page: Page, mode: string): Promise<void> =>
  page.evaluate((m: string) => {
    (window as any).__axoview__.ui.getState().actions.setEditorMode(m);
  }, mode);

const getOverrides = (
  page: Page
): Promise<{ hiddenLayerIds: string[]; soloLayerId: string | null }> =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().previewLayerOverrides
  );

const getHideLabels = (page: Page): Promise<boolean> =>
  page.evaluate(
    () => !!(window as any).__axoview__.ui.getState().previewHideLabels
  );

const getIsDirty = (page: Page): Promise<boolean> =>
  page.evaluate(() => !!(window as any).__axoview__.ui.getState().isDirty);

/** showLabel flags of the active view's items (model truth). */
const getModelShowLabels = (page: Page): Promise<Array<boolean | undefined>> =>
  page.evaluate(() => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view = (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
    return (view?.items ?? []).map((i: any) => i.showLabel);
  });

/** Visibility flags of the active view's layers (model truth). */
const getModelLayerVisibility = (page: Page): Promise<boolean[]> =>
  page.evaluate(() => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view = (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
    return (view?.layers ?? []).map((l: any) => l.visible);
  });

const getLayerCount = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view = (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
    return (view?.layers ?? []).length;
  });

test.describe('Preview layer switcher — Thread B (ADR 0013)', () => {
  test.beforeEach(async ({ page, app }) => {
    void app;
    await pinOnboardingDismissed(page);
    await bootBlankDiagram(page);
  });

  test('renders only in view mode with ≥2 layers; toggle + solo are UI-only and non-dirty', async ({
    page
  }) => {
    const switcher = byAxoviewId(page, 'preview-layer-switcher');

    // Not shown in edit mode.
    await expect(switcher).toHaveCount(0);

    // Create two layers via the Layers panel (edit chrome).
    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    await layers.addLayer();
    await expect.poll(() => getLayerCount(page), { timeout: 3_000 }).toBeGreaterThanOrEqual(2);

    const layerCount = await getLayerCount(page);
    const visibilityBefore = await getModelLayerVisibility(page);

    // Enter preview — the switcher appears with one row per layer.
    await setEditorMode(page, 'EXPLORABLE_READONLY');
    await expect(switcher).toBeVisible();
    await expect(switcher.locator('[data-axoview-id="preview-layer-row"]')).toHaveCount(
      layerCount
    );

    // Baseline dirty state on entering preview (adding layers in edit mode
    // legitimately dirtied the model — that is unrelated to the override).
    // The invariant under test: the preview toggle/solo must not CHANGE it.
    const dirtyInPreview = await getIsDirty(page);

    // Toggle the first layer's visibility → recorded in the UI override only.
    // (dispatchEvent, not .click(): the bridge-forced preview keeps the app's
    // chrome mounted, which can overlay/intercept a real pointer click — the
    // same rationale as the hide-labels test below.)
    await switcher
      .locator('[data-axoview-id="preview-layer-toggle-visibility"]')
      .first()
      .dispatchEvent('click');
    await expect
      .poll(() => getOverrides(page).then((o) => o.hiddenLayerIds.length), {
        timeout: 3_000
      })
      .toBe(1);
    // Model layer.visible is untouched; the toggle did not change dirtiness.
    expect(await getModelLayerVisibility(page)).toEqual(visibilityBefore);
    expect(await getIsDirty(page)).toBe(dirtyInPreview);

    // Solo the second layer → override switches to solo; still UI-only.
    const soloButtons = switcher.locator('[data-axoview-id="preview-layer-solo"]');
    await soloButtons.nth(1).dispatchEvent('click');
    await expect
      .poll(() => getOverrides(page).then((o) => o.soloLayerId), { timeout: 3_000 })
      .not.toBeNull();
    await expect(soloButtons.nth(1)).toHaveAttribute('aria-pressed', 'true');
    expect(await getModelLayerVisibility(page)).toEqual(visibilityBefore);
    expect(await getIsDirty(page)).toBe(dirtyInPreview);

    // Leaving preview clears the ephemeral override.
    await setEditorMode(page, 'EDITABLE');
    expect(await getOverrides(page)).toEqual({
      hiddenLayerIds: [],
      soloLayerId: null
    });
    await expect(switcher).toHaveCount(0);
  });
});

test.describe('Global hide-labels — Thread B (ADR 0013 addendum; moved to the zoom cluster 894cb3b)', () => {
  // No blank-diagram boot here: this test imports the sample fixture via the
  // empty-state file chooser, which only fires when the file tree is empty.
  test.beforeEach(async ({ page, app }) => {
    void app;
    await pinOnboardingDismissed(page);
  });

  test('hide-labels toggle hides name labels live; UI-only, non-dirty, persists across mode switches', async ({
    page
  }) => {
    // Fixture import (reload + file chooser) plus several toggle round-trips runs
    // past the default 30s budget on a cold run.
    test.setTimeout(60_000);
    // Named nodes (Alpha/Beta) so there are real labels to hide.
    await importSampleDiagram(page);

    // The control moved from the presentation-only chrome into the global
    // bottom-dock zoom cluster (894cb3b, Option-A view controls): same
    // `previewHideLabels` UI flag, now available in BOTH edit and present, and
    // persisting across mode switches as a session-wide view preference
    // (uiStateStore.setPreviewHideLabels).
    const toggle = byAxoviewId(page, 'canvas-hide-labels');

    // Edit chrome: the toggle is available (global) and labels render
    // (showLabel defaults on); the flag starts off.
    await expect(toggle).toBeVisible();
    expect(await getHideLabels(page)).toBe(false);
    const labelCount = await getVisibleLabelCount(page);
    expect(labelCount).toBeGreaterThan(0);

    const showLabelsBefore = await getModelShowLabels(page);

    // Enter present — the toggle is still there and labels still render.
    await setEditorMode(page, 'EXPLORABLE_READONLY');
    await expect(toggle).toBeVisible();
    expect(await getHideLabels(page)).toBe(false);
    await expect
      .poll(() => getVisibleLabelCount(page), { timeout: 3_000 })
      .toBe(labelCount);

    const dirtyInPreview = await getIsDirty(page);

    // Dispatch the click straight on the toggle element (chrome overlays in the
    // bridge-forced preview can intercept a real pointer click) — its onClick
    // (flag flip → live label hide, no model write) is what's under test;
    // visibility/affordance is asserted separately.
    const clickToggle = () => toggle.dispatchEvent('click');

    // Toggle on → name labels disappear live; recorded in the UI flag only.
    await clickToggle();
    await expect.poll(() => getHideLabels(page), { timeout: 3_000 }).toBe(true);
    await expect
      .poll(() => getVisibleLabelCount(page), { timeout: 3_000 })
      .toBe(0);
    // Model showLabel is untouched and the toggle did not dirty the diagram.
    expect(await getModelShowLabels(page)).toEqual(showLabelsBefore);
    expect(await getIsDirty(page)).toBe(dirtyInPreview);

    // Toggle off → labels restored live.
    await clickToggle();
    await expect.poll(() => getHideLabels(page), { timeout: 3_000 }).toBe(false);
    await expect
      .poll(() => getVisibleLabelCount(page), { timeout: 3_000 })
      .toBe(labelCount);
    expect(await getModelShowLabels(page)).toEqual(showLabelsBefore);
    expect(await getIsDirty(page)).toBe(dirtyInPreview);

    // Hide again, then leave present — the flag is a session-wide GLOBAL view
    // preference now: it PERSISTS across the mode switch and the toggle stays
    // available in edit chrome; the model is never touched. Toggle off again
    // to restore.
    await clickToggle();
    await expect.poll(() => getHideLabels(page), { timeout: 3_000 }).toBe(true);
    await setEditorMode(page, 'EDITABLE');
    expect(await getHideLabels(page)).toBe(true);
    await expect(toggle).toBeVisible();
    await expect
      .poll(() => getVisibleLabelCount(page), { timeout: 3_000 })
      .toBe(0);
    await clickToggle();
    await expect.poll(() => getHideLabels(page), { timeout: 3_000 }).toBe(false);
    await expect
      .poll(() => getVisibleLabelCount(page), { timeout: 3_000 })
      .toBe(labelCount);
    expect(await getModelShowLabels(page)).toEqual(showLabelsBefore);
  });
});
