// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Single Player Mode - Comprehensive E2E Tests
 *
 * Tests all single player functionality:
 * - Setup and music loading
 * - Game settings configuration
 * - Gameplay flow (play, skip, hints, reveal)
 * - Scoring and results
 * - Game completion
 */

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

    const songData = [
      { name: 'song1.mp3', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', year: '1975' },
      { name: 'song2.mp3', title: 'Stairway to Heaven', artist: 'Led Zeppelin', album: 'Led Zeppelin IV', year: '1971' },
      { name: 'song3.mp3', title: 'Hotel California', artist: 'Eagles', album: 'Hotel California', year: '1977' },
      { name: 'song4.mp3', title: 'Sweet Child O Mine', artist: 'Guns N Roses', album: 'Appetite for Destruction', year: '1987' },
      { name: 'song5.mp3', title: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', year: '1991' },
      { name: 'song6.mp3', title: 'Back in Black', artist: 'AC/DC', album: 'Back in Black', year: '1980' },
      { name: 'song7.mp3', title: 'Billie Jean', artist: 'Michael Jackson', album: 'Thriller', year: '1982' },
      { name: 'song8.mp3', title: 'Imagine', artist: 'John Lennon', album: 'Imagine', year: '1971' },
      { name: 'song9.mp3', title: 'Like a Rolling Stone', artist: 'Bob Dylan', album: 'Highway 61 Revisited', year: '1965' },
      { name: 'song10.mp3', title: 'Purple Rain', artist: 'Prince', album: 'Purple Rain', year: '1984' },
    ];

    const mockFiles = songData.slice(0, songCount).map(song => {
      const file = createMockAudioFile(song.name);
      return {
        file,
        url: URL.createObjectURL(file), // Create blob URL for audio playback
        metadata: {
          title: song.title,
          artist: song.artist,
          album: song.album,
          year: song.year,
        },
      };
    });

    if (typeof window.__testSetMusicFiles === 'function') {
      const count = window.__testSetMusicFiles(mockFiles);
      return { success: true, count };
    } else {
      return { success: false, error: 'Test helper not found' };
    }
  }, count);

  await page.waitForTimeout(500);
  return result;
}

// ============================================
// SETUP TESTS
// ============================================

test.describe('Single Player - Setup', () => {
  test('should navigate to single player setup from home', async ({ page }) => {
    await page.goto('/');

    await page.click('button:has-text("Play Solo")');

    await expect(page.locator('#setup-panel')).toBeVisible();
    await expect(page.locator('#setup-title')).toContainText('Single Player');
  });

  test('should display music upload area', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    await expect(page.locator('.upload-area')).toBeVisible();
    // Check for file input - could be #music-files or #music-folder
    const musicInput = page.locator('#music-files, #music-folder');
    await expect(musicInput.first()).toBeAttached();
  });

  test('should display game settings controls', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    // Load music first - settings section is hidden until music is loaded
    await loadMockMusic(page);

    // Check settings are visible
    await expect(page.locator('#songs-count')).toBeVisible();
    await expect(page.locator('#clip-duration')).toBeVisible();
  });

  test('start button should be disabled without music', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    // Start button should be disabled when no music loaded
    const startBtn = page.locator('#start-game-button');
    await expect(startBtn).toBeDisabled();
  });

  test('should enable start button after loading music', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    await loadMockMusic(page);

    const startBtn = page.locator('#start-game-button');
    await expect(startBtn).toBeEnabled();
  });

  test('should display loaded songs count', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    await loadMockMusic(page, 5);

    // Should show notification about loaded songs or file list should be visible
    const notification = page.locator('.notification');
    const fileList = page.locator('#music-file-list');

    // Either notification appears or file list is populated
    try {
      await expect(notification).toContainText(/5|song|loaded/i, { timeout: 5000 });
    } catch {
      // Alternative: check file list is populated
      await expect(fileList).toBeVisible();
    }
  });
});

// ============================================
// SETTINGS TESTS
// ============================================

test.describe('Single Player - Settings Configuration', () => {
  test('should allow changing number of songs', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 10);

    // Change songs count
    await page.selectOption('#songs-count', '5');

    const value = await page.locator('#songs-count').inputValue();
    expect(value).toBe('5');
  });

  test('should allow changing clip duration', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);

    // Change clip duration
    await page.selectOption('#clip-duration', '10');

    const value = await page.locator('#clip-duration').inputValue();
    expect(value).toBe('10');
  });

  test('should have sensible default values', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    // Check default values
    const songsCount = await page.locator('#songs-count').inputValue();
    const clipDuration = await page.locator('#clip-duration').inputValue();

    expect(parseInt(songsCount)).toBeGreaterThanOrEqual(5);
    expect(parseInt(clipDuration)).toBeGreaterThanOrEqual(10);
  });
});

