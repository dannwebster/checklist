const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_DATA_DIR = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), app.getName())
  : app.getPath('userData');
const DEFAULT_FILE_PATTERNS = ['*Tasks*.md', '*Checklist*.md', '*.cl.md'];
const DEFAULT_IGNORE_DIR_PATTERNS = ['.*', 'node_modules', 'dist', 'build', 'target', 'vendor', 'out', '.cache'];

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

function getDataDirs() {
  const settings = readSettings();
  if (settings.dataDirs && Array.isArray(settings.dataDirs) && settings.dataDirs.length > 0) {
    return settings.dataDirs;
  }
  // Legacy migration: single dataDir -> dataDirs array
  const dir = settings.dataDir || DEFAULT_DATA_DIR;
  return [dir];
}

function addDataDir(dirPath) {
  const settings = readSettings();
  const dirs = settings.dataDirs || [settings.dataDir || DEFAULT_DATA_DIR];
  if (!dirs.includes(dirPath)) dirs.push(dirPath);
  settings.dataDirs = dirs;
  delete settings.dataDir;
  writeSettings(settings);
  return dirs;
}

function removeDataDir(dirPath) {
  const settings = readSettings();
  const dirs = settings.dataDirs || [settings.dataDir || DEFAULT_DATA_DIR];
  const updated = dirs.filter(d => d !== dirPath);
  settings.dataDirs = updated;
  delete settings.dataDir;
  writeSettings(settings);
  return updated;
}

function ensureDataDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function listChecklists(dirPath) {
  ensureDataDir(dirPath);
  const settings = readSettings();
  const patterns = settings.filePatterns || DEFAULT_FILE_PATTERNS;
  const ignoreDirs = settings.ignoreDirPatterns || DEFAULT_IGNORE_DIR_PATTERNS;
  const results = [];

  async function walk(dir) {
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!matchesAnyPattern(entry.name, ignoreDirs)) await walk(fullPath);
      } else if (entry.isFile() && matchesAnyPattern(entry.name, patterns)) {
        const stat = await fs.promises.stat(fullPath);
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
        results.push({ name: relPath, path: fullPath, mtime: stat.mtimeMs });
      }
    }
  }

  await walk(dirPath);
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

async function readChecklist(filePath) {
  return fs.promises.readFile(filePath, 'utf8');
}

async function writeChecklist(filePath, content) {
  const tmpPath = filePath + '.tmp';
  await fs.promises.writeFile(tmpPath, content, 'utf8');
  await fs.promises.rename(tmpPath, filePath);
}

async function deleteChecklist(filePath) {
  await fs.promises.unlink(filePath);
}

async function renameChecklist(oldPath, newPath) {
  await fs.promises.rename(oldPath, newPath);
}

async function createChecklist(dirPath, name) {
  ensureDataDir(dirPath);
  const settings = readSettings();
  const patterns = settings.filePatterns || DEFAULT_FILE_PATTERNS;
  const defaultExt = settings.defaultExt || 'cl';
  const candidate = name + '.md';
  const filename = matchesAnyPattern(candidate, patterns) ? candidate : name + '.' + defaultExt + '.md';
  const filePath = path.join(dirPath, filename);
  const content = `# ${name}\n- [ ]  \n`;
  await writeChecklist(filePath, content);
  return filePath;
}

function getSetting(key, defaultValue) {
  const s = readSettings();
  return s[key] !== undefined ? s[key] : defaultValue;
}

function setSetting(key, value) {
  const s = readSettings();
  s[key] = value;
  writeSettings(s);
}

module.exports = {
  getDataDir,
  setDataDir,
  getDataDirs,
  addDataDir,
  removeDataDir,
  listChecklists,
  readChecklist,
  writeChecklist,
  deleteChecklist,
  renameChecklist,
  createChecklist,
  getSetting,
  setSetting,
};
