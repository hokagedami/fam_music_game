/**
 * Main entry point for the client application
 * Initializes the app and exports functions to the global scope
 */

import * as state from './state.js';
import * as ui from './ui.js';
import * as audio from './audio.js';
import * as socket from './socket.js';
import * as singlePlayer from './singlePlayer.js';
import * as multiplayer from './multiplayer.js';
import * as kahoot from './kahoot.js';
import { copyToClipboard, getElementById, extractFileMetadataAsync } from './utils.js';
import * as electronBridge from './electronBridge.js';

// =========================
// INITIALIZATION
// =========================

/**
 * Initialize the application
 */
async function init() {
  // Setup initial UI
  ui.showPanel('home');
  ui.updateReturnToGameSection();

  // Setup event listeners
  setupEventListeners();

  // Initialize desktop features if running in Electron
  if (electronBridge.isElectron) {
    await initDesktopFeatures();
  }

  // Check for join URL parameter
  checkJoinUrlParameter();
}

/**
 * Initialize Electron desktop features
 */
async function initDesktopFeatures() {
  // Add is-electron class to body to enable desktop-only styles
  document.body.classList.add('is-electron');

  // Explicitly show all desktop-only elements by setting display style
  // Exclude elements that should remain hidden until triggered (like update banner)
  const desktopElements = document.querySelectorAll('.desktop-only:not(#update-banner)');
  desktopElements.forEach((el) => {
    el.classList.remove('hidden');
    // Let CSS handle the specific display type via grid
    el.style.display = 'block';
  });

  // Setup update action button (Electron only - installUpdate requires Electron)
  const updateActionBtn = getElementById('update-action-btn');
  if (updateActionBtn) {
    updateActionBtn.addEventListener('click', () => {
      electronBridge.installUpdate();
    });
  }

  // Setup update notifications
  electronBridge.onUpdateEvent('available', (data) => {
    showUpdateNotification('available', data);
  });

  electronBridge.onUpdateEvent('downloaded', (data) => {
    showUpdateNotification('downloaded', data);
  });

  // Load saved settings
  const savedSettings = await electronBridge.getAllSettings();
  if (savedSettings.lastGameSettings) {
    applyGameSettings(savedSettings.lastGameSettings);
  }

  // Get app version and display
  const version = await electronBridge.getAppVersion();
  const versionEl = getElementById('app-version');
  if (versionEl) {
    versionEl.textContent = `v${version}`;
  }

  console.log('Desktop features initialized');
}

/**
 * Show update notification banner
 * @param {string} type - 'available' or 'downloaded'
 * @param {Object} data - Update data
 */
function showUpdateNotification(type, data) {
  const banner = getElementById('update-banner');
  if (!banner) return;

  const message = getElementById('update-message');
  const button = getElementById('update-action-btn');

  if (type === 'available') {
    if (message) message.textContent = `Update available: ${data.version || 'new version'}`;
    if (button) {
      button.textContent = 'Downloading...';
      button.disabled = true;
    }
  } else if (type === 'downloaded') {
    if (message) message.textContent = `Update ready: ${data.version || 'new version'}`;
    if (button) {
      button.textContent = 'Restart to Update';
      button.disabled = false;
    }
  }

  banner.classList.remove('hidden');
}

/**
 * Apply saved game settings to form
 * @param {Object} settings - Settings object
 */
function applyGameSettings(settings) {
  if (settings.songsCount) {
    const el = getElementById('songs-count');
    if (el) el.value = settings.songsCount;
  }
  if (settings.clipDuration) {
    const el = getElementById('clip-duration');
    if (el) el.value = settings.clipDuration;
  }
  if (settings.answerTime) {
    const el = getElementById('answer-time');
    if (el) el.value = settings.answerTime;
  }
  if (settings.maxPlayers) {
    const el = getElementById('max-players');
    if (el) el.value = settings.maxPlayers;
  }
  if (typeof settings.autoplayNext === 'boolean') {
    const el = getElementById('autoplay-next');
    if (el) el.checked = settings.autoplayNext;
  }
  if (typeof settings.shuffleSongs === 'boolean') {
    const el = getElementById('shuffle-songs');
    if (el) el.checked = settings.shuffleSongs;
  }
}

/**
 * Setup global event listeners
 */
