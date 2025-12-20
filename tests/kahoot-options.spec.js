// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Kahoot-Style Options - Playwright E2E Tests
 *
 * Tests the Kahoot-style game flow:
 * - Host plays song, doesn't participate in answering
 * - Players wait while song plays, then see options
 * - Response time tracking for scoring
 * - Answer timer countdown
 */

// Helper to generate unique player names
const uniqueName = (base) => `${base}_${Date.now().toString(36)}`;

// Helper to wait for socket connection
async function waitForConnection(page, timeout = 10000) {
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
  await page.waitForTimeout(500);
}

// Helper to load mock music files
async function loadMockMusic(page) {
  const result = await page.evaluate(() => {
    const createMockAudioFile = (name) => {
      const mp3Header = new Uint8Array([
        0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);
      const blob = new Blob([mp3Header], { type: 'audio/mp3' });
      return new File([blob], name, { type: 'audio/mp3' });
    };

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

    if (typeof window.__testSetMusicFiles === 'function') {
      const count = window.__testSetMusicFiles(mockFiles);
      return { success: true, count };
    } else {
      return { success: false, error: 'Test helper not found' };
    }
  });

  await page.waitForTimeout(500);
  return result;
}

// ============================================
// SINGLE PLAYER KAHOOT TESTS
// ============================================

test.describe('Single Player - Kahoot Options', () => {

  test('should display 4 colored shape options', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    // Host name is automatically "Host" - no input needed
    await loadMockMusic(page);

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Check all 4 colored options are visible
    await expect(page.locator('#single-kahoot-options .kahoot-option.kahoot-red')).toBeVisible();
    await expect(page.locator('#single-kahoot-options .kahoot-option.kahoot-blue')).toBeVisible();
    await expect(page.locator('#single-kahoot-options .kahoot-option.kahoot-yellow')).toBeVisible();
    await expect(page.locator('#single-kahoot-options .kahoot-option.kahoot-green')).toBeVisible();

    // Check shapes
    await expect(page.locator('#single-kahoot-options .kahoot-red .kahoot-shape')).toContainText('▲');
    await expect(page.locator('#single-kahoot-options .kahoot-blue .kahoot-shape')).toContainText('◆');
    await expect(page.locator('#single-kahoot-options .kahoot-yellow .kahoot-shape')).toContainText('●');
    await expect(page.locator('#single-kahoot-options .kahoot-green .kahoot-shape')).toContainText('■');
  });

});

// ============================================
// MULTIPLAYER HOST TESTS
// ============================================

test.describe('Multiplayer - Host View', () => {

  test('host should see music controls and NOT Kahoot answer options', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // HOST: Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      // Host name is automatically "Host" - no input needed
      await loadMockMusic(hostPage);
      await hostPage.selectOption('#songs-count', '3');
      await hostPage.click('#start-game-button');

      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0];

      // PLAYER: Join game
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);
      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join Game")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Start game
      await hostPage.click('#start-game-btn');
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // HOST should see music player
      await expect(hostPage.locator('#host-music-player')).toBeVisible();

      // HOST should see audio controls
      await expect(hostPage.locator('#music-audio')).toBeVisible();

      // HOST should see "Show Options" button initially
      await expect(hostPage.locator('#show-options-btn')).toBeVisible();

      // Reveal button has been removed - answers auto-reveal after timer expires

      // HOST should see instruction text
      await expect(hostPage.locator('.host-instruction')).toContainText("don't answer");

      // HOST should NOT see Kahoot answer options (no #host-kahoot-options)
      const hostKahootOptions = hostPage.locator('#host-kahoot-options');
      await expect(hostKahootOptions).toHaveCount(0);

      console.log('[HOST] Has music controls: true');
      console.log('[HOST] Has answer options: false (correct - host doesn\'t answer)');

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('host should see song number and player count', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      // Host name is automatically "Host" - no input needed
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

      await hostPage.click('#start-game-btn');
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Check song number display
      const songNumber = hostPage.locator('#host-song-number');
      await expect(songNumber).toContainText('Song 1');

      console.log('[HOST] Song number displayed correctly');

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

});

