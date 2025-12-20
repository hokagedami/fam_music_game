import { config } from './config.js';

/**
 * In-memory game store
 * In production, this could be replaced with Redis or a database
 */
class GameStore {
  constructor() {
    /** @type {Map<string, Object>} */
    this.games = new Map();
    /** @type {NodeJS.Timeout|null} */
    this.cleanupInterval = null;
    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Get a game by ID
   * @param {string} gameId
   * @returns {Object|undefined}
   */
  get(gameId) {
    return this.games.get(gameId);
  }

  /**
   * Check if a game exists
   * @param {string} gameId
   * @returns {boolean}
   */
  has(gameId) {
    return this.games.has(gameId);
  }

  /**
   * Add or update a game
   * @param {string} gameId
   * @param {Object} game
   */
  set(gameId, game) {
    this.games.set(gameId, game);
  }

  /**
   * Delete a game
   * @param {string} gameId
   * @returns {boolean}
   */
  delete(gameId) {
    const game = this.games.get(gameId);
    if (game?.answerTimer) {
      clearTimeout(game.answerTimer);
    }
    return this.games.delete(gameId);
  }

  /**
   * Get all games
   * @returns {Map<string, Object>}
   */
  getAll() {
    return this.games;
  }

  /**
   * Get game count
   * @returns {number}
   */
  get size() {
    return this.games.size;
  }

  /**
   * Get all game IDs
   * @returns {IterableIterator<string>}
   */
  keys() {
    return this.games.keys();
  }

  /**
   * Get all games as entries
   * @returns {IterableIterator<[string, Object]>}
   */
  entries() {
    return this.games.entries();
  }

  /**
   * Get all games as array
   * @returns {Object[]}
   */
  getAllGames() {
    return Array.from(this.games.values());
  }

  /**
   * Clean up inactive games
   * @returns {number}
   */
  cleanup() {
    const now = Date.now();
    const maxAge = config.gameTimeoutHours * 60 * 60 * 1000;
    let cleanedCount = 0;

    for (const [gameId, game] of this.games.entries()) {
      // Remove games older than max age or with no players
      if (now - game.createdAt > maxAge || game.players.length === 0) {
        if (game.answerTimer) {
          clearTimeout(game.answerTimer);
        }
        this.games.delete(gameId);
        cleanedCount++;
        console.log(`Cleaned up inactive game: ${gameId}`);
      }
    }

    return cleanedCount;
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    // Run cleanup every 30 minutes
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanup();
      if (cleaned > 0) {
        console.log(`Cleanup complete: removed ${cleaned} inactive games`);
      }
    }, 30 * 60 * 1000);
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get stats about the game store
   */
  getStats() {
    const games = Array.from(this.games.values());
    return {
      totalGames: games.length,
      activeGames: games.filter((g) => g.state === 'playing').length,
      lobbyGames: games.filter((g) => g.state === 'lobby').length,
      totalPlayers: games.reduce((sum, g) => sum + g.players.length, 0),
    };
  }
}

// Export singleton instance
export const gameStore = new GameStore();
