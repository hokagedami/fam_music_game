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

// CORS configuration - allow localhost and local network in development
const allowedOrigins = isDev
  ? ['http://localhost:3000', 'http://127.0.0.1:3000']
  : (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

// For local network access in development, allow any origin from same network
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // In development, allow localhost and local network IPs
    if (isDev) {
      if (origin.includes('localhost') ||
          origin.includes('127.0.0.1') ||
          origin.match(/^http:\/\/192\.168\.\d+\.\d+/) ||
          origin.match(/^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/)) {
        return callback(null, true);
      }
    }

    // Check against allowed origins
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
  max: 20, // 20 requests per second
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60000, // 1 minute window
  max: 10, // 10 uploads per minute
  message: { error: 'Too many uploads, please wait a moment' },
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
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|m4a)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// REST API Routes - apply rate limiting

// Upload music files
app.post('/api/upload', uploadLimiter, upload.array('music', 100), (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = files.map((file) => ({
      originalName: file.originalname,
      filename: file.filename,
      path: `/uploads/${file.filename}`,
      size: file.size,
    }));

    console.log(`Uploaded ${files.length} files`);
    res.json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
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
if (!process.env.ELECTRON_APP) {
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    gameStore.stopCleanup();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    gameStore.stopCleanup();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
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
