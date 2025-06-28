// Multiplayer Music Quiz Game State
let gameSession = null;
let currentPlayer = null;
let isHost = false;
let gameId = null;

// Music Quiz state
let musicFiles = [];
let musicQuizSongs = [];
let currentSongIndex = 0;
let musicAnswers = [];
let currentAudio = null;
let audioTimer = null;
let clipStartTime = 0;
let clipDuration = 20;
let autoplayEnabled = true;
let autoplayCountdown = null;

// Multiplayer polling
let gameStatePolling = null;
let lobbyPolling = null;

// Font size functionality
function setFontSize(size) {
  const validSizes = ['small', 'normal', 'large', 'xlarge'];
  if (!validSizes.includes(size)) {
    console.warn('Invalid font size:', size);
    return;
  }

  document.body.setAttribute('data-font-size', size);

  try {
    localStorage.setItem('musicQuizFontSize', size);
  } catch (error) {
    console.warn('Could not save font size preference:', error);
  }

  const sizeNames = {
    'small': 'Normal Size',
    'normal': 'Large Size',
    'large': 'Extra Large',
    'xlarge': 'TV Mode'
  };

  showNotification(`📺 View size changed to: ${sizeNames[size]}`, 'success');
}

function loadFontSizePreference() {
  try {
    const savedSize = localStorage.getItem('musicQuizFontSize');
    if (savedSize && ['small', 'normal', 'large', 'xlarge'].includes(savedSize)) {
      document.body.setAttribute('data-font-size', savedSize);
    } else {
      document.body.setAttribute('data-font-size', 'normal');
    }
  } catch (error) {
    console.warn('Could not load font size preference:', error);
    document.body.setAttribute('data-font-size', 'normal');
  }
}

// Notification system
function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.add('show');

  setTimeout(() => {
    notification.classList.remove('show');
  }, 4000);
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  loadFontSizePreference();
  showPanel('home');
  loadRecentGames();
});

function showPanel(panelName) {
  const panels = ['home-panel', 'create-panel', 'join-panel', 'lobby-panel', 'game-panel', 'results-panel'];
  panels.forEach(panel => {
    document.getElementById(panel).classList.add('hidden');
  });
  document.getElementById(panelName + '-panel').classList.remove('hidden');

  // Always hide scoreboard when changing panels
  forceHideScoreboard();

  // Hide scores button when not in game
  const scoresButtonContainer = document.getElementById('scores-button-container');
  if (scoresButtonContainer && panelName !== 'game') {
    scoresButtonContainer.style.display = 'none';
  }

  if (panelName === 'create') {
    initializeMusicSetup();
  }
}

// Game ID Management
function generateGameId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function copyGameId() {
  if (gameId) {
    navigator.clipboard.writeText(gameId).then(() => {
      showNotification('Game ID copied to clipboard!', 'success');
    }).catch(() => {
      showNotification('Could not copy Game ID. ID: ' + gameId, 'warning');
    });
  }
}

// Recent Games Management
function saveRecentGame(gameData) {
  try {
    let recentGames = JSON.parse(localStorage.getItem('recentMusicGames') || '[]');
    recentGames.unshift(gameData);
    recentGames = recentGames.slice(0, 5); // Keep only 5 recent games
    localStorage.setItem('recentMusicGames', JSON.stringify(recentGames));
  } catch (error) {
    console.warn('Could not save recent game:', error);
  }
}

function loadRecentGames() {
  try {
    const recentGames = JSON.parse(localStorage.getItem('recentMusicGames') || '[]');
    if (recentGames.length > 0) {
      document.getElementById('recent-games').style.display = 'block';
      const container = document.getElementById('recent-games-list');
      container.innerHTML = '';

      recentGames.forEach(game => {
        const gameDiv = document.createElement('div');
        gameDiv.className = 'recent-game-item';
        gameDiv.innerHTML = `
          <span>${game.id} - ${game.songs} songs</span>
          <small>${new Date(game.date).toLocaleDateString()}</small>
        `;
        container.appendChild(gameDiv);
      });
    }
  } catch (error) {
    console.warn('Could not load recent games:', error);
  }
}

// Game Session Management (Simulated with localStorage)
function createGameSession(hostName, settings) {
  gameId = generateGameId();

  gameSession = {
    id: gameId,
    host: hostName,
    settings: settings,
    players: [{
      id: 'host',
      name: hostName,
      isHost: true,
      isReady: true,
      score: 0,
      answers: []
    }],
    state: 'lobby', // lobby, playing, finished
    currentSong: 0,
    songs: [],
    createdAt: Date.now()
  };

  // Simulate saving to server
  localStorage.setItem(`game_${gameId}`, JSON.stringify(gameSession));

  currentPlayer = gameSession.players[0];
  isHost = true;

  return gameId;
}

