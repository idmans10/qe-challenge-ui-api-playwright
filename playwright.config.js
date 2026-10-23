import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env.js';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  // Hard stop for the whole run so a hung environment cannot keep CI busy indefinitely.
  globalTimeout: 10 * 60_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results',
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'api',
      testMatch: 'api/**/*.spec.js',
      use: {
        baseURL: env.apiBaseUrl,
        // Traces would capture auth headers/cookies; diagnostics go through sanitized attachments instead.
        trace: 'off',
        screenshot: 'off',
        video: 'off',
      },
    },
    {
      name: 'ui-chromium',
      testMatch: 'ui/**/*.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: env.uiBaseUrl,
        testIdAttribute: 'data-test',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
      },
    },
  ],
});
