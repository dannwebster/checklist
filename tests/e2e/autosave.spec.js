const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/electron-app');

const waitForSave = (page) => page.waitForTimeout(450);

async function createAndOpen(page, checklistDir, name) {
  await page.locator('.tree-dir-add').first().click();
  await page.locator('.new-checklist-input').fill(name);
  await page.locator('.new-checklist-input').press('Enter');
  await page.locator('.checklist-item', { hasText: name }).click();
  return path.join(checklistDir, `${name}.cl.md`);
}

test.describe('§7 Auto-save', () => {
  test('7.1 Save on edit', async ({ electronApp: { page, checklistDir } }) => {
    const filePath = await createAndOpen(page, checklistDir, 'Autosave');
    const item = page.locator('.item-text').first();
    await item.fill('saved content');
    await waitForSave(page);

    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('saved content');
  });

  test('7.2 No data loss on rapid typing', async ({ electronApp: { page, checklistDir } }) => {
    const filePath = await createAndOpen(page, checklistDir, 'Rapid');
    const item = page.locator('.item-text').first();
    await item.click();

    await item.fill('alpha');
    await item.press('Enter');
    await page.locator('.item-text').nth(1).fill('beta');
    await page.locator('.item-text').nth(1).press('Enter');
    await page.locator('.item-text').nth(2).fill('gamma');
    await waitForSave(page);

    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('alpha');
    expect(content).toContain('beta');
    expect(content).toContain('gamma');
  });

  test('7.3 External change reloads the file', async ({ electronApp: { page, checklistDir } }) => {
    const filePath = await createAndOpen(page, checklistDir, 'External');
    await page.locator('.item-text').first().fill('original');
    await waitForSave(page);

    writeFileSync(filePath, '# External\n- [ ] externally added <!-- id:eeeeeeee -->\n');
    // Wait for file watcher to pick up the change (~200 ms debounce)
    await page.waitForTimeout(800);

    await expect(page.locator('.item-text', { hasText: 'externally added' })).toBeVisible();
  });
});
