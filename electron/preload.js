/**
 * Electron Preload Script
 * Exposes IPC APIs to the renderer process securely
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose electronAPI to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Server URL
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),

  // Folder selection
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // Music scanning
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  onScanProgress: (callback) => {
    ipcRenderer.on('scan-progress', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('scan-progress');
  },

  // Zip download
  downloadZip: (url) => ipcRenderer.invoke('download-zip', url),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('download-progress');
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (key, value) => ipcRenderer.invoke('set-settings', key, value),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),

  // Music library paths
  getMusicLibraryPaths: () => ipcRenderer.invoke('get-music-library-paths'),
  addMusicLibraryPath: (path) => ipcRenderer.invoke('add-music-library-path', path),
  removeMusicLibraryPath: (path) => ipcRenderer.invoke('remove-music-library-path', path),

  // Game history (when persistence is enabled)
  saveGameResult: (result) => ipcRenderer.invoke('save-game-result', result),
  getGameHistory: () => ipcRenderer.invoke('get-game-history'),
  clearGameHistory: () => ipcRenderer.invoke('clear-game-history'),

  // Auto-updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-available');
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-downloaded');
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-error');
  },
  onDownloadingUpdate: (callback) => {
    ipcRenderer.on('downloading-update', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('downloading-update');
  },

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // File operations
  getLocalMusicPath: () => ipcRenderer.invoke('get-local-music-path'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),

  // Platform info
  getPlatform: () => process.platform,
  isElectron: true,
});

// Log that preload script loaded
console.log('Electron preload script loaded');
