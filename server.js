const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Enable CORS for all routes
app.use(cors({
  origin: "*", // Allow all origins during development
  methods: ["GET", "POST"],
  credentials: false
}));

// Check if an audio directory exists, create it if not
const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
  console.log('📂 Created audio directory:', audioDir);
}

// serve audio files from the 'audio' directory
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// configure multer to write uploads into ./audio
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(__dirname, 'audio')),
  filename: (_, file, cb) => {
    const unique = Date.now() + '-' + file.originalname;
    cb(null, unique);
  }
});
const upload = multer({ storage });

// Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins during development
    methods: ["GET", "POST"],
    credentials: false
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Game storage
const games = new Map();

// Helper functions
function generateGameId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function cleanupInactiveGames() {
  const now = Date.now();
  for (const [gameId, game] of games.entries()) {
    // Remove games older than 4 hours or with no active players
    if (now - game.createdAt > 4 * 60 * 60 * 1000 || game.players.length === 0) {
      games.delete(gameId);
      console.log(`🗑️ Cleaned up inactive game: ${gameId}`);
    }
  }
}

// Clean up inactive games every hour
setInterval(cleanupInactiveGames, 60 * 60 * 1000);

io.on('connection', (socket) => {
  console.log(`🎮 Player connected: ${socket.id}`);

  // Create a new game
  socket.on('createGame', (data) => {
    try {
      let gameId;
      // Ensure unique game ID
      do {
        gameId = generateGameId();
      } while (games.has(gameId));

      const gameSession = {
        id: gameId,
        host: data.hostName,
        hostId: socket.id,
        settings: data.settings,
        players: [{
          id: socket.id,
          name: data.hostName,
          isHost: true,
          isReady: true,
          score: 0,
          answers: []
        }],
        state: 'lobby',
        currentSong: 0,
        songs: data.songsMetadata || [],
        createdAt: Date.now()
      };

      games.set(gameId, gameSession);
      socket.join(gameId);

      socket.emit('gameCreated', {
        gameId: gameId,
        gameSession: gameSession
      });

      console.log(`🎮 Game created: ${gameId} by ${data.hostName}`);
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', { message: 'Failed to create game' });
    }
  });

  // Join an existing game
  socket.on('joinGame', (data) => {
    try {
      const gameId = data.gameId.toUpperCase();
      const game = games.get(gameId);

      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (game.state !== 'lobby') {
        socket.emit('error', { message: 'Game already in progress' });
        return;
      }

      if (game.players.length >= game.settings.maxPlayers) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }

      // Check if player name already exists
      const nameExists = game.players.some(p => p.name.toLowerCase() === data.playerName.toLowerCase());
      if (nameExists) {
        socket.emit('error', { message: 'Player name already taken' });
        return;
      }

      const player = {
        id: socket.id,
        name: data.playerName,
        isHost: false,
        isReady: true,
        score: 0,
        answers: []
      };

      game.players.push(player);
      socket.join(gameId);

      // Notify all players in the game
      io.to(gameId).emit('gameJoined', {
        gameId: gameId,
        gameSession: game
      });

      io.to(gameId).emit('playerJoined', {
        gameSession: game,
        playerName: data.playerName
      });

      console.log(`👤 ${data.playerName} joined game ${gameId}`);
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Start the game
  socket.on('startGame', (data) => {
    try {
      const game = games.get(data.gameId);
      if (!game || game.hostId !== socket.id) {
        socket.emit('error', { message: 'Not authorized to start game' });
        return;
      }

      if (game.players.length < 2) {
        socket.emit('error', { message: 'Need at least 2 players to start' });
        return;
      }

      game.state = 'playing';
      game.currentSong = 0;
      game.songs = data.songs;

      // Reset all player scores and answers
      game.players.forEach(player => {
        player.score = 0;
        player.answers = [];
      });

      io.to(data.gameId).emit('gameStarted', {
        gameSession: game
      });

      console.log(`🚀 Game ${data.gameId} started with ${game.players.length} players`);
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // Submit a guess
  socket.on('submitGuess', (data) => {
    try {
      const game = games.get(data.gameId);
      if (!game || game.state !== 'playing') {
        return;
      }

      const playerIndex = game.players.findIndex(p => p.id === data.playerId);
      if (playerIndex === -1) {
        return;
      }

      // Remove any existing answer for this song
      game.players[playerIndex].answers = game.players[playerIndex].answers.filter(
        a => a.songIndex !== data.songIndex
      );

      // Add new answer
      const answerData = {
        songIndex: data.songIndex,
        guess: data.guess,
        points: data.points,
        accuracy: data.accuracy,
        timestamp: data.timestamp
      };

      game.players[playerIndex].answers.push(answerData);
      game.players[playerIndex].score += data.points;

      // Notify all players
      io.to(data.gameId).emit('playerGuessed', {
        playerId: data.playerId,
        playerName: data.playerName,
        player: game.players[playerIndex],
        points: data.points,
        guess: data.guess
      });

      io.to(data.gameId).emit('gameStateUpdate', {
        gameSession: game
      });

      console.log(`💭 ${data.playerName} guessed "${data.guess}" (${data.points} pts) in game ${data.gameId}`);
    } catch (error) {
      console.error('Error submitting guess:', error);
    }
  });

  // Next song
  socket.on('nextSong', (data) => {
    try {
      const game = games.get(data.gameId);
      if (!game || game.hostId !== socket.id) {
        return;
      }

      game.currentSong = data.songIndex;

      if (data.songIndex >= game.songs.length) {
        // Game ended
        game.state = 'finished';
        io.to(data.gameId).emit('gameEnded', {
          gameSession: game
        });
        console.log(`🏁 Game ${data.gameId} ended`);
      } else {
        // Next song
        io.to(data.gameId).emit('songChanged', {
          songIndex: data.songIndex,
          gameSession: game
        });
        console.log(`🎵 Game ${data.gameId} moved to song ${data.songIndex + 1}`);
      }
    } catch (error) {
      console.error('Error advancing to next song:', error);
    }
  });

  // End game
  socket.on('endGame', (data) => {
    try {
      const game = games.get(data.gameId);
      if (!game || game.hostId !== socket.id) {
        return;
      }

      game.state = 'finished';
      io.to(data.gameId).emit('gameEnded', {
        gameSession: game
      });

      console.log(`🏁 Game ${data.gameId} ended by host`);
    } catch (error) {
      console.error('Error ending game:', error);
    }
  });

  // Reveal answers
  socket.on('revealAnswers', (data) => {
    try {
      const game = games.get(data.gameId);
      if (!game || game.hostId !== socket.id) {
        return;
      }

      io.to(data.gameId).emit('answersRevealed', {
        title: data.title,
        artist: data.artist
      });
    } catch (error) {
      console.error('Error revealing answers:', error);
    }
  });

  // Leave game
  socket.on('leaveGame', (data) => {
    try {
      const game = games.get(data.gameId);
      if (!game) {
        return;
      }

      // Remove player from game
      const playerIndex = game.players.findIndex(p => p.id === data.playerId);
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        game.players.splice(playerIndex, 1);

        socket.leave(data.gameId);

        // If host left, transfer host to another player or delete game
        if (player.isHost) {
          if (game.players.length > 0) {
            game.players[0].isHost = true;
            game.hostId = game.players[0].id;
            console.log(`👑 Host transferred to ${game.players[0].name} in game ${data.gameId}`);
          } else {
            games.delete(data.gameId);
            console.log(`🗑️ Game ${data.gameId} deleted (no players left)`);
            return;
          }
        }

        // Notify remaining players
        io.to(data.gameId).emit('playerLeft', {
          gameSession: game,
          playerName: data.playerName
        });

        console.log(`👋 ${data.playerName} left game ${data.gameId}`);
      }
    } catch (error) {
      console.error('Error leaving game:', error);
    }
  });

  // Live updates
  socket.on('liveUpdate', (data) => {
    try {
      const game = games.get(data.gameId);
      if (game) {
        io.to(data.gameId).emit('liveUpdate', {
          message: data.message
        });
      }
    } catch (error) {
      console.error('Error sending live update:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🚪 Player disconnected: ${socket.id}`);

    // Remove player from any games they were in
    for (const [gameId, game] of games.entries()) {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        game.players.splice(playerIndex, 1);

        // If host disconnected, transfer host or delete game
        if (player.isHost) {
          if (game.players.length > 0) {
            game.players[0].isHost = true;
            game.hostId = game.players[0].id;
            io.to(gameId).emit('playerLeft', {
              gameSession: game,
              playerName: player.name + ' (disconnected)'
            });
            console.log(`👑 Host transferred to ${game.players[0].name} in game ${gameId} (original host disconnected)`);
          } else {
            games.delete(gameId);
            console.log(`🗑️ Game ${gameId} deleted (host disconnected, no players left)`);
          }
        } else {
          io.to(gameId).emit('playerLeft', {
            gameSession: game,
            playerName: player.name + ' (disconnected)'
          });
          console.log(`👋 ${player.name} disconnected from game ${gameId}`);
        }
        break;
      }
    }
  });
});

// Basic endpoint to check server status
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: '🎵 Music Quiz Server is running!',
    activeGames: games.size,
    timestamp: new Date().toISOString()
  });
});

// Game status endpoint
app.get('/games', (req, res) => {
  const gameList = Array.from(games.values()).map(game => ({
    id: game.id,
    host: game.host,
    players: game.players.length,
    maxPlayers: game.settings.maxPlayers,
    state: game.state,
    songsCount: game.settings.songsCount,
    createdAt: game.createdAt
  }));

  res.json({
    games: gameList,
    totalGames: games.size
  });
});

// endpoint to receive one song file and return its public URL
app.post('/upload', upload.single('song'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  // Ensure the file is an audio file
  if (!req.file.mimetype.startsWith('audio/')) {
    return res.status(400).json({ error: 'File must be an audio file' });
  }const url = `${req.protocol}://${req.get('host')}/audio/${req.file.filename}`;
  console.log(`🔗 Public URL: ${url}`);
  res.json({ url });
});




const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('🎵 Music Quiz Server running on port', PORT);
  console.log('📊 Server endpoints:');
  console.log(`   - Status: http://localhost:${PORT}/`);
  console.log(`   - Games: http://localhost:${PORT}/games`);
  console.log('🎮 Ready for multiplayer music quiz games!');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Server shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});
