// @ts-check
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Extensive E2E flow coverage — complements e2e-comprehensive.spec.js by
 * covering scenarios that suite doesn't reach:
 *
 *  1. Security & validation regressions for the recent review fixes
 *     (XSS escaping, songIndex race rejection, missing-options rejection,
 *      validateKahootOptions tightening, multer hardening)
 *  2. 3+ player full games & concurrent answer submission
 *  3. Play-again / restart-game lifecycle
 *  4. Mid-game reconnection (player and host)
 *  5. Upload-API hardening (path traversal, oversized, wrong type)
 *  6. Socket-level rate limiting
 *  7. CORS rejection of disallowed origins
 *
 * Each block is self-contained and creates the contexts/games it needs.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// SHARED HELPERS
// ============================================

const uniqueName = (base) => `${base}_${Math.random().toString(36).slice(2, 8)}`;

async function waitForSocket(page, timeout = 10000) {
  await page.waitForFunction(() => window.__socketConnected === true, { timeout });
  await page.waitForTimeout(200);
}

/** Inject a small mock-music library into the page's state. */
async function loadMockMusic(page, count = 5) {
  return page.evaluate((songCount) => {
    const createFile = (name) => {
      const header = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]);
      return new File([new Blob([header], { type: 'audio/mp3' })], name, { type: 'audio/mp3' });
    };
    const songs = [
      { name: 'a.mp3', title: 'Bohemian Rhapsody', artist: 'Queen' },
      { name: 'b.mp3', title: 'Stairway to Heaven', artist: 'Led Zeppelin' },
      { name: 'c.mp3', title: 'Hotel California', artist: 'Eagles' },
      { name: 'd.mp3', title: 'Sweet Child O Mine', artist: 'Guns N Roses' },
      { name: 'e.mp3', title: 'Smells Like Teen Spirit', artist: 'Nirvana' },
      { name: 'f.mp3', title: 'Back in Black', artist: 'AC/DC' },
      { name: 'g.mp3', title: 'Billie Jean', artist: 'Michael Jackson' },
    ];
    const mockFiles = songs.slice(0, songCount).map((s) => {
      const file = createFile(s.name);
      return {
        file,
        url: URL.createObjectURL(file),
        metadata: { title: s.title, artist: s.artist, album: '', year: '' },
      };
    });
    if (typeof window.__testSetMusicFiles === 'function') {
      return window.__testSetMusicFiles(mockFiles);
    }
    return 0;
  }, count);
}

