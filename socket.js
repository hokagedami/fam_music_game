// Multiplayer Music Quiz Game State with Socket.IO
let socket = null;
let gameSession = null;
let currentPlayer = null;
let gameId = null;
let connectionStatus = 'disconnected'; // disconnected, connecting, connected

// Music Quiz state
let musicFiles = [];
let musicQuizSongs = [];
let musicQuizSongsUrl = [];
let currentSongIndex = 0;
let musicAnswers = [];
let currentAudio = null;
let audioTimer = null;
let clipStartTime = 0;
let clipDuration = 20;
let autoplayEnabled = true;
let autoplayCountdown = null;

// Socket.IO Configuration
const SOCKET_CONFIG = {
  // Change this to your server URL
  serverUrl: 'ws://localhost:3001',

  // For production, use your actual server URL:
  // serverUrl: 'wss://your-server.herokuapp.com',
  // serverUrl: 'wss://your-domain.com',

  options: {
    transports: ['websocket', 'polling'],
    timeout: 5000,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000
  }
};

// Initialize Socket.IO connection
function initializeSocket() {
  if (socket && socket.connected) {
    return; // Already connected
  }

  try {
    connectionStatus = 'connecting';
    updateConnectionStatus();

    socket = io(SOCKET_CONFIG.serverUrl, SOCKET_CONFIG.options);

    setupSocketEvents();

  } catch (error) {
    console.error('Socket connection failed:', error);
    connectionStatus = 'disconnected';
    updateConnectionStatus();
    showNotification('Unable to connect to game server. Using offline mode.', 'warning');

    // Fallback to localStorage mode
    enableOfflineMode();
  }
}

function setupSocketEvents() {
  // Connection events
  socket.on('connect', () => {
    connectionStatus = 'connected';
    updateConnectionStatus();
    showNotification('Connected to game server!', 'success');
  });

  socket.on('disconnect', () => {
    connectionStatus = 'disconnected';
    updateConnectionStatus();
    showNotification('Disconnected from game server', 'warning');
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    connectionStatus = 'disconnected';
    updateConnectionStatus();
    showNotification('Connection failed. Check if server is running.', 'error');

    // Enable offline mode as fallback
    enableOfflineMode();
  });

  // Game events
  socket.on('gameCreated', (data) => {
    gameId = data.gameId;
    gameSession = data.gameSession;
    currentPlayer = gameSession.players.find(p => p.id === socket.id);
    updateGameStatusBar();
    showPanel('lobby');
    setupLobby();
    showNotification(`Game created! Share ID: ${gameId}`, 'success');
  });

  socket.on('gameJoined', (data) => {
    gameId = data.gameId;
    gameSession = data.gameSession;
    currentPlayer = gameSession.players.find(p => p.id === socket.id);
    updateGameStatusBar();
    showPanel('lobby');
    setupLobby();
    showNotification(`Joined game ${gameId}!`, 'success');
  });

  socket.on('playerJoined', (data) => {
    gameSession = data.gameSession;
    updateLobbyDisplay();
    addLiveUpdate(`🎮 ${data.playerName} joined the game`);
    if (currentPlayer.isHost) {
      const startBtn = document.getElementById('start-game-btn');
      startBtn.disabled = gameSession.players.length < 2;
    }
  });

  socket.on('playerLeft', (data) => {
    gameSession = data.gameSession;
    updateLobbyDisplay();
    addLiveUpdate(`👋 ${data.playerName} left the game`);
  });

  socket.on('gameStarted', (data) => {
    gameSession = data.gameSession;
    currentSongIndex = 0;

    showPanel('game');
    setupGameInterface();

    if (currentPlayer.isHost) {
      playCurrentSong();
    }

    showNotification('Game started! Good luck!', 'success');
  });

  socket.on('gameStateUpdate', (data) => {
    gameSession = data.gameSession;
    updateGameDisplay();
  });

  socket.on('songChanged', (data) => {
    currentSongIndex = data.songIndex;
    gameSession.currentSong = data.songIndex;

    if (currentPlayer.isHost && data.songIndex < musicQuizSongs.length) {
      playCurrentSong();
    }

    // Clear previous guess
    document.getElementById('song-guess').value = '';
    updateGameDisplay();
  });

  socket.on('playerGuessed', (data) => {
    addLiveUpdate(`🎯 ${data.playerName} submitted a guess (${data.points} pts)`);

    // Update local game session
    const playerIndex = gameSession.players.findIndex(p => p.id === data.playerId);
    if (playerIndex !== -1) {
      gameSession.players[playerIndex] = data.player;
    }

    updateLiveScoreboard();
  });

  socket.on('answersRevealed', (data) => {
    addLiveUpdate(`📝 Answer: "${data.title}" by ${data.artist}`);
  });

  socket.on('gameEnded', (data) => {
    gameSession = data.gameSession;
    showMultiplayerResults();
  });

  socket.on('liveUpdate', (data) => {
    addLiveUpdate(data.message);
  });

  socket.on('error', (error) => {
    showNotification('Game error: ' + error.message, 'error');
  });
}

