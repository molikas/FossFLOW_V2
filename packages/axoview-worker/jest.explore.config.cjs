/**
 * Worker jest config for T1 exploratory probes (docs/reviews/exploratory-2026-07/APPROACH.md §7).
 *
 * Zero touch to the default config: it already carries an explicit
 * `testMatch: ['<rootDir>/src/**\/__tests__/**\/*.spec.ts']`, so an `__explore__`
 * tree is never swept into `npm test`.
 *
 * Run: `npm run explore:unit:worker` from the repo root.
 */
const base = require('./jest.config.cjs');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/src/**/__explore__/**/*.explore.spec.ts'],
  coverageThreshold: undefined
};