function joinGameSession(gameId, playerName) {
  try {
    const savedGame = localStorage.getItem(`game_${gameId}`);
    if (!savedGame) {
      throw new Error('Game not found');
    }

    gameSession = JSON.parse(savedGame);

    // Check if game is full
    if (gameSession.players.length >= gameSession.settings.maxPlayers) {
      throw new Error('Game is full');
    }

    // Check if game has started
    if (gameSession.state !== 'lobby') {
      throw new Error('Game has already started');
    }

    // Add player
    const newPlayer = {
      id: 'player_' + Date.now(),
      name: playerName,
      isHost: false,
      isReady: false,
      score: 0,
      answers: []
    };

    gameSession.players.push(newPlayer);
    currentPlayer = newPlayer;
    isHost = false;

    // Save updated game state
    localStorage.setItem(`game_${gameSession.id}`, JSON.stringify(gameSession));

    return true;
  } catch (error) {
    throw error;
  }
}

function updateGameState() {
  if (gameSession && gameId) {
    localStorage.setItem(`game_${gameId}`, JSON.stringify(gameSession));
  }
}

function pollGameState() {
  if (!gameSession || !gameId) return;

  try {
    const savedGame = localStorage.getItem(`game_${gameId}`);
    if (savedGame) {
      const updatedSession = JSON.parse(savedGame);

      // Update local state if changed
      if (JSON.stringify(updatedSession) !== JSON.stringify(gameSession)) {
        gameSession = updatedSession;

        // Update UI based on game state
        if (gameSession.state === 'lobby') {
          updateLobbyDisplay();
        } else if (gameSession.state === 'playing') {
          updateGameDisplay();
        } else if (gameSession.state === 'finished') {
          showMultiplayerResults();
        }
      }
    }
  } catch (error) {
    console.warn('Error polling game state:', error);
  }
}

// Music Loading Functions
function initializeMusicSetup() {
  if (musicFiles.length > 0) {
    document.getElementById('music-settings-section').classList.remove('hidden');
    addMusicCollectionStatus();
  } else {
    document.getElementById('music-settings-section').classList.add('hidden');
    clearMusicCollectionStatus();
  }

  if (musicFiles.length === 0) {
    document.getElementById('music-file-list').innerHTML = '';
  }
}

function loadMusicFiles(event) {
  const files = Array.from(event.target.files);
  processMusicFiles(files, 'manual selection');
}

function loadMusicFolder(event) {
  const files = Array.from(event.target.files);

  if (files.length === 0) {
    showNotification('No folder selected!', 'warning');
    return;
  }

  const firstFile = files[0];
  const folderPath = firstFile.webkitRelativePath.split('/')[0];

  processMusicFiles(files, folderPath);
}

function processMusicFiles(files, source) {
  const audioFiles = files.filter(file => {
    const extension = file.name.toLowerCase();
    return extension.endsWith('.mp3') ||
      extension.endsWith('.wav') ||
      extension.endsWith('.m4a') ||
      extension.endsWith('.aac') ||
      file.type.startsWith('audio/');
  });

  if (audioFiles.length === 0) {
    showNotification('No valid audio files found!', 'warning');
    return;
  }

  musicFiles = audioFiles;
  extractMusicMetadata(audioFiles, source);
}

async function extractMusicMetadata(files, source) {
  showNotification('📊 Reading music metadata...', 'warning');

  const filesWithMetadata = [];
  let processed = 0;

  const progressContainer = document.getElementById('music-file-list');
  progressContainer.innerHTML = `
    <div class="metadata-progress">
      <h4>📊 Analyzing Music Files...</h4>
      <div class="progress-bar">
        <div class="progress-fill" id="metadata-progress"></div>
      </div>
      <p id="metadata-status">Processing file 0 of ${files.length}</p>
    </div>
  `;

  for (const file of files) {
    try {
      const metadata = await extractSingleFileMetadata(file);
      filesWithMetadata.push({
        file: file,
        metadata: metadata
      });
    } catch (error) {
      console.warn(`Could not extract metadata for ${file.name}:`, error);
      filesWithMetadata.push({
        file: file,
        metadata: {
          title: file.name.replace(/\.(mp3|wav|m4a|aac)$/i, ''),
          album: 'Unknown Album',
          artist: 'Unknown Artist',
          year: '',
          duration: null
        }
      });
    }

    processed++;

    const progress = (processed / files.length) * 100;
    const progressBar = document.getElementById('metadata-progress');
    const statusText = document.getElementById('metadata-status');

    if (progressBar) progressBar.style.width = progress + '%';
    if (statusText) statusText.textContent = `Processing file ${processed} of ${files.length}`;
  }

  musicFiles = filesWithMetadata;

  displayMusicFileList(source);
  document.getElementById('music-settings-section').classList.remove('hidden');
  addMusicCollectionStatus();

  const message = source.includes('/') || source === 'manual selection'
    ? `🎵 Loaded ${filesWithMetadata.length} audio files with metadata!`
    : `🎵 Loaded ${filesWithMetadata.length} audio files from "${source}" folder!`;

  showNotification(message);
}

