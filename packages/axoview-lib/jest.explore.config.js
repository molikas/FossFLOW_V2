/** @type {import('ts-jest').JestConfigWithTsJest} */
/**
 * Jest config for T1 exploratory probes (docs/exploratory/APPROACH.md §7).
 *
 * Extends the default lib config and changes exactly three things:
 *   1. `testMatch` narrowed to `**\/__explore__\/**\/*.explore.test.{ts,tsx}` —
 *      this config runs ONLY probes, never the regression suite.
 *   2. `'/__explore__/'` dropped from `testPathIgnorePatterns` (the default
 *      config adds it so `npm test` never sweeps a probe in).
 *   3. No `coverageThreshold` — probes must never feed the coverage ratchet,
 *      in either direction.
 *
 * Run: `npm run explore:unit` from the repo root.
 */
const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['**/__explore__/**/*.explore.test.{ts,tsx}'],
  testPathIgnorePatterns: (base.testPathIgnorePatterns ?? []).filter(
    (p) => p !== '/__explore__/'
  ),
  coverageThreshold: undefined
};
