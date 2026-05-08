/**
 * Embedded server lifecycle manager.
 *
 * Hardening notes:
 *  - Default bind is 127.0.0.1 ONLY. The desktop app will not listen on the
 *    user's network unless the user explicitly opts in via setLanExposed(true).
 *    This is the difference between a "personal HTTP server" and "open relay
 *    on every coffee-shop wifi the user joins".
 *  - findAvailablePort probes the same loopback interface we'll bind to —
 *    not 0.0.0.0 — so it doesn't accidentally claim a port on every NIC.
 *  - When LAN exposure is enabled, the listener rebinds to 0.0.0.0; we never
 *    listen on a discovered LAN IP because that would miss other interfaces
 *    and could fail if the IP changes (DHCP, hotspot toggling).
 *  - The remote-server URL is the single source of truth — same constant is
 *    used in the renderer's CSP allow-list.
 */

import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { app } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REMOTE_SERVER_URL = 'https://fam-music-app-7jsn7.ondigitalocean.app';

const LOOPBACK = '127.0.0.1';
const LAN_BIND = '0.0.0.0';

/**
 * Probe a single (host, port). Returns true only if the port is free on the
 * given interface.
 */
function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

/**
 * Find a port that's free on BOTH 127.0.0.1 AND 0.0.0.0. Probing only one
 * isn't enough on Windows: a process bound to 0.0.0.0:P doesn't block a
 * second bind on 127.0.0.1:P (kernel demuxes by destination address). Without
 * the extra check, our embedded server can quietly share a port with an
 * unrelated stray process, and any LAN-side traffic on that port goes to
 * THEIR listener — the opposite of what we want.
 */
async function findAvailablePort(startPort = 3000, endPort = 3100) {
  for (let port = startPort; port <= endPort; port++) {
    const loopbackOk = await isPortAvailable(port, LOOPBACK);
    if (!loopbackOk) continue;
    const lanOk = await isPortAvailable(port, LAN_BIND);
    if (lanOk) return port;
  }
  throw new Error(`No available port found between ${startPort} and ${endPort}`);
}

/**
 * Pick a single LAN IP for display. We never *bind* to this; the listener
 * binds to 0.0.0.0 when LAN is enabled. This is purely informational.
 */
function getLocalIpAddress() {
  const nets = os.networkInterfaces();

  const hotspotPatterns = [
    'microsoft hosted network',
    'local area connection*',
    'hotspot',
    'mobile hotspot',
    'wi-fi direct',
    'vethernet',
    'ap0',
    'wlan',
  ];

  let hotspotIp = null;
  let regularIp = null;

  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;

      const isHotspot =
        hotspotPatterns.some((p) => name.toLowerCase().includes(p)) ||
        iface.address.startsWith('192.168.137.');

      if (isHotspot) hotspotIp = iface.address;
      else if (!regularIp) regularIp = iface.address;
    }
  }
  return hotspotIp || regularIp || LOOPBACK;
}

function getAllNetworkIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  const hotspotPatterns = [
    'microsoft hosted network',
    'local area connection*',
    'hotspot',
    'mobile hotspot',
    'wi-fi direct',
    'vethernet',
  ];
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const isHotspot =
        hotspotPatterns.some((p) => name.toLowerCase().includes(p)) ||
        iface.address.startsWith('192.168.137.');
      ips.push({ name, address: iface.address, isHotspot });
    }
  }
  return ips;
}

async function checkRemoteServer() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${REMOTE_SERVER_URL}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { online: res.ok, url: REMOTE_SERVER_URL };
  } catch {
    return { online: false, url: REMOTE_SERVER_URL };
  }
}

export class EmbeddedServer {
  constructor() {
    this.server = null;
    this.app = null;
    this.io = null;
    this.port = null;
    this.isRunning = false;
    /** Whether the server is currently listening on 0.0.0.0 (LAN exposed). */
    this.lanExposed = false;
  }

  /**
   * Start the server bound to 127.0.0.1 only. Returns the loopback URL.
   */
  async start() {
    if (this.isRunning) return this.getUrl();

    this.port = await findAvailablePort(3000, 3100);

    // Hand a writable user-data dir to the server so SQLite/uploads land
    // outside the ASAR archive. Validated by main.js before this runs.
    process.env.PORT = String(this.port);
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';
    process.env.ELECTRON_APP = 'true';
    if (!process.env.ELECTRON_USER_DATA) {
      process.env.ELECTRON_USER_DATA = app.getPath('userData');
    }
    // Production CORS rejects any non-allowlisted origin. The renderer loads
    // the app from the same loopback origin so it never sets one.
    if (!process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS = `http://${LOOPBACK}:${this.port}`;
    }

    const serverPath = path.join(__dirname, '../../src/server/index.js');
    const serverModule = await import(pathToFileURL(serverPath).href);

    this.server = serverModule.server;
    this.app = serverModule.app;
    this.io = serverModule.io;

    if (this.server.listening) {
      const address = this.server.address();
      if (address && typeof address === 'object') this.port = address.port;
    } else {
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, LOOPBACK, () => resolve());
        this.server.once('error', reject);
      });
    }

    this.isRunning = true;
    return this.getUrl();
  }

  /**
   * Toggle LAN exposure. When enabled, the server is rebound on 0.0.0.0 so
   * other devices on the network can join. The user-facing UI must make this
   * a deliberate, visible action.
   *
   * @param {boolean} expose
   */
  async setLanExposed(expose) {
    if (!this.isRunning) throw new Error('Server is not running');
    if (expose === this.lanExposed) {
      return { exposed: this.lanExposed, url: expose ? this.getLanUrl() : this.getUrl() };
    }

    await new Promise((resolve) => this.server.close(resolve));
    const bindHost = expose ? LAN_BIND : LOOPBACK;
    await new Promise((resolve, reject) => {
      this.server.listen(this.port, bindHost, () => resolve());
      this.server.once('error', reject);
    });
    this.lanExposed = expose;
    return {
      exposed: this.lanExposed,
      url: expose ? this.getLanUrl() : this.getUrl(),
    };
  }

  async stop() {
    if (!this.isRunning) return;
    return new Promise((resolve) => {
      try {
        if (this.io) this.io.close();
      } catch {
        /* ignore */
      }
      if (this.server) {
        this.server.close(() => {
          this.isRunning = false;
          this.server = null;
          this.app = null;
          this.io = null;
          resolve();
        });
      } else {
        this.isRunning = false;
        resolve();
      }
    });
  }

  getUrl() {
    return `http://${LOOPBACK}:${this.port}`;
  }

  getLanUrl() {
    if (!this.lanExposed) return null;
    return `http://${getLocalIpAddress()}:${this.port}`;
  }

  getLocalIp() {
    return getLocalIpAddress();
  }

  getAllIps() {
    return getAllNetworkIps();
  }

  refreshLanUrl() {
    return this.getLanUrl();
  }

  getPort() {
    return this.port;
  }

  running() {
    return this.isRunning;
  }

  isLanExposed() {
    return this.lanExposed;
  }

  static checkRemoteServer() {
    return checkRemoteServer();
  }
}

export { REMOTE_SERVER_URL };
export default EmbeddedServer;
