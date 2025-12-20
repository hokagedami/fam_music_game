// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Music Quiz Game - Playwright E2E Tests
 *
 * Tests multiplayer functionality with real browser interactions:
 * - Single player mode
 * - Game creation
 * - Player joining
 * - Multiplayer gameplay
 * - Host transfer
 * - Reconnection
 */

// Helper to generate unique player names
const uniqueName = (base) => `${base}_${Date.now().toString(36)}`;

// Helper to wait for socket connection
async function waitForConnection(page, timeout = 10000) {
  // Wait for connection status to show Online or for socket to connect
  try {
    await page.waitForFunction(
      () => {
        const status = document.getElementById('connection-status');
        return status && status.textContent && status.textContent.includes('Online');
      },
      { timeout }
    );
  } catch {
    // Connection might happen without visible status, continue
  }
  // Give extra time for socket to stabilize
  await page.waitForTimeout(500);
}

// Helper to set player name (works with hidden input)
async function setPlayerName(page, name) {
  await page.evaluate((playerName) => {
    const input = document.getElementById('player-name-input');
    if (input) input.value = playerName;
  }, name);
}

// Helper to load mock music files and trigger UI update
async function loadMockMusic(page) {
  const result = await page.evaluate(() => {
    // Create mock audio files
    const createMockAudioFile = (name) => {
      const mp3Header = new Uint8Array([
        0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);
      const blob = new Blob([mp3Header], { type: 'audio/mp3' });
      return new File([blob], name, { type: 'audio/mp3' });
    };

    // Create mock music files with metadata and blob URLs
    const songData = [
      { name: 'song1.mp3', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', year: '1975' },
      { name: 'song2.mp3', title: 'Stairway to Heaven', artist: 'Led Zeppelin', album: 'Led Zeppelin IV', year: '1971' },
      { name: 'song3.mp3', title: 'Hotel California', artist: 'Eagles', album: 'Hotel California', year: '1977' },
      { name: 'song4.mp3', title: 'Sweet Child O Mine', artist: 'Guns N Roses', album: 'Appetite for Destruction', year: '1987' },
      { name: 'song5.mp3', title: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', year: '1991' },
    ];

    const mockFiles = songData.map(song => {
      const file = createMockAudioFile(song.name);
      return {
        file,
        url: URL.createObjectURL(file), // Create blob URL for audio playback
        metadata: { title: song.title, artist: song.artist, album: song.album, year: song.year }
      };
    });

    // Use the test helper to properly set the closure variable
    if (typeof window.__testSetMusicFiles === 'function') {
      const count = window.__testSetMusicFiles(mockFiles);
      return { success: true, count };
    } else {
      // Fallback: Try to set the global directly
      console.error('Test helper __testSetMusicFiles not found, available:', Object.keys(window).filter(k => k.startsWith('__')));
      return { success: false, error: 'Test helper not found' };
    }
  });

  console.log('loadMockMusic result:', result);

  // Wait for UI to update
  await page.waitForTimeout(500);
}

// ============================================
// TEST SUITES
// ============================================

test.describe('Home Page', () => {
  test('should load the home page correctly', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/Music Quiz/);

    // Check main heading
    await expect(page.locator('#main-title')).toContainText('Music Quiz');

    // Check game mode buttons are visible
    await expect(page.getByRole('button', { name: /Play Solo/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Game/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Join Game/i })).toBeVisible();
  });

});

test.describe('Single Player Mode', () => {
  test('should navigate to setup panel', async ({ page }) => {
    await page.goto('/');

    // Click Play Solo
    await page.click('button:has-text("Play Solo")');

    // Should show setup panel
    await expect(page.locator('#setup-panel')).toBeVisible();
    await expect(page.locator('#setup-title')).toContainText('Single Player');
  });

  test('should show game settings after loading music', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    // Set name (hidden input)
    await setPlayerName(page, 'TestPlayer');

    // Load mock music
    await loadMockMusic(page);

    // Settings should be visible
    await expect(page.locator('#music-settings-section')).toBeVisible();
    await expect(page.locator('#songs-count')).toBeVisible();
    await expect(page.locator('#clip-duration')).toBeVisible();
  });
});

test.describe('Multiplayer - Create Game', () => {
  test('should navigate to multiplayer setup', async ({ page }) => {
    await page.goto('/');

    // Click Create Game
    await page.click('button:has-text("Create Game")');

    // Should show setup panel with multiplayer title
    await expect(page.locator('#setup-panel')).toBeVisible();
    await expect(page.locator('#setup-title')).toContainText('Multiplayer');
  });

  test('should create game and show lobby', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    // Wait for connection
    await waitForConnection(page);

    // Set host name (hidden input)
    await setPlayerName(page, uniqueName('Host'));

    // Load mock music
    await loadMockMusic(page);

    // Configure and create game
    await page.selectOption('#songs-count', '3');
    await page.click('#start-game-button');

    // Should show lobby panel
    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    // Should show game ID (6 alphanumeric characters)
    const gameIdText = await page.locator('#lobby-game-id').textContent();
    expect(gameIdText).toMatch(/Game ID:\s*[A-Z0-9]{6}/);

    // Host controls should be visible
    await expect(page.locator('#host-controls')).toBeVisible();
  });
});