function setupEventListeners() {
  // Music file input listeners - check multiple possible IDs
  const musicInputIds = [
    'single-music-input',
    'music-input',
    'music-files',
    'music-folder',
    'multiplayer-music-input',
  ];

  musicInputIds.forEach((id) => {
    const input = getElementById(id);
    if (input) {
      input.addEventListener('change', (e) => {
        const type = id.includes('single') ? 'single' : 'multiplayer';
        loadMusic(e, type);
      });
    }
  });

  // Setup settings button handlers
  setupSettingsButtons();

  // Setup update banner buttons (works in both Electron and web)
  const dismissUpdateBtn = getElementById('dismiss-update-btn');
  if (dismissUpdateBtn) {
    dismissUpdateBtn.addEventListener('click', () => {
      const banner = getElementById('update-banner');
      if (banner) {
        banner.classList.add('hidden');
      }
    });
  }
}

/**
 * Setup click handlers for visual settings buttons
 */
function setupSettingsButtons() {
  const settingMappings = [
    { container: 'songs-options', select: 'songs-count' },
    { container: 'duration-options', select: 'clip-duration' },
    { container: 'answer-options', select: 'answer-time' },
    { container: 'players-options', select: 'max-players' },
    { container: 'difficulty-options', select: 'difficulty' },
  ];

  settingMappings.forEach(({ container, select }) => {
    const containerEl = getElementById(container);
    const selectEl = getElementById(select);

    if (containerEl && selectEl) {
      containerEl.querySelectorAll('.setting-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          // Update active state
          containerEl.querySelectorAll('.setting-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');

          // Update hidden select
          selectEl.value = btn.dataset.value;
        });
      });
    }
  });
}

/**
 * Check URL for join parameter
 */
function checkJoinUrlParameter() {
  const urlParams = new URLSearchParams(window.location.search);
  const joinGameId = urlParams.get('join');

  if (joinGameId && joinGameId.length === 6) {
    // Auto-fill join form
    state.setCurrentMode('multiplayer');
    socket.initializeSocket();
    ui.showPanel('join');

    const gameIdInput = getElementById('game-id-input');
    if (gameIdInput) {
      gameIdInput.value = joinGameId.toUpperCase();
    }
  }
}

// =========================
// MUSIC LOADING
// =========================

/**
 * Load music files from file input
 * @param {Event} event
 * @param {string} type - 'folder', 'files', 'single', or 'multiplayer'
 */
async function loadMusic(event, type) {
  const input = event.target;
  if (!input.files || input.files.length === 0) return;

  ui.showLoading('Loading music files and reading metadata...');

  const files = Array.from(input.files);
  const audioFiles = files.filter(
    (file) => file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i)
  );

  // Extract metadata from all files in parallel (async - reads ID3 tags)
  const musicFiles = await Promise.all(
    audioFiles.map((file) => extractFileMetadataAsync(file))
  );

  state.setMusicFiles(musicFiles);

  // Map legacy types to display types based on current mode
  const displayType =
    type === 'single' || state.currentMode === 'single-player' ? 'single' : 'multiplayer';
  ui.displayMusicFileList(displayType);

  // Show settings section after loading music
  const settingsSection = getElementById('music-settings-section');
  if (settingsSection) {
    settingsSection.classList.remove('hidden');
  }

  // Enable start button - try multiple possible IDs
  const buttonIds = ['start-single-game-btn', 'start-game-button', 'start-game-btn'];
  buttonIds.forEach((buttonId) => {
    const startButton = getElementById(buttonId);
    if (startButton) {
      startButton.disabled = musicFiles.length === 0;
    }
  });

  ui.hideLoading();
  ui.showNotification(`Loaded ${musicFiles.length} songs`, 'success');
}

/**
 * Test function for Playwright tests to set mock music files
 * @param {Array} mockFiles
 * @returns {number}
 */
function __testSetMusicFiles(mockFiles) {
  state.setMusicFiles(mockFiles);

  // Display the file list
  const displayType = state.currentMode === 'single-player' ? 'single' : 'multiplayer';
  ui.displayMusicFileList(displayType);

  // Show settings section (required for tests to access start button)
  const settingsSection = getElementById('music-settings-section');
  if (settingsSection) {
    settingsSection.classList.remove('hidden');
  }

  // Enable start buttons
  const buttonIds = ['start-single-game-btn', 'start-game-button', 'start-game-btn'];
  buttonIds.forEach((buttonId) => {
    const startButton = getElementById(buttonId);
    if (startButton) {
      startButton.disabled = mockFiles.length === 0;
    }
  });

  return mockFiles.length;
}

