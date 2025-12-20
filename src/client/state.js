/**
 * Centralized game state management
 */

// =========================
// SHARED STATE
// =========================

/** @type {'menu'|'single-player'|'multiplayer'} */
export let currentMode = 'menu';
/** @type {'connected'|'connecting'|'disconnected'|'error'} */
export let connectionStatus = 'disconnected';
/** @type {Array} */
export let musicFiles = [];
/** @type {HTMLAudioElement|null} */
export let currentAudio = null;
/** @type {number|null} */
export let audioTimer = null;
export let clipStartTime = 0;
export let clipDuration = 20;

// =========================
// MULTIPLAYER STATE
// =========================

/** @type {Object|null} */
export let gameSession = null;
/** @type {Object|null} */
export let currentPlayer = null;
/** @type {string|null} */
export let gameId = null;
/** @type {Array} */
export let musicQuizSongs = [];
/** @type {Array<string>} */
export let musicQuizSongsUrl = [];
export let currentSongIndex = 0;
/** @type {Array} */
export let musicAnswers = [];
export let autoplayEnabled = true;
/** @type {number|null} */
export let autoplayCountdown = null;
export let offlineMode = false;

// =========================
// SINGLE PLAYER STATE
// =========================

/** @type {Object} */
export let singlePlayerSettings = {};
/** @type {Array} */
export let singlePlayerSongs = [];
export let singlePlayerCurrentSong = 0;
export let singlePlayerScore = 0;
/** @type {Array} */
export let singlePlayerAnswers = [];
/** @type {number|null} */
export let singlePlayerTimer = null;
export let singlePlayerClipStartTime = 0;
export let singlePlayerCurrentStreak = 0;
export let singlePlayerBestStreak = 0;
export let singlePlayerTimeBonus = 0;
/** @type {number|null} */
export let singlePlayerTimeBonusTimer = null;
/** @type {number|null} */
export let singlePlayerGameStartTime = null;

// =========================
// KAHOOT STATE
// =========================

/** @type {Array} */
export let currentKahootOptions = [];
export let kahootCorrectIndex = -1;
export let kahootAnswerSelected = false;

// Multiplayer Kahoot state
/** @type {Array} */
export let multiplayerKahootOptions = [];
export let multiplayerKahootCorrectIndex = -1;
export let multiplayerKahootAnswered = false;
export let answerStartTime = 0;
/** @type {number|null} */
export let answerTimerInterval = null;
export let answerTimeLimit = 15;

// Options sent tracking
export let optionsSentForCurrentSong = false;

// =========================
// STATE SETTERS
// =========================

export function setCurrentMode(mode) {
  currentMode = mode;
}

export function setConnectionStatus(status) {
  connectionStatus = status;
}

export function setMusicFiles(files) {
  musicFiles = files;
}

export function setCurrentAudio(audio) {
  currentAudio = audio;
}

export function setAudioTimer(timer) {
  audioTimer = timer;
}

export function setClipStartTime(time) {
  clipStartTime = time;
}

export function setClipDuration(duration) {
  clipDuration = duration;
}

// Multiplayer setters
export function setGameSession(session) {
  gameSession = session;
}

export function setCurrentPlayer(player) {
  currentPlayer = player;
}

export function setGameId(id) {
  gameId = id;
}

export function setMusicQuizSongs(songs) {
  musicQuizSongs = songs;
}

export function setMusicQuizSongsUrl(urls) {
  musicQuizSongsUrl = urls;
}

export function setCurrentSongIndex(index) {
  currentSongIndex = index;
}

export function setMusicAnswers(answers) {
  musicAnswers = answers;
}

export function setAutoplayEnabled(enabled) {
  autoplayEnabled = enabled;
}

export function setAutoplayCountdown(countdown) {
  autoplayCountdown = countdown;
}

export function setOfflineMode(offline) {
  offlineMode = offline;
}

// Single player setters
export function setSinglePlayerSettings(settings) {
  singlePlayerSettings = settings;
}

