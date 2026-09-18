# Technical Specification & Handoff Report: Runner Architecture & Environment Setup for Milestone M4 (Headless Multi-Client Bot Simulation & Verification Suite)

**Author:** Explorer 1 (Milestone M4)  
**Target File:** `c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_m4_1/handoff.md`  
**Date:** 2026-09-17  

---

## 1. Observation

Directly observed from the workspace, environment, and source files:

1. **System & Package Environment:**
   - **OS:** Windows 11 (`win32 x64`), Node.js `v24.16.0`, npm `11.16.0`.
   - **Current `package.json`:**
     - Dependencies: `cors ^2.8.6`, `express ^4.22.3`, `socket.io ^4.8.3`, `socket.io-client ^4.8.3`, `uuid ^14.0.2`.
     - DevDependencies: `@types/cors`, `@types/express`, `@types/node`, `@types/socket.io`, `@types/uuid`, `tsx ^4.19.2`, `typescript ^5.7.2`, `vite ^6.0.3`, `vitest ^2.1.8`.
     - Playwright is **not yet listed** in `package.json`.
   - **Local Playwright Cache:**
     - Inspected directory: `C:\Users\dsagh\AppData\Local\ms-playwright`
     - Status: `chromium-1243`, `chromium_headless_shell-1243`, `firefox-1543`, `webkit-2359`, and `winldd-1007` are **already downloaded and cached** on the machine.
   - **NPM Registry:** Verified accessible; `@playwright/test` version `1.63.0` resolves and installs cleanly without dependency conflicts.

2. **Existing Server Architecture (`src/server/index.ts`):**
   - Express server with HTTP server and Socket.io `SocketServer` attached (`createServer()`).
   - Line 43-44:
     ```typescript
     const staticPath = path.resolve(process.cwd(), 'dist');
     app.use(express.static(staticPath));
     ```
   - Line 46:
     ```typescript
     const start = (port = Number(process.env.PORT) || 3000): Promise<number>
     ```
     - **Observed Bug/Caveat:** In JavaScript, `0` is falsy. If `port = 0` is passed via `process.env.PORT = "0"`, `Number("0") || 3000` evaluates to `3000`. However, if `server.start(0)` is called directly as an argument, Node binds to an OS-assigned ephemeral port (e.g. 50885) and resolves the actual assigned port via `httpServer.address().port`.
     - Express serves `dist/index.html` (size: ~20.1 kB) and `dist/assets/*.js` with correct MIME types (`application/javascript`). Verified empirically via `fetch('http://localhost:50913/')` returning HTTP 200.
     - Express lacks an explicit SPA fallback route for deep paths (e.g. `app.get('*', ...)`).

3. **Existing Client Architecture (`src/client/main.ts` & `NetworkClient.ts`):**
   - Line 69 of `NetworkClient.ts`:
     ```typescript
     this.serverUrl = url || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
     ```
     When the browser opens `http://localhost:<ephemeralPort>`, `window.location.origin` is automatically `http://localhost:<ephemeralPort>`, allowing Socket.io to connect to the exact same host and port without any proxy configuration!
   - In `src/client/main.ts`, `window.__MATCH_POP__` is **already implemented** with:
     - `getRoomCode()`, `getGameState()`, `getActiveSlot()`, `getActivePlayerId()`, `getBoardState()`, `getBoardHash()`, `getTurnRemainingSeconds()`, `simulateSwap(from, to)`, `onCascadeSettled(cb)`, and `getScores()`.

4. **Vite Build Performance:**
   - Command: `npm run build` (`tsc && vite build`).
   - Execution time: **506ms**.
   - Output: `dist/index.html` (20.1 kB) and `dist/assets/index-DBCaqE7b.js` (103 kB).

5. **Existing Unit Tests:**
   - 6 test files, 115 tests passing in 2.35s via `vitest run`.
   - `vitest` currently runs all test files matching `**/*.{test,spec}.ts`.

---

## 2. Logic Chain

