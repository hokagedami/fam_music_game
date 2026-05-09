import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const CACHE_FILE = path.join(__dirname, 'songs-cache.json');
const COVER_FILE = path.join(__dirname, 'album-cover.jpg');

const API_VERSION = '1.16.1';
const SERVER_TYPE = 'jw-music-server';
const SERVER_VERSION = '1.0.0';

const ALBUM_ID = 'sjjc';
const ARTIST_ID = 'jw';
const ALBUM_NAME = 'Sing Out Joyfully to Jehovah—Vocals';
const ARTIST_NAME = "Jehovah's Witnesses";
const ALBUM_GENRE = 'Worship';

const COVER_URL_LG = 'https://cms-imgp.jw-cdn.org/img/p/sjjc/univ/pt/sjjc_univ_lg.jpg';
const COVER_URL_MD = 'https://cms-imgp.jw-cdn.org/img/p/sjjc/univ/pt/sjjc_univ_md.jpg';
const COVER_URL_XS = 'https://cms-imgp.jw-cdn.org/img/p/sjjc/univ/pt/sjjc_univ_xs.jpg';

let cache = { songs: [], urlMap: new Map(), albumYear: null, mtime: 0 };

function md5(s) {
  return crypto.createHash('md5').update(s, 'utf8').digest('hex');
}

function envelope(payload = {}) {
  return {
    'subsonic-response': {
      status: 'ok',
      version: API_VERSION,
      type: SERVER_TYPE,
      serverVersion: SERVER_VERSION,
      openSubsonic: true,
      ...payload,
    },
  };
}

function sendError(res, code, message) {
  return res.status(200).json({
    'subsonic-response': {
      status: 'failed',
      version: API_VERSION,
      type: SERVER_TYPE,
      serverVersion: SERVER_VERSION,
      error: { code, message },
    },
  });
}

function authMiddleware(req, res, next) {
  const expectedUser = process.env.SUBSONIC_USER;
  const expectedPass = process.env.SUBSONIC_PASSWORD;
  if (!expectedUser || !expectedPass) {
    return sendError(res, 0, 'Server missing SUBSONIC_USER / SUBSONIC_PASSWORD');
  }

  const { u, p, t, s } = req.query;
  if (!u) return sendError(res, 10, 'Required parameter "u" missing');
  if (u !== expectedUser) return sendError(res, 40, 'Wrong username or password');

  if (t && s) {
    const expected = md5(expectedPass + s).toLowerCase();
    if (String(t).toLowerCase() === expected) return next();
    return sendError(res, 40, 'Wrong username or password');
  }

  if (p) {
    let plain = String(p);
    if (plain.startsWith('enc:')) {
      plain = Buffer.from(plain.slice(4), 'hex').toString('utf8');
    }
    if (plain === expectedPass) return next();
    return sendError(res, 40, 'Wrong username or password');
  }

  return sendError(res, 10, 'Required auth parameters missing (need t+s or p)');
}

function parseTitle(raw, fallbackTrack) {
  const m = (raw || '').match(/^(\d{1,4})\.\s+(.*)$/);
  if (m) return { track: parseInt(m[1], 10), title: m[2].trim() };
  return { track: fallbackTrack, title: (raw || '').trim() };
}

function suffixAndType(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (ext === 'm4a' || ext === 'aac') return { suffix: 'm4a', contentType: 'audio/mp4' };
  return { suffix: 'mp3', contentType: 'audio/mpeg' };
}

function toSubsonicSong(raw, index) {
  const { track, title } = parseTitle(raw.title, index + 1);
  const { suffix, contentType } = suffixAndType(raw.filename);
  const id = raw.filename || `song-${index + 1}`;
  return {
    id,
    parent: ALBUM_ID,
    isDir: false,
    title,
    album: ALBUM_NAME,
    artist: ARTIST_NAME,
    track,
    year: null,
    genre: ALBUM_GENRE,
    coverArt: ALBUM_ID,
    size: 0,
    contentType,
    suffix,
    duration: 0,
    bitRate: 0,
    path: `${ALBUM_NAME}/${title}.${suffix}`,
    isVideo: false,
    playCount: 0,
    discNumber: 1,
    created: new Date().toISOString(),
    albumId: ALBUM_ID,
    artistId: ARTIST_ID,
    type: 'music',
  };
}

