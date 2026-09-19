const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  
  // Player 1 (Host)
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();
  await page1.goto('http://localhost:5173');
  await page1.fill('#player-name-input', 'HostPlayer');
  await page1.click('#btn-create-room');
  
  // Wait for room to be created and get code
  await page1.waitForSelector('#waiting-room-code');
  const roomCode = await page1.innerText('#waiting-room-code');
  console.log('Created room:', roomCode);

  // Player 2
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto('http://localhost:5173');
  await page2.fill('#player-name-input', 'GuestPlayer');
  await page2.click('#btn-join-room-prompt');
  await page2.fill('#room-code-input', roomCode);
  await page2.click('#btn-submit-join');

  // Wait for both to be in the lobby
  await page1.waitForSelector('.slot-card.occupied:nth-child(2)');
  console.log('Player 2 joined');

  // Player 2 readies up
  await page2.click('#btn-toggle-ready');
  console.log('Player 2 readied up');

  // Player 1 starts game
  await page1.click('#btn-start-game');
  console.log('Game 1 started');

  // Wait for game to finish (we'll just use the testing hook to force a win)
  await page1.waitForFunction(() => window.__MATCH_POP__?.getGameState() === 'IN_GAME');
  
  await page1.evaluate(() => {
    // Force target score
    window.__MATCH_POP__.currentLevel = 1;
    window.__MATCH_POP__.currentTargetScore = 1; 
    // Trigger something that checks game over or we just simulate it by sending a move that scores
  });

  // Let's just wait a bit and close it.
  console.log('Test complete. Browser closing.');
  await browser.close();
})();
