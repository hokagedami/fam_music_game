/**
 * Socket.IO connection and event handling
 */

import { io } from 'socket.io-client';

import * as state from './state.js';
import {
  showNotification,
  updateConnectionStatus,
  updateLobbyDisplay,
  updateGameDisplay,
  showPanel,
  addLiveUpdate,
  updateLiveScoreboard,
  showPlayerResult,
  hideIntermediateLeaderboard,
  startConfetti,
} from './ui.js';
import { showOptionsToPlayers, resetPlayerViewForNextSong } from './kahoot.js';
import { formatSongAnswer, storage } from './utils.js';
import {
  revealAnswerAndNext,
  setupMultiplayerGameInterface,
  showMultiplayerResults,
} from './multiplayer.js';
import { showIntermediateLeaderboard } from './ui.js';

let socket = null;
let socketReadyPromise = null;

// =========================
// SOCKET INITIALIZATION
// =========================

/**
 * Get the socket instance
 * @returns {Object|null}
 */
export function getSocket() {
  return socket;
}

/**
 * Initialize socket connection
 * @returns {Object} socket instance
 */
export function initializeSocket() {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io(window.location.origin, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
  });

  setupSocketEvents(socket);
  socketReadyPromise = Promise.resolve(socket);

  return socket;
}

/**
 * Disconnect socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Check if socket is connected
 * @returns {boolean}
 */
export function isConnected() {
  return socket?.connected ?? false;
}

/**
 * Wait for socket to be initialized
 * @returns {Promise<Object>} socket instance
 */
export function waitForSocket() {
  return socketReadyPromise || Promise.resolve(socket);
}

// =========================
// SOCKET EVENT HANDLERS
// =========================

