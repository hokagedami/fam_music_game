/**
 * Audio playback and timer management
 */

import * as state from './state.js';
import { getElementById } from './utils.js';
import { showNotification } from './ui.js';

// =========================
// AUDIO PLAYBACK
// =========================

/**
 * Play audio from a URL with clip duration
 * @param {string} audioUrl
 * @param {string} audioElementId
 * @param {number} duration
 * @param {Function} [onEnded]
 * @returns {HTMLAudioElement|null}
 */
export function playAudioClip(audioUrl, audioElementId, duration, onEnded) {
  const audioElement = getElementById(audioElementId);
  if (!audioElement) {
    console.error(`Audio element not found: ${audioElementId}`);
    return null;
  }

  // Stop any existing audio
  stopCurrentAudio();

  audioElement.src = audioUrl;
  audioElement.currentTime = 0;

  // Set random start time for clip
  audioElement.addEventListener(
    'loadedmetadata',
    () => {
      const audioDuration = audioElement.duration;
      if (audioDuration > duration) {
        const maxStart = audioDuration - duration;
        const randomStart = Math.random() * maxStart;
        audioElement.currentTime = randomStart;
        state.setClipStartTime(randomStart);
      } else {
        state.setClipStartTime(0);
      }

      audioElement.play().catch((err) => {
        console.error('Error playing audio:', err);
        showNotification('Error playing audio', 'error');
      });

      // Set up timer to stop after clip duration
      if (state.audioTimer) {
        clearTimeout(state.audioTimer);
      }

      const timer = setTimeout(() => {
        audioElement.pause();
        if (onEnded) {
          onEnded();
        }
      }, duration * 1000);

      state.setAudioTimer(timer);
    },
    { once: true }
  );

  audioElement.load();
  state.setCurrentAudio(audioElement);

  return audioElement;
}

/**
 * Stop currently playing audio and release resources
 * Properly cleans up to prevent memory leaks
 */
export function stopCurrentAudio() {
  const audio = state.currentAudio;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    // Release media resource to free memory
    audio.src = '';
    audio.load();
    state.setCurrentAudio(null);
  }

  // Clear any pending audio timers
  if (state.audioTimer) {
    clearTimeout(state.audioTimer);
    state.setAudioTimer(null);
  }

  // Clear single player timers
  if (state.singlePlayerTimer) {
    clearInterval(state.singlePlayerTimer);
    state.setSinglePlayerTimer(null);
  }
}

/**
 * Pause current audio
 */
export function pauseCurrentAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
  }
}

/**
 * Resume current audio
 */
export function resumeCurrentAudio() {
  if (state.currentAudio) {
    state.currentAudio.play().catch((err) => {
      console.error('Error resuming audio:', err);
    });
  }
}

/**
 * Replay current clip from the beginning
 * @param {number} duration
 */
export function replayCurrentClip(duration) {
  if (state.currentAudio) {
    state.currentAudio.currentTime = state.clipStartTime;
    state.currentAudio.play().catch((err) => {
      console.error('Error replaying audio:', err);
    });

    // Reset timer
    if (state.audioTimer) {
      clearTimeout(state.audioTimer);
    }

    const timer = setTimeout(() => {
      if (state.currentAudio) {
        state.currentAudio.pause();
      }
    }, duration * 1000);

    state.setAudioTimer(timer);
  }
}

// =========================
// SINGLE PLAYER AUDIO
// =========================

/**
 * Play single player song with timer
 * @param {Object} song
 * @param {number} clipDuration
 * @param {Function} [onEnded]
 */
