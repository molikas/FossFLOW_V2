/**
 * Centralised locator builders for FossFLOW.
 *
 * Strategy:
 *   - Role-based locators (`getByRole`) are the primary choice — resilient to
 *     MUI class renames and style refactors.
 *   - `data-testid` locators are used as stable fallbacks for elements that
 *     have no meaningful accessible role (canvas container, icon grid, etc.).
 */
import { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Toolbar buttons
// ---------------------------------------------------------------------------

export const toolbar = {
  addItem:   (p: Page) => p.getByRole('button', { name: /Add item/i }),
  select:    (p: Page) => p.getByRole('button', { name: /Select/i }),
  pan:       (p: Page) => p.getByRole('button', { name: /Pan/i }),
  connector: (p: Page) => p.getByRole('button', { name: /Connector/i }),
  lasso:     (p: Page) => p.getByRole('button', { name: /Lasso/i }),
  undo:      (p: Page) => p.getByRole('button', { name: /Undo/i }),
  redo:      (p: Page) => p.getByRole('button', { name: /Redo/i }),
};

// ---------------------------------------------------------------------------
// Canvas and scene elements
// ---------------------------------------------------------------------------

/** The main canvas container (interaction + render area). */
export const canvas      = (p: Page) => p.locator('[data-testid="fossflow-canvas"]');

/** The item controls side panel (node/connector/textbox/rectangle settings). */
export const itemPanel   = (p: Page) => p.locator('[data-testid="item-controls-panel"]');

/** The empty-canvas context menu (Add Node / Add Rectangle). */
export const contextMenu = (p: Page) => p.locator('[data-testid="context-menu"]');

/** All node icon images currently on the canvas. */
export const nodeImages  = (p: Page) => canvas(p).locator('img');

/** The lasso selection rectangle (only visible while Lasso mode is active). */
export const lassoRect   = (p: Page) => p.locator('[data-testid="lasso-selection"]');

/** All connector SVG wrappers currently on the canvas. */
export const connectorPaths = (p: Page) => p.locator('[data-testid="connector-path"]');

/** The node label container for a specific node (by index, 0-based). */
export const nodeLabel   = (p: Page, index = 0) =>
  p.locator('[data-testid="node-label"]').nth(index);

/** The header link anchor for a specific node (by index, 0-based). */
export const nodeHeaderLink = (p: Page, index = 0) =>
  p.locator('[data-testid="node-header-link"]').nth(index);

// ---------------------------------------------------------------------------
// Icon picker (Add Item panel)
// ---------------------------------------------------------------------------

/** All icon buttons in the icon picker grid. */
export const iconGridItems = (p: Page) => p.locator('[data-testid="icon-grid-item"]');

// ---------------------------------------------------------------------------
// Export dialog
// ---------------------------------------------------------------------------

/** The "Download as SVG" button inside the Export Image dialog. */
export const exportSvgButton = (p: Page) => p.locator('[data-testid="export-svg-button"]');
