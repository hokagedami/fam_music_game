import { gameStore } from '../gameStore.js';
import { generateGameId, sanitizeGameSession } from '../utils/index.js';
import { config } from '../config.js';
import {
  validatePlayerName,
  validateGameSettings,
  validateGameId,
  validateSongsMetadata,
  validateKahootOptions,
} from '../validation.js';

/**
 * Register game-related socket handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerGameHandlers(io, socket) {
  // Create a new game
  socket.on('createGame', (data) => {
    try {
      // Validate host name
      const hostName = validatePlayerName(data.hostName);
      if (!hostName) {
        socket.emit('error', { message: 'Invalid host name. Use 1-20 alphanumeric characters.' });
        return;
      }

      // Validate settings
      const settings = validateGameSettings(data.settings);

      // Validate songs metadata if provided
      const songsMetadata = validateSongsMetadata(data.songsMetadata);

      // Validate kahoot options if provided
      const kahootOptions = validateKahootOptions(data.kahootOptions);

      // Generate unique game ID
      let gameId;
      do {
        gameId = generateGameId();
      } while (gameStore.has(gameId));

      const gameSession = {
        id: gameId,
        host: hostName,
        hostId: socket.id,
        settings: {
          songsCount: settings.songsCount,
          clipDuration: settings.clipDuration,
          answerTime: settings.answerTime,
          maxPlayers: settings.maxPlayers,
          autoplayEnabled: Boolean(data.settings?.autoplayEnabled),
        },
        players: [],
        state: 'lobby',
        currentSong: 0,
        songs: songsMetadata,
        audioUrls: songsMetadata.map((song) => song.audioUrl || song.localUrl || song.url),
        kahootOptions: kahootOptions,
        createdAt: Date.now(),
      };

      gameStore.set(gameId, gameSession);
      socket.join(gameId);

      socket.emit('gameCreated', {
        gameId: gameId,
        gameSession: sanitizeGameSession(gameSession),
      });

      console.log(
        `Game created: ${gameId} by ${data.hostName} (${gameSession.settings.songsCount} songs)`
      );
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', { message: 'Failed to create game: ' + error.message });
    }
  });

  // Join an existing game
  socket.on('joinGame', (data) => {
    try {
      // Validate game ID
      const gameId = validateGameId(data.gameId);
      if (!gameId) {
        socket.emit('error', { message: 'Invalid Game ID format. Must be 6 characters.' });
        return;
      }

      // Validate player name
      const playerName = validatePlayerName(data.playerName);
      if (!playerName) {
        socket.emit('error', { message: 'Invalid player name. Use 1-20 letters, numbers, spaces, or underscores.' });
        return;
      }

      const game = gameStore.get(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found. Please check the Game ID.' });
        return;
      }

      if (game.state !== 'lobby') {
        socket.emit('error', { message: 'Game has already started' });
        return;
      }

      if (game.players.length >= game.settings.maxPlayers) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }

      // Check for duplicate names
      if (
        game.players.some((p) => p.name.toLowerCase() === playerName.toLowerCase()) ||
        game.host.toLowerCase() === playerName.toLowerCase()
      ) {
        socket.emit('error', { message: 'Name already taken in this game' });
        return;
      }

      const player = {
        id: socket.id,
        name: playerName,
        isHost: false,
        isReady: false,
        score: 0,
        answers: [],
      };

      game.players.push(player);
      socket.join(gameId);

      // Notify the joining player (only them, not the host)
      socket.emit('gameJoined', {
        gameId: gameId,
        gameSession: sanitizeGameSession(game),
        player: player,
      });

      // Notify all players (including host) that someone joined
      io.to(gameId).emit('playerJoined', {
        gameSession: sanitizeGameSession(game),
        player: player,
      });

      console.log(
        `${playerName} joined game ${gameId} (${game.players.length}/${game.settings.maxPlayers} players)`
      );
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game: ' + error.message });
    }
  });

  // Kick a player from the lobby
  socket.on('kickPlayer', (data) => {
    try {
      if (!data.gameId || !data.playerId) {
        socket.emit('error', { message: 'Game ID and player ID are required' });
        return;
      }

      const game = gameStore.get(data.gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (game.hostId !== socket.id) {
        socket.emit('error', { message: 'Only the host can kick players' });
        return;
      }

      if (game.state !== 'lobby') {
        socket.emit('error', { message: 'Can only kick players in the lobby' });
        return;
      }

      const playerIndex = game.players.findIndex((p) => p.id === data.playerId);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const kickedPlayer = game.players[playerIndex];
      game.players.splice(playerIndex, 1);

      // Notify the kicked player
      io.to(data.playerId).emit('playerKicked', {
        message: 'You have been kicked from the game by the host',
      });

      // Make the kicked player leave the room
      const kickedSocket = io.sockets.sockets.get(data.playerId);
      if (kickedSocket) {
        kickedSocket.leave(data.gameId);
      }

      // Notify remaining players
      io.to(data.gameId).emit('playerLeft', {
        gameSession: sanitizeGameSession(game),
        playerName: kickedPlayer.name + ' (kicked)',
      });

      console.log(`${kickedPlayer.name} was kicked from game ${data.gameId} by host`);
    } catch (error) {
      console.error('Error kicking player:', error);
      socket.emit('error', { message: 'Failed to kick player: ' + error.message });
    }
  });

  // Start the game
  socket.on('startGame', (data) => {
    try {
      if (!data.gameId) {
        socket.emit('error', { message: 'Game ID is required' });
        return;
      }

      const game = gameStore.get(data.gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (game.hostId !== socket.id) {
        socket.emit('error', { message: 'Not authorized to start game' });
        return;
      }

      if (game.players.length < 1) {
        socket.emit('error', { message: 'Need at least 1 player to start' });
        return;
      }

      if (game.state !== 'lobby') {
        socket.emit('error', { message: 'Game is not in lobby state' });
        return;
      }

      // Update game with song data from host
      game.state = 'playing';
      game.currentSong = 0;
      game.settings.songsCount = data.songsCount || game.settings.songsCount;
      game.settings.clipDuration = data.clipDuration || game.settings.clipDuration;
      game.settings.autoplayEnabled = data.autoplayEnabled ?? game.settings.autoplayEnabled;

      if (data.songs && data.songs.length > 0) {
        game.songs = data.songs;
        game.audioUrls = data.songs.map((s) => s.audioUrl);
      }

      io.to(data.gameId).emit('gameStarted', {
        gameSession: sanitizeGameSession(game),
      });

      console.log(
        `Game ${data.gameId} started with ${game.players.length} players and ${game.songs.length} songs`
      );
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game: ' + error.message });
    }
  });

  // Reset game for play again
  socket.on('resetGame', (data) => {
    try {
      console.log(`resetGame received from ${socket.id}:`, data);

      if (!data.gameId) {
        console.log('resetGame failed: Game ID is required');
        socket.emit('error', { message: 'Game ID is required' });
        return;
      }

      const game = gameStore.get(data.gameId);
      if (!game) {
        console.log(`resetGame failed: Game ${data.gameId} not found`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (game.hostId !== socket.id) {
        console.log(
          `resetGame failed: Not authorized (hostId=${game.hostId}, requester=${socket.id})`
        );
        socket.emit('error', { message: 'Not authorized to reset game' });
        return;
      }

      // Reset game state
      game.state = 'lobby';
      game.currentSong = 0;
      game.songs = [];

      // Reset all player scores and answers
      game.players.forEach((player) => {
        player.score = 0;
        player.answers = [];
      });

      // Notify all players that game is reset
      io.to(data.gameId).emit('gameReset', {
        gameId: data.gameId,
        message: 'Host is preparing a new game...',
        songsCount: data.songsCount || 0,
      });

      console.log(`Game ${data.gameId} reset by host for new round`);
    } catch (error) {
      console.error('Error resetting game:', error);
      socket.emit('error', { message: 'Failed to reset game: ' + error.message });
    }
  });

  // Leave game
  socket.on('leaveGame', (data) => {
    try {
      if (!data.gameId) return;

      const game = gameStore.get(data.gameId);
      if (!game) return;

      // If host is leaving, delete the game
      if (game.hostId === socket.id) {
        gameStore.delete(data.gameId);
        io.to(data.gameId).emit('gameDeleted', {
          message: 'Host has left the game',
        });
        console.log(`Game ${data.gameId} deleted (host left)`);
        return;
      }

      // Remove player from game
      const playerIndex = game.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        game.players.splice(playerIndex, 1);
        socket.leave(data.gameId);

        io.to(data.gameId).emit('playerLeft', {
          gameSession: sanitizeGameSession(game),
          playerName: player.name,
        });

        console.log(
          `${player.name} left game ${data.gameId} (${game.players.length} remaining)`
        );
      }
    } catch (error) {
      console.error('Error leaving game:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    // Check if disconnecting socket is a host or player
    for (const [gameId, game] of gameStore.entries()) {
      // Check if host disconnected
      if (game.hostId === socket.id) {
        gameStore.delete(gameId);
        io.to(gameId).emit('gameDeleted', {
          message: 'Host has disconnected',
        });
        console.log(`Game ${gameId} deleted (host disconnected)`);
        break;
      }

      // Check if a player disconnected
      const playerIndex = game.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        game.players.splice(playerIndex, 1);

        io.to(gameId).emit('playerLeft', {
          gameSession: sanitizeGameSession(game),
          playerName: player.name + ' (disconnected)',
        });
        console.log(
          `${player.name} disconnected from game ${gameId} (${game.players.length} remaining)`
        );
        break;
      }
    }
  });
}
