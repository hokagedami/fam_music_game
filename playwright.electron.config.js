// @ts-check
import { defineConfig } from '@playwright/test';

/**
 * Electron-only Playwright config.
 *
 * The Electron tests don't need the dev web-server fixture — they spawn the
 * Electron app themselves via `_electron.launch()`, which boots its own
 * embedded server on a random loopback port. They run sequentially because
 * we can only sanely have one Electron instance bound to a given user-data
 * directory at a time.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/electron-*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
  },
});
