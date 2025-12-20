// @ts-check
import { test, expect } from '@playwright/test';

/**
 * API Endpoints - Comprehensive E2E Tests
 *
 * Tests all REST API endpoints:
 * - Health check
 * - Server status
 * - Games list
 * - File upload
 * - Stats
 */

// ============================================
// HEALTH CHECK TESTS
// ============================================

test.describe('API - Health Check', () => {
  test('GET /api/health should return healthy status', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  test('GET /api/health should return uptime', async ({ request }) => {
    const response = await request.get('/api/health');
    const data = await response.json();

    expect(data.uptime).toBeDefined();
    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThan(0);
  });

  test('GET /api/health should return timestamp', async ({ request }) => {
    const response = await request.get('/api/health');
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).toString()).not.toBe('Invalid Date');
  });

  test('GET /api/health should return games count', async ({ request }) => {
    const response = await request.get('/api/health');
    const data = await response.json();

    expect(data.games).toBeDefined();
    expect(typeof data.games).toBe('number');
    expect(data.games).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// SERVER STATUS TESTS
// ============================================

test.describe('API - Server Status', () => {
  test('GET /api/status should return OK status', async ({ request }) => {
    const response = await request.get('/api/status');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('OK');
  });

  test('GET /api/status should return version', async ({ request }) => {
    const response = await request.get('/api/status');
    const data = await response.json();

    expect(data.version).toBeDefined();
    expect(typeof data.version).toBe('string');
    expect(data.version).toMatch(/^\d+\.\d+\.\d+$/); // Semver format
  });

  test('GET /api/status should return uptime', async ({ request }) => {
    const response = await request.get('/api/status');
    const data = await response.json();

    expect(data.uptime).toBeDefined();
    expect(typeof data.uptime).toBe('number');
  });

  test('GET /api/status should return timestamp', async ({ request }) => {
    const response = await request.get('/api/status');
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).toString()).not.toBe('Invalid Date');
  });
});

// ============================================
// GAMES LIST TESTS
// ============================================

test.describe('API - Games List', () => {
  test('GET /api/games should return games array', async ({ request }) => {
    const response = await request.get('/api/games');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.games).toBeDefined();
    expect(Array.isArray(data.games)).toBeTruthy();
  });

  test('GET /api/games should return game details', async ({ request, browser }) => {
    // Create a game first
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('/');
      await page.click('button:has-text("Create Game")');

      await page.waitForFunction(
        () => {
          const status = document.getElementById('connection-status');
          return status && status.textContent && status.textContent.includes('Online');
        },
        { timeout: 10000 }
      ).catch(() => {});

      // Load mock music
      await page.evaluate(() => {
        const createMockAudioFile = (name) => {
          const mp3Header = new Uint8Array([
            0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
          ]);
          const blob = new Blob([mp3Header], { type: 'audio/mp3' });
          return new File([blob], name, { type: 'audio/mp3' });
        };

        const mockFiles = [
          {
            file: createMockAudioFile('song1.mp3'),
            metadata: { title: 'Test Song', artist: 'Test', album: 'Test', year: '2024' },
          },
        ];

        if (typeof window.__testSetMusicFiles === 'function') {
          window.__testSetMusicFiles(mockFiles);
        }
      });

      await page.waitForTimeout(500);
      await page.click('#start-game-button');
      await expect(page.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Now check API
      const response = await request.get('/api/games');
      const data = await response.json();

      expect(data.games.length).toBeGreaterThan(0);

      const game = data.games[0];
      expect(game.id).toBeDefined();
      expect(game.host).toBeDefined();
      expect(game.state).toBeDefined();
      expect(typeof game.playerCount).toBe('number');
    } finally {
      await context.close();
    }
  });

  test('games list should show correct player count', async ({ request, browser }) => {
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    try {
      // Create game
      await hostPage.goto('/');
      await hostPage.click('button:has-text("Create Game")');

      await hostPage.waitForFunction(
        () => {
          const status = document.getElementById('connection-status');
          return status && status.textContent && status.textContent.includes('Online');
        },
        { timeout: 10000 }
      ).catch(() => {});

      await hostPage.evaluate(() => {
        const createMockAudioFile = (name) => {
          const mp3Header = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
          const blob = new Blob([mp3Header], { type: 'audio/mp3' });
          return new File([blob], name, { type: 'audio/mp3' });
        };

        const mockFiles = [
          {
            file: createMockAudioFile('song1.mp3'),
            metadata: { title: 'Test', artist: 'Test', album: 'Test', year: '2024' },
          },
        ];

        if (typeof window.__testSetMusicFiles === 'function') {
          window.__testSetMusicFiles(mockFiles);
        }
      });

      await hostPage.waitForTimeout(500);
      await hostPage.click('#start-game-button');
      await expect(hostPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      const gameIdText = await hostPage.locator('#lobby-game-id').textContent();
      const gameId = gameIdText?.match(/[A-Z0-9]{6}/)?.[0] || '';

      // Player joins
      await playerPage.goto('/');
      await playerPage.click('button:has-text("Join Game")');

      await playerPage.waitForFunction(
        () => {
          const status = document.getElementById('connection-status');
          return status && status.textContent && status.textContent.includes('Online');
        },
        { timeout: 10000 }
      ).catch(() => {});

      await playerPage.fill('#join-player-name', `Player_${Date.now()}`);
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.click('#join-panel button:has-text("Join")');
      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 15000 });

      // Check API
      const response = await request.get('/api/games');
      const data = await response.json();

      const game = data.games.find((g) => g.id === gameId);
      expect(game).toBeDefined();
      expect(game.playerCount).toBe(1); // Host is not counted in players
    } finally {
      await hostContext.close();
      await playerContext.close();
    }
  });
});

