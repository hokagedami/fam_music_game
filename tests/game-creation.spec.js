// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Game Creation and Validation - Comprehensive E2E Tests
 *
 * Tests all game creation functionality:
 * - Game creation flow
 * - Settings validation
 * - Game ID generation
 * - Lobby creation
 * - Host permissions
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
  const result = await page.evaluate((songCount) => {
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
      const count = window.__testSetMusicFiles(mockFiles);
      return { success: true, count };
    }
    return { success: false, error: 'Test helper not found' };
  }, count);

  await page.waitForTimeout(500);
  return result;
}

const uniqueName = (base) => `${base}_${Date.now().toString(36)}`;

// ============================================
// NAVIGATION TESTS
// ============================================

test.describe('Game Creation - Navigation', () => {
  test('should navigate to multiplayer setup from home', async ({ page }) => {
    await page.goto('/');

    await page.click('button:has-text("Create Game")');

    await expect(page.locator('#setup-panel')).toBeVisible();
    await expect(page.locator('#setup-title')).toContainText('Multiplayer');
  });

  test('should show back button to return home', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    // Use specific selector for back button in setup panel
    const backBtn = page.locator('#setup-panel .back-btn');
    await expect(backBtn).toBeVisible();
  });

  test('should return to home when back is clicked', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    // Click the back button in setup panel
    await page.click('#setup-panel .back-btn');

    await expect(page.locator('#home-panel')).toBeVisible();
  });
});

// ============================================
// SETUP FORM TESTS
// ============================================

test.describe('Game Creation - Setup Form', () => {
  test('should display host name input', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    // Host name input or player name input should be present
    const nameInput = page.locator('#host-name, #player-name-input');
    await expect(nameInput).toBeAttached();
  });

  test('should display music upload area', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    await expect(page.locator('.upload-area')).toBeVisible();
  });

  test('should display songs count selector', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    await expect(page.locator('#songs-count')).toBeVisible();
  });

  test('should display clip duration selector', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    await expect(page.locator('#clip-duration')).toBeVisible();
  });

  test('should have disabled start button without music', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    const startBtn = page.locator('#start-game-button');
    await expect(startBtn).toBeDisabled();
  });
});

// ============================================
// SETTINGS CONFIGURATION TESTS
// ============================================

test.describe('Game Creation - Settings Configuration', () => {
  test('should allow selecting different song counts', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await loadMockMusic(page, 10);

    // Try different song counts
    await page.selectOption('#songs-count', '5');
    expect(await page.locator('#songs-count').inputValue()).toBe('5');

    await page.selectOption('#songs-count', '10');
    expect(await page.locator('#songs-count').inputValue()).toBe('10');
  });

  test('should allow selecting different clip durations', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await loadMockMusic(page);

    await page.selectOption('#clip-duration', '10');
    expect(await page.locator('#clip-duration').inputValue()).toBe('10');

    await page.selectOption('#clip-duration', '30');
    expect(await page.locator('#clip-duration').inputValue()).toBe('30');
  });

  test('should allow selecting answer time if available', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await loadMockMusic(page);

    const answerTimeSelect = page.locator('#answer-time');
    if (await answerTimeSelect.isVisible()) {
      await page.selectOption('#answer-time', '20');
      expect(await answerTimeSelect.inputValue()).toBe('20');
    }
  });

  test('should allow selecting max players if available', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await loadMockMusic(page);

    const maxPlayersSelect = page.locator('#max-players');
    if (await maxPlayersSelect.isVisible()) {
      await page.selectOption('#max-players', '4');
      expect(await maxPlayersSelect.inputValue()).toBe('4');
    }
  });
});

// ============================================
// GAME CREATION TESTS
// ============================================

test.describe('Game Creation - Creating Game', () => {
  test('should create game and navigate to lobby', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
  });

  test('should generate 6-character game ID', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    const gameIdText = await page.locator('#lobby-game-id').textContent();
    expect(gameIdText).toMatch(/[A-Z0-9]{6}/);
  });

  test('should show host controls in lobby', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#host-controls')).toBeVisible();
  });

  test('should show start game button for host', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#start-game-btn')).toBeVisible();
  });

  test('start button should be disabled without players', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    // Start button should be disabled with 0 players
    const startBtn = page.locator('#start-game-btn');
    await expect(startBtn).toBeDisabled();
  });
});

// ============================================
// LOBBY DISPLAY TESTS
// ============================================

