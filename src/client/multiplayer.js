/**
 * Multiplayer game logic
 */

import * as state from './state.js';
import {
  copyToClipboard,
  extractFileMetadataAsync,
  formatSongAnswer,
  getElementById,
  getOrdinalSuffix,
  shuffleArray
} from './utils.js';
import {
  addLiveUpdate,
  displayMusicFileList,
  hideCorrectAnswerReveal,
  hideIntermediateLeaderboard,
  hideLoading,
  setupLiveFeed,
  showCorrectAnswerReveal,
  showIntermediateLeaderboard,
  showLoading,
  showNotification,
  showPanel,
  startConfetti,
  updateGameDisplay,
  updateLiveScoreboard,
  updateLobbyDisplay,
} from './ui.js';
import {
  playMultiplayerSong,
  replayMultiplayerClip,
  resetHostControls,
  stopCurrentAudio,
  updateHostSongNumber,
} from './audio.js';
import {
  generateMultiplayerKahootOptions,
  resetPlayerViewForNextSong,
  selectKahootOptionMultiplayer,
} from './kahoot.js';
import {
  broadcastOptions,
  createGame as socketCreateGame,
  endGame as socketEndGame,
  initializeSocket,
  isConnected,
  joinGame as socketJoinGame,
  kickPlayer as socketKickPlayer,
  leaveGame as socketLeaveGame,
  nextSong as socketNextSong,
  revealAnswer as socketRevealAnswer,
  startGame as socketStartGame,
} from './socket.js';

// =========================
// GAME SETUP
// =========================

/**
 * Start multiplayer mode
 */
export function startMultiplayer() {
  state.setCurrentMode('multiplayer');

  // Update setup title for multiplayer
  const setupTitle = getElementById('setup-title');
  if (setupTitle) {
    setupTitle.textContent = 'Multiplayer Setup';
  }

  initializeSocket();
  showPanel('multiplayer-setup');
  setupMultiplayerUI();
}

/**
 * Show join game panel
 */
export function showJoinGame() {
  state.setCurrentMode('multiplayer');
  initializeSocket();
  showPanel('join');
}

/**
 * Setup multiplayer UI
 */
function setupMultiplayerUI() {
  const songsCountSelect = getElementById('songs-count');
  const clipDurationSelect = getElementById('clip-duration');
  const startButton = getElementById('start-game-button');

  if (songsCountSelect) {
    songsCountSelect.value = '10';
  }

  if (clipDurationSelect) {
    clipDurationSelect.value = '20';
  }

  if (startButton) {
    startButton.disabled = state.musicFiles.length === 0;
  }
}

/**
 * Load music files for multiplayer
 * @param {Event} event
 */
export async function loadMultiplayerMusic(event) {
  const input = event.target;
  if (!input.files || input.files.length === 0) return;

  showLoading('Loading music files and reading metadata...');

  const files = Array.from(input.files);
  const audioFiles = files.filter((file) => file.type.startsWith('audio/'));

  // Extract metadata from all files in parallel
  const musicFiles = await Promise.all(
    audioFiles.map((file) => extractFileMetadataAsync(file))
  );

  state.setMusicFiles(musicFiles);
  displayMusicFileList('multiplayer');

  const startButton = getElementById('start-game-button');
  if (startButton) {
    startButton.disabled = musicFiles.length === 0;
  }

  hideLoading();
  showNotification(`Loaded ${musicFiles.length} songs`, 'success');
}

// =========================
// CREATE GAME
// =========================

/**
 * Create a new multiplayer game
 */
export function createGame() {
  if (!isConnected()) {
    showNotification('Not connected to server. Please wait...', 'error');
    return;
  }

  const hostNameInput = getElementById('host-name');
  const hostName = hostNameInput?.value.trim() || 'Host';

  if (state.musicFiles.length === 0) {
    showNotification('Please load music files first', 'error');
    return;
  }

  proceedWithGameCreation(hostName);
}

/**
 * Proceed with game creation after validation
 * @param {string} hostName
 */
