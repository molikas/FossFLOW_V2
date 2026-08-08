/**
 * T1 rig proof (docs/reviews/exploratory-2026-07/APPROACH.md §7). Not a hypothesis probe — it
 * exists so `npm run explore:unit` demonstrably runs, resolves the lib's module
 * aliases, and is invisible to `npm test`.
 */
import { modelSchema } from 'src/schemas/model';
import { INITIAL_DATA } from 'src/config';

describe('explore rig (T1)', () => {
  it('runs under jest.explore.config.js with lib path aliases resolved', () => {
    expect(typeof modelSchema.safeParse).toBe('function');
  });

  it('validates the bundled INITIAL_DATA — the schema oracle baseline', () => {
    const result = modelSchema.safeParse(INITIAL_DATA);
    expect(result.success).toBe(true);
  });
});