function setupSocketEvents(sock) {
  // Expose socket for tests
  window.__socket = sock;

  // Connection events
  sock.on('connect', () => {
    state.setConnectionStatus('connected');
    updateConnectionStatus();
    state.setOfflineMode(false);

    // Set flag for tests
    window.__socketConnected = true;

    // Check for reconnection
    const reconnectState = loadReconnectionState();
    if (reconnectState) {
      attemptRejoinGame(reconnectState);
    }
  });

  sock.on('disconnect', () => {
    state.setConnectionStatus('disconnected');
    updateConnectionStatus();
    window.__socketConnected = false;
  });

  sock.on('connect_error', () => {
    state.setConnectionStatus('error');
    updateConnectionStatus();
  });

  sock.on('reconnect', () => {
    state.setConnectionStatus('connected');
    updateConnectionStatus();
  });

  sock.on('reconnect_attempt', () => {
    state.setConnectionStatus('connecting');
    updateConnectionStatus();
  });

  // Game events
  sock.on('gameCreated', (data) => {
    state.setGameId(data.gameId);
    state.setGameSession(data.gameSession);

    // The creator is always the host - create a host player object
    // Note: Server stores host separately (not in players array)
    const hostPlayer = {
      id: sock.id || 'host',
      name: data.gameSession.host || 'Host',
      isHost: true,
      score: 0,
      isReady: true,
    };
    state.setCurrentPlayer(hostPlayer);

    saveGameStateForReconnection(data.reconnectToken);
    updateGameUrl(data.gameId);
    showPanel('lobby');
    updateLobbyDisplay();
  });

  sock.on('gameJoined', (data) => {
    state.setGameId(data.gameId);
    state.setGameSession(data.gameSession);
    state.setCurrentPlayer(data.player);

    saveGameStateForReconnection(data.reconnectToken);
    updateGameUrl(data.gameId);
    showPanel('lobby');
    updateLobbyDisplay();
    showNotification(`Joined game ${data.gameId}!`, 'success');
  });

  sock.on('playerJoined', (data) => {
    state.setGameSession(data.gameSession);
    updateLobbyDisplay();
    addLiveUpdate(`${data.player.name} joined the game`);
  });

  sock.on('playerLeft', (data) => {
    state.setGameSession(data.gameSession);
    updateLobbyDisplay();
    addLiveUpdate(`${data.playerName} left the game`);
  });

  sock.on('gameStarted', (data) => {
    state.setGameSession(data.gameSession);
    state.setCurrentSongIndex(0);

    // Store songs and URLs - but DON'T overwrite for host who has local blob URLs
    // Host already set musicQuizSongs with local files in proceedWithGameCreation()
    if (!state.currentPlayer?.isHost) {
      state.setMusicQuizSongs(data.gameSession.songs);
      state.setMusicQuizSongsUrl(data.gameSession.audioUrls);
    }

    showPanel('game');
    updateGameDisplay();

    // Dispatch event for game start handling
    window.dispatchEvent(new CustomEvent('gameStarted', { detail: data }));
  });

  sock.on('songChanged', (data) => {
    state.setCurrentSongIndex(data.songIndex);
    state.setGameSession(data.gameSession);
    updateGameDisplay();

    // Reset player view for non-hosts
    if (!state.currentPlayer?.isHost) {
      resetPlayerViewForNextSong(data.songIndex + 1);
    }

    // Dispatch event for song change handling
    window.dispatchEvent(new CustomEvent('songChanged', { detail: data }));
  });

  sock.on('kahootOptions', (data) => {
    if (state.currentPlayer?.isHost) return; // Host doesn't answer

    if (data.options) {
      showOptionsToPlayers(data.options);
    }
  });

  sock.on('answerResult', (data) => {
    // Update player score in local gameSession
    if (state.gameSession && state.gameSession.players) {
      const player = state.gameSession.players.find(p => p.id === data.playerId);
      if (player) {
        player.score = data.totalScore;
      }
    }

    // Show result to the player who answered
    if (data.playerId === state.currentPlayer?.id) {
      showPlayerResult(data.isCorrect, data.points, data.correctAnswer);
      if (data.points > 0) {
        addLiveUpdate(`You scored ${data.points} points!`);
      }
    } else {
      // Host or other players see live feed update
      if (data.isCorrect) {
        addLiveUpdate(`${data.playerName} scored ${data.points} pts!`);
      }
    }

    // Update scoreboard
    updateLiveScoreboard();
  });

  sock.on('answerTimeExpired', (data) => {
    state.setGameSession(data.gameSession);

    // Auto-reveal answer when time expires (host only)
    if (state.currentPlayer?.isHost) {
      try {
        revealAnswerAndNext();
      } catch (error) {
        console.error('Failed to reveal answer:', error);
      }
    }
  });

  sock.on('allPlayersAnswered', (data) => {
    state.setGameSession(data.gameSession);

    // Auto-reveal answer when all players answered (host only)
    if (state.currentPlayer?.isHost) {
      try {
        revealAnswerAndNext();
      } catch (error) {
        console.error('Failed to reveal answer:', error);
      }
    }
  });

  sock.on('playerAnswered', (data) => {
    addLiveUpdate(`${data.playerName} answered!`);

    // Update players answered count
    const countEl = document.getElementById('players-answered-count');
    if (countEl) {
      countEl.textContent = `${data.answeredCount}/${data.totalPlayers}`;
    }
  });

  sock.on('revealAnswers', (data) => {
    state.setGameSession(data.gameSession);
    updateLiveScoreboard();

    // Show the correct answer text for players (in their answer status area)
    const correctAnswerEl = document.getElementById('correct-answer-display');
    if (correctAnswerEl) {
      correctAnswerEl.textContent = data.correctAnswer;
    }

    // Highlight the correct option for players (safe: answer period is over)
    if (typeof data.correctIndex === 'number' && data.correctIndex >= 0) {
      const correctOption = document.querySelector(
        `#nonhost-kahoot-options .kahoot-option[data-option="${data.correctIndex}"]`
      );
      if (correctOption) {
        correctOption.classList.add('correct');
      }
    }

  });

  sock.on('gameEnded', (data) => {
    state.setGameSession(data.gameSession);
    // Don't clear reconnection state here — host/players may click "play again"
    // State is cleared when they explicitly leave or the game is deleted

    if (state.currentPlayer?.isHost) {
      // Host sees final leaderboard first, then podium + results
      showIntermediateLeaderboard(true);
      setTimeout(() => {
        hideIntermediateLeaderboard();
        showPanel('results');
        window.dispatchEvent(new CustomEvent('gameEnded', { detail: data }));
      }, 4000);
    } else {
      // Players go straight to results
      showPanel('results');
      window.dispatchEvent(new CustomEvent('gameEnded', { detail: data }));
    }
  });

  sock.on('gameReset', (data) => {
    // Host reset the game for a new round
    state.setCurrentSongIndex(0);
    state.setOptionsSentForCurrentSong(false);
    state.setMusicQuizSongs([]);
    state.setMusicQuizSongsUrl([]);
    state.setMusicAnswers([]);

    if (data.gameSession) {
      state.setGameSession(data.gameSession);
    }
    if (data.gameId) {
      state.setGameId(data.gameId);
    }

    // Refresh reconnection state with current game info
    saveGameStateForReconnection();

    // Host already navigated to setup — players go to lobby to wait
    if (!state.currentPlayer?.isHost) {
      showPanel('lobby');
      updateLobbyDisplay();
      showNotification(data.message || 'Host is starting a new round!', 'info');
    }
  });

  sock.on('gameDeleted', (data) => {
    clearReconnectionState();
    state.resetMultiplayerState();

    showNotification(data.message || 'Game has ended', 'info');
    showPanel('home');
  });

  sock.on('playerKicked', (data) => {
    // Handle being kicked - clear state and return to home
    clearReconnectionState();
    state.resetMultiplayerState();

    const message = data.reason
      ? `You were kicked: ${data.reason}`
      : data.message || 'You were removed from the game';
    showNotification(message, 'error');
    showPanel('home');
  });

  sock.on('hostChanged', (data) => {
    state.setGameSession(data.gameSession);

    // Update current player if they became host
    if (data.newHostId === state.currentPlayer?.id) {
      const updatedPlayer = data.gameSession.players.find((p) => p.id === data.newHostId);
      if (updatedPlayer) {
        state.setCurrentPlayer(updatedPlayer);
      }
      showNotification('You are now the host!', 'info');
    }

    updateLobbyDisplay();
    addLiveUpdate(`${data.newHostName} is now the host`);
  });

  sock.on('error', (data) => {
    showNotification(data.message, 'error');
  });

  sock.on('gameNotFound', () => {
    showNotification('Game not found', 'error');
    clearReconnectionState();
  });

  sock.on('rejoinSuccess', (data) => {
    state.setGameSession(data.gameSession);
    state.setCurrentPlayer(data.player);
    state.setGameId(data.gameSession.id);
    state.setCurrentMode('multiplayer');

    if (data.gameSession.state === 'playing') {
      state.setCurrentSongIndex(data.gameSession.currentSong);
      if (!data.isHost) {
        state.setMusicQuizSongs(data.gameSession.songs);
      }
      showPanel('game');
      updateGameDisplay();
      // Initialize host/player controls (missed on rejoin vs fresh gameStarted)
      setupMultiplayerGameInterface();

      if (data.isHost && state.musicFiles.length === 0) {
        showNotification('Rejoined! Load music files to continue hosting.', 'info');
      }
    } else if (data.gameSession.state === 'lobby') {
      showPanel('lobby');
      updateLobbyDisplay();
    } else if (data.gameSession.state === 'finished') {
      showPanel('results');
      showMultiplayerResults();
    }

    saveGameStateForReconnection(data.reconnectToken);
    updateGameUrl(data.gameSession.id);
    if (data.gameSession.state !== 'playing' || !data.isHost || state.musicFiles.length > 0) {
      showNotification('Rejoined game!', 'success');
    }
  });

  sock.on('rejoinFailed', (data) => {
    clearReconnectionState();
    showNotification(data.message || 'Could not rejoin game', 'error');
  });
}

