const { test: base, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const path = require('path');

const appRoot = path.resolve(__dirname, '../../..');

const test = base.extend({
  electronApp: async ({}, use) => {
    const tmpBase = mkdtempSync(path.join(tmpdir(), 'punchcard-test-'));
    const checklistDir = path.join(tmpBase, 'checklists');
    mkdirSync(checklistDir);
    writeFileSync(
      path.join(tmpBase, 'settings.json'),
      JSON.stringify({ dataDirs: [checklistDir] })
    );

    const app = await electron.launch({
      args: [appRoot, `--user-data-dir=${tmpBase}`],
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    });

    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500); // let sidebar finish loading

    await use({ app, page, checklistDir, tmpBase });

    await app.close().catch(() => {});
    rmSync(tmpBase, { recursive: true, force: true });
  },
});

module.exports = { test, expect };
