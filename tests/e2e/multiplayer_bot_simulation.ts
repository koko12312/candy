import { chromium } from '@playwright/test';
import { createServer } from '../../src/server/index';
import { BotClient } from './helpers/BotClient';
import { InvariantHarness } from './helpers/InvariantHarness';
import { findValidMove } from './helpers/moveFinder';

async function runBotSimulation(): Promise<void> {
  console.log('===============================================================');
  console.log('  MATCH POP MULTIPLAYER — HEADLESS 4-PLAYER BOT SIMULATION');
  console.log('===============================================================');

  // 1. Start Server on Ephemeral Port 0
  const server = createServer();
  const port = await server.start(0);
  const serverUrl = `http://localhost:${port}`;
  console.log(`[Server] Booted Express + Socket.io server on ephemeral port: ${port}`);

  // 2. Launch Chromium Browser
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true }),
    browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true }),
    browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true }),
    browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true })
  ]);

  const bots = [
    new BotClient('Bot_0_Host', 'avatar_1', await contexts[0].newPage(), contexts[0]),
    new BotClient('Bot_1_Guest', 'avatar_2', await contexts[1].newPage(), contexts[1]),
    new BotClient('Bot_2_Guest', 'avatar_3', await contexts[2].newPage(), contexts[2]),
    new BotClient('Bot_3_Guest', 'avatar_4', await contexts[3].newPage(), contexts[3])
  ];

  const pages = bots.map((b) => b.page);

  try {
    // 3. Lobby Setup & Negotiation
    console.log('[Lobby] Bot 0 creating multiplayer room...');
    await bots[0].navigateTo(serverUrl);
    const roomCode = await bots[0].createRoom();
    console.log(`[Lobby] Room created successfully. Code: [${roomCode}]`);

    for (let i = 1; i <= 3; i++) {
      console.log(`[Lobby] Bot ${i} joining room [${roomCode}] and setting ready...`);
      await bots[i].navigateTo(serverUrl);
      await bots[i].joinRoom(roomCode);
      await bots[i].setReady();
    }

    console.log('[Lobby] All 3 guests are ready. Bot 0 starting match...');
    await bots[0].startGame();

    // 4. In-Game State Synchronization
    await Promise.all(bots.map((b) => b.waitForGameState('IN_GAME')));
    console.log('[Game] All 4 bot clients transitioned to IN_GAME.');

    // 5. Initial Board Parity Assertion
    const initialHash = await InvariantHarness.assertBoardParity(pages, undefined, 'Initial Match Setup');
    console.log(`[Game] Initial board parity verified across all 4 clients.`);
    console.log(`       Fingerprint: ${initialHash.slice(0, 48)}...`);

    // 6. Play 10 Consecutive Turns
    const totalTurns = 10;
    console.log(`\n--- EXECUTING ${totalTurns} CONSECUTIVE TURNS ---`);

    for (let turn = 1; turn <= totalTurns; turn++) {
      const activeSlot = await bots[0].getActiveSlot();

      // Ensure all 4 bots have synchronized active slot
      await Promise.all(
        bots.map((b) =>
          b.page.waitForFunction(
            (slot) => (window as any).__MATCH_POP__.getActiveSlot() === slot,
            activeSlot,
            { timeout: 10000 }
          )
        )
      );

      const activeBot = bots[activeSlot];

      // Find valid move on settled board
      const board = await activeBot.getBoardState();
      const move = findValidMove(board);

      if (!move) {
        console.warn(`[Turn ${turn}] No legal moves on board! Waiting for server reshuffle...`);
        await activeBot.page.waitForTimeout(1000);
        continue;
      }

      // Execute swap
      await activeBot.simulateSwap(move.from, move.to);

      // Wait for cascade settlement across all 4 clients using monotonic settled count
      await InvariantHarness.waitForAllClientsToSettle(pages, turn, 15000);

      // Assert 100% board parity
      const turnHash = await InvariantHarness.assertBoardParity(pages, undefined, `Turn ${turn}`);

      // Verify scores
      const scores = await activeBot.getScores();

      console.log(
        `  [Turn ${turn.toString().padStart(2, ' ')}/${totalTurns}] ` +
        `Slot ${activeSlot} (${activeBot.name}) swapped ` +
        `(${move.from.row},${move.from.col}) <-> (${move.to.row},${move.to.col}) | ` +
        `Hash: ${turnHash.slice(0, 36)}... | Parity: 100% MATCH | Scores: ${JSON.stringify(scores)}`
      );

      // Wait for turn to change before starting next iteration
      if (turn < totalTurns) {
        const nextExpectedSlot = (activeSlot + 1) % 4;
        try {
          await Promise.all(
            bots.map((b) =>
              b.page.waitForFunction(
                (target) => (window as any).__MATCH_POP__.getActiveSlot() === target,
                nextExpectedSlot,
                { timeout: 15000 }
              )
            )
          );
        } catch (err) {
          const currentSlots = await Promise.all(bots.map((b) => b.getActiveSlot()));
          const gameStates = await Promise.all(
            bots.map((b) => b.page.evaluate(() => (window as any).__MATCH_POP__?.getGameState()))
          );
          console.error(
            `[TURN ADVANCE TIMEOUT] Expected slot: ${nextExpectedSlot} | Actual slots: ${JSON.stringify(currentSlots)} | GameStates: ${JSON.stringify(gameStates)}`
          );
          throw err;
        }
      }
    }

    console.log('---------------------------------------------------------------');
    console.log('  SUCCESS: 10-turn simulation completed with 0 desynchronizations!');
    console.log('===============================================================');
  } catch (err) {
    console.error('[Simulation Error]', err);
    process.exit(1);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await browser.close();
    await server.stop();
  }

  process.exit(0);
}

runBotSimulation();
