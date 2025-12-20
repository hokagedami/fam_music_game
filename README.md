# FAM Music Quiz Game

A Kahoot-style multiplayer music quiz game where players compete to identify songs from audio clips. Features real-time multiplayer with Socket.IO, Kahoot-style answer options, and a responsive UI.

## Features

### Game Modes

**Single Player**
- Load music from your local device
- Automatic metadata extraction from filenames
- Kahoot-style multiple choice answers
- Score tracking with speed bonus
- Customizable clip duration and song count

**Multiplayer**
- Host creates a game room with their music library
- Players join via 6-character Game ID
- Real-time synchronized gameplay
- Live leaderboard updates
- Host controls playback, players see Kahoot-style answer options
- **No file uploads** - music plays locally on host's device

### Kahoot-Style Gameplay
- 4 colorful shape options per song (triangle, diamond, circle, square)
- Timed responses with countdown
- Points based on speed and accuracy
- Visual feedback for correct/wrong answers
- Host controls when to reveal answers

### Network Play
- Play with friends on the same WiFi network
- Server displays both local and network URLs on startup
- Players can join from phones, tablets, or other computers

## Quick Start

### Prerequisites
- Node.js >= 14.0.0
- npm >= 6.0.0

### Installation

```bash
# Clone and install
git clone <repository-url>
cd fam_game
npm install

# Build client and start server
npm run build
npm start
```

When the server starts, you'll see:
```
╔════════════════════════════════════════════════════════════╗
║                   FAM MUSIC QUIZ                           ║
╠════════════════════════════════════════════════════════════╣
║  Local:    http://localhost:3000                           ║
║  Network:  http://192.168.x.x:3000                         ║
╠════════════════════════════════════════════════════════════╣
║  Share the Network URL with other devices on your network! ║
╚════════════════════════════════════════════════════════════╝
```

- **Local URL**: Open on your computer (the host)
- **Network URL**: Share with players on the same WiFi

### Development Mode

```bash
# Start server with auto-reload
npm run dev

# Build client in watch mode (separate terminal)
npm run build:client:watch
```

## How to Play

### Host a Game

1. Click **"Create Game"**
2. Enter your host name
3. Select music files from your device (MP3, WAV, M4A, OGG)
4. Configure settings (song count, clip duration, answer time)
5. Share the **Game ID** with players
6. Click **"Start Game"** when players have joined
7. Control the game: play songs, show options, reveal answers

### Join a Game

