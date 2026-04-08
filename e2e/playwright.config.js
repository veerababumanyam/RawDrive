// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8229',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'rawdrive-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'rawdrive-firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