function updateConnectionStatus() {
  const statusIndicator = document.getElementById('connection-status');
  const detailedStatus = document.getElementById('detailed-connection-status');
  const connectionHelp = document.getElementById('connection-help');

  if (!statusIndicator) return;

  const statusColors = {
    'connected': '#4CAF50',
    'connecting': '#FF9800',
    'disconnected': '#f44336'
  };

  const statusTexts = {
    'connected': '🟢 Online',
    'connecting': '🟡 Connecting...',
    'disconnected': '🔴 Offline'
  };

  const detailedTexts = {
    'connected': '🟢 Connected to server - Multiplayer ready!',
    'connecting': '🟡 Connecting to server...',
    'disconnected': '🔴 Not connected to server - Offline mode only'
  };

  statusIndicator.style.color = statusColors[connectionStatus];
  statusIndicator.textContent = statusTexts[connectionStatus];

  if (detailedStatus) {
    detailedStatus.style.color = statusColors[connectionStatus];
    detailedStatus.textContent = detailedTexts[connectionStatus];
  }

  // Show/hide connection help
  if (connectionHelp) {
    if (connectionStatus === 'disconnected') {
      connectionHelp.style.display = 'block';
    } else {
      connectionHelp.style.display = 'none';
    }
  }
}

function testConnection() {
  const testBtn = document.getElementById('test-connection-btn');
  if (testBtn) {
    testBtn.textContent = '🔄 Testing...';
    testBtn.disabled = true;
  }

  showNotification('Testing server connection...', 'warning');

  // Disconnect existing socket if any
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  // Try to connect
  initializeSocket();

  // Check result after a few seconds
  setTimeout(() => {
    if (testBtn) {
      testBtn.textContent = '🔧 Test Connection';
      testBtn.disabled = false;
    }

    if (connectionStatus === 'connected') {
      showNotification('✅ Server connection successful! Multiplayer ready.', 'success');
    } else {
      showNotification('❌ Server connection failed. Check server setup instructions.', 'error');

      // Show detailed error info
      setTimeout(() => {
        showServerSetupInstructions();
      }, 1000);
    }
  }, 4000);
}