function refreshCache() {
  try {
    const stat = fs.statSync(CACHE_FILE);
    if (cache.mtime && stat.mtimeMs <= cache.mtime) return;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const raw = Array.isArray(data.songs) ? data.songs : [];
    const songs = raw.map((s, i) => toSubsonicSong(s, i));
    const urlMap = new Map(raw.map((s) => [s.filename, s.url]));
    const albumYear = (data.lastUpdated || '').slice(0, 4);
    cache = {
      songs,
      urlMap,
      albumYear: /^\d{4}$/.test(albumYear) ? parseInt(albumYear, 10) : null,
      mtime: stat.mtimeMs,
    };
  } catch (err) {
    if (!cache.mtime) {
      cache = { songs: [], urlMap: new Map(), albumYear: null, mtime: 0 };
    }
  }
}

function albumSummary() {
  return {
    id: ALBUM_ID,
    parent: ARTIST_ID,
    name: ALBUM_NAME,
    title: ALBUM_NAME,
    album: ALBUM_NAME,
    artist: ARTIST_NAME,
    artistId: ARTIST_ID,
    coverArt: ALBUM_ID,
    songCount: cache.songs.length,
    duration: 0,
    playCount: 0,
    created: new Date().toISOString(),
    year: cache.albumYear || undefined,
    genre: ALBUM_GENRE,
    isDir: true,
  };
}

router.use(authMiddleware);

router.get('/ping.view', (req, res) => {
  res.json(envelope());
});

router.get('/getLicense.view', (req, res) => {
  res.json(envelope({
    license: {
      valid: true,
      email: 'self-hosted@local',
      licenseExpires: '2099-12-31T00:00:00.000Z',
    },
  }));
});

router.get('/getMusicFolders.view', (req, res) => {
  res.json(envelope({
    musicFolders: { musicFolder: [{ id: 1, name: ALBUM_NAME }] },
  }));
});

router.get('/getIndexes.view', (req, res) => {
  refreshCache();
  res.json(envelope({
    indexes: {
      lastModified: cache.mtime || 0,
      ignoredArticles: 'The El La Los Las Le Les',
      index: [{
        name: ARTIST_NAME[0],
        artist: [{ id: ARTIST_ID, name: ARTIST_NAME }],
      }],
    },
  }));
});

router.get('/getArtists.view', (req, res) => {
  refreshCache();
  res.json(envelope({
    artists: {
      ignoredArticles: 'The El La Los Las Le Les',
      index: [{
        name: ARTIST_NAME[0],
        artist: [{
          id: ARTIST_ID,
          name: ARTIST_NAME,
          coverArt: ALBUM_ID,
          albumCount: 1,
        }],
      }],
    },
  }));
});

router.get('/getArtist.view', (req, res) => {
  refreshCache();
  if (req.query.id !== ARTIST_ID) return sendError(res, 70, 'Artist not found');
  res.json(envelope({
    artist: {
      id: ARTIST_ID,
      name: ARTIST_NAME,
      coverArt: ALBUM_ID,
      albumCount: 1,
      album: [albumSummary()],
    },
  }));
});

router.get('/getAlbumList.view', (req, res) => {
  refreshCache();
  const offset = parseInt(req.query.offset || '0', 10);
  const size = parseInt(req.query.size || '10', 10);
  const albums = (offset === 0 && size > 0 && cache.songs.length > 0) ? [albumSummary()] : [];
  res.json(envelope({ albumList: { album: albums } }));
});

router.get('/getAlbumList2.view', (req, res) => {
  refreshCache();
  const offset = parseInt(req.query.offset || '0', 10);
  const size = parseInt(req.query.size || '10', 10);
  const albums = (offset === 0 && size > 0 && cache.songs.length > 0) ? [albumSummary()] : [];
  res.json(envelope({ albumList2: { album: albums } }));
});

