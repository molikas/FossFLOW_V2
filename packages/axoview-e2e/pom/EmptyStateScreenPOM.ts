/**
 * EmptyStateScreenPOM — packages/axoview-app/src/components/EmptyStateScreen.tsx.
 *
 * The empty-state screen renders when the file tree is empty (no diagrams
 * persisted) and offers two paths: create a blank diagram or import an
 * existing one. J20 in docs/manual-test-baseline.md exercises both buttons.
 *
 * Lazy data-axoview-id retrofits — Session 3:
 *   - `screen-empty-create` (New diagram card) — landed Session 2 alongside J1.
 *   - `screen-empty-import` (Import card)       — added Session 3 alongside J20.
 *
 * Thread F (tactical locked decision #8): the hooks moved from the inner blue
 * <Button> onto the whole-card CardActionArea, so the ENTIRE card is the click
 * target (the pill is now a non-interactive label). `clickCreate`/`clickImport`
 * still click the hook; `clickCreateCardTop` clicks the icon region to prove the
 * whole square — not just the old button — fires the action.
 *
 * `clickImport()` opens `ImportDialog` — the ONE import flow (A3/ZIP-09, owner
 * ruling 2026-07-30). It used to fire a native file chooser directly and import
 * straight to root, so the destination was never shown and `replaceAll`
 * appeared and disappeared on incidental state. Drive the rest of the flow with
 * `helpers/import.ts`.
 */
import { Page } from '@playwright/test';
import { byAxoviewId } from '../helpers/selectors';

export class EmptyStateScreenPOM {
  constructor(readonly page: Page) {}

  createButton() {
    return byAxoviewId(this.page, 'screen-empty-create');
  }

  importButton() {
    return byAxoviewId(this.page, 'screen-empty-import');
  }

  async expectVisible(timeoutMs = 10_000) {
    await this.createButton().waitFor({ state: 'visible', timeout: timeoutMs });
  }

  async clickCreate() {
    await this.createButton().click();
  }

  /**
   * Clicks the TOP of the create card (the icon region, ~16px below the top
   * edge) rather than its centre — proving the whole card is clickable, not
   * just the old inner button. Thread F (locked decision #8).
   */
  async clickCreateCardTop() {
    const box = await this.createButton().boundingBox();
    if (!box) throw new Error('create card has no bounding box');
    await this.createButton().click({ position: { x: box.width / 2, y: 16 } });
  }

  /**
   * Clicks the Import button. In the empty-tree path this fires a native
   * file picker on a hidden <input type="file">. Callers should set up a
   * `page.waitForEvent('filechooser')` BEFORE invoking this so the event
   * isn't missed; see hotkeys/connector specs for the pattern.
   */
  async clickImport() {
    await this.importButton().click();
  }
}
