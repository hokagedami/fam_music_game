/**
 * Kahoot-style quiz options logic
 */

import * as state from './state.js';
import { shuffleArray, formatSongAnswer, getElementById } from './utils.js';
import {
  displayKahootOptions,
  resetKahootOptionStates,
  showNotification,
  showAnswerTimer,
  updateAnswerTimer,
  hideAnswerTimer,
  showPlayerResult,
  updateSinglePlayerDisplay,
} from './ui.js';
import { stopSinglePlayerTimeBonus } from './audio.js';
import { getSocket } from './socket.js';

// =========================
// OPTION GENERATION
// =========================

/**
 * Get song title only from metadata
 * @param {Object} song
 * @returns {string}
 */
function getSongTitle(song) {
  const title = song?.metadata?.title;
  if (!title) return 'Unknown';
  return title.replace(/^\d+[.\-\s]+/, '').trim() || 'Unknown';
}

/**
 * Generate Kahoot-style options for a single song
 * @param {Object} correctSong
 * @param {Array} allSongs
 * @param {number} [songIndex=0]
 * @returns {Array}
 */
export function generateKahootOptions(correctSong, allSongs, songIndex = 0) {
  const options = [];

  // Use only the title from metadata
  const correctAnswer = getSongTitle(correctSong);
  options.push({ text: correctAnswer, isCorrect: true });

  // Get wrong answers from other songs in the library
  const wrongAnswers = getWrongAnswers(correctSong, allSongs, 3, songIndex);
  wrongAnswers.forEach((answer) => {
    options.push({ text: answer, isCorrect: false });
  });

  // Shuffle options
  shuffleArray(options);

  // Store the correct index after shuffling
  const correctIndex = options.findIndex((opt) => opt.isCorrect);
  state.setKahootCorrectIndex(correctIndex);
  state.setCurrentKahootOptions(options);
  state.setKahootAnswerSelected(false);

  return options;
}

/**
 * Pre-generate all Kahoot options for a game
 * @param {Array} songs - Songs selected for this game round
 * @param {Array} allMusicFiles - All uploaded music files (for wrong options)
 * @returns {Array}
 */
export function preGenerateAllKahootOptions(songs, allMusicFiles = null) {
  const allOptions = [];
  // Use all music files for wrong options if provided, otherwise fall back to selected songs
  const wrongOptionPool = allMusicFiles && allMusicFiles.length > 0 ? allMusicFiles : songs;

  songs.forEach((song, index) => {
    const options = [];

    // Use only the title from metadata
    const correctAnswer = getSongTitle(song);
    options.push({ text: correctAnswer, isCorrect: true });

    // Get wrong answers from all music files (not just selected songs)
    const wrongAnswers = getWrongAnswers(song, wrongOptionPool, 3, -1);
    wrongAnswers.forEach((answer) => {
      options.push({ text: answer, isCorrect: false });
    });

    // Shuffle options
    shuffleArray(options);

    // Find correct index after shuffling
    const correctIndex = options.findIndex((opt) => opt.isCorrect);

    allOptions.push({
      songIndex: index,
      options: options,
      correctIndex: correctIndex,
    });
  });

  return allOptions;
}

/**
 * Get wrong answers for Kahoot options - ONLY titles from songs in the selected folder
 * If there aren't enough unique songs, repeat from the pool to fill all slots
 * @param {Object} correctSong
 * @param {Array} allSongs
 * @param {number} count
 * @param {number} songIndex
 * @returns {string[]}
 */
