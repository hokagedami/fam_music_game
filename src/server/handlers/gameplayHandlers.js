import { gameStore } from '../gameStore.js';
import { sanitizeGameSession, calculatePoints } from '../utils/index.js';
import { validateGameId, validateAnswerSubmission } from '../validation.js';

/**
 * Register gameplay-related socket handlers (answering, progression, etc.)
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerGameplayHandlers(io, socket) {
  // Submit an answer
  socket.on('submitAnswer', (data) => {
    try {
      // Validate game ID
      const gameId = validateGameId(data.gameId);
      if (!gameId || !data.playerId) {
        return;
      }

      const game = gameStore.get(gameId);
      if (!game || game.state !== 'playing') {
        return;
      }

      const playerIndex = game.players.findIndex((p) => p.id === data.playerId);
      if (playerIndex === -1) {
        return;
      }

      const player = game.players[playerIndex];

      // Use current song index from game state
      const songIndex = game.currentSong;

      // Check if already answered this song
      if (player.answers.some((a) => a.songIndex === songIndex)) {
        return;
      }

      // Validate answer submission (when not timed out)
      let selectedOption;
      let responseTime;
      if (data.timedOut) {
        selectedOption = -1;
        responseTime = game.settings.answerTime * 1000;
      } else {
        const validatedAnswer = validateAnswerSubmission(data);
        if (!validatedAnswer) {
          return; // Invalid answer data
        }
        selectedOption = validatedAnswer.answerIndex;
        responseTime = validatedAnswer.responseTime;
      }

      // Client sends isCorrect directly (client-side validation)
      const isCorrect = data.isCorrect === true && !data.timedOut;

      // Calculate points based on response time
      const maxAnswerTime = game.settings.answerTime * 1000;
      const points = isCorrect ? calculatePoints(responseTime, maxAnswerTime) : 0;

      // Record the answer
      player.answers.push({
        songIndex: songIndex,
        selectedOption: selectedOption,
        isCorrect: isCorrect,
        points: points,
        responseTime: responseTime,
      });

      player.score += points;

      // Notify all players
      io.to(gameId).emit('answerResult', {
        playerId: data.playerId,
        playerName: player.name,
        isCorrect: isCorrect,
        points: points,
        totalScore: player.score,
      });

      // Count how many players have answered
      const answeredCount = game.players.filter((p) =>
        p.answers.some((a) => a.songIndex === songIndex)
      ).length;

      io.to(gameId).emit('playerAnswered', {
        playerName: player.name,
        answeredCount: answeredCount,
        totalPlayers: game.players.length,
      });

      // Check if all players have answered
      if (answeredCount >= game.players.length) {
        // Clear any existing timer
        if (game.answerTimer) {
          clearTimeout(game.answerTimer);
          game.answerTimer = undefined;
        }

        io.to(gameId).emit('allPlayersAnswered', {
          songIndex: songIndex,
          gameSession: sanitizeGameSession(game),
        });
      }

      console.log(
        `${player.name} answered song ${songIndex + 1}: ${isCorrect ? 'correct' : 'wrong'} (${points} pts)`
      );
    } catch (error) {
      console.error('Error submitting answer:', error);
    }
  });

  // Song is playing (host notifies players)
  socket.on('songPlaying', (data) => {
    try {
      if (!data.gameId) return;

      const game = gameStore.get(data.gameId);
      if (!game || game.state !== 'playing') return;

      if (game.hostId !== socket.id) return;

      game.currentSong = data.songIndex;

      // Broadcast to all players (except host)
      socket.to(data.gameId).emit('songPlaying', {
        songIndex: data.songIndex,
        clipDuration: game.settings.clipDuration,
      });
    } catch (error) {
      console.error('Error in songPlaying:', error);
    }
  });

  // Show Kahoot options to players
  socket.on('showKahootOptions', (data) => {
    try {
      if (!data.gameId) return;

      const game = gameStore.get(data.gameId);
      if (!game || game.state !== 'playing') return;

      if (game.hostId !== socket.id) return;

      // Store options for this song
      game.kahootOptions[data.songIndex] = {
        options: data.options,
        correctIndex: data.correctIndex,
      };

      // Clear any existing timer
      if (game.answerTimer) {
        clearTimeout(game.answerTimer);
      }

      // Set answer timer
      const answerTimeMs = game.settings.answerTime * 1000;
      game.answerTimer = setTimeout(() => {
        // Time expired
        io.to(data.gameId).emit('answerTimeExpired', {
          songIndex: data.songIndex,
          gameSession: sanitizeGameSession(game),
        });
      }, answerTimeMs);

      // Broadcast options to all players (except host)
      socket.to(data.gameId).emit('kahootOptions', {
        options: data.options,
        correctIndex: data.correctIndex,
        songIndex: data.songIndex,
      });

      console.log(`Options shown for song ${data.songIndex + 1} in game ${data.gameId}`);
    } catch (error) {
      console.error('Error showing Kahoot options:', error);
    }
  });

  // Reveal answers
  socket.on('revealAnswers', (data) => {
    try {
      if (!data.gameId) return;

      const game = gameStore.get(data.gameId);
      if (!game || game.state !== 'playing') return;

      if (game.hostId !== socket.id) return;

      // Clear answer timer
      if (game.answerTimer) {
        clearTimeout(game.answerTimer);
        game.answerTimer = undefined;
      }

      // Broadcast to all players
      io.to(data.gameId).emit('revealAnswers', {
        title: data.title,
        artist: data.artist,
        correctAnswer: data.correctAnswer,
        correctIndex: data.correctIndex,
        gameSession: sanitizeGameSession(game),
      });

      console.log(`Answer revealed for game ${data.gameId}: ${data.correctAnswer}`);
    } catch (error) {
      console.error('Error revealing answers:', error);
    }
  });

  // Next song
  socket.on('nextSong', (data) => {
    try {
      if (!data.gameId) return;

      const game = gameStore.get(data.gameId);
      if (!game || game.state !== 'playing') return;

      if (game.hostId !== socket.id) return;

      // Increment current song index
      const nextSongIndex = (game.currentSong || 0) + 1;
      game.currentSong = nextSongIndex;

      // Check if game is finished
      if (nextSongIndex >= game.songs.length) {
        game.state = 'finished';
        io.to(data.gameId).emit('gameEnded', {
          gameSession: sanitizeGameSession(game),
        });
        console.log(`Game ${data.gameId} finished`);
        return;
      }

      // Notify players of next song
      io.to(data.gameId).emit('songChanged', {
        songIndex: nextSongIndex,
        gameSession: sanitizeGameSession(game),
        clipDuration: game.settings.clipDuration,
      });

      console.log(`Game ${data.gameId} moved to song ${nextSongIndex + 1}`);
    } catch (error) {
      console.error('Error advancing song:', error);
    }
  });

  // End game
  socket.on('endGame', (data) => {
    try {
      if (!data.gameId) return;

      const game = gameStore.get(data.gameId);
      if (!game) return;

      if (game.hostId !== socket.id) return;

      game.state = 'finished';

      io.to(data.gameId).emit('gameEnded', {
        gameSession: sanitizeGameSession(game),
      });

      console.log(`Game ${data.gameId} ended by host`);
    } catch (error) {
      console.error('Error ending game:', error);
    }
  });
}