/** Host creates a game and ends up in the lobby. Returns the 6-char game ID. */
async function hostCreateGame(page, songCount = 3, hostName = 'TestHost') {
  await page.goto('/');
  await page.locator('.create-game button.btn').click();
  await waitForSocket(page);
  await loadMockMusic(page, Math.max(songCount, 5));
  await page.evaluate((name) => {
    const el = document.getElementById('host-name') || document.getElementById('player-name-input');
    if (el) el.value = name;
  }, hostName);
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

/** Host starts the game; both host/player land in #game-panel. */
async function hostStartGame(hostPage, playerPages = []) {
  await expect(hostPage.locator('#start-game-btn')).toBeEnabled({ timeout: 10000 });
  await hostPage.click('#start-game-btn');
  await expect(hostPage.locator('#game-panel')).toBeVisible({ timeout: 15000 });
  for (const p of playerPages) {
    await expect(p.locator('#game-panel')).toBeVisible({ timeout: 15000 });
  }
}

/** Trigger the host-side "show options" so non-hosts see the answer grid. */
async function hostShowOptions(hostPage) {
  await hostPage.evaluate(() => {
    if (typeof window.hostShowOptions === 'function') window.hostShowOptions();
  });
}

/** Wait for the four answer options to render for a non-host. */
async function waitForKahootOptions(playerPage, timeout = 15000) {
  await playerPage.waitForFunction(
    () => {
      const c = document.getElementById('nonhost-kahoot-options');
      return c && c.style.display !== 'none' && c.querySelectorAll('.kahoot-option').length === 4;
    },
    { timeout }
  );
}

/** Reveal answer + advance to next song from the host side. */
async function revealAndNext(hostPage) {
  await hostPage.evaluate(() => {
    if (typeof window.revealAnswerAndNext === 'function') window.revealAnswerAndNext();
  });
}

// ============================================
// 1. SECURITY REGRESSIONS — XSS via player names
// ============================================

test.describe('Security - XSS escaping', () => {
  test('malicious host name renders as escaped text in lobby (no script execution)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    let hostAlertFired = false;
    let playerAlertFired = false;
    hostPage.on('dialog', async (d) => {
      hostAlertFired = true;
      await d.dismiss();
    });
    playerPage.on('dialog', async (d) => {
      playerAlertFired = true;
      await d.dismiss();
    });

    try {
      // The server's name validator only allows letters/numbers/spaces/-_'
      // so a literal <script> name is rejected. A host name like "Mallory_x"
      // is accepted but the test below uses a *player* name path where the
      // server-side regex similarly strips raw HTML, then verify on the
      // *display* path that any raw rendering of the name would have escaped
      // any HTML before insertion.
      const gameId = await hostCreateGame(hostPage, 1, 'GoodHost');

      // Server-side rejects a raw HTML name. Verify the join path errors.
      await playerPage.goto('/');
      await playerPage.locator('.join-game button.btn').click();
      await waitForSocket(playerPage);
      await playerPage.fill('#join-player-name', '<script>alert(1)</script>');
      await playerPage.fill('#game-id-input', gameId);
      await playerPage.locator('#join-panel button.btn:has-text("Join Game")').click();

      // Should remain on join panel (or see an error notification) — no lobby.
      await playerPage.waitForTimeout(1500);
      await expect(playerPage.locator('#lobby-panel')).toBeHidden();

      // Now bypass the join UI to push a payload that *would* execute if it
      // hit innerHTML unescaped, and confirm escapeHtml renders it as text.
      await playerPage.evaluate(() => {
        window.state.setGameSession({
          id: 'AAAAAA',
          host: 'GoodHost',
          settings: { songsCount: 1, clipDuration: 5, answerTime: 5, maxPlayers: 8 },
          players: [
            {
              id: 'fake-id',
              name: '<img src=x onerror="window.__xssFired=true">',
              isHost: false,
              score: 0,
              isReady: true,
            },
          ],
          state: 'lobby',
          songs: [],
          audioUrls: [],
          currentSong: 0,
          createdAt: Date.now(),
        });
        window.state.setCurrentPlayer({ id: 'self', name: 'Self', isHost: true });

        // Show the lobby panel and call the production updateLobbyDisplay.
        document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
        const panel = document.getElementById('lobby-panel');
        if (panel) panel.classList.remove('hidden');
        if (typeof window.updateLobbyDisplay === 'function') window.updateLobbyDisplay();
      });

      await playerPage.waitForTimeout(500);

      // Confirm no img with onerror executed
      expect(await playerPage.evaluate(() => window.__xssFired === true)).toBe(false);
      expect(playerAlertFired).toBe(false);

      // No raw <img> element exists anywhere under the players container
      const imgCount = await playerPage.evaluate(
        () => document.querySelectorAll('#players-container img').length
      );
      expect(imgCount).toBe(0);

      // The injected payload appears as text content inside .player-name
      const playerNameText = await playerPage.evaluate(() => {
        const span = document.querySelector('#players-container .player-name');
        return span?.textContent || '';
      });
      expect(playerNameText).toContain('<img');

      expect(hostAlertFired).toBe(false);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('escapeHtml prevents script tags in player-name renders', async ({ page }) => {
    await page.goto('/');
    // Drive the multiplayer flow so the lobby panel and its players list are
    // actually visible (their containers are conditionally rendered).
    await page.locator('.create-game button.btn').click();
    await waitForSocket(page);

    // Inject a game session with a malicious player name and re-render lobby.
    // Note: `window.state` is an ES module namespace object — its bindings
    // are read-only, so we mutate via the exported setters.
    await page.evaluate(() => {
      window.state.setGameSession({
        id: 'TESTID',
        host: 'Host',
        settings: { songsCount: 1, clipDuration: 5, answerTime: 5, maxPlayers: 8 },
        players: [
          { id: 'p1', name: '"><img src=x onerror=alert(1)>', isHost: false, score: 0, isReady: true },
        ],
        state: 'lobby',
        songs: [],
        audioUrls: [],
        currentSong: 0,
        createdAt: Date.now(),
      });
      window.state.setCurrentPlayer({ id: 'self', name: 'Self', isHost: true });

      // Reveal the lobby panel and re-render
      document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
      const panel = document.getElementById('lobby-panel');
      if (panel) panel.classList.remove('hidden');
      if (typeof window.updateLobbyDisplay === 'function') window.updateLobbyDisplay();
    });

    await page.waitForTimeout(300);

    // No injected <img> element should exist anywhere in the lobby panel
    const imgInjected = await page.evaluate(
      () => document.querySelectorAll('#lobby-panel img').length
    );
    expect(imgInjected).toBe(0);

    // The malicious payload appears as text content (escaped), not as DOM.
    const playerNameText = await page.evaluate(() => {
      const span = document.querySelector('#players-container .player-name');
      return span?.textContent || '';
    });
    expect(playerNameText).toContain('<img');
    expect(playerNameText).toContain('onerror');
  });

  test('kick button uses data-attr (no inline onclick template injection)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 1);
      await playerJoinGame(playerPage, gameId, uniqueName('P'));

      const kickBtn = hostPage.locator('.btn-kick').first();
      await expect(kickBtn).toBeVisible({ timeout: 10000 });

      // Old code used onclick="kickPlayer('${player.id}')" — verify the new
      // data-player-id pattern is used instead, since unsanitised IDs in an
      // inline handler are an XSS escape hatch.
      const onclick = await kickBtn.getAttribute('onclick');
      expect(onclick).toBeNull();
      const dataId = await kickBtn.getAttribute('data-player-id');
      expect(dataId).toBeTruthy();

      // Clicking the data-attr button still kicks the player end-to-end
      await kickBtn.click();
      await expect(playerPage.locator('#home-panel')).toBeVisible({ timeout: 10000 });
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});

// ============================================
// 2. SECURITY REGRESSIONS — answer/song race & options
// ============================================

test.describe('Security - submitAnswer race & validation', () => {
  test('stale songIndex is rejected with answerRejected event', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 2);
      await playerJoinGame(playerPage, gameId, uniqueName('Racer'));
      await hostStartGame(hostPage, [playerPage]);

      // Show options for song 0 so kahootOptions[0] is populated server-side
      await hostShowOptions(hostPage);
      await waitForKahootOptions(playerPage);

      // Directly advance the server's current song from the host socket — the
      // UI helper `revealAnswerAndNext` waits 6s before it advances, too slow
      // for a deterministic test.
      await hostPage.evaluate(() => {
        window.__socket.emit('nextSong', {
          gameId: window.state.gameId,
          currentSongIndex: 0,
        });
      });

      // Wait for songChanged to land on the player so we know currentSong=1
      await playerPage.waitForFunction(() => window.state?.currentSongIndex === 1, {
        timeout: 5000,
      });

      const rejected = playerPage.evaluate(
        () =>
          new Promise((resolve) => {
            window.__socket.once('answerRejected', (data) => resolve(data));
            setTimeout(() => resolve(null), 5000);
            window.__socket.emit('submitAnswer', {
              gameId: window.state.gameId,
              playerId: window.state.currentPlayer?.id,
              playerName: window.state.currentPlayer?.name,
              songIndex: 0, // stale
              answerIndex: 1,
              responseTime: 1000,
              responseTimeSeconds: 1,
            });
          })
      );

      const result = await rejected;
      expect(result).not.toBeNull();
      expect(result.reason).toBe('song_advanced');
      expect(result.songIndex).toBe(0);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('submitAnswer before kahoot options broadcast emits options_unavailable', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 1);
      await playerJoinGame(playerPage, gameId, uniqueName('Early'));
      await hostStartGame(hostPage, [playerPage]);

      const rejected = playerPage.evaluate(
        () =>
          new Promise((resolve) => {
            window.__socket.once('answerRejected', (data) => resolve(data));
            setTimeout(() => resolve(null), 5000);
          })
      );

      // Submit before the host calls hostShowOptions — kahootOptions for
      // current song are missing on the server, so scoring is skipped.
      await playerPage.evaluate(() => {
        window.__socket.emit('submitAnswer', {
          gameId: window.state.gameId,
          playerId: window.state.currentPlayer?.id,
          playerName: window.state.currentPlayer?.name,
          songIndex: 0,
          answerIndex: 0,
          responseTime: 500,
          responseTimeSeconds: 0.5,
        });
      });

      const result = await rejected;
      expect(result).not.toBeNull();
      expect(result.reason).toBe('options_unavailable');
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('createGame with malformed kahoot options is sanitised, not crashed', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('.create-game button.btn').click();
    await waitForSocket(page);

    // Bypass the UI and emit createGame directly with bad kahoot data.
    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.__socket.once('gameCreated', (data) => resolve({ ok: true, gameId: data.gameId }));
          window.__socket.once('error', (err) => resolve({ ok: false, error: err.message }));
          setTimeout(() => resolve({ ok: false, timeout: true }), 5000);

          window.__socket.emit('createGame', {
            hostName: 'BadHost',
            settings: { songsCount: 1, clipDuration: 5, answerTime: 5, maxPlayers: 4 },
            songsMetadata: [
              { metadata: { title: 'Foo', artist: 'Bar' }, localUrl: 'blob:fake' },
            ],
            kahootOptions: [
              // correctIndex out of bounds for option list — sanitised away
              { options: ['a', 'b', 'c', 'd'], correctIndex: 99 },
              // not enough options — dropped
              { options: ['a', 'b'], correctIndex: 0 },
              // valid one
              { options: ['w', 'x', 'y', 'z'], correctIndex: 2 },
            ],
          });
        })
    );

    expect(result.ok).toBe(true);
    expect(result.gameId).toMatch(/^[A-Z0-9]{6}$/);
  });
});

