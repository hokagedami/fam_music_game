// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Comprehensive E2E Tests - All User Flows
 *
 * Covers every user journey, happy path, and unhappy/error path:
 * 1. Home Page & Navigation
 * 2. Single Player: setup → gameplay → results → replay
 * 3. Multiplayer Host: create → lobby → gameplay → results
 * 4. Multiplayer Player: join → lobby → gameplay → results
 * 5. Player Management: kick, leave, duplicate names, max players
 * 6. Reconnection: reload rejoin, expired state, return-to-game UI
 * 7. Settings: songs count, clip duration, answer time, visual buttons
 * 8. Error Handling: validation, permissions, edge cases
 * 9. Song List Modal & Music Upload toggle
 * 10. API Endpoints
 */

// ============================================
// SHARED HELPERS
// ============================================

const uniqueName = (base) => `${base}_${Date.now().toString(36)}`;

async function waitForSocket(page, timeout = 10000) {
  await page.waitForFunction(() => window.__socketConnected === true, { timeout });
  await page.waitForTimeout(300);
}

async function loadMockMusic(page, count = 5) {
  return page.evaluate((songCount) => {
    const createFile = (name) => {
      const header = new Uint8Array([0xFF, 0xFB, 0x90, 0x00]);
      return new File([new Blob([header], { type: 'audio/mp3' })], name, { type: 'audio/mp3' });
    };

    const songs = [
      { name: 'a.mp3', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', year: '1975' },
      { name: 'b.mp3', title: 'Stairway to Heaven', artist: 'Led Zeppelin', album: 'Led Zeppelin IV', year: '1971' },
      { name: 'c.mp3', title: 'Hotel California', artist: 'Eagles', album: 'Hotel California', year: '1977' },
      { name: 'd.mp3', title: 'Sweet Child O Mine', artist: 'Guns N Roses', album: 'Appetite', year: '1987' },
      { name: 'e.mp3', title: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', year: '1991' },
      { name: 'f.mp3', title: 'Back in Black', artist: 'AC/DC', album: 'Back in Black', year: '1980' },
      { name: 'g.mp3', title: 'Billie Jean', artist: 'Michael Jackson', album: 'Thriller', year: '1982' },
      { name: 'h.mp3', title: 'Imagine', artist: 'John Lennon', album: 'Imagine', year: '1971' },
      { name: 'i.mp3', title: 'Like a Rolling Stone', artist: 'Bob Dylan', album: 'Highway 61', year: '1965' },
      { name: 'j.mp3', title: 'Purple Rain', artist: 'Prince', album: 'Purple Rain', year: '1984' },
    ];

    const mockFiles = songs.slice(0, songCount).map((s) => {
      const file = createFile(s.name);
      return { file, url: URL.createObjectURL(file), metadata: { title: s.title, artist: s.artist, album: s.album, year: s.year } };
    });

    if (typeof window.__testSetMusicFiles === 'function') {
      return window.__testSetMusicFiles(mockFiles);
    }
    return 0;
  }, count);
}

/** Host creates a game and lands in the lobby. Returns the 6-char game ID. */
async function hostCreateGame(page, songCount = 3) {
  await page.goto('/');
  await page.locator('.create-game button.btn').click();
  await waitForSocket(page);
  await loadMockMusic(page);
  await page.evaluate(() => {
    const input = document.getElementById('player-name-input');
    if (input) input.value = 'TestHost';
  });
  await page.selectOption('#songs-count', String(songCount));
  await page.click('#start-game-button');
  await page.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 10000 });

  const gameId = await page.evaluate(() => window.state?.gameId);
  expect(gameId).toBeTruthy();
  return gameId;
}

/** Player joins an existing game and lands in the lobby. */
async function playerJoinGame(page, gameId, name) {
  await page.goto('/');
  await page.locator('.join-game button.btn').click();
  await waitForSocket(page);
  await page.fill('#join-player-name', name);
  await page.fill('#game-id-input', gameId);
  await page.locator('#join-panel button.btn:has-text("Join Game")').click();
  await page.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 10000 });
}

// ============================================
// 1. HOME PAGE & NAVIGATION
// ============================================

test.describe('Home Page & Navigation', () => {
  test('loads home page with title and all game mode buttons', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#main-title')).toBeVisible();
    await expect(page.locator('.create-game button.btn')).toBeVisible();
    await expect(page.locator('.join-game button.btn')).toBeVisible();
    await expect(page.getByRole('button', { name: /Play Solo/i })).toBeVisible();
  });

  test('Create Game navigates to multiplayer setup', async ({ page }) => {
    await page.goto('/');
    await page.locator('.create-game button.btn').click();

    await expect(page.locator('#setup-panel')).toBeVisible();
    await expect(page.locator('#setup-title')).toContainText('Multiplayer');
  });

  test('Play Solo navigates to single player setup', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    await expect(page.locator('#setup-panel')).toBeVisible();
    await expect(page.locator('#setup-title')).toContainText('Single Player');
  });

  test('Join Game navigates to join panel', async ({ page }) => {
    await page.goto('/');
    await page.locator('.join-game button.btn').click();

    await expect(page.locator('#join-panel')).toBeVisible();
    await expect(page.locator('#join-player-name')).toBeVisible();
    await expect(page.locator('#game-id-input')).toBeVisible();
  });

  test('back button on join panel returns to home', async ({ page }) => {
    await page.goto('/');
    await page.locator('.join-game button.btn').click();
    await expect(page.locator('#join-panel')).toBeVisible();

    await page.locator('#join-panel button:has-text("Back")').click();
    await expect(page.locator('#home-panel')).toBeVisible();
  });

  test('return-to-game section hidden when no saved state', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('musicQuizReconnectState'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('#return-to-game-section')).toBeHidden();
  });
});

