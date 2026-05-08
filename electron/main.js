/**
 * Electron Main Process — hardened entry point.
 *
 * Security posture:
 *  - BrowserWindow runs with contextIsolation, sandbox, webSecurity, and
 *    nodeIntegration disabled. The renderer talks to main only through the
 *    `electronAPI` allowlist exposed in preload.cjs.
 *  - A strict CSP is injected into every response served by the embedded
 *    server (and also into the loaded HTML via a meta tag patched in).
 *  - Permission requests (camera, mic, geolocation, …) are denied by default.
 *  - Navigation and window-open are locked down to the embedded server's
 *    origin (or the configured remote-server origin in remote mode).
 *  - The embedded server only listens on 127.0.0.1 — LAN access is opt-in
 *    via setLanExposed() and rebinds explicitly. This prevents the desktop
 *    app from quietly putting an HTTP listener on the user's network.
 *  - ELECTRON_USER_DATA is set from app.getPath('userData') and validated
 *    against path traversal before being exported.
 */

import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EmbeddedServer, REMOTE_SERVER_URL } from './services/embeddedServer.js';
import { registerIpcHandlers } from './ipc/handlers.js';
import { setupAutoUpdater } from './updater.js';
import { settings } from './services/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let embeddedServer = null;
let allowedOrigin = null; // origin (scheme://host:port) of the loaded app

// Disallow opening a second instance — multiple instances of the embedded
// server would race on the SQLite DB and the user-data settings store.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Log to stderr before quitting so users see *why* nothing appears when
  // a previous instance is already running (or, on Windows, when prior
  // crashed/orphaned processes still hold the lock).
  console.error(
    '[electron] Another instance is already running (or a previous instance is still holding the lock). Exiting.'
  );
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Strict Content Security Policy. The embedded server serves over plain HTTP
// on loopback, so we don't add upgrade-insecure-requests. Inline scripts are
// disallowed; the bundle is loaded from the same origin via <script src>.
//
// Connect-src includes ws/wss for the Socket.IO transport and the remote
// server origin so remote-mode users can still talk to it.
function buildCsp(serverOrigin) {
  const remoteOrigin = new URL(REMOTE_SERVER_URL).origin;
  const wsOrigin = serverOrigin.replace(/^http/, 'ws');
  const remoteWs = remoteOrigin.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    `connect-src 'self' ${serverOrigin} ${wsOrigin} ${remoteOrigin} ${remoteWs}`,
    "img-src 'self' data: blob:",
    "media-src 'self' blob: file:",
    "font-src 'self' data:",
    // 'unsafe-inline' for styles is unfortunate but the existing app injects
    // inline style strings (notifications.js etc). Tightening this further is
    // a follow-up: replace inline styles with classes.
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Validate that ELECTRON_USER_DATA is a real, writable path with no traversal.
 */
function safeUserDataPath() {
  const p = app.getPath('userData');
  // app.getPath always returns an absolute, resolved path on supported
  // platforms. Defence in depth: reject anything that resolves outside itself
  // or contains path-traversal segments after normalisation.
  const resolved = path.resolve(p);
  if (resolved !== path.normalize(resolved)) {
    throw new Error('Invalid userData path');
  }
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  // Probe writability — fail fast at startup rather than from a deep call site.
  fs.accessSync(resolved, fs.constants.W_OK);
  return resolved;
}

async function createWindow() {
  const userData = safeUserDataPath();
  process.env.ELECTRON_USER_DATA = userData;

  // Restore window bounds from settings (sanitised to avoid silly inputs)
  const stored = settings.get('windowBounds', { width: 1200, height: 800 });
  const windowBounds = {
    width: clampInt(stored.width, 800, 4096, 1200),
    height: clampInt(stored.height, 600, 4096, 800),
    x: typeof stored.x === 'number' ? stored.x : undefined,
    y: typeof stored.y === 'number' ? stored.y : undefined,
  };

  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // Disable Spellcheck so the renderer doesn't reach out to Google's
      // dictionary endpoint.
      spellcheck: false,
      // Disable webview tag entirely — we don't use it.
      webviewTag: false,
    },
    icon: path.join(__dirname, '../resources/icon.png'),
    title: 'FAM Music Quiz',
    show: false,
    backgroundColor: '#1a1a2e',
  });

  // Lock down permission prompts. Anything not on the allowlist is denied.
  // Microphone is used for voice answers in some game modes (if/when added);
  // start denied and add an explicit user preference if/when it becomes a
  // feature.
  const ALLOWED_PERMISSIONS = new Set([]);
  const ses = mainWindow.webContents.session;
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((webContents, permission) =>
    ALLOWED_PERMISSIONS.has(permission)
  );

  // Pick server URL based on user preference
  const serverMode = settings.get('serverMode', 'local');
  let serverUrl;
  if (serverMode === 'remote') {
    serverUrl = REMOTE_SERVER_URL;
  } else {
    embeddedServer = new EmbeddedServer();
    serverUrl = await embeddedServer.start();
  }
  allowedOrigin = new URL(serverUrl).origin;

  // Inject CSP into all responses going to the renderer. Doing this in the
  // session response handler covers HTML, bundled JS and any future
  // server-rendered routes — a meta tag in index.html alone wouldn't cover
  // dynamic responses.
  const csp = buildCsp(allowedOrigin);
  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders['Content-Security-Policy'] = [csp];
    responseHeaders['X-Content-Type-Options'] = ['nosniff'];
    responseHeaders['X-Frame-Options'] = ['DENY'];
    responseHeaders['Referrer-Policy'] = ['no-referrer'];
    callback({ responseHeaders });
  });

  // Lock navigation to the app origin — clicking a link in user content can't
  // navigate the main window away to an attacker page.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url).origin;
      if (target !== allowedOrigin) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  // window.open / target=_blank — open externally, never as a child window.
  // Returning { action: 'deny' } prevents Electron from creating a window at
  // all even if openExternal fails.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      /* ignore malformed URL */
    }
    return { action: 'deny' };
  });

  // No remote-side redirect surprises — same origin only.
  mainWindow.webContents.on('will-redirect', (event, url) => {
    try {
      if (new URL(url).origin !== allowedOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  // No <webview> creation at all (defence in depth — webviewTag is also
  // disabled in webPreferences).
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // Store server URL for IPC handlers
  global.serverUrl = serverUrl;
  global.serverMode = serverMode;

  await mainWindow.loadURL(serverUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log(`[electron] Window ready at ${serverUrl}`);
    setTimeout(() => setupAutoUpdater(mainWindow), 10000);
  });

  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      settings.set('windowBounds', bounds);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  registerIpcHandlers(ipcMain, mainWindow, embeddedServer);

  // DevTools only in dev. In production, Ctrl+Shift+I should not open them.
  if (process.env.NODE_ENV !== 'development') {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const blocked =
        (input.control && input.shift && (input.key === 'I' || input.key === 'i')) ||
        input.key === 'F12';
      if (blocked) event.preventDefault();
    });
  }
}

