import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import multer from 'multer';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

import { config, isDev } from './config.js';
import { gameStore } from './gameStore.js';
import { registerAllHandlers } from './handlers/index.js';
import { validatePlayerName, validateGameSettings, validateGameId } from './validation.js';
import { log } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get local network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  // Skip VPN and virtual interfaces
  const skipPatterns = ['nordlynx', 'openvpn', 'vmware', 'vethernet', 'wsl', 'docker', 'virtualbox'];

  for (const name of Object.keys(interfaces)) {
    const nameLower = name.toLowerCase();
    // Skip virtual/VPN interfaces
    if (skipPatterns.some(pattern => nameLower.includes(pattern))) {
      continue;
    }

    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        // Skip link-local addresses (169.254.x.x) and VPN ranges (10.x.x.x)
        if (!iface.address.startsWith('169.254.') && !iface.address.startsWith('10.')) {
          candidates.push({ name, address: iface.address });
        }
      }
    }
  }

  // Prefer Wi-Fi or Ethernet
  const preferred = candidates.find(c =>
    c.name.toLowerCase().includes('wi-fi') ||
    c.name.toLowerCase().includes('wifi') ||
    c.name.toLowerCase().includes('ethernet')
  );

  if (preferred) return preferred.address;
  if (candidates.length > 0) return candidates[0].address;

  return 'localhost';
}

// Create Express app
const app = express();
const server = createServer(app);

// CORS configuration
// In development: allow localhost + private LAN ranges so other devices can join.
// In production: require an explicit allow-list via ALLOWED_ORIGINS — no permissive fallback.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!isDev && allowedOrigins.length === 0) {
  console.warn(
    '[security] No ALLOWED_ORIGINS configured for production. All cross-origin requests will be rejected.'
  );
}

const LAN_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?$/;

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, curl, native app)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (isDev && LAN_ORIGIN_RE.test(origin)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  credentials: true,
};

// Configure Socket.IO with secure CORS
const io = new Server(server, {
  cors: corsOptions,
});

// Rate limiting - prevent abuse
const apiLimiter = rateLimit({
  windowMs: 1000, // 1 second window
  max: 20, // 20 requests per second per IP — abuse-tier ceiling, not a normal-use cap
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60000, // 1 minute window
  max: 10, // 10 upload requests per minute per IP
  message: { error: 'Too many uploads, please wait a moment' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors(corsOptions));

// Compression - reduce response sizes
app.use(compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress if client doesn't accept it
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

app.use(express.json({ limit: '1mb' })); // Limit JSON body size

// Static files with caching headers
app.use(express.static(config.publicDir, {
  maxAge: isDev ? 0 : '1d',
  etag: true,
}));

// Dist files with aggressive caching (hashed filenames)
app.use('/dist/client', express.static(config.distClientDir, {
  maxAge: isDev ? 0 : '1y',
  immutable: !isDev,
}));

// Ensure uploads directory exists
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const ALLOWED_AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadsDir);
  },
  filename: (req, file, cb) => {
    // Never trust originalname for the on-disk path: take only the extension and
    // generate the rest. path.basename strips any path components a client tried to inject.
    const safeOriginal = path.basename(file.originalname || '');
    const ext = path.extname(safeOriginal).toLowerCase();
    if (!ALLOWED_AUDIO_EXTS.has(ext)) {
      return cb(new Error('Unsupported file extension'));
    }
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
    files: 100,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_AUDIO_MIMES.has(mime) || ALLOWED_AUDIO_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// REST API Routes - apply rate limiting

// Upload music files
app.post('/api/upload', uploadLimiter, (req, res) => {
  upload.array('music', 100)(req, res, (err) => {
    if (err) {
      const status = err instanceof multer.MulterError ? 400 : 400;
      return res.status(status).json({ error: err.message || 'Upload failed' });
    }

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = files.map((file) => ({
      // Strip any path components from originalname before echoing back
      originalName: path.basename(file.originalname || '').slice(0, 255),
      filename: file.filename,
      path: `/uploads/${file.filename}`,
      size: file.size,
    }));

    log(`Uploaded ${files.length} files`);
    res.json({ success: true, files: uploadedFiles });
  });
});

// Get game stats
app.get('/api/stats', apiLimiter, (req, res) => {
  const stats = gameStore.getStats();
  res.json(stats);
});

// Health check
app.get('/api/health', apiLimiter, (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    games: gameStore.size,
  });
});

// Server status
app.get('/api/status', apiLimiter, (req, res) => {
  res.json({
    status: 'OK',
    version: '3.2.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// List active games
app.get('/api/games', apiLimiter, (req, res) => {
  const games = gameStore.getAllGames().map(game => ({
    id: game.id,
    host: game.host,
    playerCount: game.players.length,
    state: game.state,
    createdAt: game.createdAt,
  }));
  res.json({ games });
});

// Serve uploaded files
app.use('/uploads', express.static(config.uploadsDir));

// Socket.IO connection handling
io.on('connection', (socket) => {
  registerAllHandlers(io, socket);
});

// Graceful shutdown (only register when not in Electron, to avoid duplicate handlers)
function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  gameStore.stopCleanup();
  server.close(() => {
    try {
      gameStore.close();
    } catch (err) {
      console.error('Error closing game store:', err.message);
    }
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit if shutdown hangs (e.g. lingering sockets)
  setTimeout(() => {
    console.error('Forced exit after shutdown timeout');
    process.exit(1);
  }, 10000).unref();
}

if (!process.env.ELECTRON_APP) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Determine if this script is being run directly (not imported by Electron)
const isDirectRun = !process.env.ELECTRON_APP && (
  process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('server') ||
  process.argv[1]?.includes('src/server')
);

// Only auto-start when run directly (not when imported by Electron)
if (isDirectRun) {
  const HOST = '0.0.0.0';
  server.listen(config.port, HOST, () => {
    const localIP = getLocalIP();
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                   FAM MUSIC QUIZ                           ║
╠════════════════════════════════════════════════════════════╣
║  Local:    http://localhost:${config.port.toString().padEnd(28)}║
║  Network:  http://${localIP}:${config.port.toString().padEnd(28 - localIP.length)}║
╠════════════════════════════════════════════════════════════╣
║  Environment: ${config.nodeEnv.padEnd(41)}║
║  Max file size: ${config.maxFileSizeMb}MB                                    ║
║                                                            ║
║  Share the Network URL with other devices on your network! ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

export { app, server, io, config };
