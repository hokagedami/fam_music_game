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

  // Check for URL parameters (?game= for auto-rejoin, ?join= for form pre-fill)
  checkGameUrlParameter();

  // Auto-initialize socket if there's saved reconnection state
  // This enables automatic rejoin on page reload
  const savedState = localStorage.getItem('musicQuizReconnectState');
  if (savedState) {
    try {
      const reconnectData = JSON.parse(savedState);
      if (reconnectData.gameId && (reconnectData.reconnectToken || reconnectData.playerName)) {
        socket.initializeSocket();
      }
    } catch {
      // Invalid saved state, ignore
    }
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
 * Check URL for game/join parameters
 * - ?game=GAMEID: auto-rejoin if we have a reconnect token, otherwise pre-fill join form
 * - ?join=GAMEID: pre-fill join form (legacy support)
 */
function checkGameUrlParameter() {
  const urlParams = new URLSearchParams(window.location.search);
  const gameId = urlParams.get('game') || urlParams.get('join');

  if (!gameId || gameId.length !== 6) return;

  const upperGameId = gameId.toUpperCase();

  // Check if we have a saved reconnect token for this game
  const savedState = localStorage.getItem('musicQuizReconnectState');
  if (savedState) {
    try {
      const reconnectData = JSON.parse(savedState);
      if (
        reconnectData.gameId === upperGameId &&
        reconnectData.reconnectToken
      ) {
        // We have a token — auto-rejoin will happen when socket connects
        // (the 'connect' handler in socket.js calls attemptRejoinGame)
        state.setCurrentMode('multiplayer');
        socket.initializeSocket();
        ui.showNotification('Reconnecting to game...', 'info');
        return;
      }
    } catch {
      // Invalid saved state
    }
  }

  // No token — show join form pre-filled with the game ID
  state.setCurrentMode('multiplayer');
  socket.initializeSocket();
  ui.showPanel('join');

  const gameIdInput = getElementById('game-id-input');
  if (gameIdInput) {
    gameIdInput.value = upperGameId;
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
        state.setCurrentMode('multiplayer');
        const sock = socket.initializeSocket();

        // If already connected, attempt rejoin directly
        // (the 'connect' event won't fire again for an existing connection)
        if (sock && sock.connected) {
          socket.attemptRejoinFromSavedState();
        }

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
}

// =========================
// EXPORT TO GLOBAL SCOPE
// =========================

/**
 * Define a non-writable global to prevent silent naming collisions.
 * In strict mode, attempts to overwrite will throw; otherwise they silently fail.
 */
function defineGlobal(name, value) {
  Object.defineProperty(window, name, { value, writable: false, configurable: false });
}

// Navigation
defineGlobal('showPanel', showPanel);
defineGlobal('goHome', goHome);
defineGlobal('returnToGame', returnToGame);
defineGlobal('emergencyReset', emergencyReset);

// Single Player
defineGlobal('startSinglePlayerMode', singlePlayer.startSinglePlayerMode);
defineGlobal('startSinglePlayerGame', singlePlayer.startSinglePlayerGame);
defineGlobal('skipSingleSong', skipSingleSong);
defineGlobal('skipSinglePlayerSong', singlePlayer.skipSinglePlayerSong);
defineGlobal('replaySingleClip', singlePlayer.replaySingleClip);
defineGlobal('showSingleHints', singlePlayer.showSingleHints);
defineGlobal('revealSingleAnswer', singlePlayer.revealSingleAnswer);
defineGlobal('playAgainSingle', singlePlayer.playAgainSingle);
defineGlobal('exportResults', singlePlayer.exportSinglePlayerResults);

// Multiplayer
defineGlobal('startMultiplayer', multiplayer.startMultiplayer);
defineGlobal('showJoinGame', multiplayer.showJoinGame);
defineGlobal('createGame', multiplayer.createGame);
defineGlobal('startGame', startGame);
defineGlobal('joinGame', multiplayer.joinGame);
defineGlobal('startMultiplayerGame', multiplayer.startMultiplayerGame);
defineGlobal('copyGameId', multiplayer.copyGameId);
defineGlobal('hostShowOptions', multiplayer.hostShowOptions);
defineGlobal('revealAnswerAndNext', multiplayer.revealAnswerAndNext);
defineGlobal('nextSong', multiplayer.nextSong);
defineGlobal('replayClip', multiplayer.replayClip);
defineGlobal('leaveGame', multiplayer.leaveGame);
defineGlobal('kickPlayer', multiplayer.kickPlayer);
defineGlobal('playAgain', multiplayer.playAgain);

// Kahoot
defineGlobal('selectKahootOption', kahoot.selectKahootOption);
defineGlobal('selectKahootOptionMultiplayer', kahoot.selectKahootOptionMultiplayer);

// UI
defineGlobal('toggleScoreboard', ui.toggleScoreboard);
defineGlobal('closeScoreboard', ui.closeScoreboard);
defineGlobal('toggleQRCode', toggleQRCode);
defineGlobal('toggleSongListModal', ui.toggleSongListModal);
defineGlobal('toggleMusicUpload', ui.toggleMusicUpload);
defineGlobal('updateLobbyDisplay', ui.updateLobbyDisplay);

// Utils
defineGlobal('loadMusic', loadMusic);

// Connection
defineGlobal('testConnection', socket.testConnection);

// Test helpers (writable, for test framework overrides)
window.__testSetMusicFiles = __testSetMusicFiles;
window.state = state;

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