### 2.1 Package Selection & Architecture
1. **Observation:** Playwright is not yet in `package.json`, but `ms-playwright` has `chromium-1243`.
2. **Options Evaluated:**
   - **`@playwright/test`:** Provides full test runner, multi-context browser management (crucial for 4 players), device presets (`Pixel 7`, `iPhone 14 Pro`), auto-wait assertions, screenshot/trace capture on failure, and HTML reporting.
   - **`playwright` / `playwright-core` standalone script:** Allows running a custom simulation script via `tsx`.
   - **Vitest + Playwright:** Vitest is already installed, but Vitest's 5-second default timeout and lack of native multi-browser context fixtures makes it inferior to `@playwright/test` for E2E orchestration.
3. **Synthesis:** `@playwright/test` includes `playwright-core` and re-exports `chromium`, `devices`, etc. By installing `@playwright/test`, we can support **both**:
   - The formal test specification: `tests/e2e/multiplayer_sync.spec.ts` (run via `npx playwright test`).
   - A standalone simulation CLI script: `tests/e2e/multiplayer_bot_simulation.ts` (run via `npx tsx`).

### 2.2 Server & Client Launch Architecture on Windows (Zero Port Conflicts)
1. **Observation:** Port 3000 is default in both `vite.config.ts` and `src/server/index.ts`. If both run separately, or if leftover Node processes exist on Windows, port conflicts (`EADDRINUSE`) occur frequently.
2. **Analysis of Candidate Launch Models:**
   - **Model 1: Separate Vite dev server + Separate Express server with proxy.**
     - Requires 2 background processes. On Windows, killing background process trees in PowerShell is notoriously flaky, leading to orphaned processes holding ports.
   - **Model 2: Unified In-Process Express Server serving pre-built Vite (`dist/`).**
     - Step 1: `npm run build` takes ~500ms and bundles the client into `dist/`.
     - Step 2: In the test fixture or runner, `const server = createServer(); const port = await server.start(0);`.
     - Step 3: Express serves `dist/` and hosts Socket.io on the exact same ephemeral port (e.g. 51234).
     - Step 4: Playwright browser contexts navigate to `http://localhost:${port}`.
     - **Result:**
       - Single port allocated dynamically by the OS kernel. Zero risk of collision.
       - Zero CORS issues and zero proxy hops.
       - Exact production bundle is verified.
       - Server lifecycle is strictly bounded by the test worker: `server.start(0)` in worker setup, `server.stop()` in worker teardown. No background tasks or orphaned processes on Windows!

### 2.3 `package.json` Configuration & Test Isolation
1. **Observation:** `npm test` runs `vitest run`. If `tests/e2e/multiplayer_sync.spec.ts` is created without isolation, `npm test` will attempt to execute the E2E spec under Vitest, causing timeout failures.
2. **Action:**
   - Update `"test": "vitest run tests/unit"`.
   - Add `"test:e2e": "npm run build && playwright test"`.
   - Add `"test:e2e:bot": "npm run build && tsx tests/e2e/multiplayer_bot_simulation.ts"`.
   - Add `"test:e2e:ui": "npm run build && playwright test --ui"`.

---

## 3. Caveats & Invalidation Conditions

1. **`src/server/index.ts` Port 0 Truthiness Bug:**
   - Line 46 uses `(port = Number(process.env.PORT) || 3000)`. Because `0 || 3000 === 3000`, setting `PORT=0` in environment variables fails to allocate an ephemeral port.
   - *Recommendation:* Implementer must adjust line 46 to use explicit nullish coalescing:
     `const targetPort = port !== undefined ? port : (process.env.PORT !== undefined ? Number(process.env.PORT) : 3000);`
2. **Express SPA Fallback Missing:**
   - If a browser refreshes on a sub-route, Express static middleware returns 404. Adding `app.get('*', (req, res) => res.sendFile(path.resolve(staticPath, 'index.html')))` prevents any 404s.
3. **Playwright Workers Contention:**
   - For multi-client tests (1 host + 3 guests = 4 concurrent browser pages), `workers: 1` should be configured in `playwright.config.ts`. Running multiple 4-player tests in parallel can saturate CPU/GPU on a single machine, causing canvas animation delays and false-positive timeout flakes.
