import { registerGameHandlers } from './gameHandlers.js';
import { registerGameplayHandlers } from './gameplayHandlers.js';
import { registerRejoinHandlers } from './rejoinHandlers.js';

/**
 * Register all socket handlers for a connected client
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerAllHandlers(io, socket) {
  console.log(`New connection: ${socket.id}`);

  // Register all handler modules
  registerGameHandlers(io, socket);
  registerGameplayHandlers(io, socket);
  registerRejoinHandlers(io, socket);
}

export { registerGameHandlers } from './gameHandlers.js';
export { registerGameplayHandlers } from './gameplayHandlers.js';
export { registerRejoinHandlers } from './rejoinHandlers.js';