// =========================
// RECONNECTION
// =========================

function saveGameStateForReconnection(reconnectToken) {
  if (!state.gameId || !state.currentPlayer) return;

  const reconnectData = {
    gameId: state.gameId,
    playerId: state.currentPlayer.id,
    playerName: state.currentPlayer.name,
    timestamp: Date.now(),
  };

  // Save the reconnect token if provided (new or refreshed)
  if (reconnectToken) {
    reconnectData.reconnectToken = reconnectToken;
  } else {
    // Preserve existing token
    const existing = storage.get('musicQuizReconnectState', null);
    if (existing?.reconnectToken) {
      reconnectData.reconnectToken = existing.reconnectToken;
    }
  }

  storage.set('musicQuizReconnectState', reconnectData);
}

function loadReconnectionState() {
  const data = storage.get('musicQuizReconnectState', null);

  if (!data) return null;

  // Check if state is older than 4 hours (match server game timeout)
  const fourHours = 4 * 60 * 60 * 1000;
  if (Date.now() - data.timestamp > fourHours) {
    clearReconnectionState();
    return null;
  }

  return data;
}

function clearReconnectionState() {
  storage.remove('musicQuizReconnectState');
  clearGameUrl();
}

function attemptRejoinGame(reconnectData) {
  if (!socket || !socket.connected) return;

  socket.emit('rejoinGame', {
    gameId: reconnectData.gameId,
    playerId: reconnectData.playerId,
    playerName: reconnectData.playerName,
    reconnectToken: reconnectData.reconnectToken,
  });
}

/**
 * Attempt rejoin using saved localStorage state (for when socket is already connected)
 */
export function attemptRejoinFromSavedState() {
  const reconnectData = loadReconnectionState();
  if (reconnectData) {
    attemptRejoinGame(reconnectData);
  }
}