function showServerSetupInstructions() {
  const helpDiv = document.createElement('div');
  helpDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 25px;
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 600px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    border: 3px solid #2196f3;
  `;

  helpDiv.innerHTML = `
    <h3 style="color: #2196f3; margin-top: 0; display: flex; align-items: center;">
      🚀 Start Your Multiplayer Server
    </h3>

    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
      <p style="margin: 0; font-weight: bold; color: #666;">Quick Terminal Commands:</p>
      <div style="font-family: monospace; background: #333; color: #0f0; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 14px;">
mkdir music-quiz-server<br>
cd music-quiz-server<br>
npm init -y<br>
npm install socket.io express cors<br>
<span style="color: #ff0;"># Copy server.js from the artifacts</span><br>
node server.js
      </div>
    </div>

    <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #4CAF50;">
      <p style="margin: 0; font-weight: bold; color: #2e7d32;">✅ Success looks like:</p>
      <p style="margin: 5px 0; font-family: monospace; color: #555;">🎵 Music Quiz Server running on port 3001</p>
    </div>

    <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ff9800;">
      <p style="margin: 0; font-weight: bold; color: #f57c00;">⚠️ Current server URL:</p>
      <p style="margin: 5px 0; font-family: monospace; color: #555;">${SOCKET_CONFIG.serverUrl}</p>
      <p style="margin: 5px 0; font-size: 14px; color: #666;">Make sure your server is running on this address</p>
    </div>

    <div style="text-align: right; margin-top: 20px;">
      <button onclick="this.parentElement.parentElement.remove(); testConnection();" style="
        background: #2196f3;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        margin-left: 10px;
      ">🔄 Test Again</button>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #666;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        margin-left: 10px;
      ">Close</button>
    </div>
  `;

  document.body.appendChild(helpDiv);

  // Auto-remove after 30 seconds
  setTimeout(() => {
    if (helpDiv.parentElement) {
      helpDiv.remove();
    }
  }, 30000);
}

// Offline mode fallback (using localStorage as before)
let offlineMode = false;

function enableOfflineMode() {
  offlineMode = true;
  showNotification('Running in offline mode - limited to single device', 'warning');

  // Hide connection status or show offline indicator
  const statusIndicator = document.getElementById('connection-status');
  if (statusIndicator) {
    statusIndicator.textContent = '📴 Offline Mode';
    statusIndicator.style.color = '#666';
  }
}

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

// Game Session Management with Socket.IO
function createGameSession(hostName, settings) {
  if (!socket || !socket.connected) {
    if (offlineMode) {
      return createOfflineGame(hostName, settings);
    } else {
      throw new Error('Not connected to server. Please check your connection.');
    }
  }

  // Prepare songs data (metadata only, not the actual files)
  const songsMetadata = musicQuizSongs.map(({song, i}) => ({
    title: song.metadata.title,
    artist: song.metadata.artist,
    album: song.metadata.album,
    year: song.metadata.year,
    audioUrl: musicQuizSongsUrl[i] || '',
  }));

  socket.emit('createGame', {
    hostName: hostName,
    settings: settings,
    songsMetadata: songsMetadata
  });
}

function joinGameSession(gameId, playerName) {
  if (!socket || !socket.connected) {
    if (offlineMode) {
      throw new Error('Offline mode does not support joining games');
    } else {
      throw new Error('Not connected to server. Please check your connection.');
    }
  }

  socket.emit('joinGame', {
    gameId: gameId,
    playerName: playerName
  });
}

// Offline mode fallback functions
function createOfflineGame(hostName, settings) {
  gameId = generateGameId();

  gameSession = {
    id: gameId,
    host: hostName,
    settings: settings,
    players: [{
      id: 'offline-host',
      name: hostName,
      isHost: true,
      isReady: true,
      score: 0,
      answers: []
    }],
    state: 'lobby',
    currentSong: 0,
    songs: [],
    createdAt: Date.now()
  };

  currentPlayer = gameSession.players[0];
  return gameId;
}

function pollGameState() {
  // Not needed with Socket.IO - real-time updates
  // Keep for offline mode compatibility
  if (offlineMode && gameSession && gameId) {
    try {
      const savedGame = localStorage.getItem(`game_${gameId}`);
      if (savedGame) {
        const updatedSession = JSON.parse(savedGame);
        if (JSON.stringify(updatedSession) !== JSON.stringify(gameSession)) {
          gameSession = updatedSession;
          updateLobbyDisplay();
        }
      }
    } catch (error) {
      console.warn('Error polling game state:', error);
    }
  }
}

function updateGameState() {
  if (socket && socket.connected && gameSession) {
    // Send game state update via socket
    socket.emit('updateGameState', {
      gameId: gameId,
      gameSession: gameSession
    });
  } else if (offlineMode && gameSession && gameId) {
    // Fallback to localStorage for offline mode
    localStorage.setItem(`game_${gameId}`, JSON.stringify(gameSession));
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

// Multiplayer Game Functions with Socket.IO
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

  // Force initialize socket connection
  if (!socket || !socket.connected) {
    showNotification('Connecting to server...', 'warning');
    initializeSocket();

    // Wait a moment for connection, then try again
    setTimeout(() => {
      if (!socket || !socket.connected) {
        showNotification('Cannot connect to server. Creating offline game.', 'warning');
        createOfflineGameAndShow(hostName);
      } else {
        proceedWithGameCreation(hostName);
      }
    }, 2000);
    return;
  }
  proceedWithGameCreation(hostName);
}

async function proceedWithGameCreation(hostName) {
  const settings = {
    songsCount: parseInt(document.getElementById('songs-count').value),
    clipDuration: parseInt(document.getElementById('clip-duration').value),
    maxPlayers: parseInt(document.getElementById('max-players').value),
    autoplayEnabled: document.getElementById('autoplay-next').checked
  };

  // Prepare songs for the game
  const shuffled = [...musicFiles].sort(() => Math.random() - 0.5)
    .filter(music => !music.metadata.title.toLowerCase().includes("with audio description"));
  musicQuizSongs = shuffled.slice(0, settings.songsCount);

  try {

    // 2️⃣ Upload each file to the server
    const uploadPromises = musicQuizSongs.map(({file}) => {
      const form = new FormData();
      form.append('song', file);
      return fetch('http://localhost:3001/upload', {  // adjust URL if needed
        method: 'POST',
        body: form
      })
        .then(res => res.json())
        .then(json => json.url);
    });
    musicQuizSongsUrl = await Promise.all(uploadPromises);

    createGameSession(hostName, settings);

    // Save recent game
    saveRecentGame({
      id: gameId || 'pending',
      songs: settings.songsCount,
      date: new Date().toISOString()
    });

  } catch (error) {
    showNotification('Error creating game: ' + error.message, 'error');
    // Fallback to offline mode
    createOfflineGameAndShow(hostName);
  }
}

function createOfflineGameAndShow(hostName) {
  showNotification('⚠️ Server not available - Game created in offline mode (single device only)', 'warning');

  const settings = {
    songsCount: parseInt(document.getElementById('songs-count').value),
    clipDuration: parseInt(document.getElementById('clip-duration').value),
    maxPlayers: parseInt(document.getElementById('max-players').value),
    autoplayEnabled: document.getElementById('autoplay-next').checked
  };

  // Create offline game
  gameId = generateGameId();
  offlineMode = true;

  gameSession = {
    id: gameId,
    host: hostName,
    settings: settings,
    players: [{
      id: 'offline-host',
      name: hostName,
      isHost: true,
      isReady: true,
      score: 0,
      answers: []
    }],
    state: 'lobby',
    currentSong: 0,
    songs: [],
    createdAt: Date.now()
  };

  currentPlayer = gameSession.players[0];
  updateGameStatusBar();
  showPanel('lobby');
  setupLobby();

  showNotification(`Offline game created! ID: ${gameId} (Multiplayer disabled)`, 'warning');
}

function joinGame() {
  debugger
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

  // Check connection status first
  if (!socket || !socket.connected) {
    showNotification('Connecting to server...', 'warning');
    initializeSocket();

    // Wait for connection
    setTimeout(() => {
      if (!socket || !socket.connected) {
        showNotification('❌ Cannot connect to server! Make sure the server is running at: ' + SOCKET_CONFIG.serverUrl, 'error');
        showServerHelp();
      } else {
        // Connected, try to join
        attemptJoinGame(playerName, inputGameId);
      }
    }, 3000);
    return;
  }

  attemptJoinGame(playerName, inputGameId);
}

function attemptJoinGame(playerName, inputGameId) {
  try {
    joinGameSession(inputGameId, playerName);
    gameId = inputGameId;
    showNotification('Joining game...', 'warning');

  } catch (error) {
    showNotification('Error joining game: ' + error.message, 'error');

    if (error.message.includes('Not connected')) {
      showServerHelp();
    }
  }
}

function showServerHelp() {
  const helpMessage = `
🔧 To enable multiplayer, you need to start the Socket.IO server:

1️⃣ Open terminal/command prompt
2️⃣ Navigate to your server folder
3️⃣ Run: npm install
4️⃣ Run: npm start
5️⃣ Server should start on port 3001

Without the server, only offline single-device games work.
  `;

  // Create a temporary help modal
  const helpDiv = document.createElement('div');
  helpDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 500px;
    font-family: monospace;
    white-space: pre-line;
    border: 3px solid #f44336;
  `;

  helpDiv.innerHTML = `
    <h3 style="color: #f44336; margin-top: 0;">🚨 Server Required for Multiplayer</h3>
    <p style="line-height: 1.6;">${helpMessage}</p>
    <button onclick="this.parentElement.remove()" style="
      background: #f44336;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      float: right;
    ">Got it!</button>
    <div style="clear: both;"></div>
  `;

  document.body.appendChild(helpDiv);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (helpDiv.parentElement) {
      helpDiv.remove();
    }
  }, 10000);
}

