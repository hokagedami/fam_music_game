/**
 * Auto-updater. electron-updater verifies code signatures by default on
 * Windows (Authenticode) and macOS (codesign + notarisation); on Linux it
 * verifies SHA512 against the YAML manifest signed at build time. We rely on
 * those — they're more robust than anything we could roll here.
 *
 * Hardening notes:
 *  - autoDownload disabled. We surface the update to the renderer first, let
 *    the user opt in, and only then call downloadUpdate(). This avoids
 *    silent traffic + storage cost users didn't ask for.
 *  - autoInstallOnAppQuit also disabled — the user explicitly clicks
 *    "install now" via the IPC handler.
 *  - Refuses to run in dev / when the app is unpackaged. electron-updater
 *    will refuse anyway, but the early return removes a noisy stack trace.
 *  - Logs "downgrade detected" if the remote version is older than ours and
 *    drops the update — defends against rollback attacks.
 */

import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { app } from 'electron';
import { settings } from './services/settings.js';

let mainWindow = null;
let updateDownloaded = false;
let availableInfo = null;

function isProdPackaged() {
  return app.isPackaged && process.env.NODE_ENV !== 'development';
}

function semverGreater(a, b) {
  // Naïve but good enough — electron-updater versions are semver triples.
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

export function setupAutoUpdater(window) {
  mainWindow = window;

  if (!isProdPackaged()) {
    console.log('Auto-updater disabled: app is not packaged for production.');
    return;
  }

  // We trigger downloads explicitly. quitAndInstall is also explicit.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false; // refuse rollback attacks

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking for updates');
  });

  autoUpdater.on('update-available', (info) => {
    if (!info?.version) return;
    if (!semverGreater(info.version, app.getVersion())) {
      console.warn(
        `[updater] refusing update — remote version ${info.version} is not newer than ${app.getVersion()}`
      );
      return;
    }
    availableInfo = info;
    sendToRenderer('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] no update available; current version', app.getVersion());
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('downloading-update', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    sendToRenderer('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('[updater] error:', error);
    sendToRenderer('update-error', {
      message: error?.message || 'Unknown error',
    });
  });

  if (settings.get('checkUpdatesOnStartup', true)) {
    setTimeout(() => {
      checkForUpdates().catch((err) =>
        console.error('[updater] startup check failed:', err.message)
      );
    }, 10000);
  }
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

export async function checkForUpdates() {
  if (!isProdPackaged()) return null;
  return autoUpdater.checkForUpdates();
}

/**
 * Two-phase install: if we already received update-downloaded, quitAndInstall.
 * Otherwise kick off the download (which the user has now opted into) and
 * resolve the promise as soon as the download starts; the renderer will get
 * progress events and can call install-update again to actually install.
 */
export function installUpdate() {
  if (!isProdPackaged()) {
    return { success: false, error: 'Updates are disabled in development' };
  }
  if (!updateDownloaded) {
    if (!availableInfo) {
      return { success: false, error: 'No update available to install' };
    }
    autoUpdater
      .downloadUpdate()
      .catch((err) =>
        sendToRenderer('update-error', { message: err?.message || 'download failed' })
      );
    return { success: false, downloading: true };
  }
  // isForceRunAfter=true on Windows so the app restarts after install.
  autoUpdater.quitAndInstall(false, true);
  return { success: true };
}

export function getVersion() {
  return app.getVersion();
}

export default {
  setupAutoUpdater,
  checkForUpdates,
  installUpdate,
  getVersion,
};
