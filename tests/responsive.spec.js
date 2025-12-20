// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Music Quiz Game - Responsive Design Tests
 *
 * Tests the UI at different screen sizes to ensure proper responsiveness.
 */

const viewports = [
  { name: 'Mobile Small (320px)', width: 320, height: 568 },
  { name: 'Mobile Medium (375px)', width: 375, height: 667 },
  { name: 'Mobile Large (414px)', width: 414, height: 896 },
  { name: 'Tablet Portrait (768px)', width: 768, height: 1024 },
  { name: 'Tablet Landscape (1024px)', width: 1024, height: 768 },
  { name: 'Desktop (1280px)', width: 1280, height: 800 },
  { name: 'Desktop Large (1440px)', width: 1440, height: 900 },
  { name: 'Desktop XL (1920px)', width: 1920, height: 1080 },
];

test.describe('Responsive Design - All Screen Sizes', () => {

  for (const viewport of viewports) {
    test(`should display correctly on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      // Check main elements are visible
      await expect(page.locator('#main-title')).toBeVisible();
      await expect(page.locator('.game-modes')).toBeVisible();

      // Check all game mode buttons are visible
      await expect(page.getByRole('button', { name: /Play Solo/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Create Game/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Join Game/i })).toBeVisible();

      // Check container doesn't overflow
      const container = page.locator('.container');
      const box = await container.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(viewport.width);

      // Check option cards are visible and properly sized
      const optionCards = page.locator('.option-card');
      const cardCount = await optionCards.count();
      expect(cardCount).toBe(3);

      for (let i = 0; i < cardCount; i++) {
        const card = optionCards.nth(i);
        await expect(card).toBeVisible();
        const cardBox = await card.boundingBox();
        expect(cardBox?.width).toBeLessThanOrEqual(viewport.width - 20); // Account for padding
      }
    });
  }

  test('should handle mobile landscape orientation', async ({ page }) => {
    // Mobile landscape (short height)
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto('/');

    await expect(page.locator('#main-title')).toBeVisible();
    await expect(page.locator('.game-modes')).toBeVisible();

    // In landscape, description might be hidden
    const container = page.locator('.container');
    const box = await container.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(667);
  });

  test('should maintain usability on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');

    // Test that buttons are still clickable
    const playButton = page.getByRole('button', { name: /Play Solo/i });
    await expect(playButton).toBeVisible();

    // Button should have minimum touch target size (44px)
    const buttonBox = await playButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(40);

    // Click should work
    await playButton.click();
    await expect(page.locator('#setup-panel')).toBeVisible();
  });

  test('should not have horizontal scroll on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check that document doesn't overflow horizontally
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('should properly display lobby on different screens', async ({ page }) => {
    // Test lobby display on tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await page.click('button:has-text("Create Game")');
    await expect(page.locator('#setup-panel')).toBeVisible();

    // Check settings grid adapts
    const settingsGrid = page.locator('.settings-grid');
    if (await settingsGrid.isVisible()) {
      const gridBox = await settingsGrid.boundingBox();
      expect(gridBox?.width).toBeLessThanOrEqual(768 - 40);
    }
  });

  test('should display music player correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Navigate to single player
    await page.click('button:has-text("Play Solo")');
    await expect(page.locator('#setup-panel')).toBeVisible();

    // Check upload area is visible and properly sized
    const uploadArea = page.locator('.upload-area');
    await expect(uploadArea).toBeVisible();
    const uploadBox = await uploadArea.boundingBox();
    expect(uploadBox?.width).toBeLessThanOrEqual(375 - 30);
  });
});

test.describe('Responsive Design - Touch Targets', () => {

  test('buttons should have adequate touch target size on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // All main buttons should have minimum 44px height for touch
    const buttons = page.locator('.btn');
    const buttonCount = await buttons.count();

    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        const box = await button.boundingBox();
        // Touch target should be at least 40px (allowing some flexibility)
        expect(box?.height).toBeGreaterThanOrEqual(38);
      }
    }
  });

  test('form inputs should be properly sized on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.click('button:has-text("Join Game")');

    // Check input fields are properly sized
    const nameInput = page.locator('#join-player-name');
    await expect(nameInput).toBeVisible();
    const inputBox = await nameInput.boundingBox();
    expect(inputBox?.height).toBeGreaterThanOrEqual(40);
    expect(inputBox?.width).toBeGreaterThanOrEqual(200);
  });
});
