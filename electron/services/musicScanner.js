/**
 * Music Scanner Service
 * Scans directories for audio files and extracts metadata
 */

import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';

// Supported audio formats
const SUPPORTED_FORMATS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'];

/**
 * Check if a file is a supported audio format
 * @param {string} filename - Filename to check
 * @returns {boolean}
 */
function isSupportedFormat(filename) {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_FORMATS.includes(ext);
}

/**
 * Extract metadata from an audio file
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Metadata object
 */
async function extractMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath, { duration: true });
    return {
      title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
      artist: metadata.common.artist || 'Unknown Artist',
      album: metadata.common.album || 'Unknown Album',
      year: metadata.common.year || null,
      duration: metadata.format.duration || 0,
      genre: metadata.common.genre?.[0] || null,
      track: metadata.common.track?.no || null,
    };
  } catch (error) {
    // If metadata extraction fails, use filename as title
    console.warn(`Failed to extract metadata from ${filePath}:`, error.message);
    return {
      title: path.basename(filePath, path.extname(filePath)),
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      year: null,
      duration: 0,
      genre: null,
      track: null,
    };
  }
}

/**
 * Recursively scan a directory for audio files
 * @param {string} dirPath - Directory to scan
 * @param {string[]} results - Accumulator for results
 * @returns {string[]} Array of audio file paths
 */
function scanDirectorySync(dirPath, results = []) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories and common non-music directories
        if (!entry.name.startsWith('.') && !['node_modules', '__MACOSX'].includes(entry.name)) {
          scanDirectorySync(fullPath, results);
        }
      } else if (entry.isFile() && isSupportedFormat(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Failed to scan directory ${dirPath}:`, error.message);
  }

  return results;
}

/**
 * Scan a folder for music files and extract metadata
 * @param {string} folderPath - Folder to scan
 * @param {Function} onProgress - Progress callback (receives { current, total, currentFile })
 * @returns {Promise<Object[]>} Array of song objects
 */
export async function scanMusicFolder(folderPath, onProgress = null) {
  // Find all audio files
  const audioFiles = scanDirectorySync(folderPath);

  if (audioFiles.length === 0) {
    return [];
  }

  const songs = [];
  const total = audioFiles.length;

  for (let i = 0; i < audioFiles.length; i++) {
    const filePath = audioFiles[i];

    // Report progress
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        currentFile: path.basename(filePath),
        percentage: Math.round(((i + 1) / total) * 100),
      });
    }

    // Extract metadata
    const metadata = await extractMetadata(filePath);

    songs.push({
      filePath,
      fileName: path.basename(filePath),
      metadata,
      // For compatibility with existing game logic
      name: metadata.title,
      url: `file://${filePath.replace(/\\/g, '/')}`,
    });
  }

  return songs;
}

/**
 * Scan multiple folders and combine results
 * @param {string[]} folderPaths - Array of folder paths
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object[]>} Combined array of song objects
 */
export async function scanMultipleFolders(folderPaths, onProgress = null) {
  const allSongs = [];

  for (const folderPath of folderPaths) {
    const songs = await scanMusicFolder(folderPath, onProgress);
    allSongs.push(...songs);
  }

  // Remove duplicates based on file path
  const uniqueSongs = Array.from(
    new Map(allSongs.map((song) => [song.filePath, song])).values()
  );

  return uniqueSongs;
}

/**
 * Get supported audio formats
 * @returns {string[]}
 */
export function getSupportedFormats() {
  return [...SUPPORTED_FORMATS];
}

export default {
  scanMusicFolder,
  scanMultipleFolders,
  getSupportedFormats,
  extractMetadata,
};