function extractSingleFileMetadata(file) {
  return new Promise((resolve, reject) => {
    if (typeof jsmediatags === 'undefined') {
      resolve({
        title: file.name.replace(/\.(mp3|wav|m4a|aac)$/i, ''),
        album: 'Unknown Album',
        artist: 'Unknown Artist',
        year: '',
        duration: null
      });
      return;
    }

    jsmediatags.read(file, {
      onSuccess: function(tag) {
        const tags = tag.tags;
        resolve({
          title: tags.title || file.name.replace(/\.(mp3|wav|m4a|aac)$/i, ''),
          album: tags.album || 'Unknown Album',
          artist: tags.artist || 'Unknown Artist',
          year: tags.year || '',
          duration: tags.duration || null,
          genre: tags.genre || '',
          track: tags.track || ''
        });
      },
      onError: function(error) {
        resolve({
          title: file.name.replace(/\.(mp3|wav|m4a|aac)$/i, ''),
          album: 'Unknown Album',
          artist: 'Unknown Artist',
          year: '',
          duration: null
        });
      }
    });
  });
}

function displayMusicFileList(source) {
  const container = document.getElementById('music-file-list');

  if (musicFiles.length === 0) {
    container.innerHTML = '<p style="color: #666;">No files loaded</p>';
    return;
  }

  let folderInfo = '';
  if (source !== 'manual selection') {
    const folderStats = analyzeFolderStructure();
    folderInfo = `
      <div class="folder-stats">
        <h4>📁 Music Collection: ${source}</h4>
        <p><strong>${musicFiles.length}</strong> audio files found</p>
        ${folderStats.subfolders > 0 ? `<p>📂 ${folderStats.subfolders} subfolders included</p>` : ''}
        <div class="folder-path">💾 Total size: ${folderStats.totalSize}</div>
      </div>
    `;
  }

  container.innerHTML = folderInfo + `<div class="file-list-header">🎵 ${musicFiles.length} Songs Ready for Quiz</div>`;

  const filesByFolder = {};

  musicFiles.forEach(fileObj => {
    const file = fileObj.file || fileObj;
    const folder = file.webkitRelativePath ?
      file.webkitRelativePath.split('/').slice(0, -1).join('/') || 'Root' :
      'Selected Files';

    if (!filesByFolder[folder]) {
      filesByFolder[folder] = [];
    }
    filesByFolder[folder].push(fileObj);
  });

  Object.keys(filesByFolder).forEach(folder => {
    if (Object.keys(filesByFolder).length > 1) {
      const folderDiv = document.createElement('div');
      folderDiv.className = 'folder-header';
      folderDiv.innerHTML = `<h5>📂 ${folder}</h5>`;
      container.appendChild(folderDiv);
    }

    const filesToShow = filesByFolder[folder].slice(0, 10);

    filesToShow.forEach((fileObj, index) => {
      const file = fileObj.file || fileObj;
      const metadata = fileObj.metadata || {};

      const fileDiv = document.createElement('div');
      fileDiv.className = 'file-item';

      const fileName = file.name;
      const fileSize = (file.size / (1024 * 1024)).toFixed(1);
      const title = metadata.title || fileName.replace(/\.(mp3|wav|m4a|aac)$/i, '');
      const artist = metadata.artist || 'Unknown Artist';
      const album = metadata.album || 'Unknown Album';

      fileDiv.innerHTML = `
        <div class="file-info">
          <div class="track-info">
            <div class="track-title">🎵 ${title}</div>
            <div class="track-details">
              <span class="artist">👤 ${artist}</span>
              <span class="album">💿 ${album}</span>
            </div>
          </div>
          <div class="file-details">
            <span class="file-size">${fileSize} MB</span>
          </div>
        </div>
      `;
      container.appendChild(fileDiv);
    });

    if (filesByFolder[folder].length > 10) {
      const moreDiv = document.createElement('div');
      moreDiv.className = 'more-files';
      moreDiv.innerHTML = `<p>... and ${filesByFolder[folder].length - 10} more songs in this folder</p>`;
      container.appendChild(moreDiv);
    }
  });
}

