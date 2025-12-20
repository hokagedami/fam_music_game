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
import { revealAnswerAndNext } from './multiplayer.js';
import { showIntermediateLeaderboard } from './ui.js';

let socket = null;

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
 * @returns {Object}
 */
export function initializeSocket() {
  if (socket && socket.connected) {
    return socket;
  }

  // Use window.location.origin to get the correct server URL
  // This works for both localhost and network IP access
  socket = io(window.location.origin, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
  });

  setupSocketEvents(socket);

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

    saveGameStateForReconnection();
    showPanel('lobby');
    updateLobbyDisplay();
  });

  sock.on('gameJoined', (data) => {
    state.setGameId(data.gameId);
    state.setGameSession(data.gameSession);
    state.setCurrentPlayer(data.player);

    saveGameStateForReconnection();
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

    if (data.options && typeof data.correctIndex === 'number') {
      showOptionsToPlayers(data.options, data.correctIndex);
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
    // Note: Correct answer overlay only shown on host screen
  });

  sock.on('gameEnded', (data) => {
    state.setGameSession(data.gameSession);
    clearReconnectionState();

    // Show final leaderboard to players before results panel
    if (!state.currentPlayer?.isHost) {
      showIntermediateLeaderboard(true); // true = final scores
      // Hide leaderboard and show results after delay
      setTimeout(() => {
        hideIntermediateLeaderboard();
        showPanel('results');
        startConfetti();
      }, 4000);
    } else {
      // Host goes directly to results
      showPanel('results');
      startConfetti();
    }

    // Dispatch event for results display
    window.dispatchEvent(new CustomEvent('gameEnded', { detail: data }));
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

    if (data.gameSession.state === 'playing') {
      state.setCurrentSongIndex(data.gameSession.currentSong);
      state.setMusicQuizSongs(data.gameSession.songs);
      state.setMusicQuizSongsUrl(data.gameSession.audioUrls);
      showPanel('game');
      updateGameDisplay();
    } else if (data.gameSession.state === 'lobby') {
      showPanel('lobby');
      updateLobbyDisplay();
    } else if (data.gameSession.state === 'finished') {
      showPanel('results');
    }

    showNotification('Rejoined game!', 'success');
  });
}

// =========================
// RECONNECTION
// =========================

function saveGameStateForReconnection() {
  if (!state.gameId || !state.currentPlayer) return;

  const reconnectData = {
    gameId: state.gameId,
    playerId: state.currentPlayer.id,
    playerName: state.currentPlayer.name,
    timestamp: Date.now(),
  };

  storage.set('musicQuizReconnectState', reconnectData);
}

function loadReconnectionState() {
  const data = storage.get('musicQuizReconnectState', null);

  if (!data) return null;

  // Check if state is older than 1 hour
  const oneHour = 60 * 60 * 1000;
  if (Date.now() - data.timestamp > oneHour) {
    clearReconnectionState();
    return null;
  }

  return data;
}

function clearReconnectionState() {
  storage.remove('musicQuizReconnectState');
}

function attemptRejoinGame(reconnectData) {
  if (!socket || !socket.connected) return;

  socket.emit('rejoinGame', {
    gameId: reconnectData.gameId,
    playerId: reconnectData.playerId,
    playerName: reconnectData.playerName,
  });
}

// =========================
// GAME ACTIONS
// =========================

/**
 * Create a new game
 * @param {string} hostName
 * @param {Object} settings
 * @param {Array} songsMetadata
 * @param {Array} kahootOptions
 */
export function createGame(hostName, settings, songsMetadata, kahootOptions) {
  if (!socket || !socket.connected) {
    showNotification('Not connected to server', 'error');
    return;
  }

  socket.emit('createGame', {
    hostName,
    settings,
    songsMetadata,
    kahootOptions,
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
