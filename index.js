// Game state
let questions = [];
let gameQuestions = [];
let currentQuestionIndex = 0;
let gameSettings = { questionsPerGame: 10 };
let gameAnswers = [];
let timer = null;
let timeLeft = 60;

// Music Quiz state - UPDATED with autoplay variables
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

// Font size functionality
function setFontSize(size) {
  const validSizes = ['small', 'normal', 'large', 'xlarge'];
  if (!validSizes.includes(size)) {
    console.warn('Invalid font size:', size);
    return;
  }

  // Set the data attribute on body
  document.body.setAttribute('data-font-size', size);

  // Save preference
  try {
    localStorage.setItem('familyQuizFontSize', size);
  } catch (error) {
    console.warn('Could not save font size preference:', error);
  }

  // Show notification
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
    const savedSize = localStorage.getItem('familyQuizFontSize');
    if (savedSize && ['small', 'normal', 'large', 'xlarge'].includes(savedSize)) {
      document.body.setAttribute('data-font-size', savedSize);
    } else {
      // Default to normal
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
  loadFontSizePreference(); // Load font size first
  updateGameSettings();
  updateQuestionsDisplay();
  showPanel('welcome');
});

function showPanel(panelName) {
  const panels = ['welcome-panel', 'admin-panel', 'game-panel', 'results-panel', 'music-panel'];
  panels.forEach(panel => {
    document.getElementById(panel).classList.add('hidden');
  });
  document.getElementById(panelName + '-panel').classList.remove('hidden');

  if (panelName === 'welcome') {
    updateWelcomeStats();
  } else if (panelName === 'music') {
    initializeMusicQuiz();
  }
}

function updateWelcomeStats() {
  document.getElementById('total-questions').textContent = questions.length;
  document.getElementById('questions-per-game').textContent = gameSettings.questionsPerGame;
}

function updateGameSettings() {
  gameSettings.questionsPerGame = parseInt(document.getElementById('questions-count').value);
  updateWelcomeStats();
}

function updateQuestionForm() {
  const questionType = document.getElementById('question-type').value;
  const pictureUpload = document.getElementById('picture-upload');
  const optionsSection = document.getElementById('options-section');

  if (questionType === 'picture') {
    pictureUpload.classList.remove('hidden');
    optionsSection.classList.remove('hidden');
  } else if (questionType === 'open-ended') {
    pictureUpload.classList.add('hidden');
    optionsSection.classList.add('hidden');
  } else {
    pictureUpload.classList.add('hidden');
    optionsSection.classList.remove('hidden');
  }
}

