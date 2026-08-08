/**
 * Backend jest config for T1 exploratory probes (docs/reviews/exploratory-2026-07/APPROACH.md §7).
 *
 * Zero touch to the default config: it already carries an explicit
 * `testMatch: ['<rootDir>/src/**\/__tests__/**\/*.spec.js']`, so an
 * `__explore__` tree is never swept into `npm test` — unlike the lib and app
 * configs, which had no testMatch and needed a testPathIgnorePatterns entry.
 *
 * Run: `npm run explore:unit:backend` from the repo root (the script carries the
 * --experimental-vm-modules flag the ESM workspace needs).
 */
import base from './jest.config.js';

export default {
  ...base,
  testMatch: ['<rootDir>/src/**/__explore__/**/*.explore.spec.js'],
  coverageThreshold: undefined
};