function startMultiplayerGame() {
  console.log('startMultiplayerGame called:', {isHost: currentPlayer.isHost, gameSession: !!gameSession });

  if (!currentPlayer.isHost || !gameSession) {
    console.error('Cannot start game - not host or no game session');
    showNotification('You are not the host or game session is invalid!', 'error');
    return;
  }

  if (gameSession.players.length < 2 && !offlineMode) {
    showNotification('Need at least 2 players to start!', 'warning');
    return;
  }

  // Check if we have music loaded
  if (!musicQuizSongs || musicQuizSongs.length === 0) {
    showNotification('No music loaded! Please go back and load your music collection.', 'error');
    return;
  }

  try {
    console.log('Starting game with', gameSession.players.length, 'players and', musicQuizSongs.length, 'songs');

    // Prepare game data
    const gameData = {
      gameId: gameId,
      songsCount: gameSession.settings.songsCount,
      clipDuration: gameSession.settings.clipDuration,
      autoplayEnabled: gameSession.settings.autoplayEnabled,
      songs: musicQuizSongs.map(song => ({
        title: song.metadata.title,
        artist: song.metadata.artist,
        album: song.metadata.album
      }))
    };

    if (socket && socket.connected) {
      console.log('Sending startGame event via socket');
      // Send start game event via socket
      socket.emit('startGame', gameData);
    } else {
      console.log('Starting offline mode game');
      // Offline mode - handle locally
      gameSession.state = 'playing';
      gameSession.songs = gameData.songs;
      gameSession.currentSong = 0;

      currentSongIndex = 0;
      clipDuration = gameSession.settings.clipDuration;
      autoplayEnabled = gameSession.settings.autoplayEnabled;

      showPanel('game');
      setupGameInterface();

      if (currentPlayer.isHost) {
        playCurrentSong();
      }

      showNotification('Game started in offline mode!', 'warning');
    }

  } catch (error) {
    console.error('Error starting game:', error);
    showNotification('Error starting game: ' + error.message, 'error');
  }
}