function analyzeFolderStructure() {
  const folders = new Set();
  let totalSize = 0;

  musicFiles.forEach(fileObj => {
    const file = fileObj.file || fileObj;
    if (file.webkitRelativePath) {
      const folderPath = file.webkitRelativePath.split('/').slice(0, -1).join('/');
      if (folderPath) folders.add(folderPath);
    }
    totalSize += file.size;
  });

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return {
    subfolders: folders.size,
    totalSize: formatSize(totalSize),
    folders: Array.from(folders)
  };
}

function addMusicCollectionStatus() {
  clearMusicCollectionStatus();

  if (musicFiles && musicFiles.length > 0) {
    const setupSection = document.getElementById('music-settings-section');
    const statusDiv = document.createElement('div');
    statusDiv.id = 'music-collection-status';
    statusDiv.className = 'folder-stats';

    const totalSizeMB = musicFiles.reduce((total, fileObj) => {
      const file = fileObj.file || fileObj;
      return total + file.size;
    }, 0) / (1024 * 1024);

    const artistCount = new Set(
      musicFiles.map(fileObj => (fileObj.metadata || {}).artist)
        .filter(artist => artist && artist !== 'Unknown Artist')
    ).size;

    statusDiv.innerHTML = `
      <h4>🎵 Loaded Music Collection</h4>
      <p><strong>${musicFiles.length}</strong> songs ready to play</p>
      ${artistCount > 0 ? `<p>👤 ${artistCount} different artists</p>` : ''}
      <p>💾 Total size: ${totalSizeMB.toFixed(1)} MB</p>
      <p style="color: #666; font-size: 0.9rem; margin-top: 10px;">
        Your music is ready! Configure settings below and create the game.
      </p>
    `;

    setupSection.insertBefore(statusDiv, setupSection.firstChild);
  }
}

function clearMusicCollectionStatus() {
  const existingStatus = document.getElementById('music-collection-status');
  if (existingStatus) {
    existingStatus.remove();
  }
}

// Multiplayer Game Functions
function createGame() {
  const hostName = document.getElementById('host-name').value.trim();

  if (!hostName) {
    showNotification('Please enter your name!', 'warning');
    return;
  }

  if (musicFiles.length === 0) {
    showNotification('Please load your music collection first!', 'warning');
    return;
  }

  const settings = {
    songsCount: parseInt(document.getElementById('songs-count').value),
    clipDuration: parseInt(document.getElementById('clip-duration').value),
    maxPlayers: parseInt(document.getElementById('max-players').value),
    autoplayEnabled: document.getElementById('autoplay-next').checked
  };

  try {
    const newGameId = createGameSession(hostName, settings);

    // Save recent game
    saveRecentGame({
      id: newGameId,
      songs: settings.songsCount,
      date: new Date().toISOString()
    });

    // Update UI
    updateGameStatusBar();
    showPanel('lobby');
    setupLobby();

    showNotification(`Game created! Share ID: ${newGameId}`, 'success');

    // Start polling for lobby updates
    startLobbyPolling();

  } catch (error) {
    showNotification('Error creating game: ' + error.message, 'error');
  }
}

function joinGame() {
  const playerName = document.getElementById('player-name').value.trim();
  const inputGameId = document.getElementById('game-id-input').value.trim().toUpperCase();

  if (!playerName) {
    showNotification('Please enter your name!', 'warning');
    return;
  }

  if (!inputGameId || inputGameId.length !== 6) {
    showNotification('Please enter a valid 6-character Game ID!', 'warning');
    return;
  }

  try {
    joinGameSession(inputGameId, playerName);
    gameId = inputGameId;

    updateGameStatusBar();
    showPanel('lobby');
    setupLobby();

    showNotification(`Joined game ${inputGameId}!`, 'success');

    // Start polling for lobby updates
    startLobbyPolling();

  } catch (error) {
    showNotification('Error joining game: ' + error.message, 'error');
  }
}

function updateGameStatusBar() {
  if (gameSession && currentPlayer) {
    document.getElementById('game-status').classList.remove('hidden');
    document.getElementById('game-id-display').textContent = `Game ID: ${gameSession.id}`;
    document.getElementById('player-role').textContent = `Role: ${isHost ? 'Host' : 'Player'}`;
    document.getElementById('player-count').textContent = `Players: ${gameSession.players.length}/${gameSession.settings.maxPlayers}`;
    document.getElementById('leave-btn').style.display = 'inline-block';

    if (isHost) {
      document.getElementById('share-btn').style.display = 'inline-block';
    }
  } else {
    document.getElementById('game-status').classList.add('hidden');
    document.getElementById('leave-btn').style.display = 'none';
  }
}

