const { test: electronTest, expect } = require('./electron-app');
const { execSync } = require('child_process');
const { writeFileSync } = require('fs');
const path = require('path');

const test = electronTest.extend({
  electronApp: async ({ electronApp }, use) => {
    const { checklistDir } = electronApp;
    execSync('git init', { cwd: checklistDir });
    execSync('git config user.email "test@test.com"', { cwd: checklistDir });
    execSync('git config user.name "Test"', { cwd: checklistDir });
    const seedPath = path.join(checklistDir, 'seed.cl.md');
    writeFileSync(seedPath, '# Test\n- [ ] seed item <!-- id:00000000 -->\n');
    execSync('git add . && git commit -m "init"', { cwd: checklistDir, shell: true });
    await use(electronApp);
  },
});

module.exports = { test, expect };
