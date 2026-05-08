/**
 * Database Service
 * SQLite database for optional game history persistence
 */

import path from 'path';
import { app } from 'electron';
import Database from 'better-sqlite3';
import { settings } from './settings.js';

let db = null;

/**
 * Initialize the database (lazy initialization)
 * Only creates DB when persistence is first enabled
 */
function initializeDatabase() {
  if (db) return db;

  const dbPath = path.join(app.getPath('userData'), 'fam-music-quiz.db');

  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- Game history table
    CREATE TABLE IF NOT EXISTS game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_type TEXT NOT NULL,
      score INTEGER NOT NULL,
      songs_count INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      partial_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      accuracy REAL DEFAULT 0,
      played_at TEXT NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      settings_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Music library table (for tracking play counts and favorites)
    CREATE TABLE IF NOT EXISTS music_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration REAL DEFAULT 0,
      play_count INTEGER DEFAULT 0,
      last_played_at TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_game_history_played_at ON game_history(played_at);
    CREATE INDEX IF NOT EXISTS idx_music_library_play_count ON music_library(play_count);
    CREATE INDEX IF NOT EXISTS idx_music_library_artist ON music_library(artist);
  `);

  return db;
}

/**
 * Get database instance (initializes if needed)
 * @returns {Database|null}
 */
function getDatabase() {
  const persistHistory = settings.get('persistHistory', false);
  if (!persistHistory) {
    return null;
  }
  return initializeDatabase();
}

/**
 * Save a game result
 * @param {Object} result - Game result object
 */
export function saveGameResult(result) {
  const database = getDatabase();
  if (!database) return;

  const stmt = database.prepare(`
    INSERT INTO game_history (
      game_type, score, songs_count, correct_count, partial_count,
      wrong_count, accuracy, played_at, duration_seconds, settings_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    result.gameType || 'single',
    result.score || 0,
    result.songsCount || 0,
    result.correctCount || 0,
    result.partialCount || 0,
    result.wrongCount || 0,
    result.accuracy || 0,
    result.playedAt || new Date().toISOString(),
    result.durationSeconds || 0,
    result.settings ? JSON.stringify(result.settings) : null
  );
}

/**
 * Get game history
 * @param {number} limit - Max results to return
 * @returns {Object[]}
 */
export function getGameHistory(limit = 100) {
  const database = getDatabase();
  if (!database) return [];

  const stmt = database.prepare(`
    SELECT * FROM game_history
    ORDER BY played_at DESC
    LIMIT ?
  `);

  return stmt.all(limit);
}

/**
 * Get game statistics
 * @returns {Object}
 */
export function getGameStats() {
  const database = getDatabase();
  if (!database) {
    return {
      totalGames: 0,
      totalScore: 0,
      averageScore: 0,
      averageAccuracy: 0,
      bestScore: 0,
      totalSongsPlayed: 0,
    };
  }

  const stats = database
    .prepare(
      `
    SELECT
      COUNT(*) as totalGames,
      SUM(score) as totalScore,
      AVG(score) as averageScore,
      AVG(accuracy) as averageAccuracy,
      MAX(score) as bestScore,
      SUM(songs_count) as totalSongsPlayed
    FROM game_history
  `
    )
    .get();

  return {
    totalGames: stats.totalGames || 0,
    totalScore: stats.totalScore || 0,
    averageScore: Math.round(stats.averageScore || 0),
    averageAccuracy: Math.round((stats.averageAccuracy || 0) * 100) / 100,
    bestScore: stats.bestScore || 0,
    totalSongsPlayed: stats.totalSongsPlayed || 0,
  };
}

/**
 * Clear all game history
 */
export function clearGameHistory() {
  const database = getDatabase();
  if (!database) return;

  database.exec('DELETE FROM game_history');
}

/**
 * Update song play count
 * @param {string} filePath - File path of the song
 * @param {Object} metadata - Song metadata
 */
export function updateSongPlayCount(filePath, metadata = {}) {
  const database = getDatabase();
  if (!database) return;

  const stmt = database.prepare(`
    INSERT INTO music_library (file_path, title, artist, album, duration, play_count, last_played_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(file_path) DO UPDATE SET
      play_count = play_count + 1,
      last_played_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(
    filePath,
    metadata.title || null,
    metadata.artist || null,
    metadata.album || null,
    metadata.duration || 0
  );
}

/**
 * Get most played songs
 * @param {number} limit - Max results
 * @returns {Object[]}
 */
export function getMostPlayedSongs(limit = 20) {
  const database = getDatabase();
  if (!database) return [];

  const stmt = database.prepare(`
    SELECT * FROM music_library
    WHERE play_count > 0
    ORDER BY play_count DESC
    LIMIT ?
  `);

  return stmt.all(limit);
}

/**
 * Toggle favorite status for a song
 * @param {string} filePath - File path
 * @param {boolean} isFavorite - Favorite status
 */
export function toggleFavorite(filePath, isFavorite) {
  const database = getDatabase();
  if (!database) return;

  const stmt = database.prepare(`
    UPDATE music_library
    SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP
    WHERE file_path = ?
  `);

  stmt.run(isFavorite ? 1 : 0, filePath);
}

/**
 * Get favorite songs
 * @returns {Object[]}
 */
export function getFavoriteSongs() {
  const database = getDatabase();
  if (!database) return [];

  const stmt = database.prepare(`
    SELECT * FROM music_library
    WHERE is_favorite = 1
    ORDER BY title
  `);

  return stmt.all();
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

// Export database wrapper
export const database = {
  saveGameResult,
  getGameHistory,
  getGameStats,
  clearGameHistory,
  updateSongPlayCount,
  getMostPlayedSongs,
  toggleFavorite,
  getFavoriteSongs,
  closeDatabase,
};

export default database;
