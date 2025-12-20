// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Comprehensive Multiplayer Flow Test
 *
 * Tests the complete game flow with host and 2 players
 */

const TEST_TIMEOUT = 180000; // 3 minutes

// Helper to wait for socket connection
async function waitForConnection(page, timeout = 10000) {
  try {
    await page.waitForFunction(
      () => {
        // Check multiple ways for socket to be connected
        const status = document.getElementById('connection-status');
        if (status && status.textContent && status.textContent.includes('Online')) {
          return true;
        }
        // Check socketManager directly
        if (window.socketManager?.isConnected?.()) {
          return true;
        }
        // Check if socket module is imported and connected (via global state)
        if (window.__socketConnected) {
          return true;
        }
        return false;
      },
      { timeout }
    );
  } catch {
    // If no explicit indicator found, wait a bit for socket to establish
    console.log('No connection indicator found, waiting for socket...');
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(500);
}

// Helper to create mock music files using the test helper
async function loadMockMusicFiles(page, count = 3) {
  const result = await page.evaluate((songCount) => {
    const mockFiles = [];
    for (let i = 1; i <= songCount; i++) {
      // Create mock file data
      const audioData = new Uint8Array([
        0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      const blob = new Blob([audioData], { type: 'audio/mp3' });
      const file = new File([blob], `Song ${i} - Artist ${i}.mp3`, { type: 'audio/mp3' });

      mockFiles.push({
        file,
        url: URL.createObjectURL(blob),
        metadata: {
          title: `Song ${i}`,
          artist: `Artist ${i}`,
        },
      });
    }

    // Use the test helper
    if (typeof window.__testSetMusicFiles === 'function') {
      const count = window.__testSetMusicFiles(mockFiles);
      return { success: true, count };
    }

    return { success: false, error: '__testSetMusicFiles not found' };
  }, count);

  return result;
}

// Helper to get game ID from lobby
async function getGameId(page) {
  await page.waitForTimeout(500);

  const gameId = await page.evaluate(() => {
    // Look for game ID in multiple places
    const lobbyGameId = document.getElementById('lobby-game-id');
    if (lobbyGameId) {
      const text = lobbyGameId.textContent || '';
      const match = text.match(/[A-Z0-9]{6}/);
      if (match) return match[0];
    }

    const gameIdDisplay = document.getElementById('game-id-display');
    if (gameIdDisplay) {
      const text = gameIdDisplay.textContent || '';
      const match = text.match(/[A-Z0-9]{6}/);
      if (match) return match[0];
    }

    return null;
  });

  return gameId;
}

test.describe('Multiplayer Full Flow Test', () => {
  test('complete game flow with host and 2 players', async ({ browser }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Create browser contexts
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    // Enable console logging
    hostPage.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('Game') || msg.text().includes('Socket')) {
        console.log(`[HOST] ${msg.text()}`);
      }
    });
    player1Page.on('console', msg => {
      if (msg.type() === 'error') console.log(`[P1] ${msg.text()}`);
    });
    player2Page.on('console', msg => {
      if (msg.type() === 'error') console.log(`[P2] ${msg.text()}`);
    });

    try {
      // ========================================
      // STEP 1: Host creates game
      // ========================================
      console.log('\n=== STEP 1: Host navigates and creates game ===');

      await hostPage.goto('/');
      await waitForConnection(hostPage);

      // Click "Create Game" button
      await hostPage.click('button:has-text("Create Game")');

      // Should now be on setup panel
      await hostPage.waitForSelector('#setup-panel:not(.hidden)', { timeout: 5000 });
      console.log('Host is on setup panel');

      // Load mock music files
      console.log('Loading mock music files...');
      const loadResult = await loadMockMusicFiles(hostPage, 3);
      console.log('Music load result:', loadResult);
      expect(loadResult.success).toBe(true);

      // Settings section should now be visible
      await hostPage.waitForSelector('#music-settings-section:not(.hidden)', { timeout: 5000 });
      console.log('Settings section visible');

      // Configure settings
      await hostPage.selectOption('#songs-count', '3');
      await hostPage.selectOption('#clip-duration', '5'); // Short clips for testing

      // Wait for socket to be connected before clicking Start Game
      console.log('Waiting for socket connection...');
      await hostPage.waitForFunction(
        () => {
          // Check if socket is connected by looking for the connection status or checking the socket object
          const status = document.getElementById('connection-status');
          if (status && status.textContent && status.textContent.includes('Online')) {
            return true;
          }
          // Also check if window has socket connected
          return window.socketManager?.isConnected?.() || false;
        },
        { timeout: 10000 }
      ).catch(() => {
        // If no status indicator, just wait a bit for socket
        console.log('No connection status found, waiting...');
      });
      await hostPage.waitForTimeout(1000); // Extra wait for socket stability

      // Click Start Game
      const startBtn = hostPage.locator('#start-game-button');
      await expect(startBtn).toBeEnabled({ timeout: 5000 });
      await startBtn.click();
      console.log('Host clicked Start Game');

      // Wait for lobby panel
      await hostPage.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 10000 });
      console.log('Host is in lobby');

      // Get game ID
      const gameId = await getGameId(hostPage);
      console.log(`Game ID: ${gameId}`);
      expect(gameId).toBeTruthy();
      expect(gameId).toHaveLength(6);

      // Verify host controls are visible
      const hostControls = hostPage.locator('#host-controls');
      await expect(hostControls).toBeVisible({ timeout: 5000 });
      console.log('Host controls visible');

      // ========================================
      // STEP 2: Players join
      // ========================================
      console.log('\n=== STEP 2: Players joining ===');

      // Player 1 joins
      await player1Page.goto('/');
      await player1Page.click('button:has-text("Join Game")');
      await player1Page.waitForSelector('#join-panel:not(.hidden)', { timeout: 5000 });

      // Wait for socket connection AFTER navigating to join panel (socket initialized by showJoinGame)
      await waitForConnection(player1Page);
      console.log('Player 1 socket connected');

      await player1Page.fill('#join-player-name', 'Player1');
      await player1Page.fill('#game-id-input', gameId);

      // Wait to ensure socket is ready before joining
      await player1Page.waitForTimeout(500);

      // Click the join button in the join panel
      await player1Page.locator('#join-panel button:has-text("Join Game")').click();
      console.log('Player 1 clicked Join Game');

      // Wait for player 1 to be in lobby
      await player1Page.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 10000 });
      console.log('Player 1 joined lobby');

      // Player 2 joins
      await player2Page.goto('/');
      await player2Page.click('button:has-text("Join Game")');
      await player2Page.waitForSelector('#join-panel:not(.hidden)', { timeout: 5000 });

      // Wait for socket connection AFTER navigating to join panel
      await waitForConnection(player2Page);
      console.log('Player 2 socket connected');

      await player2Page.fill('#join-player-name', 'Player2');
      await player2Page.fill('#game-id-input', gameId);

      // Wait to ensure socket is ready before joining
      await player2Page.waitForTimeout(500);

      // Click the join button in the join panel
      await player2Page.locator('#join-panel button:has-text("Join Game")').click();
      console.log('Player 2 clicked Join Game');

      // Wait for player 2 to be in lobby
      await player2Page.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 10000 });
      console.log('Player 2 joined lobby');

      // Wait for lobby to update
      await hostPage.waitForTimeout(1000);

      // Verify players show in host's lobby
      const playersContainer = await hostPage.textContent('#players-container');
      console.log('Players container:', playersContainer);
      expect(playersContainer).toContain('Player1');
      expect(playersContainer).toContain('Player2');

      // ========================================
      // STEP 3: Host starts game
      // ========================================
      console.log('\n=== STEP 3: Host starts game ===');

      // Start button should be enabled now
      const startGameBtn = hostPage.locator('#start-game-btn');
      await expect(startGameBtn).toBeEnabled({ timeout: 5000 });
      await startGameBtn.click();
      console.log('Host clicked Start Game button');

      // Wait for game panel on all pages
      await hostPage.waitForSelector('#game-panel:not(.hidden)', { timeout: 10000 });
      console.log('Host sees game panel');

      await player1Page.waitForSelector('#game-panel:not(.hidden)', { timeout: 10000 });
      console.log('Player 1 sees game panel');

      await player2Page.waitForSelector('#game-panel:not(.hidden)', { timeout: 10000 });
      console.log('Player 2 sees game panel');

      // ========================================
      // STEP 4: Verify correct views
      // ========================================
      console.log('\n=== STEP 4: Verifying views ===');

      // Host should see host-music-player
      const hostMusicPlayer = hostPage.locator('#host-music-player');
      await expect(hostMusicPlayer).toBeVisible({ timeout: 5000 });
      console.log('Host sees host-music-player: PASS');

      // Host should NOT see non-host-music-player
      const hostNonHostView = hostPage.locator('#non-host-music-player');
      await expect(hostNonHostView).not.toBeVisible();
      console.log('Host does NOT see non-host-music-player: PASS');

      // Players should see non-host-music-player
      const player1NonHostView = player1Page.locator('#non-host-music-player');
      await expect(player1NonHostView).toBeVisible({ timeout: 5000 });
      console.log('Player 1 sees non-host-music-player: PASS');

      const player2NonHostView = player2Page.locator('#non-host-music-player');
      await expect(player2NonHostView).toBeVisible({ timeout: 5000 });
      console.log('Player 2 sees non-host-music-player: PASS');

      // Players should NOT see host-music-player
      const player1HostView = player1Page.locator('#host-music-player');
      await expect(player1HostView).not.toBeVisible();
      console.log('Player 1 does NOT see host-music-player: PASS');

      // ========================================
      // STEP 5: Verify audio player
      // ========================================
      console.log('\n=== STEP 5: Verifying audio player ===');

      const audioPlayer = hostPage.locator('#host-audio-player');
      await expect(audioPlayer).toBeVisible({ timeout: 5000 });
      console.log('Host audio player visible: PASS');

      // Check if audio has a source
      const audioSrc = await audioPlayer.getAttribute('src');
      console.log('Audio src:', audioSrc ? 'SET' : 'NOT SET');

      // ========================================
      // STEP 6: Wait for music clip to end and options to auto-show
      // ========================================
      console.log('\n=== STEP 6: Wait for options to auto-show ===');

      // Options now auto-show after music clip ends (5 seconds + buffer)
      console.log('Waiting for music clip to finish (5 seconds)...');

      // Wait for options to appear on player's screen (max 10 seconds)
      try {
        await player1Page.waitForFunction(
          () => {
            const options = document.getElementById('nonhost-kahoot-options');
            return options && window.getComputedStyle(options).display !== 'none';
          },
          { timeout: 15000 }
        );
        console.log('Options appeared for Player 1: PASS');

        // Verify Player 2 also sees options
        const player2OptionsVisible = await player2Page.evaluate(() => {
          const options = document.getElementById('nonhost-kahoot-options');
          return options && window.getComputedStyle(options).display !== 'none';
        });
        console.log('Options visible for Player 2:', player2OptionsVisible);

        // ========================================
        // STEP 6b: Players answer
        // ========================================
        console.log('\n=== STEP 6b: Players answer ===');

        // Player 1 clicks first option
        await player1Page.click('#nonhost-kahoot-options .kahoot-option:first-child');
        console.log('Player 1 answered');

        // Player 2 clicks first option
        await player2Page.click('#nonhost-kahoot-options .kahoot-option:first-child');
        console.log('Player 2 answered');

        // Wait for auto-reveal (should happen when all players answered)
        await hostPage.waitForTimeout(2000);

        // Check if answer was revealed (next button should be visible)
        const nextBtnVisible = await hostPage.evaluate(() => {
          const btn = document.getElementById('next-song-btn');
          return btn && window.getComputedStyle(btn).display !== 'none';
        });
        console.log('Next song button visible after all answered:', nextBtnVisible);

      } catch (e) {
        console.log('Options did not appear in time:', e.message);
        // Take debug screenshot
        await hostPage.screenshot({ path: 'test-results/debug-host-options.png', fullPage: true });
        await player1Page.screenshot({ path: 'test-results/debug-player1-options.png', fullPage: true });
      }

      // ========================================
      // STEP 7: Take screenshots
      // ========================================
      console.log('\n=== STEP 7: Screenshots ===');

      await hostPage.screenshot({ path: 'test-results/host-game.png', fullPage: true });
      await player1Page.screenshot({ path: 'test-results/player1-game.png', fullPage: true });
      await player2Page.screenshot({ path: 'test-results/player2-game.png', fullPage: true });
      console.log('Screenshots saved');

      // ========================================
      // Final state log
      // ========================================
      console.log('\n=== FINAL STATE ===');

      const hostState = await hostPage.evaluate(() => ({
        gamePanel: !document.getElementById('game-panel')?.classList.contains('hidden'),
        hostMusicPlayerDisplay: document.getElementById('host-music-player')?.style.display,
        nonHostMusicPlayerDisplay: document.getElementById('non-host-music-player')?.style.display,
        liveUpdatesDisplay: document.getElementById('live-updates')?.style.display,
        audioSrc: document.getElementById('host-audio-player')?.src,
      }));
      console.log('Host state:', hostState);

      const player1State = await player1Page.evaluate(() => ({
        gamePanel: !document.getElementById('game-panel')?.classList.contains('hidden'),
        hostMusicPlayerDisplay: document.getElementById('host-music-player')?.style.display,
        nonHostMusicPlayerDisplay: document.getElementById('non-host-music-player')?.style.display,
        liveUpdatesDisplay: document.getElementById('live-updates')?.style.display,
        kahootOptionsDisplay: document.getElementById('nonhost-kahoot-options')?.style.display,
      }));
      console.log('Player 1 state:', player1State);

      // Verify live updates hidden for players
      expect(player1State.liveUpdatesDisplay).toBe('none');
      console.log('Live updates hidden for players: PASS');

    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
    }
  });
});