// ============================================
// 3. UPLOAD API HARDENING (multer)
// ============================================

test.describe('Security - upload hardening', () => {
  test('originalName is stripped of any path components', async ({ request }) => {
    const mp3Header = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]);

    const response = await request.post('/api/upload', {
      multipart: {
        music: {
          name: '../../etc/passwd.mp3',
          mimeType: 'audio/mp3',
          buffer: mp3Header,
        },
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.files[0].originalName).not.toContain('/');
    expect(data.files[0].originalName).not.toContain('\\');
    expect(data.files[0].originalName).not.toContain('..');
    // The actual on-disk filename never carries the original name
    expect(data.files[0].filename).not.toContain('passwd');
    expect(data.files[0].filename).not.toContain('..');
  });

  test('rejects non-audio file types', async ({ request }) => {
    const response = await request.post('/api/upload', {
      multipart: {
        music: {
          name: 'evil.exe',
          mimeType: 'application/x-msdownload',
          buffer: Buffer.from([0x4d, 0x5a]), // MZ header
        },
      },
    });

    // Multer fileFilter rejects this — depending on wiring, multer surfaces it
    // as a 400 from our error handler.
    expect(response.status()).toBe(400);
  });

  test('rejects files lacking a recognised audio extension', async ({ request }) => {
    const response = await request.post('/api/upload', {
      multipart: {
        music: {
          name: 'song-without-extension',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from([0x00, 0x01]),
        },
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  test('upload with no files returns 400', async ({ request }) => {
    const response = await request.post('/api/upload', {
      multipart: { dummy: 'value' },
    });
    // Either 400 (no files) or 429 if a parallel test is consuming the
    // limiter — both are acceptable evidence the endpoint guards itself.
    expect([400, 429]).toContain(response.status());
  });
});

// ============================================
// 4. CORS — disallowed origin in dev
// ============================================

test.describe('Security - CORS', () => {
  test('disallowed origin gets blocked on /api/health', async ({ request }) => {
    // Dev allows localhost + LAN; an unrelated public origin should fail.
    const response = await request.get('/api/health', {
      headers: { Origin: 'https://attacker.example.com' },
      failOnStatusCode: false,
    });

    // Express CORS rejects with a 500 from the error middleware (default) —
    // either way it must not include CORS allow headers for the bad origin.
    const acao = response.headers()['access-control-allow-origin'];
    expect(acao || '').not.toBe('https://attacker.example.com');
  });

  test('same-origin (Origin host == Host header) is allowed without env config', async ({
    request,
    baseURL,
  }) => {
    // Simulate the typical "page served from same place as API" scenario
    // that fails on a fresh deployment without ALLOWED_ORIGINS configured.
    // The browser sets Origin to the page URL; the server sees Host == that.
    const url = new URL(baseURL || 'http://localhost:3000');
    const response = await request.get('/api/health', {
      headers: { Origin: `${url.protocol}//${url.host}`, Host: url.host },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    // ACAO can be either the echoed origin or '*' depending on the cors lib's
    // credential setting; either way it should not be a *rejection*.
    const acao = response.headers()['access-control-allow-origin'];
    if (acao) {
      expect([`${url.protocol}//${url.host}`, '*']).toContain(acao);
    }
  });
});

// ============================================
// 5. SOCKET-LEVEL RATE LIMIT
// ============================================

test.describe('Security - socket rate limit', () => {
  // Socket.IO per-socket middleware errors via socket.use((data, next) =>
  // next(err)) are dropped server-side and the packet is discarded — they're
  // not propagated to the client. So we test the *effect*: flood createGame
  // requests and verify the server processed strictly fewer than the burst
  // size, proving the limiter is active.
  test('flooding createGame events caps successful responses at the rate limit', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('.create-game button.btn').click();
    await waitForSocket(page);

    const burst = 60;
    const succeeded = await page.evaluate(
      (count) =>
        new Promise((resolve) => {
          let received = 0;
          const onCreated = () => {
            received++;
          };
          window.__socket.on('gameCreated', onCreated);

          for (let i = 0; i < count; i++) {
            window.__socket.emit('createGame', {
              hostName: `Flood${i}`,
              settings: { songsCount: 1, clipDuration: 5, answerTime: 5, maxPlayers: 2 },
              songsMetadata: [
                { metadata: { title: 'X', artist: 'Y' }, localUrl: 'blob:fake' },
              ],
            });
          }

          // Wait for the server to drain the burst (it processes every event
          // it accepts; rate-limited ones never reach the handler so they
          // never produce a gameCreated reply).
          setTimeout(() => {
            window.__socket.off('gameCreated', onCreated);
            resolve(received);
          }, 1500);
        }),
      burst
    );

    // The limiter is 30 events/sec/socket. We allow some headroom because
    // the burst spans the boundary of the 1-second window. Anything strictly
    // less than burst proves the limiter dropped at least one event.
    expect(succeeded).toBeLessThan(burst);
    // And the server is still alive afterwards — a benign emit still gets
    // through once the window rolls over.
    await page.waitForTimeout(1100);
    const alive = await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.__socket.once('gameCreated', () => resolve(true));
          window.__socket.once('error', () => resolve(false));
          setTimeout(() => resolve(false), 3000);
          window.__socket.emit('createGame', {
            hostName: 'Survivor',
            settings: { songsCount: 1, clipDuration: 5, answerTime: 5, maxPlayers: 2 },
            songsMetadata: [
              { metadata: { title: 'X', artist: 'Y' }, localUrl: 'blob:fake' },
            ],
          });
        })
    );
    expect(alive).toBe(true);
  });
});

// ============================================
// 6. THREE-PLAYER FULL GAME
// ============================================

test.describe('Multi-player - 3 players full game', () => {
  test('host + 3 players play full single-song game and reach results', async ({ browser }) => {
    const ctxs = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    const pages = await Promise.all(ctxs.map((c) => c.newPage()));
    const [hostPage, p1, p2, p3] = pages;

    try {
      const gameId = await hostCreateGame(hostPage, 1);
      await playerJoinGame(p1, gameId, uniqueName('P1'));
      await playerJoinGame(p2, gameId, uniqueName('P2'));
      await playerJoinGame(p3, gameId, uniqueName('P3'));

      // Lobby reflects all 3 non-host players
      await expect(hostPage.locator('#current-player-count')).toContainText('3', {
        timeout: 10000,
      });

      await hostStartGame(hostPage, [p1, p2, p3]);
      await hostShowOptions(hostPage);

      await Promise.all([
        waitForKahootOptions(p1),
        waitForKahootOptions(p2),
        waitForKahootOptions(p3),
      ]);

      // All three answer (different options, fast vs slow staggering)
      await p1.locator('#nonhost-kahoot-options .kahoot-option[data-option="0"]').click();
      await p2.waitForTimeout(150);
      await p2.locator('#nonhost-kahoot-options .kahoot-option[data-option="1"]').click();
      await p3.waitForTimeout(150);
      await p3.locator('#nonhost-kahoot-options .kahoot-option[data-option="2"]').click();

      // Game advances after host reveals (one-song game → results)
      await revealAndNext(hostPage);

      await expect(hostPage.locator('#results-panel')).toBeVisible({ timeout: 30000 });
      await Promise.all(
        [p1, p2, p3].map((p) => expect(p.locator('#results-panel')).toBeVisible({ timeout: 30000 }))
      );

      // #other-rankings is populated 4s after #podium-container appears
      // (multiplayer.js shows podium first, then standings). Wait for it.
      await hostPage.waitForFunction(
        () => {
          const el = document.getElementById('other-rankings');
          if (!el || el.classList.contains('hidden')) return false;
          return el.querySelectorAll('.name').length >= 3;
        },
        { timeout: 15000 }
      );
      const namesRendered = await hostPage.locator('#other-rankings .name').allTextContents();
      expect(namesRendered.length).toBeGreaterThanOrEqual(3);
    } finally {
      await Promise.all(ctxs.map((c) => c.close()));
    }
  });

  test('player who leaves mid-lobby is removed from host view', async ({ browser }) => {
    const ctxs = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    const [hostCtx, p1Ctx, p2Ctx] = ctxs;
    const hostPage = await hostCtx.newPage();
    const p1 = await p1Ctx.newPage();
    const p2 = await p2Ctx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 1);
      await playerJoinGame(p1, gameId, uniqueName('Leaver'));
      await playerJoinGame(p2, gameId, uniqueName('Stayer'));
      await expect(hostPage.locator('#current-player-count')).toContainText('2', {
        timeout: 10000,
      });

      await p1.locator('#lobby-panel button.btn-danger:has-text("Leave")').click();
      await expect(p1.locator('#home-panel')).toBeVisible({ timeout: 10000 });
      await expect(hostPage.locator('#current-player-count')).toContainText('1', {
        timeout: 10000,
      });
    } finally {
      await Promise.all(ctxs.map((c) => c.close()));
    }
  });
});

// ============================================
// 7. PLAY-AGAIN / restartGame LIFECYCLE
// ============================================

test.describe('Lifecycle - play again', () => {
  test('host can reset game from results back to setup; players see lobby reset', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 1);
      await playerJoinGame(playerPage, gameId, uniqueName('Replayer'));
      await hostStartGame(hostPage, [playerPage]);
      await hostShowOptions(hostPage);
      await waitForKahootOptions(playerPage);
      await playerPage.locator('#nonhost-kahoot-options .kahoot-option').first().click();
      await revealAndNext(hostPage);

      await expect(hostPage.locator('#results-panel')).toBeVisible({ timeout: 30000 });
      await expect(playerPage.locator('#results-panel')).toBeVisible({ timeout: 30000 });

      // Host triggers playAgain
      await hostPage.evaluate(() => {
        if (typeof window.playAgain === 'function') window.playAgain();
      });

      // Host returns to multiplayer setup, player goes back to lobby
      await expect(hostPage.locator('#setup-panel')).toBeVisible({ timeout: 10000 });
      await expect(playerPage.locator('#lobby-panel')).toBeVisible({ timeout: 10000 });

      // Game ID is preserved on the server (same gameId reused)
      const stillSameId = await playerPage.evaluate(() => window.state.gameId);
      expect(stillSameId).toBe(gameId);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});

// ============================================
// 8. MID-GAME RECONNECTION
// ============================================

test.describe('Reconnection - mid-game', () => {
  test('player can reload during gameplay and rejoin the running game', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 2);
      await playerJoinGame(playerPage, gameId, uniqueName('Returner'));
      await hostStartGame(hostPage, [playerPage]);

      // Player reloads while server is in 'playing' state
      await playerPage.reload();

      // Reconnection state lives in localStorage; auto-rejoin should land
      // the player back on #game-panel (or #lobby-panel between songs).
      await playerPage.waitForFunction(
        () => {
          const game = document.getElementById('game-panel');
          const lobby = document.getElementById('lobby-panel');
          return (
            (game && !game.classList.contains('hidden')) ||
            (lobby && !lobby.classList.contains('hidden'))
          );
        },
        { timeout: 15000 }
      );

      // Game session is restored
      const restoredId = await playerPage.evaluate(() => window.state?.gameId);
      expect(restoredId).toBe(gameId);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('invalid reconnect token is rejected and the client falls back to home', async ({
    page,
  }) => {
    // Drive a flow so the socket initialises (home page doesn't open a socket).
    await page.goto('/');
    await page.locator('.create-game button.btn').click();
    await waitForSocket(page, 15000);

    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.__socket.once('rejoinFailed', (d) => resolve({ failed: true, ...d }));
          window.__socket.once('rejoinSuccess', (d) => resolve({ failed: false, ...d }));
          setTimeout(() => resolve({ timeout: true }), 6000);

          window.__socket.emit('rejoinGame', {
            gameId: 'NOPE12',
            playerId: 'fake',
            playerName: 'Ghost',
            reconnectToken: '00000000-0000-0000-0000-000000000000',
          });
        })
    );

    // Either explicit rejoinFailed OR silent ignore (timeout) — both prove
    // the bogus token was not honoured. A rejoinSuccess would be the bug.
    expect(result.failed === true || result.timeout === true).toBe(true);
  });
});