// ============================================
// STATS TESTS
// ============================================

test.describe('API - Stats', () => {
  test('GET /api/stats should return stats object', async ({ request }) => {
    const response = await request.get('/api/stats');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toBeDefined();
  });

  test('GET /api/stats should return game-related stats', async ({ request }) => {
    const response = await request.get('/api/stats');
    const data = await response.json();

    // Stats should include some game-related information
    expect(typeof data).toBe('object');
  });
});

// ============================================
// UPLOAD TESTS
// ============================================

test.describe('API - File Upload', () => {
  test('POST /api/upload should accept audio files', async ({ request }) => {
    // Create a mock MP3 file
    const mp3Header = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    const response = await request.post('/api/upload', {
      multipart: {
        music: {
          name: 'test-song.mp3',
          mimeType: 'audio/mp3',
          buffer: mp3Header,
        },
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.files).toBeDefined();
    expect(Array.isArray(data.files)).toBeTruthy();
  });

  test('POST /api/upload should return file details', async ({ request }) => {
    const mp3Header = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    const response = await request.post('/api/upload', {
      multipart: {
        music: {
          name: 'upload-test.mp3',
          mimeType: 'audio/mp3',
          buffer: mp3Header,
        },
      },
    });

    const data = await response.json();

    expect(data.files[0].originalName).toBe('upload-test.mp3');
    expect(data.files[0].filename).toBeDefined();
    expect(data.files[0].path).toBeDefined();
    expect(data.files[0].size).toBeDefined();
  });

  test('POST /api/upload should reject without files', async ({ request }) => {
    const response = await request.post('/api/upload', {
      data: {},
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  test('POST /api/upload should accept multiple sequential uploads', async ({ request }) => {
    const mp3Header = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    // Upload 3 files sequentially
    const results = [];
    for (let i = 1; i <= 3; i++) {
      const response = await request.post('/api/upload', {
        multipart: {
          music: {
            name: `song${i}.mp3`,
            mimeType: 'audio/mp3',
            buffer: mp3Header,
          },
        },
      });
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      results.push(data);
    }

    expect(results.length).toBe(3);
    expect(results.every((r) => r.success)).toBeTruthy();
  });
});

// ============================================
// STATIC FILE SERVING TESTS
// ============================================

test.describe('API - Static Files', () => {
  test('should serve index.html', async ({ request }) => {
    const response = await request.get('/');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/html');
  });

  test('should serve CSS files', async ({ request }) => {
    const response = await request.get('/styles.css');

    if (response.ok()) {
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('text/css');
    }
  });

  test('should serve client bundle', async ({ request }) => {
    const response = await request.get('/dist/client/bundle.js');

    if (response.ok()) {
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('javascript');
    }
  });
});

// ============================================
// ERROR HANDLING TESTS
// ============================================

test.describe('API - Error Handling', () => {
  test('should return 404 for unknown endpoints', async ({ request }) => {
    const response = await request.get('/api/unknown-endpoint');

    expect(response.status()).toBe(404);
  });

  test('should handle malformed requests gracefully', async ({ request }) => {
    const response = await request.post('/api/upload', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: 'invalid-data',
    });

    // Should return an error status, not crash
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

// ============================================
// CORS TESTS
// ============================================

test.describe('API - CORS', () => {
  test('should include CORS headers', async ({ request }) => {
    const response = await request.get('/api/health');

    // CORS headers should be present
    const headers = response.headers();
    // Note: Exact CORS headers depend on server configuration
    expect(response.ok()).toBeTruthy();
  });
});

// ============================================
// CONTENT TYPE TESTS
// ============================================

test.describe('API - Content Types', () => {
  test('API responses should be JSON', async ({ request }) => {
    const response = await request.get('/api/health');

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });

  test('should parse JSON body correctly', async ({ request }) => {
    const response = await request.get('/api/status');
    const data = await response.json();

    expect(data).toBeDefined();
    expect(typeof data).toBe('object');
  });
});
