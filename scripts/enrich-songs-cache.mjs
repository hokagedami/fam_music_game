// One-shot enrichment: walks songs-cache.json, fetches a small head of each MP3
// from JW's CDN, parses duration / bitrate / size, and writes the enriched JSON
// back. Re-run after each scrape refresh.
//
//   node scripts/enrich-songs-cache.mjs
//
// Idempotent — songs that already have non-zero duration+size are skipped unless
// you pass --force.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseBuffer } from 'music-metadata';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.resolve(__dirname, '..', 'src', 'server', 'songs-cache.json');

const CONCURRENCY = 8;
const RANGE_BYTES = 256 * 1024;
const force = process.argv.includes('--force');

async function enrichOne(song) {
  if (!force && song.size > 0 && song.duration > 0) return song;

  const headRes = await fetch(song.url, { method: 'HEAD' });
  if (!headRes.ok) throw new Error(`HEAD ${headRes.status}`);
  const size = parseInt(headRes.headers.get('content-length') || '0', 10);
  if (!size) throw new Error('no content-length');

  const getRes = await fetch(song.url, {
    headers: { Range: `bytes=0-${RANGE_BYTES - 1}` },
  });
  if (!getRes.ok && getRes.status !== 206) throw new Error(`GET ${getRes.status}`);
  const buf = Buffer.from(await getRes.arrayBuffer());

  // music-metadata's duration from a partial buffer counts only frames in the
  // buffer, not the whole file. For CBR MP3s (which is what JW serves), compute
  // duration directly from total size and the bitrate parsed from the frame header.
  const md = await parseBuffer(buf, { mimeType: 'audio/mpeg' });
  const bitRate = Math.round((md.format.bitrate || 0) / 1000); // kbps
  // Subtract a small ID3 tag overhead estimate; <0.5% error on multi-MB files.
  const ID3_OVERHEAD = 10 * 1024;
  const duration = bitRate > 0
    ? Math.max(1, Math.round((size - ID3_OVERHEAD) * 8 / (bitRate * 1000)))
    : 0;

  return { ...song, size, duration, bitRate };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: n }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      try {
        out[idx] = await fn(item, idx);
        done++;
        process.stdout.write(`  [${String(done).padStart(3)}/${items.length}] ${item.filename}\n`);
      } catch (err) {
        done++;
        process.stdout.write(`  [${String(done).padStart(3)}/${items.length}] ${item.filename}  ✗ ${err.message}\n`);
        out[idx] = item;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const raw = await fs.readFile(CACHE_FILE, 'utf8');
  const data = JSON.parse(raw);
  const songs = Array.isArray(data.songs) ? data.songs : [];
  const toProcess = force ? songs.length : songs.filter((s) => !(s.size > 0 && s.duration > 0)).length;
  console.log(`Enriching ${toProcess}/${songs.length} songs (concurrency=${CONCURRENCY}${force ? ', force' : ''})…`);

  const t0 = Date.now();
  const enriched = await pool(songs, CONCURRENCY, enrichOne);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const withDur = enriched.filter((s) => s.duration > 0).length;
  const totalSec = enriched.reduce((a, s) => a + (s.duration || 0), 0);
  const totalMb = (enriched.reduce((a, s) => a + (s.size || 0), 0) / 1024 / 1024).toFixed(1);

  const out = { ...data, songs: enriched, enrichedAt: new Date().toISOString() };
  await fs.writeFile(CACHE_FILE, JSON.stringify(out, null, 2));

  console.log(`\nDone in ${elapsed}s.`);
  console.log(`  with duration: ${withDur}/${enriched.length}`);
  console.log(`  total runtime: ${Math.round(totalSec / 60)} min`);
  console.log(`  total size:    ${totalMb} MB`);
  console.log(`  written to:    ${CACHE_FILE}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