function setupLobby() {
  document.getElementById('lobby-game-id').textContent = `Game ID: ${gameSession.id}`;
  document.getElementById('lobby-settings').textContent =
    `Settings: ${gameSession.settings.songsCount} songs, ${gameSession.settings.clipDuration} seconds each`;

  if (isHost) {
    document.getElementById('host-controls').style.display = 'block';
    document.getElementById('player-controls').style.display = 'none';
  } else {
    document.getElementById('host-controls').style.display = 'none';
    document.getElementById('player-controls').style.display = 'block';
  }

  updateLobbyDisplay();
}

function updateLobbyDisplay() {
  if (!gameSession) return;

  document.getElementById('current-player-count').textContent = gameSession.players.length;
  document.getElementById('max-player-count').textContent = gameSession.settings.maxPlayers;

  const container = document.getElementById('players-container');
  container.innerHTML = '';

  gameSession.players.forEach(player => {
    const playerDiv = document.createElement('div');
    playerDiv.className = `player-item ${player.isHost ? 'host' : ''}`;

    const statusClass = player.isHost ? 'status-host' : (player.isReady ? 'status-ready' : 'status-waiting');
    const statusText = player.isHost ? 'HOST' : (player.isReady ? 'READY' : 'WAITING');

    playerDiv.innerHTML = `
      <span>${player.name}</span>
      <span class="player-status ${statusClass}">${statusText}</span>
    `;
    container.appendChild(playerDiv);
  });

  // Update start button
  if (isHost) {
    const startBtn = document.getElementById('start-game-btn');
    const canStart = gameSession.players.length >= 2;
    startBtn.disabled = !canStart;
    startBtn.textContent = canStart ? '🚀 Start Game' : `🚀 Need ${2 - gameSession.players.length} more player(s)`;
  }
}

function startLobbyPolling() {
  if (lobbyPolling) clearInterval(lobbyPolling);
  lobbyPolling = setInterval(pollGameState, 1000);
}

function stopLobbyPolling() {
  if (lobbyPolling) {
    clearInterval(lobbyPolling);
    lobbyPolling = null;
  }
}

function startMultiplayerGame() {
  if (!isHost || !gameSession) return;

  if (gameSession.players.length < 2) {
    showNotification('Need at least 2 players to start!', 'warning');
    return;
  }

  try {
    // Prepare songs
    const shuffled = [...musicFiles].sort(() => Math.random() - 0.5)
      .filter(music => !music.metadata.title.toLowerCase().includes("with audio description"));
    musicQuizSongs = shuffled.slice(0, gameSession.settings.songsCount);

    // Update game session
    gameSession.state = 'playing';
    gameSession.songs = musicQuizSongs.map(song => ({
      title: song.metadata.title,
      artist: song.metadata.artist,
      album: song.metadata.album
    }));
    gameSession.currentSong = 0;

    // Reset all player scores and answers
    gameSession.players.forEach(player => {
      player.score = 0;
      player.answers = [];
    });

    currentSongIndex = 0;
    clipDuration = gameSession.settings.clipDuration;
    autoplayEnabled = gameSession.settings.autoplayEnabled;

    updateGameState();

    // Start the game
    showPanel('game');
    setupGameInterface();

    stopLobbyPolling();
    startGamePolling();

    if (isHost) {
      playCurrentSong();
    }

    showNotification('Game started! Good luck!', 'success');

  } catch (error) {
    showNotification('Error starting game: ' + error.message, 'error');
  }
}

function setupGameInterface() {
  document.getElementById('total-songs').textContent = gameSession.settings.songsCount;

  if (currentPlayer.isHost) {
    document.getElementById('host-music-player').style.display = 'block';
  } else {
    document.getElementById('host-music-player').style.display = 'none';
  }

  // Show scores button only during multiplayer games
  const scoresButtonContainer = document.getElementById('scores-button-container');
  if (scoresButtonContainer) {
    scoresButtonContainer.style.display = 'block';
  }

  updateGameDisplay();
  setupLiveFeed();
}

function updateGameDisplay() {
  if (!gameSession) return;

  // Update progress
  const progress = (gameSession.currentSong / gameSession.settings.songsCount) * 100;
  document.getElementById('music-progress-fill').style.width = progress + '%';

  // Update song counter
  document.getElementById('current-song-num').textContent = gameSession.currentSong + 1;

  // Update live scoreboard
  updateLiveScoreboard();
}

