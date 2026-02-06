/**
 * Electron Main Process
 * Entry point for the desktop application
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { EmbeddedServer } from './services/embeddedServer.js';
import { registerIpcHandlers } from './ipc/handlers.js';
import { setupAutoUpdater } from './updater.js';
import { settings } from './services/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let embeddedServer = null;

/**
 * Create the main application window
 */
async function createWindow() {
  // Restore window bounds from settings
  const windowBounds = settings.get('windowBounds', {
    width: 1200,
    height: 800,
  });

  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload script to work with ESM
    },
    icon: path.join(__dirname, '../resources/icon.png'),
    title: 'FAM Music Quiz',
    show: false, // Don't show until ready
    backgroundColor: '#1a1a2e',
  });

  // Start embedded server
  embeddedServer = new EmbeddedServer();
  const serverUrl = await embeddedServer.start();
  console.log(`Embedded server started at: ${serverUrl}`);

  // Store server URL for IPC access
  global.serverUrl = serverUrl;

  // Load the app
  mainWindow.loadURL(serverUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Setup auto-updater after window is shown (with delay)
    setTimeout(() => {
      setupAutoUpdater(mainWindow);
    }, 10000);
  });

  // Save window bounds on close
  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      settings.set('windowBounds', bounds);
    }
  });

  // Clean up on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Register IPC handlers
  registerIpcHandlers(ipcMain, mainWindow, embeddedServer);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// App lifecycle events
app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  // Stop embedded server
  if (embeddedServer) {
    await embeddedServer.stop();
  }

  // On macOS, apps typically stay open until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle certificate errors for local development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (url.startsWith('https://localhost') || url.startsWith('https://127.0.0.1')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  if (embeddedServer) {
    await embeddedServer.stop();
  }
  app.quit();
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  if (embeddedServer) {
    await embeddedServer.stop();
  }
  app.quit();
});

export { mainWindow, embeddedServer };
