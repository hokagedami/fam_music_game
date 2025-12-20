/**
 * Audio utility functions
 */

/**
 * Extract metadata from an audio file
 * @param {File} file
 * @returns {Promise<Object>}
 */
export async function extractMetadata(file) {
  return new Promise((resolve) => {
    const metadata = {
      title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
      artist: 'Unknown Artist',
      album: 'Unknown Album',
    };

    // Try to parse metadata from filename (Artist - Title format)
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    const parts = nameWithoutExt.split(' - ');
    if (parts.length >= 2) {
      metadata.artist = parts[0].trim();
      metadata.title = parts.slice(1).join(' - ').trim();
    }

    // Use Web Audio API or jsmediatags if available
    if (typeof window !== 'undefined' && 'jsmediatags' in window) {
      window.jsmediatags.read(file, {
        onSuccess: (tag) => {
          if (tag.tags) {
            metadata.title = tag.tags.title || metadata.title;
            metadata.artist = tag.tags.artist || metadata.artist;
            metadata.album = tag.tags.album || metadata.album;
            metadata.year = tag.tags.year;
            metadata.genre = tag.tags.genre;
          }
          resolve(metadata);
        },
        onError: () => {
          resolve(metadata);
        },
      });
    } else {
      resolve(metadata);
    }
  });
}

/**
 * Create audio URL from file
 * @param {File} file
 * @returns {string}
 */
export function createAudioUrl(file) {
  return URL.createObjectURL(file);
}

/**
 * Revoke audio URL to free memory
 * @param {string} url
 */
export function revokeAudioUrl(url) {
  URL.revokeObjectURL(url);
}

/**
 * Get random start time for clip
 * @param {number} duration
 * @param {number} clipDuration
 * @returns {number}
 */
export function getRandomClipStart(duration, clipDuration) {
  if (duration <= clipDuration) return 0;
  const maxStart = duration - clipDuration;
  return Math.floor(Math.random() * maxStart);
}

/**
 * Load audio file and get duration
 * @param {string} url
 * @returns {Promise<number>}
 */
export function getAudioDuration(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration);
    });
    audio.addEventListener('error', (e) => {
      reject(e);
    });
    audio.src = url;
  });
}

/**
 * Process uploaded files into MusicFile objects
 * @param {FileList|File[]} files
 * @returns {Promise<Array>}
 */
export async function processUploadedFiles(files) {
  const musicFiles = [];

  for (const file of Array.from(files)) {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
      continue;
    }

    const url = createAudioUrl(file);
    const metadata = await extractMetadata(file);

    musicFiles.push({
      file,
      url,
      metadata,
      audioUrl: url,
    });
  }

  return musicFiles;
}

/**
 * Clean up music files (revoke URLs)
 * @param {Array} files
 */
export function cleanupMusicFiles(files) {
  files.forEach((file) => {
    if (file.url) {
      revokeAudioUrl(file.url);
    }
    if (file.audioUrl && file.audioUrl !== file.url) {
      revokeAudioUrl(file.audioUrl);
    }
  });
}