function startGamePolling() {
  if (gameStatePolling) clearInterval(gameStatePolling);
  gameStatePolling = setInterval(pollGameState, 500); // More frequent during game
}

function stopGamePolling() {
  if (gameStatePolling) {
    clearInterval(gameStatePolling);
    gameStatePolling = null;
  }
}

async function playCurrentSong() {
  if (!isHost || currentSongIndex >= musicQuizSongs.length) {
    finishGame();
    return;
  }

  const songObj = musicQuizSongs[currentSongIndex];
  const song = songObj.file || songObj;
  const audioElement = document.getElementById('music-audio');

  try {
    const audioUrl = URL.createObjectURL(song);
    audioElement.src = audioUrl;

    await Promise.race([
      new Promise((resolve, reject) => {
        audioElement.addEventListener('loadedmetadata', resolve, { once: true });
        audioElement.addEventListener('error', reject, { once: true });
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Audio loading timeout')), 10000))
    ]);

    const duration = audioElement.duration;
    const maxStartTime = Math.max(0, duration - clipDuration - 10);
    clipStartTime = Math.random() * maxStartTime + 10;
    audioElement.currentTime = clipStartTime;

    await audioElement.play();
    setupAudioTimer();

    addLiveUpdate(`🎵 Now playing song ${currentSongIndex + 1}`);

  } catch (error) {
    console.error('Error playing song:', error);
    skipSong();
  }
}

function setupAudioTimer() {
  const audioElement = document.getElementById('music-audio');
  const timerElement = document.getElementById('audio-timer');

  if (audioTimer) clearInterval(audioTimer);

  let autoplayTriggered = false;

  const updateTimer = () => {
    const currentTime = audioElement.currentTime - clipStartTime;
    const remaining = Math.max(0, clipDuration - currentTime);

    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    timerElement.textContent = `${formatTime(currentTime)} / ${formatTime(clipDuration)}`;

    if (currentTime >= (clipDuration - 0.1) && !autoplayTriggered) {
      audioElement.pause();
      clearInterval(audioTimer);
      autoplayTriggered = true;

      // Auto-advance after clip ends
      setTimeout(() => {
        if (isHost) {
          showAnswers();
        }
      }, 2000);
    }
  };

  updateTimer();
  audioTimer = setInterval(updateTimer, 100);
}

function submitGuess() {
  const guess = document.getElementById('song-guess').value.trim();

  if (!guess) {
    showNotification('Please enter a guess!', 'warning');
    return;
  }

  if (!currentPlayer || !gameSession) return;

  // Calculate score
  const currentSong = gameSession.songs[gameSession.currentSong];
  let points = 0;
  let accuracy = 'No match';

  const guessLower = guess.toLowerCase();
  const titleLower = currentSong.title.toLowerCase().replace(/^\d+\.\s*/, '');
  const artistLower = currentSong.artist.toLowerCase();

  if (titleLower && titleLower !== 'unknown') {
    if (guessLower === titleLower || titleLower.includes(guessLower) || guessLower.includes(titleLower)) {
      points = guessLower === titleLower ? 10 : 8;
      accuracy = 'Title match';
    } else if (artistLower && artistLower !== 'unknown artist') {
      if (guessLower === artistLower || artistLower.includes(guessLower) || guessLower.includes(artistLower)) {
        points = 6;
        accuracy = 'Artist match';
      }
    }
  }

  // Fallback word matching
  if (points === 0) {
    const titleWords = titleLower.split(/[-_\s]+/).filter(word => word.length > 2);
    const guessWords = guessLower.split(/[-_\s]+/).filter(word => word.length > 2);

    const hasWordMatch = titleWords.some(titleWord =>
      guessWords.some(guessWord =>
        titleWord.includes(guessWord) || guessWord.includes(titleWord)
      )
    );

    if (hasWordMatch) {
      points = 3;
      accuracy = 'Partial match';
    }
  }

  // Update player's answer
  const answerData = {
    songIndex: gameSession.currentSong,
    guess: guess,
    points: points,
    accuracy: accuracy,
    timestamp: Date.now()
  };

  // Find current player and update their answer
  const playerIndex = gameSession.players.findIndex(p => p.id === currentPlayer.id);
  if (playerIndex !== -1) {
    // Remove any existing answer for this song
    gameSession.players[playerIndex].answers = gameSession.players[playerIndex].answers.filter(
      a => a.songIndex !== gameSession.currentSong
    );

    // Add new answer
    gameSession.players[playerIndex].answers.push(answerData);
    gameSession.players[playerIndex].score += points;

    currentPlayer = gameSession.players[playerIndex]; // Update local reference
  }

  updateGameState();

  document.getElementById('song-guess').value = '';
  showNotification(`Guess submitted! Scored ${points} points.`, points > 0 ? 'success' : 'warning');

  addLiveUpdate(`🎯 ${currentPlayer.name} guessed: "${guess}" (${points} pts)`);
}

function skipPersonalGuess() {
  document.getElementById('song-guess').value = '';
  showNotification('Skipped this song', 'warning');
  addLiveUpdate(`⏭️ ${currentPlayer.name} skipped this song`);
}

function showAnswers() {
  if (!isHost) return;

  const currentSong = gameSession.songs[gameSession.currentSong];
  addLiveUpdate(`📝 Answer: "${currentSong.title}" by ${currentSong.artist}`);

  // Wait a moment then advance to next song
  setTimeout(() => {
    nextSong();
  }, 3000);
}

function nextSong() {
  if (!isHost) return;

  gameSession.currentSong++;
  currentSongIndex++;

  updateGameState();

  if (currentSongIndex >= musicQuizSongs.length) {
    finishGame();
  } else {
    // Clear guesses for next song
    document.getElementById('song-guess').value = '';

    // Play next song
    setTimeout(() => {
      playCurrentSong();
    }, 1000);
  }
}

function skipSong() {
  if (!isHost) return;

  addLiveUpdate(`⏭️ Host skipped song ${gameSession.currentSong + 1}`);
  nextSong();
}

function replayClip() {
  if (!isHost) return;

  const audioElement = document.getElementById('music-audio');
  audioElement.currentTime = clipStartTime;

  if (audioTimer) clearInterval(audioTimer);

  audioElement.play().then(() => {
    setupAudioTimer();
    addLiveUpdate(`🔄 Host replayed the clip`);
  });
}

function finishGame() {
  if (!isHost) return;

  gameSession.state = 'finished';
  updateGameState();

  stopGamePolling();
  showMultiplayerResults();
}

function showMultiplayerResults() {
  showPanel('results');

  if (!gameSession) return;

  // Sort players by score
  const sortedPlayers = [...gameSession.players].sort((a, b) => b.score - a.score);

  // Show final leaderboard
  const leaderboardContainer = document.getElementById('final-leaderboard');
  leaderboardContainer.innerHTML = '';

  sortedPlayers.forEach((player, index) => {
    const playerDiv = document.createElement('div');
    playerDiv.className = `leaderboard-item rank-${index + 1}`;

    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

    playerDiv.innerHTML = `
      <span><span class="player-rank">${medal}</span>${player.name}</span>
      <span class="player-score">${player.score} points</span>
    `;
    leaderboardContainer.appendChild(playerDiv);
  });

  // Show detailed results
  showDetailedResults();

  // Show play again button only for host
  if (isHost) {
    document.getElementById('play-again-btn').style.display = 'inline-block';
  } else {
    document.getElementById('play-again-btn').style.display = 'none';
  }
}

function showDetailedResults() {
  const container = document.getElementById('detailed-results-container');
  container.innerHTML = '';

  for (let songIndex = 0; songIndex < gameSession.songs.length; songIndex++) {
    const song = gameSession.songs[songIndex];
    const roundDiv = document.createElement('div');
    roundDiv.className = 'round-result';

    roundDiv.innerHTML = `
      <h4>Song ${songIndex + 1}: "${song.title}" by ${song.artist}</h4>
      <div class="round-players" id="round-${songIndex}-players"></div>
    `;

    const playersContainer = roundDiv.querySelector(`#round-${songIndex}-players`);

    gameSession.players.forEach(player => {
      const answer = player.answers.find(a => a.songIndex === songIndex);
      const playerResultDiv = document.createElement('div');

      if (answer) {
        const resultClass = answer.points >= 8 ? 'correct' : answer.points >= 3 ? 'partial' : 'incorrect';
        playerResultDiv.className = `player-result ${resultClass}`;
        playerResultDiv.innerHTML = `
          <strong>${player.name}</strong><br>
          Guess: "${answer.guess}"<br>
          <small>${answer.points} points - ${answer.accuracy}</small>
        `;
      } else {
        playerResultDiv.className = 'player-result incorrect';
        playerResultDiv.innerHTML = `
          <strong>${player.name}</strong><br>
          No guess<br>
          <small>0 points</small>
        `;
      }

      playersContainer.appendChild(playerResultDiv);
    });

    container.appendChild(roundDiv);
  }
}

// Live Updates and Scoreboard
function setupLiveFeed() {
  const liveFeed = document.getElementById('live-feed');
  liveFeed.innerHTML = '<div class="live-update-item">🎮 Game started! Good luck everyone!</div>';
}

function addLiveUpdate(message) {
  const liveFeed = document.getElementById('live-feed');
  const updateDiv = document.createElement('div');
  updateDiv.className = 'live-update-item';
  updateDiv.textContent = `${new Date().toLocaleTimeString()} - ${message}`;

  liveFeed.insertBefore(updateDiv, liveFeed.firstChild);

  // Keep only last 10 updates
  while (liveFeed.children.length > 10) {
    liveFeed.removeChild(liveFeed.lastChild);
  }
}

function updateLiveScoreboard() {
  const scoreboard = document.getElementById('live-scoreboard');
  if (!scoreboard || !gameSession || !gameSession.players) {
    // Clear scoreboard if no valid game session
    if (scoreboard) {
      scoreboard.innerHTML = '<p style="text-align: center; color: #666;">No active game</p>';
    }
    return;
  }

  const sortedPlayers = [...gameSession.players].sort((a, b) => b.score - a.score);

  scoreboard.innerHTML = '';
  if (sortedPlayers.length === 0) {
    scoreboard.innerHTML = '<p style="text-align: center; color: #666;">No players found</p>';
    return;
  }

  sortedPlayers.forEach((player, index) => {
    const playerDiv = document.createElement('div');
    playerDiv.className = `leaderboard-item rank-${index + 1}`;

    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

    playerDiv.innerHTML = `
      <span><span class="player-rank">${medal}</span>${player.name}</span>
      <span class="player-score">${player.score || 0} pts</span>
    `;
    scoreboard.appendChild(playerDiv);
  });
}

function toggleScoreboard() {
  // Only show scoreboard if there's an active game
  if (!gameSession || gameSession.state !== 'playing') {
    showNotification('Scoreboard only available during gameplay!', 'warning');
    return;
  }

  const modal = document.getElementById('scoreboard-modal');
  modal.classList.toggle('hidden');

  if (!modal.classList.contains('hidden')) {
    modal.style.display = 'flex';
    updateLiveScoreboard();
  } else {
    modal.style.display = 'none';
  }
}

function closeScoreboard() {
  const modal = document.getElementById('scoreboard-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// Emergency modal closer - can be called from browser console if needed
function emergencyCloseAllModals() {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  });
  showNotification('All modals closed!', 'success');
}

// Force hide scoreboard on any panel change
function forceHideScoreboard() {
  const modal = document.getElementById('scoreboard-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', function() {
  loadFontSizePreference();
  showPanel('home');
  loadRecentGames();

  // Add modal click handlers
  const modal = document.getElementById('scoreboard-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeScoreboard();
      }
    });
  }
});

