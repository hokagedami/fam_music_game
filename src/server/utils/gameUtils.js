/**
 * Generate a random 6-character game ID
 * @returns {string}
 */
export function generateGameId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Sanitize game session for socket transmission
 * Removes circular references and sensitive data
 * @param {Object} game
 * @returns {Object}
 */
export function sanitizeGameSession(game) {
  return {
    id: game.id,
    host: game.host,
    hostId: game.hostId,
    settings: game.settings,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isReady: p.isReady,
      score: p.score,
    })),
    state: game.state,
    currentSong: game.currentSong,
    songs: game.songs,
    audioUrls: game.audioUrls,
    kahootOptions: game.kahootOptions,
    createdAt: game.createdAt,
  };
}

/**
 * Calculate points based on response time
 * Faster responses get more points (max 1000, min 100)
 * @param {number} responseTimeMs
 * @param {number} maxTimeMs
 * @returns {number}
 */
export function calculatePoints(responseTimeMs, maxTimeMs) {
  const timeRatio = Math.max(0, 1 - responseTimeMs / maxTimeMs);
  const points = Math.round(100 + 900 * timeRatio);
  return Math.min(1000, Math.max(100, points));
}

/**
 * Format time duration for display
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