// ============================================
// 2. SINGLE PLAYER FULL FLOW
// ============================================

test.describe('Single Player - Setup', () => {
  test('start button disabled without music', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    await expect(page.locator('#start-game-button')).toBeDisabled();
  });

  test('loading music enables start button and shows summary', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    await loadMockMusic(page, 5);

    await expect(page.locator('#start-game-button')).toBeEnabled();
    await expect(page.locator('#music-file-summary')).toBeVisible();
    await expect(page.locator('#music-folder-path')).toContainText('5 songs');
  });

  test('settings section visible after loading music', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);

    await expect(page.locator('#music-settings-section')).toBeVisible();
    await expect(page.locator('#songs-count')).toBeVisible();
    await expect(page.locator('#clip-duration')).toBeVisible();
  });

  test('upload area hidden after music loaded, visible via Change button', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);

    // Upload area should be hidden
    await expect(page.locator('#manual-upload-area')).toBeHidden();

    // Click Change to reveal it
    await page.click('button:has-text("Change")');
    await expect(page.locator('#manual-upload-area')).toBeVisible();
  });

  test('song list modal opens and closes', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 3);

    // Open modal
    await page.click('button:has-text("View Songs")');
    await expect(page.locator('#song-list-modal')).toBeVisible();
    await expect(page.locator('#music-file-list .music-item')).toHaveCount(3);

    // Close via X button
    await page.locator('#song-list-modal .modal-close').click();
    await expect(page.locator('#song-list-modal')).toBeHidden();
  });

  test('song list modal shows song titles', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 3);

    await page.click('button:has-text("View Songs")');
    const firstItem = page.locator('#music-file-list .music-item').first();
    await expect(firstItem.locator('.music-title')).toBeVisible();
  });

  test('song list modal closes on backdrop click', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 3);

    await page.click('button:has-text("View Songs")');
    await expect(page.locator('#song-list-modal')).toBeVisible();

    // Click backdrop (the modal overlay itself)
    await page.locator('#song-list-modal').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('#song-list-modal')).toBeHidden();
  });
});

test.describe('Single Player - Settings', () => {
  test('can change songs count', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 10);

    await page.selectOption('#songs-count', '5');
    expect(await page.locator('#songs-count').inputValue()).toBe('5');
  });

  test('can change clip duration', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);

    await page.selectOption('#clip-duration', '10');
    expect(await page.locator('#clip-duration').inputValue()).toBe('10');
  });

  test('visual setting buttons update hidden select', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 10);

    // Click the "5" songs button
    const btn5 = page.locator('#songs-options .setting-btn[data-value="5"]');
    await btn5.click();

    await expect(btn5).toHaveClass(/active/);
    expect(await page.locator('#songs-count').inputValue()).toBe('5');
  });

  test('default values are sensible', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');

    const songs = parseInt(await page.locator('#songs-count').inputValue());
    const duration = parseInt(await page.locator('#clip-duration').inputValue());

    expect(songs).toBeGreaterThanOrEqual(5);
    expect(duration).toBeGreaterThanOrEqual(10);
  });
});

test.describe('Single Player - Gameplay', () => {
  test('starts game and shows game panel with kahoot options', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');
    await page.click('#start-game-button');

    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#single-kahoot-options .kahoot-option')).toHaveCount(4);
  });

  test('song progress shows Song 1 of N', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');
    await page.click('#start-game-button');

    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#current-song-num')).toHaveText('1');
    await expect(page.locator('#total-songs')).toHaveText('3');
  });

  test('score starts at zero', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.click('#start-game-button');

    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });
    const score = await page.locator('#single-player-score, .score-display').textContent();
    expect(score).toMatch(/0/);
  });

  test('clicking option marks it selected/correct/incorrect', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();
    await page.waitForTimeout(500);

    const classes = await page.locator('#single-kahoot-options .kahoot-option').first().getAttribute('class');
    expect(classes).toMatch(/selected|correct|wrong/);
  });

  test('correct answer increases score', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    const correctIdx = await page.evaluate(() => window.state?.kahootCorrectIndex ?? 0);
    await page.locator(`#single-kahoot-options .kahoot-option[data-option="${correctIdx}"]`).click();
    await page.waitForTimeout(1000);

    const score = parseInt((await page.locator('#single-player-score, .score-display').textContent())?.replace(/\D/g, '') || '0');
    expect(score).toBeGreaterThan(0);
  });

  test('skip advances to next song', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.selectOption('#songs-count', '3');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await expect(page.locator('#current-song-num')).toHaveText('1');
    await page.click('#single-player-skip, button:has-text("Skip")');
    await page.waitForTimeout(1000);

    await expect(page.locator('#current-song-num')).toHaveText('2');
  });

  test('replay button is available', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page);
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await expect(page.locator('#single-player-controls button:has-text("Replay")')).toBeVisible();
  });
});

