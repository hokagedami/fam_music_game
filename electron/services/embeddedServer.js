/**
 * Embedded Server Service
 * Manages the lifecycle of the embedded Express/Socket.IO server
 */

import { createServer } from 'http';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    server.listen(port, '127.0.0.1');
  });
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

    // Dynamically import the server module
    const serverPath = path.join(__dirname, '../../src/server/index.js');

    try {
      // Import the server module - it exports { app, server, io }
      const serverModule = await import(`file://${serverPath}`);

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
          this.server.listen(this.port, '127.0.0.1', () => {
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
   * Get the server URL
   * @returns {string} Server URL
   */
  getUrl() {
    return `http://127.0.0.1:${this.port}`;
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
}

export default EmbeddedServer;
