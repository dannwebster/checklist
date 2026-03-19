const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('checklistAPI', {
  getDataDir: () => ipcRenderer.invoke('app:get-data-dir'),
  setDataDir: () => ipcRenderer.invoke('app:set-data-dir'),
  getDataDirs: () => ipcRenderer.invoke('app:get-data-dirs'),
  addDataDir: () => ipcRenderer.invoke('app:add-data-dir'),
  removeDataDir: (dir) => ipcRenderer.invoke('app:remove-data-dir', dir),

  list: (dirPath) => ipcRenderer.invoke('checklist:list', dirPath),
  read: (filePath) => ipcRenderer.invoke('checklist:read', filePath),
  write: (filePath, content) => ipcRenderer.invoke('checklist:write', filePath, content),
  delete: (filePath) => ipcRenderer.invoke('checklist:delete', filePath),
  rename: (oldPath, newName) => ipcRenderer.invoke('checklist:rename', oldPath, newName),
  create: (dirPath, name) => ipcRenderer.invoke('checklist:create', dirPath, name),

  showConfirm: (message) => ipcRenderer.invoke('app:show-confirm', message),

  onMenuNewChecklist: (cb) => ipcRenderer.on('menu:new-checklist', cb),
  onMenuOpenFolder: (cb) => ipcRenderer.on('menu:open-folder', cb),
});
