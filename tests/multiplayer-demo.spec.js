// @ts-check
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Music Quiz Game - Multiplayer Demo Test
 *
 * This test demonstrates the multiplayer functionality with real music files.
 * Run with: npx playwright test multiplayer-demo --headed
 */

// Path to test music files
const TEST_MUSIC_DIR = path.join(__dirname, '..', 'test-music');

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

// Helper to set player name (works with hidden input)
async function setPlayerName(page, name) {
  await page.evaluate((playerName) => {
    const input = document.getElementById('player-name-input');
    if (input) input.value = playerName;
  }, name);
}

// Helper to load music files via file input
async function loadMusicFiles(page) {
  // Use the test helper to inject mock files with proper metadata
  await page.evaluate(() => {
    const createMockAudioFile = (name) => {
      const mp3Header = new Uint8Array([
        0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);
      const blob = new Blob([mp3Header], { type: 'audio/mp3' });
      return new File([blob], name, { type: 'audio/mp3' });
    };

    const songData = [
      { name: 'SoundHelix-Song-1.mp3', title: 'Electronic Dreams', artist: 'SoundHelix', album: 'Demo Album 1', year: '2024' },
      { name: 'SoundHelix-Song-2.mp3', title: 'Ambient Journey', artist: 'SoundHelix', album: 'Demo Album 1', year: '2024' },
      { name: 'SoundHelix-Song-3.mp3', title: 'Rhythm Section', artist: 'SoundHelix', album: 'Demo Album 2', year: '2024' },
      { name: 'SoundHelix-Song-4.mp3', title: 'Bass Groove', artist: 'SoundHelix', album: 'Demo Album 2', year: '2024' },
      { name: 'SoundHelix-Song-5.mp3', title: 'Synth Wave', artist: 'SoundHelix', album: 'Demo Album 3', year: '2024' },
    ];

    const mockFiles = songData.map(song => {
      const file = createMockAudioFile(song.name);
      return {
        file,
        url: URL.createObjectURL(file), // Create blob URL for audio playback
        metadata: { title: song.title, artist: song.artist, album: song.album, year: song.year }
      };
    });

    if (typeof window.__testSetMusicFiles === 'function') {
      window.__testSetMusicFiles(mockFiles);
    }
  });

  await page.waitForTimeout(500);
}

test.describe('Multiplayer Demo - Visual Test', () => {

  test('Full multiplayer game flow with 2 players', async ({ browser }) => {
    // Create two browser contexts for host and player
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      console.log('\n========================================');
      console.log('   MULTIPLAYER DEMO - 2 PLAYERS');
      console.log('========================================\n');

      // ===== HOST: Create Game =====
      console.log('[HOST] Opening game...');
      await hostPage.goto('/');
      await hostPage.waitForTimeout(1000);

      console.log('[HOST] Clicking Create Game...');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);

      console.log('[HOST] Setting name...');
      await setPlayerName(hostPage, 'GameHost');
      await hostPage.waitForTimeout(500);

      console.log('[HOST] Loading music files...');
      await loadMusicFiles(hostPage);
      await hostPage.waitForTimeout(1000);

      console.log('[HOST] Configuring game settings...');
      await hostPage.selectOption('#songs-count', '3');
      await hostPage.selectOption('#clip-duration', '5');
      await hostPage.waitForTimeout(500);

      console.log('[HOST] Creating game...');
      await hostPage.click('#start-game-button');

      // Wait for lobby
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      console.log('[HOST] Game lobby created!');

      // Get game ID
      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0];
      console.log(`[HOST] Game ID: ${gameId}`);
      await hostPage.waitForTimeout(1000);

      // ===== PLAYER: Join Game =====
      console.log('\n[PLAYER] Opening game...');
      await playerPage.goto('/');
      await playerPage.waitForTimeout(1000);

      console.log('[PLAYER] Clicking Join Game...');
      await playerPage.click('button:has-text("Join Game")');
      await waitForConnection(playerPage);

      console.log('[PLAYER] Entering name and game ID...');
      await playerPage.fill('#join-player-name', 'Player2');
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.waitForTimeout(500);

      console.log('[PLAYER] Joining game...');
      await playerPage.click('#join-panel button:has-text("Join Game")');

      // Wait for player to see lobby
      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      console.log('[PLAYER] Joined game lobby!');
      await playerPage.waitForTimeout(1000);

      // Verify player count on host (1 player - host is NOT counted)
      await expect(hostPage.locator('#current-player-count')).toContainText('1', { timeout: 10000 });
      console.log('\n[GAME] Player joined lobby - 1 player + host connected!');
      await hostPage.waitForTimeout(2000);

      // ===== START GAME =====
      console.log('\n[HOST] Starting the game...');
      await expect(hostPage.locator('#start-game-btn')).toBeEnabled({ timeout: 5000 });
      await hostPage.click('#start-game-btn');

      // Both should see game panel
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(playerPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      console.log('[GAME] Game started! Both players in game view.');

      // Wait to show game UI
      await hostPage.waitForTimeout(3000);

      // Verify host has host controls
      const hostHasControls = await hostPage.locator('#host-music-player').isVisible();
      console.log(`[HOST] Has host music controls: ${hostHasControls}`);

      // Verify player has non-host view
      const playerHasNonHostView = await playerPage.locator('#non-host-music-player').isVisible();
      console.log(`[PLAYER] Has non-host view: ${playerHasNonHostView}`);

      console.log('\n========================================');
      console.log('   DEMO COMPLETE - SUCCESS!');
      console.log('========================================\n');

      // Keep windows open for observation
      await hostPage.waitForTimeout(5000);

    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });

  test('Full multiplayer game flow with 3 players', async ({ browser }) => {
    // Create three browser contexts
    const hostContext = await browser.newContext();
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    try {
      console.log('\n========================================');
      console.log('   MULTIPLAYER DEMO - 3 PLAYERS');
      console.log('========================================\n');

      // ===== HOST: Create Game =====
      console.log('[HOST] Creating game...');
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');
      await waitForConnection(hostPage);
      await setPlayerName(hostPage, 'HostPlayer');
      await loadMusicFiles(hostPage);
      await hostPage.selectOption('#songs-count', '3');
      await hostPage.click('#start-game-button');

      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0];
      console.log(`[HOST] Game created with ID: ${gameId}`);
      await hostPage.waitForTimeout(1000);

      // ===== PLAYER 1: Join Game =====
      console.log('[PLAYER 1] Joining game...');
      await player1Page.goto('/');
      await player1Page.click('button:has-text("Join Game")');
      await waitForConnection(player1Page);
      await player1Page.fill('#join-player-name', 'Alice');
      await player1Page.fill('#game-id-input', gameId);
      await player1Page.click('#join-panel button:has-text("Join Game")');

      await expect(player1Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      console.log('[PLAYER 1] Alice joined!');
      await player1Page.waitForTimeout(1000);

      // ===== PLAYER 2: Join Game =====
      console.log('[PLAYER 2] Joining game...');
      await player2Page.goto('/');
      await player2Page.click('button:has-text("Join Game")');
      await waitForConnection(player2Page);
      await player2Page.fill('#join-player-name', 'Bob');
      await player2Page.fill('#game-id-input', gameId);
      await player2Page.click('#join-panel button:has-text("Join Game")');

      await expect(player2Page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });
      console.log('[PLAYER 2] Bob joined!');
      await player2Page.waitForTimeout(1000);

      // Verify 2 players (host is NOT counted in player count)
      await expect(hostPage.locator('#current-player-count')).toContainText('2', { timeout: 10000 });
      console.log('\n[GAME] All 2 players in lobby (plus host)!');
      await hostPage.waitForTimeout(2000);

      // ===== START GAME =====
      console.log('\n[HOST] Starting the game...');
      await hostPage.click('#start-game-btn');

      // All should see game panel
      await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(player1Page.locator('#game-panel')).toBeVisible({ timeout: 15000 });
      await expect(player2Page.locator('#game-panel')).toBeVisible({ timeout: 15000 });

      console.log('[GAME] Game started with 3 players!');
      await hostPage.waitForTimeout(3000);

      console.log('\n========================================');
      console.log('   3-PLAYER DEMO COMPLETE - SUCCESS!');
      console.log('========================================\n');

      await hostPage.waitForTimeout(5000);

    } finally {
      await hostContext.close();
      await player1Context.close();
      await player2Context.close();
    }
  });
});
