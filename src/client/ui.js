/**
 * UI/DOM manipulation functions
 */

import * as state from './state.js';
import { getElementById, querySelector, querySelectorAll } from './utils.js';

// =========================
// NOTIFICATIONS
// =========================

export function showNotification(message, type = 'success') {
  const notification = getElementById('notification');
  if (!notification) return;

  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.add('show');

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// =========================
// LOADING STATES
// =========================

export function showLoading(text = 'Loading...') {
  const loadingEl = getElementById('loading');
  const loadingText = getElementById('loading-text');
  if (loadingEl) loadingEl.classList.add('show');
  if (loadingText) loadingText.textContent = text;
}

export function hideLoading() {
  const loadingEl = getElementById('loading');
  if (loadingEl) loadingEl.classList.remove('show');
}

// =========================
// PANEL MANAGEMENT
// =========================

// Map panel names to their IDs - supports both short and full names
const panelIds = {
  'home': 'home-panel',
  'home-panel': 'home-panel',
  'setup': 'setup-panel',
  'setup-panel': 'setup-panel',
  'single-game': 'game-panel',
  'single-game-panel': 'game-panel',
  'single-results': 'results-panel',
  'single-results-panel': 'results-panel',
  'multiplayer-setup': 'setup-panel',
  'multiplayer-setup-panel': 'setup-panel',
  'join': 'join-panel',
  'join-panel': 'join-panel',
  'lobby': 'lobby-panel',
  'lobby-panel': 'lobby-panel',
  'game': 'game-panel',
  'game-panel': 'game-panel',
  'results': 'results-panel',
  'results-panel': 'results-panel',
};

export function showPanel(panelName) {
  // Hide all panels
  const panels = querySelectorAll('.panel');
  panels.forEach((panel) => panel.classList.add('hidden'));

  // Show requested panel
  const panelId = panelIds[panelName] || `${panelName}-panel`;
  const panel = getElementById(panelId);
  if (panel) {
    panel.classList.remove('hidden');
  } else {
    // Try with -panel suffix
    const panelWithSuffix = getElementById(`${panelName}-panel`);
    if (panelWithSuffix) {
      panelWithSuffix.classList.remove('hidden');
    }
  }

  // Update header based on panel
  updateHeader();

  // Force hide scoreboard when changing panels
  forceHideScoreboard();
}

export function updateHeader() {
  const headerTitle = getElementById('header-title');
  const headerSubtitle = getElementById('header-subtitle');

  if (!headerTitle || !headerSubtitle) return;

  switch (state.currentMode) {
    case 'single-player':
      headerTitle.textContent = 'Single Player Mode';
      headerSubtitle.textContent = 'Test your music knowledge!';
      break;
    case 'multiplayer':
      headerTitle.textContent = 'Multiplayer Mode';
      headerSubtitle.textContent = state.gameId ? `Game: ${state.gameId}` : 'Create or join a game';
      break;
    default:
      headerTitle.textContent = 'Music Quiz';
      headerSubtitle.textContent = 'Test your music knowledge!';
  }
}

// =========================
// CONNECTION STATUS
// =========================

export function updateConnectionStatus() {
  // Update all connection status elements
  const statusContainers = document.querySelectorAll('#connection-status, #setup-connection-status, .connection-status-indicator');

  statusContainers.forEach(container => {
    const statusText = container.querySelector('#status-text') || container.querySelector('.status-text');
    const statusDot = container.querySelector('.status-dot');

    // Handle the game-status bar connection-status (emoji-based)
    if (container.id === 'connection-status' && !statusDot) {
      switch (state.connectionStatus) {
        case 'connected':
          container.textContent = '🟢 Online';
          container.classList.remove('offline');
          container.classList.add('online');
          break;
        case 'connecting':
          container.textContent = '🟡 Connecting...';
          container.classList.remove('online', 'offline');
          break;
        case 'disconnected':
        case 'error':
          container.textContent = '🔴 Offline';
          container.classList.remove('online');
          container.classList.add('offline');
          break;
      }
      return;
    }

    // Handle structured connection status (dot + text)
    if (statusDot) {
      statusDot.classList.remove('connected', 'connecting', 'disconnected', 'error');
    }

    switch (state.connectionStatus) {
      case 'connected':
        if (statusDot) statusDot.classList.add('connected');
        if (statusText) statusText.textContent = 'Connected';
        break;
      case 'connecting':
        if (statusDot) statusDot.classList.add('connecting');
        if (statusText) statusText.textContent = 'Connecting...';
        break;
      case 'disconnected':
        if (statusDot) statusDot.classList.add('disconnected');
        if (statusText) statusText.textContent = 'Disconnected';
        break;
      case 'error':
        if (statusDot) statusDot.classList.add('error');
        if (statusText) statusText.textContent = 'Connection Error';
        break;
    }
  });
}

// =========================
// LOBBY DISPLAY
// =========================

export function updateLobbyDisplay() {
  if (!state.gameSession) return;

  const gameIdEl = getElementById('lobby-game-id');
  const playerCountEl = getElementById('lobby-player-count');
  const playersListEl = getElementById('lobby-players-list');
  const startBtn = getElementById('start-game-btn');

  if (gameIdEl) {
    gameIdEl.textContent = `Game ID: ${state.gameSession.id}`;
  }

  if (playerCountEl) {
    const playerCount = state.gameSession.players.length;
    playerCountEl.textContent = `${playerCount} player${playerCount !== 1 ? 's' : ''} in lobby`;
  }

  if (playersListEl) {
    playersListEl.innerHTML = '';
    state.gameSession.players.forEach((player) => {
      const playerEl = document.createElement('div');
      playerEl.className = 'lobby-player';
      playerEl.innerHTML = `
        <span class="player-name">${player.name}</span>
        ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
        ${player.isReady ? '<span class="ready-badge">Ready</span>' : ''}
      `;
      playersListEl.appendChild(playerEl);
    });
  }

  // Show/hide host and player controls based on role
  const hostControls = getElementById('host-controls');
  const playerControls = getElementById('player-controls');

  if (state.currentPlayer?.isHost) {
    if (hostControls) hostControls.style.display = 'block';
    if (playerControls) playerControls.style.display = 'none';
  } else {
    if (hostControls) hostControls.style.display = 'none';
    if (playerControls) playerControls.style.display = 'block';
  }

  // Update player count display
  const currentPlayerCount = getElementById('current-player-count');
  const maxPlayerCount = getElementById('max-player-count');
  if (currentPlayerCount) {
    // Count non-host players
    const nonHostPlayers = state.gameSession.players.filter((p) => !p.isHost);
    currentPlayerCount.textContent = String(nonHostPlayers.length);
  }
  if (maxPlayerCount && state.gameSession.settings) {
    maxPlayerCount.textContent = String(state.gameSession.settings.maxPlayers);
  }

  // Update players container
  const playersContainer = getElementById('players-container');
  if (playersContainer) {
    playersContainer.innerHTML = '';
    state.gameSession.players.forEach((player) => {
      const playerEl = document.createElement('div');
      playerEl.className = 'lobby-player';
      playerEl.innerHTML = `
        <span class="player-name">${player.name}</span>
        ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
        ${state.currentPlayer?.isHost && !player.isHost ? `<button class="kick-btn" onclick="kickPlayer('${player.id}')">Kick</button>` : ''}
      `;
      playersContainer.appendChild(playerEl);
    });
  }

  // Only host can start game, enable when at least 1 non-host player
  if (startBtn && state.currentPlayer?.isHost) {
    const nonHostPlayers = state.gameSession.players.filter((p) => !p.isHost);
    startBtn.disabled = nonHostPlayers.length === 0;
  }

  // Update LAN connection info for desktop app (only for host)
  if (state.currentPlayer?.isHost && typeof window.updateLanConnectionInfo === 'function') {
    window.updateLanConnectionInfo();
  }

  // Initialize hotspot section for desktop app (only for host)
  if (state.currentPlayer?.isHost && typeof window.initHotspotSection === 'function') {
    window.initHotspotSection();
  }
}

// =========================
// GAME DISPLAY
// =========================

export function updateGameDisplay() {
  if (!state.gameSession) return;

  // Update song counter in game panel header
  const songNumberEl = getElementById('current-song-num');
  const totalSongsEl = getElementById('total-songs');
  const playerCountEl = getElementById('game-player-count');

  if (songNumberEl) {
    songNumberEl.textContent = String(state.currentSongIndex + 1);
  }

  if (totalSongsEl) {
    totalSongsEl.textContent = String(state.gameSession.settings.songsCount);
  }

  if (playerCountEl) {
    const nonHostPlayers = state.gameSession.players.filter((p) => !p.isHost);
    playerCountEl.textContent = String(nonHostPlayers.length);
  }
}

// =========================
// SINGLE PLAYER DISPLAY
// =========================

export function updateSinglePlayerDisplay() {
  // Update score display
  const scoreEl = getElementById('current-score');
  if (scoreEl) {
    scoreEl.textContent = String(state.singlePlayerScore);
  }

  // Update song progress
  const songNumberEl = getElementById('current-song-num');
  if (songNumberEl) {
    songNumberEl.textContent = String(state.singlePlayerCurrentSong + 1);
  }

  const totalSongsEl = getElementById('total-songs');
  if (totalSongsEl) {
    totalSongsEl.textContent = String(state.singlePlayerSongs.length);
  }

  // Update streak display
  const currentStreakEl = getElementById('current-streak');
  if (currentStreakEl) {
    currentStreakEl.textContent = String(state.singlePlayerCurrentStreak);
  }

  const bestStreakEl = getElementById('best-streak');
  if (bestStreakEl) {
    bestStreakEl.textContent = String(state.singlePlayerBestStreak);
  }
}

// =========================
// RETURN TO GAME
// =========================

export function updateReturnToGameSection() {
  const section = getElementById('return-to-game-section');
  if (!section) return;

  // Check for saved game state
  const savedState = localStorage.getItem('musicQuizReconnectState');
  if (savedState) {
    try {
      const reconnectData = JSON.parse(savedState);
      if (reconnectData.gameId && reconnectData.playerId) {
        section.classList.remove('hidden');
        const gameIdSpan = getElementById('saved-game-id');
        if (gameIdSpan) {
          gameIdSpan.textContent = reconnectData.gameId;
        }
        return;
      }
    } catch {
      // Invalid saved state
    }
  }

  section.classList.add('hidden');
}

export function updateReturnToGameButtons(isConnected) {
  const returnBtn = getElementById('return-to-game-btn');
  const clearBtn = getElementById('clear-saved-game-btn');

  if (returnBtn) {
    returnBtn.disabled = !isConnected;
    returnBtn.textContent = isConnected ? 'Return to Game' : 'Connect to Return';
  }

  if (clearBtn) {
    clearBtn.disabled = false;
  }
}

// =========================
// LIVE FEED
// =========================

export function setupLiveFeed() {
  const liveFeed = getElementById('live-feed');
  if (liveFeed) {
    liveFeed.innerHTML = '';
  }
}

export function addLiveUpdate(message) {
  const liveFeed = getElementById('live-feed');
  if (!liveFeed) return;

  const updateEl = document.createElement('div');
  updateEl.className = 'live-update';
  updateEl.textContent = message;

  liveFeed.insertBefore(updateEl, liveFeed.firstChild);

  // Keep only last 10 updates
  while (liveFeed.children.length > 10) {
    liveFeed.removeChild(liveFeed.lastChild);
  }
}

// =========================
// SCOREBOARD
// =========================

export function updateLiveScoreboard() {
  if (!state.gameSession) return;

  const scoreboardEl = getElementById('live-scoreboard');
  if (!scoreboardEl) return;

  const sortedPlayers = [...state.gameSession.players]
    .filter((p) => !p.isHost)
    .sort((a, b) => b.score - a.score);

  scoreboardEl.innerHTML = sortedPlayers
    .map(
      (player, index) => `
      <div class="scoreboard-entry">
        <span class="rank">#${index + 1}</span>
        <span class="name">${player.name}</span>
        <span class="score">${player.score}</span>
      </div>
    `
    )
    .join('');
}

export function toggleScoreboard() {
  const scoreboard = getElementById('scoreboard-modal');
  if (scoreboard) {
    scoreboard.classList.toggle('hidden');
  }
}

export function closeScoreboard() {
  const scoreboard = getElementById('scoreboard-modal');
  if (scoreboard) {
    scoreboard.classList.add('hidden');
  }
}

export function forceHideScoreboard() {
  const scoreboard = getElementById('scoreboard-modal');
  if (scoreboard) {
    scoreboard.classList.add('hidden');
    scoreboard.style.display = 'none';
  }
}

// =========================
// MUSIC FILE LIST
// =========================

export function displayMusicFileList(source) {
  // Use the main file list element (shared between single/multiplayer)
  const listEl = getElementById('music-file-list');
  if (!listEl) return;

  // Make the list visible
  listEl.classList.remove('hidden');

  const files = state.musicFiles;
  listEl.innerHTML = '';

  if (files.length === 0) {
    listEl.innerHTML = '<p class="no-music">No music files loaded</p>';
    return;
  }

  files.forEach((file, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'music-item';
    itemEl.innerHTML = `
      <span class="music-number">${index + 1}</span>
      <span class="music-title">${file.metadata?.title || 'Unknown'}</span>
      <span class="music-artist">${file.metadata?.artist || 'Unknown'}</span>
    `;
    listEl.appendChild(itemEl);
  });
}

// =========================
// KAHOOT OPTIONS DISPLAY
// =========================

export function resetKahootOptionStates(prefix = 'single') {
  for (let i = 0; i < 4; i++) {
    const optionEl = querySelector(
      `#${prefix}-kahoot-options .kahoot-option[data-option="${i}"]`
    );
    if (optionEl) {
      optionEl.classList.remove('selected', 'correct', 'wrong', 'disabled', 'waiting');
    }
  }
}

export function displayKahootOptions(options, prefix = 'single') {
  options.forEach((option, index) => {
    const optionEl = getElementById(`${prefix}-option-${index}`);
    if (optionEl) {
      optionEl.textContent = option.text;
    }
  });

  resetKahootOptionStates(prefix);
}

// =========================
// ANSWER TIMER
// =========================

export function showAnswerTimer(timeLeft) {
  const timerEl = getElementById('answer-timer');
  const timeLeftSpan = getElementById('answer-time-left');

  if (timerEl) {
    timerEl.classList.remove('hidden', 'urgent');
  }

  if (timeLeftSpan) {
    timeLeftSpan.textContent = String(timeLeft);
  }
}

export function updateAnswerTimer(timeLeft) {
  const timerEl = getElementById('answer-timer');
  const timeLeftSpan = getElementById('answer-time-left');

  if (timeLeftSpan) {
    timeLeftSpan.textContent = String(timeLeft);
  }

  if (timeLeft <= 5 && timerEl) {
    timerEl.classList.add('urgent');
  }
}

export function hideAnswerTimer() {
  const timerEl = getElementById('answer-timer');
  if (timerEl) {
    timerEl.classList.add('hidden');
  }
}

// =========================
// PLAYER RESULT DISPLAY
// =========================

export function showPlayerResult(isCorrect, points, correctAnswer) {
  const resultDisplay = getElementById('player-result-display');
  const resultIcon = getElementById('result-icon');
  const resultText = getElementById('result-text');
  const resultPoints = getElementById('result-points');
  const correctAnswerEl = getElementById('correct-answer-display');

  if (resultDisplay) {
    resultDisplay.classList.remove('hidden', 'correct', 'wrong');
    resultDisplay.classList.add(isCorrect ? 'correct' : 'wrong');
  }

  if (resultIcon) {
    resultIcon.textContent = isCorrect ? '✅' : '❌';
  }

  if (resultText) {
    resultText.textContent = isCorrect ? 'Correct!' : 'Wrong!';
  }

  if (resultPoints) {
    resultPoints.textContent = isCorrect ? `+${points} points` : '0 points';
  }

  if (correctAnswerEl) {
    correctAnswerEl.textContent = correctAnswer;
  }
}

// =========================
// CORRECT ANSWER REVEAL
// =========================

export function showCorrectAnswerReveal(correctAnswer) {
  const overlay = getElementById('correct-answer-reveal');
  const titleEl = getElementById('correct-answer-title');

  if (!overlay || !titleEl) return;

  titleEl.textContent = correctAnswer;
  overlay.classList.remove('hidden');
}

export function hideCorrectAnswerReveal() {
  const overlay = getElementById('correct-answer-reveal');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

// =========================
// INTERMEDIATE LEADERBOARD
// =========================

export function showIntermediateLeaderboard(isFinal = false) {
  if (!state.gameSession) return;

  const modal = getElementById('intermediate-leaderboard');
  const listEl = getElementById('intermediate-rankings');

  if (!modal || !listEl) return;

  const sortedPlayers = [...state.gameSession.players]
    .filter((p) => !p.isHost)
    .sort((a, b) => b.score - a.score);

  if (sortedPlayers.length === 0) {
    listEl.innerHTML = '<div class="ranking-entry">No player scores yet</div>';
  } else {
    listEl.innerHTML = sortedPlayers
      .map(
        (player, index) => `
        <div class="ranking-entry ${player.id === state.currentPlayer?.id ? 'current-player' : ''}">
          <span class="rank">#${index + 1}</span>
          <span class="name">${player.name}</span>
          <span class="score">${player.score} pts</span>
        </div>
      `
      )
      .join('');
  }

  // Update footer text based on whether this is the final leaderboard
  const footerHint = modal.querySelector('.next-song-hint');
  if (footerHint) {
    footerHint.textContent = isFinal ? 'Final Scores!' : 'Next song starting soon...';
  }

  modal.classList.remove('hidden');
}

export function hideIntermediateLeaderboard() {
  const modal = getElementById('intermediate-leaderboard');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// =========================
// CONFETTI
// =========================

export function startConfetti() {
  const canvas = getElementById('confetti-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.remove('hidden');

  const particles = [];

  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'];

  // Create particles
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
    });
  }

  let animationId;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let activeParticles = 0;

    particles.forEach((p) => {
      if (p.y < canvas.height + 50) {
        activeParticles++;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.rotation += p.rotationSpeed;
      }
    });

    if (activeParticles > 0) {
      animationId = requestAnimationFrame(animate);
    } else {
      canvas.classList.add('hidden');
      cancelAnimationFrame(animationId);
    }
  }

  animate();

  // Stop after 5 seconds
  setTimeout(() => {
    cancelAnimationFrame(animationId);
    canvas.classList.add('hidden');
  }, 5000);
}
