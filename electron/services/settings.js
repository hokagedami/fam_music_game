/**
 * Settings Service
 * Manages application settings using electron-store
 */

import Store from 'electron-store';

// Settings schema
const schema = {
  // Music library paths that user has added
  musicLibraryPaths: {
    type: 'array',
    items: {
      type: 'string',
    },
    default: [],
  },

  // Path where downloaded music zips are extracted
  downloadedMusicPath: {
    type: 'string',
    default: '',
  },

  // Whether to persist game history to SQLite
  persistHistory: {
    type: 'boolean',
    default: false,
  },

  // Window bounds for restoration
  windowBounds: {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
    },
    default: {
      width: 1200,
      height: 800,
    },
  },

  // Last used game settings
  lastGameSettings: {
    type: 'object',
    properties: {
      songsCount: { type: 'number' },
      clipDuration: { type: 'number' },
      answerTime: { type: 'number' },
      maxPlayers: { type: 'number' },
      autoplayNext: { type: 'boolean' },
      shuffleSongs: { type: 'boolean' },
    },
    default: {
      songsCount: 10,
      clipDuration: 20,
      answerTime: 15,
      maxPlayers: 6,
      autoplayNext: true,
      shuffleSongs: true,
    },
  },

  // Whether to check for updates on startup
  checkUpdatesOnStartup: {
    type: 'boolean',
    default: true,
  },

  // Server mode: 'local' (embedded) or 'remote' (connect to deployed server)
  serverMode: {
    type: 'string',
    enum: ['local', 'remote'],
    default: 'local',
  },

  // Remote server URL (used when serverMode is 'remote')
  remoteServerUrl: {
    type: 'string',
    default: '',
  },

  // Last scanned music library (cached for faster startup)
  cachedMusicLibrary: {
    type: 'array',
    items: {
      type: 'object',
    },
    default: [],
  },

  // When the music library was last scanned
  lastLibraryScanTime: {
    type: 'number',
    default: 0,
  },
};

// Create settings store
export const settings = new Store({
  schema,
  name: 'fam-music-quiz-settings',
  // Migrations for future version changes
  migrations: {
    '1.0.0': (store) => {
      // Initial migration - nothing to do
    },
  },
});

/**
 * Get a setting value
 * @param {string} key - Setting key
 * @param {*} defaultValue - Default value if not set
 * @returns {*}
 */
export function getSetting(key, defaultValue = undefined) {
  return settings.get(key, defaultValue);
}

/**
 * Set a setting value
 * @param {string} key - Setting key
 * @param {*} value - Value to set
 */
export function setSetting(key, value) {
  settings.set(key, value);
}

/**
 * Get all settings
 * @returns {Object}
 */
export function getAllSettings() {
  return settings.store;
}

/**
 * Reset all settings to defaults
 */
export function resetSettings() {
  settings.clear();
}

/**
 * Add a music library path
 * @param {string} newPath - Path to add
 * @returns {string[]} Updated paths array
 */
export function addMusicLibraryPath(newPath) {
  const paths = settings.get('musicLibraryPaths', []);
  if (!paths.includes(newPath)) {
    paths.push(newPath);
    settings.set('musicLibraryPaths', paths);
  }
  return paths;
}

/**
 * Remove a music library path
 * @param {string} pathToRemove - Path to remove
 * @returns {string[]} Updated paths array
 */
export function removeMusicLibraryPath(pathToRemove) {
  const paths = settings.get('musicLibraryPaths', []);
  const filtered = paths.filter((p) => p !== pathToRemove);
  settings.set('musicLibraryPaths', filtered);
  return filtered;
}

/**
 * Update cached music library
 * @param {Object[]} songs - Array of song objects
 */
export function updateCachedLibrary(songs) {
  settings.set('cachedMusicLibrary', songs);
  settings.set('lastLibraryScanTime', Date.now());
}

/**
 * Check if library cache is stale (older than 1 hour)
 * @returns {boolean}
 */
export function isLibraryCacheStale() {
  const lastScan = settings.get('lastLibraryScanTime', 0);
  const oneHour = 60 * 60 * 1000;
  return Date.now() - lastScan > oneHour;
}

export default settings;