/**
 * Update the browser URL to include the game ID (enables refresh/share)
 * @param {string} gameId
 */
function updateGameUrl(gameId) {
  if (!gameId) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('game', gameId);
    url.searchParams.delete('join'); // Remove old-style param
    window.history.replaceState({}, '', url.toString());
  } catch (_) {
    // Ignore URL update failures (e.g., in tests)
  }
}

/**
 * Clear the game ID from the browser URL
 */
function clearGameUrl() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('game') || url.searchParams.has('join')) {
      url.searchParams.delete('game');
      url.searchParams.delete('join');
      const clean = url.pathname + (url.search || '');
      window.history.replaceState({}, '', clean || '/');
    }
  } catch (_) {
    // Ignore
  }
}

// =========================
// GAME ACTIONS
// =========================

/**
 * Create a new game
 * @param {string} hostName
 * @param {Object} settings
 * @param {Array} songsMetadata
 */
export function createGame(hostName, settings, songsMetadata) {
  if (!socket || !socket.connected) {
    showNotification('Not connected to server', 'error');
    return;
  }

  socket.emit('createGame', {
    hostName,
    settings,
    songsMetadata,
  });
}

/**
 * Join an existing game
 * @param {string} gameId
 * @param {string} playerName
 */
export function joinGame(gameId, playerName) {
  if (!socket || !socket.connected) {
    showNotification('Not connected to server', 'error');
    return;
  }

  socket.emit('joinGame', {
    gameId: gameId.toUpperCase(),
    playerName,
  });
}

/**
 * Start the game (host only)
 */
export function startGame() {
  if (!socket || !socket.connected || !state.gameId) return;

  socket.emit('startGame', {
    gameId: state.gameId,
  });
}

/**
 * Submit an answer
 * @param {number} answerIndex
 * @param {boolean} isCorrect
 * @param {number} responseTime
 */
export function submitAnswer(answerIndex, isCorrect, responseTime) {
  if (!socket || !socket.connected || !state.gameId) return;

  socket.emit('submitAnswer', {
    gameId: state.gameId,
    playerId: state.currentPlayer?.id,
    playerName: state.currentPlayer?.name,
    answerIndex,
    isCorrect,
    responseTime,
    responseTimeSeconds: responseTime / 1000,
  });
}

/**
 * Broadcast Kahoot options to players (host only)
 * @param {Array} options
 * @param {number} correctIndex
 * @param {number} songIndex
 */
export function broadcastOptions(options, correctIndex, songIndex) {
  if (!socket || !socket.connected || !state.gameId) return;

  socket.emit('showKahootOptions', {
    gameId: state.gameId,
    options,
    correctIndex,
    songIndex,
  });
}

/**
 * Reveal answer (host only)
 * @param {number} songIndex
 */
export function revealAnswer(songIndex) {
  if (!socket || !socket.connected || !state.gameId) return;

  const currentSong = state.musicQuizSongs[songIndex];
  const correctAnswer = currentSong ? formatSongAnswer(currentSong) : 'Unknown';

  socket.emit('revealAnswers', {
    gameId: state.gameId,
    songIndex,
    correctAnswer,
    title: currentSong?.metadata?.title || 'Unknown',
    artist: currentSong?.metadata?.artist || '',
    correctIndex: state.multiplayerKahootCorrectIndex,
  });
}

/**
 * Move to next song (host only)
 */
export function nextSong() {
  if (!socket || !socket.connected || !state.gameId) return;

  socket.emit('nextSong', {
    gameId: state.gameId,
    currentSongIndex: state.currentSongIndex,
  });
}

/**
 * End the game (host only)
 */
export function endGame() {
  if (!socket || !socket.connected || !state.gameId) return;

  socket.emit('endGame', {
    gameId: state.gameId,
  });
}

/**
 * Leave the current game
 */
export function leaveGame() {
  if (!socket || !socket.connected || !state.gameId) return;

  socket.emit('leaveGame', {
    gameId: state.gameId,
    playerId: state.currentPlayer?.id,
  });

  clearReconnectionState();
  state.resetMultiplayerState();
}

/**
 * Kick a player (host only)
 * @param {string} playerId
 */
export function kickPlayer(playerId) {
  if (!socket || !socket.connected || !state.gameId) return;
  if (!state.currentPlayer?.isHost) return;

  socket.emit('kickPlayer', {
    gameId: state.gameId,
    playerId,
  });
}

/**
 * Test connection
 * @returns {Promise<boolean>}
 */
export function testConnection() {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      resolve(false);
    }, 5000);

    socket.emit('ping');
    socket.once('pong', () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}