4. **Canvas Coordinate Automation vs Synthetic Hooks:**
   - While `window.__MATCH_POP__.simulateSwap(from, to)` reliably bypasses canvas rendering timing to test network synchronization directly, synthetic touch/swipe pointer events must also be verified for mobile touch criteria. Both methods should be included in the test suite.

---

## 4. Conclusion & Concrete Recommendations

### 4.1 Required Packages
Install `@playwright/test`:
```bash
npm install -D @playwright/test
npx playwright install chromium
```

### 4.2 Script Changes in `package.json`
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "server": "tsx src/server/index.ts",
    "test": "vitest run tests/unit",
    "test:watch": "vitest tests/unit",
    "test:e2e": "npm run build && playwright test",
    "test:e2e:ui": "npm run build && playwright test --ui",
    "test:e2e:debug": "npm run build && playwright test --debug",
    "test:e2e:bot": "npm run build && tsx tests/e2e/multiplayer_bot_simulation.ts"
  }
}
```

### 4.3 Recommended File Architecture for Milestone M4

```
tests/
├── unit/                                  # Existing unit test suite (115 tests)
└── e2e/
    ├── fixtures.ts                        # Playwright worker fixture (ephemeral server setup/teardown)
    ├── helpers/
    │   ├── BotClient.ts                   # Bot abstraction driving window.__MATCH_POP__ & synthetic touch
    │   └── moveFinder.ts                  # Legal move finder for automated bot swaps
    ├── multiplayer_sync.spec.ts           # Formal Playwright multi-client test specification
    └── multiplayer_bot_simulation.ts      # Standalone headless simulation CLI script
playwright.config.ts                       # Playwright test configuration
```

---

## 5. Concrete Code Snippets for Implementer

### Snippet 1: `playwright.config.ts`
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 90000, // 90s test timeout to support 4 players & turn countdowns
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  workers: 1, // Single worker prevents CPU contention with 4 concurrent browser pages
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Mobile Viewport Default (Pixel 7 Android)
    viewport: { width: 412, height: 915 },
    hasTouch: true,
    isMobile: true
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] }
    }
  ]
});
```

### Snippet 2: `tests/e2e/fixtures.ts` (Worker-Scoped Ephemeral Server)
```typescript
import { test as base, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { createServer, AppServer } from '../../src/server/index';

export type ServerFixture = {
  appServer: AppServer;
  serverUrl: string;
};

export const test = base.extend<{}, ServerFixture>({
  // Worker-scoped fixture boots Express + Socket.io on an ephemeral port once per worker process
  appServer: [
    async ({}, use) => {
      const server = createServer();
      const port = await server.start(0); // Binds to random available OS port (e.g. 50885)
      (server as any).__port = port;
      await use(server);
      await server.stop();
    },
    { scope: 'worker', auto: true }
  ],

  serverUrl: [
    async ({ appServer }, use) => {
      const port = (appServer as any).__port;
      await use(`http://localhost:${port}`);
    },
    { scope: 'worker' }
  ]
});

export { expect };
```

### Snippet 3: `tests/e2e/helpers/BotClient.ts`
```typescript
import { BrowserContext, Page, expect } from '@playwright/test';
import { Coordinate, Tile } from '../../../src/shared/types';

export class BotClient {
  public name: string;
  public avatarId: string;
  public page: Page;
  public context: BrowserContext;

  constructor(name: string, avatarId: string, page: Page, context: BrowserContext) {
    this.name = name;
    this.avatarId = avatarId;
    this.page = page;
    this.context = context;
  }

  public async navigateTo(url: string): Promise<void> {
    await this.page.goto(url);
    await this.page.waitForSelector('#app', { state: 'visible' });
    // Wait until window.__MATCH_POP__ is initialized
    await this.page.waitForFunction(() => typeof (window as any).__MATCH_POP__ !== 'undefined');
  }

  public async createRoom(): Promise<string> {
    // Fill name and create room
    await this.page.fill('#player-name-input', this.name);
    await this.page.click('#btn-create-room');
    await this.page.waitForSelector('#room-code-display', { state: 'visible' });
    const code = await this.page.evaluate(() => (window as any).__MATCH_POP__.getRoomCode());
    return code;
  }

