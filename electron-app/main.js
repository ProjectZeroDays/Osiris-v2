const { app, BrowserWindow, Menu, nativeImage, Tray, Notification, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const platform = require('./platform');

let mainWindow = null;
let settingsWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'public', 'icon.ico'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    new Notification({ title: 'Osiris Ready', body: 'Native Electron app launched successfully.' }).show();
  });

  const template = [
    {
      label: 'Osiris',
      submenu: [
        { role: 'about', label: 'About Osiris' },
        { type: 'separator' },
        { label: 'Settings', click: () => createSettingsWindow() },
        { type: 'separator' },
        { role: 'hide', label: 'Hide', accelerator: 'CmdOrCtrl+H' },
        { role: 'quit', label: 'Quit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload', label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools', label: 'Toggle Dev Tools', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual Size', accelerator: 'CmdOrCtrl+0' },
        { role: 'zoomIn', label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus' },
        { role: 'zoomOut', label: 'Zoom Out', accelerator: 'CmdOrCtrl+Minus' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Fullscreen', accelerator: 'F11' },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Open DevTools', click: () => mainWindow?.webContents.toggleDevTools() },
        { label: 'Open Osiris Web App', click: () => shell.openExternal('https://osiris.app') },
        { label: 'Open GitHub', click: () => shell.openExternal('https://github.com/osiris') },
        { type: 'separator' },
        { label: 'Check for Updates', click: () => checkForUpdates() },
        { label: 'System Info', click: () => showSystemInfo() },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', label: 'Minimize', accelerator: 'CmdOrCtrl+M' },
        { role: 'close', label: 'Close', accelerator: 'CmdOrCtrl+W' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://docs.osiris.app') },
        { label: 'Report Issue', click: () => shell.openExternal('https://github.com/osiris/issues') },
        { label: 'About', click: () => showAbout() },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'public', 'icon.ico'));
  const tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Osiris v1.0.2');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Open Web App', click: () => shell.openExternal('https://osiris.app') },
    { type: 'separator' },
    { label: 'Settings', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quitting = true; app.quit(); } },
  ]));

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('close', (e) => {
    if (!app.quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 450,
    minWidth: 450,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117',
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'public', 'icon.ico'),
  });

  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));

  settingsWindow.once('ready-to-show', () => settingsWindow.show());

  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function checkForUpdates() {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'checking', message: 'Checking for updates...' });
  }
  // Simulate update check
  setTimeout(() => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'no-update', message: 'You are on the latest version (1.0.2).' });
      new Notification({ title: 'Osiris Update', body: 'You are on the latest version.' }).show();
    }
  }, 2000);
}

function showSystemInfo() {
  const info = {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10} GB`,
    uptime: formatUptime(os.uptime()),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    appVersion: '1.0.2',
  };

  if (mainWindow) {
    mainWindow.webContents.send('system-info', info);
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Osiris',
    message: 'Osiris v1.0.2',
    detail: 'Native Windows Application\nBuilt with Electron, Node.js, and modern web technologies.\n\n© 2026 Osiris Project',
    buttons: ['OK'],
  });
}

ipcMain.handle('get-platform-url', async () => {
  /* Where the platform's integration dispatcher lives. The desktop app
     reads the tool registry from there rather than keeping its own copy,
     so the manifest, the capability allowlist and the audit trail are
     the platform's and not a second implementation of them. */
  return platform.platformUrl;
});

/* The platform's session. The token is held in the main process and the
   renderer never sees it, so a script that finds its way into the page
   cannot take the session with it. */
ipcMain.handle('platform-signin', async (_, { email, password }) => {
  try {
    return await platform.signIn(String(email || ''), String(password || ''));
  } catch (e) {
    return { ok: false, error: 'PLATFORM_UNREACHABLE', detail: e.message };
  }
});

ipcMain.handle('platform-signout', async () => {
  try {
    return await platform.signOut();
  } catch (e) {
    return { ok: false, error: 'SIGN_OUT_FAILED', detail: e.message };
  }
});

ipcMain.handle('platform-session', async () => {
  return platform.session();
});

ipcMain.handle('platform-registry', async () => {
  return platform.registry();
});

ipcMain.handle('platform-execute', async (_, { toolId, capability, body }) => {
  return platform.execute(toolId, capability, body);
});

ipcMain.handle('platform-set-url', async (_, { url }) => {
  return platform.setPlatformUrl(url);
});

ipcMain.handle('open-external', async (_, url) => {
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('show-settings', async () => {
  createSettingsWindow();
  return { success: true };
});

ipcMain.handle('check-updates', async () => {
  checkForUpdates();
  return { success: true };
});

ipcMain.handle('get-system-info', async () => {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10} GB`,
    uptime: formatUptime(os.uptime()),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    appVersion: '1.0.2',
  };
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

app.whenReady().then(() => {
  /* The stored session is read once the app is ready, because that is
     when the operating system's credential store is reachable. */
  platform.load();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => { app.quitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});