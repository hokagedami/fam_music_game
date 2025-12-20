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
function init() {
  // Setup initial UI
  ui.showPanel('home');
  ui.updateReturnToGameSection();

  // Setup event listeners
  setupEventListeners();

  // Check for join URL parameter
  checkJoinUrlParameter();
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
// QR CODE
// =========================

let qrCodeVisible = false;

/**
 * Toggle QR code display
 */
function toggleQRCode() {
  const qrContainer = getElementById('qr-code-container');
  if (!qrContainer) return;

  qrCodeVisible = !qrCodeVisible;

  if (qrCodeVisible) {
    generateQRCode();
    qrContainer.classList.remove('hidden');
  } else {
    qrContainer.classList.add('hidden');
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

// Assign to window - Utils
window.loadMusic = loadMusic;

// Assign to window - Connection
window.testConnection = socket.testConnection;

// Assign to window - Test helpers
window.__testSetMusicFiles = __testSetMusicFiles;

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
