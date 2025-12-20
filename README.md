# FAM Music Quiz Game

A real-time multiplayer music quiz game where players compete to identify songs from audio clips. Features both single-player practice mode and multiplayer games with Kahoot-style gameplay.

## Features

- **Single Player Mode**: Practice your music knowledge offline with your own music collection
- **Multiplayer Mode**: Host or join games with friends in real-time
- **Kahoot-Style Gameplay**: Fast-paced answering with colorful option cards and live scoreboards
- **Custom Music**: Load your own music files (MP3, WAV, M4A, AAC)
- **QR Code Sharing**: Easily share game codes with QR codes
- **Live Leaderboard**: Real-time score updates and animated podium results
- **Configurable Settings**: Customize number of songs, clip duration, answer time, and more
- **Responsive Design**: Works on desktop and mobile devices
- **Network Play**: Play with others on the same local network

## Tech Stack

- **Frontend**: Vanilla JavaScript with ES modules
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **Build Tool**: esbuild
- **Testing**: Playwright
- **Styling**: Custom CSS with Kahoot-inspired design

## Prerequisites

- Node.js 18 or higher
- npm 6 or higher

## Installation

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

## Usage

### Development

Start the development server with hot reload:

```bash
npm run dev
```

The server will start and display both local and network URLs:
- Local: http://localhost:3000
- Network: http://192.168.x.x:3000 (for other devices on your network)

### Production

```bash
npm start
```

## How to Play

### Single Player

1. Click **Play Solo** on the home screen
2. Select a folder or individual music files from your device
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

## Game Settings

| Setting | Description | Options |
|---------|-------------|---------|
| Number of Songs | Songs per game | 1, 2, 3, 5, 10, 15, 20, 30 |
| Clip Duration | How long each clip plays | 5, 10, 15, 20, 30, 45 seconds |
| Answer Time | Time to select answer | 5, 10, 15, 20, 30 seconds |
| Max Players | Maximum players (multiplayer) | 2, 4, 6, 8, 10 |

## Project Structure

```
fam_game/
├── src/
│   ├── client/           # Frontend modules
│   │   ├── main.js       # Entry point
│   │   ├── audio.js      # Audio playback
│   │   ├── kahoot.js     # Kahoot-style UI
│   │   ├── multiplayer.js # Multiplayer logic
│   │   ├── singlePlayer.js # Single player logic
│   │   ├── socket.js     # Socket.IO client
│   │   ├── state.js      # State management
│   │   ├── ui.js         # UI helpers
│   │   └── utils/        # Utility functions
│   └── server/           # Backend modules
│       ├── index.js      # Server entry point
│       ├── config.js     # Configuration
│       ├── gameStore.js  # Game state management
│       ├── validation.js # Input validation
│       ├── handlers/     # Socket event handlers
│       └── utils/        # Server utilities
├── tests/                # Playwright tests
├── dist/                 # Built client bundle
├── index.html            # Main HTML file
├── styles.css            # Styles
├── package.json
└── esbuild.config.js     # Build configuration
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build client bundle |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run format` | Format code with Prettier |
| `npm test` | Run Playwright tests |
| `npm run test:ui` | Run tests with Playwright UI |
| `npm run test:headed` | Run tests in headed browser |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `MAX_PLAYERS_DEFAULT` | Default max players | `6` |
| `SONGS_COUNT_DEFAULT` | Default songs per game | `10` |
| `CLIP_DURATION_DEFAULT` | Default clip duration (seconds) | `20` |
| `ANSWER_TIME_DEFAULT` | Default answer time (seconds) | `15` |
| `GAME_TIMEOUT_HOURS` | Hours until game expires | `4` |
| `RECONNECT_TIMEOUT_MINUTES` | Minutes to allow reconnection | `30` |
| `MAX_FILE_SIZE_MB` | Max upload file size | `50` |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/status` | GET | Server status |
| `/api/stats` | GET | Game statistics |
| `/api/games` | GET | List active games |
| `/api/upload` | POST | Upload music files |

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions for:
- Namecheap shared hosting
- Hetzner VPS
- Other Linux servers

## Testing

Run the full test suite:

```bash
# Install Playwright browsers
npm run test:install

# Run tests
npm test

# Run with UI
npm run test:ui
```

## License

MIT License

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
