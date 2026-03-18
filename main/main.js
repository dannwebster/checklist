const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { registerHandlers } = require('./ipc-handlers');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Checklist',
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Checklist',
          accelerator: 'CmdOrCtrl+N',
          click() { mainWindow.webContents.send('menu:new-checklist'); },
        },
        {
          label: 'Open Folder...',
          click() { mainWindow.webContents.send('menu:open-folder'); },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  registerHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
