// @ts-check
import { test, expect } from '@playwright/test';

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
        url: URL.createObjectURL(file),
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

// Helper to set player name
async function setPlayerName(page, name) {
  await page.evaluate((playerName) => {
    const input = document.getElementById('player-name-input');
    if (input) input.value = playerName;
  }, name);
}

test.describe('Lobby Screenshot Tests', () => {
  test('capture lobby panel with Game ID visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click create game
    await page.click('button:has-text("Create Game")');
    await waitForConnection(page);

    // Set player name and load music
    await setPlayerName(page, 'TestHost');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    // Click start game button
    await page.click('#start-game-button');

    // Wait for lobby
    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

    // Take screenshot of lobby
    await page.screenshot({ path: 'test-screenshots/04-lobby-panel.png', fullPage: true });

    // Verify Game ID is visible
    const gameIdElement = page.locator('#lobby-game-id');
    await expect(gameIdElement).toBeVisible();

    // Get the game ID text
    const gameIdText = await gameIdElement.textContent();
    console.log('Game ID displayed:', gameIdText);

    // Verify the color is cyan (the fix)
    const color = await gameIdElement.evaluate((el) => window.getComputedStyle(el).color);
    console.log('Game ID color:', color);

    // Should be cyan rgb(0, 212, 255)
    expect(color).toContain('0, 212, 255');

    // Test QR toggle if available
    const qrToggleBtn = page.locator('#qr-toggle-btn');
    if (await qrToggleBtn.isVisible()) {
      console.log('QR toggle button found');

      // Initial text should be "Show QR Code"
      await expect(qrToggleBtn).toHaveText('Show QR Code');

      // Click to show QR
      await qrToggleBtn.click();
      await page.waitForTimeout(300);

      // Text should change to "Hide QR Code"
      await expect(qrToggleBtn).toHaveText('Hide QR Code');

      // Take screenshot with QR visible
      await page.screenshot({ path: 'test-screenshots/05-lobby-with-qr.png', fullPage: true });

      // Click to hide QR
      await qrToggleBtn.click();
      await page.waitForTimeout(300);

      // Text should change back
      await expect(qrToggleBtn).toHaveText('Show QR Code');

      console.log('QR toggle button working correctly!');
    }
  });
});
