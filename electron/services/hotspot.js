/**
 * Hotspot Service
 * Creates and manages a WiFi hotspot for LAN multiplayer without existing network
 * Supports Windows, macOS, and Linux
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DEFAULT_SSID = 'FAM Music Quiz';
const DEFAULT_PASSWORD = 'playmusic';

class HotspotService {
  constructor() {
    this.isRunning = false;
    this.ssid = DEFAULT_SSID;
    this.password = DEFAULT_PASSWORD;
    this.platform = process.platform;
  }

  /**
   * Check if hotspot feature is available on this system
   * @returns {Promise<{available: boolean, reason?: string}>}
   */
  async checkAvailability() {
    try {
      if (this.platform === 'win32') {
        // Check if WiFi adapter supports hosted network
        const { stdout } = await execAsync('netsh wlan show drivers');
        const supportsHosted = stdout.includes('Hosted network supported') &&
                               stdout.includes('Yes');
        if (!supportsHosted) {
          return {
            available: false,
            reason: 'WiFi adapter does not support hosted network. Try updating WiFi drivers.'
          };
        }
        return { available: true };
      } else if (this.platform === 'darwin') {
        // macOS - check if Internet Sharing can be configured
        // This is more limited on macOS
        return {
          available: true,
          reason: 'macOS hotspot requires manual setup in System Preferences > Sharing'
        };
      } else if (this.platform === 'linux') {
        // Check for nmcli or hostapd
        try {
          await execAsync('which nmcli');
          return { available: true };
        } catch {
          try {
            await execAsync('which hostapd');
            return { available: true };
          } catch {
            return {
              available: false,
              reason: 'Neither nmcli nor hostapd found. Install network-manager or hostapd.'
            };
          }
        }
      }
      return { available: false, reason: 'Unsupported platform' };
    } catch (error) {
      return { available: false, reason: error.message };
    }
  }

  /**
   * Start the hotspot
   * @param {string} ssid - Network name
   * @param {string} password - Network password (min 8 characters)
   * @returns {Promise<{success: boolean, error?: string, ssid?: string, password?: string}>}
   */
  async start(ssid = DEFAULT_SSID, password = DEFAULT_PASSWORD) {
    if (this.isRunning) {
      return { success: true, ssid: this.ssid, password: this.password };
    }

    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    this.ssid = ssid;
    this.password = password;

    try {
      if (this.platform === 'win32') {
        return await this.startWindows();
      } else if (this.platform === 'darwin') {
        return await this.startMacOS();
      } else if (this.platform === 'linux') {
        return await this.startLinux();
      }
      return { success: false, error: 'Unsupported platform' };
    } catch (error) {
      console.error('Hotspot start error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop the hotspot
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async stop() {
    if (!this.isRunning) {
      return { success: true };
    }

    try {
      if (this.platform === 'win32') {
        return await this.stopWindows();
      } else if (this.platform === 'darwin') {
        return await this.stopMacOS();
      } else if (this.platform === 'linux') {
        return await this.stopLinux();
      }
      return { success: false, error: 'Unsupported platform' };
    } catch (error) {
      console.error('Hotspot stop error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get hotspot status
   * @returns {{isRunning: boolean, ssid: string, password: string}}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      ssid: this.ssid,
      password: this.password,
    };
  }

  // ==================
  // Windows Implementation
  // ==================

  async startWindows() {
    try {
      // Configure the hosted network
      await execAsync(
        `netsh wlan set hostednetwork mode=allow ssid="${this.ssid}" key="${this.password}"`
      );

      // Start the hosted network
      await execAsync('netsh wlan start hostednetwork');

      this.isRunning = true;
      console.log(`Hotspot started: ${this.ssid}`);
      return { success: true, ssid: this.ssid, password: this.password };
    } catch (error) {
      // Try Windows 10 Mobile Hotspot as fallback
      console.log('Hosted network failed, trying Mobile Hotspot...');
      return await this.startWindowsMobileHotspot();
    }
  }

  async startWindowsMobileHotspot() {
    try {
      // Use PowerShell to enable Mobile Hotspot (Windows 10+)
      const script = `
        $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
        $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
        $tetheringManager.StartTetheringAsync()
      `;

      await execAsync(`powershell -Command "${script.replace(/\n/g, ' ')}"`);
      this.isRunning = true;
      return {
        success: true,
        ssid: this.ssid,
        password: this.password,
        note: 'Using Windows Mobile Hotspot. Check Settings > Network > Mobile Hotspot for credentials.'
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to start hotspot. Please enable Mobile Hotspot manually in Windows Settings > Network & Internet > Mobile Hotspot',
        manualRequired: true
      };
    }
  }

  async stopWindows() {
    try {
      await execAsync('netsh wlan stop hostednetwork');
      this.isRunning = false;
      return { success: true };
    } catch (error) {
      // Try stopping Mobile Hotspot
      try {
        const script = `
          $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
          $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
          $tetheringManager.StopTetheringAsync()
        `;
        await execAsync(`powershell -Command "${script.replace(/\n/g, ' ')}"`);
        this.isRunning = false;
        return { success: true };
      } catch {
        return { success: false, error: error.message };
      }
    }
  }

  // ==================
  // macOS Implementation
  // ==================

  async startMacOS() {
    // macOS doesn't allow programmatic hotspot creation easily
    // We'll provide instructions instead
    return {
      success: false,
      manualRequired: true,
      error: 'macOS requires manual hotspot setup',
      instructions: [
        '1. Open System Preferences > Sharing',
        '2. Select "Internet Sharing" from the left panel',
        '3. Share your connection from: [Your Internet source]',
        '4. To computers using: Wi-Fi',
        '5. Click "Wi-Fi Options" to set network name and password',
        '6. Check the "Internet Sharing" checkbox to enable',
      ],
    };
  }

  async stopMacOS() {
    return {
      success: false,
      manualRequired: true,
      instructions: ['Uncheck "Internet Sharing" in System Preferences > Sharing'],
    };
  }

  // ==================
  // Linux Implementation
  // ==================

  async startLinux() {
    try {
      // Try using nmcli (NetworkManager)
      // First, find a WiFi device
      const { stdout: devices } = await execAsync('nmcli device status');
      const wifiDevice = devices.split('\n')
        .find(line => line.includes('wifi') && !line.includes('wifi-p2p'));

      if (!wifiDevice) {
        return { success: false, error: 'No WiFi device found' };
      }

      const deviceName = wifiDevice.split(/\s+/)[0];

      // Create hotspot
      await execAsync(
        `nmcli device wifi hotspot ifname ${deviceName} ssid "${this.ssid}" password "${this.password}"`
      );

      this.isRunning = true;
      return { success: true, ssid: this.ssid, password: this.password };
    } catch (error) {
      // Fallback instructions
      return {
        success: false,
        error: error.message,
        manualRequired: true,
        instructions: [
          'Run in terminal with sudo:',
          `nmcli device wifi hotspot ssid "${this.ssid}" password "${this.password}"`,
          'Or use your desktop environment\'s network settings to create a hotspot.',
        ],
      };
    }
  }

  async stopLinux() {
    try {
      // Find and disconnect the hotspot connection
      const { stdout } = await execAsync('nmcli connection show --active');
      const hotspotLine = stdout.split('\n').find(line => line.includes('Hotspot'));

      if (hotspotLine) {
        const connectionName = hotspotLine.split(/\s{2,}/)[0];
        await execAsync(`nmcli connection down "${connectionName}"`);
      }

      this.isRunning = false;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
export const hotspot = new HotspotService();
export default hotspot;