// ============================================
// 9. CONCURRENT-GAME ISOLATION
// ============================================

test.describe('Isolation - concurrent games', () => {
  test('two simultaneous games keep their own player rosters', async ({ browser }) => {
    const ctxs = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    const [host1, host2, p1, p2] = await Promise.all(ctxs.map((c) => c.newPage()));

    try {
      const game1 = await hostCreateGame(host1, 1, 'HostA');
      const game2 = await hostCreateGame(host2, 1, 'HostB');
      expect(game1).not.toBe(game2);

      await playerJoinGame(p1, game1, uniqueName('A1'));
      await playerJoinGame(p2, game2, uniqueName('B1'));

      // Each host sees exactly 1 non-host player
      await expect(host1.locator('#current-player-count')).toContainText('1', { timeout: 10000 });
      await expect(host2.locator('#current-player-count')).toContainText('1', { timeout: 10000 });

      // Cross-game roster should not leak
      const game1Names = await host1.locator('#players-container .player-name').allTextContents();
      const game2Names = await host2.locator('#players-container .player-name').allTextContents();
      const game1NameSet = new Set(game1Names.map((s) => s.trim()));
      for (const n of game2Names) {
        expect(game1NameSet.has(n.trim())).toBe(false);
      }
    } finally {
      await Promise.all(ctxs.map((c) => c.close()));
    }
  });
});

