const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('osirisAPI', {
  version: '1.0.5',
  platform: process.platform,
  /* Where the platform's integration dispatcher lives. The desktop app
     reads the tool registry from there rather than keeping its own copy,
     so the manifest and the capability allowlist are the platform's.
     The value comes from the main process: a sandboxed renderer's
     process.env is not the deployment's environment. */
  getPlatformUrl: () => ipcRenderer.invoke('get-platform-url'),
  /* The session. The token is held in the main process and never crosses
     into the renderer: a page is a place where a script can read what
     the page holds, so what the page holds is nothing. These calls ask
     the main process to do the work. */
  signIn: (email, password) => ipcRenderer.invoke('platform-signin', { email, password }),
  signOut: () => ipcRenderer.invoke('platform-signout'),
  getSession: () => ipcRenderer.invoke('platform-session'),
  getRegistry: () => ipcRenderer.invoke('platform-registry'),
  execute: (toolId, capability, body) => ipcRenderer.invoke('platform-execute', { toolId, capability, body }),
  setPlatformUrl: (url) => ipcRenderer.invoke('platform-set-url', { url }),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (_, action) => callback(action)),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showSettings: () => ipcRenderer.invoke('show-settings'),
  checkForUpdates: () => ipcRenderer.invoke('check-updates'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
});

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('minimize-window'),
  close: () => ipcRenderer.send('close-window'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, data) => callback(data)),
  onSystemInfo: (callback) => ipcRenderer.on('system-info', (_, info) => callback(info)),
});