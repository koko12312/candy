import { test, expect } from './fixtures';
import { BotClient } from './helpers/BotClient';
import { InvariantHarness } from './helpers/InvariantHarness';
import { findValidMove } from './helpers/moveFinder';

test.describe('Milestone M4: Multiplayer Synchronization & Invariant Suite', () => {

  test('Scenario A: 2-Player Room Creation, Code Join, Ready Negotiation, Host Start & Initial Board Parity', async ({ browser, serverUrl }) => {
    const ctx0 = await browser.newContext();
    const ctx1 = await browser.newContext();

    const p0 = new BotClient('Alice_Host', 'avatar_1', await ctx0.newPage(), ctx0);
    const p1 = new BotClient('Bob_Guest', 'avatar_2', await ctx1.newPage(), ctx1);

    try {
      // 1. Alice navigates and creates room
      await p0.navigateTo(serverUrl);
      const roomCode = await p0.createRoom();
      expect(roomCode).toBeTruthy();

      // 2. Bob joins with roomCode
      await p1.navigateTo(serverUrl);
      await p1.joinRoom(roomCode);

      // Verify both see roomCode in waiting card
      const p0Code = await p0.page.textContent('#waiting-room-code');
      const p1Code = await p1.page.textContent('#waiting-room-code');
      expect(p0Code?.trim()).toBe(roomCode);
      expect(p1Code?.trim()).toBe(roomCode);

      // Verify host start button is disabled while Bob is unready
      await p0.page.waitForFunction(() => {
        const btn = document.getElementById('btn-start-game') as HTMLButtonElement;
        return btn && btn.disabled;
      }, null, { timeout: 10000 });
      expect(await p0.page.isDisabled('#btn-start-game')).toBe(true);

      // 3. Bob toggles ready
      await p1.setReady();

      // Verify host start button becomes enabled once Bob is ready
      await p0.page.waitForFunction(() => {
        const btn = document.getElementById('btn-start-game') as HTMLButtonElement;
        return btn && !btn.disabled;
      }, null, { timeout: 10000 });

      // 4. Alice starts the game
      await p0.startGame();

      // 5. Both clients transition to IN_GAME
      await Promise.all([
        p0.waitForGameState('IN_GAME'),
        p1.waitForGameState('IN_GAME')
      ]);

      // 6. Turn indicator checks
      expect(await p0.getActiveSlot()).toBe(0);
      expect(await p1.getActiveSlot()).toBe(0);

      const p0BannerClass = await p0.page.getAttribute('#turn-banner', 'class');
      expect(p0BannerClass).toContain('my-turn');

      const p1BannerClass = await p1.page.getAttribute('#turn-banner', 'class');
      expect(p1BannerClass).not.toContain('my-turn');

      // 7. Initial 100% Board Parity Assertion across both clients
      await InvariantHarness.assertBoardParity([p0.page, p1.page], undefined, 'Scenario A Initial Board');
    } finally {
      await ctx0.close();
      await ctx1.close();
    }
  });

  test('Scenario B: 4-Player Full Match, Slot Assignment (0..3) & Cyclic Turn Progression (0 -> 1 -> 2 -> 3 -> 0)', async ({ browser, serverUrl }) => {
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext()
    ]);

    const bots = [
      new BotClient('Player_0', 'avatar_1', await contexts[0].newPage(), contexts[0]),
      new BotClient('Player_1', 'avatar_2', await contexts[1].newPage(), contexts[1]),
      new BotClient('Player_2', 'avatar_3', await contexts[2].newPage(), contexts[2]),
      new BotClient('Player_3', 'avatar_4', await contexts[3].newPage(), contexts[3])
    ];

    const pages = bots.map((b) => b.page);

    try {
      // 1. Host creates room
      await bots[0].navigateTo(serverUrl);
      const roomCode = await bots[0].createRoom();

      // 2. Guests join room sequentially
      for (let i = 1; i <= 3; i++) {
        await bots[i].navigateTo(serverUrl);
        await bots[i].joinRoom(roomCode);
        await bots[i].setReady();
      }

      // 3. Host starts game
      await bots[0].startGame();

      // 4. Assert all 4 transition to IN_GAME
      await Promise.all(bots.map((b) => b.waitForGameState('IN_GAME')));

      // Assert initial board parity
      await InvariantHarness.assertBoardParity(pages, undefined, 'Scenario B Initial 4-Player Board');

      // 5. Verify cyclic turn progression 0 -> 1 -> 2 -> 3 -> 0
      for (let turn = 0; turn < 4; turn++) {
        const expectedSlot = turn;

        // All 4 clients must observe the expected active slot
        for (const bot of bots) {
          await bot.page.waitForFunction(
            (slot) => (window as any).__MATCH_POP__.getActiveSlot() === slot,
            expectedSlot,
            { timeout: 15000 }
          );
        }

        // Active bot executes a valid move
        const activeBot = bots[expectedSlot];
        const board = await activeBot.getBoardState();
        const move = findValidMove(board);
        expect(move).toBeTruthy();

        await activeBot.simulateSwap(move!.from, move!.to);

        // Wait for cascade animation settlement on all 4 clients
        await InvariantHarness.waitForAllClientsToSettle(pages, undefined, 15000);

        // Assert 100% board parity across all 4 clients
        await InvariantHarness.assertBoardParity(pages, undefined, `Scenario B Post-Turn ${turn} Parity`);
      }

      // Verify that after Slot 3 moves, turn cyclically returns to Slot 0
      for (const bot of bots) {
        await bot.page.waitForFunction(
          () => (window as any).__MATCH_POP__.getActiveSlot() === 0,
          null,
          { timeout: 15000 }
        );
      }
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });

  test('Scenario C: Active Player Swap Execution, Cascade Settling, Score Increment & Post-Cascade Parity', async ({ browser, serverUrl }) => {
    const ctx0 = await browser.newContext();
    const ctx1 = await browser.newContext();

    const p0 = new BotClient('Alice_C', 'avatar_1', await ctx0.newPage(), ctx0);
    const p1 = new BotClient('Bob_C', 'avatar_2', await ctx1.newPage(), ctx1);
    const pages = [p0.page, p1.page];

    try {
      await p0.navigateTo(serverUrl);
      const roomCode = await p0.createRoom();
      await p1.navigateTo(serverUrl);
      await p1.joinRoom(roomCode);
      await p1.setReady();
      await p0.startGame();

      await Promise.all([p0.waitForGameState('IN_GAME'), p1.waitForGameState('IN_GAME')]);

      // Record scores before move
      const p0Id = await p0.getActivePlayerId();
      const p1Id = await p1.page.evaluate(() => {
        const scores = (window as any).__MATCH_POP__.getScores();
        return Object.keys(scores).find((id) => id !== (window as any).__MATCH_POP__.getActivePlayerId()) || '';
      });

      const scoresBefore = await p0.getScores();

      // Alice (Slot 0) performs programmatic swap
      const board0 = await p0.getBoardState();
      const move0 = findValidMove(board0);
      expect(move0).toBeTruthy();

      await p0.simulateSwap(move0!.from, move0!.to);

      // Wait for cascades to settle on both clients
      await InvariantHarness.waitForAllClientsToSettle(pages);

      // Verify score increment: Alice's score must increase, Bob's must remain 0
      const scoresAfter0 = await p0.getScores();
      expect(scoresAfter0[p0Id]).toBeGreaterThan(scoresBefore[p0Id] || 0);
      expect(scoresAfter0[p1Id] || 0).toBe(scoresBefore[p1Id] || 0);

      // Assert 100% board parity
      await InvariantHarness.assertBoardParity(pages, undefined, 'Scenario C Turn 0 Parity');

      // Now Bob (Slot 1) is active: test synthetic touch drag swap
      await p1.page.waitForFunction(
        () => (window as any).__MATCH_POP__.getActiveSlot() === 1,
        null,
        { timeout: 10000 }
      );

      const board1 = await p1.getBoardState();
      const move1 = findValidMove(board1);
      expect(move1).toBeTruthy();

      // Bob uses synthetic drag gesture
      await p1.dragSwap(move1!.from, move1!.to);

      // Wait for cascades to settle on both clients
      await InvariantHarness.waitForAllClientsToSettle(pages);

      // Assert 100% board parity after touch drag
      await InvariantHarness.assertBoardParity(pages, undefined, 'Scenario C Turn 1 Parity (Touch Drag)');
    } finally {
      await ctx0.close();
      await ctx1.close();
    }
  });

  test('Scenario D: 20-Second Turn Timeout: Active Player Idle, Server Auto-Passes Turn, Board Unchanged', async ({ browser, serverUrl }) => {
    const ctx0 = await browser.newContext();
    const ctx1 = await browser.newContext();

    const p0 = new BotClient('Alice_D', 'avatar_1', await ctx0.newPage(), ctx0);
    const p1 = new BotClient('Bob_D', 'avatar_2', await ctx1.newPage(), ctx1);

    try {
      await p0.navigateTo(serverUrl);
      const roomCode = await p0.createRoom();
      await p1.navigateTo(serverUrl);
      await p1.joinRoom(roomCode);
      await p1.setReady();
      await p0.startGame();

      await Promise.all([p0.waitForGameState('IN_GAME'), p1.waitForGameState('IN_GAME')]);

      const initialSlot = await p0.getActiveSlot();
      expect(initialSlot).toBe(0);

      const hashBefore = await p0.getBoardHash();
      const scoresBefore = await p0.getScores();

      // Active player stays idle and makes no move
      // Wait for turn advance triggered by authoritative server 20s timeout
      await p0.page.waitForFunction(
        (prevSlot) => (window as any).__MATCH_POP__.getActiveSlot() !== prevSlot,
        initialSlot,
        { timeout: 26000 }
      );

      const newSlot = await p0.getActiveSlot();
      expect(newSlot).toBe(1);

      // Board must be 100% unchanged
      const hashAfter = await p0.getBoardHash();
      expect(hashAfter).toBe(hashBefore);

      // Scores must be identical (no points for timing out)
      const scoresAfter = await p0.getScores();
      expect(scoresAfter).toEqual(scoresBefore);

      // Turn banner updates
      const p0BannerClass = await p0.page.getAttribute('#turn-banner', 'class');
      expect(p0BannerClass).not.toContain('my-turn');

      const p1BannerClass = await p1.page.getAttribute('#turn-banner', 'class');
      expect(p1BannerClass).toContain('my-turn');
    } finally {
      await ctx0.close();
      await ctx1.close();
    }
  });

  test('Scenario E: Disconnect & Reconnect Recovery: Graceful Status, State Rehydration & Board Parity Restoration', async ({ browser, serverUrl }) => {
    const ctx0 = await browser.newContext();
    const ctx1 = await browser.newContext();

    const p0 = new BotClient('Alice_E', 'avatar_1', await ctx0.newPage(), ctx0);
    const p1 = new BotClient('Bob_E', 'avatar_2', await ctx1.newPage(), ctx1);

    try {
      await p0.navigateTo(serverUrl);
      const roomCode = await p0.createRoom();
      await p1.navigateTo(serverUrl);
      await p1.joinRoom(roomCode);
      await p1.setReady();
      await p0.startGame();

      await Promise.all([p0.waitForGameState('IN_GAME'), p1.waitForGameState('IN_GAME')]);

      // Alice executes 1 move so board changes and scores accumulate
      const board0 = await p0.getBoardState();
      const move0 = findValidMove(board0);
      expect(move0).toBeTruthy();
      await p0.simulateSwap(move0!.from, move0!.to);
      await InvariantHarness.waitForAllClientsToSettle([p0.page, p1.page]);

      // Capture board hash and Bob's session credentials
      const boardHashBeforeDisconnect = await p0.getBoardHash();
      const { sessionToken, roomCode: savedRoom } = await p1.getSessionCredentials();
      expect(sessionToken).toBeTruthy();
      expect(savedRoom).toBe(roomCode);

      // Abruptly close Bob's browser page
      await p1.page.close();

      // Alice's HUD must indicate Bob disconnected (.player-pill.disconnected)
      await p0.page.waitForSelector('.player-pill.disconnected', { state: 'visible', timeout: 10000 });

      // Alice's board remains completely intact
      expect(await p0.getBoardHash()).toBe(boardHashBeforeDisconnect);

      // Bob reconnects with saved sessionToken in a new page
      const reconnectedPage = await ctx1.newPage();
      await reconnectedPage.addInitScript(
        ({ token, code }) => {
          localStorage.setItem('matchpop_session_token', token);
          localStorage.setItem('matchpop_last_room', code);
        },
        { token: sessionToken!, code: roomCode }
      );

      await reconnectedPage.goto(serverUrl);

      // Reconnected client must bypass lobby and rehydrate into IN_GAME state
      await reconnectedPage.waitForFunction(
        () => (window as any).__MATCH_POP__?.getGameState() === 'IN_GAME',
        null,
        { timeout: 15000 }
      );

      // On Alice's client, disconnected indicator is removed
      await p0.page.waitForSelector('.player-pill.disconnected', { state: 'detached', timeout: 10000 });

      // Assert 100% board parity rehydration
      const reconnectedHash = await reconnectedPage.evaluate(() => (window as any).__MATCH_POP__.getBoardHash());
      expect(reconnectedHash).toBe(await p0.getBoardHash());

      // Validate structural invariants on reconnected board
      const reconnectedBoard = await reconnectedPage.evaluate(() => (window as any).__MATCH_POP__.getBoardState());
      InvariantHarness.validateStructuralInvariants(reconnectedBoard, 'Reconnected Bob');

      // Both players can resume playing subsequent moves with zero desync
      const currentActiveSlot = await p0.getActiveSlot();
      const activePage = currentActiveSlot === 0 ? p0.page : reconnectedPage;
      const boardAfterSync = await activePage.evaluate(() => (window as any).__MATCH_POP__.getBoardState());
      const nextMove = findValidMove(boardAfterSync);
      expect(nextMove).toBeTruthy();

      await activePage.evaluate(
        ({ f, t }) => (window as any).__MATCH_POP__.simulateSwap(f, t),
        { f: nextMove!.from, t: nextMove!.to }
      );

      await InvariantHarness.waitForAllClientsToSettle([p0.page, reconnectedPage]);
      await InvariantHarness.assertBoardParity([p0.page, reconnectedPage], undefined, 'Scenario E Post-Reconnect Move');
    } finally {
      await ctx0.close();
      await ctx1.close();
    }
  });

});