async function proceedWithGameCreation(hostName) {
  showLoading('Creating game...');

  const songsCountSelect = getElementById('songs-count');
  const clipDurationSelect = getElementById('clip-duration');
  const answerTimeSelect = getElementById('answer-time');
  const maxPlayersSelect = getElementById('max-players');

  const songsCount = parseInt(songsCountSelect?.value || '10');
  const clipDuration = parseInt(clipDurationSelect?.value || '20');
  const answerTime = parseInt(answerTimeSelect?.value || '15');
  const maxPlayers = parseInt(maxPlayersSelect?.value || '8');

  // Shuffle and select songs
  const shuffledSongs = shuffleArray([...state.musicFiles]);
  const selectedSongs = shuffledSongs.slice(0, Math.min(songsCount, shuffledSongs.length));

  // Options are now generated just before each song plays (in hostShowOptions)
  // This maintains randomness and uses all music files for wrong options

  // Use local files - no upload needed!
  // Songs are played locally on host's device only (Kahoot-style)
  // Players only see the answer options, not the audio
  const songsMetadata = selectedSongs.map((song) => ({
    metadata: song.metadata,
    // Local URL - only works on host's browser
    localUrl: song.url,
  }));

  socketCreateGame(
    hostName,
    {
      songsCount: selectedSongs.length,
      clipDuration,
      answerTime,
      maxPlayers,
    },
    songsMetadata
  );

  state.setMusicQuizSongs(selectedSongs);
  state.setClipDuration(clipDuration);
  state.setAnswerTimeLimit(answerTime);

  hideLoading();
}

// Note: uploadMusicFiles is no longer needed since we use local playback
// Music files stay on host's device and are never uploaded to server

// =========================
// JOIN GAME
// =========================

/**
 * Join an existing game
 */
export function joinGame() {
  const playerNameInput = getElementById('join-player-name');
  const gameIdInput = getElementById('game-id-input');

  const playerName = playerNameInput?.value.trim();
  const gameId = gameIdInput?.value.trim().toUpperCase();

  if (!playerName) {
    showNotification('Please enter your name', 'error');
    return;
  }

  if (!gameId || gameId.length !== 6) {
    showNotification('Please enter a valid 6-character game ID', 'error');
    return;
  }

  if (!isConnected()) {
    showNotification('Not connected to server', 'error');
    return;
  }

  socketJoinGame(gameId, playerName);
}

// =========================
// LOBBY
// =========================

/**
 * Setup lobby display
 */
export function setupLobby() {
  updateLobbyDisplay();
  setupLiveFeed();
}

/**
 * Copy game ID to clipboard
 */
export function copyGameId() {
  if (state.gameId) {
    copyToClipboard(state.gameId).then((success) => {
      if (success) {
        showNotification('Game ID copied!', 'success');
      }
    });
  }
}

/**
 * Start the multiplayer game (host only)
 */
export function startMultiplayerGame() {
  if (!state.currentPlayer?.isHost) {
    showNotification('Only the host can start the game', 'error');
    return;
  }

  if (!isConnected()) {
    showNotification('Not connected to server', 'error');
    return;
  }

  if (!state.gameId) {
    showNotification('No game ID found', 'error');
    return;
  }

  socketStartGame();
}

// =========================
// GAME FLOW
// =========================

/**
 * Setup multiplayer game interface
 */
export function setupMultiplayerGameInterface() {
  // Reset reveal flag for new game
  answerRevealedForSong = -1;

  updateGameDisplay();
  setupLiveFeed();

  if (state.currentPlayer?.isHost) {
    setupHostControls();
  } else {
    setupPlayerControls();
  }
}

/**
 * Setup host-specific controls
 */
function setupHostControls() {
  const hostView = getElementById('host-music-player');
  const playerView = getElementById('non-host-music-player');
  const liveUpdates = getElementById('live-updates');
  const scoresButton = getElementById('scores-button-container');

  if (hostView) hostView.style.display = 'block';
  if (playerView) playerView.style.display = 'none';
  if (liveUpdates) liveUpdates.style.display = 'block';
  if (scoresButton) scoresButton.style.display = 'block';

  // Reset controls
  resetHostControls();
  updateHostSongNumber();
}

/**
 * Setup player-specific controls
 */
function setupPlayerControls() {
  const hostView = getElementById('host-music-player');
  const playerView = getElementById('non-host-music-player');
  const liveUpdates = getElementById('live-updates');
  const scoresButton = getElementById('scores-button-container');

  if (hostView) hostView.style.display = 'none';
  if (playerView) playerView.style.display = 'block';
  // Hide live updates for players - they just need to focus on answering
  if (liveUpdates) liveUpdates.style.display = 'none';
  // Hide scores button during gameplay for players
  if (scoresButton) scoresButton.style.display = 'none';

  // Setup Kahoot option click handlers
  const options = document.querySelectorAll('#nonhost-kahoot-options .kahoot-option');
  options.forEach((option) => {
    const optionEl = option;
    const optionIndex = parseInt(optionEl.dataset.option || '0');
    optionEl.onclick = () => selectKahootOptionMultiplayer(optionEl, optionIndex);
  });

  // Reset player view
  resetPlayerViewForNextSong(1);
}

/**
 * Play current song (host only - uses local file)
 */