function submitGuess() {
  const guess = document.getElementById('song-guess').value.trim();

  if (!guess) {
    showNotification('Please enter a guess!', 'warning');
    return;
  }

  if (!currentPlayer || !gameSession) return;

  // Calculate score (same logic as before)
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

  const guessData = {
    gameId: gameId,
    playerId: currentPlayer.id,
    playerName: currentPlayer.name,
    songIndex: gameSession.currentSong,
    guess: guess,
    points: points,
    accuracy: accuracy,
    timestamp: Date.now()
  };

  if (socket && socket.connected) {
    // Send guess via socket
    socket.emit('submitGuess', guessData);
  } else {
    // Offline mode - handle locally
    handleOfflineGuess(guessData);
  }

  document.getElementById('song-guess').value = '';
  showNotification(`Guess submitted! Scored ${points} points.`, points > 0 ? 'success' : 'warning');
}

function handleOfflineGuess(guessData) {
  // Update player's answer locally
  const playerIndex = gameSession.players.findIndex(p => p.id === currentPlayer.id);
  if (playerIndex !== -1) {
    // Remove any existing answer for this song
    gameSession.players[playerIndex].answers = gameSession.players[playerIndex].answers.filter(
      a => a.songIndex !== gameSession.currentSong
    );

    // Add new answer
    gameSession.players[playerIndex].answers.push(guessData);
    gameSession.players[playerIndex].score += guessData.points;

    currentPlayer = gameSession.players[playerIndex];
  }

  updateGameState();
  addLiveUpdate(`🎯 ${currentPlayer.name} guessed: "${guessData.guess}" (${guessData.points} pts)`);
}

function nextSong() {
  if (!currentPlayer.isHost) return;

  const nextSongData = {
    gameId: gameId,
    songIndex: gameSession.currentSong + 1
  };

  if (socket && socket.connected) {
    socket.emit('nextSong', nextSongData);
  } else {
    // Offline mode
    gameSession.currentSong++;
    currentSongIndex++;

    if (currentSongIndex >= musicQuizSongs.length) {
      finishGame();
    } else {
      document.getElementById('song-guess').value = '';
      setTimeout(() => {
        playCurrentSong();
      }, 1000);
    }
  }
}

function finishGame() {
  if (!currentPlayer.isHost) return;

  if (socket && socket.connected) {
    socket.emit('endGame', { gameId: gameId });
  } else {
    // Offline mode
    gameSession.state = 'finished';
    showMultiplayerResults();
  }
}

function leaveGame() {
  // Notify server if connected
  if (socket && socket.connected && gameId) {
    socket.emit('leaveGame', {
      gameId: gameId,
      playerId: currentPlayer?.id,
      playerName: currentPlayer?.name
    });
  }

  // Clean up local state
  cleanupGameState();

  // Update UI
  updateGameStatusBar();
  showPanel('home');

  showNotification('Left the game', 'warning');
}

