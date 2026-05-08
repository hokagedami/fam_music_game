/**
 * Zip Downloader Service
 * Downloads and extracts zip files containing music
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { app } from 'electron';
import extractZip from 'extract-zip';
import { scanMusicFolder } from './musicScanner.js';
import { settings } from './settings.js';

/**
 * Get the music downloads directory
 * @returns {string}
 */
function getMusicDownloadsDir() {
  const customPath = settings.get('downloadedMusicPath');
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const defaultPath = path.join(app.getPath('userData'), 'music-downloads');

  // Ensure directory exists
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }

  return defaultPath;
}

/**
 * Download a file from URL
 * @param {string} url - URL to download
 * @param {string} destPath - Destination file path
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath, onProgress = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      const file = fs.createWriteStream(destPath);

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;

        if (onProgress && totalSize) {
          onProgress({
            phase: 'downloading',
            downloaded: downloadedSize,
            total: totalSize,
            percentage: Math.round((downloadedSize / totalSize) * 100),
          });
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Clean up partial file
        reject(err);
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {}); // Clean up partial file
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      fs.unlink(destPath, () => {});
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Generate a unique folder name for extraction
 * @param {string} baseDir - Base directory
 * @param {string} zipName - Original zip filename
 * @returns {string}
 */
function getUniqueExtractDir(baseDir, zipName) {
  const baseName = path.basename(zipName, '.zip');
  let extractDir = path.join(baseDir, baseName);
  let counter = 1;

  while (fs.existsSync(extractDir)) {
    extractDir = path.join(baseDir, `${baseName}-${counter}`);
    counter++;
  }

  return extractDir;
}

/**
 * Download and extract a zip file containing music
 * @param {string} url - URL of the zip file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object[]>} Array of extracted song objects
 */
export async function downloadAndExtractZip(url, onProgress = null) {
  const musicDir = getMusicDownloadsDir();
  const zipFileName = `download-${Date.now()}.zip`;
  const zipPath = path.join(musicDir, zipFileName);

  try {
    // Download the zip file
    if (onProgress) {
      onProgress({
        phase: 'starting',
        message: 'Starting download...',
      });
    }

    await downloadFile(url, zipPath, onProgress);

    // Extract the zip
    if (onProgress) {
      onProgress({
        phase: 'extracting',
        message: 'Extracting files...',
      });
    }

    const extractDir = getUniqueExtractDir(musicDir, path.basename(new URL(url).pathname) || 'music');

    await extractZip(zipPath, {
      dir: extractDir,
    });

    // Clean up zip file
    fs.unlinkSync(zipPath);

    // Scan extracted files for music
    if (onProgress) {
      onProgress({
        phase: 'scanning',
        message: 'Scanning for music files...',
      });
    }

    const songs = await scanMusicFolder(extractDir, (scanProgress) => {
      if (onProgress) {
        onProgress({
          phase: 'scanning',
          ...scanProgress,
        });
      }
    });

    if (onProgress) {
      onProgress({
        phase: 'complete',
        message: `Found ${songs.length} songs`,
        songsCount: songs.length,
        extractPath: extractDir,
      });
    }

    return songs;
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    throw error;
  }
}

/**
 * Get the path where downloaded music is stored
 * @returns {string}
 */
export function getDownloadsPath() {
  return getMusicDownloadsDir();
}

/**
 * Clear all downloaded music
 * @returns {Promise<void>}
 */
export async function clearDownloadedMusic() {
  const musicDir = getMusicDownloadsDir();

  if (fs.existsSync(musicDir)) {
    const entries = fs.readdirSync(musicDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(musicDir, entry.name);

      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  }
}

export default {
  downloadAndExtractZip,
  getDownloadsPath,
  clearDownloadedMusic,
};