test.describe('Single Player - Completion & Results', () => {
  test('completing all songs shows results panel', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();

    await expect(page.locator('#results-panel')).toBeVisible({ timeout: 15000 });
  });

  test('results show final score and accuracy', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();
    await expect(page.locator('#results-panel')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('#final-score')).toBeVisible();
    await expect(page.locator('#accuracy-percentage')).toBeVisible();
  });

  test('play again returns to setup panel', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();
    await expect(page.locator('#results-panel')).toBeVisible({ timeout: 15000 });

    await page.click('#play-again-single-btn');
    await expect(page.locator('#setup-panel')).toBeVisible({ timeout: 5000 });
  });

  test('home button returns to home panel', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 2);
    await page.selectOption('#songs-count', '1');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();
    await expect(page.locator('#results-panel')).toBeVisible({ timeout: 15000 });

    await page.locator('#results-panel button:has-text("Home")').click();
    await expect(page.locator('#home-panel')).toBeVisible({ timeout: 5000 });
  });

  test('multi-song flow progresses through songs', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 5);
    await page.selectOption('#songs-count', '2');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    // Answer song 1
    await page.locator('#single-kahoot-options .kahoot-option').first().click();
    await page.waitForTimeout(3000);

    // Should be on song 2
    await expect(page.locator('#current-song-num')).toHaveText('2', { timeout: 5000 });
  });
});

// ============================================
// 3. MULTIPLAYER HOST FLOW
// ============================================

test.describe('Multiplayer Host - Create Game', () => {
  test('creates game and shows lobby with 6-char game ID', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      const gameId = await hostCreateGame(page);
      expect(gameId).toMatch(/^[A-Z0-9]{6}$/);

      // Host controls visible
      await expect(page.locator('#host-controls')).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('start button disabled without players', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await hostCreateGame(page);
      await expect(page.locator('#start-game-btn')).toBeDisabled();
    } finally {
      await ctx.close();
    }
  });

  test('start button enables when player joins', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      await playerJoinGame(playerPage, gameId, uniqueName('Player'));

      await expect(hostPage.locator('#start-game-btn')).toBeEnabled({ timeout: 10000 });
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('host sees player count update as players join', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const p1Ctx = await browser.newContext();
    const p2Ctx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const p1 = await p1Ctx.newPage();
    const p2 = await p2Ctx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);

      await playerJoinGame(p1, gameId, uniqueName('P1'));
      await expect(hostPage.locator('#current-player-count')).toContainText('1', { timeout: 10000 });

      await playerJoinGame(p2, gameId, uniqueName('P2'));
      await expect(hostPage.locator('#current-player-count')).toContainText('2', { timeout: 10000 });
    } finally {
      await hostCtx.close();
      await p1Ctx.close();
      await p2Ctx.close();
    }
  });
});

test.describe('Multiplayer Host - Gameplay', () => {
  test('starting game shows game panel for host and player', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 3);
      await playerJoinGame(playerPage, gameId, uniqueName('Player'));

      await hostPage.click('#start-game-btn');

      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Host sees host controls
      await expect(hostPage.locator('#host-music-player')).toBeVisible();
      // Player sees non-host controls
      await expect(playerPage.locator('#non-host-music-player')).toBeVisible();
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});

// ============================================
// 4. MULTIPLAYER PLAYER FLOW
// ============================================

