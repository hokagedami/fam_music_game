import { gameStore } from '../gameStore.js';
import { sanitizeGameSession } from '../utils/index.js';

/**
 * Register reconnection/rejoin socket handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerRejoinHandlers(io, socket) {
  // Rejoin a game after disconnection
  socket.on('rejoinGame', (data) => {
    try {
      console.log(`Rejoin attempt from ${socket.id}:`, data);

      // Token-based rejoin (preferred) or fallback to name-based
      let gameId = data.gameId?.toUpperCase().trim();
      let playerName = data.playerName;
      let isHost = false;

      // If a reconnect token is provided, use it to identify the player
      if (data.reconnectToken) {
        const tokenData = gameStore.getReconnectToken(data.reconnectToken);
        if (tokenData) {
          gameId = tokenData.gameId;
          playerName = tokenData.playerName;
          isHost = tokenData.isHost;
          console.log(`Token resolved: game=${gameId}, player=${playerName}, isHost=${isHost}`);
        } else {
          console.log(`Invalid or expired reconnect token`);
          // Fall through to name-based rejoin if gameId and playerName provided
          if (!gameId || !playerName) {
            socket.emit('rejoinFailed', { message: 'Invalid reconnect token' });
            return;
          }
        }
      }

      if (!gameId || !playerName) {
        socket.emit('rejoinFailed', { message: 'Game ID and player name are required' });
        return;
      }

      const game = gameStore.get(gameId);

      if (!game) {
        socket.emit('rejoinFailed', { message: 'Game not found. It may have ended.' });
        return;
      }

      // Cancel any pending disconnect cleanup for this game
      if (game.hostDisconnectTimer) {
        clearTimeout(game.hostDisconnectTimer);
        game.hostDisconnectTimer = null;
        console.log(`Cancelled host disconnect timer for game ${gameId}`);
      }

      // Check if this is the host rejoining
      const isHostByName = game.host.toLowerCase() === playerName.toLowerCase();
      const isHostById = data.playerId === game.hostId;
      if (isHost || isHostByName || isHostById) {
        // Update host's socket ID
        const oldHostId = game.hostId;
        game.hostId = socket.id;
        if (oldHostId) gameStore.unregisterSocket(oldHostId);
        gameStore.registerSocket(socket.id, gameId);
        socket.join(gameId);

        // Issue a fresh reconnect token
        const newToken = gameStore.createReconnectToken(gameId, game.host, true);

        // Create a host player object for the client
        const hostPlayer = {
          id: socket.id,
          name: game.host,
          isHost: true,
          score: 0,
          isReady: true,
        };

        socket.emit('rejoinSuccess', {
          gameId: gameId,
          gameSession: sanitizeGameSession(game),
          player: hostPlayer,
          isHost: true,
          reconnectToken: newToken,
        });

        // Notify other players
        io.to(gameId).emit('playerRejoined', {
          gameSession: sanitizeGameSession(game),
          playerName: game.host,
        });

        gameStore.persist(gameId);
        console.log(`Host ${playerName} rejoined game ${gameId}`);
        return;
      }

      // Check if player was in the game (by name, since socket ID changed on reconnect)
      const existingPlayerIndex = game.players.findIndex(
        (p) => p.name.toLowerCase() === playerName.toLowerCase()
      );

      if (existingPlayerIndex !== -1) {
        // Update existing player's socket ID
        const player = game.players[existingPlayerIndex];
        const oldPlayerId = player.id;
        player.id = socket.id;

        // Cancel any pending player disconnect timer
        if (player.disconnectTimer) {
          clearTimeout(player.disconnectTimer);
          player.disconnectTimer = null;
        }

        if (oldPlayerId) gameStore.unregisterSocket(oldPlayerId);
        gameStore.registerSocket(socket.id, gameId);
        socket.join(gameId);

        // Issue a fresh reconnect token
        const newToken = gameStore.createReconnectToken(gameId, player.name, false);

        socket.emit('rejoinSuccess', {
          gameId: gameId,
          gameSession: sanitizeGameSession(game),
          player: player,
          isHost: false,
          reconnectToken: newToken,
        });

        // Notify other players
        io.to(gameId).emit('playerRejoined', {
          gameSession: sanitizeGameSession(game),
          playerName: player.name,
        });

        gameStore.persist(gameId);
        console.log(`${player.name} rejoined game ${gameId}`);
        return;
      }

      // Player wasn't in the game (or was removed after disconnect grace period)
      // If they have a valid reconnect token, re-add them regardless of game state
      const hasValidToken = data.reconnectToken && gameStore.getReconnectToken(data.reconnectToken);

      if (game.state === 'lobby' || hasValidToken) {
        if (game.players.length >= game.settings.maxPlayers && !hasValidToken) {
          socket.emit('rejoinFailed', { message: 'Game is full' });
          return;
        }

        const newPlayer = {
          id: socket.id,
          name: playerName,
          isHost: false,
          isReady: false,
          score: 0,
          answers: [],
        };

        game.players.push(newPlayer);
        gameStore.registerSocket(socket.id, gameId);
        socket.join(gameId);

        // Issue a fresh reconnect token
        const newToken = gameStore.createReconnectToken(gameId, playerName, false);

        socket.emit('rejoinSuccess', {
          gameId: gameId,
          gameSession: sanitizeGameSession(game),
          player: newPlayer,
          isHost: false,
          reconnectToken: newToken,
        });

        io.to(gameId).emit('playerRejoined', {
          gameSession: sanitizeGameSession(game),
          playerName: playerName,
        });

        gameStore.persist(gameId);
        console.log(`${playerName} rejoined game ${gameId} (re-added after removal)`);
        return;
      }

      // Game in progress and player has no valid token
      socket.emit('rejoinFailed', {
        message: 'Game is in progress and you were not a participant',
      });
    } catch (error) {
      console.error('Error rejoining game:', error);
      socket.emit('rejoinFailed', { message: 'Failed to rejoin game' });
    }
  });
}
