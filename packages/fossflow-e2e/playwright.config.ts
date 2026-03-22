import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    // Tier 2: smoke — fast gate, Chromium only, smoke.spec.ts only
    {
      name: 'smoke',
      testMatch: '**/smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // Tier 3: full e2e — all specs except smoke and visual
    {
      name: 'chromium',
      testIgnore: ['**/smoke.spec.ts', '**/visual.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: ['**/smoke.spec.ts', '**/visual.spec.ts'],
      use: { ...devices['Desktop Firefox'] },
    },

    // Visual regression — separate project, separate command
    {
      name: 'visual',
      testMatch: '**/visual.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        // Fixed viewport for pixel-stable screenshots
        viewport: { width: 1280, height: 800 },
      },
      snapshotDir: './snapshots',
    },
  ],

  // Auto-starts dev server; reuses if already running locally
  webServer: {
    command: 'npm run dev --workspace=packages/fossflow-app',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
    cwd: '../..',
  },

  outputDir: './test-results',
});