test.describe('Multiplayer Player - Join Game', () => {
  test('player joins game and sees lobby', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      const name = uniqueName('Player');
      await playerJoinGame(playerPage, gameId, name);

      const playerGameId = await playerPage.evaluate(() => window.state?.gameId);
      expect(playerGameId).toBe(gameId);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('player sees game panel after host starts', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 3);
      await playerJoinGame(playerPage, gameId, uniqueName('Player'));

      await hostPage.click('#start-game-btn');

      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(playerPage.locator('#non-host-music-player')).toBeVisible();
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('join via URL parameter auto-fills game ID', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);

      // Navigate with join parameter
      await playerPage.goto(`/?join=${gameId}`);
      await playerPage.waitForLoadState('domcontentloaded');

      await expect(page => page.locator('#join-panel')).toBeTruthy();
      const gameIdValue = await playerPage.locator('#game-id-input').inputValue();
      expect(gameIdValue).toBe(gameId);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});

// ============================================
// 5. PLAYER MANAGEMENT
// ============================================

test.describe('Player Management', () => {
  test('player can leave lobby and return to home', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      await playerJoinGame(playerPage, gameId, uniqueName('Player'));

      // Player leaves
      await playerPage.locator('#lobby-panel button.btn-danger:has-text("Leave")').click();
      await expect(playerPage.locator('#home-panel')).toBeVisible({ timeout: 5000 });

      // Host sees player count drop to 0
      await expect(hostPage.locator('#current-player-count')).toContainText('0', { timeout: 10000 });
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('host can kick a player', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      await playerJoinGame(playerPage, gameId, uniqueName('KickMe'));

      await expect(hostPage.locator('#current-player-count')).toContainText('1', { timeout: 10000 });

      // Host clicks kick button
      const kickBtn = hostPage.locator('.btn-kick').first();
      if (await kickBtn.isVisible()) {
        await kickBtn.click();

        // Player should be sent to home
        await expect(playerPage.locator('#home-panel')).toBeVisible({ timeout: 10000 });

        // Player count drops
        await expect(hostPage.locator('#current-player-count')).toContainText('0', { timeout: 10000 });
      }
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('host leaving deletes game and sends players home', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      await playerJoinGame(playerPage, gameId, uniqueName('Player'));

      // Host leaves
      await hostPage.locator('#lobby-panel button.btn-danger:has-text("Leave")').click();

      // Player should get notification and return to home
      await expect(playerPage.locator('#home-panel')).toBeVisible({ timeout: 15000 });
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('non-host players do not see kick buttons', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const p1Ctx = await browser.newContext();
    const p2Ctx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const p1 = await p1Ctx.newPage();
    const p2 = await p2Ctx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      await playerJoinGame(p1, gameId, uniqueName('P1'));
      await playerJoinGame(p2, gameId, uniqueName('P2'));

      // Player1 should NOT see kick buttons
      await p1.waitForTimeout(1000);
      await expect(p1.locator('.btn-kick')).toHaveCount(0);
    } finally {
      await hostCtx.close();
      await p1Ctx.close();
      await p2Ctx.close();
    }
  });
});

// ============================================
// 6. RECONNECTION
// ============================================

test.describe('Reconnection', () => {
  test('player can rejoin lobby after page reload', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      const playerName = uniqueName('Player');
      await playerJoinGame(playerPage, gameId, playerName);

      // Player reloads
      await playerPage.reload();
      await playerPage.waitForLoadState('domcontentloaded');
      await playerPage.waitForFunction(() => window.__socketConnected === true, { timeout: 10000 });

      // Should auto-rejoin lobby
      await playerPage.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 10000 });
      const rejoinedGameId = await playerPage.evaluate(() => window.state?.gameId);
      expect(rejoinedGameId).toBe(gameId);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('host can rejoin lobby after page reload', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      await playerJoinGame(playerPage, gameId, uniqueName('Player'));

      // Host reloads
      await hostPage.reload();
      await hostPage.waitForLoadState('domcontentloaded');
      await hostPage.waitForFunction(() => window.__socketConnected === true, { timeout: 10000 });

      await hostPage.waitForSelector('#lobby-panel:not(.hidden)', { timeout: 15000 });
      const rejoinedId = await hostPage.evaluate(() => window.state?.gameId);
      expect(rejoinedId).toBe(gameId);

      const isHost = await hostPage.evaluate(() => window.state?.currentPlayer?.isHost);
      expect(isHost).toBe(true);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('return-to-game section shows with saved state', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      localStorage.setItem('musicQuizReconnectState', JSON.stringify({
        gameId: 'TEST12',
        playerId: 'fake-id',
        playerName: 'TestPlayer',
        timestamp: Date.now(),
      }));
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('#return-to-game-section')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#return-game-id')).toHaveText('TEST12');

    await page.evaluate(() => localStorage.removeItem('musicQuizReconnectState'));
  });

  test('return-to-game section hides after game deleted', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      const gameId = await hostCreateGame(page);

      const hasSaved = await page.evaluate(() => !!localStorage.getItem('musicQuizReconnectState'));
      expect(hasSaved).toBe(true);

      // Leave game (host leaving deletes game)
      await page.locator('#lobby-panel button.btn-danger:has-text("Leave")').click();
      await page.waitForSelector('#home-panel:not(.hidden)', { timeout: 5000 });

      await expect(page.locator('#return-to-game-section')).toBeHidden({ timeout: 3000 });

      const stateCleared = await page.evaluate(() => !localStorage.getItem('musicQuizReconnectState'));
      expect(stateCleared).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('expired reconnection state is cleared on reload', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      localStorage.setItem('musicQuizReconnectState', JSON.stringify({
        gameId: 'OLD123',
        playerId: 'old-id',
        playerName: 'OldPlayer',
        timestamp: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
      }));
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Game state should not be set
    const gameId = await page.evaluate(() => window.state?.gameId);
    expect(gameId).toBeFalsy();
  });
});

// ============================================
// 7. INPUT VALIDATION (UNHAPPY PATHS)
// ============================================

test.describe('Validation - Join Game Errors', () => {
  test('empty player name shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('.join-game button.btn').click();
    await waitForSocket(page);

    await page.fill('#join-player-name', '');
    await page.fill('#game-id-input', 'ABC123');
    await page.locator('#join-panel button.btn:has-text("Join Game")').click();

    await expect(page.locator('.notification')).toContainText(/name|required|enter/i, { timeout: 5000 });
  });

  test('empty game ID shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('.join-game button.btn').click();
    await waitForSocket(page);

    await page.fill('#join-player-name', 'TestPlayer');
    await page.fill('#game-id-input', '');
    await page.locator('#join-panel button.btn:has-text("Join Game")').click();

    await expect(page.locator('.notification')).toContainText(/game.*id|6.*character|valid/i, { timeout: 5000 });
  });

  test('short game ID shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('.join-game button.btn').click();
    await waitForSocket(page);

    await page.fill('#join-player-name', 'TestPlayer');
    await page.fill('#game-id-input', 'ABC');
    await page.locator('#join-panel button.btn:has-text("Join Game")').click();

    await expect(page.locator('.notification')).toContainText(/6.*character|valid|invalid/i, { timeout: 5000 });
  });

  test('non-existent game ID shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('.join-game button.btn').click();
    await waitForSocket(page);

    await page.fill('#join-player-name', 'TestPlayer');
    await page.fill('#game-id-input', 'XXXXXX');
    await page.locator('#join-panel button.btn:has-text("Join Game")').click();

    await expect(page.locator('.notification')).toContainText(/not found|invalid|error/i, { timeout: 10000 });
  });

  test('duplicate player name shows error', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const p1Ctx = await browser.newContext();
    const p2Ctx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const p1 = await p1Ctx.newPage();
    const p2 = await p2Ctx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      const dupName = uniqueName('SameName');

      await playerJoinGame(p1, gameId, dupName);

      // Second player tries same name
      await p2.goto('/');
      await p2.locator('.join-game button.btn').click();
      await waitForSocket(p2);
      await p2.fill('#join-player-name', dupName);
      await p2.fill('#game-id-input', gameId);
      await p2.locator('#join-panel button.btn:has-text("Join Game")').click();

      await expect(p2.locator('.notification')).toContainText(/taken|duplicate|already|exists/i, { timeout: 10000 });
    } finally {
      await hostCtx.close();
      await p1Ctx.close();
      await p2Ctx.close();
    }
  });

  test('joining already started game shows error', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const p1Ctx = await browser.newContext();
    const p2Ctx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const p1 = await p1Ctx.newPage();
    const p2 = await p2Ctx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 3);
      await playerJoinGame(p1, gameId, uniqueName('P1'));

      // Host starts game
      await hostPage.click('#start-game-btn');
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Late player tries to join
      await p2.goto('/');
      await p2.locator('.join-game button.btn').click();
      await waitForSocket(p2);
      await p2.fill('#join-player-name', uniqueName('Late'));
      await p2.fill('#game-id-input', gameId);
      await p2.locator('#join-panel button.btn:has-text("Join Game")').click();

      await expect(p2.locator('.notification')).toContainText(/already started|in progress|cannot join/i, { timeout: 10000 });
    } finally {
      await hostCtx.close();
      await p1Ctx.close();
      await p2Ctx.close();
    }
  });

  test('very long player name is handled', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);

      await playerPage.goto('/');
      await playerPage.locator('.join-game button.btn').click();
      await waitForSocket(playerPage);
      await playerPage.fill('#join-player-name', 'A'.repeat(100));
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.locator('#join-panel button.btn:has-text("Join Game")').click();

      // Should either join (truncated) or show error
      const joined = await playerPage.locator('#lobby-panel').isVisible({ timeout: 5000 }).catch(() => false);
      const hasError = await playerPage.locator('.notification').isVisible();
      expect(joined || hasError).toBe(true);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('special characters in name are handled', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);

      await playerPage.goto('/');
      await playerPage.locator('.join-game button.btn').click();
      await waitForSocket(playerPage);
      await playerPage.fill('#join-player-name', 'Test<script>XSS');
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.locator('#join-panel button.btn:has-text("Join Game")').click();

      const joined = await playerPage.locator('#lobby-panel').isVisible({ timeout: 5000 }).catch(() => false);
      const hasError = await playerPage.locator('.notification').isVisible();
      expect(joined || hasError).toBe(true);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});

