/**
 * Embedded Server Service
 * Manages the lifecycle of the embedded Express/Socket.IO server
 */

import { createServer } from 'http';
import net from 'net';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { app } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REMOTE_SERVER_URL = 'https://fam-music-app-7jsn7.ondigitalocean.app';

/**
 * Find an available port in a range
 * @param {number} startPort - Starting port
 * @param {number} endPort - Ending port
 * @returns {Promise<number>} Available port
 */
async function findAvailablePort(startPort = 3000, endPort = 3100) {
  for (let port = startPort; port <= endPort; port++) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`No available port found between ${startPort} and ${endPort}`);
}

/**
 * Check if a port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} True if available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Get the local network IP address
 * Prioritizes hotspot/hosted network interfaces for offline multiplayer
 * @returns {string} Local IP address or localhost
 */
function getLocalIpAddress() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();

  // Common hotspot interface patterns
  const hotspotPatterns = [
    'Microsoft Hosted Network',
    'Local Area Connection*',
    'Hotspot',
    'Mobile Hotspot',
    'Wi-Fi Direct',
    'vEthernet',
    'ap0', // Linux AP mode
    'wlan', // Linux wireless
  ];

  let hotspotIp = null;
  let regularIp = null;

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        // Check if this looks like a hotspot interface
        const isHotspot = hotspotPatterns.some(pattern =>
          name.toLowerCase().includes(pattern.toLowerCase())
        ) || net.address.startsWith('192.168.137.'); // Windows hosted network default

        if (isHotspot) {
          hotspotIp = net.address;
        } else if (!regularIp) {
          regularIp = net.address;
        }
      }
    }
  }

  // Prefer hotspot IP, fall back to regular IP, then localhost
  return hotspotIp || regularIp || '127.0.0.1';
}

/**
 * Get all available network IPs (for display to user)
 * @returns {Array<{name: string, address: string, isHotspot: boolean}>}
 */
function getAllNetworkIps() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const ips = [];

  const hotspotPatterns = [
    'Microsoft Hosted Network',
    'Local Area Connection*',
    'Hotspot',
    'Mobile Hotspot',
    'Wi-Fi Direct',
    'vEthernet',
  ];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        const isHotspot = hotspotPatterns.some(pattern =>
          name.toLowerCase().includes(pattern.toLowerCase())
        ) || net.address.startsWith('192.168.137.');

        ips.push({
          name,
          address: net.address,
          isHotspot,
        });
      }
    }
  }

  return ips;
}

/**
 * Check if the remote server is reachable
 * @returns {Promise<{online: boolean, url: string}>}
 */
async function checkRemoteServer() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${REMOTE_SERVER_URL}/api/health`, { signal: controller.signal });
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
  }

  /**
   * Start the embedded server
   * @returns {Promise<string>} Server URL
   */
  async start() {
    if (this.isRunning) {
      return this.getUrl();
    }

    // Find available port
    this.port = await findAvailablePort(3000, 3100);

    // Set environment variables for the server
    process.env.PORT = String(this.port);
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';
    process.env.ELECTRON_APP = 'true';
    // Provide a writable path for uploads and other data outside the ASAR archive
    process.env.ELECTRON_USER_DATA = app.getPath('userData');

    // Dynamically import the server module
    const serverPath = path.join(__dirname, '../../src/server/index.js');

    try {
      // Import the server module - it exports { app, server, io }
      // Use pathToFileURL for correct file:// URL on all platforms (handles Windows backslashes)
      const serverModule = await import(pathToFileURL(serverPath).href);

      // If the server auto-started, we need to use it
      // Otherwise, start it manually
      if (serverModule.server && serverModule.server.listening) {
        this.server = serverModule.server;
        this.app = serverModule.app;
        this.io = serverModule.io;

        // Get the actual port the server is listening on
        const address = this.server.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
        }
      } else if (serverModule.app && serverModule.server) {
        // Server didn't auto-start, start it manually
        this.app = serverModule.app;
        this.server = serverModule.server;
        this.io = serverModule.io;

        await new Promise((resolve, reject) => {
          // Bind to 0.0.0.0 to allow LAN connections
          this.server.listen(this.port, '0.0.0.0', () => {
            resolve();
          });
          this.server.once('error', reject);
        });
      }

      this.isRunning = true;
      console.log(`Embedded server started on port ${this.port}`);
      return this.getUrl();
    } catch (error) {
      console.error('Failed to start embedded server:', error);
      throw error;
    }
  }

  /**
   * Stop the embedded server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      if (this.io) {
        this.io.close();
      }

      if (this.server) {
        this.server.close(() => {
          this.isRunning = false;
          this.server = null;
          this.app = null;
          this.io = null;
          console.log('Embedded server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the server URL (localhost)
   * @returns {string} Server URL
   */
  getUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * Get the LAN URL for other devices to connect
   * @returns {string} LAN URL
   */
  getLanUrl() {
    const localIp = getLocalIpAddress();
    return `http://${localIp}:${this.port}`;
  }

  /**
   * Get the local IP address
   * @returns {string} Local IP
   */
  getLocalIp() {
    return getLocalIpAddress();
  }

  /**
   * Get all available network IPs
   * @returns {Array<{name: string, address: string, isHotspot: boolean}>}
   */
  getAllIps() {
    return getAllNetworkIps();
  }

  /**
   * Refresh and get updated LAN URL (call after hotspot starts)
   * @returns {string} Updated LAN URL
   */
  refreshLanUrl() {
    // Force re-detection of network interfaces
    const ip = getLocalIpAddress();
    return `http://${ip}:${this.port}`;
  }

  /**
   * Get the server port
   * @returns {number} Server port
   */
  getPort() {
    return this.port;
  }

  /**
   * Check if server is running
   * @returns {boolean}
   */
  running() {
    return this.isRunning;
  }

  static checkRemoteServer() {
    return checkRemoteServer();
  }
}

export { REMOTE_SERVER_URL };
export default EmbeddedServer;
