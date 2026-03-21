const { ipcMain, dialog } = require('electron');
const path = require('path');
const fm = require('./file-manager');
const watcher = require('./watcher');
const git = require('./git-manager');

function registerHandlers() {
  ipcMain.handle('app:get-data-dir', () => fm.getDataDir());

  ipcMain.handle('app:set-data-dir', async (event) => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Punchcard Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const dirPath = result.filePaths[0];
    fm.setDataDir(dirPath);
    return dirPath;
  });

  ipcMain.handle('app:get-data-dirs', () => fm.getDataDirs());

  ipcMain.handle('app:add-data-dir', async (event) => {
    const result = await dialog.showOpenDialog({
      title: 'Add Punchcard Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const updated = fm.addDataDir(result.filePaths[0]);
    watcher.setWatchedDirs(updated);
    return updated;
  });

  ipcMain.handle('app:remove-data-dir', (event, dirPath) => {
    const updated = fm.removeDataDir(dirPath);
    watcher.setWatchedDirs(updated);
    return updated;
  });

  ipcMain.handle('checklist:list', (event, dirPath) => {
    return fm.listChecklists(dirPath);
  });

  ipcMain.handle('checklist:read', (event, filePath) => {
    return fm.readChecklist(filePath);
  });

  ipcMain.handle('checklist:write', (event, filePath, content) => {
    watcher.markOwnWrite(filePath);
    fm.writeChecklist(filePath, content);
  });

  ipcMain.handle('checklist:delete', (event, filePath) => {
    fm.deleteChecklist(filePath);
  });

  ipcMain.handle('checklist:rename', (event, oldPath, newName) => {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName + '.md');
    fm.renameChecklist(oldPath, newPath);
    return newPath;
  });

  ipcMain.handle('checklist:create', (event, dirPath, name) => {
    return fm.createChecklist(dirPath, name);
  });

  ipcMain.handle('app:show-confirm', (event, message) => {
    const result = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      message,
    });
    return result === 1;
  });

  ipcMain.handle('git:status', (_, filePath) => git.getGitStatus(filePath));
  ipcMain.handle('git:commit', (_, filePath) => git.gitCommit(filePath));
}

module.exports = { registerHandlers };
