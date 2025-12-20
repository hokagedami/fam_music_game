/**
 * Input validation utilities for the music quiz game
 * Prevents DOS attacks and ensures data integrity
 */

/**
 * Validate player name
 * @param {string} name - Player name to validate
 * @returns {string|false} - Sanitized name or false if invalid
 */
export function validatePlayerName(name) {
  if (!name || typeof name !== 'string') return false;

  // Trim and check length
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 20) return false;

  // Allow alphanumeric, spaces, hyphens, apostrophes, underscores, and common unicode chars
  if (!/^[\p{L}\p{N}\s\-'_]+$/u.test(trimmed)) return false;

  return trimmed;
}

/**
 * Validate game settings
 * @param {Object} settings - Game settings object
 * @returns {Object} - Sanitized settings with safe defaults
 */
export function validateGameSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return getDefaultSettings();
  }

  const { songsCount, clipDuration, answerTime, maxPlayers } = settings;

  return {
    songsCount: clamp(parseInt(songsCount, 10) || 5, 1, 50),
    clipDuration: clamp(parseInt(clipDuration, 10) || 20, 5, 60),
    answerTime: clamp(parseInt(answerTime, 10) || 10, 5, 60),
    maxPlayers: clamp(parseInt(maxPlayers, 10) || 10, 2, 50),
  };
}

/**
 * Validate game ID
 * @param {string} gameId - Game ID to validate
 * @returns {string|false} - Sanitized game ID or false if invalid
 */
export function validateGameId(gameId) {
  if (!gameId || typeof gameId !== 'string') return false;

  const trimmed = gameId.trim().toUpperCase();

  // Game IDs should be 6 alphanumeric characters
  if (!/^[A-Z0-9]{6}$/.test(trimmed)) return false;

  return trimmed;
}

/**
 * Validate answer submission
 * @param {Object} data - Answer data
 * @returns {Object|false} - Sanitized data or false if invalid
 */
export function validateAnswerSubmission(data) {
  if (!data || typeof data !== 'object') return false;

  const { answerIndex, responseTime, responseTimeSeconds } = data;

  // Answer index must be 0-3 (4 options)
  const idx = parseInt(answerIndex, 10);
  if (isNaN(idx) || idx < 0 || idx > 3) return false;

  // Response time must be positive and reasonable (max 60 seconds)
  const time = parseFloat(responseTime);
  if (isNaN(time) || time < 0 || time > 60000) return false;

  return {
    answerIndex: idx,
    responseTime: time,
    responseTimeSeconds: clamp(parseFloat(responseTimeSeconds) || time / 1000, 0, 60),
  };
}

/**
 * Validate songs metadata array
 * @param {Array} songs - Array of song metadata objects
 * @returns {Array} - Sanitized songs array
 */
export function validateSongsMetadata(songs) {
  if (!Array.isArray(songs)) return [];

  // Limit to 100 songs max
  const limited = songs.slice(0, 100);

  return limited.map(song => {
    if (!song || typeof song !== 'object') return null;

    const { metadata, url, localUrl, audioUrl, originalName, filename } = song;

    return {
      metadata: {
        title: sanitizeString(metadata?.title, 200) || 'Unknown Title',
        artist: sanitizeString(metadata?.artist, 200) || 'Unknown Artist',
        album: sanitizeString(metadata?.album, 200) || '',
      },
      // Preserve all URL variants for compatibility
      url: typeof url === 'string' ? url : '',
      localUrl: typeof localUrl === 'string' ? localUrl : '',
      audioUrl: typeof audioUrl === 'string' ? audioUrl : '',
      originalName: sanitizeString(originalName, 255) || '',
      filename: sanitizeString(filename, 255) || '',
    };
  }).filter(Boolean);
}

/**
 * Validate kahoot options array
 * @param {Array} options - Pre-generated kahoot options
 * @returns {Array} - Sanitized options array
 */
export function validateKahootOptions(options) {
  if (!Array.isArray(options)) return [];

  return options.slice(0, 100).map(opt => {
    if (!opt || typeof opt !== 'object') return null;

    const { options: optList, correctIndex } = opt;

    if (!Array.isArray(optList) || optList.length !== 4) return null;

    const idx = parseInt(correctIndex, 10);
    if (isNaN(idx) || idx < 0 || idx > 3) return null;

    return {
      options: optList.map(o => sanitizeString(o, 200) || 'Unknown'),
      correctIndex: idx,
    };
  }).filter(Boolean);
}

// =========================
// HELPER FUNCTIONS
// =========================

/**
 * Clamp a number between min and max
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Sanitize a string value
 * @param {any} value
 * @param {number} maxLength
 * @returns {string}
 */
function sanitizeString(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().substring(0, maxLength);
}

/**
 * Get default game settings
 * @returns {Object}
 */
function getDefaultSettings() {
  return {
    songsCount: 5,
    clipDuration: 20,
    answerTime: 10,
    maxPlayers: 10,
  };
}
