// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Error Handling and Edge Cases - Comprehensive E2E Tests
 *
 * Tests error scenarios and edge cases:
 * - Invalid input handling
 * - Network errors
 * - Game not found errors
 * - Max player limits
 * - Concurrent actions
 * - Edge case scenarios
 */

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
    // Connection might happen without visible status
  }
  await page.waitForTimeout(500);
}

// Helper to set player name
async function setPlayerName(page, name) {
  await page.evaluate((playerName) => {
    const input = document.getElementById('player-name-input');
    if (input) input.value = playerName;
  }, name);
}

// Helper to load mock music files
async function loadMockMusic(page, count = 5) {
  await page.evaluate((songCount) => {
    const createMockAudioFile = (name) => {
      const mp3Header = new Uint8Array([
        0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ]);
      const blob = new Blob([mp3Header], { type: 'audio/mp3' });
      return new File([blob], name, { type: 'audio/mp3' });
    };

    const mockFiles = Array.from({ length: songCount }, (_, i) => {
      const file = createMockAudioFile(`song${i + 1}.mp3`);
      return {
        file,
        url: URL.createObjectURL(file), // Create blob URL for audio playback
        metadata: {
          title: `Test Song ${i + 1}`,
          artist: `Test Artist ${i + 1}`,
          album: `Test Album ${i + 1}`,
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

const uniqueName = (base) => `${base}_${Date.now().toString(36)}`;

// ============================================
// INPUT VALIDATION TESTS
// ============================================

test.describe('Error Handling - Input Validation', () => {
  test('should show error for empty player name when joining', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');
    await waitForConnection(page);

    await page.fill('#join-player-name', '');
    await page.fill('#game-id-input', 'ABC123');
    await page.click('#join-panel button:has-text("Join")');

    await expect(page.locator('.notification')).toContainText(/name|required|enter/i, {
      timeout: 5000,
    });
  });

  test('should show error for empty game ID', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');
    await waitForConnection(page);

    await page.fill('#join-player-name', 'TestPlayer');
    await page.fill('#game-id-input', '');
    await page.click('#join-panel button:has-text("Join")');

    await expect(page.locator('.notification')).toContainText(/game.*id|6.*character|valid/i, {
      timeout: 5000,
    });
  });

  test('should show error for short game ID', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');
    await waitForConnection(page);

    await page.fill('#join-player-name', 'TestPlayer');
    await page.fill('#game-id-input', 'ABC'); // Too short
    await page.click('#join-panel button:has-text("Join")');

    await expect(page.locator('.notification')).toContainText(/6.*character|valid|invalid/i, {
      timeout: 5000,
    });
  });

  test('should show error for non-existent game ID', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');
    await waitForConnection(page);

    await page.fill('#join-player-name', 'TestPlayer');
    await page.fill('#game-id-input', 'XXXXXX'); // Non-existent
    await page.click('#join-panel button:has-text("Join")');

    await expect(page.locator('.notification')).toContainText(/not found|invalid|error/i, {
      timeout: 10000,
    });
  });

  test('should handle special characters in player name', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0] || '';

      // Try to join with special characters
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', 'Test<script>Player');
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      // Should either join (with sanitized name) or show error
      const joinedLobby = await playerPage.locator('#lobby-panel').isVisible({ timeout: 5000 });
      const hasError = await playerPage.locator('.notification').isVisible();

      expect(joinedLobby || hasError).toBe(true);
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });
});

// ============================================
// GAME STATE ERRORS TESTS
// ============================================

test.describe('Error Handling - Game State Errors', () => {
  test('should show error when joining already started game', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    try {
      // Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0] || '';

      // First player joins
      await player1Page.goto('/');
      await player1Page.click('button:has-text("Join Game")');
      await waitForConnection(player1Page);
      await player1Page.fill('#join-player-name', uniqueName('Player1'));
      await player1Page.fill('#game-id-input', gameId);
      await player1Page.click('#join-panel button:has-text("Join")');
      await expect(player1Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Host starts game
      await hostPage.click('#start-game-btn');
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Second player tries to join after game started
      await player2Page.goto('/');
      await player2Page.click('button:has-text("Join Game")');
      await waitForConnection(player2Page);
      await player2Page.fill('#join-player-name', uniqueName('Player2'));
      await player2Page.fill('#game-id-input', gameId);
      await player2Page.click('#join-panel button:has-text("Join")');

      // Should show error
      await expect(player2Page.locator('.notification')).toContainText(
        /already started|in progress|cannot join/i,
        { timeout: 10000 }
      );
    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('should handle duplicate player name error', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    try {
      // Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0] || '';

      const duplicateName = uniqueName('SameName');

      // First player joins
      await player1Page.goto('/');
      await player1Page.click('button:has-text("Join Game")');
      await waitForConnection(player1Page);
      await player1Page.fill('#join-player-name', duplicateName);
      await player1Page.fill('#game-id-input', gameId);
      await player1Page.click('#join-panel button:has-text("Join")');
      await expect(player1Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Second player tries same name
      await player2Page.goto('/');
      await player2Page.click('button:has-text("Join Game")');
      await waitForConnection(player2Page);
      await player2Page.fill('#join-player-name', duplicateName);
      await player2Page.fill('#game-id-input', gameId);
      await player2Page.click('#join-panel button:has-text("Join")');

      // Should show error about duplicate name
      await expect(player2Page.locator('.notification')).toContainText(
        /taken|duplicate|already|exists/i,
        { timeout: 10000 }
      );
    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('should prevent starting game without players', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);
    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);
    await page.click('#start-game-button');
    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    // Start button should be disabled without players
    const startBtn = page.locator('#start-game-btn');
    await expect(startBtn).toBeDisabled();

    // Try to click anyway (force click)
    await startBtn.click({ force: true }).catch(() => {});

    // Should still be in lobby
    await expect(page.locator('#lobby-panel')).toBeVisible();
  });
});

// ============================================
// PERMISSION ERRORS TESTS
// ============================================

test.describe('Error Handling - Permission Errors', () => {
  test('non-host cannot start game', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0] || '';

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);
      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');
      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Player should NOT see start button (only host sees it)
      const playerStartBtn = playerPage.locator('#start-game-btn');
      const isVisible = await playerStartBtn.isVisible().catch(() => false);

      if (isVisible) {
        // If visible, it should be disabled or clicking should do nothing
        await playerStartBtn.click({ force: true }).catch(() => {});
        // Game should not start
        await expect(playerPage.locator('#lobby-panel')).toBeVisible();
      }
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('non-host cannot kick players', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    try {
      // Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0] || '';

      // Both players join
      for (const [page, name] of [
        [player1Page, 'Player1'],
        [player2Page, 'Player2'],
      ]) {
        await page.goto('/');
        await page.click('button:has-text("Join Game")');
        await waitForConnection(page);
        await page.fill('#join-player-name', uniqueName(name));
        await page.fill('#game-id-input', gameId);
        await page.click('#join-panel button:has-text("Join")');
        await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      }

      // Player1 should NOT see kick buttons
      const kickBtns = player1Page.locator('.kick-btn, button:has-text("Kick")');
      await expect(kickBtns).toHaveCount(0);
    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ============================================
// EDGE CASES TESTS
// ============================================

test.describe('Error Handling - Edge Cases', () => {
  test('should handle rapid button clicks gracefully', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);
    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    // Rapid clicks on start button
    const startBtn = page.locator('#start-game-button');
    await startBtn.click();
    await startBtn.click().catch(() => {});
    await startBtn.click().catch(() => {});

    // Should only create one game
    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
  });

  test('should handle page refresh in lobby', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();

    try {
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Refresh the page
      await hostPage.reload();

      // Should return to home (or show reconnection state)
      await expect(
        hostPage.locator('#home-panel, #lobby-panel')
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await hostContext.close();
    }
  });

  test('should handle browser back button', async ({ page }) => {
    await page.goto('/');

    // Navigate through panels
    await page.click('button:has-text("Create Game")');
    await expect(page.locator('#setup-panel')).toBeVisible();

    // Go back
    await page.goBack();

    // Should return to home
    await expect(page.locator('#home-panel')).toBeVisible({ timeout: 5000 });
  });

  test('should handle very long player names', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0] || '';

      // Try to join with very long name
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      const longName = 'A'.repeat(100);
      await playerPage.fill('#join-player-name', longName);
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      // Should either truncate and join, or show error
      const joinedLobby = await playerPage.locator('#lobby-panel').isVisible({ timeout: 5000 });
      const hasError = await playerPage.locator('.notification').isVisible();

      expect(joinedLobby || hasError).toBe(true);
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });
});

// ============================================
// NETWORK ERROR TESTS
// ============================================

test.describe('Error Handling - Network Issues', () => {
  test('should show disconnection status when offline', async ({ page, context }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    // Simulate offline
    await context.setOffline(true);
    await page.waitForTimeout(2000);

    // Check connection status shows offline/disconnected
    const connectionStatus = page.locator('#connection-status, .connection-status');
    const statusText = await connectionStatus.textContent();
    expect(statusText?.toLowerCase()).toMatch(/offline|disconnected|connecting/);

    // Restore connection
    await context.setOffline(false);
  });

  test('should attempt reconnection after disconnect', async ({ page, context }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    // Simulate offline
    await context.setOffline(true);
    await page.waitForTimeout(2000);

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Should reconnect
    const connectionStatus = page.locator('#connection-status, .connection-status');
    await expect(connectionStatus).toContainText(/online|connected/i, { timeout: 15000 });
  });
});

// ============================================
// API ERROR TESTS
// ============================================

test.describe('Error Handling - API Errors', () => {
  test('should handle 404 for invalid API endpoints', async ({ request }) => {
    const response = await request.get('/api/invalid-endpoint');
    expect(response.status()).toBe(404);
  });

  test('should handle invalid upload', async ({ request }) => {
    // Try to upload without file
    const response = await request.post('/api/upload', {
      data: {},
    });

    expect(response.status()).toBe(400);
  });
});

// ============================================
// CONCURRENT ACTION TESTS
// ============================================

test.describe('Error Handling - Concurrent Actions', () => {
  test('should handle multiple players joining simultaneously', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContexts = [];

    const hostPage = await hostContext.newPage();

    // Create 5 player contexts
    for (let i = 0; i < 5; i++) {
      playerContexts.push(await browser.newContext());
    }

    try {
      // Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, uniqueName('Host'));
      await loadMockMusic(hostPage);
      await hostPage.click('#start-game-button');
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0] || '';

      // All players try to join at the same time
      const joinPromises = playerContexts.map(async (ctx, i) => {
        const page = await ctx.newPage();
        await page.goto('/');
        await page.click('button:has-text("Join Game")');
        await waitForConnection(page);
        await page.fill('#join-player-name', uniqueName(`Player${i}`));
        await page.fill('#game-id-input', gameId);
        await page.click('#join-panel button:has-text("Join")');
        return page;
      });

      const playerPages = await Promise.all(joinPromises);

      // Wait for all to process
      await hostPage.waitForTimeout(3000);

      // Count how many successfully joined
      let joinedCount = 0;
      for (const page of playerPages) {
        if (await page.locator('#lobby-panel').isVisible()) {
          joinedCount++;
        }
      }

      // At least some should have joined
      expect(joinedCount).toBeGreaterThan(0);
    } finally {
      await hostContext.close();
      for (const ctx of playerContexts) {
        await ctx.close();
      }
    }
  });
});