// =========================
// NAVIGATION
// =========================

/**
 * Show a panel by name - wrapper for ui.showPanel
 * @param {string} panelName
 */
function showPanel(panelName) {
  ui.showPanel(panelName);
}

/**
 * Go to home panel
 */
function goHome() {
  state.setCurrentMode('menu');
  ui.showPanel('home');
}

/**
 * Return to an active game (reconnection)
 */
function returnToGame() {
  const savedState = localStorage.getItem('musicQuizReconnectState');
  if (savedState) {
    try {
      const reconnectData = JSON.parse(savedState);
      if (reconnectData.gameId) {
        socket.initializeSocket();
        // Socket will handle rejoin automatically
        ui.showNotification('Reconnecting to game...', 'info');
      }
    } catch {
      ui.showNotification('Could not reconnect', 'error');
    }
  }
}

/**
 * Emergency reset - clear all state and return to home
 */
function emergencyReset() {
  audio.stopCurrentAudio();
  state.resetAllState();
  socket.disconnectSocket();
  localStorage.clear();
  ui.showPanel('home');
  ui.showNotification('Game reset!', 'info');
}

// =========================
// SINGLE PLAYER WRAPPERS
// =========================

// Alias for skipSinglePlayerSong (HTML uses skipSingleSong)
function skipSingleSong() {
  singlePlayer.skipSinglePlayerSong();
}

// =========================
// MULTIPLAYER WRAPPERS
// =========================

/**
 * Start game - used by the setup panel button
 * Routes to single player or multiplayer based on current mode
 */
function startGame() {
  if (state.currentMode === 'single-player') {
    singlePlayer.startSinglePlayerGame();
  } else {
    multiplayer.createGame();
  }
}

// =========================
// DESKTOP FEATURES (Electron)
// =========================

/**
 * Open settings modal
 */
function openSettings() {
  const modal = getElementById('settings-modal');
  if (modal) {
    modal.classList.remove('hidden');
    loadSettingsUI();
  }
}

/**
 * Close settings modal
 */
function closeSettings() {
  const modal = getElementById('settings-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Load settings into the UI
 */
async function loadSettingsUI() {
  if (!electronBridge.isElectron) return;

  // Load persistence setting
  const persistHistory = await electronBridge.getSetting('persistHistory');
  const persistToggle = getElementById('persist-history-toggle');
  if (persistToggle) {
    persistToggle.checked = persistHistory || false;
  }

  // Load music library paths
  const paths = await electronBridge.getMusicLibraryPaths();
  const pathsList = getElementById('music-library-paths');
  if (pathsList) {
    pathsList.innerHTML = '';
    paths.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'library-path-item';
      item.innerHTML = `
        <span class="path-text">${p}</span>
        <button class="btn btn-danger btn-small" onclick="removeMusicLibraryPath('${p.replace(/'/g, "\\'")}')">Remove</button>
      `;
      pathsList.appendChild(item);
    });
  }

  // Load server mode settings
  const serverModeData = await electronBridge.getServerMode();
  const localRadio = getElementById('server-mode-local');
  const remoteRadio = getElementById('server-mode-remote');
  const remoteUrlInput = getElementById('remote-server-url');
  const remoteUrlGroup = getElementById('remote-url-group');

  if (localRadio && remoteRadio) {
    if (serverModeData.mode === 'remote') {
      remoteRadio.checked = true;
      localRadio.checked = false;
    } else {
      localRadio.checked = true;
      remoteRadio.checked = false;
    }
  }

  if (remoteUrlInput) {
    remoteUrlInput.value = serverModeData.remoteUrl || '';
  }

  if (remoteUrlGroup) {
    remoteUrlGroup.style.display = serverModeData.mode === 'remote' ? 'block' : 'none';
  }

  // Hide restart notice initially
  const restartNotice = getElementById('server-restart-notice');
  if (restartNotice) {
    restartNotice.style.display = 'none';
  }
}

/**
 * Toggle game history persistence
 */
