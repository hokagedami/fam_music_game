// CLI wrapper around src/server/catalog-refresher.js. The same module powers
// the in-process /rest/refreshCatalog.view endpoint, so this script and the
// running server always do the same thing.
//
//   node scripts/refresh-catalog.mjs            # incremental
//   node scripts/refresh-catalog.mjs --force    # re-fetch everything

import path from 'path';
import { fileURLToPath } from 'url';
import { refreshCatalog } from '../src/server/catalog-refresher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..', 'src', 'server');
const CACHE_FILE = path.join(SERVER_DIR, 'songs-cache.json');
const COVERS_DIR = path.join(SERVER_DIR, 'covers');

const force = process.argv.includes('--force');

console.log(`Fetching catalog from pubMedia API…`);

const result = await refreshCatalog({
  cacheFile: CACHE_FILE,
  coversDir: COVERS_DIR,
  force,
  onProgress: ({ done, total, status, song, error }) => {
    const tag = status === 'kept' ? '✓ kept   '
              : status === 'fetched' ? '↓ fetched'
              : '✗ failed ';
    const suffix = error ? `  ${error}` : '';
    process.stdout.write(`  [${String(done).padStart(3)}/${total}] ${tag}  ${song.filename}${suffix}\n`);
  },
});

console.log(`\nDone in ${(result.elapsedMs / 1000).toFixed(1)}s.`);
console.log(`  pubName:       ${result.pubName}`);
console.log(`  lastUpdated:   ${result.lastUpdated}`);
console.log(`  kept:          ${result.counts.kept}`);
console.log(`  fetched:       ${result.counts.fetched}`);
if (result.counts.failed) console.log(`  failed:        ${result.counts.failed}`);
console.log(`  total runtime: ${Math.round(result.totalSec / 60)} min`);
console.log(`  total size:    ${(result.totalBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  written:       ${path.relative(process.cwd(), CACHE_FILE)} + covers/`);