function previewImage() {
  const input = document.getElementById('question-image');
  const preview = document.getElementById('image-preview');

  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      preview.src = e.target.result;
      preview.classList.remove('hidden');
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function exportQuestions() {
  if (questions.length === 0) {
    showNotification('No questions to export!', 'warning');
    return;
  }

  try {
    const exportData = {
      gameSettings: gameSettings,
      questions: questions,
      exportDate: new Date().toISOString(),
      version: '1.0',
      totalQuestions: questions.length
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `family-quiz-questions-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification(`Successfully exported ${questions.length} questions with images!`);
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Error exporting questions. Please try again.', 'error');
  }
}

async function importQuestions(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Show loading notification
  showNotification('Importing questions...', 'warning');

  try {
    const fileContent = await window.fs.readFile(file.name, { encoding: 'utf8' });
    const importData = JSON.parse(fileContent);

    // Validate the imported data
    if (!importData.questions || !Array.isArray(importData.questions)) {
      throw new Error('Invalid file format: questions array not found');
    }

    // Validate each question structure
    const validQuestions = importData.questions.filter(question => {
      return question.text &&
        question.type &&
        ['multiple-choice', 'picture', 'open-ended'].includes(question.type);
    });

    if (validQuestions.length === 0) {
      throw new Error('No valid questions found in the file');
    }

    // Ask user if they want to replace or append
    const shouldReplace = confirm(
      `Found ${validQuestions.length} valid questions in the file.\n\n` +
      `Current questions: ${questions.length}\n\n` +
      `Click OK to REPLACE current questions\n` +
      `Click Cancel to ADD to existing questions`
    );

    if (shouldReplace) {
      questions = [];
    }

    // Import questions with new IDs to avoid conflicts
    let importedCount = 0;
    validQuestions.forEach(question => {
      const newQuestion = {
        ...question,
        id: Date.now() + Math.random() + importedCount // Ensure unique ID
      };
      questions.push(newQuestion);
      importedCount++;
    });

    // Import game settings if available
    if (importData.gameSettings && importData.gameSettings.questionsPerGame) {
      gameSettings.questionsPerGame = importData.gameSettings.questionsPerGame;
      document.getElementById('questions-count').value = gameSettings.questionsPerGame;
    }

    updateQuestionsDisplay();
    updateWelcomeStats();

    const action = shouldReplace ? 'replaced with' : 'added';
    showNotification(`Successfully ${action} ${validQuestions.length} questions with images!`);

  } catch (error) {
    console.error('Import error:', error);
    let errorMessage = 'Error importing questions. ';

    if (error.message.includes('JSON')) {
      errorMessage += 'File is not valid JSON format.';
    } else if (error.message.includes('questions array')) {
      errorMessage += 'File does not contain valid questions data.';
    } else {
      errorMessage += error.message;
    }

    showNotification(errorMessage, 'error');
  }

  // Reset the file input
  event.target.value = '';
}

function addQuestion() {
  const questionType = document.getElementById('question-type').value;
  const questionText = document.getElementById('question-text').value.trim();

  if (!questionText) {
    showNotification('Please enter a question.', 'warning');
    return;
  }

  const question = {
    id: Date.now(),
    type: questionType,
    text: questionText,
    image: null,
    options: [],
    correctAnswer: null
  };

  // Handle image for picture questions
  if (questionType === 'picture') {
    const imagePreview = document.getElementById('image-preview');
    if (imagePreview.src && !imagePreview.classList.contains('hidden')) {
      question.image = imagePreview.src;
    }
  }

  // Handle options for multiple choice and picture questions
  if (questionType !== 'open-ended') {
    const options = [];
    let correctAnswer = null;

    for (let i = 0; i < 4; i++) {
      const optionText = document.getElementById(`option-${i}`).value.trim();
      if (optionText) {
        options.push(optionText);
        if (document.getElementById(`option-${i}-radio`).checked) {
          correctAnswer = options.length - 1;
        }
      }
    }

    if (options.length < 2) {
      showNotification('Please provide at least 2 answer options.', 'warning');
      return;
    }

    if (correctAnswer === null) {
      showNotification('Please select the correct answer.', 'warning');
      return;
    }

    question.options = options;
    question.correctAnswer = correctAnswer;
  }

  questions.push(question);
  clearQuestionForm();
  updateQuestionsDisplay();
  updateWelcomeStats();
  showNotification(`Question added successfully! Total: ${questions.length}`);
}

function clearQuestionForm() {
  document.getElementById('question-text').value = '';
  document.getElementById('question-image').value = '';
  document.getElementById('image-preview').classList.add('hidden');

  for (let i = 0; i < 4; i++) {
    document.getElementById(`option-${i}`).value = '';
    document.getElementById(`option-${i}-radio`).checked = false;
  }
}

function updateQuestionsDisplay() {
  const container = document.getElementById('questions-list');
  if (questions.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666;">No questions added yet.</p>';
    return;
  }

  container.innerHTML = '<h3>Added Questions:</h3>';
  questions.forEach((question, index) => {
    const questionDiv = document.createElement('div');
    questionDiv.className = 'result-item';
    questionDiv.innerHTML = `
            <strong>Question ${index + 1}:</strong> ${question.text}<br>
            <small>Type: ${question.type.replace('-', ' ')}</small>
            ${question.options.length > 0 ? '<br><small>Correct Answer: ' + question.options[question.correctAnswer] + '</small>' : ''}
            <button class="btn btn-danger" onclick="deleteQuestion(${index})" style="float: right; padding: 5px 10px; font-size: 12px;">Delete</button>
        `;
    container.appendChild(questionDiv);
  });
}

function deleteQuestion(index) {
  questions.splice(index, 1);
  updateQuestionsDisplay();
  updateWelcomeStats();
}

function clearAllQuestions() {
  if (questions.length === 0) {
    showNotification('No questions to clear.', 'warning');
    return;
  }

  if (confirm('Are you sure you want to delete all questions?')) {
    const count = questions.length;
    questions = [];
    updateQuestionsDisplay();
    updateWelcomeStats();
    showNotification(`Deleted ${count} questions.`);
  }
}

function startGame() {
  if (questions.length === 0) {
    showNotification('Please add some questions first!', 'warning');
    showPanel('admin');
    return;
  }

  // Shuffle questions and select the configured number
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  gameQuestions = shuffled.slice(0, Math.min(gameSettings.questionsPerGame, questions.length));

  currentQuestionIndex = 0;
  gameAnswers = [];

  document.getElementById('total-game-questions').textContent = gameQuestions.length;

  showPanel('game');
  displayQuestion();
  showNotification(`Game started with ${gameQuestions.length} questions!`);
}

function displayQuestion() {
  if (currentQuestionIndex >= gameQuestions.length) {
    showResults();
    return;
  }

  const question = gameQuestions[currentQuestionIndex];

  // Update progress
  const progress = ((currentQuestionIndex) / gameQuestions.length) * 100;
  document.getElementById('progress-fill').style.width = progress + '%';
  document.getElementById('current-question-num').textContent = currentQuestionIndex + 1;

  // Display question
  document.getElementById('game-question-text').textContent = question.text;

  // Handle image
  const imageElement = document.getElementById('game-question-image');
  if (question.image) {
    imageElement.src = question.image;
    imageElement.classList.remove('hidden');
  } else {
    imageElement.classList.add('hidden');
  }

  // Handle answer options
  const optionsContainer = document.getElementById('game-answer-options');
  const textAnswer = document.getElementById('game-text-answer');

  if (question.type === 'open-ended') {
    optionsContainer.style.display = 'none';
    textAnswer.classList.remove('hidden');
    textAnswer.value = '';
  } else {
    optionsContainer.style.display = 'grid';
    textAnswer.classList.add('hidden');

    optionsContainer.innerHTML = '';
    question.options.forEach((option, index) => {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'answer-option';
      optionDiv.textContent = option;
      optionDiv.onclick = () => selectOption(index);
      optionsContainer.appendChild(optionDiv);
    });
  }

  // Start timer
  startTimer();
}

function selectOption(index) {
  const options = document.querySelectorAll('.answer-option');
  options.forEach(option => option.classList.remove('selected'));
  options[index].classList.add('selected');
}

function startTimer() {
  timeLeft = 60;
  updateTimerDisplay();

  timer = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();

    if (timeLeft <= 0) {
      clearInterval(timer);
      nextQuestion();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const timerElement = document.getElementById('timer');
  timerElement.textContent = timeLeft;

  timerElement.className = 'timer';
  if (timeLeft <= 10) {
    timerElement.classList.add('danger');
  } else if (timeLeft <= 20) {
    timerElement.classList.add('warning');
  }
}

function nextQuestion() {
  if (timer) {
    clearInterval(timer);
  }

  // Save answer
  const question = gameQuestions[currentQuestionIndex];
  let userAnswer = null;
  let isCorrect = false;

  if (question?.type === 'open-ended') {
    userAnswer = document.getElementById('game-text-answer').value.trim();
  } else {
    const selectedOption = document.querySelector('.answer-option.selected');
    if (selectedOption) {
      const options = document.querySelectorAll('.answer-option');
      userAnswer = Array.from(options).indexOf(selectedOption);
      isCorrect = userAnswer === question.correctAnswer;
    }
  }

  gameAnswers.push({
    question: question,
    userAnswer: userAnswer,
    isCorrect: isCorrect,
    timeTaken: 60 - timeLeft
  });

  currentQuestionIndex++;
  displayQuestion();
}

function skipQuestion() {
  nextQuestion();
}

function showResults() {
  showPanel('results');

  const correctAnswers = gameAnswers.filter(answer => answer.isCorrect).length;
  const totalQuestions = gameAnswers.length;
  const score = Math.round((correctAnswers / totalQuestions) * 100);

  document.getElementById('results-summary').innerHTML = `
        <strong>Score: ${correctAnswers}/${totalQuestions} (${score}%)</strong>
    `;

  const container = document.getElementById('results-container');
  container.innerHTML = '';

  gameAnswers.forEach((answer, index) => {
    const resultDiv = document.createElement('div');
    resultDiv.className = `result-item ${answer.isCorrect ? '' : 'incorrect'}`;

    let answerText = '';
    if (answer.question.type === 'open-ended') {
      answerText = `Your answer: "${answer.userAnswer || 'No answer'}"`;
    } else {
      const userAnswerText = answer.userAnswer !== null ? answer.question.options[answer.userAnswer] : 'No answer';
      const correctAnswerText = answer.question.options[answer.question.correctAnswer];
      answerText = `Your answer: ${userAnswerText}<br>Correct answer: ${correctAnswerText}`;
    }

    resultDiv.innerHTML = `
            <strong>Question ${index + 1}:</strong> ${answer.question.text}<br>
            ${answerText}<br>
            <small>Time taken: ${answer.timeTaken} seconds | ${answer.isCorrect ? '✅ Correct' : '❌ Incorrect'}</small>
        `;
    container.appendChild(resultDiv);
  });
}

// =============================================================================
// MUSIC QUIZ FUNCTIONS - REFACTORED WITH AUTOPLAY
// =============================================================================

function initializeMusicQuiz() {
  // Reset music quiz state - UPDATED with autoplay
  musicFiles = [];
  musicQuizSongs = [];
  currentSongIndex = 0;
  musicAnswers = [];
  autoplayEnabled = true;

  // Clear any existing timers
  if (audioTimer) {
    clearInterval(audioTimer);
    audioTimer = null;
  }
  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }

  // Show upload section, hide others
  document.getElementById('music-upload-section').classList.remove('hidden');
  document.getElementById('music-setup-section').classList.add('hidden');
  document.getElementById('music-game-section').classList.add('hidden');
  document.getElementById('music-results-section').classList.add('hidden');

  // Clear file list and any autoplay indicators
  document.getElementById('music-file-list').innerHTML = '';
  removeAutoplayCountdown();

  // Remove autoplay indicator if it exists
  const indicator = document.getElementById('autoplay-indicator');
  if (indicator) {
    indicator.remove();
  }

  // Remove music collection status if it exists
  const statusIndicator = document.getElementById('music-collection-status');
  if (statusIndicator) {
    statusIndicator.remove();
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

  // Extract folder path from the first file
  const firstFile = files[0];
  const folderPath = firstFile.webkitRelativePath.split('/')[0];

  processMusicFiles(files, folderPath);
}

function processMusicFiles(files, source) {
  // Filter for audio files
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

  // Extract metadata from MP3 files
  extractMusicMetadata(audioFiles, source)
}

async function extractMusicMetadata(files, source) {
  showNotification('📊 Reading music metadata...', 'warning');

  const filesWithMetadata = [];
  let processed = 0;

  // Show progress during metadata extraction
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

    // Update progress
    const progress = (processed / files.length) * 100;
    const progressBar = document.getElementById('metadata-progress');
    const statusText = document.getElementById('metadata-status');

    if (progressBar) progressBar.style.width = progress + '%';
    if (statusText) statusText.textContent = `Processing file ${processed} of ${files.length}`;
  }

  // Store the files with metadata
  musicFiles = filesWithMetadata;

  displayMusicFileList(source);
  document.getElementById('music-setup-section').classList.remove('hidden');

  // Add status indicator for the loaded collection
  addMusicCollectionStatus();

  const message = source.includes('/') || source === 'manual selection'
    ? `Loaded ${filesWithMetadata.length} audio files with metadata!`
    : `Loaded ${filesWithMetadata.length} audio files from "${source}" folder!`;

  showNotification(message);
}

function extractSingleFileMetadata(file) {
  return new Promise((resolve, reject) => {
    if (typeof jsmediatags === 'undefined') {
      // Fallback if jsmediatags is not available
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
        // Use filename as fallback
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

  // Create folder stats section
  let folderInfo = '';
  if (source !== 'manual selection') {
    const folderStats = analyzeFolderStructure();
    folderInfo = `
            <div class="folder-stats">
                <h4>📁 Folder: ${source}</h4>
                <p><strong>${musicFiles.length}</strong> audio files found</p>
                ${folderStats.subfolders > 0 ? `<p>📂 ${folderStats.subfolders} subfolders included</p>` : ''}
                <div class="folder-path">${folderStats.totalSize}</div>
            </div>
        `;
  }

  container.innerHTML = folderInfo + `<div class="file-list-header"><strong>${musicFiles.length} Audio Files with Metadata:</strong></div>`;

  // Group files by folder if they come from different directories
  const filesByFolder = {};

  musicFiles.forEach(fileObj => {
    const file = fileObj.file || fileObj; // Handle both old and new format
    const folder = file.webkitRelativePath ?
      file.webkitRelativePath.split('/').slice(0, -1).join('/') || 'Root' :
      'Selected Files';

    if (!filesByFolder[folder]) {
      filesByFolder[folder] = [];
    }
    filesByFolder[folder].push(fileObj);
  });

  // Display files organized by folder
  Object.keys(filesByFolder).forEach(folder => {
    if (Object.keys(filesByFolder).length > 1) {
      const folderDiv = document.createElement('div');
      folderDiv.className = 'folder-header';
      folderDiv.innerHTML = `<h5 style="margin: 15px 0 5px 0; color: #555;">📂 ${folder}</h5>`;
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
      moreDiv.innerHTML = `<p style="text-align: center; color: #666; font-style: italic;">... and ${filesByFolder[folder].length - 10} more files in this folder</p>`;
      container.appendChild(moreDiv);
    }
  });
}

// UPDATED startMusicQuiz with autoplay
function startMusicQuiz() {
  if (musicFiles.length === 0) {
    showNotification('Please select MP3 files first!', 'warning');
    return;
  }

  const songsCount = parseInt(document.getElementById('songs-count').value);
  clipDuration = parseInt(document.getElementById('clip-duration').value);
  autoplayEnabled = document.getElementById('autoplay-next').checked;

  if (musicFiles.length < songsCount) {
    showNotification(`You need at least ${songsCount} MP3 files for this quiz!`, 'warning');
    return;
  }

  // Shuffle and select songs - ensure we're working with the right data structure
  const shuffled = [...musicFiles].sort(() => Math.random() - 0.5)
    .filter(music => !music.metadata.title.toLowerCase().includes("with audio description"));
  musicQuizSongs = shuffled.slice(0, songsCount);

  currentSongIndex = 0;
  musicAnswers = [];

  document.getElementById('total-songs').textContent = musicQuizSongs.length;

  // Hide setup, show game
  document.getElementById('music-setup-section').classList.add('hidden');
  document.getElementById('music-upload-section').classList.add('hidden');
  document.getElementById('music-game-section').classList.remove('hidden');

  // Add autoplay indicator if enabled
  if (autoplayEnabled) {
    addAutoplayIndicator();
  }

  playCurrentSong()
    .then(r => {
      showNotification(`Music quiz started with ${musicQuizSongs.length} songs! ${autoplayEnabled ? '(Autoplay enabled)' : ''}`);
    });
}

async function playCurrentSong() {
  if (currentSongIndex >= musicQuizSongs.length) {
    showMusicResults();
    return;
  }

  const songObj = musicQuizSongs[currentSongIndex];
  const song = songObj.file || songObj; // Handle both old and new format
  const metadata = songObj.metadata || {};
  const audioElement = document.getElementById('music-audio');
  const isLastSong = currentSongIndex >= musicQuizSongs.length - 1;

  // Clear any existing timers from previous song
  if (audioTimer) {
    clearInterval(audioTimer);
    audioTimer = null;
  }
  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }
  removeAutoplayCountdown();

  // Update progress bar
  const progress = (currentSongIndex / musicQuizSongs.length) * 100;
  document.getElementById('music-progress-fill').style.width = progress + '%';

  // Update song counter using helper function
  updateSongCounter();

  // Show notification for final song
  if (isLastSong) {
    showNotification('🏁 Final song! Results will show automatically when finished.', 'warning');
  }

  // Clear previous guess
  document.getElementById('song-guess').value = '';

  try {
    // Create audio URL
    const audioUrl = URL.createObjectURL(song);
    audioElement.src = audioUrl;

    // Wait for audio to load with timeout
    await Promise.race([
      new Promise((resolve, reject) => {
        audioElement.addEventListener('loadedmetadata', resolve, { once: true });
        audioElement.addEventListener('error', reject, { once: true });
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Audio loading timeout')), 10000))
    ]);

    // Calculate random start time (avoid first and last 10 seconds)
    const duration = audioElement.duration;
    const maxStartTime = Math.max(0, duration - clipDuration - 10);
    clipStartTime = Math.random() * maxStartTime + 10;
    // Set up audio playback
    audioElement.currentTime = clipStartTime;

    // Start playing and then set up timer
    await audioElement.play();
    setupAudioTimer();

    const trackInfo = metadata.title ? `${metadata.title} by ${metadata.artist}` : song.name;

  } catch (error) {
    console.error('Error loading/playing audio:', error);
    showNotification('Error loading audio file. Skipping...', 'error');

    // Auto-skip to next song after a short delay
    setTimeout(() => {
      if (isLastSong) {
        submitMusicGuessAndFinish();
      } else {
        skipSong();
      }
    }, 1000);
  }
}

// UPDATED setupAudioTimer with automatic results for last song
function setupAudioTimer() {
  const audioElement = document.getElementById('music-audio');
  const timerElement = document.getElementById('audio-timer');

  // Clear existing timers
  if (audioTimer) {
    clearInterval(audioTimer);
  }
  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
  }

  // Remove any existing countdown indicator
  removeAutoplayCountdown();

  // Track if autoplay has already been triggered for this song
  let autoplayTriggered = false;

  // Check if this is the last song
  const isLastSong = currentSongIndex >= musicQuizSongs.length - 1;

  // Update timer display
  const updateTimer = () => {
    const currentTime = audioElement.currentTime - clipStartTime;
    const remaining = Math.max(0, clipDuration - currentTime);

    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    timerElement.textContent = `${formatTime(currentTime)} / ${formatTime(clipDuration)}`;

    // Check if clip duration has been reached (with small tolerance for timing precision)
    if (currentTime >= (clipDuration - 0.1) && !autoplayTriggered) {
      audioElement.pause();
      clearInterval(audioTimer);
      autoplayTriggered = true;

      // Handle end of clip
      if (isLastSong) {
        // Last song - auto-submit and show results immediately
        setTimeout(() => {
          submitMusicGuessAndFinish();
        }, 500); // Small delay for better UX
      } else if (autoplayEnabled) {
        // Not last song and autoplay enabled - show countdown
        setTimeout(() => {
          showAutoplayCountdown();
        }, 100);
      } else {
        // Not last song and autoplay disabled - just wait for user action
        console.log('Clip finished, waiting for user action');
      }
    }
  };

  // Update immediately and then every 100ms
  updateTimer();
  audioTimer = setInterval(updateTimer, 100);

  // Backup timeout to ensure clip stops (with small buffer for precision)
  setTimeout(() => {
    if (!autoplayTriggered) {
      audioElement.pause();
      if (audioTimer) {
        clearInterval(audioTimer);
      }
      autoplayTriggered = true;

      console.log(`Backup timeout triggered. Last song: ${isLastSong}, Autoplay enabled: ${autoplayEnabled}`);

      // Handle end of clip
      if (isLastSong) {
        // Last song - auto-submit and show results immediately
        setTimeout(() => {
          console.log('Last song finished (backup) - auto-submitting and showing results');
          submitMusicGuessAndFinish();
        }, 500);
      } else if (autoplayEnabled) {
        // Not last song and autoplay enabled - show countdown
        setTimeout(() => {
          showAutoplayCountdown();
        }, 100);
      }
    }
  }, (clipDuration + 0.2) * 1000); // Add 200ms buffer
}

// NEW AUTOPLAY FUNCTIONS
function addAutoplayIndicator() {
  const musicPlayer = document.querySelector('.music-player');

  // Check if the indicator already exists
  if (document.getElementById('autoplay-indicator')) {
    return;
  }

  const indicator = document.createElement('div');
  indicator.id = 'autoplay-indicator';
  indicator.className = 'autoplay-indicator';
  indicator.innerHTML = '🎵 Autoplay enabled - Songs will advance automatically after each clip';

  musicPlayer.insertBefore(indicator, musicPlayer.firstChild);
}

function showAutoplayCountdown() {
  // Prevent multiple countdowns for the same song
  if (autoplayCountdown) {
    console.log('Autoplay countdown already in progress, skipping...');
    return;
  }

  // Check if we're at the end of the quiz
  const isLastSong = currentSongIndex >= musicQuizSongs.length - 1;

  if (isLastSong) {
    console.log('Last song reached, auto-finishing instead of countdown');
    // For the last song, just finish immediately instead of countdown
    setTimeout(() => {
      submitMusicGuessAndFinish();
    }, 1000);
    return;
  }

  const countdownTime = 3; // 3-second countdown

  // Create a countdown display
  const musicPlayer = document.querySelector('.music-player');
  const existingCountdown = document.getElementById('autoplay-countdown');

  if (existingCountdown) {
    existingCountdown.remove();
  }

  const countdownDiv = document.createElement('div');
  countdownDiv.id = 'autoplay-countdown';
  countdownDiv.className = 'autoplay-countdown';

  let timeLeft = countdownTime;
  const updateCountdownDisplay = () => {
    countdownDiv.innerHTML = `🎵 Auto-advancing to next song in ${timeLeft} seconds... <button class="btn btn-small" onclick="cancelAutoplay()" style="margin-left: 10px;">Cancel</button>`;
  };

  updateCountdownDisplay();

  // Insert after the audio controls
  const audioControls = document.querySelector('.audio-controls');
  if (audioControls) {
    audioControls.parentNode.insertBefore(countdownDiv, audioControls.nextSibling);
  }

  // Start countdown interval
  const countdownInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft > 0) {
      updateCountdownDisplay();
    } else {
      clearInterval(countdownInterval);
      // Auto-submit the current guess (or empty guess)
      console.log('Autoplay triggered - advancing to next song');
      submitMusicGuess();
    }
  }, 1000);

  // Store countdown reference for potential cancellation
  autoplayCountdown = setTimeout(() => {
    // This is a backup in case the interval doesn't work
    clearInterval(countdownInterval);
    if (document.getElementById('autoplay-countdown')) {
      console.log('Autoplay backup timeout triggered');
      submitMusicGuess();
    }
  }, (countdownTime + 0.5) * 1000); // Add small buffer

  console.log('Autoplay countdown started for', countdownTime, 'seconds');
}

function cancelAutoplay() {
  console.log('Autoplay cancelled by user');

  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }

  // Clear any countdown intervals that might still be running
  const countdownDiv = document.getElementById('autoplay-countdown');
  if (countdownDiv) {
    // Find and clear any intervals associated with this countdown
    // This is a safety measure to prevent multiple intervals
    countdownDiv.style.display = 'none';
  }

  removeAutoplayCountdown();
  showNotification('Autoplay cancelled for this song', 'warning');
}

function removeAutoplayCountdown() {
  const countdownDiv = document.getElementById('autoplay-countdown');
  if (countdownDiv) {
    countdownDiv.remove();
  }
}

// UPDATED replayClip with better timer reset
function replayClip() {
  console.log('Replaying clip - cancelling any autoplay');

  // Clear any autoplay countdown when user manually replays
  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }
  removeAutoplayCountdown();

  const audioElement = document.getElementById('music-audio');

  // Ensure we're starting from the correct position
  audioElement.currentTime = clipStartTime;

  // Reset and restart the timer
  if (audioTimer) {
    clearInterval(audioTimer);
  }

  // Start playing
  audioElement.play().then(() => {
    // Only set up timer after play promise resolves
    setupAudioTimer();
  }).catch(error => {
    console.error('Error replaying audio:', error);
    showNotification('Error replaying audio', 'error');
  });
}

// NEW: Helper function to update song counter reliably
function updateSongCounter() {
  const currentSong = currentSongIndex + 1;
  const totalSongs = musicQuizSongs.length;
  const isLastSong = currentSongIndex >= musicQuizSongs.length - 1;

  const questionCounter = document.querySelector('.question-counter');
  const submitButton = document.querySelector('.music-controls .btn');

  console.log(`Updating song counter: ${currentSong} of ${totalSongs} (Last song: ${isLastSong})`);

  if (isLastSong) {
    questionCounter.className = 'question-counter final-song';
    questionCounter.innerHTML = `
      🏁 <strong>Final Song!</strong> ${currentSong} of ${totalSongs}
      <br><small style="opacity: 0.9;">Results will show automatically when finished</small>
    `;

    // Update submit button for final song
    if (submitButton) {
      submitButton.innerHTML = '🏁 Finish Quiz';
      submitButton.style.background = '#ff9800';
    }
  } else {
    questionCounter.className = 'question-counter';
    questionCounter.innerHTML = `Song ${currentSong} of ${totalSongs}`;

    // Reset submit button for non-final songs
    if (submitButton) {
      submitButton.innerHTML = '✅ Submit Guess';
      submitButton.style.background = '#4CAF50';
    }
  }

  // Also update any individual elements that might exist
  const currentSongElement = document.getElementById('current-song-num');
  const totalSongsElement = document.getElementById('total-songs');

  if (currentSongElement) {
    currentSongElement.textContent = currentSong;
  }
  if (totalSongsElement) {
    totalSongsElement.textContent = totalSongs;
  }
}

// NEW: Handle music submit with final song detection
function handleMusicSubmit() {
  console.log('Submit guess clicked');

  // Check if this is the last song
  const isLastSong = currentSongIndex >= musicQuizSongs.length - 1;

  if (isLastSong) {
    console.log('Submitting final guess - finishing quiz');
    submitMusicGuessAndFinish();
  } else {
    console.log('Submitting guess and continuing to next song');
    submitMusicGuess();
  }
}

// Check if this is the last song
const isLastSong = currentSongIndex >= musicQuizSongs.length - 1;

if (isLastSong) {
  submitMusicGuessAndFinish();
} else {
  console.log('Submitting guess and continuing to next song');
  submitMusicGuess();
}

// UPDATED submitMusicGuess with autoplay cancellation and proper data structure
function submitMusicGuess() {
  // Clear any autoplay countdown
  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }
  removeAutoplayCountdown();

  const guess = document.getElementById('song-guess').value.trim();
  const songObj = musicQuizSongs[currentSongIndex]; // Get full song object
  const song = songObj.file || songObj; // Handle both old and new format
  const metadata = songObj.metadata || {
    title: song.name.replace(/\.(mp3|wav|m4a|aac)$/i, ''),
    album: 'Unknown Album',
    artist: 'Unknown Artist'
  };

  // Stop current audio
  const audioElement = document.getElementById('music-audio');
  audioElement.pause();
  if (audioTimer) {
    clearInterval(audioTimer);
  }

  // Save answer with proper structure - include both songObj and metadata
  musicAnswers.push({
    songObj: songObj,          // Full object with file and metadata
    song: song,                // File object for compatibility
    metadata: metadata,        // Metadata object
    guess: guess,
    fileName: song.name,
    clipStart: clipStartTime,
    clipDuration: clipDuration
  });

  // Debug log
  console.log('Saved answer:', {
    title: metadata.title,
    guess: guess,
    songObj: songObj
  });

  currentSongIndex++;
  setTimeout(() => playCurrentSong(), 1000);
}

// NEW: Submit final answer and finish quiz
function submitMusicGuessAndFinish() {

  // Clear any autoplay countdown
  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }
  removeAutoplayCountdown();

  const guess = document.getElementById('song-guess').value.trim();
  const songObj = musicQuizSongs[currentSongIndex]; // Get full song object
  const song = songObj?.file || songObj; // Handle both old and new format
  const metadata = songObj?.metadata || {
    title: song ? song.name.replace(/\.(mp3|wav|m4a|aac)$/i, '') : 'Unknown Song',
    album: 'Unknown Album',
    artist: 'Unknown Artist'
  };

  // Stop current audio
  const audioElement = document.getElementById('music-audio');
  audioElement.pause();
  if (audioTimer) {
    clearInterval(audioTimer);
  }

  // Save final answer
  musicAnswers.push({
    songObj: songObj,
    song: song,
    metadata: metadata,
    guess: guess,
    fileName: song?.name,
    clipStart: clipStartTime,
    clipDuration: clipDuration
  });


  // Show the finishing message
  showNotification('🎉 Quiz completed! Calculating results...', 'success');

  // Show results after a brief delay for better UX
  setTimeout(() => {
    showMusicResults();
  }, 1500);
}

// UPDATED skipSong with final song detection
function skipSong() {
  console.log('Skip song clicked');

  // Clear any autoplay countdown
  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }
  removeAutoplayCountdown();

  // Check if this is the last song
  const isLastSong = currentSongIndex >= musicQuizSongs.length - 1;

  if (isLastSong) {
    console.log('Skipping final song - finishing quiz');
    submitMusicGuessAndFinish();
  } else {
    console.log('Skipping to next song');
    submitMusicGuess();
  }
}

function showMusicResults() {
  document.getElementById('music-game-section').classList.add('hidden');
  document.getElementById('music-results-section').classList.remove('hidden');

  // Check if we have any answers
  if (!musicAnswers || musicAnswers.length === 0) {
    console.error('No music answers found!');
    document.getElementById('music-results-container').innerHTML = `
      <div class="error-message">
        <h3>⚠️ No Results Found</h3>
        <p>It seems no answers were recorded during the quiz.</p>
        <p>This might be a technical issue. Please try again.</p>
      </div>
    `;
    document.getElementById('music-results-summary').innerHTML = '<strong>Error: No data recorded</strong>';
    return;
  }

  // Calculate score with improved matching
  let totalPoints = 0;
  const maxPoints = musicAnswers.length * 10;

  const container = document.getElementById('music-results-container');
  container.innerHTML = '';

  musicAnswers.forEach((answer, index) => {
    const resultDiv = document.createElement('div');

    // Handle different data structures for backward compatibility
    let metadata, title, artist, album;

    if (answer.metadata) {
      // New structure with metadata
      metadata = answer.metadata;
      title = metadata.title;
      artist = metadata.artist;
      album = metadata.album;
    } else if (answer.songObj && answer.songObj.metadata) {
      // songObj structure
      metadata = answer.songObj.metadata;
      title = metadata.title;
      artist = metadata.artist;
      album = metadata.album;
    } else if (answer.song && answer.song.metadata) {
      // song has metadata
      metadata = answer.song.metadata;
      title = metadata.title;
      artist = metadata.artist;
      album = metadata.album;
    } else {
      // Fallback - extract from filename
      const fileName = answer.fileName || (answer.song && answer.song.name) || 'Unknown';
      title = fileName.replace(/\.(mp3|wav|m4a|aac)$/i, '');
      artist = 'Unknown Artist';
      album = 'Unknown Album';
      console.warn(`No metadata found for answer ${index + 1}, using filename:`, fileName);
    }

    // Improved scoring based on metadata
    let points = 0;
    let accuracy = 'No guess';
    let resultClass = 'incorrect';
    let matchDetails = '';

    if (answer.guess) {
      const guess = answer.guess.toLowerCase().trim();
      let titleLower = (title || '').toLowerCase();
      // remove the number prefix and period if it exists from the title
      titleLower = titleLower.replace(/^\d+\.\s*/, '');
      const artistLower = (artist || '').toLowerCase();
      const albumLower = (album || '').toLowerCase();

      // Check for various types of matches
      if (titleLower && titleLower !== 'unknown'
        && (guess === titleLower || titleLower.includes(guess)
          || guess.includes(titleLower))) {
        points = guess === titleLower ? 10 : 8;
        accuracy = guess === titleLower ? 'Exact title match!' : 'Title match';
        matchDetails = 'Matched song title';
        resultClass = 'correct';
      } else {
        // Fallback to simple title matching
        const titleWords = titleLower.split(/[-_\s]+/).filter(word => word.length > 2);
        const guessWords = guess.split(/[-_\s]+/).filter(word => word.length > 2);

        const hasWordMatch = titleWords.some(titleWord =>
          guessWords.some(guessWord =>
            titleWord.includes(guessWord) || guessWord.includes(titleWord)
          )
        );

        if (hasWordMatch) {
          points = 3;
          accuracy = 'Partial word match';
          matchDetails = 'Matched some words';
          resultClass = 'partial';
        } else {
          accuracy = 'No match';
          matchDetails = 'No matching elements found';
          resultClass = 'incorrect';
        }
      }
    }

    totalPoints += points;

    // Display track information with metadata
    const year = metadata && metadata.year ? ` (${metadata.year})` : '';

    resultDiv.className = `song-result ${resultClass}`;
    resultDiv.innerHTML = `
      <div class="song-details">
        <div class="song-info-text">
          <div class="track-result-info">
            <strong>Song ${index + 1}:</strong>
            <div class="track-metadata">
              <div class="track-title-result">🎵 <strong>${title}</strong></div>
              <div class="track-artist-result">👤 ${artist}</div>
              <div class="track-album-result">💿 ${album}${year}</div>
            </div>
          </div>
          <div class="guess-info">
            <strong>Your guess:</strong> "${answer.guess || 'No guess'}"<br>
            <small>Match: ${matchDetails}</small><br>
            ${answer.clipStart ? `<small>Clip: ${answer.clipStart.toFixed(1)}s - ${(answer.clipStart + answer.clipDuration).toFixed(1)}s</small>` : ''}
          </div>
        </div>
        <div class="song-score">
          <strong>${points}/10</strong><br>
          <small>${accuracy}</small>
        </div>
      </div>
    `;
    container.appendChild(resultDiv);
  });

  // Show summary
  const percentage = Math.round((totalPoints / maxPoints) * 100);
  document.getElementById('music-results-summary').innerHTML = `
    <strong>Final Score: ${totalPoints}/${maxPoints} points (${percentage}%)</strong>
  `;

  // Show completion notification
  if (percentage >= 80) {
    showNotification(`🎉 Excellent! You scored ${percentage}%! Music master level achieved!`, 'success');
  } else if (percentage >= 60) {
    showNotification(`🎵 Great job! You scored ${percentage}%! Good music knowledge!`, 'success');
  } else if (percentage >= 40) {
    showNotification(`🎼 Not bad! You scored ${percentage}%! Keep listening to more music!`, 'success');
  } else {
    showNotification(`🎶 You scored ${percentage}%. Time to discover new music!`, 'success');
  }
}

function analyzeFolderStructure() {
  const folders = new Set();
  let totalSize = 0;

  musicFiles.forEach(fileObj => {
    const file = fileObj.file || fileObj; // Handle both old and new format
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

// UPDATED restartMusicQuiz to reuse existing music files
function restartMusicQuiz() {
  console.log('Restarting music quiz with existing files...');

  // Check if we have previously loaded music files
  if (musicFiles && musicFiles.length > 0) {
    console.log(`Reusing ${musicFiles.length} previously loaded music files`);

    // Reset only the quiz state, keep the music files
    musicQuizSongs = [];
    currentSongIndex = 0;
    musicAnswers = [];
    autoplayEnabled = true;

    // Clear any existing timers
    if (audioTimer) {
      clearInterval(audioTimer);
      audioTimer = null;
    }
    if (autoplayCountdown) {
      clearTimeout(autoplayCountdown);
      autoplayCountdown = null;
    }
    removeAutoplayCountdown();

    // Remove autoplay indicator if it exists
    const indicator = document.getElementById('autoplay-indicator');
    if (indicator) {
      indicator.remove();
    }

    // Skip upload section, go directly to setup
    document.getElementById('music-upload-section').classList.add('hidden');
    document.getElementById('music-setup-section').classList.remove('hidden');
    document.getElementById('music-game-section').classList.add('hidden');
    document.getElementById('music-results-section').classList.add('hidden');

    // Reset autoplay checkbox to checked
    const autoplayCheckbox = document.getElementById('autoplay-next');
    if (autoplayCheckbox) {
      autoplayCheckbox.checked = true;
    }

    // Add status indicator showing loaded music collection
    addMusicCollectionStatus();

    showNotification(`Ready to play again with ${musicFiles.length} songs!`, 'success');

  } else {
    // No previous files, do full initialization
    console.log('No previous music files found, starting fresh...');
    initializeMusicQuiz();
  }
}

// NEW: Add status indicator for loaded music collection
function addMusicCollectionStatus() {
  // Remove existing status if present
  const existingStatus = document.getElementById('music-collection-status');
  if (existingStatus) {
    existingStatus.remove();
  }

  if (musicFiles && musicFiles.length > 0) {
    const setupSection = document.getElementById('music-setup-section');
    const statusDiv = document.createElement('div');
    statusDiv.id = 'music-collection-status';
    statusDiv.className = 'folder-stats';

    // Get some stats about the collection
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
        Your music is ready! Choose settings below or click "New Music Folder" to change collection.
      </p>
    `;

    // Insert at the beginning of setup section
    setupSection.insertBefore(statusDiv, setupSection.firstChild);
  }
}

// NEW: Quick play again with same settings
function quickPlayAgain() {
  console.log('Quick play again with same settings...');

  // Check if we have previously loaded music files
  if (!musicFiles || musicFiles.length === 0) {
    showNotification('No music files available. Please select a folder first.', 'warning');
    initializeMusicQuiz();
    return;
  }

  console.log(`Starting quick replay with ${musicFiles.length} music files`);

  // Keep current settings from the UI
  const songsCount = parseInt(document.getElementById('songs-count').value);
  const currentClipDuration = parseInt(document.getElementById('clip-duration').value);
  const currentAutoplay = document.getElementById('autoplay-next').checked;

  // Reset only the quiz state
  currentSongIndex = 0;
  musicAnswers = [];
  clipDuration = currentClipDuration;
  autoplayEnabled = currentAutoplay;

  // Clear any existing timers
  if (audioTimer) {
    clearInterval(audioTimer);
    audioTimer = null;
  }
  if (autoplayCountdown) {
    clearTimeout(autoplayCountdown);
    autoplayCountdown = null;
  }
  removeAutoplayCountdown();

  // Remove autoplay indicator if it exists
  const indicator = document.getElementById('autoplay-indicator');
  if (indicator) {
    indicator.remove();
  }

  // Generate new random song selection
  const shuffled = [...musicFiles].sort(() => Math.random() - 0.5)
    .filter(music => !music.metadata.title.toLowerCase().includes("with audio description"));
  musicQuizSongs = shuffled.slice(0, Math.min(songsCount, musicFiles.length));

  console.log('Selected songs for quick replay:', musicQuizSongs.map(song => song.metadata.title));

  // Hide results, show game directly
  document.getElementById('music-upload-section').classList.add('hidden');
  document.getElementById('music-setup-section').classList.add('hidden');
  document.getElementById('music-game-section').classList.remove('hidden');
  document.getElementById('music-results-section').classList.add('hidden');

  // Update game UI
  document.getElementById('total-songs').textContent = musicQuizSongs.length;

  // Add autoplay indicator if enabled
  if (autoplayEnabled) {
    addAutoplayIndicator();
  }

  // Start playing immediately
  playCurrentSong()
    .then(() => {
      console.log("Quick replay started");
      showNotification(`New game started with ${musicQuizSongs.length} songs! ${autoplayEnabled ? '(Autoplay enabled)' : ''}`, 'success');
    });
}

// Debug function to check music quiz state (can be called from browser console)
function debugMusicQuiz() {
  console.log('=== MUSIC QUIZ DEBUG INFO ===');
  console.log('musicFiles:', musicFiles);
  console.log('musicQuizSongs:', musicQuizSongs);
  console.log('musicAnswers:', musicAnswers);
  console.log('currentSongIndex:', currentSongIndex);
  console.log('clipDuration:', clipDuration);
  console.log('autoplayEnabled:', autoplayEnabled);
  console.log('autoplayCountdown active:', !!autoplayCountdown);
  console.log('audioTimer active:', !!audioTimer);

  const audioElement = document.getElementById('music-audio');
  if (audioElement) {
    console.log('Audio element state:', {
      currentTime: audioElement.currentTime,
      duration: audioElement.duration,
      paused: audioElement.paused,
      clipStartTime: clipStartTime,
      timeInClip: audioElement.currentTime - clipStartTime
    });
  }

  return {
    totalFiles: musicFiles.length,
    selectedSongs: musicQuizSongs.length,
    recordedAnswers: musicAnswers.length,
    currentIndex: currentSongIndex,
    autoplay: autoplayEnabled,
    activeTimers: {
      audioTimer: !!audioTimer,
      autoplayCountdown: !!autoplayCountdown
    }
  };
}

// Additional debug function to monitor audio timing
function debugAudioTiming() {
  const audioElement = document.getElementById('music-audio');
  if (!audioElement) {
    console.log('No audio element found');
    return;
  }

  console.log('=== AUDIO TIMING DEBUG ===');
  console.log('Clip start time:', clipStartTime);
  console.log('Clip duration:', clipDuration);
  console.log('Audio current time:', audioElement.currentTime);
  console.log('Time elapsed in clip:', audioElement.currentTime - clipStartTime);
  console.log('Time remaining in clip:', clipDuration - (audioElement.currentTime - clipStartTime));
  console.log('Audio paused:', audioElement.paused);
  console.log('Audio ended:', audioElement.ended);
  console.log('Autoplay countdown active:', !!autoplayCountdown);

  return {
    clipStart: clipStartTime,
    clipDuration: clipDuration,
    currentTime: audioElement.currentTime,
    timeInClip: audioElement.currentTime - clipStartTime,
    timeRemaining: clipDuration - (audioElement.currentTime - clipStartTime),
    isPaused: audioElement.paused,
    hasEnded: audioElement.ended
  };
}