test.describe('Multiplayer - Join Game', () => {
  test('should navigate to join panel', async ({ page }) => {
    await page.goto('/');

    // Click Join Game
    await page.click('button:has-text("Join Game")');

    // Should show join panel
    await expect(page.locator('#join-panel')).toBeVisible();
  });

  test('should have required input fields', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');

    // Check inputs exist
    await expect(page.locator('#join-player-name')).toBeVisible();
    await expect(page.locator('#game-id-input')).toBeVisible();
  });
});

test.describe('Multiplayer - Full Game Flow', () => {
  test('should allow player to join host game', async ({ browser }) => {
    // Create two browser contexts for host and player
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // HOST: Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);

      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.selectOption('#songs-count', '3');
      await hostPage.click('#start-game-button');

      // Wait for lobby
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Get game ID
      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0];
      expect(gameId).toBeTruthy();

      // PLAYER: Join game
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join Game")');

      // Player should see lobby
      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Host should see player count updated (1 player, host is NOT counted)
      await expect(hostPage.locator('#current-player-count')).toContainText('1', { timeout: 10000 });

      // Host start button should be enabled now
      await expect(hostPage.locator('#start-game-btn')).toBeEnabled();

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('should start game with multiple players', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // Setup: Create and join game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.selectOption('#songs-count', '3');
      await hostPage.click('#start-game-button');

      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0];

      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);
      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join Game")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      await expect(hostPage.locator('#start-game-btn')).toBeEnabled({ timeout: 10000 });

      // Start game
      await hostPage.click('#start-game-btn');

      // Both should see game panel
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Host should see host controls
      await expect(hostPage.locator('#host-music-player')).toBeVisible();

      // Player should see non-host controls
      await expect(playerPage.locator('#non-host-music-player')).toBeVisible();

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('should handle player leaving game', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // Setup game with 2 players
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');

      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0];

      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);
      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join Game")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      await expect(hostPage.locator('#current-player-count')).toContainText('1', { timeout: 10000 });

      // Player leaves (use visible button in lobby panel)
      await playerPage.click('#lobby-panel button:has-text("Leave Game")');

      // Player should be back at home
      await expect(playerPage.locator('#home-panel')).toBeVisible({ timeout: 10000 });

      // Host should see player count decrease to 0
      await expect(hostPage.locator('#current-player-count')).toContainText('0', { timeout: 10000 });

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test.skip('should transfer host when host disconnects', async ({ browser }) => {
    // SKIPPED: Host transfer not yet implemented - currently when host disconnects, game is deleted
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    try {
      // Setup game with 3 players
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('OriginalHost'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');

      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0];

      // Player 1 joins
      await player1Page.goto('/');
      await player1Page.click('button:has-text("Join Game")');
      await waitForConnection(player1Page);
      await player1Page.fill('#join-player-name', uniqueName('Player1'));
      await player1Page.fill('#game-id-input', gameId);
      await player1Page.click('#join-panel button:has-text("Join Game")');
      await expect(player1Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Player 2 joins
      await player2Page.goto('/');
      await player2Page.click('button:has-text("Join Game")');
      await waitForConnection(player2Page);
      await player2Page.fill('#join-player-name', uniqueName('Player2'));
      await player2Page.fill('#game-id-input', gameId);
      await player2Page.click('#join-panel button:has-text("Join Game")');
      await expect(player2Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Verify 2 players (host is NOT counted in player count)
      await expect(hostPage.locator('#current-player-count')).toContainText('2', { timeout: 10000 });

      // Host disconnects (close context)
      await hostContext.close();

      // Wait for host transfer
      await player1Page.waitForTimeout(3000);

      // Player 1 should become host (see host controls)
      await expect(player1Page.locator('#host-controls')).toBeVisible({ timeout: 15000 });

      // Player count should be 1 (player1 is now host, player2 is the only player)
      await expect(player1Page.locator('#current-player-count')).toContainText('1', { timeout: 10000 });

    } finally {
      // hostContext already closed
      await player1Context.close();
      await player2Context.close();
    }
  });
});

test.describe('API Endpoints', () => {
  test('should return health check', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    // Server returns 'healthy' status
    expect(data.status).toBe('healthy');
    expect(data.uptime).toBeGreaterThan(0);
  });

  test('should return server status', async ({ request }) => {
    const response = await request.get('/api/status');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    // Server returns 'OK' status
    expect(data.status).toBe('OK');
    expect(data.version).toBeDefined();
  });

  test('should return games list', async ({ request }) => {
    const response = await request.get('/api/games');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(Array.isArray(data.games)).toBeTruthy();
  });
});

test.describe('UI Responsiveness', () => {
  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');

    // Check main elements are visible
    await expect(page.locator('#main-title')).toBeVisible();
    await expect(page.getByRole('button', { name: /Play Solo/i })).toBeVisible();

    // Check layout adapts
    const container = page.locator('.container');
    const box = await container.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(375);
  });

  test('should be responsive on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/');

    await expect(page.locator('#main-title')).toBeVisible();
    await expect(page.locator('.game-modes')).toBeVisible();
  });
});
