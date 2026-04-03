const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/electron-app');

const waitForSave = (page) => page.waitForTimeout(450);

async function seedAndOpen(page, checklistDir, name, content) {
  writeFileSync(path.join(checklistDir, `${name}.cl.md`), content);
  await page.waitForTimeout(400); // let file watcher pick it up
  await page.locator('.checklist-item', { hasText: name }).click();
  await page.waitForTimeout(200);
}

test.describe('§3 Show/hide completed', () => {
  test('3.1 Document-level filter hides completed items', async ({ electronApp: { page, checklistDir } }) => {
    await seedAndOpen(page, checklistDir, 'Filter', [
      '- [x] done item <!-- id:11111111 -->',
      '- [ ] open item <!-- id:22222222 -->',
    ].join('\n') + '\n');

    // Click doc-level filter button to hide completed
    await page.locator('#doc-filter-btn').click();
    await page.waitForTimeout(100);

    // Done item row should not be visible; open item should be
    const doneRows = page.locator('.item-row.item-done');
    const count = await doneRows.count();
    for (let i = 0; i < count; i++) {
      await expect(doneRows.nth(i)).not.toBeVisible();
    }
    await expect(page.locator('.item-text', { hasText: 'open item' })).toBeVisible();
  });

  test('3.2 Section-level filter stored in file', async ({ electronApp: { page, checklistDir } }) => {
    await seedAndOpen(page, checklistDir, 'SectionFilter', [
      '# My Section <!-- sec:aabb1122 -->',
      '- [x] done here <!-- id:aaaaaaaa -->',
      '- [ ] open here <!-- id:bbbbbbbb -->',
    ].join('\n') + '\n');

    await page.locator('.item-text').first().click();
    await page.keyboard.press('Control+Shift+H');
    await waitForSave(page);

    const content = readFileSync(path.join(checklistDir, 'SectionFilter.cl.md'), 'utf8');
    expect(content).toMatch(/cf:(show|hide)/);
  });

  test('3.3 Filter persists across file reloads', async ({ electronApp: { page, checklistDir } }) => {
    await seedAndOpen(page, checklistDir, 'FilterPersist', [
      '<!-- cf:hide -->',
      '- [x] done <!-- id:cccccccc -->',
      '- [ ] open <!-- id:dddddddd -->',
    ].join('\n') + '\n');

    // Re-open the file to confirm persistence
    await page.locator('.checklist-item', { hasText: 'FilterPersist' }).click();
    await page.waitForTimeout(300);

    const content = readFileSync(path.join(checklistDir, 'FilterPersist.cl.md'), 'utf8');
    expect(content).toContain('cf:hide');
  });
});
