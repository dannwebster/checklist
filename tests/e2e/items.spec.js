const { readFileSync } = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/electron-app');

const waitForSave = (page) => page.waitForTimeout(450);

test.describe('§1 Lists and items', () => {
  test('1.1 Create a checklist', async ({ electronApp: { app, page, checklistDir } }) => {
    await page.locator('.tree-dir-add').first().click();
    await page.locator('.new-checklist-input').fill('MyList');
    await page.locator('.new-checklist-input').press('Enter');

    await expect(page.locator('.checklist-item', { hasText: 'MyList' })).toBeVisible();
    expect(readFileSync(path.join(checklistDir, 'MyList.cl.md'), 'utf8')).toBeTruthy();
  });

  test('1.2 Rename a checklist', async ({ electronApp: { app, page, checklistDir } }) => {
    await page.locator('.tree-dir-add').first().click();
    await page.locator('.new-checklist-input').fill('OldName');
    await page.locator('.new-checklist-input').press('Enter');
    await page.locator('.checklist-item', { hasText: 'OldName' }).click();

    const title = page.locator('#editor-title');
    await title.clear();
    await title.fill('NewName');
    await title.press('Enter');
    await waitForSave(page);

    await expect(page.locator('.checklist-item', { hasText: 'NewName' })).toBeVisible();
    await expect(page.locator('.checklist-item', { hasText: 'OldName' })).not.toBeVisible();
  });

  test('1.3 Delete a checklist', async ({ electronApp: { app, page, checklistDir } }) => {
    await page.locator('.tree-dir-add').first().click();
    await page.locator('.new-checklist-input').fill('ToDelete');
    await page.locator('.new-checklist-input').press('Enter');
    await page.locator('.checklist-item', { hasText: 'ToDelete' }).click();

    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 0;
    });

    await page.locator('.checklist-item', { hasText: 'ToDelete' })
      .locator('..').locator('.tree-item-remove').click();

    await expect(page.locator('.checklist-item', { hasText: 'ToDelete' })).not.toBeVisible();
  });

  test('1.4 Add an item', async ({ electronApp: { app, page, checklistDir } }) => {
    await page.locator('.tree-dir-add').first().click();
    await page.locator('.new-checklist-input').fill('Items');
    await page.locator('.new-checklist-input').press('Enter');
    await page.locator('.checklist-item', { hasText: 'Items' }).click();

    const firstItem = page.locator('.item-text').first();
    await firstItem.click();
    await firstItem.fill('First item');
    await firstItem.press('Enter');
    await page.locator('.item-text').nth(1).fill('Second item');
    await waitForSave(page);

    const content = readFileSync(path.join(checklistDir, 'Items.cl.md'), 'utf8');
    expect(content).toContain('First item');
    expect(content).toContain('Second item');
  });

  test('1.5 Edit an item', async ({ electronApp: { app, page, checklistDir } }) => {
    await page.locator('.tree-dir-add').first().click();
    await page.locator('.new-checklist-input').fill('Edit');
    await page.locator('.new-checklist-input').press('Enter');
    await page.locator('.checklist-item', { hasText: 'Edit' }).click();

    const item = page.locator('.item-text').first();
    await item.fill('original text');
    await waitForSave(page);
    await item.fill('edited text');
    await waitForSave(page);

    const content = readFileSync(path.join(checklistDir, 'Edit.cl.md'), 'utf8');
    expect(content).toContain('edited text');
    expect(content).not.toContain('original text');
  });

  test('1.6 Delete an item — empty', async ({ electronApp: { app, page } }) => {
    await page.locator('.tree-dir-add').first().click();
    await page.locator('.new-checklist-input').fill('Del');
    await page.locator('.new-checklist-input').press('Enter');
    await page.locator('.checklist-item', { hasText: 'Del' }).click();

    const item = page.locator('.item-text').first();
    await item.fill('some text');
    await item.press('Enter');
    const initialCount = await page.locator('.item-text').count();

    const secondItem = page.locator('.item-text').nth(1);
    await secondItem.fill('');
    await secondItem.press('Backspace');
    await page.waitForTimeout(100);

    expect(await page.locator('.item-text').count()).toBeLessThan(initialCount);
  });

  test('1.7 Delete an item — Ctrl+Backspace', async ({ electronApp: { app, page } }) => {
    await page.locator('.tree-dir-add').first().click();
    await page.locator('.new-checklist-input').fill('ForceDelete');
    await page.locator('.new-checklist-input').press('Enter');
    await page.locator('.checklist-item', { hasText: 'ForceDelete' }).click();

    const item = page.locator('.item-text').first();
    await item.fill('has content');
    await item.press('Enter');
    const initialCount = await page.locator('.item-text').count();

    await page.locator('.item-text').first().press('Control+Backspace');
    await page.waitForTimeout(100);

    expect(await page.locator('.item-text').count()).toBeLessThan(initialCount);
  });

  test('1.8 Check and uncheck an item', async ({ electronApp: { app, page, checklistDir } }) => {
    await page.locator('.tree-dir-add').first().click();
    await page.locator('.new-checklist-input').fill('Check');
    await page.locator('.new-checklist-input').press('Enter');
    await page.locator('.checklist-item', { hasText: 'Check' }).click();

    await page.locator('.item-text').first().fill('task');
    await page.locator('.item-checkbox').first().click();
    await waitForSave(page);

    let content = readFileSync(path.join(checklistDir, 'Check.cl.md'), 'utf8');
    expect(content).toContain('- [x]');

    await page.locator('.item-checkbox').first().click();
    await waitForSave(page);

    content = readFileSync(path.join(checklistDir, 'Check.cl.md'), 'utf8');
    expect(content).toContain('- [ ]');
  });
});
