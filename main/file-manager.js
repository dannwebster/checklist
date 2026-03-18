const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_DATA_DIR = path.join(os.homedir(), 'Documents', 'Checklists');

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
  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(dirPath, f);
      const stat = fs.statSync(filePath);
      return {
        name: f.slice(0, -3),
        path: filePath,
        mtime: stat.mtimeMs,
      };
    });
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
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
