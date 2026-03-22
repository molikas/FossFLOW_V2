/**
 * node.spec.ts — Node lifecycle tests (Phase 2)
 *
 * 8 tests, Chromium + Firefox.
 * Covers: place, select, rename, header link, description, delete.
 *
 * Status: STUB — implementation in Phase 2
 */
import { test, expect } from '@playwright/test';
import { canvasTest } from '../fixtures';
import { toolbar, itemPanel, nodeImages, nodeLabel, nodeHeaderLink } from '../helpers/selectors';

// N-1: Place node → appears on canvas
canvasTest('N-1: place node → appears on canvas', async ({ canvas }) => {
  const before = await canvas.countNodes();
  await canvas.placeNode(400, 300);
  const after = await canvas.countNodes();
  expect(after).toBeGreaterThan(before);
});

// N-2 through N-8: pending Phase 2 implementation
test.fixme('N-2: click node → item controls panel opens', async () => {});
test.fixme('N-3: edit node name → updates on canvas', async () => {});
test.fixme('N-4: add header link → name renders as <a>', async () => {});
test.fixme('N-5: header link → opens URL in new tab', async () => {});
test.fixme('N-6: add description → label expands', async () => {});
test.fixme('N-7: clear description → label collapses', async () => {});
test.fixme('N-8: delete key → node removed', async () => {});
