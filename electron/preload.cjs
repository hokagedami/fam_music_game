/**
 * Electron preload — minimal renderer ↔ main bridge.
 *
 * Hardening notes:
 *  - sandbox is enabled on the BrowserWindow, so this preload runs in a
 *    constrained renderer-with-Node context. We must not require modules
 *    other than 'electron'.
 *  - Every channel exposed to the renderer is on a fixed allowlist; the
 *    renderer cannot pick its own ipcRenderer channel name.
 *  - Inputs are shape-checked here so a compromised renderer can't crash
 *    main with a malformed payload — main does its own validation too.
 */

const { contextBridge, ipcRenderer } = require('electron');

// =========================================================================
// Helpers — pure, no side effects.
// =========================================================================

const isStr = (v, max = 4096) => typeof v === 'string' && v.length <= max;
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Channels the renderer is allowed to *receive* on. We register listeners
// only for these and strip the underlying IpcRendererEvent before invoking
// the renderer's callback so the sender id can't leak.
const RECV_CHANNELS = new Set([
  'scan-progress',
  'download-progress',
  'update-available',
  'update-downloaded',
  'update-error',
  'downloading-update',
]);

function on(channel, callback) {
  if (!RECV_CHANNELS.has(channel)) {
    throw new Error(`preload: refusing listener on disallowed channel: ${channel}`);
  }
  if (typeof callback !== 'function') return () => {};
  const wrapped = (_event, data) => {
    try {
      callback(data);
    } catch (err) {
      // Swallow renderer-side errors — the main process should not be
      // affected by callback exceptions.
      console.error(`preload: callback for ${channel} threw`, err);
    }
  };
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

// =========================================================================
// API surface — flat allowlist mapped to ipcRenderer.invoke channels.
// Each function validates its arguments before forwarding.
// =========================================================================

const electronAPI = {
  // Server URL & mode -----------------------------------------------------
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  getLanUrl: () => ipcRenderer.invoke('get-lan-url'),
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  refreshLanUrl: () => ipcRenderer.invoke('refresh-lan-url'),
  getAllNetworkIps: () => ipcRenderer.invoke('get-all-network-ips'),

  getServerMode: () => ipcRenderer.invoke('get-server-mode'),
  setServerMode: (mode) => {
    if (mode !== 'local' && mode !== 'remote') {
      return Promise.reject(new Error('mode must be "local" or "remote"'));
    }
    return ipcRenderer.invoke('set-server-mode', mode);
  },
  setLanExposed: (exposed) =>
    ipcRenderer.invoke('set-lan-exposed', Boolean(exposed)),
  checkRemoteServer: () => ipcRenderer.invoke('check-remote-server'),
  restartApp: () => ipcRenderer.invoke('restart-app'),

  // File / folder pickers (main shows the dialog; renderer cannot pick
  // arbitrary filesystem paths directly).
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // Music scanning --------------------------------------------------------
  scanFolder: (folderPath) => {
    if (!isStr(folderPath, 1024)) {
      return Promise.reject(new Error('folderPath must be a string'));
    }
    return ipcRenderer.invoke('scan-folder', folderPath);
  },
  onScanProgress: (cb) => on('scan-progress', cb),

  // Zip download ----------------------------------------------------------
  downloadZip: (url) => {
    if (!isStr(url, 2048)) {
      return Promise.reject(new Error('url must be a string'));
    }
    return ipcRenderer.invoke('download-zip', url);
  },
  onDownloadProgress: (cb) => on('download-progress', cb),

  // Settings — only string keys, sanitised in main too.
  getSettings: (key) => {
    if (key !== undefined && !isStr(key, 128)) {
      return Promise.reject(new Error('key must be a string'));
    }
    return ipcRenderer.invoke('get-settings', key);
  },
  setSettings: (key, value) => {
    if (!isStr(key, 128)) {
      return Promise.reject(new Error('key must be a string'));
    }
    return ipcRenderer.invoke('set-settings', key, value);
  },
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),

  // Music library paths ---------------------------------------------------
  getMusicLibraryPaths: () => ipcRenderer.invoke('get-music-library-paths'),
  addMusicLibraryPath: (p) => {
    if (!isStr(p, 1024)) {
      return Promise.reject(new Error('path must be a string'));
    }
    return ipcRenderer.invoke('add-music-library-path', p);
  },
  removeMusicLibraryPath: (p) => {
    if (!isStr(p, 1024)) {
      return Promise.reject(new Error('path must be a string'));
    }
    return ipcRenderer.invoke('remove-music-library-path', p);
  },

  // Game history (when persistence is enabled) ----------------------------
  saveGameResult: (result) => {
    if (!isObj(result)) {
      return Promise.reject(new Error('result must be an object'));
    }
    return ipcRenderer.invoke('save-game-result', result);
  },
  getGameHistory: () => ipcRenderer.invoke('get-game-history'),
  clearGameHistory: () => ipcRenderer.invoke('clear-game-history'),

  // Auto-updates ----------------------------------------------------------
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (cb) => on('update-available', cb),
  onUpdateDownloaded: (cb) => on('update-downloaded', cb),
  onUpdateError: (cb) => on('update-error', cb),
  onDownloadingUpdate: (cb) => on('downloading-update', cb),

  // App info --------------------------------------------------------------
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // File operations — main rejects paths outside allowed roots.
  getLocalMusicPath: () => ipcRenderer.invoke('get-local-music-path'),
  openPath: (p) => {
    if (!isStr(p, 1024)) {
      return Promise.reject(new Error('path must be a string'));
    }
    return ipcRenderer.invoke('open-path', p);
  },
  showItemInFolder: (p) => {
    if (!isStr(p, 1024)) {
      return Promise.reject(new Error('path must be a string'));
    }
    return ipcRenderer.invoke('show-item-in-folder', p);
  },

  // Hotspot — kept under feature-flag because shell exec is heavy.
  hotspotCheckAvailability: () => ipcRenderer.invoke('hotspot-check-availability'),
  hotspotStart: (ssid, password) => {
    if (!isStr(ssid, 32) || !isStr(password, 64)) {
      return Promise.reject(new Error('ssid and password must be strings'));
    }
    return ipcRenderer.invoke('hotspot-start', ssid, password);
  },
  hotspotStop: () => ipcRenderer.invoke('hotspot-stop'),
  hotspotStatus: () => ipcRenderer.invoke('hotspot-status'),

  // Platform info — read-only properties, not functions.
  getPlatform: () => process.platform,
  isElectron: true,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// =========================================================================
// Set is-electron class as soon as the body exists.
// =========================================================================

function addElectronClass() {
  if (!document.body) return;
  document.body.classList.add('is-electron');
  document
    .querySelectorAll('.desktop-only:not(#update-banner)')
    .forEach((el) => el.classList.remove('hidden'));
}

if (document.body) {
  addElectronClass();
}
document.addEventListener('DOMContentLoaded', addElectronClass);
window.addEventListener('load', addElectronClass);

if (document.documentElement) {
  const observer = new MutationObserver((_m, obs) => {
    if (document.body) {
      addElectronClass();
      obs.disconnect();
    }
  });
  observer.observe(document.documentElement, { childList: true });
}
