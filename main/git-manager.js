const { execFile } = require('child_process');
const path = require('path');

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function getGitStatus(filePath) {
  const dir = path.dirname(filePath);
  try {
    const stdout = await run(['status', '--porcelain', filePath], dir);
    return { isGitRepo: true, isDirty: stdout.trim().length > 0 };
  } catch {
    return { isGitRepo: false, isDirty: false };
  }
}

async function gitCommit(filePath) {
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath);
  try {
    await run(['add', filePath], dir);
    await run(['commit', '-m', `updated checklist file "${basename}"`], dir);
    return { success: true };
  } catch (err) {
    const msg = (err.message || '') + (err.stderr || '');
    if (msg.includes('nothing to commit')) return { success: true };
    return { success: false, error: msg };
  }
}

module.exports = { getGitStatus, gitCommit };
