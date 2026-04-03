const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/electron-app');

const waitForSave = (page) => page.waitForTimeout(450);

async function createAndOpen(page, checklistDir, name) {
  await page.locator('.tree-dir-add').first().click();
  await page.locator('.new-checklist-input').fill(name);
  await page.locator('.new-checklist-input').press('Enter');
  await page.locator('.checklist-item', { hasText: name }).click();
}

test.describe('§2 Sections and hierarchy', () => {
  test('2.1 Add a top-level section', async ({ electronApp: { page, checklistDir } }) => {
    await createAndOpen(page, checklistDir, 'Sections');
    await page.locator('.item-text').first().click();

    await page.locator('#add-h1-btn').click();
    await page.waitForTimeout(100);

    await expect(page.locator('.section-title').first()).toBeVisible();
  });

  test('2.3 Promote and demote section headers', async ({ electronApp: { page, checklistDir } }) => {
    await createAndOpen(page, checklistDir, 'Promote');
    await page.locator('#add-h1-btn').click();
    await page.waitForTimeout(100);

    const sectionTitle = page.locator('.section-title').first();
    await sectionTitle.click();

    // Demote: Tab moves H1 → H2
    await sectionTitle.press('Tab');
    await waitForSave(page);
    let content = readFileSync(path.join(checklistDir, 'Promote.cl.md'), 'utf8');
    expect(content).toMatch(/^##\s/m);

    // Promote: Shift+Tab moves H2 → H1
    await sectionTitle.press('Shift+Tab');
    await waitForSave(page);
    content = readFileSync(path.join(checklistDir, 'Promote.cl.md'), 'utf8');
    expect(content).toMatch(/^#\s/m);
  });

  test('2.4 Collapse and expand a section', async ({ electronApp: { page } }) => {
    await createAndOpen(page, null, 'Collapse');
    await page.locator('#add-h1-btn').click();
    await page.waitForTimeout(100);

    const sectionTitle = page.locator('.section-title').first();

    // Add an item
    const item = page.locator('.item-text').first();
    await item.click();
    await item.fill('under section');

    // Collapse via Ctrl+E from section title
    await sectionTitle.click();
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(100);

    await expect(page.locator('.item-text', { hasText: 'under section' })).not.toBeVisible();

    // Expand
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(100);

    await expect(page.locator('.item-text', { hasText: 'under section' })).toBeVisible();
  });

  test('2.5 Collapsed state persists across reloads', async ({ electronApp: { page, checklistDir } }) => {
    await createAndOpen(page, checklistDir, 'Persist');
    await page.waitForTimeout(200);

    // Write a file with a section and an item
    const filePath = path.join(checklistDir, 'Persist.cl.md');
    writeFileSync(filePath, '# My Section <!-- sec:aabbccdd -->\n- [ ] item one <!-- id:11223344 -->\n');

    // Re-click to load the seeded file
    await page.locator('.checklist-item', { hasText: 'Persist' }).click();
    await page.waitForTimeout(300);

    const sectionTitle = page.locator('.section-title', { hasText: 'My Section' });
    await sectionTitle.click();
    await page.keyboard.press('Control+e');
    await waitForSave(page);

    // Re-open
    await page.locator('.checklist-item', { hasText: 'Persist' }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('.item-text', { hasText: 'item one' })).not.toBeVisible();
  });
});