export function playSinglePlayerSong(song, clipDuration, onEnded) {
  const audioElement = getElementById('single-player-audio');
  if (!audioElement) return;

  stopCurrentAudio();
  stopSinglePlayerTimeBonus();

  audioElement.src = song.url;

  audioElement.addEventListener(
    'loadedmetadata',
    () => {
      const audioDuration = audioElement.duration;
      let startTime = 0;

      if (audioDuration > clipDuration) {
        const maxStart = audioDuration - clipDuration;
        startTime = Math.random() * maxStart;
      }

      audioElement.currentTime = startTime;
      state.setSinglePlayerClipStartTime(startTime);

      audioElement.play().catch((err) => {
        console.error('Error playing audio:', err);
        showNotification('Error playing audio', 'error');
      });

      // Start time bonus countdown
      startSinglePlayerTimeBonus();

      // Setup timer
      setupSinglePlayerAudioTimer(audioElement, clipDuration, startTime, onEnded);
    },
    { once: true }
  );

  audioElement.load();
  state.setCurrentAudio(audioElement);
}

/**
 * Setup audio timer with progress bar
 * @param {HTMLAudioElement} audioElement
 * @param {number} clipDuration
 * @param {number} startTime
 * @param {Function} [onEnded]
 */
function setupSinglePlayerAudioTimer(audioElement, clipDuration, startTime, onEnded) {
  const progressBar = getElementById('single-clip-progress');
  const timeDisplay = getElementById('single-clip-time');

  if (state.singlePlayerTimer) {
    clearInterval(state.singlePlayerTimer);
  }

  const endTime = startTime + clipDuration;

  // Use 250ms interval (4x per second) - sufficient for smooth progress bar
  const timer = setInterval(() => {
    const currentTime = audioElement.currentTime;
    const elapsed = currentTime - startTime;
    const remaining = Math.max(0, clipDuration - elapsed);
    const progress = (elapsed / clipDuration) * 100;

    if (progressBar) {
      progressBar.style.width = `${Math.min(100, progress)}%`;
    }

    if (timeDisplay) {
      timeDisplay.textContent = `${Math.ceil(remaining)}s`;
    }

    if (currentTime >= endTime || remaining <= 0) {
      clearInterval(timer);
      state.setSinglePlayerTimer(null);
      audioElement.pause();
      if (onEnded) {
        onEnded();
      }
    }
  }, 250);

  state.setSinglePlayerTimer(timer);
}

/**
 * Start time bonus countdown
 */
export function startSinglePlayerTimeBonus() {
  state.setSinglePlayerTimeBonus(10);

  const timeBonusEl = getElementById('time-bonus');
  if (timeBonusEl) {
    timeBonusEl.textContent = '10';
  }

  if (state.singlePlayerTimeBonusTimer) {
    clearInterval(state.singlePlayerTimeBonusTimer);
  }

  const timer = setInterval(() => {
    const newBonus = state.singlePlayerTimeBonus - 1;
    state.setSinglePlayerTimeBonus(Math.max(0, newBonus));

    if (timeBonusEl) {
      timeBonusEl.textContent = String(state.singlePlayerTimeBonus);
    }

    if (state.singlePlayerTimeBonus <= 0) {
      clearInterval(timer);
      state.setSinglePlayerTimeBonusTimer(null);
    }
  }, 1000);

  state.setSinglePlayerTimeBonusTimer(timer);
}

/**
 * Stop time bonus countdown
 */
export function stopSinglePlayerTimeBonus() {
  if (state.singlePlayerTimeBonusTimer) {
    clearInterval(state.singlePlayerTimeBonusTimer);
    state.setSinglePlayerTimeBonusTimer(null);
  }
}

/**
 * Replay single player clip
 * @param {number} clipDuration
 */
export function replaySinglePlayerClip(clipDuration) {
  const audioElement = getElementById('single-player-audio');
  if (!audioElement) return;

  audioElement.currentTime = state.singlePlayerClipStartTime;
  audioElement.play().catch((err) => {
    console.error('Error replaying audio:', err);
  });

  // Reset timer
  setupSinglePlayerAudioTimer(
    audioElement,
    clipDuration,
    state.singlePlayerClipStartTime
  );
}

// =========================
// MULTIPLAYER AUDIO
// =========================