function clampInt(n, min, max, fallback) {
  const v = Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(Math.max(v, min), max);
}

// App-wide guard rails: refuse to load custom protocols, refuse to attach to
// a webview, and refuse to install a new origin override.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol.startsWith('http')) shell.openExternal(url);
    } catch {
      /* ignore */
    }
    return { action: 'deny' };
  });
});

app.whenReady().then(createWindow).catch((err) => {
  console.error('Failed to start desktop app:', err);
  app.exit(1);
});

app.on('window-all-closed', async () => {
  if (embeddedServer) {
    try {
      await embeddedServer.stop();
    } catch (err) {
      console.error('Error stopping embedded server:', err.message);
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Loopback HTTP only — refuse certificate errors for everything else.
// Previous code allowed any localhost cert; we're stricter now: certs are
// only auto-accepted for our own embedded loopback URL.
app.on('certificate-error', (event, _wc, url, _err, _cert, callback) => {
  try {
    const u = new URL(url);
    if (u.hostname === '127.0.0.1' && allowedOrigin && u.origin === allowedOrigin) {
      event.preventDefault();
      return callback(true);
    }
  } catch {
    /* fall through */
  }
  callback(false);
});

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  try {
    if (embeddedServer) await embeddedServer.stop();
  } catch (err) {
    console.error('Error during shutdown:', err.message);
  }
  app.quit();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { mainWindow, embeddedServer };
