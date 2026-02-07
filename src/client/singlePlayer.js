/**
 * Single player game logic
 */

import * as state from './state.js';
import { getElementById, shuffleArray, formatSongAnswer, extractSingleFileMetadata } from './utils.js';
import {
  showPanel,
  showNotification,
  showLoading,
  hideLoading,
  updateSinglePlayerDisplay,
  displayKahootOptions,
  resetKahootOptionStates,
  displayMusicFileList,
} from './ui.js';
import { playSinglePlayerSong, stopCurrentAudio, replaySinglePlayerClip, stopSinglePlayerTimeBonus } from './audio.js';
import { generateKahootOptions, selectKahootOption as kahootSelectOption } from './kahoot.js';

// =========================
// GAME SETUP
// =========================

/**
 * Start single player mode
 */
export function startSinglePlayerMode() {
  state.setCurrentMode('single-player');

  // Update setup title for single player
  const setupTitle = getElementById('setup-title');
  if (setupTitle) {
    setupTitle.textContent = 'Single Player Setup';
  }

  showPanel('setup');
  setupSinglePlayerUI();
}

/**
 * Setup single player UI
 */
function setupSinglePlayerUI() {
  const songsCountSelect = getElementById('songs-count');
  const clipDurationSelect = getElementById('clip-duration');
  const startButton = getElementById('start-game-button');
  const maxPlayersGroup = getElementById('max-players-group');

  if (songsCountSelect) {
    songsCountSelect.value = '10';
  }

  if (clipDurationSelect) {
    clipDurationSelect.value = '20';
  }

  if (startButton) {
    startButton.disabled = state.musicFiles.length === 0;
  }

  // Hide max players option in single player mode
  if (maxPlayersGroup) {
    maxPlayersGroup.style.display = 'none';
  }
}

/**
 * Load music files for single player
 * @param {Event} event
 */
export function loadSinglePlayerMusic(event) {
  const input = event.target;
  if (!input.files || input.files.length === 0) return;

  showLoading('Loading music files...');

  const files = Array.from(input.files);
  const musicFiles = [];

  files.forEach((file) => {
    if (file.type.startsWith('audio/')) {
      musicFiles.push(extractSingleFileMetadata(file));
    }
  });

  state.setMusicFiles(musicFiles);
  displayMusicFileList('single');

  const startButton = getElementById('start-single-game-btn');
  if (startButton) {
    startButton.disabled = musicFiles.length === 0;
  }

  hideLoading();
  showNotification(`Loaded ${musicFiles.length} songs`, 'success');
}

/**
 * Start the single player game
 */
export function startSinglePlayerGame() {
  const songsCountSelect = getElementById('songs-count');
  const clipDurationSelect = getElementById('clip-duration');

  const songsCount = parseInt(songsCountSelect?.value || '10');
  const clipDuration = parseInt(clipDurationSelect?.value || '20');

  if (state.musicFiles.length === 0) {
    showNotification('Please load music files first', 'error');
    return;
  }

  // Setup game state
  state.resetSinglePlayerState();

  state.setSinglePlayerSettings({
    songsCount: Math.min(songsCount, state.musicFiles.length),
    clipDuration,
    answerTime: 30,
    maxPlayers: 1,
    autoplayEnabled: true,
  });

  // Shuffle and select songs
  const shuffledSongs = shuffleArray([...state.musicFiles]);
  const selectedSongs = shuffledSongs.slice(0, Math.min(songsCount, shuffledSongs.length));
  state.setSinglePlayerSongs(selectedSongs);

  state.setClipDuration(clipDuration);
  state.setSinglePlayerGameStartTime(Date.now());

  // Start the game
  showPanel('single-game');
  setupSinglePlayerGameInterface();
  playSinglePlayerSongAtIndex(0);
}

/**
 * Setup single player game interface
 */
function setupSinglePlayerGameInterface() {
  // Show single player controls
  const singlePlayerControls = getElementById('single-player-controls');
  if (singlePlayerControls) {
    singlePlayerControls.classList.remove('hidden');
  }

  // Show single player score display
  const scoreDisplay = getElementById('single-player-score');
  if (scoreDisplay) {
    scoreDisplay.style.display = 'block';
  }

  updateSinglePlayerDisplay();

  // Setup Kahoot option click handlers
  const options = document.querySelectorAll('#single-kahoot-options .kahoot-option');
  options.forEach((option) => {
    const optionEl = option;
    const optionIndex = parseInt(optionEl.dataset.option || '0');
    optionEl.onclick = () => selectKahootOptionSingle(optionEl, optionIndex);
  });
}