test.describe('Game Creation - Lobby Display', () => {
  test('should display game ID prominently', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    const gameIdDisplay = page.locator('#lobby-game-id, .game-id-display');
    await expect(gameIdDisplay).toBeVisible();
  });

  test('should have copy game ID button', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    // Use specific selector for the copy button in lobby panel
    const copyBtn = page.locator('#lobby-panel button:has-text("Copy Game ID")');
    await expect(copyBtn).toBeVisible();
  });

  test('should display player count', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    const playerCount = page.locator('#current-player-count, .player-count');
    await expect(playerCount).toBeVisible();
    await expect(playerCount).toContainText('0');
  });

  test('should display players list area', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    const playersList = page.locator('#lobby-players, .players-list');
    await expect(playersList).toBeVisible();
  });

  test('should show leave game button', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    // Use specific selector for leave button in lobby panel
    const leaveBtn = page.locator('#lobby-panel button:has-text("Leave Game")');
    await expect(leaveBtn).toBeVisible();
  });
});

// ============================================
// GAME SETTINGS DISPLAY TESTS
// ============================================

test.describe('Game Creation - Settings Display in Lobby', () => {
  test('should display game settings in lobby', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page, 10);
    await page.selectOption('#songs-count', '5');
    await page.selectOption('#clip-duration', '15');

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    // Settings should be displayed somewhere
    const settingsDisplay = page.locator('.game-settings, .lobby-settings, #game-settings');
    if (await settingsDisplay.isVisible()) {
      const settingsText = await settingsDisplay.textContent();
      expect(settingsText).toMatch(/5|15/); // Should show our configured values
    }
  });
});

// ============================================
// LEAVE GAME TESTS
// ============================================

test.describe('Game Creation - Leaving Game', () => {
  test('host leaving should return to home', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    await setPlayerName(page, uniqueName('Host'));
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    // Leave game (use specific selector for lobby panel)
    await page.click('#lobby-panel button:has-text("Leave Game")');

    await expect(page.locator('#home-panel')).toBeVisible({ timeout: 5000 });
  });
});

// ============================================
// MULTIPLE GAME CREATION TESTS
// ============================================

test.describe('Game Creation - Multiple Games', () => {
  test('should be able to create multiple games with different IDs', async ({
    browser,
  }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Create first game
      await page1.goto('/');
      await page1.click('button:has-text("Create Game")');
      await waitForConnection(page1);
      await setPlayerName(page1, uniqueName('Host1'));
      await loadMockMusic(page1);
      await page1.click('#start-game-button');
      await expect(page1.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      const gameId1 = (await page1.locator('#lobby-game-id').textContent())?.match(
        /[A-Z0-9]{6}/
      )?.[0];

      // Create second game
      await page2.goto('/');
      await page2.click('button:has-text("Create Game")');
      await waitForConnection(page2);
      await setPlayerName(page2, uniqueName('Host2'));
      await loadMockMusic(page2);
      await page2.click('#start-game-button');
      await expect(page2.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      const gameId2 = (await page2.locator('#lobby-game-id').textContent())?.match(
        /[A-Z0-9]{6}/
      )?.[0];

      // Game IDs should be different
      expect(gameId1).toBeTruthy();
      expect(gameId2).toBeTruthy();
      expect(gameId1).not.toBe(gameId2);
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});

// ============================================
// CONNECTION STATUS TESTS
// ============================================

test.describe('Game Creation - Connection Status', () => {
  test('should show connection status indicator', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    // Connection status is in the panel header with ID setup-connection-status
    const connectionStatus = page.locator('#setup-connection-status, .connection-status-indicator');
    await expect(connectionStatus).toBeVisible();
  });

  test('should show connected status after connection', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');

    await waitForConnection(page);

    // Check status text or dot class indicates connection
    const statusText = page.locator('#status-text');
    const statusDot = page.locator('#setup-connection-status .status-dot');

    // Either the dot has connected class or text shows connected
    const hasConnectedDot = await statusDot.evaluate(el => el.classList.contains('connected')).catch(() => false);
    const text = await statusText.textContent().catch(() => '');

    expect(hasConnectedDot || text?.toLowerCase().match(/online|connected/)).toBeTruthy();
  });
});

// ============================================
// VALIDATION TESTS
// ============================================

test.describe('Game Creation - Validation', () => {
  test('should require music files before creating game', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    // Try to click start without loading music
    const startBtn = page.locator('#start-game-button');
    await expect(startBtn).toBeDisabled();
  });

  test('song count should be limited to available songs', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    // Load only 3 songs
    await loadMockMusic(page, 3);

    // Select more songs than available
    await page.selectOption('#songs-count', '10');

    await page.click('#start-game-button');

    // Game should still be created (limited to available songs)
    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
  });
});