async function togglePersistHistory() {
  if (!electronBridge.isElectron) return;

  const toggle = getElementById('persist-history-toggle');
  const enabled = toggle?.checked || false;
  await electronBridge.setSetting('persistHistory', enabled);
  ui.showNotification(enabled ? 'Game history will be saved' : 'Game history disabled', 'info');
}

/**
 * Add a music library folder
 */
async function addMusicLibraryFolder() {
  if (!electronBridge.isElectron) return;

  const folderPath = await electronBridge.selectFolder();
  if (folderPath) {
    await electronBridge.addMusicLibraryPath(folderPath);
    loadSettingsUI();
    ui.showNotification('Folder added to library', 'success');
  }
}

/**
 * Remove a music library path
 * @param {string} path - Path to remove
 */
async function removeMusicLibraryPath(path) {
  if (!electronBridge.isElectron) return;

  await electronBridge.removeMusicLibraryPath(path);
  loadSettingsUI();
  ui.showNotification('Folder removed from library', 'info');
}

/**
 * Scan all music library folders and load songs
 */
async function scanMusicLibrary() {
  if (!electronBridge.isElectron) return;

  const paths = await electronBridge.getMusicLibraryPaths();
  if (paths.length === 0) {
    ui.showNotification('No music folders added. Add folders in settings.', 'error');
    return;
  }

  ui.showLoading('Scanning music library...');

  const unsubscribe = electronBridge.onScanProgress((progress) => {
    ui.showLoading(`Scanning: ${progress.currentFile} (${progress.percentage}%)`);
  });

  try {
    const allSongs = [];
    for (const folderPath of paths) {
      const result = await electronBridge.scanMusicFolder(folderPath);
      if (result.success && result.songs) {
        allSongs.push(...result.songs);
      }
    }

    if (allSongs.length > 0) {
      // Convert to format expected by the game
      const musicFiles = allSongs.map((song) => ({
        name: song.fileName,
        file: null, // No File object for local files
        url: song.url,
        metadata: song.metadata,
      }));

      state.setMusicFiles(musicFiles);
      ui.displayMusicFileList(state.currentMode === 'single-player' ? 'single' : 'multiplayer');

      const settingsSection = getElementById('music-settings-section');
      if (settingsSection) {
        settingsSection.classList.remove('hidden');
      }

      ui.showNotification(`Loaded ${allSongs.length} songs from library`, 'success');
    } else {
      ui.showNotification('No music files found in library folders', 'error');
    }
  } catch (error) {
    console.error('Scan error:', error);
    ui.showNotification('Failed to scan music library', 'error');
  } finally {
    unsubscribe();
    ui.hideLoading();
  }
}

/**
 * Download music from a zip URL
 */
async function downloadMusicFromUrl() {
  if (!electronBridge.isElectron) return;

  const urlInput = getElementById('download-url-input');
  const url = urlInput?.value?.trim();

  if (!url) {
    ui.showNotification('Please enter a URL', 'error');
    return;
  }

  ui.showLoading('Downloading music...');

  const unsubscribe = electronBridge.onDownloadProgress((progress) => {
    if (progress.phase === 'downloading') {
      ui.showLoading(`Downloading: ${progress.percentage}%`);
    } else if (progress.phase === 'extracting') {
      ui.showLoading('Extracting files...');
    } else if (progress.phase === 'scanning') {
      ui.showLoading(`Scanning: ${progress.currentFile || ''}`);
    }
  });

  try {
    const result = await electronBridge.downloadMusicZip(url);

    if (result.success && result.songs) {
      // Convert to format expected by the game
      const musicFiles = result.songs.map((song) => ({
        name: song.fileName,
        file: null,
        url: song.url,
        metadata: song.metadata,
      }));

      state.setMusicFiles(musicFiles);
      ui.displayMusicFileList(state.currentMode === 'single-player' ? 'single' : 'multiplayer');

      const settingsSection = getElementById('music-settings-section');
      if (settingsSection) {
        settingsSection.classList.remove('hidden');
      }

      ui.showNotification(`Downloaded ${result.songs.length} songs`, 'success');
      if (urlInput) urlInput.value = '';
    } else {
      ui.showNotification(result.error || 'Download failed', 'error');
    }
  } catch (error) {
    console.error('Download error:', error);
    ui.showNotification('Failed to download music', 'error');
  } finally {
    unsubscribe();
    ui.hideLoading();
  }
}

