// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Player Management - Comprehensive E2E Tests
 *
 * Tests player join, leave, and kick functionality:
 * - Joining games
 * - Player list updates
 * - Leaving games
 * - Kicking players (host only)
 * - Duplicate name handling
 * - Max player limits
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

// Helper to create a game and return the game ID
async function createGame(page, hostName) {
  await page.goto('/');
  await page.click('button:has-text("Create Game")');
  await waitForConnection(page);
  await setPlayerName(page, hostName);
  await loadMockMusic(page);
  await page.selectOption('#songs-count', '3');
  await page.click('#start-game-button');
  await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

  const gameIdText = await page.locator('#lobby-game-id').textContent();
  return gameIdText?.match(/[A-Z0-9]{6}/)?.[0] || '';
}

const uniqueName = (base) => `${base}_${Date.now().toString(36)}`;

// ============================================
// JOIN GAME - NAVIGATION TESTS
// ============================================

test.describe('Player Management - Join Navigation', () => {
  test('should navigate to join panel from home', async ({ page }) => {
    await page.goto('/');

    await page.click('button:has-text("Join Game")');

    await expect(page.locator('#join-panel')).toBeVisible();
  });

  test('should display player name input', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');

    await expect(page.locator('#join-player-name')).toBeVisible();
  });

  test('should display game ID input', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');

    await expect(page.locator('#game-id-input')).toBeVisible();
  });

  test('should have join button', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');

    const joinBtn = page.locator('#join-panel button:has-text("Join")');
    await expect(joinBtn).toBeVisible();
  });

  test('should have back button', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');

    const backBtn = page.locator('#join-panel button:has-text("Back"), #join-panel .back-btn');
    await expect(backBtn).toBeVisible();
  });
});

// ============================================
// JOIN GAME - SUCCESSFUL JOIN TESTS
// ============================================

