/** @type {import('ts-jest').JestConfigWithTsJest} */
// React loads its production build when NODE_ENV === 'production', which breaks
// act() in tests. Ensure it is always 'test' regardless of the inherited environment.
process.env.NODE_ENV = 'test';

module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  modulePaths: ['node_modules', '<rootDir>'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // SVG files are inlined as strings at build time (rslib); in Jest they just need
    // to be non-empty strings so gridTileUrl truthiness checks pass.
    "\\.svg$": "<rootDir>/src/__mocks__/fileMock.ts",
    // Force React to resolve from root node_modules to avoid duplicate React instances
    "^react$": "<rootDir>/../../node_modules/react",
    "^react-dom$": "<rootDir>/../../node_modules/react-dom",
    "^react-dom/client$": "<rootDir>/../../node_modules/react-dom/client",
    "^react/jsx-runtime$": "<rootDir>/../../node_modules/react/jsx-runtime",
    "^react/jsx-dev-runtime$": "<rootDir>/../../node_modules/react/jsx-dev-runtime"
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '\\.d\\.ts$',
    // Exploratory-campaign probes (docs/exploratory/APPROACH.md §7). This
    // config has no `testMatch`, so Jest's defaults would otherwise sweep
    // `*.explore.test.ts` into `npm test`. They run only under
    // jest.explore.config.js (`npm run explore:unit`), which drops this line.
    '/__explore__/'
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/types/**',
    '!src/index.ts'
  ],
  // Floors sit ~5-6pp under measured reality so the tested core can't silently
  // erode; the two well-covered areas carry their own higher floors (directory
  // paths aggregate).
  //
  // Re-ratcheted 2026-07-29 (technical-review-2026-07-29 §"what to improve" #5).
  // Coverage had risen since the 2026-07-05 ratchet (37.4→40.2 stmts,
  // 25.1→28.5 branches) without the floors following, so the intended 5-7pp of
  // slack had widened to ~10pp and the gate had gone soft. Measured 2026-07-29:
  //   global   stmts 40.2  branches 28.5  functions 34.6  lines 40.2
  //   reducers stmts 89.0  branches 70.7   (unchanged — floors still right)
  //   schemas  stmts 99.2  branches 94.1   (unchanged — floors still right)
  // Re-measure and re-tighten whenever coverage moves up materially; that is the
  // maintenance this gate needs to keep working.
  coverageThreshold: {
    global: {
      branches: 23,
      functions: 29,
      lines: 34,
      statements: 34
    },
    './src/stores/reducers/': {
      statements: 85,
      branches: 65
    },
    './src/schemas/': {
      statements: 95,
      branches: 90
    }
  },
  coverageReporters: ['json', 'lcov', 'text', 'html']
};