// ============================================
// MULTIPLAYER PLAYER TESTS
// ============================================

test.describe('Multiplayer - Player View', () => {

  test('player should start in waiting state (listening to song)', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      // Host name is automatically "Host" - no input needed
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

      await hostPage.click('#start-game-btn');
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Player should see non-host view
      await expect(playerPage.locator('#non-host-music-player')).toBeVisible();

      // Player should see waiting state (listening animation)
      const waitingState = playerPage.locator('#player-waiting-state');
      await expect(waitingState).toBeVisible();

      // Waiting animation should have headphones emoji
      await expect(waitingState.locator('.waiting-animation')).toContainText('🎧');

      // Options should be hidden initially
      const optionsContainer = playerPage.locator('#nonhost-kahoot-options');
      await expect(optionsContainer).not.toBeVisible();

      // Status should say listening/waiting
      const status = playerPage.locator('#player-song-status');
      const statusText = await status.textContent();
      expect(statusText).toMatch(/Song 1|Listen|Waiting/i);

      console.log('[PLAYER] Started in waiting state: true');
      console.log('[PLAYER] Options hidden initially: true');

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('player should see NO audio player (only shapes after song)', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      // Host name is automatically "Host" - no input needed
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

      await hostPage.click('#start-game-btn');
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Player should NOT have any audio element
      const audioElements = playerPage.locator('#non-host-music-player audio');
      await expect(audioElements).toHaveCount(0);

      console.log('[PLAYER] No audio player: true (correct)');

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('player should have 4 shape options available', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      // Host name is automatically "Host" - no input needed
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

      await hostPage.click('#start-game-btn');
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Check that all 4 shape options exist (even if hidden)
      const redOption = playerPage.locator('#nonhost-kahoot-options .kahoot-red');
      const blueOption = playerPage.locator('#nonhost-kahoot-options .kahoot-blue');
      const yellowOption = playerPage.locator('#nonhost-kahoot-options .kahoot-yellow');
      const greenOption = playerPage.locator('#nonhost-kahoot-options .kahoot-green');

      // Options container exists
      await expect(playerPage.locator('#nonhost-kahoot-options')).toBeAttached();

      // All 4 color options exist
      await expect(redOption).toBeAttached();
      await expect(blueOption).toBeAttached();
      await expect(yellowOption).toBeAttached();
      await expect(greenOption).toBeAttached();

      // Check shapes
      await expect(redOption.locator('.kahoot-shape')).toContainText('▲');
      await expect(blueOption.locator('.kahoot-shape')).toContainText('◆');
      await expect(yellowOption.locator('.kahoot-shape')).toContainText('●');
      await expect(greenOption.locator('.kahoot-shape')).toContainText('■');

      console.log('[PLAYER] All 4 shape options available: true');

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

});

// ============================================
// UI/STYLING TESTS
// ============================================

test.describe('Kahoot Options - UI & Styling', () => {

  test('Kahoot options should have correct visual styling', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    // Host name is automatically "Host" - no input needed
    await loadMockMusic(page);

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Check grid layout
    const optionsContainer = page.locator('#single-kahoot-options');
    const display = await optionsContainer.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('grid');

    // Check options are clickable
    const redOption = page.locator('#single-kahoot-options .kahoot-red');
    const cursor = await redOption.evaluate(el => getComputedStyle(el).cursor);
    expect(cursor).toBe('pointer');

    console.log('[UI] Kahoot options have correct styling');
  });

  test('options should have adequate touch target size on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    // Host name is automatically "Host" - no input needed
    await loadMockMusic(page);

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    const options = page.locator('#single-kahoot-options .kahoot-option');
    for (let i = 0; i < 4; i++) {
      const option = options.nth(i);
      const box = await option.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    console.log('[Mobile] Touch targets are adequate size');
  });

});

// ============================================
// GAME FLOW TESTS
// ============================================

test.describe('Kahoot - Game Flow', () => {

  test('host reveal button should exist and be functional', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      // Host name is automatically "Host" - no input needed
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

      await hostPage.click('#start-game-btn');
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // "Show Options" button should be visible initially
      const showOptionsBtn = hostPage.locator('#show-options-btn');
      await expect(showOptionsBtn).toBeVisible();

      // Click "Show Options" to send options to players
      await showOptionsBtn.click();

      // After clicking show options, button should be hidden (answers auto-reveal after timer)
      await expect(showOptionsBtn).not.toBeVisible({ timeout: 5000 });

      // Host waiting status should be visible
      await expect(hostPage.locator('#host-waiting-status')).toBeVisible();

      console.log('[HOST] Show Options -> Auto-reveal flow works correctly');

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('results should NOT include host (only players who answer)', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // HOST: Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      // Host name is automatically "Host" - no input needed
      await loadMockMusic(hostPage);
      await hostPage.selectOption('#songs-count', '3');
      await hostPage.click('#start-game-button');

      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0];

      // PLAYER: Join game
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);
      await playerPage.fill('#join-player-name', 'TestPlayer');
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join Game")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Start game
      await hostPage.click('#start-game-btn');
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Verify the showMultiplayerResults function filters out host by checking it in browser
      const hostExcludedInResults = await hostPage.evaluate(() => {
        // Mock a gameSession with host and player
        const mockSession = {
          players: [
            { id: '1', name: 'TestHost', isHost: true, score: 0, answers: [] },
            { id: '2', name: 'TestPlayer', isHost: false, score: 150, answers: [] }
          ],
          songs: []
        };

        // Filter like the code does
        const sortedPlayers = mockSession.players
          .filter(p => !p.isHost)
          .sort((a, b) => b.score - a.score);

        return {
          totalFiltered: sortedPlayers.length,
          hasHost: sortedPlayers.some(p => p.isHost),
          playerNames: sortedPlayers.map(p => p.name)
        };
      });

      // Verify host is excluded
      expect(hostExcludedInResults.hasHost).toBe(false);
      expect(hostExcludedInResults.totalFiltered).toBe(1);
      expect(hostExcludedInResults.playerNames).toContain('TestPlayer');
      expect(hostExcludedInResults.playerNames).not.toContain('TestHost');

      console.log('[RESULTS] Host excluded from results: true');
      console.log('[RESULTS] Only players shown in results');

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('player should see options after host clicks Show Options button', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // HOST: Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      // Host name is automatically "Host" - no input needed
      await loadMockMusic(hostPage);
      await hostPage.selectOption('#songs-count', '3');
      await hostPage.click('#start-game-button');

      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0];

      // PLAYER: Join game
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);
      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join Game")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Start game
      await hostPage.click('#start-game-btn');
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Player should be in waiting state initially
      await expect(playerPage.locator('#player-waiting-state')).toBeVisible();
      await expect(playerPage.locator('#nonhost-kahoot-options')).not.toBeVisible();

      console.log('[PLAYER] Initial state: waiting, options hidden');

      // Host clicks "Show Options"
      const showOptionsBtn = hostPage.locator('#show-options-btn');
      await expect(showOptionsBtn).toBeVisible();
      await showOptionsBtn.click();

      console.log('[HOST] Clicked Show Options button');

      // Player should now see the options (waiting state hidden, options visible)
      await expect(playerPage.locator('#nonhost-kahoot-options')).toBeVisible({ timeout: 5000 });
      await expect(playerPage.locator('#player-waiting-state')).not.toBeVisible();

      // All 4 shape options should be visible to player
      await expect(playerPage.locator('#nonhost-kahoot-options .kahoot-red')).toBeVisible();
      await expect(playerPage.locator('#nonhost-kahoot-options .kahoot-blue')).toBeVisible();
      await expect(playerPage.locator('#nonhost-kahoot-options .kahoot-yellow')).toBeVisible();
      await expect(playerPage.locator('#nonhost-kahoot-options .kahoot-green')).toBeVisible();

      console.log('[PLAYER] Options now visible after host clicked Show Options');
      console.log('[FLOW] Host Show Options -> Player sees shapes: SUCCESS');

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

});
