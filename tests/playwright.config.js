const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1, // Electron tests must not run in parallel
  use: { headless: false },
});