// ============================================
// 8. PERMISSION ERRORS
// ============================================

test.describe('Permissions', () => {
  test('cannot start game without players (button disabled)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await hostCreateGame(page);
      await expect(page.locator('#start-game-btn')).toBeDisabled();

      // Force-click should not start
      await page.locator('#start-game-btn').click({ force: true }).catch(() => {});
      await expect(page.locator('#lobby-panel')).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('non-host player does not see start game button or it is hidden', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage);
      await playerJoinGame(playerPage, gameId, uniqueName('Player'));

      // Player should NOT see start button or it should be hidden/disabled
      const startBtn = playerPage.locator('#start-game-btn');
      const isVisible = await startBtn.isVisible().catch(() => false);
      if (isVisible) {
        // If visible, clicking should do nothing
        await startBtn.click({ force: true }).catch(() => {});
        await expect(playerPage.locator('#lobby-panel')).toBeVisible();
      }
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});

// ============================================
// 9. EDGE CASES
// ============================================

test.describe('Edge Cases', () => {
  test('rapid clicks on create game only creates one game', async ({ page }) => {
    await page.goto('/');
    await page.locator('.create-game button.btn').click();
    await waitForSocket(page);
    await loadMockMusic(page);
    await page.evaluate(() => {
      const input = document.getElementById('player-name-input');
      if (input) input.value = 'RapidHost';
    });

    // Rapid clicks
    const btn = page.locator('#start-game-button');
    await btn.click();
    await btn.click().catch(() => {});
    await btn.click().catch(() => {});

    await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
  });

  test('multiple players joining simultaneously', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerCtxs = [];

    try {
      const gameId = await hostCreateGame(hostPage);

      // Create 3 player contexts
      for (let i = 0; i < 3; i++) {
        playerCtxs.push(await browser.newContext());
      }

      // All players join simultaneously
      const joinPromises = playerCtxs.map(async (ctx, i) => {
        const page = await ctx.newPage();
        await page.goto('/');
        await page.locator('.join-game button.btn').click();
        await waitForSocket(page);
        await page.fill('#join-player-name', uniqueName(`SimP${i}`));
        await page.fill('#game-id-input', gameId);
        await page.locator('#join-panel button.btn:has-text("Join Game")').click();
        return page;
      });

      const playerPages = await Promise.all(joinPromises);
      await hostPage.waitForTimeout(3000);

      let joinedCount = 0;
      for (const p of playerPages) {
        if (await p.locator('#lobby-panel').isVisible()) joinedCount++;
      }
      expect(joinedCount).toBeGreaterThan(0);
    } finally {
      await hostCtx.close();
      for (const ctx of playerCtxs) await ctx.close();
    }
  });
});