function getWrongAnswers(correctSong, allSongs, count, songIndex) {
  const wrongAnswers = [];
  const usedAnswers = new Set();
  const correctTitleOriginal = getSongTitle(correctSong);
  const correctTitleLower = correctTitleOriginal.toLowerCase();
  usedAnswers.add(correctTitleLower);

  // Get other songs from the folder, excluding the correct song
  const otherSongs = allSongs.filter((song, idx) => {
    if (songIndex >= 0 && idx === songIndex) return false;
    const songTitle = getSongTitle(song).toLowerCase();
    return songTitle !== correctTitleLower && songTitle !== 'unknown';
  });

  // Shuffle to randomize which songs are picked for each question
  shuffleArray(otherSongs);

  // Use only titles from other songs in folder
  for (const song of otherSongs) {
    if (wrongAnswers.length >= count) break;
    const title = getSongTitle(song);
    const titleLower = title.toLowerCase();
    if (title && !usedAnswers.has(titleLower) && titleLower !== 'unknown') {
      usedAnswers.add(titleLower);
      wrongAnswers.push(title);
    }
  }

  // If we don't have enough unique wrong answers, repeat from the pool
  // This handles cases where fewer than 4 songs are in the library
  if (wrongAnswers.length < count && otherSongs.length > 0) {
    let repeatIndex = 0;
    while (wrongAnswers.length < count) {
      const song = otherSongs[repeatIndex % otherSongs.length];
      const title = getSongTitle(song);
      if (title && title.toLowerCase() !== 'unknown') {
        wrongAnswers.push(title);
      }
      repeatIndex++;
      // Safety: prevent infinite loop if all songs are 'unknown'
      if (repeatIndex >= otherSongs.length * count) break;
    }
  }

  // If still not enough (e.g., only 1 song total), use the correct song title as filler
  // This is a fallback - user should have at least 2 songs for a meaningful game
  while (wrongAnswers.length < count) {
    wrongAnswers.push(correctTitleOriginal);
  }

  return wrongAnswers.slice(0, count);
}

/**
 * Generate multiplayer Kahoot options (generated just before each song plays)
 * @param {Object} correctSong - The current song being played
 * @param {Array} selectedSongs - Songs selected for this game (to find current song index)
 * @param {Array} allMusicFiles - All music files for wrong options pool (maintains randomness)
 * @returns {{options: Array, correctIndex: number}}
 */
export function generateMultiplayerKahootOptions(correctSong, selectedSongs, allMusicFiles = null) {
  const options = [];

  // Use only the title from metadata
  const correctAnswer = getSongTitle(correctSong);
  options.push({ text: correctAnswer, isCorrect: true });

  // Use all music files for wrong options if provided, otherwise fall back to selected songs
  const wrongOptionsPool = allMusicFiles && allMusicFiles.length > 0 ? allMusicFiles : selectedSongs;

  const wrongAnswers = getWrongAnswers(
    correctSong,
    wrongOptionsPool,
    3,
    -1 // Use -1 since we're filtering by title, not index
  );
  wrongAnswers.forEach((answer) => {
    options.push({ text: answer, isCorrect: false });
  });

  shuffleArray(options);
  const correctIndex = options.findIndex((opt) => opt.isCorrect);

  return { options, correctIndex };
}

// =========================
// SINGLE PLAYER SELECTION
// =========================

/**
 * Handle Kahoot option selection in single player
 * @param {HTMLElement} element
 * @param {number} optionIndex
 */
export function selectKahootOption(element, optionIndex) {
  if (state.kahootAnswerSelected) return;

  state.setKahootAnswerSelected(true);
  const selectedOption = state.currentKahootOptions[optionIndex];
  const isCorrect = selectedOption?.isCorrect || false;

  // Mark selected option
  element.classList.add('selected');

  // Disable all options
  const allOptions = document.querySelectorAll('#single-kahoot-options .kahoot-option');
  allOptions.forEach((opt) => opt.classList.add('disabled'));

  // Show correct/wrong feedback after a short delay
  setTimeout(() => {
    // Always show the correct answer
    const correctOptionEl = document.querySelector(
      `#single-kahoot-options .kahoot-option[data-option="${state.kahootCorrectIndex}"]`
    );
    if (correctOptionEl) {
      correctOptionEl.classList.add('correct');
    }

    // If wrong, mark the selected as wrong
    if (!isCorrect) {
      element.classList.add('wrong');
    }

    // Score the answer
    scoreSinglePlayerKahootAnswer(isCorrect);

    // Auto-advance after showing result
    setTimeout(() => {
      // This will be called from singlePlayer module
      window.dispatchEvent(new CustomEvent('nextSinglePlayerSong'));
    }, 2000);
  }, 500);
}

/**
 * Score a single player Kahoot answer
 * @param {boolean} isCorrect
 */