/**
 * Play multiplayer song (host only)
 * @param {string} audioUrl
 * @param {number} clipDuration
 * @param {Function} [onEnded]
 */
export function playMultiplayerSong(audioUrl, clipDuration, onEnded) {
  const audioElement = getElementById('host-audio-player');
  if (!audioElement) return;

  stopCurrentAudio();

  audioElement.src = audioUrl;

  audioElement.addEventListener(
    'loadedmetadata',
    () => {
      const audioDuration = audioElement.duration;
      let startTime = 0;

      if (audioDuration > clipDuration) {
        const maxStart = audioDuration - clipDuration;
        startTime = Math.random() * maxStart;
      }

      audioElement.currentTime = startTime;
      state.setClipStartTime(startTime);

      audioElement.play().catch((err) => {
        console.error('Error playing audio:', err);
        showNotification('Error playing audio', 'error');
      });

      // Setup clip end handler
      if (state.audioTimer) {
        clearTimeout(state.audioTimer);
      }

      const timer = setTimeout(() => {
        audioElement.pause();
        if (onEnded) {
          onEnded();
        }
      }, clipDuration * 1000);

      state.setAudioTimer(timer);
    },
    { once: true }
  );

  // Add ended event for when song naturally ends
  audioElement.addEventListener('ended', () => {
    if (onEnded) {
      onEnded();
    }
  }, { once: true });

  audioElement.load();
  state.setCurrentAudio(audioElement);
}

/**
 * Replay multiplayer clip
 * @param {number} clipDuration
 */
export function replayMultiplayerClip(clipDuration) {
  const audioElement = getElementById('host-audio-player');
  if (!audioElement) return;

  audioElement.currentTime = state.clipStartTime;
  audioElement.play().catch((err) => {
    console.error('Error replaying audio:', err);
  });

  // Reset timer
  if (state.audioTimer) {
    clearTimeout(state.audioTimer);
  }

  const timer = setTimeout(() => {
    audioElement.pause();
  }, clipDuration * 1000);

  state.setAudioTimer(timer);
}

/**
 * Update host song number display
 */
export function updateHostSongNumber() {
  const currentSongNum = state.currentSongIndex + 1;
  const totalSongs = state.gameSession?.settings?.songsCount || state.musicQuizSongs?.length || 0;

  // Update host music player counter
  const hostSongNumberEl = getElementById('host-song-number');
  const hostTotalSongsEl = getElementById('host-total-songs');

  if (hostSongNumberEl) {
    hostSongNumberEl.textContent = `Song ${currentSongNum}`;
  }

  if (hostTotalSongsEl) {
    hostTotalSongsEl.textContent = String(totalSongs);
  }

  // Update game panel header counter
  const currentSongNumEl = getElementById('current-song-num');
  const totalSongsEl = getElementById('total-songs');

  if (currentSongNumEl) {
    currentSongNumEl.textContent = String(currentSongNum);
  }

  if (totalSongsEl) {
    totalSongsEl.textContent = String(totalSongs);
  }
}

/**
 * Reset host controls for new song
 */
export function resetHostControls() {
  const showOptionsBtn = getElementById('show-options-btn');
  const revealBtn = getElementById('reveal-answer-btn');
  const nextBtn = getElementById('next-song-btn');
  const waitingStatus = getElementById('host-waiting-status');
  const correctAnswerDiv = getElementById('host-correct-answer');

  // Hide show options button - options are now shown automatically after music ends
  if (showOptionsBtn) showOptionsBtn.style.display = 'none';
  if (revealBtn) {
    revealBtn.style.display = 'none';
    revealBtn.disabled = true;
  }
  if (nextBtn) nextBtn.style.display = 'none';
  if (waitingStatus) waitingStatus.style.display = 'none';
  if (correctAnswerDiv) correctAnswerDiv.classList.add('hidden');

  // Reset options sent flag
  state.setOptionsSentForCurrentSong(false);
}
