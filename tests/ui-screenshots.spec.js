// @ts-check
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('UI Screenshots - Text Visibility Check', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('screenshot home panel', async ({ page }) => {
    // Verify home panel is visible
    const homePanel = page.locator('#home-panel');
    await expect(homePanel).toBeVisible();

    // Check key text elements are visible
    const title = page.locator('h1');
    await expect(title).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/01-home-panel.png', fullPage: true });
  });

  test('screenshot multiplayer setup panel', async ({ page }) => {
    // Navigate to multiplayer setup using specific button
    await page.click('button:has-text("Create Game")');
    await page.waitForLoadState('networkidle');

    const setupPanel = page.locator('#setup-panel');
    await expect(setupPanel).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/02-setup-panel.png', fullPage: true });
  });

  test('screenshot join panel', async ({ page }) => {
    // Navigate to join panel
    await page.click('button:has-text("Join Game")');
    await page.waitForLoadState('networkidle');

    const joinPanel = page.locator('#join-panel');
    await expect(joinPanel).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/03-join-panel.png', fullPage: true });
  });

  test('screenshot lobby panel with game ID', async ({ page }) => {
    // Navigate to multiplayer setup
    await page.click('button:has-text("Create Game")');
    await page.waitForLoadState('networkidle');

    // Fill host name
    await page.fill('#host-name', 'TestHost');

    // Load mock music files using test helper
    await page.evaluate(() => {
      const mockFiles = [
        { name: 'song1.mp3', title: 'Test Song 1', artist: 'Artist A', file: new Blob() },
        { name: 'song2.mp3', title: 'Test Song 2', artist: 'Artist B', file: new Blob() },
        { name: 'song3.mp3', title: 'Test Song 3', artist: 'Artist C', file: new Blob() },
      ];
      window.__testSetMusicFiles(mockFiles);
    });

    // Click create game
    await page.click('#start-game-btn');

    // Wait for lobby to appear
    await page.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 15000 });

    const lobbyPanel = page.locator('#lobby-panel');
    await expect(lobbyPanel).toBeVisible();

    // Check Game ID is visible - this is the key test for the fix
    const gameIdElement = page.locator('#lobby-game-id');
    await expect(gameIdElement).toBeVisible();

    // Verify Game ID text color is not transparent
    const gameIdColor = await gameIdElement.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    console.log('Game ID color:', gameIdColor);
    expect(gameIdColor).not.toBe('rgba(0, 0, 0, 0)');

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/04-lobby-panel.png', fullPage: true });

    // Check QR toggle button
    const qrToggleBtn = page.locator('#qr-toggle-btn');
    if (await qrToggleBtn.isVisible()) {
      // Check initial text
      await expect(qrToggleBtn).toHaveText('Show QR Code');

      // Click to show QR
      await qrToggleBtn.click();
      await page.waitForTimeout(500);

      // Check text changed
      await expect(qrToggleBtn).toHaveText('Hide QR Code');

      // Take screenshot with QR visible
      await page.screenshot({ path: 'test-screenshots/05-lobby-with-qr.png', fullPage: true });

      // Click to hide QR
      await qrToggleBtn.click();
      await page.waitForTimeout(500);

      // Check text changed back
      await expect(qrToggleBtn).toHaveText('Show QR Code');
    }
  });

  test('screenshot single player setup', async ({ page }) => {
    // Navigate to single player
    await page.click('button:has-text("Play Solo")');
    await page.waitForLoadState('networkidle');

    // Check that the single player setup is visible
    const singleSetupPanel = page.locator('#single-setup-panel');
    await expect(singleSetupPanel).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/06-single-player-setup.png', fullPage: true });
  });

  test('verify all text has visible contrast', async ({ page }) => {
    // Check home panel text contrast
    const homePanel = page.locator('#home-panel');
    await expect(homePanel).toBeVisible();

    // Get all text elements and verify they have visible color
    const textElements = await page.locator('#home-panel h1, #home-panel h2, #home-panel p, #home-panel .btn').all();

    for (const el of textElements) {
      const styles = await el.evaluate((elem) => {
        const style = window.getComputedStyle(elem);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          text: elem.textContent?.trim() || '',
        };
      });

      console.log(`Text: "${styles.text}" | Color: ${styles.color} | BG: ${styles.backgroundColor}`);

      // Ensure color is not fully transparent
      expect(styles.color).not.toBe('rgba(0, 0, 0, 0)');
    }

    await page.screenshot({ path: 'test-screenshots/07-text-visibility-check.png', fullPage: true });
  });
});
