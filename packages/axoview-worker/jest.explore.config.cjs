/**
 * Worker jest config for T1 exploratory probes (campaign APPROACH.md §7, retired to git history — method now in .claude/commands/explore.md).
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
  // Empty is the lane's normal between-campaigns state (probes promote out on
  // fix, per the ADR 0047 flip rule) — an empty lane must not read as red.
  passWithNoTests: true,
  coverageThreshold: undefined
};
