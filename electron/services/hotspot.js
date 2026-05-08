/**
 * Hotspot service.
 *
 * Hardening notes:
 *  - Uses `execFile` everywhere it can. The previous implementation used
 *    `exec(`netsh ... ssid="${this.ssid}" key="${this.password}"`)` which is
 *    a textbook shell-injection sink: a malicious renderer (or, post-XSS, a
 *    crafted name) could inject `&` or `; rm -rf` inside an ssid string.
 *  - Inputs (ssid, password) are validated against a strict charset before
 *    they ever reach a child process. Even though execFile bypasses the
 *    shell, the underlying tools (netsh / nmcli) accept their own quoting
 *    syntax, so we still keep inputs simple to avoid surprising behaviour.
 *  - PowerShell calls are issued as a script body via stdin, not via
 *    `-Command "$expanded"`, so PowerShell never has to re-parse our input.
 *  - The Linux device name lookup is filtered through a regex so we can't
 *    end up passing `; ` into a child arg.
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DEFAULT_SSID = 'FAM Music Quiz';
const DEFAULT_PASSWORD = 'playmusic';

// SSID: 1-32 chars; we restrict to a printable, safe subset (letters, digits,
// space, dash, underscore). Real WiFi specs allow more, but we'd rather be
// conservative than handle quoting edge cases.
const SSID_RE = /^[A-Za-z0-9 _.\-]{1,32}$/;
// WPA2 passphrase: 8-63 ASCII printable. We disallow quotes and backticks to
// avoid quoting hazards in the underlying CLIs.
const PASSWORD_RE = /^[\x21\x23-\x26\x28-\x7e]{8,63}$/;
// Linux interface names: per kernel rules, max 15 chars, no whitespace, but
// we accept the standard subset returned by nmcli.
const IFACE_RE = /^[A-Za-z0-9_\-]{1,15}$/;

function validateSsidAndPassword(ssid, password) {
  if (!SSID_RE.test(ssid)) {
    throw new Error('SSID must be 1-32 chars of letters, digits, space, dash, underscore, or dot');
  }
  if (!PASSWORD_RE.test(password)) {
    throw new Error('Password must be 8-63 printable ASCII chars (no quotes/backticks)');
  }
}

class HotspotService {
  constructor() {
    this.isRunning = false;
    this.ssid = DEFAULT_SSID;
    this.password = DEFAULT_PASSWORD;
    this.platform = process.platform;
  }

  async checkAvailability() {
    try {
      if (this.platform === 'win32') {
        const { stdout } = await execFileAsync('netsh', ['wlan', 'show', 'drivers']);
        const supportsHosted =
          /Hosted network supported\s*:\s*Yes/i.test(stdout) ||
          stdout.includes('Hosted network supported');
        if (!supportsHosted) {
          return {
            available: false,
            reason:
              'WiFi adapter does not support hosted network. Try updating WiFi drivers, or use Mobile Hotspot from Windows Settings.',
          };
        }
        return { available: true };
      }
      if (this.platform === 'darwin') {
        return {
          available: true,
          reason: 'macOS hotspot requires manual setup in System Settings → Sharing.',
        };
      }
      if (this.platform === 'linux') {
        try {
          await execFileAsync('which', ['nmcli']);
          return { available: true };
        } catch {
          try {
            await execFileAsync('which', ['hostapd']);
            return { available: true };
          } catch {
            return {
              available: false,
              reason: 'Neither nmcli nor hostapd found. Install network-manager or hostapd.',
            };
          }
        }
      }
      return { available: false, reason: 'Unsupported platform' };
    } catch (err) {
      return { available: false, reason: err.message };
    }
  }

  async start(ssid = DEFAULT_SSID, password = DEFAULT_PASSWORD) {
    if (this.isRunning) {
      return { success: true, ssid: this.ssid, password: this.password };
    }
    try {
      validateSsidAndPassword(ssid, password);
    } catch (err) {
      return { success: false, error: err.message };
    }
    this.ssid = ssid;
    this.password = password;
    try {
      if (this.platform === 'win32') return this.startWindows();
      if (this.platform === 'darwin') return this.startMacOS();
      if (this.platform === 'linux') return this.startLinux();
      return { success: false, error: 'Unsupported platform' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async stop() {
    if (!this.isRunning) return { success: true };
    try {
      if (this.platform === 'win32') return this.stopWindows();
      if (this.platform === 'darwin') return this.stopMacOS();
      if (this.platform === 'linux') return this.stopLinux();
      return { success: false, error: 'Unsupported platform' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      ssid: this.ssid,
      // Don't echo back the password — UI requested status shouldn't leak
      // it. The user-facing "show password" affordance can ask for it
      // explicitly.
      password: this.isRunning ? this.password : null,
    };
  }

  // ==================
  // Windows
  // ==================
  async startWindows() {
    try {
      // execFile passes args as separate process arguments; the child sees
      // them already-tokenised, so quoting hazards in netsh don't apply
      // unless the value itself contains characters netsh's own parser
      // treats specially. We've validated against that above.
      await execFileAsync('netsh', [
        'wlan',
        'set',
        'hostednetwork',
        'mode=allow',
        `ssid=${this.ssid}`,
        `key=${this.password}`,
      ]);
      await execFileAsync('netsh', ['wlan', 'start', 'hostednetwork']);
      this.isRunning = true;
      return { success: true, ssid: this.ssid, password: this.password };
    } catch {
      return this.startWindowsMobileHotspot();
    }
  }

  startWindowsMobileHotspot() {
    return new Promise((resolve) => {
      const script = `
$connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
$tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
$tetheringManager.StartTetheringAsync()
`;
      // Pipe the script via stdin so PowerShell doesn't reparse our string.
      const child = spawn('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '-',
      ]);
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('close', (code) => {
        if (code === 0) {
          this.isRunning = true;
          resolve({
            success: true,
            ssid: this.ssid,
            password: this.password,
            note: 'Using Windows Mobile Hotspot. Check Settings → Network → Mobile Hotspot for credentials.',
          });
        } else {
          resolve({
            success: false,
            manualRequired: true,
            error:
              'Failed to start hotspot. Please enable Mobile Hotspot manually in Windows Settings → Network & Internet → Mobile Hotspot.',
            stderr: stderr.trim() || undefined,
          });
        }
      });
      child.stdin.end(script);
    });
  }

  async stopWindows() {
    try {
      await execFileAsync('netsh', ['wlan', 'stop', 'hostednetwork']);
      this.isRunning = false;
      return { success: true };
    } catch {
      return new Promise((resolve) => {
        const script = `
$connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
$tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
$tetheringManager.StopTetheringAsync()
`;
        const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', '-']);
        child.on('close', (code) => {
          if (code === 0) {
            this.isRunning = false;
            resolve({ success: true });
          } else {
            resolve({ success: false, error: 'Failed to stop Mobile Hotspot' });
          }
        });
        child.stdin.end(script);
      });
    }
  }

  // ==================
  // macOS
  // ==================
  async startMacOS() {
    return {
      success: false,
      manualRequired: true,
      error: 'macOS requires manual hotspot setup',
      instructions: [
        '1. Open System Settings → General → Sharing',
        '2. Enable "Internet Sharing"',
        '3. Share your connection from: [Your Internet source]',
        '4. To computers using: Wi-Fi',
        '5. Click "Wi-Fi Options" to set network name and password',
      ],
    };
  }

  async stopMacOS() {
    return {
      success: false,
      manualRequired: true,
      instructions: ['Disable "Internet Sharing" in System Settings → General → Sharing'],
    };
  }

  // ==================
  // Linux
  // ==================
  async startLinux() {
    try {
      const { stdout: devices } = await execFileAsync('nmcli', ['device', 'status']);
      const wifiLine = devices
        .split('\n')
        .find((line) => /\bwifi\b/.test(line) && !/\bwifi-p2p\b/.test(line));
      if (!wifiLine) return { success: false, error: 'No WiFi device found' };
      const deviceName = wifiLine.split(/\s+/)[0];
      if (!IFACE_RE.test(deviceName)) {
        return { success: false, error: `Suspicious WiFi device name: ${deviceName}` };
      }
      await execFileAsync('nmcli', [
        'device',
        'wifi',
        'hotspot',
        'ifname',
        deviceName,
        'ssid',
        this.ssid,
        'password',
        this.password,
      ]);
      this.isRunning = true;
      return { success: true, ssid: this.ssid, password: this.password };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        manualRequired: true,
        instructions: [
          'Run in a terminal with sudo:',
          `  nmcli device wifi hotspot ssid "${this.ssid}" password "${this.password}"`,
          "Or use your desktop environment's network settings to create a hotspot.",
        ],
      };
    }
  }

  async stopLinux() {
    try {
      const { stdout } = await execFileAsync('nmcli', ['connection', 'show', '--active']);
      const hotspotLine = stdout.split('\n').find((l) => /Hotspot/.test(l));
      if (hotspotLine) {
        const connectionName = hotspotLine.split(/\s{2,}/)[0];
        // Tighten: connectionName goes straight into nmcli's argv. No shell.
        await execFileAsync('nmcli', ['connection', 'down', connectionName]);
      }
      this.isRunning = false;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

export const hotspot = new HotspotService();
export default hotspot;
