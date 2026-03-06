import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';

/**
 * SQLite-backed game store with in-memory cache.
 * Games live in memory for fast access; SQLite provides persistence
 * across server restarts and durable reconnect tokens.
 */
class GameStore {
  constructor() {
    /** @type {Map<string, Object>} */
    this.games = new Map();
    /** @type {Map<string, string>} socketId -> gameId */
    this.socketGameMap = new Map();
    /** @type {NodeJS.Timeout|null} */
    this.cleanupInterval = null;

    // Initialize SQLite
    this.db = this._initDb();
    this._loadGamesFromDb();
    this.startCleanup();
  }

  // =========================
  // DATABASE INITIALIZATION
  // =========================

  _initDb() {
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'lobby',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reconnect_tokens (
        token TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        player_name TEXT NOT NULL COLLATE NOCASE,
        is_host INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tokens_game ON reconnect_tokens(game_id);
      CREATE INDEX IF NOT EXISTS idx_games_state ON games(state);
    `);

    // Prepare frequently-used statements
    this._stmts = {
      upsertGame: db.prepare(`
        INSERT INTO games (game_id, data, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(game_id) DO UPDATE SET
          data = excluded.data,
          state = excluded.state,
          updated_at = excluded.updated_at
      `),
      deleteGame: db.prepare('DELETE FROM games WHERE game_id = ?'),
      loadActiveGames: db.prepare(
        "SELECT game_id, data FROM games WHERE state IN ('lobby', 'playing')"
      ),
      insertToken: db.prepare(
        'INSERT OR REPLACE INTO reconnect_tokens (token, game_id, player_name, is_host, created_at) VALUES (?, ?, ?, ?, ?)'
      ),
      getToken: db.prepare('SELECT * FROM reconnect_tokens WHERE token = ?'),
      deleteToken: db.prepare('DELETE FROM reconnect_tokens WHERE token = ?'),
      deleteTokensForGame: db.prepare('DELETE FROM reconnect_tokens WHERE game_id = ?'),
      deleteTokenForPlayer: db.prepare(
        'DELETE FROM reconnect_tokens WHERE game_id = ? AND player_name = ? COLLATE NOCASE'
      ),
      cleanupOldGames: db.prepare('DELETE FROM games WHERE updated_at < ?'),
    };

    return db;
  }

  // =========================
  // SERIALIZATION
  // =========================

  _serializeGame(game) {
    const obj = { ...game };
    // Convert Set to Array for JSON
    obj.revealedSongs = Array.from(game.revealedSongs || []);
    // Strip timer references (non-serializable, transient)
    delete obj.answerTimer;
    delete obj.hostDisconnectTimer;
    // Strip player timer references
    obj.players = (game.players || []).map((p) => {
      const { disconnectTimer, ...rest } = p;
      return rest;
    });
    return JSON.stringify(obj);
  }

  _deserializeGame(json) {
    const game = JSON.parse(json);
    game.revealedSongs = new Set(game.revealedSongs || []);
    // Socket IDs are stale after restart — clients will reconnect with tokens
    game.hostId = null;
    game.players.forEach((p) => {
      p.id = null;
    });
    return game;
  }

  _loadGamesFromDb() {
    const rows = this._stmts.loadActiveGames.all();
    let loaded = 0;

    for (const row of rows) {
      try {
        const game = this._deserializeGame(row.data);
        this.games.set(row.game_id, game);
        loaded++;
      } catch (err) {
        console.error(`Failed to load game ${row.game_id} from DB:`, err.message);
      }
    }

    if (loaded > 0) {
      console.log(`Restored ${loaded} active game(s) from database`);
    }
  }

  // =========================
  // PERSISTENCE
  // =========================

  /**
   * Persist a game's current state to SQLite
   * @param {string} gameId
   */
  persist(gameId) {
    const game = this.games.get(gameId);
    if (!game) return;

    try {
      const now = Date.now();
      this._stmts.upsertGame.run(
        gameId,
        this._serializeGame(game),
        game.state,
        game.createdAt || now,
        now
      );
    } catch (err) {
      console.error(`Failed to persist game ${gameId}:`, err.message);
    }
  }

  // =========================
  // GAME CRUD (same API as before)
  // =========================

  /**
   * Register a socket's association with a game
   */
  registerSocket(socketId, gameId) {
    this.socketGameMap.set(socketId, gameId);
  }

  /**
   * Unregister a socket's association
   */
  unregisterSocket(socketId) {
    this.socketGameMap.delete(socketId);
  }

  /**
   * Get the game ID associated with a socket
   */
  getGameIdForSocket(socketId) {
    return this.socketGameMap.get(socketId);
  }

  /**
   * Get a game by ID
   */
  get(gameId) {
    return this.games.get(gameId);
  }

  /**
   * Check if a game exists
   */
  has(gameId) {
    return this.games.has(gameId);
  }

  /**
   * Add or update a game (also persists to DB)
   */
  set(gameId, game) {
    this.games.set(gameId, game);
    this.persist(gameId);
  }

  /**
   * Delete a game (also removes from DB, cascades to tokens)
   */
  delete(gameId) {
    const game = this.games.get(gameId);
    if (game) {
      if (game.answerTimer) clearTimeout(game.answerTimer);
      if (game.hostDisconnectTimer) clearTimeout(game.hostDisconnectTimer);
      // Clean up player timers
      for (const player of game.players) {
        if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
      }
      // Clean up socket mappings
      if (game.hostId) this.socketGameMap.delete(game.hostId);
      for (const player of game.players) {
        this.socketGameMap.delete(player.id);
      }
    }
    this.games.delete(gameId);

    try {
      // CASCADE deletes associated reconnect_tokens
      this._stmts.deleteGame.run(gameId);
    } catch (err) {
      console.error(`Failed to delete game ${gameId} from DB:`, err.message);
    }

    return !!game;
  }

  /**
   * Get all games
   */
  getAll() {
    return this.games;
  }

  /**
   * Get game count
   */
  get size() {
    return this.games.size;
  }

  /**
   * Get all game IDs
   */
  keys() {
    return this.games.keys();
  }

  /**
   * Get all games as entries
   */
  entries() {
    return this.games.entries();
  }

  /**
   * Get all games as array
   */
  getAllGames() {
    return Array.from(this.games.values());
  }

  // =========================
  // RECONNECT TOKENS
  // =========================

  /**
   * Create a reconnect token for a player/host
   * @param {string} gameId
   * @param {string} playerName
   * @param {boolean} isHost
   * @returns {string} token
   */
  createReconnectToken(gameId, playerName, isHost = false) {
    // Remove any existing token for this player in this game
    try {
      this._stmts.deleteTokenForPlayer.run(gameId, playerName);
    } catch (_) {
      // Ignore — may not exist
    }

    const token = randomUUID();
    try {
      this._stmts.insertToken.run(token, gameId, playerName, isHost ? 1 : 0, Date.now());
    } catch (err) {
      console.error(`Failed to create reconnect token:`, err.message);
    }
    return token;
  }

  /**
   * Look up a reconnect token
   * @param {string} token
   * @returns {{ gameId: string, playerName: string, isHost: boolean } | null}
   */
  getReconnectToken(token) {
    if (!token) return null;
    try {
      const row = this._stmts.getToken.get(token);
      if (!row) return null;
      return {
        gameId: row.game_id,
        playerName: row.player_name,
        isHost: row.is_host === 1,
      };
    } catch (err) {
      console.error(`Failed to get reconnect token:`, err.message);
      return null;
    }
  }

  /**
   * Delete a specific reconnect token
   * @param {string} token
   */
  deleteReconnectToken(token) {
    if (!token) return;
    try {
      this._stmts.deleteToken.run(token);
    } catch (err) {
      console.error(`Failed to delete reconnect token:`, err.message);
    }
  }

  /**
   * Delete all reconnect tokens for a game
   * @param {string} gameId
   */
  deleteTokensForGame(gameId) {
    try {
      this._stmts.deleteTokensForGame.run(gameId);
    } catch (err) {
      console.error(`Failed to delete tokens for game ${gameId}:`, err.message);
    }
  }

  /**
   * Delete reconnect token for a specific player in a game
   * @param {string} gameId
   * @param {string} playerName
   */
  deleteTokensForPlayer(gameId, playerName) {
    try {
      this._stmts.deleteTokenForPlayer.run(gameId, playerName);
    } catch (err) {
      console.error(`Failed to delete token for player ${playerName}:`, err.message);
    }
  }

  // =========================
  // CLEANUP
  // =========================

  /**
   * Clean up inactive games
   */
  cleanup() {
    const now = Date.now();
    const maxAge = config.gameTimeoutHours * 60 * 60 * 1000;
    let cleanedCount = 0;

    for (const [gameId, game] of this.games.entries()) {
      if (now - game.createdAt > maxAge || game.players.length === 0) {
        if (game.answerTimer) clearTimeout(game.answerTimer);
        if (game.hostDisconnectTimer) clearTimeout(game.hostDisconnectTimer);
        for (const player of game.players) {
          if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
        }
        this.games.delete(gameId);
        cleanedCount++;
        console.log(`Cleaned up inactive game: ${gameId}`);
      }
    }

    // Also clean old games from DB
    try {
      this._stmts.cleanupOldGames.run(now - maxAge);
    } catch (err) {
      console.error('DB cleanup error:', err.message);
    }

    return cleanedCount;
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
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
   * Close the database connection
   */
  close() {
    this.stopCleanup();
    if (this.db) {
      this.db.close();
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