/**
 * Clear game history
 */
async function clearHistory() {
  if (!electronBridge.isElectron) return;

  if (confirm('Are you sure you want to clear all game history?')) {
    await electronBridge.clearGameHistory();
    ui.showNotification('Game history cleared', 'info');
  }
}

/**
 * Check for updates manually
 */
async function checkUpdates() {
  if (!electronBridge.isElectron) return;

  ui.showNotification('Checking for updates...', 'info');
  await electronBridge.checkForUpdates();
}

/**
 * Update server mode setting
 */
async function updateServerMode() {
  if (!electronBridge.isElectron) return;

  const localRadio = getElementById('server-mode-local');
  const mode = localRadio?.checked ? 'local' : 'remote';
  const remoteUrlInput = getElementById('remote-server-url');
  const remoteUrl = remoteUrlInput?.value?.trim() || '';

  // Toggle remote URL field visibility
  const remoteUrlGroup = getElementById('remote-url-group');
  if (remoteUrlGroup) {
    remoteUrlGroup.style.display = mode === 'remote' ? 'block' : 'none';
  }

  // Show restart notice
  const restartNotice = getElementById('server-restart-notice');
  if (restartNotice) {
    restartNotice.style.display = 'block';
  }

  await electronBridge.setServerMode(mode, remoteUrl);
}

/**
 * Update remote server URL
 */
async function updateRemoteUrl() {
  if (!electronBridge.isElectron) return;

  const remoteUrlInput = getElementById('remote-server-url');
  const remoteUrl = remoteUrlInput?.value?.trim() || '';
  await electronBridge.setServerMode('remote', remoteUrl);

  // Show restart notice
  const restartNotice = getElementById('server-restart-notice');
  if (restartNotice) {
    restartNotice.style.display = 'block';
  }
}

/**
 * Restart the app to apply server mode changes
 */
async function restartApp() {
  if (!electronBridge.isElectron) return;

  await electronBridge.restartApp();
}

// =========================
// QR CODE
// =========================

let qrCodeVisible = false;

/**
 * Toggle QR code display
 */
function toggleQRCode() {
  const qrContainer = getElementById('qr-code-container');
  const toggleBtn = getElementById('qr-toggle-btn');
  if (!qrContainer) return;

  qrCodeVisible = !qrCodeVisible;

  if (qrCodeVisible) {
    generateQRCode();
    qrContainer.classList.remove('hidden');
    if (toggleBtn) toggleBtn.textContent = 'Hide QR Code';
  } else {
    qrContainer.classList.add('hidden');
    if (toggleBtn) toggleBtn.textContent = 'Show QR Code';
  }
}

/**
 * Generate QR code for joining game
 */
function generateQRCode() {
  if (!state.gameId) return;

  const joinUrl = `${window.location.origin}?join=${state.gameId}`;

  // Use QRCode library if available
  const qrContainer = getElementById('qr-code');
  if (qrContainer && typeof window.QRCode !== 'undefined') {
    qrContainer.innerHTML = '';
    new window.QRCode(qrContainer, {
      text: joinUrl,
      width: 200,
      height: 200,
    });
  }

  const joinUrlEl = getElementById('join-url');
  if (joinUrlEl) {
    joinUrlEl.textContent = joinUrl;
  }

  // Also update LAN connection info if in Electron
  updateLanConnectionInfo();
}

// =========================
// LAN CONNECTION (Desktop)
// =========================

/**
 * Update LAN connection info for desktop app
 */
async function updateLanConnectionInfo() {
  if (!electronBridge.isElectron) return;

  const lanInfoSection = getElementById('lan-connection-info');
  const lanUrlEl = getElementById('lan-url');

  if (!lanInfoSection || !lanUrlEl) return;

  try {
    // Use refreshLanUrl to get the latest IP (important after hotspot starts)
    let lanUrl = await electronBridge.refreshLanUrl();
    if (!lanUrl) {
      lanUrl = await electronBridge.getLanUrl();
    }

    if (lanUrl && state.gameId) {
      const fullLanUrl = `${lanUrl}?join=${state.gameId}`;
      lanUrlEl.textContent = fullLanUrl;
      lanInfoSection.classList.remove('hidden');

      // Also update QR code to use LAN URL
      const qrUrlText = getElementById('qr-url-text');
      if (qrUrlText) {
        qrUrlText.textContent = fullLanUrl;
      }

      // Regenerate QR code with new URL
      const qrContainer = getElementById('qr-code');
      if (qrContainer && typeof window.QRCode !== 'undefined' && qrContainer.innerHTML) {
        qrContainer.innerHTML = '';
        new window.QRCode(qrContainer, {
          text: fullLanUrl,
          width: 200,
          height: 200,
        });
      }
    }
  } catch (error) {
    console.error('Failed to get LAN URL:', error);
  }
}

