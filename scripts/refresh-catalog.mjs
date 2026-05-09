// Refresh songs-cache.json + covers from JW's public pub-media API.
// Replaces the Puppeteer-based scraper entirely — no browser, no DOM walking,
// just one HTTPS call to b.jw-cdn.org plus a small range-fetch per song to
// pull the embedded cover and read the MP3 frame header.
//
//   node scripts/refresh-catalog.mjs            # incremental
//   node scripts/refresh-catalog.mjs --force    # re-fetch everything
//
// Incremental rule: a song is reused as-is if its modifiedDatetime hasn't
// changed and its cover file already exists on disk.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseBuffer } from 'music-metadata';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..', 'src', 'server');
const CACHE_FILE = path.join(SERVER_DIR, 'songs-cache.json');
const COVERS_DIR = path.join(SERVER_DIR, 'covers');

const PUB = 'sjjc';
const LANG = 'E';
const FORMAT = 'MP3';
const PUBMEDIA_URL = `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?pub=${PUB}&langwritten=${LANG}&fileformat=${FORMAT}`;

const CONCURRENCY = 8;
const RANGE_BYTES = 256 * 1024;
const ID3_OVERHEAD = 10 * 1024;
const force = process.argv.includes('--force');

function filenameFromUrl(url) {
  return url.split('/').pop().split('?')[0];
}

function coverPathFor(filename) {
  const base = (filename || '').replace(/\.[^.]+$/, '');
  return path.join(COVERS_DIR, `${base}.jpg`);
}

async function fileExists(p) {
  return fs.access(p).then(() => true).catch(() => false);
}

async function fetchCatalog() {
  const r = await fetch(PUBMEDIA_URL);
  if (!r.ok) throw new Error(`pubMedia ${r.status} ${r.statusText}`);
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

async function processOne(song, prevByFilename) {
  const coverFile = coverPathFor(song.filename);
  const coverExists = await fileExists(coverFile);

  if (!force) {
    const prev = prevByFilename.get(song.filename);
    if (
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

async function pool(items, n, fn) {
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
        const tag = status === 'kept' ? '✓ kept   ' : '↓ fetched';
        process.stdout.write(`  [${String(done).padStart(3)}/${items.length}] ${tag}  ${item.filename}\n`);
      } catch (err) {
        counts.failed++;
        done++;
        process.stdout.write(`  [${String(done).padStart(3)}/${items.length}] ✗ failed   ${item.filename}  ${err.message}\n`);
        out[idx] = item;
      }
    }
  });
  await Promise.all(workers);
  return { out, counts };
}

async function main() {
  console.log(`Fetching catalog from pubMedia (pub=${PUB}, lang=${LANG})…`);
  const t0 = Date.now();
  const catalog = await fetchCatalog();
  console.log(`  ${catalog.songs.length} songs · pubName: ${catalog.pubName} · lastUpdated: ${catalog.lastUpdated}`);

  await fs.mkdir(COVERS_DIR, { recursive: true });

  let prevSongs = [];
  try {
    const prev = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    prevSongs = Array.isArray(prev.songs) ? prev.songs : [];
  } catch { /* first run */ }
  const prevByFilename = new Map(prevSongs.map((s) => [s.filename, s]));

  console.log(`Processing ${catalog.songs.length} songs (concurrency=${CONCURRENCY}${force ? ', force' : ''})…`);
  const { out: songs, counts } = await pool(catalog.songs, CONCURRENCY, (s) => processOne(s, prevByFilename));

  const totalSec = songs.reduce((a, s) => a + (s.duration || 0), 0);
  const totalMb = (songs.reduce((a, s) => a + (s.size || 0), 0) / 1024 / 1024).toFixed(1);

  const out = {
    pubName: catalog.pubName,
    lastUpdated: catalog.lastUpdated,
    songs,
    refreshedAt: new Date().toISOString(),
  };
  await fs.writeFile(CACHE_FILE, JSON.stringify(out, null, 2));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
  console.log(`  kept:    ${counts.kept}`);
  console.log(`  fetched: ${counts.fetched}`);
  if (counts.failed) console.log(`  failed:  ${counts.failed}`);
  console.log(`  total runtime: ${Math.round(totalSec / 60)} min`);
  console.log(`  total size:    ${totalMb} MB`);
  console.log(`  written:       ${path.relative(process.cwd(), CACHE_FILE)} + covers/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