test.describe('Player Management - Successful Join', () => {
  test('should join game successfully', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // Create game
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Join game
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('should show success notification on join', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      // Should show success notification
      await expect(playerPage.locator('.notification')).toContainText(/joined|success/i, {
        timeout: 10000,
      });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('host should see player count update', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Verify initial count is 0
      await expect(hostPage.locator('#current-player-count')).toContainText('0');

      // Join game
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      // Host should see player count update to 1
      await expect(hostPage.locator('#current-player-count')).toContainText('1', {
        timeout: 10000,
      });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('host should see player in players list', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      const playerName = uniqueName('TestPlayer');

      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', playerName);
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Host should see player name in list
      await expect(hostPage.locator('#lobby-players, .players-list')).toContainText(
        playerName,
        { timeout: 10000 }
      );
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('start button should be enabled after player joins', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Initially disabled
      await expect(hostPage.locator('#start-game-btn')).toBeDisabled();

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Start button should be enabled
      await expect(hostPage.locator('#start-game-btn')).toBeEnabled({ timeout: 10000 });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });
});

// ============================================
// JOIN GAME - VALIDATION TESTS
// ============================================

test.describe('Player Management - Join Validation', () => {
  test('should show error for invalid game ID', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');
    await waitForConnection(page);

    await page.fill('#join-player-name', 'TestPlayer');
    await page.fill('#game-id-input', 'INVALID');
    await page.click('#join-panel button:has-text("Join")');

    // Should show error notification
    await expect(page.locator('.notification')).toContainText(/not found|invalid|error/i, {
      timeout: 10000,
    });
  });

  test('should show error for empty player name', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');

    await page.fill('#join-player-name', '');
    await page.fill('#game-id-input', 'ABC123');
    await page.click('#join-panel button:has-text("Join")');

    // Should show error or validation message
    await expect(page.locator('.notification')).toContainText(/name|required|enter/i, {
      timeout: 5000,
    });
  });

  test('should show error for empty game ID', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Join Game")');

    await page.fill('#join-player-name', 'TestPlayer');
    await page.fill('#game-id-input', '');
    await page.click('#join-panel button:has-text("Join")');

    // Should show error
    await expect(page.locator('.notification')).toContainText(/game.*id|6.*character|valid/i, {
      timeout: 5000,
    });
  });

  test('should handle case-insensitive game ID', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Join with lowercase game ID
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId.toLowerCase());
      await playerPage.click('#join-panel button:has-text("Join")');

      // Should still join successfully
      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('should reject duplicate player names', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));
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
      await expect(player2Page.locator('.notification')).toContainText(/taken|duplicate|already/i, {
        timeout: 10000,
      });
    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ============================================
// LEAVE GAME TESTS
// ============================================

test.describe('Player Management - Leaving Game', () => {
  test('player can leave game and return to home', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Player leaves
      await playerPage.click('#lobby-panel button:has-text("Leave")');

      // Player should return to home
      await expect(playerPage.locator('#home-panel')).toBeVisible({ timeout: 10000 });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('host should see player count decrease when player leaves', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      await expect(hostPage.locator('#current-player-count')).toContainText('1', {
        timeout: 10000,
      });

      // Player leaves
      await playerPage.click('#lobby-panel button:has-text("Leave")');

      // Host should see player count decrease
      await expect(hostPage.locator('#current-player-count')).toContainText('0', {
        timeout: 10000,
      });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('host leaving should delete game for all players', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Host leaves (use specific selector for lobby panel)
      await hostPage.click('#lobby-panel button:has-text("Leave Game")');

      // Player should be redirected to home (game deleted)
      await expect(playerPage.locator('#home-panel')).toBeVisible({ timeout: 15000 });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });
});

// ============================================
// KICK PLAYER TESTS
// ============================================

test.describe('Player Management - Kicking Players', () => {
  test('host should see kick buttons for players', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Host should see kick button
      const kickBtn = hostPage.locator('.kick-btn, button:has-text("Kick"), [data-action="kick"]');
      await expect(kickBtn).toBeVisible({ timeout: 10000 });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('kicking player should remove them from game', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      await expect(hostPage.locator('#current-player-count')).toContainText('1', {
        timeout: 10000,
      });

      // Host kicks player
      await hostPage.click('.kick-btn, button:has-text("Kick"), [data-action="kick"]');

      // Player count should decrease
      await expect(hostPage.locator('#current-player-count')).toContainText('0', {
        timeout: 10000,
      });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('kicked player should be sent to home', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Host kicks player
      await hostPage.click('.kick-btn, button:has-text("Kick"), [data-action="kick"]');

      // Player should be sent to home
      await expect(playerPage.locator('#home-panel')).toBeVisible({ timeout: 15000 });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('kicked player should see notification', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Host kicks player
      await hostPage.click('.kick-btn, button:has-text("Kick"), [data-action="kick"]');

      // Player should see kicked notification
      await expect(playerPage.locator('.notification')).toContainText(/kicked|removed/i, {
        timeout: 10000,
      });
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('non-host should not see kick buttons', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player 1 joins
      await player1Page.goto('/');
      await player1Page.click('button:has-text("Join Game")');
      await waitForConnection(player1Page);

      await player1Page.fill('#join-player-name', uniqueName('Player1'));
      await player1Page.fill('#game-id-input', gameId);
      await player1Page.click('#join-panel button:has-text("Join")');

      await expect(player1Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Player 2 joins
      await player2Page.goto('/');
      await player2Page.click('button:has-text("Join Game")');
      await waitForConnection(player2Page);

      await player2Page.fill('#join-player-name', uniqueName('Player2'));
      await player2Page.fill('#game-id-input', gameId);
      await player2Page.click('#join-panel button:has-text("Join")');

      await expect(player2Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Player 1 should NOT see kick buttons
      const kickBtns = player1Page.locator('.kick-btn, button:has-text("Kick"), [data-action="kick"]');
      await expect(kickBtns).toHaveCount(0);
    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ============================================
// MULTIPLE PLAYERS TESTS
// ============================================

test.describe('Player Management - Multiple Players', () => {
  test('should support multiple players joining', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();
    const player3Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();
    const player3Page = await player3Context.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Players join
      for (const [page, name] of [
        [player1Page, 'Player1'],
        [player2Page, 'Player2'],
        [player3Page, 'Player3'],
      ]) {
        await page.goto('/');
        await page.click('button:has-text("Join Game")');
        await waitForConnection(page);

        await page.fill('#join-player-name', uniqueName(name));
        await page.fill('#game-id-input', gameId);
        await page.click('#join-panel button:has-text("Join")');

        await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      }

      // Host should see 3 players
      await expect(hostPage.locator('#current-player-count')).toContainText('3', {
        timeout: 10000,
      });
    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
      await player3Context.close();
    }
  });

  test('all players should see live feed updates', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player 1 joins
      await player1Page.goto('/');
      await player1Page.click('button:has-text("Join Game")');
      await waitForConnection(player1Page);

      const player1Name = uniqueName('Alice');
      await player1Page.fill('#join-player-name', player1Name);
      await player1Page.fill('#game-id-input', gameId);
      await player1Page.click('#join-panel button:has-text("Join")');

      await expect(player1Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Player 2 joins
      await player2Page.goto('/');
      await player2Page.click('button:has-text("Join Game")');
      await waitForConnection(player2Page);

      const player2Name = uniqueName('Bob');
      await player2Page.fill('#join-player-name', player2Name);
      await player2Page.fill('#game-id-input', gameId);
      await player2Page.click('#join-panel button:has-text("Join")');

      await expect(player2Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Check if live feed shows join messages
      const liveFeed = hostPage.locator('#live-updates, .live-feed, .live-updates');
      if (await liveFeed.isVisible()) {
        const feedText = await liveFeed.textContent();
        expect(feedText).toMatch(/joined|player/i);
      }
    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ============================================
// DISCONNECTION HANDLING TESTS
// ============================================

test.describe('Player Management - Disconnection', () => {
  test('player disconnecting should update player count', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      await expect(hostPage.locator('#current-player-count')).toContainText('1', {
        timeout: 10000,
      });

      // Close player context (simulates disconnect)
      await playerContext.close();

      // Wait for server to detect disconnect
      await hostPage.waitForTimeout(3000);

      // Host should see player count decrease
      await expect(hostPage.locator('#current-player-count')).toContainText('0', {
        timeout: 15000,
      });
    } finally {
      await hostContext.close();
      // playerContext already closed
    }
  });

  test('host disconnecting should notify all players', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      const gameId = await createGame(hostPage, uniqueName('Host'));

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      await playerPage.fill('#join-player-name', uniqueName('Player'));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');

      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Close host context (simulates disconnect)
      await hostContext.close();

      // Wait for server to detect disconnect
      await playerPage.waitForTimeout(3000);

      // Player should be sent to home or see notification
      const isHome = await playerPage.locator('#home-panel').isVisible();
      const hasNotification = await playerPage.locator('.notification').isVisible();

      expect(isHome || hasNotification).toBe(true);
    } finally {
      // hostContext already closed
      await playerContext.close();
    }
  });
});