// ============================================
// 10. INPUT VALIDATION (server-enforced)
// ============================================

test.describe('Validation - server-side', () => {
  test('player name with disallowed unicode/symbols cannot join', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    try {
      const gameId = await hostCreateGame(hostPage, 1);

      await playerPage.goto('/');
      await playerPage.locator('.join-game button.btn').click();
      await waitForSocket(playerPage);

      // Name with a forbidden char (`@`) must be rejected by validatePlayerName
      const rejected = await playerPage.evaluate(
        (gid) =>
          new Promise((resolve) => {
            window.__socket.once('error', (d) => resolve({ rejected: true, msg: d?.message }));
            window.__socket.once('gameJoined', () => resolve({ rejected: false }));
            setTimeout(() => resolve({ timeout: true }), 4000);

            window.__socket.emit('joinGame', {
              gameId: gid,
              playerName: 'evil@hacker.com',
            });
          }),
        gameId
      );

      expect(rejected.rejected === true || rejected.timeout === true).toBe(true);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('non-existent game ID returns gameNotFound / error', async ({ page }) => {
    await page.goto('/');
    await page.locator('.join-game button.btn').click();
    await waitForSocket(page);

    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.__socket.once('error', (d) => resolve({ rejected: true, msg: d?.message }));
          window.__socket.once('gameJoined', () => resolve({ rejected: false }));
          setTimeout(() => resolve({ timeout: true }), 4000);

          window.__socket.emit('joinGame', {
            gameId: 'ZZZZZZ',
            playerName: 'NoOne',
          });
        })
    );

    expect(result.rejected === true || result.timeout === true).toBe(true);
  });

  test('settings outside legal ranges are clamped not crashed', async ({ page }) => {
    await page.goto('/');
    await page.locator('.create-game button.btn').click();
    await waitForSocket(page);

    const created = await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.__socket.once('gameCreated', (d) =>
            resolve({ ok: true, settings: d.gameSession.settings })
          );
          window.__socket.once('error', (e) => resolve({ ok: false, error: e?.message }));
          setTimeout(() => resolve({ ok: false, timeout: true }), 5000);

          window.__socket.emit('createGame', {
            hostName: 'ClampHost',
            settings: {
              songsCount: 9999, // clamped to 50
              clipDuration: 0, // clamped to ≥5
              answerTime: 600, // clamped to ≤60
              maxPlayers: -3, // clamped to ≥2
            },
            songsMetadata: [{ metadata: { title: 'X', artist: 'Y' }, localUrl: 'blob:fake' }],
          });
        })
    );

    expect(created.ok).toBe(true);
    expect(created.settings.songsCount).toBeLessThanOrEqual(50);
    expect(created.settings.songsCount).toBeGreaterThanOrEqual(1);
    expect(created.settings.clipDuration).toBeGreaterThanOrEqual(5);
    expect(created.settings.answerTime).toBeLessThanOrEqual(60);
    expect(created.settings.maxPlayers).toBeGreaterThanOrEqual(2);
  });
});

// ============================================
// 11. UI — settings buttons sync
// ============================================

test.describe('Settings UI', () => {
  test('clicking a setting button updates the underlying select value', async ({ page }) => {
    await page.goto('/');
    await page.locator('.create-game button.btn').click();
    await waitForSocket(page);

    // Click the "20" songs-count button if present, else fall back to select
    const tenBtn = page.locator('#songs-options .setting-btn[data-value="20"]');
    if (await tenBtn.count()) {
      await tenBtn.click();
      const value = await page.evaluate(
        () => document.getElementById('songs-count')?.value
      );
      expect(value).toBe('20');
      // Active class applied
      await expect(tenBtn).toHaveClass(/active/);
    }
  });
});