/**
 * Copy LAN URL to clipboard
 */
async function copyLanUrl() {
  const lanUrlEl = getElementById('lan-url');
  if (lanUrlEl && lanUrlEl.textContent) {
    await copyToClipboard(lanUrlEl.textContent);
    ui.showNotification('LAN URL copied to clipboard!', 'success');
  }
}

// =========================
// OFFLINE MULTIPLAYER (Desktop)
// =========================

/**
 * Start offline multiplayer mode
 * Creates hotspot and then proceeds to multiplayer setup
 */
async function startOfflineMultiplayer() {
  if (!electronBridge.isElectron) {
    ui.showNotification('Offline multiplayer is only available in the desktop app', 'error');
    return;
  }

  // Always show the setup modal - it will handle both auto and manual hotspot setup
  showOfflineSetupModal();
}

/**
 * Show offline multiplayer setup modal
 */
function showOfflineSetupModal() {
  const modal = getElementById('offline-setup-modal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

/**
 * Close offline setup modal
 */
function closeOfflineSetupModal() {
  const modal = getElementById('offline-setup-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Start hotspot and proceed to game setup
 */
async function proceedWithOfflineMultiplayer() {
  const ssidInput = getElementById('offline-hotspot-ssid');
  const passwordInput = getElementById('offline-hotspot-password');
  const proceedBtn = getElementById('offline-proceed-btn');

  const ssid = ssidInput?.value?.trim() || 'FAM Music Quiz';
  const password = passwordInput?.value?.trim() || 'playmusic';

  if (password.length < 8) {
    ui.showNotification('Password must be at least 8 characters', 'error');
    return;
  }

  if (proceedBtn) {
    proceedBtn.disabled = true;
    proceedBtn.textContent = 'Setting up...';
  }

  try {
    // Try to create hotspot
    const result = await electronBridge.hotspotStart(ssid, password);

    if (result.success) {
      ui.showNotification('Hotspot created! Setting up game...', 'success');
    } else {
      // Hotspot failed - show manual instructions but continue anyway
      ui.showNotification(
        'Hotspot auto-setup failed. Please enable Mobile Hotspot manually in Windows Settings, then share the game link.',
        'info',
        8000
      );
    }

    // Always proceed to multiplayer - the LAN URL will be shown there
    closeOfflineSetupModal();
    multiplayer.startMultiplayer();

  } catch (error) {
    console.error('Offline multiplayer error:', error);
    // Even on error, proceed to multiplayer with manual hotspot instructions
    ui.showNotification(
      'Enable Mobile Hotspot manually in Windows Settings > Network > Mobile Hotspot',
      'info',
      8000
    );
    closeOfflineSetupModal();
    multiplayer.startMultiplayer();
  }
}

/**
 * Skip hotspot creation and go directly to LAN multiplayer
 */
function skipHotspotSetup() {
  ui.showNotification(
    'Skipped hotspot. Make sure all players are on the same network.',
    'info'
  );
  closeOfflineSetupModal();
  multiplayer.startMultiplayer();
}

/**
 * Toggle manual file upload area visibility (desktop only)
 */
function toggleManualUpload() {
  const uploadArea = getElementById('manual-upload-area');
  const toggleBtn = document.querySelector('.toggle-manual-upload');

  if (uploadArea) {
    uploadArea.classList.toggle('show');
    if (toggleBtn) {
      toggleBtn.textContent = uploadArea.classList.contains('show')
        ? 'Hide manual file selection'
        : 'Show manual file selection';
    }
  }
}

// =========================
// HOTSPOT (Desktop)
// =========================

/**
 * Check and show hotspot section if available
 */
async function initHotspotSection() {
  if (!electronBridge.isElectron) return;

  const hotspotSection = getElementById('hotspot-section');
  if (!hotspotSection) return;

  const availability = await electronBridge.hotspotCheckAvailability();

  if (availability.available) {
    hotspotSection.classList.remove('hidden');

    // Check if hotspot is already running
    const status = await electronBridge.hotspotStatus();
    if (status.isRunning) {
      showHotspotActive(status.ssid, status.password);
    }
  } else if (availability.reason) {
    // Show section with manual instructions if needed
    hotspotSection.classList.remove('hidden');
    const configEl = getElementById('hotspot-config');
    const manualEl = getElementById('hotspot-manual');
    const instructionsList = getElementById('hotspot-instructions-list');

    if (configEl) configEl.classList.add('hidden');
    if (manualEl && instructionsList) {
      manualEl.classList.remove('hidden');
      instructionsList.innerHTML = `<li>${availability.reason}</li>`;
    }
  }
}

/**
 * Start WiFi hotspot
 */
async function startHotspot() {
  if (!electronBridge.isElectron) return;

  const ssidInput = getElementById('hotspot-ssid');
  const passwordInput = getElementById('hotspot-password');
  const startBtn = getElementById('hotspot-start-btn');

  const ssid = ssidInput?.value?.trim() || 'FAM Music Quiz';
  const password = passwordInput?.value?.trim() || 'playmusic';

  if (password.length < 8) {
    ui.showNotification('Password must be at least 8 characters', 'error');
    return;
  }

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'Creating...';
  }

  try {
    const result = await electronBridge.hotspotStart(ssid, password);

    if (result.success) {
      showHotspotActive(result.ssid, result.password);
      ui.showNotification('Hotspot created! Players can now connect.', 'success');

      // Wait a moment for network interface to be ready, then refresh LAN URL
      setTimeout(async () => {
        await updateLanConnectionInfo();
      }, 2000);
    } else if (result.manualRequired) {
      showHotspotManual(result.instructions || [result.error]);
      ui.showNotification('Manual setup required - see instructions', 'info');
    } else {
      ui.showNotification(result.error || 'Failed to create hotspot', 'error');
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = 'Create Hotspot';
      }
    }
  } catch (error) {
    console.error('Hotspot error:', error);
    ui.showNotification('Failed to create hotspot', 'error');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Create Hotspot';
    }
  }
}

/**
 * Stop WiFi hotspot
 */
async function stopHotspot() {
  if (!electronBridge.isElectron) return;

  try {
    const result = await electronBridge.hotspotStop();

    if (result.success) {
      showHotspotConfig();
      ui.showNotification('Hotspot stopped', 'info');
    } else if (result.manualRequired) {
      showHotspotManual(result.instructions || ['Please stop the hotspot manually']);
    } else {
      ui.showNotification(result.error || 'Failed to stop hotspot', 'error');
    }
  } catch (error) {
    console.error('Hotspot stop error:', error);
    ui.showNotification('Failed to stop hotspot', 'error');
  }
}

/**
 * Show hotspot active state
 */
function showHotspotActive(ssid, password) {
  const configEl = getElementById('hotspot-config');
  const activeEl = getElementById('hotspot-active');
  const manualEl = getElementById('hotspot-manual');
  const ssidEl = getElementById('hotspot-active-ssid');
  const passwordEl = getElementById('hotspot-active-password');

  if (configEl) configEl.classList.add('hidden');
  if (manualEl) manualEl.classList.add('hidden');
  if (activeEl) activeEl.classList.remove('hidden');
  if (ssidEl) ssidEl.textContent = ssid;
  if (passwordEl) passwordEl.textContent = password;
}

/**
 * Show hotspot config state
 */
function showHotspotConfig() {
  const configEl = getElementById('hotspot-config');
  const activeEl = getElementById('hotspot-active');
  const manualEl = getElementById('hotspot-manual');
  const startBtn = getElementById('hotspot-start-btn');

  if (configEl) configEl.classList.remove('hidden');
  if (activeEl) activeEl.classList.add('hidden');
  if (manualEl) manualEl.classList.add('hidden');
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = 'Create Hotspot';
  }
}

