const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3780',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'ar',
    launchOptions: process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : {}
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3780',
    reuseExistingServer: true,
    timeout: 30_000
  }
});