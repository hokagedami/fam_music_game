/**
 * Electron Bridge
 * Provides seamless detection and access to Electron APIs from the renderer
 * Falls back gracefully when running in a browser
 */

// Check if running in Electron
export const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

/**
 * Get the server URL (dynamic in Electron, origin in browser)
 * @returns {Promise<string>}
 */
export async function getServerUrl() {
  if (isElectron) {
    return await window.electronAPI.getServerUrl();
  }
  return window.location.origin;
}

/**
 * Get the LAN URL for other devices to connect (Electron only)
 * @returns {Promise<string|null>}
 */
export async function getLanUrl() {
  if (!isElectron) {
    return window.location.origin;
  }
  return await window.electronAPI.getLanUrl();
}

/**
 * Get the local IP address (Electron only)
 * @returns {Promise<string|null>}
 */
export async function getLocalIp() {
  if (!isElectron) {
    return null;
  }
  return await window.electronAPI.getLocalIp();
}

/**
 * Refresh LAN URL after network changes (e.g., hotspot started)
 * @returns {Promise<string|null>}
 */
export async function refreshLanUrl() {
  if (!isElectron) {
    return window.location.origin;
  }
  return await window.electronAPI.refreshLanUrl();
}

/**
 * Get all available network IPs (Electron only)
 * @returns {Promise<Array<{name: string, address: string, isHotspot: boolean}>>}
 */
export async function getAllNetworkIps() {
  if (!isElectron) {
    return [];
  }
  return await window.electronAPI.getAllNetworkIps();
}

/**
 * Open folder picker dialog (Electron only)
 * @returns {Promise<string|null>} Selected folder path or null
 */
export async function selectFolder() {
  if (!isElectron) {
    console.warn('selectFolder is only available in Electron');
    return null;
  }
  return await window.electronAPI.selectFolder();
}

/**
 * Scan a folder for music files (Electron only)
 * @param {string} folderPath - Path to scan
 * @returns {Promise<{success: boolean, songs?: Object[], error?: string}>}
 */
export async function scanMusicFolder(folderPath) {
  if (!isElectron) {
    return { success: false, error: 'Not running in Electron' };
  }
  return await window.electronAPI.scanFolder(folderPath);
}

/**
 * Subscribe to scan progress events (Electron only)
 * @param {Function} callback - Progress callback
 * @returns {Function} Unsubscribe function
 */
export function onScanProgress(callback) {
  if (!isElectron) {
    return () => {};
  }
  return window.electronAPI.onScanProgress(callback);
}

/**
 * Download and extract a zip file with music (Electron only)
 * @param {string} url - URL of the zip file
 * @returns {Promise<{success: boolean, songs?: Object[], error?: string}>}
 */
export async function downloadMusicZip(url) {
  if (!isElectron) {
    return { success: false, error: 'Not running in Electron' };
  }
  return await window.electronAPI.downloadZip(url);
}

/**
 * Subscribe to download progress events (Electron only)
 * @param {Function} callback - Progress callback
 * @returns {Function} Unsubscribe function
 */
export function onDownloadProgress(callback) {
  if (!isElectron) {
    return () => {};
  }
  return window.electronAPI.onDownloadProgress(callback);
}

/**
 * Get a setting value (Electron only)
 * @param {string} key - Setting key
 * @returns {Promise<*>}
 */
export async function getSetting(key) {
  if (!isElectron) {
    // Fall back to localStorage in browser
    try {
      return JSON.parse(localStorage.getItem(`setting_${key}`));
    } catch {
      return null;
    }
  }
  return await window.electronAPI.getSettings(key);
}

/**
 * Set a setting value (Electron only)
 * @param {string} key - Setting key
 * @param {*} value - Value to set
 * @returns {Promise<boolean>}
 */
export async function setSetting(key, value) {
  if (!isElectron) {
    // Fall back to localStorage in browser
    localStorage.setItem(`setting_${key}`, JSON.stringify(value));
    return true;
  }
  return await window.electronAPI.setSettings(key, value);
}

/**
 * Get all settings (Electron only)
 * @returns {Promise<Object>}
 */
export async function getAllSettings() {
  if (!isElectron) {
    return {};
  }
  return await window.electronAPI.getAllSettings();
}

/**
 * Get music library paths (Electron only)
 * @returns {Promise<string[]>}
 */
export async function getMusicLibraryPaths() {
  if (!isElectron) {
    return [];
  }
  return await window.electronAPI.getMusicLibraryPaths();
}

/**
 * Add a music library path (Electron only)
 * @param {string} path - Path to add
 * @returns {Promise<string[]>}
 */
export async function addMusicLibraryPath(path) {
  if (!isElectron) {
    return [];
  }
  return await window.electronAPI.addMusicLibraryPath(path);
}

/**
 * Remove a music library path (Electron only)
 * @param {string} path - Path to remove
 * @returns {Promise<string[]>}
 */
export async function removeMusicLibraryPath(path) {
  if (!isElectron) {
    return [];
  }
  return await window.electronAPI.removeMusicLibraryPath(path);
}

/**
 * Save a game result to history (Electron only, when persistence enabled)
 * @param {Object} result - Game result
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveGameResult(result) {
  if (!isElectron) {
    return { success: false, error: 'Not running in Electron' };
  }
  return await window.electronAPI.saveGameResult(result);
}

/**
 * Get game history (Electron only)
 * @returns {Promise<{success: boolean, history?: Object[], error?: string}>}
 */
export async function getGameHistory() {
  if (!isElectron) {
    return { success: false, history: [], error: 'Not running in Electron' };
  }
  return await window.electronAPI.getGameHistory();
}