/**
 * Show manual instructions
 */
function showHotspotManual(instructions) {
  const configEl = getElementById('hotspot-config');
  const activeEl = getElementById('hotspot-active');
  const manualEl = getElementById('hotspot-manual');
  const instructionsList = getElementById('hotspot-instructions-list');

  if (configEl) configEl.classList.add('hidden');
  if (activeEl) activeEl.classList.add('hidden');
  if (manualEl) manualEl.classList.remove('hidden');

  if (instructionsList && Array.isArray(instructions)) {
    instructionsList.innerHTML = instructions.map(i => `<li>${i}</li>`).join('');
  }
}

// =========================
// EXPORT TO GLOBAL SCOPE
// =========================

// Assign to window - Navigation
window.showPanel = showPanel;
window.goHome = goHome;
window.returnToGame = returnToGame;
window.emergencyReset = emergencyReset;

// Assign to window - Single Player
window.startSinglePlayerMode = singlePlayer.startSinglePlayerMode;
window.startSinglePlayerGame = singlePlayer.startSinglePlayerGame;
window.skipSingleSong = skipSingleSong;
window.skipSinglePlayerSong = singlePlayer.skipSinglePlayerSong;
window.replaySingleClip = singlePlayer.replaySingleClip;
window.showSingleHints = singlePlayer.showSingleHints;
window.revealSingleAnswer = singlePlayer.revealSingleAnswer;
window.playAgainSingle = singlePlayer.playAgainSingle;
window.exportResults = singlePlayer.exportSinglePlayerResults;

