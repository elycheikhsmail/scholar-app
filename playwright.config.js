const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3780',
    headless: true,
    locale: 'ar',
    launchOptions: {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    }
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3780',
    reuseExistingServer: true,
    timeout: 30_000
  }
});