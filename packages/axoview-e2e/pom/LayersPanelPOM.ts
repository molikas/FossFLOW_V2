/**
 * LayersPanelPOM — left dock Layers panel (packages/axoview-lib/src/
 * components/LayersPanel/LayersPanel.tsx + LayerRow.tsx + LayerItemRow.tsx).
 *
 * Surface walkthrough:
 *   - The panel mounts inside LeftDock when `activeLeftTab === 'LAYERS'`.
 *     Open via the strip's `dock-layers-toggle` IconButton (Session 2 retrofit).
 *   - Layers render top-to-bottom = highest order first. Each LayerRow exposes
 *     a visibility toggle + lock toggle and a chevron when its item count > 0.
 *   - Items live as LayerItemRow rows beneath an expanded LayerRow, or under
 *     an always-rendered "Unassigned" group at the bottom of the panel.
 *   - Item-to-layer assignment is a custom drag-drop: LayerItemRow's
 *     onMouseDown calls `onDragStart(item)`, LayerRow's onMouseEnter calls
 *     `onItemDragOverLayer(layerId)`, and the panel root's onMouseUp commits
 *     via `assignLayerToItems`. No HTML5 DragEvent — pure pointer handlers.
 *
 * Lazy data-axoview-id retrofits — Session 5:
 *   - `dock-layers-toggle`     (lib, LeftDock.tsx)         — already landed Session 2
 *   - `layers-panel-add`       (lib, LayersPanel.tsx)
 *   - `layer-row` + `data-layer-name`
 *                              (lib, LayerRow.tsx)
 *   - `layer-toggle-visibility`(lib, LayerRow.tsx)
 *   - `layer-toggle-lock`      (lib, LayerRow.tsx)
 *   - `layer-item-row` + `data-layer-item-id` + `data-layer-item-type`
 *                              (lib, LayerItemRow.tsx)
 *
 * Lib rebuild cycles for this POM: 1 (all five Session-5 retrofits batched).
 */
import { Locator, Page } from '@playwright/test';
import { byAxoviewId } from '../helpers/selectors';

export class LayersPanelPOM {
  constructor(readonly page: Page) {}

  toggleButton(): Locator {
    return byAxoviewId(this.page, 'dock-layers-toggle');
  }

  addLayerButton(): Locator {
    return byAxoviewId(this.page, 'layers-panel-add');
  }

  /** Locates a layer row by its visible name (default "Layer N" from
   *  handleAddLayer's auto-naming). */
  getLayerRow(name: string): Locator {
    return this.page.locator(
      `[data-axoview-id="layer-row"][data-layer-name="${name}"]`
    );
  }

  /** Locates an item row inside the panel by the entity id. Use this for
   *  both unassigned rows AND rows already inside a layer's expanded list —
   *  the id is stable across the move. */
  getItemRow(itemId: string): Locator {
    return this.page.locator(
      `[data-axoview-id="layer-item-row"][data-layer-item-id="${itemId}"]`
    );
  }

  /**
   * Opens the Layers panel if it isn't already active. Idempotent — re-clicks
   * are gated on the panel-add button's visibility (the button only renders
   * when the panel is open).
   */
  async open() {
    const addBtn = this.addLayerButton();
    if (await addBtn.isVisible().catch(() => false)) return;
    await this.toggleButton().click();
    await addBtn.waitFor({ state: 'visible', timeout: 5_000 });
  }

  async addLayer() {
    await this.addLayerButton().click();
  }

  /** Selects a layer row (the toolbar's delete acts on the selection). */
  async selectLayer(layerName: string) {
    await this.getLayerRow(layerName).click();
  }

  /**
   * Clicks the toolbar's delete. F4/LAY-05 + E2/RED-13: this is the ONLY delete
   * route, and for a layer that holds something it opens the confirm dialog
   * rather than acting — the caller must then choose `keep` or `deleteContents`.
   * An EMPTY layer skips the dialog because there is nothing to decide.
   */
  async deleteSelectedLayer() {
    await byAxoviewId(this.page, 'layers-panel-delete').click();
  }

  deleteDialog(): Locator {
    return byAxoviewId(this.page, 'layer-delete-confirm');
  }

  hiddenLayerWarning(): Locator {
    return byAxoviewId(this.page, 'layer-delete-hidden-warning');
  }

  /** "Keep them" — the contents are unassigned and survive. */
  async confirmDeleteKeepContents() {
    await byAxoviewId(this.page, 'layer-delete-keep').click();
  }

  /** "Delete them too" — the Photoshop reading. */
  async confirmDeleteWithContents() {
    await byAxoviewId(this.page, 'layer-delete-contents').click();
  }

  /**
   * Drives the item-to-layer assignment via the panel's synthetic drag-drop.
   * LayerItemRow.onMouseDown → setItemDragState; LayerRow.onMouseEnter →
   * setItemDragState.overLayerId; panel root onMouseUp → assignLayerToItems.
   *
   * Sequence: mouse.down on the item row's centre, hover() over the target
   * layer row (fires mouseenter), mouse.up on the layer row. We use the
   * Playwright mouse API rather than synthetic dispatch because these
   * handlers don't gate on `e.target` — the LayersPanel sees ordinary
   * pointer events from any source.
   */
  async dragItemToLayer(itemId: string, layerName: string) {
    const itemRow = this.getItemRow(itemId);
    const layerRow = this.getLayerRow(layerName);
    await itemRow.waitFor({ state: 'visible', timeout: 5_000 });
    await layerRow.waitFor({ state: 'visible', timeout: 5_000 });
    const itemBox = await itemRow.boundingBox();
    if (!itemBox) throw new Error('dragItemToLayer: item row missing bounding box');
    await this.page.mouse.move(
      itemBox.x + itemBox.width / 2,
      itemBox.y + itemBox.height / 2
    );
    await this.page.mouse.down();
    // hover() dispatches a real mousemove ending on the layer row — its
    // onMouseEnter handler then writes the overLayerId.
    await layerRow.hover();
    await this.page.mouse.up();
  }

  /** Clicks the visibility toggle on the named layer. Toggles the existing
   *  `layer.visible` flag — caller observes the post-state via the model bridge. */
  async toggleVisibility(layerName: string) {
    const row = this.getLayerRow(layerName);
    await row
      .locator('[data-axoview-id="layer-toggle-visibility"]')
      .click();
  }

  /** Clicks the lock toggle on the named layer. Toggles `layer.locked`;
   *  downstream effect: Cursor.mousedown's isItemInteractable filter rejects
   *  hits on locked items, so no DRAG_ITEMS mode is entered. */
  async toggleLock(layerName: string) {
    const row = this.getLayerRow(layerName);
    await row.locator('[data-axoview-id="layer-toggle-lock"]').click();
  }
}
