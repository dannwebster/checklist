const { readFileSync } = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/git-app');

const waitForSave = (page) => page.waitForTimeout(450);

test.describe('§6 Git integration', () => {
  test('6.1 Dirty indicator appears after edit', async ({ electronApp: { page, checklistDir } }) => {
    await page.locator('.checklist-item', { hasText: 'seed' }).click();
    await page.waitForTimeout(200);

    const item = page.locator('.item-text').first();
    await item.fill('modified content');
    await waitForSave(page);

    await expect(
      page.locator('.checklist-item.git-dirty, .checklist-item .git-dirty').first()
    ).toBeVisible();
  });

  test('6.2 Commit button clears dirty state', async ({ electronApp: { app, page } }) => {
    await page.locator('.checklist-item', { hasText: 'seed' }).click();
    await page.waitForTimeout(200);

    await page.locator('.item-text').first().fill('committed change');
    await waitForSave(page);

    await expect(page.locator('#git-commit-btn')).toBeEnabled({ timeout: 3000 });
    await page.locator('#git-commit-btn').click();
    await page.waitForTimeout(1000);

    await expect(
      page.locator('.checklist-item.git-dirty, .checklist-item .git-dirty')
    ).not.toBeVisible();
  });

  test('6.4 Revert button restores last committed state', async ({ electronApp: { app, page, checklistDir } }) => {
    const seedPath = path.join(checklistDir, 'seed.cl.md');
    const originalContent = readFileSync(seedPath, 'utf8');

    await page.locator('.checklist-item', { hasText: 'seed' }).click();
    await page.waitForTimeout(200);

    await page.locator('.item-text').first().fill('changes to revert');
    await waitForSave(page);

    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 0;
    });

    await expect(page.locator('#git-revert-btn')).toBeEnabled({ timeout: 3000 });
    await page.locator('#git-revert-btn').click();
    await page.waitForTimeout(500);

    const content = readFileSync(seedPath, 'utf8');
    expect(content).toBe(originalContent);
  });
});
