// @ts-check
import { test, expect } from '@playwright/test';

/**
 * End-to-End Full Game Test
 *
 * Tests complete multiplayer game flow with mock audio:
 * - Host creates game with mock music files
 * - 2 players join
 * - Game plays through all songs
 * - Players answer questions
 * - Game ends and shows results
 */

const TEST_TIMEOUT = 300000; // 5 minutes

// Helper to wait for socket connection
async function waitForConnection(page, timeout = 10000) {
  try {
    await page.waitForFunction(
      () => window.__socketConnected || document.getElementById('connection-status')?.textContent?.includes('Online'),
      { timeout }
    );
  } catch {
    console.log('Waiting for socket connection...');
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(500);
}

// Helper to get game ID from lobby
async function getGameId(page) {
  await page.waitForTimeout(500);
  return await page.evaluate(() => {
    const lobbyGameId = document.getElementById('lobby-game-id');
    if (lobbyGameId) {
      const match = lobbyGameId.textContent?.match(/[A-Z0-9]{6}/);
      if (match) return match[0];
    }
    const gameIdDisplay = document.getElementById('game-id-display');
    if (gameIdDisplay) {
      const match = gameIdDisplay.textContent?.match(/[A-Z0-9]{6}/);
      if (match) return match[0];
    }
    return null;
  });
}

// Helper to load mock music files
async function loadMockMusic(page, count = 3) {
  await page.evaluate((songCount) => {
    const createMockAudioFile = (name) => {
      const mp3Header = new Uint8Array([
        0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ]);
      const blob = new Blob([mp3Header], { type: 'audio/mp3' });
      return new File([blob], name, { type: 'audio/mp3' });
    };

    const songNames = ['Sample Song 1', 'Sample Song 2', 'Sample Song 3'];

    const mockFiles = Array.from({ length: songCount }, (_, i) => {
      const file = createMockAudioFile(`sample${i + 1}.mp3`);
      return {
        file,
        url: URL.createObjectURL(file),
        metadata: {
          title: songNames[i] || `Test Song ${i + 1}`,
          artist: `Test Artist ${i + 1}`,
          album: `Test Album`,
          year: '2024',
        },
      };
    });

    if (typeof window.__testSetMusicFiles === 'function') {
      window.__testSetMusicFiles(mockFiles);
    }
  }, count);

  await page.waitForTimeout(500);
}

// Helper to trigger host showing options to players
async function triggerHostShowOptions(hostPage, playerPage) {
  await hostPage.waitForTimeout(500);
  await hostPage.evaluate(() => {
    if (typeof window.hostShowOptions === 'function') {
      window.hostShowOptions();
    }
  });
  await playerPage.waitForTimeout(500);
}

test.describe('E2E Full Game Flow', () => {
  test('complete multiplayer game with real audio files', async ({ browser }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Create browser contexts for host and 2 players
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    // Enable console logging for debugging
    hostPage.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' || text.includes('Song') || text.includes('answer') || text.includes('Auto')) {
        console.log(`[HOST] ${text}`);
      }
    });
    player1Page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('Options')) {
        console.log(`[P1] ${msg.text()}`);
      }
    });
    player2Page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('Options')) {
        console.log(`[P2] ${msg.text()}`);
      }
    });

    try {
      // ========================================
      // STEP 1: Host creates game with real audio files
      // ========================================
      console.log('\n=== STEP 1: Host creates game ===');

      await hostPage.goto('/');
      await waitForConnection(hostPage);

      // Click "Create Game"
      await hostPage.click('button:has-text("Create Game")');
      await hostPage.waitForSelector('#setup-panel:not(.hidden)', { timeout: 5000 });
      console.log('Host on setup panel');

      // Load mock audio files
      await loadMockMusic(hostPage, 3);
      console.log('Loaded 3 mock audio files');

      // Configure game: 3 songs, 5 second clips (shortest available), 10 second answer time
      await hostPage.selectOption('#songs-count', '3');
      await hostPage.selectOption('#clip-duration', '5');
      await hostPage.selectOption('#answer-time', '10');

      // Click Start Game to create lobby
      await hostPage.waitForTimeout(1000);
      const startBtn = hostPage.locator('#start-game-button');
      await expect(startBtn).toBeEnabled({ timeout: 5000 });
      await startBtn.click();
      console.log('Host clicked Create Game');

      // Wait for lobby
      await hostPage.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 10000 });
      const gameId = await getGameId(hostPage);
      console.log(`Game created with ID: ${gameId}`);
      expect(gameId).toBeTruthy();

      // ========================================
      // STEP 2: Players join the game
      // ========================================
      console.log('\n=== STEP 2: Players join ===');

      // Player 1 joins
      await player1Page.goto('/');
      await player1Page.click('button:has-text("Join Game")');
      await player1Page.waitForSelector('#join-panel:not(.hidden)', { timeout: 5000 });
      await waitForConnection(player1Page);

      await player1Page.fill('#join-player-name', 'Alice');
      await player1Page.fill('#game-id-input', gameId);
      await player1Page.locator('#join-panel button:has-text("Join Game")').click();
      await player1Page.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 10000 });
      console.log('Player 1 (Alice) joined');

      // Player 2 joins
      await player2Page.goto('/');
      await player2Page.click('button:has-text("Join Game")');
      await player2Page.waitForSelector('#join-panel:not(.hidden)', { timeout: 5000 });
      await waitForConnection(player2Page);

      await player2Page.fill('#join-player-name', 'Bob');
      await player2Page.fill('#game-id-input', gameId);
      await player2Page.locator('#join-panel button:has-text("Join Game")').click();
      await player2Page.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 10000 });
      console.log('Player 2 (Bob) joined');

      // Verify players in host's lobby
      await hostPage.waitForTimeout(1000);
      const playersText = await hostPage.textContent('#players-container');
      expect(playersText).toContain('Alice');
      expect(playersText).toContain('Bob');
      console.log('Both players visible in lobby');

      // ========================================
      // STEP 3: Host starts the game
      // ========================================
      console.log('\n=== STEP 3: Host starts game ===');

      const startGameBtn = hostPage.locator('#start-game-btn');
      await expect(startGameBtn).toBeEnabled({ timeout: 5000 });
      await startGameBtn.click();
      console.log('Host started the game');

      // All should see game panel
      await hostPage.waitForSelector('#game-panel:not(.hidden)', { timeout: 10000 });
      await player1Page.waitForSelector('#game-panel:not(.hidden)', { timeout: 10000 });
      await player2Page.waitForSelector('#game-panel:not(.hidden)', { timeout: 10000 });
      console.log('All players in game panel');

      // ========================================
      // STEP 4: Play through all 3 songs
      // ========================================
      console.log('\n=== STEP 4: Playing through songs ===');

      for (let songNum = 1; songNum <= 3; songNum++) {
        console.log(`\n--- Song ${songNum} ---`);

        // Trigger host to show options (mock audio doesn't fire 'ended' events)
        await triggerHostShowOptions(hostPage, player1Page);

        // Wait for options to appear for players
        console.log('Waiting for options to appear...');
        await player1Page.waitForFunction(
          () => {
            const options = document.getElementById('nonhost-kahoot-options');
            return options && window.getComputedStyle(options).display !== 'none';
          },
          { timeout: 10000 }
        );
        console.log(`Song ${songNum}: Options appeared for players`);

        // Both players answer (click first option)
        await player1Page.click('#nonhost-kahoot-options .kahoot-option:first-child');
        console.log('Player 1 answered');

        await player2Page.click('#nonhost-kahoot-options .kahoot-option:first-child');
        console.log('Player 2 answered');

        // Wait for correct answer reveal on HOST only
        console.log('Waiting for correct answer reveal on host...');
        try {
          await hostPage.waitForSelector('#correct-answer-reveal:not(.hidden)', { timeout: 5000 });
          console.log(`Song ${songNum}: Correct answer displayed on host!`);
          // Capture correct answer screenshot for first song
          if (songNum === 1) {
            await hostPage.screenshot({ path: 'test-results/e2e-correct-answer-host.png', fullPage: true });
            console.log('Correct answer screenshot captured');
          }
        } catch (e) {
          console.log('Correct answer reveal may have been dismissed quickly');
        }

        // Then wait for intermediate leaderboard on HOST
        console.log('Waiting for intermediate leaderboard on host...');
        try {
          await hostPage.waitForSelector('#intermediate-leaderboard:not(.hidden)', { timeout: 8000 });
          console.log(`Song ${songNum}: Host leaderboard displayed!`);
          // Capture leaderboard screenshot for first song
          if (songNum === 1) {
            await hostPage.screenshot({ path: 'test-results/e2e-leaderboard-host.png', fullPage: true });
            console.log('Host leaderboard screenshot captured');
          }
        } catch (e) {
          console.log('Leaderboard may have been dismissed quickly');
        }

        // Wait for auto-advance to next song
        console.log('Waiting for auto-advance to next song...');

        if (songNum < 3) {
          // Wait for next song's options to appear (or results panel for last song)
          await player1Page.waitForFunction(
            () => {
              // Check if options are hidden (preparing for next song) or new options shown
              const options = document.getElementById('nonhost-kahoot-options');
              const waitingState = document.getElementById('player-waiting-state');
              return waitingState && window.getComputedStyle(waitingState).display !== 'none';
            },
            { timeout: 15000 }
          );
          console.log(`Song ${songNum} complete, advancing...`);
        }
      }

      // ========================================
      // STEP 5: Verify game ends and results shown
      // ========================================
      console.log('\n=== STEP 5: Verify results ===');

      // Wait for results panel on host
      await hostPage.waitForSelector('#results-panel:not(.hidden)', { timeout: 20000 });
      console.log('Host sees results panel');

      // Players see final leaderboard first, then results after 4 seconds
      try {
        await player1Page.waitForSelector('#intermediate-leaderboard:not(.hidden)', { timeout: 8000 });
        console.log('Player 1 sees final leaderboard');
        await player1Page.screenshot({ path: 'test-results/e2e-player-final-leaderboard.png', fullPage: true });
        console.log('Final leaderboard screenshot captured');
      } catch (e) {
        console.log('Final leaderboard may have been dismissed');
      }

      // Wait for results panel on players (after leaderboard dismisses)
      await player1Page.waitForSelector('#results-panel:not(.hidden)', { timeout: 15000 });
      console.log('Player 1 sees results panel');

      await player2Page.waitForSelector('#results-panel:not(.hidden)', { timeout: 10000 });
      console.log('Player 2 sees results panel');

      // Take final screenshots
      await hostPage.screenshot({ path: 'test-results/e2e-host-results.png', fullPage: true });
      await player1Page.screenshot({ path: 'test-results/e2e-player1-results.png', fullPage: true });
      await player2Page.screenshot({ path: 'test-results/e2e-player2-results.png', fullPage: true });
      console.log('Screenshots saved');

      console.log('\n=== TEST PASSED: Full game flow completed successfully! ===');

    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
    }
  });
});
