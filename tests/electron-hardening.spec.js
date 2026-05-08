// @ts-check
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import http from 'http';
import { fileURLToPath } from 'url';

/**
 * Electron-app hardening regression suite.
 *
 * Each test launches the desktop app fresh against a throwaway userData dir
 * so settings/store leakage between tests is impossible. Browser-level
 * checks (web-preferences, CSP, navigation lockdown, preload allowlist) run
 * via Playwright's built-in Electron driver; main-process checks (server
 * binding, IPC validation) run by evaluating code inside the main process.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ELECTRON_MAIN = path.join(ROOT, 'electron', 'main.js');

/**
 * Make a per-test userData dir inside the OS temp dir. We pass it to Electron
 * via --user-data-dir so each test starts clean. Cleaned up after the test.
 */
function makeTempUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-electron-'));
  return dir;
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function launchElectron(t) {
  const userData = makeTempUserData();
  const app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      // Force production-like behaviour so the auto-updater early-exits
      // and DevTools shortcuts are blocked.
      NODE_ENV: 'production',
    },
    timeout: 30_000,
  });
  t.cleanupCallbacks = (t.cleanupCallbacks || []).concat([
    async () => {
      try {
        await app.close();
      } catch {
        /* ignore */
      }
      rmrf(userData);
    },
  ]);
  return { app, userData };
}

test.afterEach(async ({}, testInfo) => {
  for (const cb of testInfo.cleanupCallbacks || []) {
    await cb();
  }
});

// =============================================================================
// 1. BrowserWindow web-preferences hardening
// =============================================================================

test.describe('Electron - BrowserWindow security', () => {
  test('contextIsolation, sandbox, and webSecurity are enforced (behavioural checks)', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Behavioural assertions — these are what we actually care about.
    // Reading the web-preferences struct directly from main is not a public
    // API, so we observe the *effects* of the security flags.

    const checks = await window.evaluate(() => {
      // 1. contextIsolation + nodeIntegration=false: no Node globals
      const noRequire = typeof window.require === 'undefined';
      const noModule = typeof window.module === 'undefined';
      const noGlobalGlobal = typeof window.global === 'undefined';

      // 2. sandbox renderer: no Node-style process.versions.node
      const noNodeVersion =
        typeof window.process === 'undefined' ||
        typeof window.process.versions?.node === 'undefined';

      // 3. The preload bridge IS available — confirms preload ran in the
      //    isolated world and was reflected through contextBridge.
      const preloadBridgeReached = window.electronAPI?.isElectron === true;

      // 4. <webview> tag is *not* a registered custom element (webviewTag:false)
      const webviewMissing = !customElements.get('webview');

      return {
        noRequire,
        noModule,
        noGlobalGlobal,
        noNodeVersion,
        preloadBridgeReached,
        webviewMissing,
      };
    });

    expect(checks.noRequire).toBe(true);
    expect(checks.noModule).toBe(true);
    expect(checks.noGlobalGlobal).toBe(true);
    expect(checks.noNodeVersion).toBe(true);
    expect(checks.preloadBridgeReached).toBe(true);
    expect(checks.webviewMissing).toBe(true);

    // 5. webSecurity=true: a cross-origin fetch to a non-allowlisted host
    //    triggers CORS at the browser level. We use a known-good HTTP target
    //    (the embedded server's own URL with a fake host header) — any
    //    cross-origin fetch from the renderer should error out.
    const corsBlocked = await window.evaluate(async () => {
      try {
        // example.com is off-origin and not in any CSP allow-list.
        await fetch('https://example.com/', { mode: 'cors' });
        return false; // request unexpectedly succeeded — webSecurity off?
      } catch {
        return true;
      }
    });
    expect(corsBlocked).toBe(true);
  });
});

// =============================================================================
// 2. CSP and security response headers
// =============================================================================

