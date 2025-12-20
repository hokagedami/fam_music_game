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

      if (!data.gameId || !data.playerName) {
        socket.emit('rejoinFailed', { message: 'Game ID and player name are required' });
        return;
      }

      const gameId = data.gameId.toUpperCase().trim();
      const game = gameStore.get(gameId);

      if (!game) {
        socket.emit('rejoinFailed', { message: 'Game not found. It may have ended.' });
        return;
      }

      // Check if this is the host rejoining
      if (data.previousPlayerId === game.hostId) {
        // Update host's socket ID
        game.hostId = socket.id;
        socket.join(gameId);

        socket.emit('rejoinSuccess', {
          gameId: gameId,
          gameSession: sanitizeGameSession(game),
          isHost: true,
        });

        console.log(`Host ${data.playerName} rejoined game ${gameId}`);
        return;
      }

      // Check if player was in the game (by name, since ID changed)
      const existingPlayerIndex = game.players.findIndex(
        (p) => p.name.toLowerCase() === data.playerName.toLowerCase()
      );

      if (existingPlayerIndex !== -1) {
        // Update existing player's socket ID
        const player = game.players[existingPlayerIndex];
        player.id = socket.id;
        socket.join(gameId);

        socket.emit('rejoinSuccess', {
          gameId: gameId,
          gameSession: sanitizeGameSession(game),
          player: player,
          isHost: false,
        });

        // Notify other players
        io.to(gameId).emit('playerRejoined', {
          gameSession: sanitizeGameSession(game),
          playerName: player.name,
        });

        console.log(`${player.name} rejoined game ${gameId}`);
        return;
      }

      // Player wasn't in the game - try to join if in lobby
      if (game.state === 'lobby') {
        // Add as new player
        if (game.players.length >= game.settings.maxPlayers) {
          socket.emit('rejoinFailed', { message: 'Game is full' });
          return;
        }

        const newPlayer = {
          id: socket.id,
          name: data.playerName,
          isHost: false,
          isReady: false,
          score: 0,
          answers: [],
        };

        game.players.push(newPlayer);
        socket.join(gameId);

        socket.emit('rejoinSuccess', {
          gameId: gameId,
          gameSession: sanitizeGameSession(game),
          player: newPlayer,
          isHost: false,
        });

        io.to(gameId).emit('playerJoined', {
          gameSession: sanitizeGameSession(game),
          playerName: data.playerName,
        });

        console.log(`${data.playerName} joined game ${gameId} via rejoin`);
        return;
      }

      // Game in progress and player wasn't in it
      socket.emit('rejoinFailed', {
        message: 'Game is in progress and you were not a participant',
      });
    } catch (error) {
      console.error('Error rejoining game:', error);
      socket.emit('rejoinFailed', { message: 'Failed to rejoin game' });
    }
  });
}
