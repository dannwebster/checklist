const { readFileSync } = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/electron-app');

const waitForSave = (page) => page.waitForTimeout(450);

async function createAndOpen(page, checklistDir, name) {
  await page.locator('.tree-dir-add').first().click();
  await page.locator('.new-checklist-input').fill(name);
  await page.locator('.new-checklist-input').press('Enter');
  await page.locator('.checklist-item', { hasText: name }).click();
}

test.describe('§4 Context (inline notes)', () => {
  test('4.1 Typing colon opens context area', async ({ electronApp: { page, checklistDir } }) => {
    await createAndOpen(page, checklistDir, 'Context1');
    const item = page.locator('.item-text').first();
    await item.click();
    await item.type('my task:');
    await page.waitForTimeout(200);

    await expect(page.locator('.item-context-text').first()).toBeVisible();
  });

  test('4.2 URL does not trigger context', async ({ electronApp: { page, checklistDir } }) => {
    await createAndOpen(page, checklistDir, 'Context2');
    const item = page.locator('.item-text').first();
    await item.click();
    await item.fill('https://example.com');
    await page.waitForTimeout(200);

    const contextArea = page.locator('.item-context-text').first();
    const isVisible = await contextArea.isVisible().catch(() => false);
    if (isVisible) {
      const value = await contextArea.inputValue().catch(() => contextArea.textContent());
      expect((await value).trim()).toBe('');
    }
  });

  test('4.3 Ctrl+Enter toggles context open/closed', async ({ electronApp: { page, checklistDir } }) => {
    await createAndOpen(page, checklistDir, 'Context3');
    const item = page.locator('.item-text').first();
    await item.click();

    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);
    await expect(page.locator('.item-context-text').first()).toBeVisible();

    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);
    await expect(page.locator('.item-context-text').first()).not.toBeVisible();
  });

  test('4.4 Context indicator reflects content presence', async ({ electronApp: { page, checklistDir } }) => {
    await createAndOpen(page, checklistDir, 'Context4');
    const item = page.locator('.item-text').first();
    await item.click();
    await page.keyboard.press('Control+Enter');

    const contextText = page.locator('.item-context-text').first();
    await contextText.fill('some notes');
    await page.keyboard.press('Control+Enter'); // close
    await page.waitForTimeout(100);

    const toggle = page.locator('.item-context-toggle').first();
    const hasContent = await toggle.evaluate(el =>
      el.classList.contains('has-context') ||
      el.classList.contains('active') ||
      el.getAttribute('data-has-context') === 'true'
    );
    expect(hasContent).toBe(true);
  });

  test('4.5 Context persists across saves', async ({ electronApp: { page, checklistDir } }) => {
    await createAndOpen(page, checklistDir, 'Context5');
    const item = page.locator('.item-text').first();
    await item.click();
    await item.fill('my task');
    await page.keyboard.press('Control+Enter');
    const contextText = page.locator('.item-context-text').first();
    await contextText.fill('my notes');
    await waitForSave(page);

    const content = readFileSync(path.join(checklistDir, 'Context5.cl.md'), 'utf8');
    expect(content).toContain('my task: my notes');
  });
});