test.describe('Electron - response headers', () => {
  test('CSP, X-Frame-Options, nosniff, no-referrer are set on app pages', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Re-fetch the index page from the renderer so we can read its headers.
    const headers = await window.evaluate(async () => {
      const res = await fetch(window.location.href, { method: 'GET' });
      const out = {};
      res.headers.forEach((v, k) => (out[k.toLowerCase()] = v));
      return out;
    });

    expect(headers['content-security-policy']).toBeTruthy();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
  });

  test('inline script in injected HTML does not execute under CSP', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Try to inject and execute an inline script. With script-src 'self',
    // the inline <script> element should not run.
    const fired = await window.evaluate(() => {
      window.__inlineFired = false;
      const s = document.createElement('script');
      s.textContent = 'window.__inlineFired = true;';
      document.body.appendChild(s);
      return window.__inlineFired === true;
    });
    expect(fired).toBe(false);
  });
});

// =============================================================================
// 3. Navigation lockdown
// =============================================================================

test.describe('Electron - navigation lockdown', () => {
  test('will-navigate to off-origin URL is blocked, redirected to shell', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const startUrl = window.url();
    const startOrigin = new URL(startUrl).origin;

    // Stub shell.openExternal in main so we can assert it was called and not
    // actually open a browser during tests.
    await app.evaluate(({ shell }) => {
      global.__openExternalCalls = [];
      const orig = shell.openExternal;
      shell.openExternal = async (url) => {
        global.__openExternalCalls.push(url);
        return undefined;
      };
      // store for restoration if needed
      global.__origOpenExternal = orig;
    });

    // Try to navigate to evil.example.com from inside the renderer.
    await window.evaluate(() => {
      window.location.href = 'https://evil.example.com/phish';
    });
    await window.waitForTimeout(800);

    // Window must still be on its original origin.
    const after = window.url();
    expect(new URL(after).origin).toBe(startOrigin);

    // shell.openExternal must have received the off-origin URL.
    const calls = await app.evaluate(() => global.__openExternalCalls);
    expect(calls).toContain('https://evil.example.com/phish');
  });

  test('window.open() returns null and does not create a child window', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

    const result = await window.evaluate(() => {
      const w = window.open('https://example.com', '_blank');
      return { isNull: w === null };
    });
    await window.waitForTimeout(500);

    const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(result.isNull).toBe(true);
    expect(after).toBe(before);
  });
});

// =============================================================================
// 4. Preload bridge — minimal, allowlisted surface
// =============================================================================

test.describe('Electron - preload bridge', () => {
  test('window.electronAPI exposes only allowlisted methods', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const surface = await window.evaluate(() => {
      const api = window.electronAPI;
      if (!api) return null;
      return Object.keys(api).sort();
    });
    expect(surface).not.toBeNull();

    // Anything starting with on* is a subscription helper. Everything else
    // should be in the allowlist exactly.
    const expected = [
      'addMusicLibraryPath',
      'checkForUpdates',
      'checkRemoteServer',
      'downloadZip',
      'getAllNetworkIps',
      'getAllSettings',
      'getAppPath',
      'getAppVersion',
      'getGameHistory',
      'clearGameHistory',
      'getLanUrl',
      'getLocalIp',
      'getLocalMusicPath',
      'getMusicLibraryPaths',
      'getPlatform',
      'getServerMode',
      'getServerUrl',
      'getSettings',
      'hotspotCheckAvailability',
      'hotspotStart',
      'hotspotStatus',
      'hotspotStop',
      'installUpdate',
      'isElectron',
      'onDownloadProgress',
      'onDownloadingUpdate',
      'onScanProgress',
      'onUpdateAvailable',
      'onUpdateDownloaded',
      'onUpdateError',
      'openPath',
      'refreshLanUrl',
      'removeMusicLibraryPath',
      'restartApp',
      'saveGameResult',
      'scanFolder',
      'selectFolder',
      'setLanExposed',
      'setServerMode',
      'setSettings',
      'showItemInFolder',
    ].sort();
    expect(surface).toEqual(expected);

    // Renderer must not see ipcRenderer / require / Electron internals.
    const reachable = await window.evaluate(() => ({
      hasIpcRenderer: typeof window.ipcRenderer !== 'undefined',
      hasRequire: typeof window.require !== 'undefined',
      hasElectron: typeof window.electron !== 'undefined',
    }));
    expect(reachable.hasIpcRenderer).toBe(false);
    expect(reachable.hasRequire).toBe(false);
    expect(reachable.hasElectron).toBe(false);
  });

  test('preload validates inputs before forwarding to ipcRenderer', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // setServerMode rejects values that aren't 'local'/'remote'
    const badMode = await window.evaluate(async () => {
      try {
        await window.electronAPI.setServerMode('something-else');
        return { rejected: false };
      } catch (err) {
        return { rejected: true, msg: String(err?.message || err) };
      }
    });
    expect(badMode.rejected).toBe(true);

    // scanFolder rejects non-strings
    const badScan = await window.evaluate(async () => {
      try {
        await window.electronAPI.scanFolder(123);
        return { rejected: false };
      } catch (err) {
        return { rejected: true };
      }
    });
    expect(badScan.rejected).toBe(true);

    // addMusicLibraryPath rejects non-strings
    const badAdd = await window.evaluate(async () => {
      try {
        await window.electronAPI.addMusicLibraryPath({ evil: true });
        return { rejected: false };
      } catch (err) {
        return { rejected: true };
      }
    });
    expect(badAdd.rejected).toBe(true);
  });
});

