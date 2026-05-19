const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/electron-app');

const waitForSave = (page) => page.waitForTimeout(450);

async function seedAndOpen(page, checklistDir, name, content) {
  writeFileSync(path.join(checklistDir, `${name}.cl.md`), content);
  await page.waitForTimeout(400);
  await page.locator('.checklist-item', { hasText: name }).click();
  await page.waitForTimeout(200);
}

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
    expect(content).toMatch(/- \[x\] task \d{4}-\d{2}-\d{2}T\d{4} <!-- id:/);

    await page.locator('.item-checkbox').first().click();
    await waitForSave(page);

    content = readFileSync(path.join(checklistDir, 'Check.cl.md'), 'utf8');
    expect(content).toContain('- [ ]');
    expect(content).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{4}/);
  });

  test('1.8a Resolved badge appears on check and disappears on uncheck', async ({ electronApp: { page, checklistDir } }) => {
    await page.locator('.tree-dir-add').first().click();
    await page.locator('.new-checklist-input').fill('Resolved');
    await page.locator('.new-checklist-input').press('Enter');
    await page.locator('.checklist-item', { hasText: 'Resolved' }).click();

    await page.locator('.item-text').first().fill('task');
    const badge = page.locator('.item-resolved-badge').first();
    await expect(badge).toBeHidden();

    await page.locator('.item-checkbox').first().click();
    await waitForSave(page);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/^Resolved \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

    await page.locator('.item-checkbox').first().click();
    await waitForSave(page);
    await expect(badge).toBeHidden();
  });

  test('1.8b Legacy checked item without resolution timestamp still loads', async ({ electronApp: { page, checklistDir } }) => {
    await seedAndOpen(page, checklistDir, 'Legacy', '- [x] legacy task <!-- id:deadbeef -->\n');

    const checkbox = page.locator('.item-checkbox').first();
    await expect(checkbox).toBeChecked();
    await expect(page.locator('.item-resolved-badge').first()).toBeHidden();
  });

  test('1.9 Collapse a parent item via chevron hides its sub-items', async ({ electronApp: { page, checklistDir } }) => {
    await seedAndOpen(page, checklistDir, 'CollapseClick', [
      '- [ ] parent <!-- id:aaaa1111 -->',
      '  - [ ] child one <!-- id:bbbb2222 -->',
      '  - [ ] child two <!-- id:cccc3333 -->',
    ].join('\n') + '\n');

    await expect(page.locator('.item-text', { hasText: 'child one' })).toBeVisible();

    // Click chevron on parent row
    const parentRow = page.locator('.item-row[data-id="aaaa1111"]');
    await parentRow.locator('.item-toggle').click();
    await page.waitForTimeout(100);

    await expect(page.locator('.item-text', { hasText: 'child one' })).not.toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'child two' })).not.toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'parent' })).toBeVisible();

    // Click again to expand
    await page.locator('.item-row[data-id="aaaa1111"] .item-toggle').click();
    await page.waitForTimeout(100);
    await expect(page.locator('.item-text', { hasText: 'child one' })).toBeVisible();
  });

  test('1.10 Ctrl+E toggles item collapse when focused on a parent item', async ({ electronApp: { page, checklistDir } }) => {
    await seedAndOpen(page, checklistDir, 'CollapseHotkey', [
      '- [ ] parent <!-- id:aaaa1111 -->',
      '  - [ ] child <!-- id:bbbb2222 -->',
    ].join('\n') + '\n');

    await page.locator('.item-row[data-id="aaaa1111"] .item-text').click();
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(100);
    await expect(page.locator('.item-text', { hasText: 'child' })).not.toBeVisible();

    await page.locator('.item-row[data-id="aaaa1111"] .item-text').click();
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(100);
    await expect(page.locator('.item-text', { hasText: 'child' })).toBeVisible();
  });

  test('1.11 Collapsed state persists across reopen', async ({ electronApp: { page, checklistDir } }) => {
    await seedAndOpen(page, checklistDir, 'CollapsePersist', [
      '- [ ] parent <!-- id:aaaa1111 -->',
      '  - [ ] child <!-- id:bbbb2222 -->',
      '- [ ] other <!-- id:cccc3333 -->',
    ].join('\n') + '\n');

    await page.locator('.item-row[data-id="aaaa1111"] .item-toggle').click();
    await page.waitForTimeout(100);
    await expect(page.locator('.item-text', { hasText: 'child' })).not.toBeVisible();

    // Switch away and back
    await seedAndOpen(page, checklistDir, 'CollapsePersistOther', '- [ ] x <!-- id:dddd4444 -->\n');
    await page.locator('.checklist-item', { hasText: 'CollapsePersist' }).first().click();
    await page.waitForTimeout(300);

    await expect(page.locator('.item-text', { hasText: 'child' })).not.toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'parent' })).toBeVisible();
  });

  test('1.12 Tab-indenting under a collapsed parent auto-expands the parent', async ({ electronApp: { page, checklistDir } }) => {
    await seedAndOpen(page, checklistDir, 'AutoExpand', [
      '- [ ] parent <!-- id:aaaa1111 -->',
      '  - [ ] child <!-- id:bbbb2222 -->',
      '- [ ] sibling <!-- id:cccc3333 -->',
    ].join('\n') + '\n');

    // Collapse parent
    await page.locator('.item-row[data-id="aaaa1111"] .item-toggle').click();
    await page.waitForTimeout(100);
    await expect(page.locator('.item-text', { hasText: 'child' })).not.toBeVisible();

    // Focus the sibling and Tab to indent it under the (now-collapsed) parent
    await page.locator('.item-row[data-id="cccc3333"] .item-text').click();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Parent auto-expanded → both children visible
    await expect(page.locator('.item-text', { hasText: 'child' })).toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'sibling' })).toBeVisible();
  });

  test('1.13 Leaf items render a hidden chevron slot for alignment', async ({ electronApp: { page, checklistDir } }) => {
    await seedAndOpen(page, checklistDir, 'LeafSlot', '- [ ] solo <!-- id:aaaa1111 -->\n');

    const toggle = page.locator('.item-row[data-id="aaaa1111"] .item-toggle');
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toBeHidden();
  });
});
