/** @type {import('ts-jest').JestConfigWithTsJest} */
process.env.NODE_ENV = 'test';

const path = require('path');
const rootNodeModules = path.resolve(__dirname, '../../node_modules');

module.exports = {
  testEnvironment: path.join(rootNodeModules, 'jest-environment-jsdom'),
  transform: {
    '^.+\\.(ts|tsx)$': [
      path.join(rootNodeModules, 'ts-jest'),
      { tsconfig: path.resolve(__dirname, 'tsconfig.json') }
    ]
  },
  modulePaths: [rootNodeModules, __dirname],
  moduleNameMapper: {
    '^react$': path.join(rootNodeModules, 'react'),
    '^react-dom$': path.join(rootNodeModules, 'react-dom'),
    '^react-dom/client$': path.join(rootNodeModules, 'react-dom/client'),
    '^react/jsx-runtime$': path.join(rootNodeModules, 'react/jsx-runtime'),
    '^react/jsx-dev-runtime$': path.join(rootNodeModules, 'react/jsx-dev-runtime')
  },
  setupFilesAfterEnv: [path.join(__dirname, 'jest.setup.js')],
  testPathIgnorePatterns: ['/node_modules/', '/build/', '\\.d\\.ts$'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/index.tsx'
  ]
};
