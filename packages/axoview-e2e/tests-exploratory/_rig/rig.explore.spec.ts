/**
 * T2 rig proof (campaign APPROACH.md §7, retired to git history — method now in .claude/commands/explore.md). Not a hypothesis probe — it
 * exists so `npm run explore:e2e` demonstrably boots the app, attaches the
 * debug bridge, and exercises all three §4 oracles on a known-good state.
 *
 * If this ever goes red, the rig is broken, not the product.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants,
  expectSchemaClean,
  readExportableModel
} from '../../fixtures/explore.fixture';

test('rig: oracles run clean on a freshly-created blank diagram', async ({
  app,
  consoleOracle
}) => {
  const { page } = app;

  await expect(page.locator('[data-testid="axoview-canvas"]')).toBeVisible();

  // Bridge reachable with the three store APIs the oracles depend on.
  const bridgeShape = await page.evaluate(() => {
    const b = (window as any).__axoview__;
    return {
      ui: typeof b?.ui?.getState,
      model: typeof b?.model?.getState,
      scene: typeof b?.scene?.getState
    };
  });
  expect(bridgeShape).toEqual({
    ui: 'function',
    model: 'function',
    scene: 'function'
  });

  await expectStoreInvariants(page, 'blank diagram');
  await expectSchemaClean(page, 'blank diagram');

  const model = (await readExportableModel(page)) as { views: unknown[] };
  expect(Array.isArray(model.views)).toBe(true);

  // The console oracle is asserted in fixture teardown; assert here too so the
  // rig proof states its own expectation explicitly.
  expect(consoleOracle.errors()).toEqual([]);
});