  public async joinRoom(roomCode: string): Promise<void> {
    await this.page.fill('#player-name-input', this.name);
    await this.page.fill('#room-code-input', roomCode);
    await this.page.click('#btn-join-room');
    await this.page.waitForSelector('#room-code-display', { state: 'visible' });
  }

  public async setReady(): Promise<void> {
    await this.page.click('#btn-toggle-ready');
  }

  public async startGame(): Promise<void> {
    await this.page.click('#btn-start-game');
  }

  public async waitForGameState(state: 'LOBBY' | 'IN_GAME' | 'GAME_OVER'): Promise<void> {
    await this.page.waitForFunction(
      (expected) => (window as any).__MATCH_POP__.getGameState() === expected,
      state,
      { timeout: 15000 }
    );
  }

  public async getBoardHash(): Promise<string> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getBoardHash());
  }

  public async getBoardState(): Promise<Tile[][]> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getBoardState());
  }

  public async getActivePlayerId(): Promise<string> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getActivePlayerId());
  }

  public async getActiveSlot(): Promise<number> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getActiveSlot());
  }

  public async executeSwap(from: Coordinate, to: Coordinate): Promise<boolean> {
    return await this.page.evaluate(
      ({ f, t }) => (window as any).__MATCH_POP__.simulateSwap(f, t),
      { f: from, t: to }
    );
  }

  public async waitForCascadeSettled(): Promise<void> {
    await this.page.evaluate(() => {
      return new Promise<void>((resolve) => {
        (window as any).__MATCH_POP__.onCascadeSettled(resolve);
      });
    });
  }
}
```

### Snippet 4: `tests/e2e/multiplayer_sync.spec.ts`
```typescript
import { test, expect } from './fixtures';
import { BotClient } from './helpers/BotClient';
import { Match3Engine } from '../../src/shared/engine/Match3Engine';

