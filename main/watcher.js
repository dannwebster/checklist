const fs = require('fs');
const path = require('path');

let mainWin = null;
const watchers = new Map();       // dirPath -> FSWatcher
const ownWrites = new Set();      // paths we wrote ourselves
const dirTimers = new Map();      // dirPath -> debounce timer

function setMainWindow(win) { mainWin = win; }

function markOwnWrite(filePath) {
  ownWrites.add(filePath);
  setTimeout(() => ownWrites.delete(filePath), 1000);
}

function watchDir(dirPath) {
  if (watchers.has(dirPath)) return;
  try {
    const w = fs.watch(dirPath, { recursive: true }, (event, filename) => {
      if (!filename || !mainWin) return;
      const fullPath = path.join(dirPath, filename);
      if (ownWrites.has(fullPath)) return;

      if (event === 'rename') {
        clearTimeout(dirTimers.get(dirPath));
        dirTimers.set(dirPath, setTimeout(() => {
          mainWin.webContents.send('watcher:dir-changed');
        }, 200));
      } else if (event === 'change') {
        mainWin.webContents.send('watcher:file-changed', fullPath);
      }
    });
    watchers.set(dirPath, w);
  } catch (_) { /* dir may not exist yet */ }
}

function unwatchDir(dirPath) {
  const w = watchers.get(dirPath);
  if (w) { w.close(); watchers.delete(dirPath); }
  clearTimeout(dirTimers.get(dirPath));
  dirTimers.delete(dirPath);
}

function setWatchedDirs(dirs) {
  for (const dir of [...watchers.keys()]) {
    if (!dirs.includes(dir)) unwatchDir(dir);
  }
  for (const dir of dirs) watchDir(dir);
}

module.exports = { setMainWindow, markOwnWrite, setWatchedDirs };