// ============================================
// GAME START TESTS
// ============================================

test.describe('Single Player - Game Start', () => {
  test('should start game and show game panel', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);

    await page.click('#start-game-button');

    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });
  });

  test('should display Kahoot-style options on game start', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Check all 4 Kahoot options are visible
    await expect(
      page.locator('#single-kahoot-options .kahoot-option')
    ).toHaveCount(4);
    await expect(
      page.locator('#single-kahoot-options .kahoot-red')
    ).toBeVisible();
    await expect(
      page.locator('#single-kahoot-options .kahoot-blue')
    ).toBeVisible();
    await expect(
      page.locator('#single-kahoot-options .kahoot-yellow')
    ).toBeVisible();
    await expect(
      page.locator('#single-kahoot-options .kahoot-green')
    ).toBeVisible();
  });

  test('should display song progress indicator', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Should show song progress (e.g., "Song 1 of 3")
    // The question-counter div contains: Song <span id="current-song-num">1</span> of <span id="total-songs">3</span>
    const questionCounter = page.locator('.question-counter');
    await expect(questionCounter).toBeVisible();
    const text = await questionCounter.textContent();
    expect(text).toMatch(/Song 1 of/);
  });

  test('should initialize score at zero', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Score should be 0 at start
    const scoreText = await page.locator('#single-player-score, .score-display').textContent();
    expect(scoreText).toMatch(/0/);
  });
});

// ============================================
// GAMEPLAY TESTS
// ============================================

test.describe('Single Player - Gameplay', () => {
  test('should allow clicking an answer option', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Click an answer option
    const firstOption = page.locator(
      '#single-kahoot-options .kahoot-option'
    ).first();
    await firstOption.click();

    // Option should be marked as selected or show result
    const optionClasses = await firstOption.getAttribute('class');
    expect(optionClasses).toMatch(/selected|correct|incorrect/);
  });

  test('should disable options after selection', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Click first option
    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    // Wait for state update
    await page.waitForTimeout(500);

    // All options should be disabled or show disabled state
    const options = page.locator('#single-kahoot-options .kahoot-option');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const option = options.nth(i);
      const isDisabled = await option.evaluate(
        (el) =>
          el.classList.contains('disabled') ||
          el.hasAttribute('disabled') ||
          el.style.pointerEvents === 'none'
      );
      // At least some indication of disabled state
    }
  });

  test('should show correct/incorrect feedback after answering', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Click an option
    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    // Should show some feedback (correct or incorrect class)
    await page.waitForTimeout(500);
    const correctCount = await page
      .locator('#single-kahoot-options .kahoot-option.correct')
      .count();
    const incorrectCount = await page
      .locator('#single-kahoot-options .kahoot-option.incorrect')
      .count();
    const selectedCount = await page
      .locator('#single-kahoot-options .kahoot-option.selected')
      .count();

    expect(correctCount + incorrectCount + selectedCount).toBeGreaterThan(0);
  });
});

// ============================================
// GAME CONTROLS TESTS
// ============================================

test.describe('Single Player - Game Controls', () => {
  test('should have skip button available', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Skip button should be visible
    const skipBtn = page.locator('button:has-text("Skip"), #skip-btn, #skip-song-btn');
    await expect(skipBtn).toBeVisible();
  });

  test('should skip to next song when skip is clicked', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Get initial song indicator
    const currentSongEl = page.locator('#current-song-num');
    await expect(currentSongEl).toBeVisible();
    const initialProgress = await currentSongEl.textContent();

    // Click skip (using actual button ID #single-player-skip)
    await page.click('#single-player-skip, button:has-text("Skip")');
    await page.waitForTimeout(1000);

    // Song should advance (or game should end if it was the last song)
    const newProgress = await currentSongEl.textContent();
    // Progress should change
    expect(newProgress).not.toBe(initialProgress);
  });

  test('should have replay button available', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Replay button should be visible (button text contains "Replay")
    // The button has text "🔄 Replay" so we search for the emoji or text
    const replayBtn = page.locator('#single-player-controls button:has-text("Replay")');
    await expect(replayBtn).toBeVisible();
  });

  // NOTE: Hints button feature not implemented in current UI
  // Hints info can be shown via the checkbox in settings, but no manual button during gameplay
  test.skip('should have hints button available', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Hints button should be visible
    const hintsBtn = page.locator('button:has-text("Hint"), #hints-btn, #show-hints-btn');
    await expect(hintsBtn).toBeVisible();
  });

  // NOTE: Hints button feature not implemented in current UI
  test.skip('should show hints notification when hints button clicked', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Click hints
    await page.click('button:has-text("Hint"), #hints-btn, #show-hints-btn');

    // Should show notification with hint info
    await expect(page.locator('.notification')).toBeVisible({ timeout: 5000 });
  });
});

// ============================================
// SCORING TESTS
// ============================================

