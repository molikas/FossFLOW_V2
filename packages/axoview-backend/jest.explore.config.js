/**
 * Backend jest config for T1 exploratory probes (campaign APPROACH.md §7, retired to git history — method now in .claude/commands/explore.md).
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
  // Empty is the lane's normal between-campaigns state (probes promote out on
  // fix, per the ADR 0047 flip rule) — an empty lane must not read as red.
  passWithNoTests: true,
  coverageThreshold: undefined
};