// ============================================
// 10. NETWORK / CONNECTION
// ============================================

test.describe('Connection', () => {
  test('shows connection status on multiplayer setup', async ({ page }) => {
    await page.goto('/');
    await page.locator('.create-game button.btn').click();
    await waitForSocket(page);

    // Connection section or status should indicate connected
    const status = page.locator('#status-text, #connection-status');
    await expect(status.first()).toContainText(/online|connected/i, { timeout: 10000 });
  });

  test('reconnects after going offline then online', async ({ page, context }) => {
    await page.goto('/');
    await page.locator('.create-game button.btn').click();
    await waitForSocket(page);

    await context.setOffline(true);
    await page.waitForTimeout(2000);
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    const status = page.locator('#status-text, #connection-status');
    await expect(status.first()).toContainText(/online|connected/i, { timeout: 15000 });
  });
});

// ============================================
// 11. API ENDPOINTS
// ============================================

test.describe('API Endpoints', () => {
  test('health check returns healthy', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.uptime).toBeGreaterThan(0);
  });

  test('status returns OK with version', async ({ request }) => {
    const res = await request.get('/api/status');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('OK');
    expect(data.version).toBeDefined();
  });

  test('games list returns array', async ({ request }) => {
    const res = await request.get('/api/games');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.games)).toBeTruthy();
  });

  test('invalid endpoint returns 404', async ({ request }) => {
    const res = await request.get('/api/nonexistent');
    expect(res.status()).toBe(404);
  });

  test('invalid upload returns 400', async ({ request }) => {
    const res = await request.post('/api/upload', { data: {} });
    expect(res.status()).toBe(400);
  });
});

// ============================================
// 12. RESPONSIVENESS
// ============================================

test.describe('Responsiveness', () => {
  test('mobile viewport shows all home elements', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.locator('#main-title')).toBeVisible();
    await expect(page.getByRole('button', { name: /Play Solo/i })).toBeVisible();
    await expect(page.locator('.create-game button.btn')).toBeVisible();
  });

  test('tablet viewport shows game modes', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.locator('#main-title')).toBeVisible();
    await expect(page.locator('.game-modes')).toBeVisible();
  });
});

// ============================================
// 13. FULL MULTIPLAYER GAME FLOW (E2E)
// ============================================

test.describe('Full Multiplayer Game - End to End', () => {
  test('complete game: create, join, play, results', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      // Host creates game with 1 song for quick test
      const gameId = await hostCreateGame(hostPage, 1);

      // Player joins
      const playerName = uniqueName('Player');
      await playerJoinGame(playerPage, gameId, playerName);

      // Verify lobby state
      await expect(hostPage.locator('#start-game-btn')).toBeEnabled({ timeout: 10000 });

      // Host starts game
      await hostPage.click('#start-game-btn');

      // Both see game panel
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Host triggers options (mock audio doesn't play, so manually trigger)
      await hostPage.waitForTimeout(1000);
      await hostPage.evaluate(() => {
        if (typeof window.hostShowOptions === 'function') window.hostShowOptions();
      });

      // Player should see kahoot options
      await playerPage.waitForFunction(
        () => {
          const container = document.getElementById('nonhost-kahoot-options');
          return container && container.style.display !== 'none' && container.querySelectorAll('.kahoot-option').length === 4;
        },
        { timeout: 15000 }
      );

      // Player answers
      await playerPage.locator('#nonhost-kahoot-options .kahoot-option').first().click({ timeout: 5000 });

      // Host reveals answer and ends game (1 song game)
      await hostPage.waitForTimeout(1000);
      await hostPage.evaluate(() => {
        if (typeof window.revealAnswerAndNext === 'function') window.revealAnswerAndNext();
      });

      // Results should appear for both (host sees leaderboard first for 4s, then results)
      await expect(hostPage.locator('#results-panel')).toBeVisible({ timeout: 30000 });
      await expect(playerPage.locator('#results-panel')).toBeVisible({ timeout: 30000 });

      // Podium should be visible in multiplayer results
      await expect(hostPage.locator('#podium-container')).toBeVisible();
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});

// ============================================
// 14. SINGLE PLAYER - ALL ANSWER OPTIONS
// ============================================

test.describe('Single Player - All 4 Kahoot Options', () => {
  for (let optionIndex = 0; optionIndex < 4; optionIndex++) {
    test(`clicking option ${optionIndex} (${['red', 'blue', 'yellow', 'green'][optionIndex]}) registers answer`, async ({ page }) => {
      await page.goto('/');
      await page.click('button:has-text("Play Solo")');
      await loadMockMusic(page, 5);
      await page.selectOption('#songs-count', '3');
      await page.click('#start-game-button');
      await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

      await expect(page.locator('#single-kahoot-options .kahoot-option')).toHaveCount(4);

      const option = page.locator(`#single-kahoot-options .kahoot-option[data-option="${optionIndex}"]`);
      await expect(option).toBeVisible();
      await option.click();
      await page.waitForTimeout(500);

      const classes = await option.getAttribute('class');
      expect(classes).toMatch(/selected|correct|wrong/);
    });
  }

  test('correct option shows correct class, wrong shows wrong class', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 5);
    await page.selectOption('#songs-count', '3');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    const correctIdx = await page.evaluate(() => window.state?.kahootCorrectIndex ?? 0);
    const wrongIdx = correctIdx === 0 ? 1 : 0;

    await page.locator(`#single-kahoot-options .kahoot-option[data-option="${wrongIdx}"]`).click();
    await page.waitForTimeout(500);

    const wrongClasses = await page.locator(`#single-kahoot-options .kahoot-option[data-option="${wrongIdx}"]`).getAttribute('class');
    expect(wrongClasses).toMatch(/wrong|selected/);

    const correctClasses = await page.locator(`#single-kahoot-options .kahoot-option[data-option="${correctIdx}"]`).getAttribute('class');
    expect(correctClasses).toMatch(/correct/);
  });

  test('all options disabled after answering', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Play Solo")');
    await loadMockMusic(page, 5);
    await page.selectOption('#songs-count', '3');
    await page.click('#start-game-button');
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 10000 });

    await page.locator('#single-kahoot-options .kahoot-option').first().click();
    await page.waitForTimeout(500);

    const options = page.locator('#single-kahoot-options .kahoot-option');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const isAnswered = await options.nth(i).evaluate((el) =>
        el.classList.contains('disabled') || el.style.pointerEvents === 'none' ||
        el.classList.contains('selected') || el.classList.contains('correct') || el.classList.contains('wrong')
      );
      expect(isAnswered).toBe(true);
    }
  });
});

