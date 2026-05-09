// Shared catalog refresh logic. Used by:
//   - scripts/refresh-catalog.mjs (CLI, run before deploy)
//   - subsonic.js /rest/refreshCatalog.view (in-process, on-demand)
//
// Fetches the SJJC catalog from JW's public pub-media JSON API, range-fetches
// each MP3's first 256 KB to read the frame header + extract the embedded APIC
// cover, computes CBR duration from filesize + bitrate, and writes
// songs-cache.json + covers/<basename>.jpg.

import fs from 'fs/promises';
import path from 'path';
import { parseBuffer } from 'music-metadata';

const PUB = 'sjjc';
const LANG = 'E';
const FORMAT = 'MP3';
export const PUBMEDIA_URL =
  `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?pub=${PUB}&langwritten=${LANG}&fileformat=${FORMAT}`;

const RANGE_BYTES = 256 * 1024;
const ID3_OVERHEAD = 10 * 1024;

function filenameFromUrl(url) {
  return url.split('/').pop().split('?')[0];
}

function coverPathFor(coversDir, filename) {
  const base = (filename || '').replace(/\.[^.]+$/, '');
  return path.join(coversDir, `${base}.jpg`);
}

async function fileExists(p) {
  return fs.access(p).then(() => true).catch(() => false);
}

async function fetchPubMedia() {
  const r = await fetch(PUBMEDIA_URL);
  if (!r.ok) throw new Error(`pubMedia HTTP ${r.status}`);
  const j = await r.json();
  const entries = j.files?.[LANG]?.[FORMAT] || [];
  if (!entries.length) throw new Error(`No ${LANG}/${FORMAT} entries in pubMedia response`);

  const songs = entries
    .filter((m) => m.file?.url)
    .map((m) => ({
      url: m.file.url,
      filename: filenameFromUrl(m.file.url),
      title: m.title,
      size: m.filesize || 0,
      modifiedDatetime: m.file.modifiedDatetime || '',
    }));

  const dates = songs.map((s) => s.modifiedDatetime.slice(0, 10)).filter(Boolean).sort();
  const lastUpdated = dates.at(-1) || new Date().toISOString().slice(0, 10);
  return { pubName: j.pubName, lastUpdated, songs };
}

async function processSong(song, prev, force, coversDir) {
  const coverFile = coverPathFor(coversDir, song.filename);
  const coverExists = await fileExists(coverFile);

  if (
    !force &&
    prev &&
    prev.modifiedDatetime === song.modifiedDatetime &&
    prev.duration > 0 &&
    prev.bitRate > 0 &&
    coverExists
  ) {
    return {
      song: {
        url: song.url,
        filename: song.filename,
        title: song.title,
        size: song.size || prev.size,
        modifiedDatetime: song.modifiedDatetime,
        duration: prev.duration,
        bitRate: prev.bitRate,
      },
      status: 'kept',
    };
  }

  const r = await fetch(song.url, { headers: { Range: `bytes=0-${RANGE_BYTES - 1}` } });
  if (!r.ok && r.status !== 206) throw new Error(`GET ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());

  const md = await parseBuffer(buf, { mimeType: 'audio/mpeg' });
  const bitRate = Math.round((md.format.bitrate || 0) / 1000);
  const duration = bitRate > 0
    ? Math.max(1, Math.round((song.size - ID3_OVERHEAD) * 8 / (bitRate * 1000)))
    : 0;

  const picture = md.common.picture?.[0];
  if (picture?.data?.length) {
    await fs.writeFile(coverFile, Buffer.from(picture.data));
  }

  return { song: { ...song, duration, bitRate }, status: 'fetched' };
}

async function runPool(items, n, fn, onProgress) {
  const out = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const counts = { kept: 0, fetched: 0, failed: 0 };
  const workers = Array.from({ length: n }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      try {
        const { song, status } = await fn(item, idx);
        counts[status]++;
        out[idx] = song;
        done++;
        onProgress?.({ done, total: items.length, status, song: item });
      } catch (err) {
        counts.failed++;
        done++;
        out[idx] = item;
        onProgress?.({ done, total: items.length, status: 'failed', song: item, error: err.message });
      }
    }
  });
  await Promise.all(workers);
  return { out, counts };
}

/**
 * @param {object} opts
 * @param {string} opts.cacheFile - path to songs-cache.json (read for incremental, written atomically).
 * @param {string} opts.coversDir - directory to extract per-song covers into.
 * @param {boolean} [opts.force=false] - refetch every song's bytes even if unchanged.
 * @param {number} [opts.concurrency=8]
 * @param {(p: {done:number,total:number,status:'kept'|'fetched'|'failed',song:object,error?:string}) => void} [opts.onProgress]
 * @returns {Promise<{pubName:string,lastUpdated:string,songCount:number,counts:{kept:number,fetched:number,failed:number},totalSec:number,totalBytes:number,elapsedMs:number}>}
 */
export async function refreshCatalog({
  cacheFile,
  coversDir,
  force = false,
  concurrency = 8,
  onProgress = null,
}) {
  if (!cacheFile || !coversDir) throw new Error('cacheFile and coversDir are required');
  const t0 = Date.now();
  await fs.mkdir(coversDir, { recursive: true });

  const catalog = await fetchPubMedia();

  let prevSongs = [];
  try {
    const prev = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    prevSongs = Array.isArray(prev.songs) ? prev.songs : [];
  } catch { /* first run */ }
  const prevByFilename = new Map(prevSongs.map((s) => [s.filename, s]));

  const { out: songs, counts } = await runPool(
    catalog.songs,
    concurrency,
    (s) => processSong(s, prevByFilename.get(s.filename), force, coversDir),
    onProgress,
  );

  const totalSec = songs.reduce((a, s) => a + (s.duration || 0), 0);
  const totalBytes = songs.reduce((a, s) => a + (s.size || 0), 0);

  const payload = {
    pubName: catalog.pubName,
    lastUpdated: catalog.lastUpdated,
    songs,
    refreshedAt: new Date().toISOString(),
  };

  // Atomic write so concurrent reads don't see a half-written JSON.
  const tmp = `${cacheFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2));
  await fs.rename(tmp, cacheFile);

  return {
    pubName: catalog.pubName,
    lastUpdated: catalog.lastUpdated,
    songCount: songs.length,
    counts,
    totalSec,
    totalBytes,
    elapsedMs: Date.now() - t0,
  };
}