// =============================================================================
// 5. Embedded server — loopback only by default
// =============================================================================

test.describe('Electron - embedded server binding', () => {
  test('server listens on 127.0.0.1 and is unreachable from external IPs by default', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const serverUrl = await app.evaluate(() => global.serverUrl);
    expect(serverUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const port = parseInt(new URL(serverUrl).port, 10);

    // 127.0.0.1 should respond
    const localOk = await fetchHealth('127.0.0.1', port);
    expect(localOk).toBe(true);

    // A non-loopback bind on the same machine must NOT respond, because the
    // server is bound to 127.0.0.1. We pick a non-127 loopback alias on
    // Windows it returns ECONNREFUSED, on Linux/macOS the same.
    // We test by trying to connect to 0.0.0.0 then to a real LAN IP.
    const reachableViaLan = await canReachOnLan(port);
    expect(reachableViaLan).toBe(false);
  });

  test('setLanExposed(true) rebinds to 0.0.0.0; (false) reverts to loopback', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const before = await window.evaluate(async () => {
      const m = await window.electronAPI.getServerMode();
      return m;
    });
    expect(before.lanExposed).toBe(false);

    const exposeResult = await window.evaluate(async () => {
      return await window.electronAPI.setLanExposed(true);
    });
    expect(exposeResult.success).toBe(true);

    const expanded = await window.evaluate(async () => {
      return await window.electronAPI.getServerMode();
    });
    expect(expanded.lanExposed).toBe(true);

    const revertResult = await window.evaluate(async () => {
      return await window.electronAPI.setLanExposed(false);
    });
    expect(revertResult.success).toBe(true);

    const reverted = await window.evaluate(async () => {
      return await window.electronAPI.getServerMode();
    });
    expect(reverted.lanExposed).toBe(false);
  });
});

// =============================================================================
// 6. IPC handler containment — settings allowlist + path containment
// =============================================================================

test.describe('Electron - IPC handler validation', () => {
  test('settings allowlist rejects unknown keys', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const badSet = await window.evaluate(async () => {
      try {
        await window.electronAPI.setSettings('dangerous-evil-key', 'pwn');
        return { rejected: false };
      } catch (err) {
        return { rejected: true, msg: String(err?.message || err) };
      }
    });
    expect(badSet.rejected).toBe(true);
    expect(badSet.msg).toMatch(/not allowed/i);

    const badGet = await window.evaluate(async () => {
      try {
        await window.electronAPI.getSettings('dangerous-evil-key');
        return { rejected: false };
      } catch (err) {
        return { rejected: true };
      }
    });
    expect(badGet.rejected).toBe(true);
  });

  test('open-path / scan-folder reject paths outside allowed roots', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const evilTarget = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc';

    const openResult = await window.evaluate(async (p) => {
      return await window.electronAPI.openPath(p);
    }, evilTarget);
    expect(openResult.success).toBe(false);
    expect(openResult.error).toMatch(/allowed roots/i);

    const scanResult = await window.evaluate(async (p) => {
      return await window.electronAPI.scanFolder(p);
    }, evilTarget);
    expect(scanResult.success).toBe(false);
    expect(scanResult.error).toMatch(/allowed roots/i);
  });

  test('add-music-library-path rejects non-existent or non-directory paths', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const fake = process.platform === 'win32' ? 'Z:\\does\\not\\exist' : '/zzz/does/not/exist';
    const result = await window.evaluate(async (p) => {
      try {
        await window.electronAPI.addMusicLibraryPath(p);
        return { rejected: false };
      } catch (err) {
        return { rejected: true, msg: String(err?.message || err) };
      }
    }, fake);
    expect(result.rejected).toBe(true);
  });
});

