import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine the project root
const projectRoot = path.join(__dirname, '../../');

// When running inside Electron's ASAR archive, writable paths must be outside the archive.
// ELECTRON_USER_DATA is set by the embedded server before importing this module.
const writableRoot = process.env.ELECTRON_USER_DATA || projectRoot;

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Game defaults
  maxPlayersDefault: parseInt(process.env.MAX_PLAYERS_DEFAULT || '6', 10),
  songsCountDefault: parseInt(process.env.SONGS_COUNT_DEFAULT || '10', 10),
  clipDurationDefault: parseInt(process.env.CLIP_DURATION_DEFAULT || '20', 10),
  answerTimeDefault: parseInt(process.env.ANSWER_TIME_DEFAULT || '15', 10),

  // Session settings
  gameTimeoutHours: parseInt(process.env.GAME_TIMEOUT_HOURS || '4', 10),
  reconnectTimeoutMinutes: parseInt(process.env.RECONNECT_TIMEOUT_MINUTES || '30', 10),

  // Upload settings
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',

  // Paths - static/read-only files from project root, writable files from writableRoot
  publicDir: projectRoot,
  distClientDir: path.join(projectRoot, 'dist/client'),
  uploadsDir: path.join(writableRoot, process.env.UPLOAD_DIR || 'uploads'),
};

export const isDev = config.nodeEnv === 'development';
export const isProd = config.nodeEnv === 'production';
