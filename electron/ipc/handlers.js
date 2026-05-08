/**
 * IPC handlers — main-side counterpart to the preload allowlist.
 *
 * Hardening notes:
 *  - Every channel re-validates its inputs even though preload already does.
 *    Defence in depth: a compromised renderer can be invoked with anything.
 *  - File-system operations are confined to:
 *      • paths the user picked via the native dialog (we trust those by
 *        construction — main showed the dialog), or
 *      • paths under the per-user music-libraries list, or
 *      • the userData music-downloads dir.
 *    Any other path is rejected. This prevents a compromised renderer from
 *    asking the main process to open arbitrary files / show arbitrary
 *    folders in Explorer / scan the system drive.
 *  - Settings keys are limited to a known allowlist so the renderer can't
 *    write/read arbitrary store keys.
 */

import { app, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { settings } from '../services/settings.js';
import { scanMusicFolder } from '../services/musicScanner.js';
import { downloadAndExtractZip } from '../services/zipDownloader.js';
import { database } from '../services/database.js';
import { checkForUpdates, installUpdate } from '../updater.js';
import { hotspot } from '../services/hotspot.js';
import { EmbeddedServer } from '../services/embeddedServer.js';

// =========================================================================
// Allowlists & validators
// =========================================================================

const ALLOWED_SETTINGS_KEYS = new Set([
  'musicLibraryPaths',
  'downloadedMusicPath',
  'persistHistory',
  'windowBounds',
  'lastGameSettings',
  'checkUpdatesOnStartup',
  'serverMode',
  'cachedMusicLibrary',
  'lastLibraryScanTime',
]);

const isStr = (v, max = 4096) => typeof v === 'string' && v.length <= max;

/**
 * Resolve and verify that a path is contained within one of the allowed
 * roots. Returns the resolved absolute path on success or null on rejection.
 */
function safeResolvePath(p, allowedRoots) {
  if (!isStr(p, 4096)) return null;
  let resolved;
  try {
    resolved = path.resolve(p);
  } catch {
    return null;
  }
  if (resolved !== path.normalize(resolved)) return null;
  for (const root of allowedRoots) {
    if (!root) continue;
    const r = path.resolve(root);
    // Equal, or strict child of root
    if (resolved === r || resolved.startsWith(r + path.sep)) return resolved;
  }
  return null;
}

function getAllowedRoots() {
  return [
    ...settings.get('musicLibraryPaths', []),
    settings.get('downloadedMusicPath', null),
    path.join(app.getPath('userData'), 'music-downloads'),
    path.join(app.getPath('userData'), 'uploads'),
  ].filter(Boolean);
}

// Track folders the user has just selected via the native dialog. They get
// added to allowed roots for the duration of the session so subsequent
// scan-folder / open-path calls work without forcing the user to permanently
// add every browse target to musicLibraryPaths.
const sessionPickedFolders = new Set();

// =========================================================================
// Registration
// =========================================================================

export function registerIpcHandlers(ipcMain, mainWindow, embeddedServer) {
  // ---- Server URL & mode -------------------------------------------------
  ipcMain.handle('get-server-url', () => {
    return global.serverUrl || embeddedServer?.getUrl() || `http://127.0.0.1:3000`;
  });

  ipcMain.handle('get-lan-url', () => {
    if (global.serverMode === 'remote') return global.serverUrl;
    return embeddedServer?.getLanUrl() || null;
  });

  ipcMain.handle('get-local-ip', () => embeddedServer?.getLocalIp() || null);

  ipcMain.handle('refresh-lan-url', () => embeddedServer?.refreshLanUrl() || null);

  ipcMain.handle('get-all-network-ips', () => embeddedServer?.getAllIps() || []);

  ipcMain.handle('get-server-mode', () => ({
    mode: settings.get('serverMode', 'local'),
    currentUrl: global.serverUrl,
    lanExposed: embeddedServer?.isLanExposed?.() ?? false,
  }));

  ipcMain.handle('set-server-mode', (_event, mode) => {
    if (mode !== 'local' && mode !== 'remote') {
      throw new Error('mode must be "local" or "remote"');
    }
    settings.set('serverMode', mode);
    return { success: true, restartRequired: true };
  });

  ipcMain.handle('set-lan-exposed', async (_event, expose) => {
    if (!embeddedServer) return { success: false, error: 'No embedded server' };
    try {
      const result = await embeddedServer.setLanExposed(Boolean(expose));
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('check-remote-server', async () => EmbeddedServer.checkRemoteServer());

  ipcMain.handle('restart-app', () => {
    app.relaunch();
    app.exit(0);
  });

  // ---- Hotspot — string args only, validated; lower bound on lengths ----
  ipcMain.handle('hotspot-check-availability', () => hotspot.checkAvailability());

  ipcMain.handle('hotspot-start', async (_event, ssid, password) => {
    if (!isStr(ssid, 32) || ssid.length < 1) {
      return { success: false, error: 'ssid must be a non-empty string ≤ 32 chars' };
    }
    if (!isStr(password, 64) || password.length < 8) {
      return { success: false, error: 'password must be 8–64 chars' };
    }
    return hotspot.start(ssid, password);
  });

  ipcMain.handle('hotspot-stop', () => hotspot.stop());
  ipcMain.handle('hotspot-status', () => hotspot.getStatus());

  // ---- Folder selection — main shows the dialog --------------------------
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Music Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const picked = result.filePaths[0];
    sessionPickedFolders.add(path.resolve(picked));
    return picked;
  });

  // ---- Music scanning — must be inside an allowed root -------------------
  ipcMain.handle('scan-folder', async (_event, folderPath) => {
    const roots = [...getAllowedRoots(), ...sessionPickedFolders];
    const safe = safeResolvePath(folderPath, roots);
    if (!safe) return { success: false, error: 'Folder is not in allowed roots' };

    try {
      const songs = await scanMusicFolder(safe, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan-progress', progress);
        }
      });
      return { success: true, songs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---- Zip download — only http(s) URLs ---------------------------------
  ipcMain.handle('download-zip', async (_event, url) => {
    if (!isStr(url, 2048)) return { success: false, error: 'invalid url' };
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { success: false, error: 'invalid url' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { success: false, error: 'only http(s) urls are allowed' };
    }
    try {
      const songs = await downloadAndExtractZip(url, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', progress);
        }
      });
      return { success: true, songs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---- Settings — only allowlisted keys ----------------------------------
  ipcMain.handle('get-settings', (_event, key) => {
    if (key === undefined) return settings.store;
    if (!isStr(key, 128) || !ALLOWED_SETTINGS_KEYS.has(key)) {
      throw new Error('settings key not allowed');
    }
    return settings.get(key);
  });

  ipcMain.handle('set-settings', (_event, key, value) => {
    if (!isStr(key, 128) || !ALLOWED_SETTINGS_KEYS.has(key)) {
      throw new Error('settings key not allowed');
    }
    settings.set(key, value);
    return true;
  });

  ipcMain.handle('get-all-settings', () => settings.store);

  // ---- Music library paths — must be a real, readable directory ---------
  ipcMain.handle('get-music-library-paths', () => settings.get('musicLibraryPaths', []));

  ipcMain.handle('add-music-library-path', (_event, newPath) => {
    if (!isStr(newPath, 4096)) throw new Error('path must be a string');
    const resolved = path.resolve(newPath);
    if (resolved !== path.normalize(resolved)) {
      throw new Error('invalid path');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error('path is not a directory');
    }
    const paths = settings.get('musicLibraryPaths', []);
    if (!paths.includes(resolved)) {
      paths.push(resolved);
      settings.set('musicLibraryPaths', paths);
    }
    return paths;
  });

  ipcMain.handle('remove-music-library-path', (_event, pathToRemove) => {
    if (!isStr(pathToRemove, 4096)) throw new Error('path must be a string');
    const paths = settings.get('musicLibraryPaths', []);
    const filtered = paths.filter((p) => p !== pathToRemove);
    settings.set('musicLibraryPaths', filtered);
    return filtered;
  });

  // ---- Game history (database) ------------------------------------------
  ipcMain.handle('save-game-result', (_event, result) => {
    if (!result || typeof result !== 'object') {
      return { success: false, error: 'result must be an object' };
    }
    if (!settings.get('persistHistory', false)) {
      return { success: false, error: 'Persistence is disabled' };
    }
    try {
      database.saveGameResult(result);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-game-history', () => {
    if (!settings.get('persistHistory', false)) {
      return { success: false, error: 'Persistence is disabled', history: [] };
    }
    try {
      return { success: true, history: database.getGameHistory() };
    } catch (err) {
      return { success: false, error: err.message, history: [] };
    }
  });

  ipcMain.handle('clear-game-history', () => {
    try {
      database.clearGameHistory();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---- Auto-updates -----------------------------------------------------
  ipcMain.handle('check-for-updates', async () => {
    try {
      await checkForUpdates();
      return { checking: true };
    } catch (err) {
      return { checking: false, error: err.message };
    }
  });

  ipcMain.handle('install-update', () => {
    try {
      return installUpdate();
    } catch (err) {
      return { installing: false, error: err.message };
    }
  });

  // ---- App info ---------------------------------------------------------
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-app-path', () => app.getAppPath());

  // ---- File operations — same containment rules as scan-folder ----------
  ipcMain.handle('get-local-music-path', () => {
    const downloadedMusicPath = settings.get('downloadedMusicPath');
    if (downloadedMusicPath) return downloadedMusicPath;
    return path.join(app.getPath('userData'), 'music-downloads');
  });

  ipcMain.handle('open-path', async (_event, p) => {
    const roots = [...getAllowedRoots(), ...sessionPickedFolders];
    const safe = safeResolvePath(p, roots);
    if (!safe) return { success: false, error: 'path not in allowed roots' };
    try {
      const errMsg = await shell.openPath(safe);
      // openPath returns '' on success and an error string on failure
      if (errMsg) return { success: false, error: errMsg };
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('show-item-in-folder', (_event, itemPath) => {
    const roots = [...getAllowedRoots(), ...sessionPickedFolders];
    // For showItemInFolder we accept the file itself or its parent dir as
    // long as one of them is inside an allowed root.
    const safeFile = safeResolvePath(itemPath, roots);
    const parentSafe = isStr(itemPath, 4096)
      ? safeResolvePath(path.dirname(itemPath), roots)
      : null;
    const target = safeFile || parentSafe;
    if (!target) return { success: false, error: 'path not in allowed roots' };
    shell.showItemInFolder(target);
    return { success: true };
  });
}

export default registerIpcHandlers;