/**
 * Clear game history (Electron only)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function clearGameHistory() {
  if (!isElectron) {
    return { success: false, error: 'Not running in Electron' };
  }
  return await window.electronAPI.clearGameHistory();
}

/**
 * Check for app updates (Electron only)
 * @returns {Promise<{checking: boolean}>}
 */
export async function checkForUpdates() {
  if (!isElectron) {
    return { checking: false };
  }
  return await window.electronAPI.checkForUpdates();
}

/**
 * Install pending update (Electron only)
 * @returns {Promise<{installing: boolean}>}
 */
export async function installUpdate() {
  if (!isElectron) {
    return { installing: false };
  }
  return await window.electronAPI.installUpdate();
}

/**
 * Subscribe to update events (Electron only)
 * @param {string} event - Event name ('available', 'downloaded', 'error', 'downloading')
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export function onUpdateEvent(event, callback) {
  if (!isElectron) {
    return () => {};
  }

  switch (event) {
    case 'available':
      return window.electronAPI.onUpdateAvailable(callback);
    case 'downloaded':
      return window.electronAPI.onUpdateDownloaded(callback);
    case 'error':
      return window.electronAPI.onUpdateError(callback);
    case 'downloading':
      return window.electronAPI.onDownloadingUpdate(callback);
    default:
      return () => {};
  }
}

/**
 * Get app version (Electron only)
 * @returns {Promise<string>}
 */
export async function getAppVersion() {
  if (!isElectron) {
    return 'web';
  }
  return await window.electronAPI.getAppVersion();
}

/**
 * Get platform
 * @returns {string}
 */
export function getPlatform() {
  if (isElectron) {
    return window.electronAPI.getPlatform();
  }
  return 'web';
}

/**
 * Open a path in the system file explorer (Electron only)
 * @param {string} path - Path to open
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openPath(path) {
  if (!isElectron) {
    return { success: false, error: 'Not running in Electron' };
  }
  return await window.electronAPI.openPath(path);
}

/**
 * Show item in folder (Electron only)
 * @param {string} path - Path to item
 * @returns {Promise<{success: boolean}>}
 */
export async function showItemInFolder(path) {
  if (!isElectron) {
    return { success: false };
  }
  return await window.electronAPI.showItemInFolder(path);
}

/**
 * Get the local music downloads path (Electron only)
 * @returns {Promise<string|null>}
 */
export async function getLocalMusicPath() {
  if (!isElectron) {
    return null;
  }
  return await window.electronAPI.getLocalMusicPath();
}

/**
 * Get server mode settings (Electron only)
 * @returns {Promise<{mode: string, remoteUrl: string, currentUrl: string}>}
 */
export async function getServerMode() {
  if (!isElectron) {
    return { mode: 'web', remoteUrl: '', currentUrl: window.location.origin };
  }
  return await window.electronAPI.getServerMode();
}

/**
 * Set server mode (Electron only)
 * @param {string} mode - 'local' or 'remote'
 * @param {string} remoteUrl - Remote server URL (when mode is 'remote')
 * @returns {Promise<{success: boolean, restartRequired: boolean}>}
 */
export async function setServerMode(mode, remoteUrl) {
  if (!isElectron) {
    return { success: false, restartRequired: false };
  }
  return await window.electronAPI.setServerMode(mode, remoteUrl);
}

/**
 * Restart the app (Electron only)
 */
export async function restartApp() {
  if (!isElectron) {
    window.location.reload();
    return;
  }
  return await window.electronAPI.restartApp();
}

/**
 * Check if hotspot feature is available (Electron only)
 * @returns {Promise<{available: boolean, reason?: string}>}
 */
export async function hotspotCheckAvailability() {
  if (!isElectron) {
    return { available: false, reason: 'Not running in Electron' };
  }
  return await window.electronAPI.hotspotCheckAvailability();
}

/**
 * Start WiFi hotspot (Electron only)
 * @param {string} ssid - Network name
 * @param {string} password - Network password
 * @returns {Promise<{success: boolean, error?: string, ssid?: string, password?: string}>}
 */
export async function hotspotStart(ssid, password) {
  if (!isElectron) {
    return { success: false, error: 'Not running in Electron' };
  }
  return await window.electronAPI.hotspotStart(ssid, password);
}

/**
 * Stop WiFi hotspot (Electron only)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function hotspotStop() {
  if (!isElectron) {
    return { success: false, error: 'Not running in Electron' };
  }
  return await window.electronAPI.hotspotStop();
}

/**
 * Get hotspot status (Electron only)
 * @returns {Promise<{isRunning: boolean, ssid: string, password: string}>}
 */
export async function hotspotStatus() {
  if (!isElectron) {
    return { isRunning: false, ssid: '', password: '' };
  }
  return await window.electronAPI.hotspotStatus();
}

// Export convenience object
export const electronBridge = {
  isElectron,
  getServerUrl,
  getLanUrl,
  getLocalIp,
  refreshLanUrl,
  getAllNetworkIps,
  selectFolder,
  scanMusicFolder,
  onScanProgress,
  downloadMusicZip,
  onDownloadProgress,
  getSetting,
  setSetting,
  getAllSettings,
  getMusicLibraryPaths,
  addMusicLibraryPath,
  removeMusicLibraryPath,
  saveGameResult,
  getGameHistory,
  clearGameHistory,
  checkForUpdates,
  installUpdate,
  onUpdateEvent,
  getAppVersion,
  getPlatform,
  openPath,
  showItemInFolder,
  getLocalMusicPath,
  getServerMode,
  setServerMode,
  restartApp,
  hotspotCheckAvailability,
  hotspotStart,
  hotspotStop,
  hotspotStatus,
};

export default electronBridge;
