const { test: base, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '../../..');
const e2eDataBase = path.join(appRoot, 'test-results', 'e2e-data');

const test = base.extend({
  electronApp: async ({}, use) => {
    mkdirSync(e2eDataBase, { recursive: true });
    const tmpBase = mkdtempSync(path.join(e2eDataBase, 'run-'));
    const tmpBaseNorm = tmpBase.replace(/\\/g, '/'); // forward slashes for Electron on Windows
    const checklistDir = path.join(tmpBase, 'checklists');
    mkdirSync(checklistDir);
    writeFileSync(
      path.join(tmpBase, 'settings.json'),
      JSON.stringify({ dataDirs: [checklistDir.replace(/\\/g, '/')] })
    );

    const app = await electron.launch({
      args: [appRoot, `--user-data-dir=${tmpBaseNorm}`],
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
