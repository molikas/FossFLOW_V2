/**
 * import-export.spec.ts — Import JSON / Export SVG tests (Phase 5)
 *
 * 3 tests, Chromium + Firefox.
 * Replaces: test_import_diagram.py, test_export_svg.py
 *
 * Note on import: uses page.waitForEvent('filechooser') instead of a persistent
 * file input element, since the import flow creates the input element dynamically.
 *
 * Status: STUB — implementation in Phase 5
 */
import { test } from '@playwright/test';

test.fixme('IE-1: import JSON → diagram restored', async () => {});
test.fixme('IE-2: export SVG → download triggered', async () => {});
test.fixme('IE-3: exported SVG is valid XML', async () => {});