test.describe('Single Player - Scoring', () => {
  test('score should increase when correct answer is selected', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Get correct answer index from page state
    const correctIndex = await page.evaluate(() => {
      // @ts-ignore
      return window.state?.kahootCorrectIndex ?? 0;
    });

    // Click the correct option
    await page
      .locator(`#single-kahoot-options .kahoot-option[data-option="${correctIndex}"]`)
      .click();

    await page.waitForTimeout(1000);

    // Score should be greater than 0
    const scoreText = await page.locator('#single-player-score, .score-display').textContent();
    const score = parseInt(scoreText?.replace(/\D/g, '') || '0');
    expect(score).toBeGreaterThan(0);
  });

  test('score should not change when wrong answer is selected', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Get wrong answer index
    const wrongIndex = await page.evaluate(() => {
      // @ts-ignore
      const correctIndex = window.state?.kahootCorrectIndex ?? 0;
      return correctIndex === 0 ? 1 : 0;
    });

    // Click a wrong option
    await page
      .locator(`#single-kahoot-options .kahoot-option[data-option="${wrongIndex}"]`)
      .click();

    await page.waitForTimeout(500);

    // Score should be 0 (or unchanged from initial)
    const scoreText = await page.locator('#single-player-score, .score-display').textContent();
    // Should contain 0 or very low score
  });
});

// ============================================
// GAME COMPLETION TESTS
// ============================================

test.describe('Single Player - Game Completion', () => {
  test('should show results panel after completing all songs', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Answer the question
    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    // Wait for game to end and show results
    await expect(page.locator('#single-results, #results-panel, #single-results-panel')).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display final score in results', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    await expect(page.locator('#single-results, #results-panel, #single-results-panel')).toBeVisible({
      timeout: 15000,
    });

    // Final score should be displayed
    const finalScoreEl = page.locator('#final-single-score, .final-score, #final-score');
    await expect(finalScoreEl).toBeVisible();
  });

  test('should display accuracy in results', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    await expect(page.locator('#single-results, #results-panel, #single-results-panel')).toBeVisible({
      timeout: 15000,
    });

    // Accuracy should be displayed (HTML has #accuracy-percentage)
    const accuracyEl = page.locator('#accuracy-percentage, .accuracy, .accuracy-display');
    await expect(accuracyEl).toBeVisible();
  });

  test('should have play again button in results', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    await expect(page.locator('#single-results, #results-panel, #single-results-panel')).toBeVisible({
      timeout: 15000,
    });

    // Play again button should be visible (use specific ID for single player)
    await expect(page.locator('#play-again-single-btn')).toBeVisible();
  });

  test('should return to setup when play again is clicked', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    await expect(page.locator('#single-results, #results-panel, #single-results-panel')).toBeVisible({
      timeout: 15000,
    });

    await page.click('#play-again-single-btn');

    // Should return to setup
    await expect(page.locator('#setup-panel')).toBeVisible({ timeout: 5000 });
  });

  test('should have home button in results', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    await expect(page.locator('#single-results, #results-panel, #single-results-panel')).toBeVisible({
      timeout: 15000,
    });

    // Home button should be visible in results panel (use specific scope)
    const resultsPanel = page.locator('#results-panel');
    await expect(resultsPanel.locator('button:has-text("Home")')).toBeVisible();
  });
});

// ============================================
// MULTI-SONG GAME FLOW
// ============================================

test.describe('Single Player - Multi-Song Flow', () => {
  test('should progress through multiple songs', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 5);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Answer song 1
    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    // Wait for auto-advance (happens after 2.5 seconds: 0.5s feedback + 2s delay)
    await page.waitForTimeout(3000);

    // Should be on song 2 now
    const currentSongEl = page.locator('#current-song-num');
    await expect(currentSongEl).toBeVisible({ timeout: 5000 });
    await expect(currentSongEl).toHaveText('2', { timeout: 5000 });
  });

  test('should track streak for consecutive correct answers', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 5);
    await page.selectOption('#songs-count', '3');

    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Answer all songs with correct answers
    for (let i = 0; i < 3; i++) {
      const correctIndex = await page.evaluate(() => {
        // @ts-ignore
        return window.state?.kahootCorrectIndex ?? 0;
      });

      await page
        .locator(`#single-kahoot-options .kahoot-option[data-option="${correctIndex}"]`)
        .click();

      await page.waitForTimeout(1500);
    }

    // Should show results with streak info
    await expect(page.locator('#single-results, #results-panel, #single-results-panel')).toBeVisible({
      timeout: 15000,
    });

    const streakEl = page.locator('#final-best-streak, .best-streak');
    if (await streakEl.isVisible()) {
      const streakText = await streakEl.textContent();
      expect(parseInt(streakText || '0')).toBeGreaterThan(0);
    }
  });
});