// Assign to window - Multiplayer
window.startMultiplayer = multiplayer.startMultiplayer;
window.showJoinGame = multiplayer.showJoinGame;
window.createGame = multiplayer.createGame;
window.startGame = startGame;
window.joinGame = multiplayer.joinGame;
window.startMultiplayerGame = multiplayer.startMultiplayerGame;
window.copyGameId = multiplayer.copyGameId;
window.hostShowOptions = multiplayer.hostShowOptions;
window.revealAnswerAndNext = multiplayer.revealAnswerAndNext;
window.nextSong = multiplayer.nextSong;
window.replayClip = multiplayer.replayClip;
window.leaveGame = multiplayer.leaveGame;
window.kickPlayer = multiplayer.kickPlayer;
window.playAgain = multiplayer.playAgain;

// Assign to window - Kahoot
window.selectKahootOption = kahoot.selectKahootOption;
window.selectKahootOptionMultiplayer = kahoot.selectKahootOptionMultiplayer;

// Assign to window - UI
window.toggleScoreboard = ui.toggleScoreboard;
window.closeScoreboard = ui.closeScoreboard;
window.toggleQRCode = toggleQRCode;
window.copyLanUrl = copyLanUrl;
window.updateLanConnectionInfo = updateLanConnectionInfo;
window.startHotspot = startHotspot;
window.stopHotspot = stopHotspot;
window.initHotspotSection = initHotspotSection;
window.startOfflineMultiplayer = startOfflineMultiplayer;
window.closeOfflineSetupModal = closeOfflineSetupModal;
window.proceedWithOfflineMultiplayer = proceedWithOfflineMultiplayer;
window.skipHotspotSetup = skipHotspotSetup;
window.toggleManualUpload = toggleManualUpload;

// Assign to window - Utils
window.loadMusic = loadMusic;

// Assign to window - Connection
window.testConnection = socket.testConnection;

// Assign to window - Test helpers
window.__testSetMusicFiles = __testSetMusicFiles;
window.state = state; // Expose state for testing

// Assign to window - Desktop features (Electron)
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.togglePersistHistory = togglePersistHistory;
window.addMusicLibraryFolder = addMusicLibraryFolder;
window.removeMusicLibraryPath = removeMusicLibraryPath;
window.scanMusicLibrary = scanMusicLibrary;
window.downloadMusicFromUrl = downloadMusicFromUrl;
window.clearHistory = clearHistory;
window.checkUpdates = checkUpdates;
window.updateServerMode = updateServerMode;
window.updateRemoteUrl = updateRemoteUrl;
window.restartApp = restartApp;
window.isElectron = electronBridge.isElectron;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for module usage
export {
  init,
  loadMusic,
  showPanel,
  goHome,
  returnToGame,
  emergencyReset,
  toggleQRCode,
  __testSetMusicFiles,
};