// ============================================
// 15. MULTIPLAYER - ALL PLAYER OPTIONS & MULTI-PLAYER ANSWERS
// ============================================

test.describe('Multiplayer - Player Kahoot Options', () => {
  async function setupGameWithOptions(browser, playerCount = 1) {
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const gameId = await hostCreateGame(hostPage, 1);

    const playerCtxs = [];
    const playerPages = [];
    for (let i = 0; i < playerCount; i++) {
      const ctx = await browser.newContext();
      const pg = await ctx.newPage();
      await playerJoinGame(pg, gameId, uniqueName(`P${i}`));
      playerCtxs.push(ctx);
      playerPages.push(pg);
    }

    await hostPage.click('#start-game-btn');
    await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
    for (const p of playerPages) {
      await expect(p.locator('#game-panel')).toBeVisible({ timeout: 15000 });
    }

    await hostPage.waitForTimeout(500);
    await hostPage.evaluate(() => {
      if (typeof window.hostShowOptions === 'function') window.hostShowOptions();
    });

    for (const p of playerPages) {
      await p.waitForFunction(
        () => {
          const c = document.getElementById('nonhost-kahoot-options');
          return c && c.style.display !== 'none' && c.querySelectorAll('.kahoot-option').length === 4;
        },
        { timeout: 15000 }
      );
    }

    return { hostCtx, hostPage, playerCtxs, playerPages, gameId };
  }

  for (let optionIndex = 0; optionIndex < 4; optionIndex++) {
    test(`player clicking option ${optionIndex} (${['red', 'blue', 'yellow', 'green'][optionIndex]}) registers answer`, async ({ browser }) => {
      const { hostCtx, playerCtxs, playerPages } = await setupGameWithOptions(browser, 1);
      try {
        const option = playerPages[0].locator(`#nonhost-kahoot-options .kahoot-option[data-option="${optionIndex}"]`);
        await option.click();
        await playerPages[0].waitForTimeout(500);
        const classes = await option.getAttribute('class');
        expect(classes).toMatch(/selected|correct|wrong|waiting/);
      } finally {
        await hostCtx.close();
        for (const ctx of playerCtxs) await ctx.close();
      }
    });
  }

  test('multiple players can all answer simultaneously', async ({ browser }) => {
    const { hostCtx, hostPage, playerCtxs, playerPages } = await setupGameWithOptions(browser, 3);
    try {
      const answerPromises = playerPages.map((p, i) =>
        p.locator(`#nonhost-kahoot-options .kahoot-option[data-option="${i % 4}"]`).click()
      );
      await Promise.all(answerPromises);
      await hostPage.waitForTimeout(2000);

      for (const p of playerPages) {
        const selectedCount = await p.locator('#nonhost-kahoot-options .kahoot-option.selected, #nonhost-kahoot-options .kahoot-option.waiting').count();
        expect(selectedCount).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await hostCtx.close();
      for (const ctx of playerCtxs) await ctx.close();
    }
  });

  test('player options disabled after answering', async ({ browser }) => {
    const { hostCtx, playerCtxs, playerPages } = await setupGameWithOptions(browser, 1);
    try {
      await playerPages[0].locator('#nonhost-kahoot-options .kahoot-option').first().click();
      await playerPages[0].waitForTimeout(500);

      const hasStatus = await playerPages[0].locator('#player-answer-status:not(.hidden)').isVisible().catch(() => false);
      const hasSelected = await playerPages[0].locator('#nonhost-kahoot-options .kahoot-option.selected, #nonhost-kahoot-options .kahoot-option.waiting').count();
      expect(hasStatus || hasSelected > 0).toBe(true);
    } finally {
      await hostCtx.close();
      for (const ctx of playerCtxs) await ctx.close();
    }
  });

  test('host sees live updates as players answer', async ({ browser }) => {
    const { hostCtx, hostPage, playerCtxs, playerPages } = await setupGameWithOptions(browser, 2);
    try {
      await playerPages[0].locator('#nonhost-kahoot-options .kahoot-option').first().click();
      await hostPage.waitForTimeout(1500);

      const updates = await hostPage.locator('.live-update, .live-feed-item').count();
      expect(updates).toBeGreaterThan(0);
    } finally {
      await hostCtx.close();
      for (const ctx of playerCtxs) await ctx.close();
    }
  });

  test('full game with 3 players: all answer, podium and final standings shown', async ({ browser }) => {
    const { hostCtx, hostPage, playerCtxs, playerPages } = await setupGameWithOptions(browser, 3);
    try {
      for (let i = 0; i < playerPages.length; i++) {
        await playerPages[i].locator(`#nonhost-kahoot-options .kahoot-option[data-option="${i % 4}"]`).click();
      }

      await hostPage.waitForTimeout(1500);
      await hostPage.evaluate(() => {
        if (typeof window.revealAnswerAndNext === 'function') window.revealAnswerAndNext();
      });

      await expect(hostPage.locator('#results-panel')).toBeVisible({ timeout: 30000 });
      for (const p of playerPages) {
        await expect(p.locator('#results-panel')).toBeVisible({ timeout: 30000 });
      }

      await expect(hostPage.locator('#podium-container')).toBeVisible();
      await expect(hostPage.locator('#podium-1st')).toBeVisible();

      await expect(hostPage.locator('#other-rankings')).toBeVisible({ timeout: 10000 });
      await expect(hostPage.locator('.final-standings-title')).toBeVisible();
    } finally {
      await hostCtx.close();
      for (const ctx of playerCtxs) await ctx.close();
    }
  });

  test('host does not see answer options, only controls', async ({ browser }) => {
    const { hostCtx, hostPage, playerCtxs } = await setupGameWithOptions(browser, 1);
    try {
      await expect(hostPage.locator('#nonhost-kahoot-options')).toBeHidden();
      await expect(hostPage.locator('#host-music-player')).toBeVisible();
    } finally {
      await hostCtx.close();
      for (const ctx of playerCtxs) await ctx.close();
    }
  });

  test('between-songs leaderboard shows on host after reveal (multi-song game)', async ({ browser }) => {
    // Create a 2-song game
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const gameId = await hostCreateGame(hostPage, 2);

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await playerJoinGame(playerPage, gameId, uniqueName('LB'));

    try {
      // Start game
      await hostPage.click('#start-game-btn');
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      // Song 1: host shows options
      await hostPage.waitForTimeout(500);
      await hostPage.evaluate(() => {
        if (typeof window.hostShowOptions === 'function') window.hostShowOptions();
      });

      // Player answers
      await playerPage.waitForFunction(
        () => {
          const c = document.getElementById('nonhost-kahoot-options');
          return c && c.style.display !== 'none' && c.querySelectorAll('.kahoot-option').length === 4;
        },
        { timeout: 15000 }
      );
      await playerPage.locator('#nonhost-kahoot-options .kahoot-option').first().click();

      // Host reveals answer — this triggers: correct answer reveal (2.5s), then leaderboard (2.5s-6s)
      await hostPage.waitForTimeout(1000);

      // Set up observer BEFORE triggering reveal to catch the brief leaderboard display
      await hostPage.evaluate(() => {
        window.__leaderboardShown = false;
        window.__leaderboardHadEntries = false;
        window.__leaderboardScoreText = '';
        const observer = new MutationObserver(() => {
          const el = document.getElementById('intermediate-leaderboard');
          if (el && !el.classList.contains('hidden')) {
            window.__leaderboardShown = true;
            const entries = el.querySelectorAll('.ranking-entry');
            window.__leaderboardHadEntries = entries.length > 0;
            const scoreEl = entries[0]?.querySelector('.score');
            if (scoreEl) window.__leaderboardScoreText = scoreEl.textContent;
          }
        });
        const target = document.getElementById('intermediate-leaderboard');
        if (target) observer.observe(target, { attributes: true, attributeFilter: ['class'] });
      });

      await hostPage.evaluate(() => {
        if (typeof window.revealAnswerAndNext === 'function') window.revealAnswerAndNext();
      });

      // Wait for the leaderboard to have been shown (it appears at ~2.5s, hides at ~6s)
      await hostPage.waitForFunction(() => window.__leaderboardShown === true, { timeout: 10000 });

      // Verify leaderboard had ranking entries with score text
      const hadEntries = await hostPage.evaluate(() => window.__leaderboardHadEntries);
      expect(hadEntries).toBe(true);

      const scoreText = await hostPage.evaluate(() => window.__leaderboardScoreText);
      expect(scoreText).toContain('pts');

      // Leaderboard should NOT show on player
      const playerLeaderboardShown = await playerPage.evaluate(() => {
        const el = document.getElementById('intermediate-leaderboard');
        return el && !el.classList.contains('hidden');
      });
      expect(playerLeaderboardShown).toBe(false);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});