// Game Management
function playAgain() {
  if (!isHost) return;

  // Reset game state but keep players
  gameSession.state = 'lobby';
  gameSession.currentSong = 0;
  gameSession.songs = [];

  // Reset player scores and answers
  gameSession.players.forEach(player => {
    player.score = 0;
    player.answers = [];
  });

  updateGameState();

  // Close any open modals
  closeScoreboard();

  // Return to lobby
  showPanel('lobby');
  setupLobby();
  startLobbyPolling();

  showNotification('Game reset! Configure settings and start again.', 'success');
}

function leaveGame() {
  // Clean up
  stopLobbyPolling();
  stopGamePolling();

  if (audioTimer) {
    clearInterval(audioTimer);
    audioTimer = null;
  }

  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }

  // Close any open modals
  closeScoreboard();

  // Reset state
  gameSession = null;
  currentPlayer = null;
  isHost = false;
  gameId = null;

  // Update UI
  updateGameStatusBar();
  showPanel('home');

  showNotification('Left the game', 'warning');
}

// Emergency reset function - can be called from browser console if stuck
function emergencyReset() {
  // Close all modals
  emergencyCloseAllModals();

  // Stop all timers
  if (gameStatePolling) clearInterval(gameStatePolling);
  if (lobbyPolling) clearInterval(lobbyPolling);
  if (audioTimer) clearInterval(audioTimer);
  if (autoplayCountdown) clearTimeout(autoplayCountdown);

  // Reset all state
  gameSession = null;
  currentPlayer = null;
  isHost = false;
  gameId = null;

  // Go back home
  showPanel('home');
  updateGameStatusBar();

  showNotification('Emergency reset completed!', 'success');
}

// Make sure these functions exist for the new UI
function updateSongCounter() {
  // This function is called but functionality is handled in updateGameDisplay
}

function handleMusicSubmit() {
  submitGuess();
}