function scoreSinglePlayerKahootAnswer(isCorrect) {
  const currentSong = state.singlePlayerSongs[state.singlePlayerCurrentSong];
  let points = 0;

  if (isCorrect) {
    // Base points + time bonus
    points = 100 + state.singlePlayerTimeBonus * 10;

    // Update streak
    const newStreak = state.singlePlayerCurrentStreak + 1;
    state.setSinglePlayerCurrentStreak(newStreak);
    state.setSinglePlayerBestStreak(Math.max(state.singlePlayerBestStreak, newStreak));

    // Streak bonus
    if (newStreak >= 3) {
      const streakBonus = newStreak * 5;
      points += streakBonus;
    }

    showNotification(`Correct! +${points} points`, 'success');
  } else {
    // Reset streak on wrong answer
    state.setSinglePlayerCurrentStreak(0);
    showNotification('Wrong answer!', 'error');
  }

  // Record answer
  const correctOption = state.currentKahootOptions.find((o) => o.isCorrect);
  state.singlePlayerAnswers.push({
    songIndex: state.singlePlayerCurrentSong,
    guess: correctOption?.text || '',
    selectedAnswer: state.currentKahootOptions[state.kahootCorrectIndex]?.text || '',
    isCorrect: isCorrect,
    points: points,
    accuracy: isCorrect ? 'Correct!' : 'Incorrect',
    correctTitle: currentSong?.metadata?.title || 'Unknown',
    correctArtist: currentSong?.metadata?.artist || 'Unknown',
    correctAlbum: currentSong?.metadata?.album || 'Unknown',
    timeBonus: state.singlePlayerTimeBonus,
    streak: state.singlePlayerCurrentStreak,
  });

  state.setSinglePlayerScore(state.singlePlayerScore + points);
  stopSinglePlayerTimeBonus();

  // Update display
  updateSinglePlayerDisplay();

  // Stop audio
  const audioElement = getElementById('single-player-audio');
  if (audioElement) audioElement.pause();

  if (state.singlePlayerTimer) {
    clearInterval(state.singlePlayerTimer);
    state.setSinglePlayerTimer(null);
  }
}

// =========================
// MULTIPLAYER SELECTION
// =========================

/**
 * Handle Kahoot option selection in multiplayer (players only)
 * @param {HTMLElement} element
 * @param {number} optionIndex
 */
export function selectKahootOptionMultiplayer(element, optionIndex) {
  if (state.multiplayerKahootAnswered) return;
  if (state.currentPlayer?.isHost) return;

  state.setMultiplayerKahootAnswered(true);
  // Determine if correct by comparing with stored correct index
  const isCorrect = optionIndex === state.multiplayerKahootCorrectIndex;

  // Calculate response time
  const responseTime = Date.now() - state.answerStartTime;
  const responseTimeSeconds = responseTime / 1000;

  // Stop the answer timer
  stopAnswerTimer();

  // Mark selected option
  element.classList.add('selected', 'waiting');

  // Disable all options
  const allOptions = document.querySelectorAll('#nonhost-kahoot-options .kahoot-option');
  allOptions.forEach((opt) => opt.classList.add('disabled'));

  // Send answer to server with response time
  const socket = getSocket();
  if (socket && socket.connected) {
    socket.emit('submitAnswer', {
      gameId: state.gameId,
      playerId: state.currentPlayer?.id,
      playerName: state.currentPlayer?.name,
      answerIndex: optionIndex,
      isCorrect: isCorrect,
      responseTime: responseTime,
      responseTimeSeconds: responseTimeSeconds,
    });
  }

  // Show waiting status
  const answerStatus = getElementById('player-answer-status');
  if (answerStatus) {
    answerStatus.classList.remove('hidden');
  }

  // Hide timer
  hideAnswerTimer();
}

/**
 * Show options to players (called after song plays)
 * @param {Array} options
 * @param {number} correctIndex
 */
export function showOptionsToPlayers(options, correctIndex) {
  state.setMultiplayerKahootOptions(options);
  state.setMultiplayerKahootCorrectIndex(correctIndex);
  state.setMultiplayerKahootAnswered(false);
  state.setAnswerStartTime(Date.now());

  // Hide waiting state, show options
  const waitingState = getElementById('player-waiting-state');
  const optionsContainer = getElementById('nonhost-kahoot-options');
  const answerStatus = getElementById('player-answer-status');
  const resultDisplay = getElementById('player-result-display');

  if (waitingState) waitingState.style.display = 'none';
  if (optionsContainer) optionsContainer.style.display = 'grid';
  if (answerStatus) answerStatus.classList.add('hidden');
  if (resultDisplay) resultDisplay.classList.add('hidden');

  // Update status text
  const statusEl = getElementById('player-song-status');
  if (statusEl) {
    statusEl.textContent = 'Select your answer!';
  }

  // Populate options and hide unused ones
  for (let i = 0; i < 4; i++) {
    const optionWrapper = document.querySelector(`#nonhost-kahoot-options .kahoot-option[data-option="${i}"]`);
    const optionEl = getElementById(`nonhost-option-${i}`);

    if (i < options.length && options[i]) {
      // Show and populate this option
      if (optionWrapper) optionWrapper.style.display = '';
      if (optionEl) optionEl.textContent = options[i].text;
    } else {
      // Hide unused option
      if (optionWrapper) optionWrapper.style.display = 'none';
    }
  }

  // Reset option states
  resetKahootOptionStates('nonhost');

  // Start answer timer
  startAnswerTimer();
}

