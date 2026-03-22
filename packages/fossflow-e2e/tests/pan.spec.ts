/**
 * pan.spec.ts — Pan interaction tests — covers FF-001 (Phase 3)
 *
 * 9 tests, Chromium + Firefox.
 * Covers: middle-click pan, right-click transient pan, mode restoration.
 *
 * Status: STUB — implementation in Phase 3
 */
import { test } from '@playwright/test';

test.fixme('P-1: middle-click + drag → canvas pans', async () => {});
test.fixme('P-2: middle-click release → Cursor mode restored', async () => {});
test.fixme('P-3: right-click (no drag) → item panel closes, mode stays CURSOR', async () => {});
test.fixme('P-4: right-click + drag ≤4px → pan NOT activated', async () => {});
test.fixme('P-5: right-click + drag >4px → enters PAN mode', async () => {});
test.fixme('P-6: right-click release after drag → restores Cursor', async () => {});
test.fixme('P-7: right-click in Connector mode → pan → release restores CONNECTOR', async () => {});
test.fixme('P-8: right-click in Lasso mode → pan → release restores LASSO', async () => {});
test.fixme('P-9: rightClickPan=false → right-click has no side-effects', async () => {});