test.describe('Milestone M4: Headless Multi-Client Bot Simulation & Verification', () => {
  test('Scenario 1 & 2: 4-Player Lobby, Turn Progression, Cascades & 100% Board Hash Parity', async ({ browser, serverUrl }) => {
    // 1. Launch 4 separate browser contexts (emulating 4 unique devices)
    const ctx1 = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true });
    const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true });
    const ctx3 = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true });
    const ctx4 = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true });

    const p1 = new BotClient('Alice_Host', 'avatar_1', await ctx1.newPage(), ctx1);
    const p2 = new BotClient('Bob_Player', 'avatar_2', await ctx2.newPage(), ctx2);
    const p3 = new BotClient('Charlie_Player', 'avatar_3', await ctx3.newPage(), ctx3);
    const p4 = new BotClient('Diana_Player', 'avatar_4', await ctx4.newPage(), ctx4);

    try {
      // 2. Alice creates room
      await p1.navigateTo(serverUrl);
      const roomCode = await p1.createRoom();
      expect(roomCode).toBeTruthy();

      // 3. Bob, Charlie, Diana join room
      await Promise.all([
        (async () => { await p2.navigateTo(serverUrl); await p2.joinRoom(roomCode); await p2.setReady(); })(),
        (async () => { await p3.navigateTo(serverUrl); await p3.joinRoom(roomCode); await p3.setReady(); })(),
        (async () => { await p4.navigateTo(serverUrl); await p4.joinRoom(roomCode); await p4.setReady(); })()
      ]);

      // 4. Alice starts game
      await p1.startGame();

      // 5. Assert all 4 clients transition to IN_GAME
      await Promise.all([
        p1.waitForGameState('IN_GAME'),
        p2.waitForGameState('IN_GAME'),
        p3.waitForGameState('IN_GAME'),
        p4.waitForGameState('IN_GAME')
      ]);

      // 6. Assert Initial Board State Hash Parity across all 4 clients
      const [hash1, hash2, hash3, hash4] = await Promise.all([
        p1.getBoardHash(),
        p2.getBoardHash(),
        p3.getBoardHash(),
        p4.getBoardHash()
      ]);
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
      expect(hash3).toBe(hash4);

      // 7. Execute valid move for active player (Slot 0 - Alice)
      const board = await p1.getBoardState();
      const engine = new Match3Engine();
      // Find valid swap coordinates
      let validMove: { from: { row: number; col: number }; to: { row: number; col: number } } | null = null;
      for (let r = 0; r < board.length && !validMove; r++) {
        for (let c = 0; c < board[r].length && !validMove; c++) {
          if (c + 1 < board[r].length && (engine as any).isValidSwap(board, board[r][c], board[r][c + 1])) {
            validMove = { from: { row: r, col: c }, to: { row: r, col: c + 1 } };
          } else if (r + 1 < board.length && (engine as any).isValidSwap(board, board[r][c], board[r + 1][c])) {
            validMove = { from: { row: r, col: c }, to: { row: r + 1, col: c } };
          }
        }
      }
      expect(validMove).toBeTruthy();

      // Alice executes move
      const swapPromise = p1.executeSwap(validMove!.from, validMove!.to);
      await swapPromise;

      // Wait for cascades to settle across all 4 clients
      await Promise.all([
        p1.waitForCascadeSettled(),
        p2.waitForCascadeSettled(),
        p3.waitForCascadeSettled(),
        p4.waitForCascadeSettled()
      ]);

      // 8. Assert Post-Cascade Board State Hash Parity (Zero Desynchronization)
      const [postHash1, postHash2, postHash3, postHash4] = await Promise.all([
        p1.getBoardHash(),
        p2.getBoardHash(),
        p3.getBoardHash(),
        p4.getBoardHash()
      ]);
      expect(postHash1).not.toBe(hash1); // Board actually changed
      expect(postHash1).toBe(postHash2);
      expect(postHash2).toBe(postHash3);
      expect(postHash3).toBe(postHash4);

      // 9. Assert Turn Advanced to Slot 1 (Bob)
      const activeSlot = await p1.getActiveSlot();
      expect(activeSlot).toBe(1);

    } finally {
      await ctx1.close();
      await ctx2.close();
      await ctx3.close();
      await ctx4.close();
    }
  });

  test('Scenario 4: Mid-Game Disconnect & Session Reconnection Parity', async ({ browser, serverUrl }) => {
    // Verifies Charlie disconnects, reconnects with saved sessionToken, and achieves 100% board parity
    // ...
  });
});
```

### Snippet 5: `tests/e2e/multiplayer_bot_simulation.ts` (Standalone Executable Script)
```typescript
import { chromium } from '@playwright/test';
import { createServer } from '../../src/server/index';

async function main() {
  console.log('=====================================================');
  console.log('🚀 MATCH POP MULTIPLAYER: 4-BOT HEADLESS SIMULATION');
  console.log('=====================================================');

  const server = createServer();
  const port = await server.start(0);
  const serverUrl = `http://localhost:${port}`;
  console.log(`[Server] Ephemeral server running on ${serverUrl}`);

  const browser = await chromium.launch({ headless: true });

  try {
    const ctx1 = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto(serverUrl);
    await page2.goto(serverUrl);

    console.log('✅ Both client pages loaded successfully!');
    // Simulation steps...
  } finally {
    await browser.close();
    await server.stop();
    console.log('[Teardown] Server and browser closed cleanly.');
  }
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
```

---

## 6. Verification Method

To independently verify this runner architecture during implementation:

1. **Package Installation Check:**
   ```bash
   npm install -D @playwright/test
   npx playwright install chromium
   ```
   Confirm `node_modules/@playwright/test` exists and resolves.

2. **Ephemeral Server Build & Run Check:**
   ```bash
   npm run build
   npx tsx -e "import { createServer } from './src/server/index'; (async () => { const s = createServer(); const p = await s.start(0); console.log('Port:', p); await s.stop(); })()"
   ```
   Confirm server binds to an ephemeral port > 1024 without errors.

3. **E2E Test Execution Check:**
   ```bash
   npm run test:e2e
   ```
   Confirm all scenarios pass with green status, zero port collisions, and zero hanging Node processes.
