import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the EXPLORATORY campaign
 * (campaign APPROACH.md §7, retired to git history — method now in .claude/commands/explore.md).
 *
 * Quarantined from CI and from `npm run test:e2e`: the default config's
 * `testDir: './tests'` never sees `./tests-exploratory`, and no workflow
 * references this file. A red or flaky probe therefore never blocks a
 * regression gate — which is what lets probes be committed as `test.fail()`
 * repros (§6).
 *
 * Shape is deliberately a clone of playwright.config.ts: same webServer,
 * workers=1 (the rsbuild dev server cannot take parallel HMR clients), and the
 * chromium / chromium-touch project split so touch-* probes get `hasTouch`
 * without the desktop probes double-running.
 *
 * Convention: probes are named `<area>-<nn>.explore.spec.ts` under
 * `tests-exploratory/<area>/`; touch probes are named `touch-*.explore.spec.ts`
 * so the project split picks them up.
 */
export default defineConfig({
  testDir: './tests-exploratory',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Artifacts nest under the already-gitignored `test-results/` and
  // `playwright-report/` roots (own subfolders, so a probe run never wipes the
  // regression suite's output) — no .gitignore edit needed.
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: './playwright-report/explore' }]
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /touch-.*\.explore\.spec\.ts/
    },
    {
      name: 'chromium-touch',
      use: { ...devices['Desktop Chrome'], hasTouch: true },
      testMatch: /touch-.*\.explore\.spec\.ts/
    }
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: '../..'
  },

  outputDir: './test-results/explore'
});