export function setSinglePlayerSongs(songs) {
  singlePlayerSongs = songs;
}

export function setSinglePlayerCurrentSong(index) {
  singlePlayerCurrentSong = index;
}

export function setSinglePlayerScore(score) {
  singlePlayerScore = score;
}

export function setSinglePlayerAnswers(answers) {
  singlePlayerAnswers = answers;
}

export function setSinglePlayerTimer(timer) {
  singlePlayerTimer = timer;
}

export function setSinglePlayerClipStartTime(time) {
  singlePlayerClipStartTime = time;
}

export function setSinglePlayerCurrentStreak(streak) {
  singlePlayerCurrentStreak = streak;
}

export function setSinglePlayerBestStreak(streak) {
  singlePlayerBestStreak = streak;
}

export function setSinglePlayerTimeBonus(bonus) {
  singlePlayerTimeBonus = bonus;
}

export function setSinglePlayerTimeBonusTimer(timer) {
  singlePlayerTimeBonusTimer = timer;
}

export function setSinglePlayerGameStartTime(time) {
  singlePlayerGameStartTime = time;
}

// Kahoot setters
export function setCurrentKahootOptions(options) {
  currentKahootOptions = options;
}

export function setKahootCorrectIndex(index) {
  kahootCorrectIndex = index;
}

export function setKahootAnswerSelected(selected) {
  kahootAnswerSelected = selected;
}

export function setMultiplayerKahootOptions(options) {
  multiplayerKahootOptions = options;
}

export function setMultiplayerKahootCorrectIndex(index) {
  multiplayerKahootCorrectIndex = index;
}

export function setMultiplayerKahootAnswered(answered) {
  multiplayerKahootAnswered = answered;
}

export function setAnswerStartTime(time) {
  answerStartTime = time;
}

export function setAnswerTimerInterval(interval) {
  answerTimerInterval = interval;
}

export function setAnswerTimeLimit(limit) {
  answerTimeLimit = limit;
}

export function setOptionsSentForCurrentSong(sent) {
  optionsSentForCurrentSong = sent;
}

// =========================
// RESET FUNCTIONS
// =========================

export function resetSinglePlayerState() {
  singlePlayerSettings = {};
  singlePlayerSongs = [];
  singlePlayerCurrentSong = 0;
  singlePlayerScore = 0;
  singlePlayerAnswers = [];
  singlePlayerCurrentStreak = 0;
  singlePlayerBestStreak = 0;
  singlePlayerTimeBonus = 0;
  singlePlayerGameStartTime = null;

  if (singlePlayerTimer) {
    clearInterval(singlePlayerTimer);
    singlePlayerTimer = null;
  }
  if (singlePlayerTimeBonusTimer) {
    clearInterval(singlePlayerTimeBonusTimer);
    singlePlayerTimeBonusTimer = null;
  }

  // Reset Kahoot state
  currentKahootOptions = [];
  kahootCorrectIndex = -1;
  kahootAnswerSelected = false;
}

export function resetMultiplayerState() {
  gameSession = null;
  currentPlayer = null;
  gameId = null;
  musicQuizSongs = [];
  musicQuizSongsUrl = [];
  currentSongIndex = 0;
  musicAnswers = [];
  autoplayEnabled = true;
  offlineMode = false;
  optionsSentForCurrentSong = false;

  if (autoplayCountdown) {
    clearInterval(autoplayCountdown);
    autoplayCountdown = null;
  }

  // Reset multiplayer Kahoot state
  multiplayerKahootOptions = [];
  multiplayerKahootCorrectIndex = -1;
  multiplayerKahootAnswered = false;
  answerStartTime = 0;

  if (answerTimerInterval) {
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
  }
}

export function resetAllState() {
  currentMode = 'menu';
  musicFiles = [];

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (audioTimer) {
    clearInterval(audioTimer);
    audioTimer = null;
  }

  clipStartTime = 0;
  clipDuration = 20;

  resetSinglePlayerState();
  resetMultiplayerState();
}