export function playCurrentSong() {
  if (!state.currentPlayer?.isHost) return;

  const song = state.musicQuizSongs[state.currentSongIndex];
  // Use local URL from the File object (blob URL created when files were loaded)
  const audioUrl = song?.url || song?.localUrl;

  if (!audioUrl) {
    console.error('No audio URL for song:', state.currentSongIndex);
    showNotification('Error: Could not load audio file', 'error');
    return;
  }

  const clipDuration = state.gameSession?.settings.clipDuration || 20;

  playMultiplayerSong(audioUrl, clipDuration, () => {
    // Song ended - automatically show options to players
    hostShowOptions();
  });

  updateHostSongNumber();
  addLiveUpdate(`Playing song ${state.currentSongIndex + 1}`);
}

/**
 * Host shows options to players (called automatically when music clip ends)
 */
export function hostShowOptions() {
  if (!state.currentPlayer?.isHost) return;
  if (state.optionsSentForCurrentSong) return;

  state.setOptionsSentForCurrentSong(true);

  const song = state.musicQuizSongs[state.currentSongIndex];
  // Generate options just before showing - uses all music files for wrong options pool
  const { options, correctIndex } = generateMultiplayerKahootOptions(song, state.musicQuizSongs, state.musicFiles);

  // Store for later reveal
  state.setMultiplayerKahootOptions(options);
  state.setMultiplayerKahootCorrectIndex(correctIndex);

  // Send options to all players
  broadcastOptions(options, correctIndex, state.currentSongIndex);

  // Update host UI - show reveal button and waiting status
  const revealBtn = getElementById('reveal-answer-btn');
  const waitingStatus = getElementById('host-waiting-status');

  if (revealBtn) {
    revealBtn.style.display = 'inline-block';
    revealBtn.disabled = false;
  }
  if (waitingStatus) waitingStatus.style.display = 'block';

  addLiveUpdate(`Time to answer! Players have ${state.answerTimeLimit} seconds`);
  showNotification('Options sent to players!', 'info');
}

// Track if answer has been revealed for current song (prevent duplicate calls)
let answerRevealedForSong = -1;

/**
 * Host reveals answer
 */
export function revealAnswerAndNext() {
  if (!state.currentPlayer?.isHost) return;

  // Prevent duplicate reveals for the same song
  if (answerRevealedForSong === state.currentSongIndex) return;
  answerRevealedForSong = state.currentSongIndex;

  const song = state.musicQuizSongs[state.currentSongIndex];
  const correctAnswer = formatSongAnswer(song);

  // Show correct answer to host
  const correctAnswerDiv = getElementById('host-correct-answer');
  const correctAnswerText = getElementById('correct-answer-text');
  const waitingStatus = getElementById('host-waiting-status');
  const revealBtn = getElementById('reveal-answer-btn');
  const nextBtn = getElementById('next-song-btn');

  if (correctAnswerDiv) correctAnswerDiv.classList.remove('hidden');
  if (correctAnswerText) correctAnswerText.textContent = correctAnswer;
  if (waitingStatus) waitingStatus.style.display = 'none';
  if (revealBtn) revealBtn.style.display = 'none';
  if (nextBtn) nextBtn.style.display = 'inline-block';

  // Broadcast reveal to players
  socketRevealAnswer(state.currentSongIndex);

  addLiveUpdate(`Answer: ${correctAnswer}`);
  updateLiveScoreboard();

  // Step 1: Show correct answer reveal on host screen (2.5 seconds)
  showCorrectAnswerReveal(correctAnswer);

  // Step 2: Hide answer, show scoreboard (after 2.5 seconds)
  setTimeout(() => {
    hideCorrectAnswerReveal();
    showIntermediateLeaderboard();
  }, 2500);

  // Step 3: Hide scoreboard, proceed to next song (after 6 seconds total)
  setTimeout(() => {
    hideIntermediateLeaderboard();
    nextSong();
  }, 6000);
}

/**
 * Move to next song
 */
export function nextSong() {
  if (!state.currentPlayer?.isHost) return;

  const nextIndex = state.currentSongIndex + 1;
  const totalSongs = state.gameSession?.settings.songsCount || state.musicQuizSongs.length;

  if (nextIndex >= totalSongs) {
    // Game finished
    finishGame();
  } else {
    // Move to next song
    socketNextSong();
    state.setCurrentSongIndex(nextIndex);
    state.setOptionsSentForCurrentSong(false);
    resetHostControls();
    playCurrentSong();
  }
}

/**
 * Replay current clip (host)
 */
export function replayClip() {
  if (!state.currentPlayer?.isHost) return;

  const clipDuration = state.gameSession?.settings.clipDuration || 20;
  replayMultiplayerClip(clipDuration);
}

/**
 * Finish the game
 */
export function finishGame() {
  socketEndGame();
}

