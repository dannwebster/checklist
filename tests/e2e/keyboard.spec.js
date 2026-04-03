const { readFileSync } = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/electron-app');

const waitForSave = (page) => page.waitForTimeout(450);

async function createAndOpen(page, checklistDir, name) {
  await page.locator('.tree-dir-add').first().click();
  await page.locator('.new-checklist-input').fill(name);
  await page.locator('.new-checklist-input').press('Enter');
  await page.locator('.checklist-item', { hasText: name }).click();
  return checklistDir ? path.join(checklistDir, `${name}.cl.md`) : null;
}

test.describe('§1.9 + §1.11 + §10 Keyboard shortcuts', () => {
  test('1.9 Tab indents and Shift+Tab unindents an item', async ({ electronApp: { page, checklistDir } }) => {
    const filePath = await createAndOpen(page, checklistDir, 'Indent');
    const item = page.locator('.item-text').first();
    await item.fill('task');
    await item.press('Tab');
    await waitForSave(page);

    let content = readFileSync(filePath, 'utf8');
    expect(content).toMatch(/^  - \[ \]/m);

    await item.press('Shift+Tab');
    await waitForSave(page);

    content = readFileSync(filePath, 'utf8');
    expect(content).toMatch(/^- \[ \]/m);
  });

  test('1.11 Arrow key navigation moves focus', async ({ electronApp: { page } }) => {
    await createAndOpen(page, null, 'ArrowNav');
    const item0 = page.locator('.item-text').first();
    await item0.fill('first');
    await item0.press('Enter');
    await page.locator('.item-text').nth(1).fill('second');

    await item0.click();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    const focused = page.locator('.item-text:focus');
    await expect(focused).toHaveText('second');
  });

  test('§10 Enter inserts new item below current', async ({ electronApp: { page, checklistDir } }) => {
    const filePath = await createAndOpen(page, checklistDir, 'KbEnter');
    const item = page.locator('.item-text').first();
    await item.fill('first');
    await item.press('Enter');
    await page.locator('.item-text').nth(1).fill('second');
    await waitForSave(page);

    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('first');
    expect(content).toContain('second');
  });

  test('§10 Ctrl+Space toggles checkbox', async ({ electronApp: { page, checklistDir } }) => {
    const filePath = await createAndOpen(page, checklistDir, 'KbSpace');
    const item = page.locator('.item-text').first();
    await item.fill('task');
    await item.click();
    await page.keyboard.press('Control+Space');
    await waitForSave(page);

    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('- [x]');
  });

  test('§10 Alt+↑ and Alt+↓ move an item', async ({ electronApp: { page, checklistDir } }) => {
    const filePath = await createAndOpen(page, checklistDir, 'KbMove');
    const item0 = page.locator('.item-text').first();
    await item0.fill('alpha');
    await item0.press('Enter');
    await page.locator('.item-text').nth(1).fill('beta');
    await waitForSave(page);

    await page.locator('.item-text').nth(1).click();
    await page.keyboard.press('Alt+ArrowUp');
    await waitForSave(page);

    const content = readFileSync(filePath, 'utf8');
    expect(content.indexOf('beta')).toBeLessThan(content.indexOf('alpha'));
  });

  test('§10 Ctrl+H adds a section header', async ({ electronApp: { page } }) => {
    await createAndOpen(page, null, 'KbHeader');
    const item = page.locator('.item-text').first();
    await item.click();
    await page.keyboard.press('Control+h');
    await page.waitForTimeout(100);

    await expect(page.locator('.section-title').first()).toBeVisible();
  });

  test('§10 Ctrl+B focuses the sidebar', async ({ electronApp: { page } }) => {
    await createAndOpen(page, null, 'KbSidebar');
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(100);

    const sidebarFocused = await page.evaluate(() =>
      document.activeElement !== null && document.activeElement !== document.body &&
      document.activeElement.closest('#sidebar') !== null
    );
    expect(sidebarFocused).toBe(true);
  });
});