// =========================
// GAME FLOW
// =========================

/**
 * Play song at specific index
 * @param {number} index
 */
function playSinglePlayerSongAtIndex(index) {
  if (index >= state.singlePlayerSongs.length) {
    finishSinglePlayerGame();
    return;
  }

  state.setSinglePlayerCurrentSong(index);
  const song = state.singlePlayerSongs[index];

  // Generate Kahoot options
  const options = generateKahootOptions(song, state.singlePlayerSongs, index);
  displayKahootOptions(options, 'single');

  // Update display
  updateSinglePlayerDisplay();

  // Play the song
  const clipDuration = state.singlePlayerSettings.clipDuration || 20;
  playSinglePlayerSong(song, clipDuration, () => {
    // Song clip ended - player can still answer
  });
}

/**
 * Handle Kahoot option selection (wrapper)
 * @param {HTMLElement} element
 * @param {number} optionIndex
 */
function selectKahootOptionSingle(element, optionIndex) {
  kahootSelectOption(element, optionIndex);
}

/**
 * Move to next song
 */
export function nextSinglePlayerSong() {
  const nextIndex = state.singlePlayerCurrentSong + 1;

  if (nextIndex >= state.singlePlayerSongs.length) {
    finishSinglePlayerGame();
  } else {
    playSinglePlayerSongAtIndex(nextIndex);
  }
}

/**
 * Skip current song
 */
export function skipSinglePlayerSong() {
  // Record as skipped
  const currentSong = state.singlePlayerSongs[state.singlePlayerCurrentSong];
  state.singlePlayerAnswers.push({
    songIndex: state.singlePlayerCurrentSong,
    guess: '',
    selectedAnswer: '',
    isCorrect: false,
    points: 0,
    accuracy: 'Skipped',
    correctTitle: currentSong?.metadata?.title || 'Unknown',
    correctArtist: currentSong?.metadata?.artist || 'Unknown',
    correctAlbum: currentSong?.metadata?.album || 'Unknown',
    timeBonus: 0,
    streak: 0,
  });

  // Reset streak
  state.setSinglePlayerCurrentStreak(0);

  stopCurrentAudio();
  stopSinglePlayerTimeBonus();

  showNotification('Song skipped', 'info');
  nextSinglePlayerSong();
}

/**
 * Replay current clip
 */
export function replaySingleClip() {
  const clipDuration = state.singlePlayerSettings.clipDuration || 20;
  replaySinglePlayerClip(clipDuration);
}

/**
 * Show hints for current song
 */
export function showSingleHints() {
  const currentSong = state.singlePlayerSongs[state.singlePlayerCurrentSong];
  if (!currentSong) return;

  const hints = [];

  if (currentSong.metadata?.artist && currentSong.metadata.artist !== 'Unknown') {
    hints.push(`Artist: ${currentSong.metadata.artist}`);
  }

  if (currentSong.metadata?.album && currentSong.metadata.album !== 'Unknown') {
    hints.push(`Album: ${currentSong.metadata.album}`);
  }

  if (currentSong.metadata?.year) {
    hints.push(`Year: ${currentSong.metadata.year}`);
  }

  if (hints.length > 0) {
    showNotification(hints.join(' | '), 'info');
  } else {
    showNotification('No hints available', 'info');
  }
}

/**
 * Reveal answer for current song
 */
export function revealSingleAnswer() {
  const currentSong = state.singlePlayerSongs[state.singlePlayerCurrentSong];
  if (!currentSong) return;

  const answer = formatSongAnswer(currentSong);
  showNotification(`Answer: ${answer}`, 'info');

  // Show correct option
  const correctOptionEl = document.querySelector(
    `#single-kahoot-options .kahoot-option[data-option="${state.kahootCorrectIndex}"]`
  );
  if (correctOptionEl) {
    correctOptionEl.classList.add('correct');
  }

  // Disable all options
  const allOptions = document.querySelectorAll('#single-kahoot-options .kahoot-option');
  allOptions.forEach((opt) => opt.classList.add('disabled'));
}

// =========================
// GAME END
// =========================

/**
 * Finish single player game
 */
function finishSinglePlayerGame() {
  stopCurrentAudio();
  stopSinglePlayerTimeBonus();

  showPanel('single-results');
  showSinglePlayerResults();
}

/**
 * Show single player results
 */
