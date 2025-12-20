/**
 * Utility functions
 */

/**
 * Shuffle array in place using Fisher-Yates algorithm
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate a random game ID (6 uppercase alphanumeric characters)
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
 * Format song metadata for display
 * @param {Object} song
 * @returns {string}
 */
export function formatSongAnswer(song) {
  const title = song.metadata?.title || 'Unknown';

  // Clean up title (remove track numbers, etc.)
  const cleanTitle = title.replace(/^\d+[.\-\s]+/, '').trim();

  // If title is just "Unknown", use filename
  if (cleanTitle.toLowerCase() === 'unknown' && song.file?.name) {
    return song.file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  }

  return cleanTitle;
}

/**
 * Shuffle words in a title to create wrong answer
 * @param {string} title
 * @returns {string|null}
 */
export function shuffleWordsInTitle(title) {
  if (!title || title.toLowerCase() === 'unknown') return null;

  // Clean the title
  const cleanTitle = title.replace(/^\d+[.\-\s]+/, '').trim();
  const words = cleanTitle.split(/\s+/);

  if (words.length < 2) return null;

  // Shuffle the words
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Check if actually different
  const result = shuffled.join(' ');
  if (result.toLowerCase() === cleanTitle.toLowerCase()) {
    // Try reversing instead
    return words.reverse().join(' ');
  }

  return result;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 * @param {number} n
 * @returns {string}
 */
export function getOrdinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Format duration in seconds to mm:ss
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Debounce function - delays execution until after wait period of inactivity
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
export function debounce(func, wait) {
  let timeout = null;

  return (...args) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function - limits execution to once per wait period
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
export function throttle(func, wait) {
  let lastCall = 0;
  let timeoutId = null;

  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - lastCall);

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      func(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        func(...args);
      }, remaining);
    }
  };
}

/**
 * Safe JSON parse with fallback
 * @template T
 * @param {string} json
 * @param {T} fallback
 * @returns {T}
 */
export function safeJsonParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Get element by ID with type safety
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function getElementById(id) {
  return document.getElementById(id);
}

/**
 * Query selector with type safety
 * @param {string} selector
 * @returns {Element|null}
 */
export function querySelector(selector) {
  return document.querySelector(selector);
}

/**
 * Query selector all with type safety
 * @param {string} selector
 * @returns {NodeListOf<Element>}
 */
export function querySelectorAll(selector) {
  return document.querySelectorAll(selector);
}

/**
 * Check if we're running in a browser environment
 * @returns {boolean}
 */
export function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Get base URL for the application
 * @returns {string}
 */
export function getBaseUrl() {
  if (!isBrowser()) return '';
  return `${window.location.protocol}//${window.location.host}`;
}

/**
 * Copy text to clipboard
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

/**
 * Parse ID3v1 metadata from the last 128 bytes of an MP3 file
 * @param {ArrayBuffer} buffer
 * @returns {Object|null}
 */
function parseID3v1(buffer) {
  const view = new DataView(buffer);
  const decoder = new TextDecoder('iso-8859-1');

  // ID3v1 tag is at the last 128 bytes
  if (buffer.byteLength < 128) return null;

  const tagOffset = buffer.byteLength - 128;
  const tag = decoder.decode(new Uint8Array(buffer, tagOffset, 3));

  if (tag !== 'TAG') return null;

  const title = decoder.decode(new Uint8Array(buffer, tagOffset + 3, 30)).replace(/\0/g, '').trim();
  const artist = decoder.decode(new Uint8Array(buffer, tagOffset + 33, 30)).replace(/\0/g, '').trim();
  const album = decoder.decode(new Uint8Array(buffer, tagOffset + 63, 30)).replace(/\0/g, '').trim();

  return { title, artist, album };
}

/**
 * Parse ID3v2 metadata from the beginning of an MP3 file
 * @param {ArrayBuffer} buffer
 * @returns {Object|null}
 */
