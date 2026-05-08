import { registerGameHandlers } from './gameHandlers.js';
import { registerGameplayHandlers } from './gameplayHandlers.js';
import { registerRejoinHandlers } from './rejoinHandlers.js';
import { log } from '../logger.js';

// Per-socket sliding-window rate limit. Caps a misbehaving client without
// touching well-behaved gameplay traffic. Counters are auto-cleaned on disconnect.
const SOCKET_RATE_WINDOW_MS = 1000;
const SOCKET_RATE_MAX = 30; // events per second per socket

function installSocketRateLimit(socket) {
  const buckets = new Map(); // event -> [timestamps]
  // Limited subset — gameplay/lobby events. Heartbeats and reserved events pass through.
  const limitedEvents = new Set([
    'createGame',
    'joinGame',
    'startGame',
    'submitAnswer',
    'showKahootOptions',
    'songPlaying',
    'revealAnswers',
    'nextSong',
    'endGame',
    'leaveGame',
    'kickPlayer',
    'rejoinGame',
    'restartGame',
  ]);

  socket.use(([event, ..._args], next) => {
    if (!limitedEvents.has(event)) return next();
    const now = Date.now();
    const bucket = buckets.get(event) || [];
    const fresh = bucket.filter((t) => now - t < SOCKET_RATE_WINDOW_MS);
    if (fresh.length >= SOCKET_RATE_MAX) {
      return next(new Error('Rate limit exceeded'));
    }
    fresh.push(now);
    buckets.set(event, fresh);
    next();
  });

  socket.on('disconnect', () => buckets.clear());
}

/**
 * Register all socket handlers for a connected client
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerAllHandlers(io, socket) {
  log(`New connection: ${socket.id}`);

  installSocketRateLimit(socket);

  // Register all handler modules
  registerGameHandlers(io, socket);
  registerGameplayHandlers(io, socket);
  registerRejoinHandlers(io, socket);
}

export { registerGameHandlers } from './gameHandlers.js';
export { registerGameplayHandlers } from './gameplayHandlers.js';
export { registerRejoinHandlers } from './rejoinHandlers.js';