router.get('/getAlbum.view', (req, res) => {
  refreshCache();
  if (req.query.id !== ALBUM_ID) return sendError(res, 70, 'Album not found');
  res.json(envelope({
    album: { ...albumSummary(), song: cache.songs },
  }));
});

router.get('/getMusicDirectory.view', (req, res) => {
  refreshCache();
  const id = req.query.id;
  if (id === ARTIST_ID) {
    return res.json(envelope({
      directory: {
        id: ARTIST_ID,
        name: ARTIST_NAME,
        child: [albumSummary()],
      },
    }));
  }
  if (id === ALBUM_ID) {
    return res.json(envelope({
      directory: {
        id: ALBUM_ID,
        parent: ARTIST_ID,
        name: ALBUM_NAME,
        child: cache.songs,
      },
    }));
  }
  return sendError(res, 70, 'Directory not found');
});

router.get('/getSong.view', (req, res) => {
  refreshCache();
  const song = cache.songs.find((s) => s.id === req.query.id);
  if (!song) return sendError(res, 70, 'Song not found');
  res.json(envelope({ song }));
});

router.get('/search3.view', (req, res) => {
  refreshCache();
  const q = String(req.query.query || '').toLowerCase().trim();
  const songCount = parseInt(req.query.songCount || '20', 10);
  const albumCount = parseInt(req.query.albumCount || '20', 10);
  const artistCount = parseInt(req.query.artistCount || '20', 10);

  let songs = [];
  let albums = [];
  let artists = [];

  if (q && q !== '""') {
    songs = cache.songs.filter((s) => s.title.toLowerCase().includes(q)).slice(0, songCount);
    if (ALBUM_NAME.toLowerCase().includes(q)) albums = [albumSummary()].slice(0, albumCount);
    if (ARTIST_NAME.toLowerCase().includes(q)) {
      artists = [{ id: ARTIST_ID, name: ARTIST_NAME, albumCount: 1 }].slice(0, artistCount);
    }
  }

  res.json(envelope({
    searchResult3: { song: songs, album: albums, artist: artists },
  }));
});

router.get('/search2.view', (req, res) => {
  refreshCache();
  const q = String(req.query.query || '').toLowerCase().trim();
  const songCount = parseInt(req.query.songCount || '20', 10);
  const albumCount = parseInt(req.query.albumCount || '20', 10);

  const songs = q ? cache.songs.filter((s) => s.title.toLowerCase().includes(q)).slice(0, songCount) : [];
  const albums = (q && ALBUM_NAME.toLowerCase().includes(q)) ? [albumSummary()].slice(0, albumCount) : [];

  res.json(envelope({
    searchResult2: { song: songs, album: albums, artist: [] },
  }));
});

function streamRedirect(req, res) {
  refreshCache();
  const id = req.query.id;
  const url = cache.urlMap.get(id);
  if (!url) return sendError(res, 70, 'Song not found');
  res.redirect(302, url);
}

router.get('/stream.view', streamRedirect);
router.get('/download.view', streamRedirect);

router.get('/getCoverArt.view', (req, res) => {
  // Local file override wins — drop a custom album-cover.jpg next to this module to use it.
  if (fs.existsSync(COVER_FILE)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(COVER_FILE);
  }
  // 302 → JW's CDN. Size hint from the client picks the smallest variant that fits.
  const size = parseInt(req.query.size || '0', 10);
  const url = size > 0 && size <= 200 ? COVER_URL_XS
            : size > 0 && size <= 500 ? COVER_URL_MD
            : COVER_URL_LG;
  res.redirect(302, url);
});

router.get('/getGenres.view', (req, res) => {
  refreshCache();
  res.json(envelope({
    genres: {
      genre: [{ value: ALBUM_GENRE, songCount: cache.songs.length, albumCount: 1 }],
    },
  }));
});

router.get('/getRandomSongs.view', (req, res) => {
  refreshCache();
  const size = Math.min(parseInt(req.query.size || '10', 10), cache.songs.length);
  const shuffled = [...cache.songs].sort(() => Math.random() - 0.5).slice(0, size);
  res.json(envelope({ randomSongs: { song: shuffled } }));
});

router.use((req, res) => sendError(res, 70, `Endpoint not implemented: ${req.path}`));

export default router;