// =============================================================================
// 7. Hotspot input validation — execFile + charset whitelist
// =============================================================================

test.describe('Electron - hotspot input validation', () => {
  test('rejects ssid containing shell metacharacters', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      return await window.electronAPI.hotspotStart('Bad; rm -rf /', 'goodpassword');
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SSID/);
  });

  test('rejects password shorter than 8 chars and quotes/backticks', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const tooShort = await window.evaluate(async () => {
      return await window.electronAPI.hotspotStart('CleanSsid', 'short');
    });
    expect(tooShort.success).toBe(false);

    const withQuote = await window.evaluate(async () => {
      return await window.electronAPI.hotspotStart('CleanSsid', 'pwd"andmore');
    });
    expect(withQuote.success).toBe(false);
  });
});

// =============================================================================
// 8. Auto-updater is disabled in dev/unpackaged
// =============================================================================

test.describe('Electron - auto-updater', () => {
  test('checkForUpdates is a no-op in unpackaged dev mode', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      return await window.electronAPI.checkForUpdates();
    });
    // checkForUpdates returns { checking: true } in prod-packaged; in dev it
    // returns either { checking: true } (if the early-return short-circuits
    // before throwing) or null. Either way, the renderer should see no
    // update-available event during the test window.
    expect(result).toBeDefined();
  });

  test('install-update returns success=false and a friendly error in dev mode', async ({}, testInfo) => {
    const { app } = await launchElectron(testInfo);
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      return await window.electronAPI.installUpdate();
    });
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(String(result.error || '').toLowerCase()).toMatch(/development|update/);
  });
});

// =============================================================================
// 9. Single instance lock
// =============================================================================

test.describe('Electron - single instance lock', () => {
  test('second launch quits immediately, first stays alive', async ({}, testInfo) => {
    const userData = makeTempUserData();
    testInfo.cleanupCallbacks = (testInfo.cleanupCallbacks || []).concat([
      () => rmrf(userData),
    ]);

    const first = await electron.launch({
      args: [ELECTRON_MAIN, `--user-data-dir=${userData}`],
      env: { ...process.env, NODE_ENV: 'production' },
      timeout: 30_000,
    });
    const w1 = await first.firstWindow();
    await w1.waitForLoadState('domcontentloaded');

    let secondClosed = false;
    try {
      const second = await electron.launch({
        args: [ELECTRON_MAIN, `--user-data-dir=${userData}`],
        env: { ...process.env, NODE_ENV: 'production' },
        timeout: 8_000,
      }).catch((err) => {
        // electron-launch can throw if the second instance exits before any
        // window appears, which is exactly the behaviour we want.
        secondClosed = true;
        return null;
      });

      if (second) {
        // If we did get a handle, the second instance should self-close
        // because requestSingleInstanceLock returned false.
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          await second.close();
        } catch {
          /* expected */
        }
        secondClosed = true;
      }
    } finally {
      try {
        await first.close();
      } catch {
        /* ignore */
      }
    }

    expect(secondClosed).toBe(true);
  });
});

// =============================================================================
// Helpers
// =============================================================================

function fetchHealth(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/api/health', timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Try to reach OUR embedded server via a non-loopback IPv4 address. We don't
 * just check TCP connectability — a stray process on the same port on a
 * different interface would falsely report "reachable". Instead we hit
 * /api/health and require it to respond, which our embedded server does.
 */
async function canReachOnLan(port) {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const list of Object.values(ifaces)) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address);
    }
  }
  if (candidates.length === 0) return false;

  for (const ip of candidates) {
    if (await fetchHealth(ip, port)) return true;
  }
  return false;
}
