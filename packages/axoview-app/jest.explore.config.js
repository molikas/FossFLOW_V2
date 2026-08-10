/** @type {import('ts-jest').JestConfigWithTsJest} */
/**
 * Jest config for T1 exploratory probes in the APP package (campaign
 * APPROACH.md §7, retired to git history — method now in
 * .claude/commands/explore.md). The S/A tracks (auth store, storage providers, app shell)
 * live here, not in axoview-lib, so they need the same rig the lib got.
 *
 * Extends the default app config and changes exactly three things:
 *   1. `testMatch` narrowed to `**\/__explore__\/**\/*.explore.test.{ts,tsx}` —
 *      this config runs ONLY probes, never the regression suite.
 *   2. `'/__explore__/'` dropped from `testPathIgnorePatterns` (the default
 *      config adds it so `npm test` never sweeps a probe in).
 *   3. No `coverageThreshold` — probes must never feed the coverage ratchet.
 *
 * Run: `npm run explore:unit:app` from the repo root.
 */
const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['**/__explore__/**/*.explore.test.{ts,tsx}'],
  testPathIgnorePatterns: (base.testPathIgnorePatterns ?? []).filter(
    (p) => p !== '/__explore__/'
  ),
  // Empty is the lane's normal between-campaigns state (ADR 0047, 2026-08-10):
  // there is no `__explore__` tree until a campaign recreates one, so an empty
  // run must exit 0, not red.
  passWithNoTests: true,
  coverageThreshold: undefined
};
