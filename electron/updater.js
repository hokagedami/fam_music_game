/**
 * Auto-Update Service
 * Manages automatic updates via electron-updater with GitHub Releases
 */

import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { app } from 'electron';
import { settings } from './services/settings.js';

let mainWindow = null;

/**
 * Setup auto-updater with event handlers
 * @param {Electron.BrowserWindow} window - Main window instance
 */
export function setupAutoUpdater(window) {
  mainWindow = window;

  // Check if updates should be checked on startup
  const checkOnStartup = settings.get('checkUpdatesOnStartup', true);

  // Configure auto-updater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Set up event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    sendToRenderer('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('No update available. Current version:', app.getVersion());
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
    sendToRenderer('downloading-update', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    sendToRenderer('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
    sendToRenderer('update-error', {
      message: error.message || 'Unknown error',
    });
  });

  // Check for updates on startup (with delay)
  if (checkOnStartup) {
    setTimeout(() => {
      checkForUpdates();
    }, 10000); // 10 second delay
  }
}

/**
 * Send message to renderer process
 * @param {string} channel - IPC channel
 * @param {Object} data - Data to send
 */
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Check for updates manually
 * @returns {Promise}
 */
export async function checkForUpdates() {
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (error) {
    console.error('Failed to check for updates:', error);
    throw error;
  }
}

/**
 * Download and install update
 * Quits the app and installs the update
 */
export function installUpdate() {
  autoUpdater.quitAndInstall(false, true);
}

/**
 * Get current app version
 * @returns {string}
 */
export function getVersion() {
  return app.getVersion();
}

export default {
  setupAutoUpdater,
  checkForUpdates,
  installUpdate,
  getVersion,
};