/**
 * Start the answer countdown timer
 */
export function startAnswerTimer() {
  let timeLeft = state.answerTimeLimit;

  showAnswerTimer(timeLeft);

  if (state.answerTimerInterval) {
    clearInterval(state.answerTimerInterval);
  }

  const interval = setInterval(() => {
    timeLeft--;
    updateAnswerTimer(timeLeft);

    if (timeLeft <= 0) {
      clearInterval(interval);
      state.setAnswerTimerInterval(null);
      // Time's up - auto-submit no answer
      if (!state.multiplayerKahootAnswered) {
        handleTimeUp();
      }
    }
  }, 1000);

  state.setAnswerTimerInterval(interval);
}

/**
 * Stop the answer timer
 */
export function stopAnswerTimer() {
  if (state.answerTimerInterval) {
    clearInterval(state.answerTimerInterval);
    state.setAnswerTimerInterval(null);
  }
  hideAnswerTimer();
}

/**
 * Handle time running out
 */
function handleTimeUp() {
  state.setMultiplayerKahootAnswered(true);

  // Disable all options
  const allOptions = document.querySelectorAll('#nonhost-kahoot-options .kahoot-option');
  allOptions.forEach((opt) => opt.classList.add('disabled'));

  // Send timeout to server
  const socket = getSocket();
  if (socket && socket.connected) {
    socket.emit('submitAnswer', {
      gameId: state.gameId,
      playerId: state.currentPlayer?.id,
      playerName: state.currentPlayer?.name,
      answerIndex: -1, // No answer
      isCorrect: false,
      responseTime: state.answerTimeLimit * 1000,
      responseTimeSeconds: state.answerTimeLimit,
      timedOut: true,
    });
  }

  // Show waiting status
  const answerStatus = getElementById('player-answer-status');
  if (answerStatus) {
    answerStatus.classList.remove('hidden');
    answerStatus.textContent = "Time's up!";
  }

  showNotification("Time's up!", 'error');
}

/**
 * Reset player view for next song
 * @param {number} songNumber
 */
export function resetPlayerViewForNextSong(songNumber) {
  // Reset multiplayer kahoot state
  state.setMultiplayerKahootOptions([]);
  state.setMultiplayerKahootCorrectIndex(-1);
  state.setMultiplayerKahootAnswered(false);
  state.setAnswerStartTime(0);

  // Hide leaderboard overlay if visible
  const leaderboardOverlay = getElementById('intermediate-leaderboard');
  if (leaderboardOverlay) leaderboardOverlay.classList.add('hidden');

  // Show waiting state, hide options
  const waitingState = getElementById('player-waiting-state');
  const optionsContainer = getElementById('nonhost-kahoot-options');
  const answerStatus = getElementById('player-answer-status');
  const resultDisplay = getElementById('player-result-display');

  if (waitingState) waitingState.style.display = 'flex';
  if (optionsContainer) optionsContainer.style.display = 'none';
  if (answerStatus) answerStatus.classList.add('hidden');
  if (resultDisplay) resultDisplay.classList.add('hidden');

  // Update status
  const statusEl = getElementById('player-song-status');
  if (statusEl) {
    statusEl.textContent = `Song ${songNumber} - Listen carefully!`;
  }

  // Reset option states and show all option buttons (for next song)
  resetKahootOptionStates('nonhost');
  for (let i = 0; i < 4; i++) {
    const optionWrapper = document.querySelector(`#nonhost-kahoot-options .kahoot-option[data-option="${i}"]`);
    if (optionWrapper) optionWrapper.style.display = '';
  }

  // Stop any running timer
  stopAnswerTimer();
}
