/**
 * undo-redo.spec.ts — Undo/redo keyboard and button tests (Phase 2)
 *
 * 7 tests, Chromium + Firefox.
 * Replaces: test_node_placement.py::test_undo_redo_node, test_multi_node_undo.py, test_rect_text_undo.py
 *
 * Status: STUB — implementation in Phase 2
 */
import { test } from '@playwright/test';

test.fixme('U-1: place node → Undo button → node gone', async () => {});
test.fixme('U-2: Redo button → node restored', async () => {});
test.fixme('U-3: Ctrl+Z shortcut → same as Undo button', async () => {});
test.fixme('U-4: Ctrl+Y shortcut → same as Redo button', async () => {});
test.fixme('U-5: Undo button disabled on fresh canvas', async () => {});
test.fixme('U-6: place 3 nodes → Undo 3× → canvas empty', async () => {});
test.fixme('U-7: draw rectangle → Undo → rectangle removed', async () => {});
