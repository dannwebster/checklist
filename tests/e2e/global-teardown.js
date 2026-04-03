const { rmSync, existsSync } = require('fs');
const path = require('path');

module.exports = async () => {
  const dir = path.join(__dirname, '../../test-results/e2e-data');
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
};
