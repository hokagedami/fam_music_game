# 🎵 Multiplayer Music Quiz Game

A real-time multiplayer music quiz game where players can upload their own music collections and compete with friends! Built with Socket.IO for real-time communication and supports both online multiplayer and offline single-player modes.

## ✨ Features

- **Real-time Multiplayer**: Play with up to 10 players simultaneously
- **Custom Music Collections**: Upload your own MP3 files or entire folders
- **Automatic Metadata Reading**: Extracts song titles, artists, and albums
- **Flexible Game Settings**: Configure number of songs, clip duration, and max players
- **Smart Scoring System**: Points based on exact matches, partial matches, and artist recognition
- **Live Scoreboard**: Real-time score updates during gameplay
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Font Scaling**: TV mode and accessibility font scaling options
- **Offline Mode**: Fallback for single-device gameplay when server is unavailable

## 🚀 Quick Start

### Prerequisites

- **Node.js** (version 14 or higher)
- **npm** (comes with Node.js)
- A modern web browser
- Music files in MP3 format

### Installation

1. **Create a new folder and navigate to it:**
   ```bash
   mkdir music-quiz-game
   cd music-quiz-game
   ```

2. **Copy all the game files into this folder:**
  - `index.html`
  - `styles.css`
  - `socket.js`
  - `server.js`
  - `package.json`

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

   You should see:
   ```
   🎵 Music Quiz Server running on port 3001
   📊 Server endpoints:
      - Status: http://localhost:3001/
      - Games: http://localhost:3001/games
   🎮 Ready for multiplayer music quiz games!
   ```

5. **Open the game in your browser:**
  - Open `index.html` in your web browser, or
  - Serve it with a local server:
    ```bash
    # Using Python
    python -m http.server 8000

    # Using Node.js
    npx http-server

    # Then visit http://localhost:8000
    ```

## 🎮 How to Play

### For Game Hosts:

1. **Create a Game:**
  - Click "Create Game"
  - Enter your name
  - Upload your music collection (folder or individual files)
  - Configure game settings (number of songs, clip duration, max players)
  - Click "Create Game & Get ID"

2. **Share Game ID:**
  - Share the 6-character game ID with friends
  - Wait for players to join in the lobby
  - Start the game when ready

3. **Host Controls:**
  - Control music playback (play, pause, replay, skip)
  - Reveal answers between songs
  - View live scores and player guesses

### For Players:

1. **Join a Game:**
  - Click "Join Game"
  - Enter your name
  - Enter the game ID provided by the host
  - Wait in the lobby for the game to start

2. **During Gameplay:**
  - Listen to music clips
  - Type your guesses (song title, artist, or album)
  - Submit answers before time runs out
  - View live scoreboard to track your progress

## ⚙️ Game Configuration

### Music Upload Options:
- **Folder Upload**: Select entire music folders (includes subfolders)
- **Individual Files**: Select multiple MP3 files manually
- **Metadata Extraction**: Automatically reads song titles, artists, and albums

### Game Settings:
- **Number of Songs**: 5, 10, 15, 20, or 25 songs
- **Clip Duration**: 15, 20, 30, or 45 seconds per song
- **Max Players**: 2 to 10 players
- **Autoplay**: Automatically advance to next song

### Scoring System:
- **Exact Title Match**: 10 points
- **Partial Title Match**: 8 points
- **Artist Match**: 6 points
- **Partial Word Match**: 3 points
- **No Match**: 0 points

## 🛠️ Technical Details

### File Structure:
```
music-quiz-game/
├── index.html          # Main game interface
├── styles.css          # Game styling and responsive design
├── socket.js           # Client-side game logic and Socket.IO
├── server.js           # Socket.IO server for multiplayer
├── package.json        # Node.js dependencies and scripts
└── README.md           # This file
```

### Dependencies:
- **express**: Web server framework
- **socket.io**: Real-time bidirectional communication
- **cors**: Cross-Origin Resource Sharing middleware
- **jsmediatags**: Client-side MP3 metadata extraction

### Browser Compatibility:
- **Modern browsers** with ES6+ support
- **File API** support for music uploads
- **WebRTC/WebSocket** support for real-time communication

## 🔧 Troubleshooting

### Common Issues:

**"Socket.IO failed to load" error:**
- Make sure you have an internet connection for CDN resources
- Try refreshing the page
- Check browser console for specific error messages

**"Cannot connect to server" error:**
- Ensure the server is running (`npm start`)
- Check that port 3001 is available
- Verify the server URL in `socket.js` (default: `ws://localhost:3001`)

**Music files not loading:**
- Ensure files are in MP3 format
- Check file sizes (very large files may take time to process)
- Try with a smaller number of files first

**Game performance issues:**
- Use smaller music collections for better performance
- Close other browser tabs
- Ensure stable internet connection for multiplayer

### Server Configuration:

**Custom Port:**
```bash
PORT=8080 npm start
```

**Production Deployment:**
- Update `SOCKET_CONFIG.serverUrl` in `socket.js`
- Use environment variables for configuration
- Set up proper CORS policies
- Use process managers like PM2

## 🎯 Game Tips

### For Better Gameplay:
- **Organize Music**: Use well-tagged MP3 files for better metadata
- **Mix Genres**: Include variety for more challenging games
- **File Naming**: Use clear, consistent file naming conventions
- **Connection**: Ensure stable internet for multiplayer games

### Host Tips:
- **Test Audio**: Preview a few songs before starting
- **Player Limits**: Start with 4-6 players for optimal experience
- **Game Length**: 10-15 songs work well for most groups
- **Clip Duration**: 20-30 seconds gives good balance

## 📝 Development

### Development Mode:
```bash
npm run dev
```

### File Modifications:
- **Frontend**: Edit `index.html`, `styles.css`, `socket.js`
- **Backend**: Edit `server.js`
- **Styling**: CSS uses CSS variables for easy theming
- **Real-time Features**: Socket.IO handles all multiplayer communication

### Adding Features:
- Game modes (team play, elimination, etc.)
- Music streaming integration
- Player profiles and statistics
- Custom themes and skins
- Voice chat integration

## 📄 License

MIT License - Feel free to modify and distribute!

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 🆘 Support

If you encounter issues:
1. Check this README for solutions
2. Look at browser console for error messages
3. Ensure all files are in the correct locations
4. Verify Node.js and npm are properly installed

---

🎵 **Have fun playing music quiz with your friends!** 🎵
