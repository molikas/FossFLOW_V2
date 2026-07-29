/**
 * DOM reconnaissance helper for probe authoring — NOT a hypothesis probe.
 *
 * Several lib surfaces (ViewTabs in particular) carry no `data-axoview-id` and
 * no accessible name, so writing a probe means finding the MUI icon test id to
 * target. Skipped by default; unskip it locally when you need the dump.
 */
import { exploreTest as test } from '../../fixtures/explore.fixture';

test.skip('dump button accessible names', async ({ app }) => {
  const { page } = app;
  const names = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .map((b) => ({
        icon: b.querySelector('svg[data-testid]')?.getAttribute('data-testid'),
        label: b.getAttribute('aria-label'),
        text: (b.textContent ?? '').trim().slice(0, 24)
      }))
      .filter((b) => b.icon || b.label || b.text)
  );
  console.log('BUTTONS ' + JSON.stringify(names));
});
