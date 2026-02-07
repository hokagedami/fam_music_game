/**
 * IPC Handlers
 * Registers all IPC handlers for main-renderer communication
 */

import { app, dialog, shell } from 'electron';
import path from 'path';
import { settings } from '../services/settings.js';
import { scanMusicFolder } from '../services/musicScanner.js';
import { downloadAndExtractZip } from '../services/zipDownloader.js';
import { database } from '../services/database.js';
import { checkForUpdates, installUpdate } from '../updater.js';
import { hotspot } from '../services/hotspot.js';

/**
 * Register all IPC handlers
 * @param {Electron.IpcMain} ipcMain - IPC main instance
 * @param {Electron.BrowserWindow} mainWindow - Main window instance
 * @param {EmbeddedServer} embeddedServer - Embedded server instance
 */
export function registerIpcHandlers(ipcMain, mainWindow, embeddedServer) {
  // Server URL and mode
  ipcMain.handle('get-server-url', () => {
    return global.serverUrl || embeddedServer?.getUrl() || 'http://127.0.0.1:3000';
  });

  ipcMain.handle('get-lan-url', () => {
    if (global.serverMode === 'remote') {
      return global.serverUrl; // Remote server URL
    }
    return embeddedServer?.getLanUrl() || null;
  });

  ipcMain.handle('get-local-ip', () => {
    return embeddedServer?.getLocalIp() || null;
  });

  ipcMain.handle('refresh-lan-url', () => {
    // Refresh network interfaces and return updated LAN URL
    return embeddedServer?.refreshLanUrl() || null;
  });

  ipcMain.handle('get-all-network-ips', () => {
    return embeddedServer?.getAllIps() || [];
  });

  ipcMain.handle('get-server-mode', () => {
    return {
      mode: settings.get('serverMode', 'local'),
      remoteUrl: settings.get('remoteServerUrl', ''),
      currentUrl: global.serverUrl,
    };
  });

  ipcMain.handle('set-server-mode', (event, mode, remoteUrl) => {
    settings.set('serverMode', mode);
    if (remoteUrl !== undefined) {
      settings.set('remoteServerUrl', remoteUrl);
    }
    // Return true to indicate restart is needed
    return { success: true, restartRequired: true };
  });

  ipcMain.handle('restart-app', () => {
    app.relaunch();
    app.exit(0);
  });

  // Hotspot management
  ipcMain.handle('hotspot-check-availability', async () => {
    return await hotspot.checkAvailability();
  });

  ipcMain.handle('hotspot-start', async (event, ssid, password) => {
    return await hotspot.start(ssid, password);
  });

  ipcMain.handle('hotspot-stop', async () => {
    return await hotspot.stop();
  });

  ipcMain.handle('hotspot-status', () => {
    return hotspot.getStatus();
  });

  // Folder selection
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Music Folder',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Music scanning
  ipcMain.handle('scan-folder', async (event, folderPath) => {
    try {
      const songs = await scanMusicFolder(folderPath, (progress) => {
        mainWindow.webContents.send('scan-progress', progress);
      });
      return { success: true, songs };
    } catch (error) {
      console.error('Scan folder error:', error);
      return { success: false, error: error.message };
    }
  });

  // Zip download
  ipcMain.handle('download-zip', async (event, url) => {
    try {
      const songs = await downloadAndExtractZip(url, (progress) => {
        mainWindow.webContents.send('download-progress', progress);
      });
      return { success: true, songs };
    } catch (error) {
      console.error('Download zip error:', error);
      return { success: false, error: error.message };
    }
  });

  // Settings
  ipcMain.handle('get-settings', (event, key) => {
    return settings.get(key);
  });

  ipcMain.handle('set-settings', (event, key, value) => {
    settings.set(key, value);
    return true;
  });

  ipcMain.handle('get-all-settings', () => {
    return settings.store;
  });

  // Music library paths
  ipcMain.handle('get-music-library-paths', () => {
    return settings.get('musicLibraryPaths', []);
  });

  ipcMain.handle('add-music-library-path', (event, newPath) => {
    const paths = settings.get('musicLibraryPaths', []);
    if (!paths.includes(newPath)) {
      paths.push(newPath);
      settings.set('musicLibraryPaths', paths);
    }
    return paths;
  });

  ipcMain.handle('remove-music-library-path', (event, pathToRemove) => {
    const paths = settings.get('musicLibraryPaths', []);
    const filtered = paths.filter((p) => p !== pathToRemove);
    settings.set('musicLibraryPaths', filtered);
    return filtered;
  });

  // Game history (database)
  ipcMain.handle('save-game-result', async (event, result) => {
    const persistHistory = settings.get('persistHistory', false);
    if (!persistHistory) {
      return { success: false, error: 'Persistence is disabled' };
    }

    try {
      database.saveGameResult(result);
      return { success: true };
    } catch (error) {
      console.error('Save game result error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-game-history', async () => {
    const persistHistory = settings.get('persistHistory', false);
    if (!persistHistory) {
      return { success: false, error: 'Persistence is disabled', history: [] };
    }

    try {
      const history = database.getGameHistory();
      return { success: true, history };
    } catch (error) {
      console.error('Get game history error:', error);
      return { success: false, error: error.message, history: [] };
    }
  });

  ipcMain.handle('clear-game-history', async () => {
    try {
      database.clearGameHistory();
      return { success: true };
    } catch (error) {
      console.error('Clear game history error:', error);
      return { success: false, error: error.message };
    }
  });

  // Auto-updates
  ipcMain.handle('check-for-updates', async () => {
    try {
      await checkForUpdates();
      return { checking: true };
    } catch (error) {
      console.error('Check for updates error:', error);
      return { checking: false, error: error.message };
    }
  });

  ipcMain.handle('install-update', () => {
    try {
      installUpdate();
      return { installing: true };
    } catch (error) {
      console.error('Install update error:', error);
      return { installing: false, error: error.message };
    }
  });

  // App info
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-app-path', () => {
    return app.getAppPath();
  });

  // File operations
  ipcMain.handle('get-local-music-path', () => {
    const downloadedMusicPath = settings.get('downloadedMusicPath');
    if (downloadedMusicPath) {
      return downloadedMusicPath;
    }
    return path.join(app.getPath('userData'), 'music-downloads');
  });

  ipcMain.handle('open-path', async (event, pathToOpen) => {
    try {
      await shell.openPath(pathToOpen);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('show-item-in-folder', (event, itemPath) => {
    shell.showItemInFolder(itemPath);
    return { success: true };
  });

  console.log('IPC handlers registered');
}

export default registerIpcHandlers;
