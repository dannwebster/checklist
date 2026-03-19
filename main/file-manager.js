const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_DATA_DIR = path.join(os.homedir(), 'Documents', 'Checklists');
const DEFAULT_FILE_PATTERNS = ['*Tasks*.md', '*Checklist*.md', '*.cl.md'];

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$', 'i');
}

function matchesAnyPattern(filename, patterns) {
  return patterns.some(p => globToRegex(p).test(filename));
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function getDataDir() {
  const settings = readSettings();
  return settings.dataDir || DEFAULT_DATA_DIR;
}

function setDataDir(dirPath) {
  const settings = readSettings();
  settings.dataDir = dirPath;
  writeSettings(settings);
}

function ensureDataDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function listChecklists(dirPath) {
  ensureDataDir(dirPath);
  const patterns = readSettings().filePatterns || DEFAULT_FILE_PATTERNS;
  const results = [];

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && matchesAnyPattern(entry.name, patterns)) {
        const stat = fs.statSync(fullPath);
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
        results.push({ name: relPath, path: fullPath, mtime: stat.mtimeMs });
      }
    }
  }

  walk(dirPath);
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

function readChecklist(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeChecklist(filePath, content) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function deleteChecklist(filePath) {
  fs.unlinkSync(filePath);
}

function renameChecklist(oldPath, newPath) {
  fs.renameSync(oldPath, newPath);
}

function createChecklist(dirPath, name) {
  ensureDataDir(dirPath);
  const filePath = path.join(dirPath, name + '.md');
  const content = `# ${name}\n\n`;
  writeChecklist(filePath, content);
  return filePath;
}

module.exports = {
  getDataDir,
  setDataDir,
  listChecklists,
  readChecklist,
  writeChecklist,
  deleteChecklist,
  renameChecklist,
  createChecklist,
};