function parseID3v2(buffer) {
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');

  // Check for ID3v2 header
  if (buffer.byteLength < 10) return null;

  const id3 = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2));
  if (id3 !== 'ID3') return null;

  // Get tag size (syncsafe integer)
  const size = (view.getUint8(6) << 21) | (view.getUint8(7) << 14) |
               (view.getUint8(8) << 7) | view.getUint8(9);

  const metadata = {};
  let offset = 10;
  const maxOffset = Math.min(10 + size, buffer.byteLength);

  while (offset < maxOffset - 10) {
    // Frame ID (4 bytes for ID3v2.3/2.4)
    const frameId = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3)
    );

    // Skip if invalid frame
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

    // Frame size
    const frameSize = view.getUint32(offset + 4);
    if (frameSize === 0 || frameSize > maxOffset - offset) break;

    offset += 10; // Skip frame header

    // Extract text frames
    if (frameId === 'TIT2' || frameId === 'TPE1' || frameId === 'TALB') {
      const encoding = view.getUint8(offset);
      let text = '';

      try {
        if (encoding === 0 || encoding === 3) {
          // ISO-8859-1 or UTF-8
          const textDecoder = new TextDecoder(encoding === 0 ? 'iso-8859-1' : 'utf-8');
          text = textDecoder.decode(new Uint8Array(buffer, offset + 1, frameSize - 1));
        } else if (encoding === 1) {
          // UTF-16 with BOM
          const textDecoder = new TextDecoder('utf-16');
          text = textDecoder.decode(new Uint8Array(buffer, offset + 1, frameSize - 1));
        }
        text = text.replace(/\0/g, '').trim();
      } catch (e) {
        text = '';
      }

      if (frameId === 'TIT2') metadata.title = text;
      else if (frameId === 'TPE1') metadata.artist = text;
      else if (frameId === 'TALB') metadata.album = text;
    }

    offset += frameSize;
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

/**
 * Extract metadata from filename as fallback
 * @param {string} fileName
 * @returns {Object}
 */
function parseFilenameMetadata(fileName) {
  const cleanName = fileName.replace(/\.[^/.]+$/, '');
  const parts = cleanName.split(' - ');

  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim(),
    };
  }

  return {
    title: cleanName.replace(/[-_]/g, ' ').trim(),
  };
}

/**
 * Extract metadata from audio file (ID3 tags or filename) - async version
 * @param {File} file
 * @returns {Promise<Object>}
 */
export async function extractFileMetadataAsync(file) {
  const metadata = parseFilenameMetadata(file.name);

  try {
    const buffer = await file.arrayBuffer();

    // Try ID3v2 first (more common in modern files)
    let id3Metadata = parseID3v2(buffer);

    // Fall back to ID3v1
    if (!id3Metadata || !id3Metadata.title) {
      id3Metadata = parseID3v1(buffer);
    }

    // Update metadata if found
    if (id3Metadata) {
      if (id3Metadata.title) metadata.title = id3Metadata.title;
      if (id3Metadata.artist) metadata.artist = id3Metadata.artist;
      if (id3Metadata.album) metadata.album = id3Metadata.album;
    }
  } catch (err) {
    console.warn('Failed to read ID3 metadata:', err);
  }

  return {
    file,
    url: URL.createObjectURL(file),
    metadata,
  };
}

/**
 * Extract metadata from audio file (sync version - uses filename only)
 * @param {File} file
 * @returns {Object}
 */
export function extractSingleFileMetadata(file) {
  return {
    file,
    url: URL.createObjectURL(file),
    metadata: parseFilenameMetadata(file.name),
  };
}

/**
 * Clean up object URLs to prevent memory leaks
 * @param {Array} files
 */
export function revokeObjectUrls(files) {
  files.forEach((file) => {
    if (file.url) {
      URL.revokeObjectURL(file.url);
    }
    if (file.audioUrl) {
      URL.revokeObjectURL(file.audioUrl);
    }
  });
}

/**
 * Local storage helpers
 */
export const storage = {
  get(key, fallback) {
    if (!isBrowser()) return fallback;
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return safeJsonParse(item, fallback);
  },

  set(key, value) {
    if (!isBrowser()) return;
    localStorage.setItem(key, JSON.stringify(value));
  },

  remove(key) {
    if (!isBrowser()) return;
    localStorage.removeItem(key);
  },

  clear() {
    if (!isBrowser()) return;
    localStorage.clear();
  },
};