function cleanupGameState() {
  // Clean up timers
  if (audioTimer) {
    clearInterval(audioTimer);
    audioTimer = null;
  }

  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }

  // Close any open modals
  forceHideScoreboard();

  // Reset state
  gameSession = null;
  currentPlayer = null;
  gameId = null;
}

function updateGameStatusBar() {
  if (gameSession && currentPlayer) {
    document.getElementById('game-status').classList.remove('hidden');
    document.getElementById('game-id-display').textContent = `Game ID: ${gameSession.id}`;
    document.getElementById('player-role').textContent = `Role: ${currentPlayer.isHost ? 'Host' : 'Player'}`;
    document.getElementById('player-count').textContent = `Players: ${gameSession.players.length}/${gameSession.settings.maxPlayers}`;
    document.getElementById('leave-btn').style.display = 'inline-block';

    if (currentPlayer.isHost) {
      document.getElementById('share-btn').style.display = 'inline-block';
    }
  } else {
    document.getElementById('game-status').classList.add('hidden');
    document.getElementById('leave-btn').style.display = 'none';
  }
}

function setupLobby() {
  if (!gameSession) {
    console.error('setupLobby called without gameSession');
    return;
  }

  document.getElementById('lobby-game-id').textContent = `Game ID: ${gameSession.id}`;
  document.getElementById('lobby-settings').textContent =
    `Settings: ${gameSession.settings.songsCount} songs, ${gameSession.settings.clipDuration} seconds each`;

  // Debug logging
  console.log('Setting up lobby:', {
    isHost: currentPlayer.isHost,
    currentPlayer: currentPlayer,
    gameSession: gameSession
  });

  const hostControls = document.getElementById('host-controls');
  const playerControls = document.getElementById('player-controls');

  if (currentPlayer.isHost) {
    console.log('Showing host controls for:', currentPlayer?.name);
    hostControls.style.display = 'block';
    playerControls.style.display = 'none';
  } else {
    console.log('Showing player controls for:', currentPlayer?.name);
    hostControls.style.display = 'none';
    playerControls.style.display = 'block';
  }

  updateLobbyDisplay();
}

function updateLobbyDisplay() {
  if (!gameSession) {
    console.error('updateLobbyDisplay called without gameSession');
    return;
  }

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

  // Update start button for host
  if (currentPlayer.isHost) {
    const hostControl = document.getElementById('host-controls');
    if (hostControl){
      const startBtn = document.getElementById('start-game-btn');
      if (startBtn) {
        const canStart = gameSession.players.length >= 2;
        hostControl.style.display = canStart ? 'block' : 'none';
        startBtn.disabled = !canStart;
        startBtn.textContent = canStart ? '🚀 Start Game' : `🚀 Need ${2 - gameSession.players.length} more player(s)`;

        console.log('Start button updated:', {
          canStart: canStart,
          playerCount: gameSession.players.length,
          buttonText: startBtn.textContent
        });
      } else {
        console.error('Start game button not found in DOM');
      }
    }
    else {
      console.error('Cannot find host-controls element');
    }
  }
}

// Debug function to check game state - can be called from browser console
function debugGameState() {
  console.log('=== GAME DEBUG INFO ===');
  console.log('isHost:', currentPlayer.isHost);
  console.log('currentPlayer:', currentPlayer);
  console.log('gameSession:', gameSession);
  console.log('gameId:', gameId);
  console.log('connectionStatus:', connectionStatus);

  const hostControls = document.getElementById('host-controls');
  const playerControls = document.getElementById('player-controls');
  console.log('Host controls display:', hostControls?.style.display);
  console.log('Player controls display:', playerControls?.style.display);

  if (gameSession && gameSession.players) {
    console.log('Players:');
    gameSession.players.forEach((player, index) => {
      console.log(`  ${index}: ${player.name} - Host: ${player.isHost} - Ready: ${player.isReady}`);
    });
  }
  console.log('======================');
}

// Make debug function available globally
window.debugGameState = debugGameState;

