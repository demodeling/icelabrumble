// @ts-check
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({ testDir: './tests', timeout: 60000, use: { viewport: { width: 1100, height: 720 } }, projects: [{ name: 'chromium', use: { browserName: 'chromium' } }] });
