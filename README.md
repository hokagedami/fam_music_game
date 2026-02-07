# Fun Music Game 🎵

A colorful, real-time multiplayer music quiz game where players compete to identify songs from audio clips. Available as both a web app and a desktop application with offline support.

![Fun Music Game](https://img.shields.io/badge/version-3.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Web-lightgrey)

## ✨ Features

### Game Modes
- **Single Player Mode**: Practice your music knowledge with your own music collection
- **Multiplayer Mode**: Host or join games with friends in real-time
- **Kahoot-Style Gameplay**: Fast-paced answering with colorful option cards and live scoreboards

### Desktop App Features
- **Offline Play**: Play without an internet connection
- **LAN Multiplayer**: Host games on your local network
- **Local Music Library**: Scan folders for music files
- **Auto-Updates**: Automatic updates via GitHub Releases

### General Features
- **Custom Music**: Load your own music files (MP3, WAV, M4A, FLAC, OGG, AAC)
- **QR Code Sharing**: Easily share game codes with QR codes
- **Live Leaderboard**: Real-time score updates and animated podium results
- **Configurable Settings**: Customize songs, clip duration, answer time, and more
- **Responsive Design**: Works on desktop and mobile devices

## 📥 Download

Download the latest version for your platform:

| Platform | Download |
|----------|----------|
| Windows | [Download .exe](https://github.com/hokagedami/fam_music_game/releases/latest) |
| macOS | [Download .dmg](https://github.com/hokagedami/fam_music_game/releases/latest) |
| Linux | [Download .AppImage](https://github.com/hokagedami/fam_music_game/releases/latest) |

Or play the [web version](https://your-deployed-url.com) directly in your browser.

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript with ES modules
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **Desktop**: Electron
- **Build Tools**: esbuild, electron-builder
- **Testing**: Playwright
- **CI/CD**: GitHub Actions

## 📋 Prerequisites

- Node.js 18 or higher
- npm 8 or higher

## 🚀 Installation

### From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/hokagedami/fam_music_game.git
   cd fam_music_game
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Build the client:
   ```bash
   npm run build
   ```

## 💻 Usage

### Web Development Server

Start the development server with hot reload:

```bash
npm run dev
```

The server will start at:
- Local: http://localhost:3000
- Network: http://192.168.x.x:3000

### Desktop App (Development)

Run the Electron app in development mode:

```bash
npm run electron:dev
```

### Build Desktop App

Build for your current platform:

```bash
npm run electron:build
```

Build for specific platforms:

```bash
npm run electron:build:win    # Windows
npm run electron:build:mac    # macOS
npm run electron:build:linux  # Linux
```

Built installers will be in the `release/` folder.

## 🎮 How to Play

### Single Player

1. Click **Play Solo** on the home screen
2. Select music files or a folder from your device
3. Configure game settings (number of songs, clip duration)
4. Click **Start Game**
5. Listen to each clip and select the correct song from 4 options
6. Earn points based on speed and accuracy

### Multiplayer (Host)

1. Click **Create Game** on the home screen
2. Load your music collection
3. Configure game settings
4. Share the 6-character Game ID or QR code with players
5. Wait for players to join in the lobby
6. Click **Start Game** when ready
7. Control music playback while players answer

### Multiplayer (Player)

1. Click **Join Game** on the home screen
2. Enter your name and the Game ID shared by the host
3. Wait in the lobby for the host to start
4. Listen to the music and select your answer before time runs out
5. Compete for the top spot on the leaderboard

## ⚙️ Game Settings

| Setting | Description | Options |
|---------|-------------|---------|
| Number of Songs | Songs per game | 3, 5, 10, 15, 20 |
| Clip Duration | How long each clip plays | 10, 15, 20, 30, 45 seconds |
| Answer Time | Time to select answer | 10, 15, 20, 30 seconds |
| Max Players | Maximum players (multiplayer) | 2, 4, 6, 8, 10 |

## 📁 Project Structure

```
fun_music_game/
├── src/
│   ├── client/              # Frontend modules
│   │   ├── main.js          # Entry point
│   │   ├── audio.js         # Audio playback
│   │   ├── electronBridge.js # Electron API bridge
│   │   ├── kahoot.js        # Kahoot-style UI
│   │   ├── multiplayer.js   # Multiplayer logic
│   │   ├── singlePlayer.js  # Single player logic
│   │   ├── socket.js        # Socket.IO client
│   │   ├── state.js         # State management
│   │   ├── ui.js            # UI helpers
│   │   └── utils.js         # Utility functions
│   └── server/              # Backend modules
│       ├── index.js         # Server entry point
│       ├── config.js        # Configuration
│       ├── gameStore.js     # Game state management
│       └── handlers/        # Socket event handlers
├── electron/                # Electron main process
│   ├── main.js              # Main process entry
│   ├── preload.cjs          # Preload script (IPC bridge)
│   ├── updater.js           # Auto-update logic
│   ├── ipc/                 # IPC handlers
│   └── services/            # Electron services
├── resources/               # App icons
├── tests/                   # Playwright tests
├── .github/workflows/       # GitHub Actions
├── dist/                    # Built client bundle
├── release/                 # Built installers
├── index.html               # Main HTML file
├── styles.css               # Styles
├── electron-builder.yml     # Electron build config
└── package.json
```

## 📜 Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Build client bundle |
| `npm run electron:dev` | Run Electron in dev mode |
| `npm run electron:build` | Build desktop app |
| `npm run electron:build:win` | Build for Windows |
| `npm run electron:build:mac` | Build for macOS |
| `npm run electron:build:linux` | Build for Linux |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm test` | Run Playwright tests |

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `MAX_PLAYERS_DEFAULT` | Default max players | `6` |
| `SONGS_COUNT_DEFAULT` | Default songs per game | `10` |
| `CLIP_DURATION_DEFAULT` | Default clip duration (seconds) | `20` |
| `ANSWER_TIME_DEFAULT` | Default answer time (seconds) | `15` |

## 🚢 Deployment

### Web App

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions for various platforms.

### Desktop App Releases

Desktop builds are automated via GitHub Actions:

1. **Automatic releases**: Push a version tag to trigger a build:
   ```bash
   git tag v3.3.0
   git push --tags
   ```

2. **Manual builds**: Go to Actions → "Build Desktop App" → Run workflow

Built installers are automatically attached to GitHub Releases.

## 🧪 Testing

```bash
# Install Playwright browsers
npm run test:install

# Run tests
npm test

# Run with UI
npm run test:ui

# Run in headed mode
npm run test:headed
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

Made with ❤️ for music lovers everywhere