function setupGameInterface() {
  document.getElementById('total-songs').textContent = gameSession.settings.songsCount;

  if (currentPlayer.isHost) {
    document.getElementById('host-music-player').style.display = 'block';
    document.getElementById('non-host-music-player').style.display = 'none';
  } else {
    document.getElementById('host-music-player').style.display = 'none';
    document.getElementById('non-host-music-player').style.display = 'block';
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

async function playCurrentSong() {
  if (!currentPlayer.isHost || currentSongIndex >= musicQuizSongs.length) {
    finishGame();
    return;
  }

  // const songObj = musicQuizSongs[currentSongIndex];
  const audioElement = document.getElementById('music-audio');
  const playerAudioElement = document.getElementById('non-host-audio');

  try {
    audioElement.src = musicQuizSongsUrl[currentSongIndex];
    await Promise.race([
      new Promise((resolve, reject) => {
        if(currentPlayer.isHost) {
          audioElement.addEventListener('loadedmetadata', resolve, { once: true });
          audioElement.addEventListener('loadedmetadata', resolve, { once: true });
        }
        else {
          playerAudioElement.addEventListener('error', reject, { once: true });
          playerAudioElement.addEventListener('error', reject, { once: true });
        }
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

function playSong(song) {
  const audioEl = document.getElementById('quiz-audio');
  if (!audioEl) return;
  audioEl.src = song.audioUrl;      // use the URL we uploaded
  audioEl.currentTime = 0;
  audioEl.play().catch(e => console.warn('Autoplay prevented', e));
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
        if (currentPlayer.isHost) {
          showAnswers();
        }
      }, 2000);
    }
  };

  updateTimer();
  audioTimer = setInterval(updateTimer, 100);
}

function skipPersonalGuess() {
  document.getElementById('song-guess').value = '';
  showNotification('Skipped this song', 'warning');
  addLiveUpdate(`⏭️ ${currentPlayer.name} skipped this song`);
}

function showAnswers() {
  if (!currentPlayer.isHost) return;

  const currentSong = gameSession.songs[gameSession.currentSong];
  addLiveUpdate(`📝 Answer: "${currentSong.title}" by ${currentSong.artist}`);

  // Wait a moment then advance to next song
  setTimeout(() => {
    nextSong();
  }, 3000);
}

function skipSong() {
  if (!currentPlayer.isHost) return;

  addLiveUpdate(`⏭️ Host skipped song ${gameSession.currentSong + 1}`);
  nextSong();
}

function replayClip() {
  if (!currentPlayer.currentPlayer.isHost) return;

  const audioElement = document.getElementById('music-audio');
  audioElement.currentTime = clipStartTime;

  if (audioTimer) clearInterval(audioTimer);

  audioElement.play().then(() => {
    setupAudioTimer();
    addLiveUpdate(`🔄 Host replayed the clip`);
  });
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
  if (currentPlayer.isHost) {
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
  if (!currentPlayer.isHost) return;

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

  showNotification('Game reset! Configure settings and start again.', 'success');
}

// Emergency reset function - can be called from the browser console if stuck
function emergencyReset() {
  // Close all modals
  emergencyCloseAllModals();

  // Stop all timers
  if (audioTimer) clearInterval(audioTimer);
  if (autoplayCountdown) clearTimeout(autoplayCountdown);

  // Reset all state
  gameSession = null;
  currentPlayer = null;
  gameId = null;

  // Go back to home
  showPanel('home');
  updateGameStatusBar();

  showNotification('Emergency reset completed!', 'success');
}

// Force lobby refresh - can be called from browser console
function forceLobbyRefresh() {
  if (!gameSession) {
    showNotification('No active game session to refresh', 'warning');
    return;
  }

  console.log('Forcing lobby refresh...');
  setupLobby();
  showNotification('Lobby refreshed!', 'success');
}

// Manual host controls fix - can be called from browser console
function forceHostControls() {
  if (!gameSession) {
    showNotification('No active game session', 'warning');
    return;
  }

  currentPlayer = gameSession.players.find(p => p.isHost) || gameSession.players[0];
  if (currentPlayer) {
    currentPlayer.isHost = true;
  }

  setupLobby();
  showNotification('Host controls forced!', 'success');
}

// Make emergency functions available globally
window.emergencyReset = emergencyReset;
window.forceLobbyRefresh = forceLobbyRefresh;
window.forceHostControls = forceHostControls;

// Make sure these functions exist for the new UI
function updateSongCounter() {
  // This function is called but functionality is handled in updateGameDisplay
}

function handleMusicSubmit() {
  submitGuess();
}