// =========================
// RESULTS
// =========================

/**
 * Show multiplayer results
 */
export function showMultiplayerResults() {
  if (!state.gameSession) return;

  // Show multiplayer results section, hide single player results
  const multiResultsDiv = getElementById('multiplayer-results');
  const singleResultsDiv = getElementById('single-player-results');
  const playAgainMultiBtn = getElementById('play-again-btn');
  const playAgainSingleBtn = getElementById('play-again-single-btn');

  if (multiResultsDiv) multiResultsDiv.style.display = 'block';
  if (singleResultsDiv) singleResultsDiv.classList.add('hidden');
  if (playAgainMultiBtn) playAgainMultiBtn.style.display = 'inline-block';
  if (playAgainSingleBtn) playAgainSingleBtn.classList.add('hidden');

  const sortedPlayers = [...state.gameSession.players]
    .filter((p) => !p.isHost)
    .sort((a, b) => b.score - a.score);

  // Populate podium
  populatePodium(sortedPlayers);

  // Show other rankings
  showOtherRankings(sortedPlayers);

  // Start confetti for winner
  startConfetti();
}

/**
 * Populate the podium with top 3 players
 * @param {Array} sortedPlayers
 */
function populatePodium(sortedPlayers) {
  // Match the HTML IDs: podium-1st, podium-2nd, podium-3rd
  const positions = ['1st', '2nd', '3rd'];

  positions.forEach((position, index) => {
    const podiumEl = getElementById(`podium-${position}`);
    if (!podiumEl) return;

    // Find the .podium-players div inside
    const playersDiv = podiumEl.querySelector('.podium-players');
    if (!playersDiv) return;

    if (sortedPlayers[index]) {
      const player = sortedPlayers[index];
      playersDiv.innerHTML = `
        <div class="podium-player-info">
          <div class="podium-player-name">${player.name}</div>
          <div class="podium-player-score">${player.score} pts</div>
        </div>
      `;
      podiumEl.classList.remove('hidden');
    } else {
      playersDiv.innerHTML = '';
      podiumEl.classList.add('hidden');
    }
  });
}

/**
 * Show rankings for players not in top 3
 * @param {Array} sortedPlayers
 */
function showOtherRankings(sortedPlayers) {
  const otherRankingsEl = getElementById('other-rankings');
  if (!otherRankingsEl) return;

  if (sortedPlayers.length <= 3) {
    otherRankingsEl.classList.add('hidden');
    return;
  }

  otherRankingsEl.classList.remove('hidden');
  otherRankingsEl.innerHTML = sortedPlayers
    .slice(3)
    .map(
      (player, index) => `
      <div class="ranking-entry">
        <span class="rank">${getOrdinalSuffix(index + 4)}</span>
        <span class="name">${player.name}</span>
        <span class="score">${player.score} pts</span>
      </div>
    `
    )
    .join('');
}

// =========================
// GAME MANAGEMENT
// =========================

/**
 * Leave the current game
 */
export function leaveGame() {
  stopCurrentAudio();
  socketLeaveGame();
  state.resetMultiplayerState();
  showPanel('home');
}

/**
 * Kick a player (host only)
 * @param {string} playerId
 */
export function kickPlayer(playerId) {
  if (!state.currentPlayer?.isHost) return;
  socketKickPlayer(playerId);
}

/**
 * Play again (return to lobby)
 */
export function playAgain() {
  if (!state.currentPlayer?.isHost) {
    showNotification('Waiting for host to start new game...', 'info');
    return;
  }

  // Reset game state but keep lobby
  state.setCurrentSongIndex(0);
  state.setOptionsSentForCurrentSong(false);
  state.resetMultiplayerState();

  showPanel('multiplayer-setup');
}

/**
 * Cleanup multiplayer state
 */
export function cleanupMultiplayer() {
  stopCurrentAudio();
  state.resetMultiplayerState();
}

// =========================
// EVENT LISTENERS
// =========================

if (typeof window !== 'undefined') {
  window.addEventListener('gameStarted', ((event) => {
    setupMultiplayerGameInterface();

    if (state.currentPlayer?.isHost) {
      playCurrentSong();
    }
  }));

  window.addEventListener('songChanged', ((event) => {
    const data = event.detail;

    if (state.currentPlayer?.isHost) {
      state.setOptionsSentForCurrentSong(false);
      resetHostControls();
      playCurrentSong();
    }
  }));

  window.addEventListener('gameEnded', ((event) => {
    showMultiplayerResults();
  }));

  // Auto-reveal answer when all players answered or time expired
  window.addEventListener('autoRevealAnswer', () => {
    if (state.currentPlayer?.isHost) {
      revealAnswerAndNext();
    }
  });
}