1. Open the **Network URL** on your device
2. Click **"Join Game"**
3. Enter the 6-character **Game ID** from the host
4. Enter your display name
5. Wait for host to start the game
6. Listen to the song (played on host's speakers)
7. Select your answer from 4 options on your screen

### Single Player

1. Click **"Play Solo"**
2. Select music files from your device
3. Configure settings
4. Play through songs with Kahoot-style options

## Project Structure

```
fam_game/
├── src/
│   ├── server/                    # Backend server
│   │   ├── index.js               # Express + Socket.IO server
│   │   ├── config.js              # Environment configuration
│   │   ├── gameStore.js           # In-memory game state storage
│   │   ├── handlers/              # Socket.IO event handlers
│   │   │   ├── index.js           # Handler registration
│   │   │   ├── gameHandlers.js    # Game create/join/leave
│   │   │   ├── gameplayHandlers.js # Gameplay events
│   │   │   └── rejoinHandlers.js  # Reconnection handling
│   │   └── utils/
│   │       ├── index.js
│   │       └── gameUtils.js       # Game helper functions
│   │
│   └── client/                    # Frontend modules
│       ├── main.js                # Entry point, event bindings
│       ├── state.js               # Client-side game state
│       ├── socket.js              # Socket.IO client wrapper
│       ├── ui.js                  # DOM manipulation, panels
│       ├── audio.js               # Audio playback controls
│       ├── kahoot.js              # Quiz options generation
│       ├── multiplayer.js         # Multiplayer game logic
│       ├── singlePlayer.js        # Single player game logic
│       ├── utils.js               # General utilities
│       └── utils/                 # Additional utilities
│           ├── index.js
│           ├── audio.js
│           ├── helpers.js
│           └── notifications.js
│
├── dist/
│   └── client/
│       └── bundle.js              # Bundled client JavaScript
│
├── tests/                         # Playwright E2E tests
│   ├── single-player.spec.js
│   ├── game-creation.spec.js
│   ├── player-management.spec.js
│   ├── multiplayer-gameplay.spec.js
│   ├── game-completion.spec.js
│   ├── error-handling.spec.js
│   ├── api-endpoints.spec.js
│   ├── kahoot-options.spec.js
│   ├── responsive.spec.js
│   ├── multiplayer.spec.js
│   └── multiplayer-demo.spec.js
│
├── index.html                     # Main HTML page
├── styles.css                     # All CSS styles
├── package.json                   # Dependencies and scripts
├── esbuild.config.js              # Client bundler configuration
├── playwright.config.js           # Test configuration
├── .env.example                   # Environment variables template
├── .eslintrc.json                 # ESLint configuration
├── .prettierrc                    # Prettier configuration
├── Dockerfile                     # Production Docker image
├── Dockerfile.dev                 # Development Docker image
└── docker-compose.yml             # Docker Compose setup
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
PORT=3000
NODE_ENV=development
MAX_PLAYERS_DEFAULT=6
SONGS_COUNT_DEFAULT=10
CLIP_DURATION_DEFAULT=20
ANSWER_TIME_DEFAULT=15
```

### Game Settings

| Setting | Range | Default |
|---------|-------|---------|
| Songs Count | 3-30 | 10 |
| Clip Duration | 5-45s | 20s |
| Answer Time | 5-30s | 15s |
| Max Players | 2-10 | 6 |

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload (development) |
| `npm run build` | Build client bundle |
| `npm run build:client` | Build client bundle |
| `npm run build:client:watch` | Build client with watch mode |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run format` | Format code with Prettier |
| `npm test` | Run Playwright tests |
| `npm run test:headed` | Run tests with visible browser |
| `npm run test:ui` | Open Playwright Test UI |
| `npm run test:debug` | Debug tests step-by-step |
| `npm run test:report` | View test report |

## Testing

```bash
# Install Playwright browsers (first time only)
npm run test:install

# Run all tests
npm test

# Run with visible browser
npm run test:headed

# Open interactive test UI
npm run test:ui

# Debug a specific test
npm run test:debug
```

## Docker

```bash
# Production
docker-compose up -d

# Development (with hot reload)
docker-compose --profile dev up music-quiz-dev
```

Game available at `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Main application |
| GET | `/api/health` | Health check with uptime |
| GET | `/api/status` | Server status |
| GET | `/api/games` | List active games |
| GET | `/api/stats` | Server statistics |

## Tech Stack

- **Runtime**: Node.js
- **Server**: Express.js
- **Real-time**: Socket.IO
- **Bundler**: esbuild
- **Testing**: Playwright
- **Styling**: CSS3 (Grid, Flexbox, animations)

## How Multiplayer Works

1. **Host** selects music files from their device
2. Files stay on host's device (never uploaded)
3. **Host** plays music through their speakers
4. **Players** hear the music in the room and select answers on their devices
5. Same model as Kahoot - one device plays audio, others answer

## Troubleshooting

**Server won't start**
- Check if port 3000 is in use: `netstat -ano | findstr :3000`
- Ensure Node.js >= 14 is installed
- Run `npm run build` before `npm start`

**Players can't connect**
- All devices must be on the same WiFi network
- Use the **Network URL** (not localhost) for other devices
- Check firewall isn't blocking port 3000
- On Windows, allow Node.js through firewall when prompted

**Music not playing**
- Supported formats: MP3, WAV, M4A, OGG
- Host must have working speakers/audio output
- Check browser hasn't blocked audio autoplay

**Game ID not working**
- Game IDs are 6 characters (letters and numbers)
- Case-insensitive (ABC123 = abc123)
- Ensure the host's game is still active

## License

MIT License

---

**Version:** 3.2.0