function showSinglePlayerResults() {
  // Show single player results section, hide multiplayer results
  const singleResultsDiv = getElementById('single-player-results');
  const multiResultsDiv = getElementById('multiplayer-results');
  const playAgainSingleBtn = getElementById('play-again-single-btn');
  const playAgainMultiBtn = getElementById('play-again-btn');

  if (singleResultsDiv) singleResultsDiv.classList.remove('hidden');
  if (multiResultsDiv) multiResultsDiv.style.display = 'none';
  if (playAgainSingleBtn) playAgainSingleBtn.classList.remove('hidden');
  if (playAgainMultiBtn) playAgainMultiBtn.style.display = 'none';

  const scoreEl = getElementById('final-score');
  const correctEl = getElementById('correct-count');
  const partialEl = getElementById('partial-count');
  const wrongEl = getElementById('wrong-count');
  const accuracyEl = getElementById('accuracy-percentage');
  const gradeEl = getElementById('score-grade');

  const correctCount = state.singlePlayerAnswers.filter((a) => a.isCorrect).length;
  const partialCount = state.singlePlayerAnswers.filter((a) => a.isPartial).length;
  const wrongCount = state.singlePlayerAnswers.filter((a) => !a.isCorrect && !a.isPartial).length;
  const totalSongs = state.singlePlayerSongs.length;
  const accuracy = totalSongs > 0 ? Math.round((correctCount / totalSongs) * 100) : 0;

  // Determine grade
  let grade = '🎵';
  if (accuracy >= 90) grade = '🌟';
  else if (accuracy >= 70) grade = '🎸';
  else if (accuracy >= 50) grade = '🎤';

  if (scoreEl) scoreEl.textContent = String(state.singlePlayerScore);
  if (correctEl) correctEl.textContent = String(correctCount);
  if (partialEl) partialEl.textContent = String(partialCount);
  if (wrongEl) wrongEl.textContent = String(wrongCount);
  if (accuracyEl) accuracyEl.textContent = `${accuracy}%`;
  if (gradeEl) gradeEl.textContent = grade;

  // Show detailed results
  showSinglePlayerDetailedResults();
}

/**
 * Show detailed results breakdown
 */
function showSinglePlayerDetailedResults() {
  const resultsListEl = getElementById('single-results-list');
  if (!resultsListEl) return;

  resultsListEl.innerHTML = '';

  state.singlePlayerAnswers.forEach((answer, index) => {
    const song = state.singlePlayerSongs[index];
    const resultEl = document.createElement('div');
    resultEl.className = `result-item ${answer.isCorrect ? 'correct' : 'incorrect'}`;
    resultEl.innerHTML = `
      <div class="result-number">${index + 1}</div>
      <div class="result-info">
        <div class="result-title">${song?.metadata?.title || 'Unknown'}</div>
        <div class="result-artist">${song?.metadata?.artist || 'Unknown'}</div>
      </div>
      <div class="result-status">
        ${answer.isCorrect ? '✅' : '❌'}
        <span class="result-points">${answer.points > 0 ? `+${answer.points}` : '0'}</span>
      </div>
    `;
    resultsListEl.appendChild(resultEl);
  });
}

/**
 * Play again
 */
export function playAgainSingle() {
  state.resetSinglePlayerState();
  showPanel('setup');
  setupSinglePlayerUI();
}

/**
 * Export results to text file
 */
export function exportSinglePlayerResults() {
  const correctCount = state.singlePlayerAnswers.filter((a) => a.isCorrect).length;
  const totalSongs = state.singlePlayerSongs.length;
  const accuracy = totalSongs > 0 ? Math.round((correctCount / totalSongs) * 100) : 0;

  let text = `Music Quiz Results\n`;
  text += `==================\n\n`;
  text += `Score: ${state.singlePlayerScore}\n`;
  text += `Correct: ${correctCount}/${totalSongs} (${accuracy}%)\n`;
  text += `Best Streak: ${state.singlePlayerBestStreak}\n\n`;
  text += `Song Results:\n`;
  text += `-------------\n`;

  state.singlePlayerAnswers.forEach((answer, index) => {
    const song = state.singlePlayerSongs[index];
    const status = answer.isCorrect ? 'O' : 'X';
    text += `${index + 1}. ${status} ${song?.metadata?.title || 'Unknown'} - ${answer.points} pts\n`;
  });

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `music-quiz-results-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification('Results exported!', 'success');
}

/**
 * Cleanup single player state
 */
export function cleanupSinglePlayer() {
  stopCurrentAudio();
  stopSinglePlayerTimeBonus();
  state.resetSinglePlayerState();
}

// Listen for next song event from kahoot module
if (typeof window !== 'undefined') {
  window.addEventListener('nextSinglePlayerSong', () => {
    nextSinglePlayerSong();
  });
}
