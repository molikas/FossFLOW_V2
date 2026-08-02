/**
 * Mount a node's DOM `<Node>` overlay so a spec can measure or read it.
 *
 * **Selection used to do this.** R4/RND-13/15 + ADR 0038 §8 made selection
 * order-preserving: with the four bulk canvases merged into one, a promoted
 * element is a DOM sibling of that canvas and can only paint ABOVE or BELOW the
 * whole of it — so lifting a node on selection was an accidental "bring to
 * front". Selection promotes nothing now; the RENAME session
 * (`uiState.inlineEditNodeId`) is what does.
 *
 * Several specs used the overlay not as the thing under test but as the
 * placement SOURCE OF TRUTH — *where is this node drawn?*, *what text does its
 * name chip carry?* — because a `<canvas>` answers neither question directly.
 * That reading is still sound: `canvas-node-render.spec.ts` asserts the canvas
 * paints the icon where the DOM overlay puts it (≤ 6 px in both projections),
 * so measuring the overlay is measuring the drawn position. Only the route to
 * mounting it moved, and these helpers are that route, in one place with the
 * reason attached rather than re-derived in five spec files.
 *
 * Not a spec file — helpers only.
 */
import type { Locator, Page } from '@playwright/test';

/** Open the inline-rename session on `id`, which promotes it into the DOM. */
export const promoteNode = (page: Page, id: string) =>
  page.evaluate(
    (nodeId: string) =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setInlineEditNodeId(nodeId),
    id
  );

/** Close any rename session, returning the node to the bulk canvas. */
export const unpromoteNode = (page: Page) =>
  page.evaluate(() =>
    (window as any).__axoview__.ui.getState().actions.setInlineEditNodeId(null)
  );

/** The overlay's drawn icon — the box a user sees. */
export const promotedIcon = (page: Page, id: string): Locator =>
  page.locator(`[data-drag-id="${id}"] img`).first();

/**
 * Promote `id`, read its drawn icon box, un-promote. Throws rather than
 * returning null: a spec that cannot measure the node has lost its subject, and
 * a null would read downstream as "the node moved".
 */
export const promotedIconBox = async (page: Page, id: string) => {
  await promoteNode(page, id);
  const icon = promotedIcon(page, id);
  await icon.waitFor({ state: 'visible', timeout: 5_000 });
  const box = await icon.boundingBox();
  await unpromoteNode(page);
  if (!box) throw new Error(`node ${id} has no icon bounding box`);
  return box;
};

/**
 * Promote `id` and read the text its name chip carries — `label ?? name`, the
 * same resolution the GPU emitter uses (`webgl/scene/nodeEmitter.ts`), which is
 * what makes this a fair reading of "what does the canvas say?".
 */
export const promotedLabelText = async (page: Page, id: string) => {
  await promoteNode(page, id);
  const label = page.locator(`[data-drag-id="${id}"] [data-testid="node-label"]`).first();
  await label.waitFor({ state: 'visible', timeout: 5_000 });
  const text = (await label.innerText()).trim();
  await unpromoteNode(page);
  return text;
};
