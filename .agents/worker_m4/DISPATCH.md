## 2026-09-17T23:54:05Z
You are Worker M4 for Match Pop Multiplayer.
Your working directory is: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/worker_m4

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Context & Inputs:
- Read ORIGINAL_REQUEST.md: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/ORIGINAL_REQUEST.md
- Read PROJECT.md: c:/Users/dsagh/OneDrive/Desktop/html/candy/PROJECT.md
- Read Explorer 1 Report (Runner Architecture & Config): c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_m4_1/handoff.md
- Read Explorer 2 Report (Scenario Matrix A-F): c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_m4_2/handoff.md
- Read Explorer 3 Report (Invariant Synchronization & Desync Detection): c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_m4_3/handoff.md
- Review existing codebase: `src/server/index.ts`, `src/client/main.ts`, `package.json`.

Your Task (Milestone M4: Headless Multi-Client Bot Simulation & Verification Suite):
Implement the complete automated E2E testing suite and bot simulation harness:
1. Fix port 0 truthiness in `src/server/index.ts` (line 46) so `server.start(0)` properly binds to an ephemeral OS port without defaulting to 3000 when port is 0. Also ensure `dist/` is statically served with an SPA fallback route if needed.
2. Install `@playwright/test`:
   `npm install -D @playwright/test`
   `npx playwright install chromium` (Note: local cache `C:\Users\dsagh\AppData\Local\ms-playwright` already contains `chromium-1243`).
3. Update `package.json`:
   - `"test": "vitest run tests/unit"` (to prevent Vitest from intercepting Playwright specs).
   - `"test:e2e": "npm run build && playwright test"`.
   - `"test:e2e:bot": "npm run build && tsx tests/e2e/multiplayer_bot_simulation.ts"`.
4. Create `playwright.config.ts` per Explorer 1's specification (90s timeout, workers: 1, Pixel 7 mobile viewport emulation, list and html reporter).
5. Create `tests/e2e/fixtures.ts`:
   - Worker-scoped server fixture that calls `createServer()`, binds to ephemeral port 0, provides `serverUrl` to tests, and closes server on teardown.
6. Create `tests/e2e/helpers/`:
   - `BotClient.ts`: Encapsulates multi-client bot operations: joining room, avatar selection, ready-up, polling `window.__MATCH_POP__`, performing swaps via `simulateSwap` and synthetic pointer/touch gestures, and waiting for `onCascadeSettled`.
   - `InvariantHarness.ts`: Implements `assertBoardParity(pages)` comparing `window.__MATCH_POP__.getBoardHash()` across all pages, verifying 81 cells format, structural integrity, and logging cell diffs on mismatch.
   - `moveFinder.ts`: Legal move finder using `Match3Engine.hasValidMoves` or board inspection to execute genuine valid swaps.
7. Create `tests/e2e/multiplayer_sync.spec.ts` covering:
   - Scenario A: 2-player room creation, code join, ready negotiation, host start, initial board parity assertion across both clients.
   - Scenario B: 4-player full match, slot assignment (0..3), cyclic turn progression ($0 \to 1 \to 2 \to 3 \to 0$).
   - Scenario C: Active player swap execution, cascade settling, score increment, turn change, and 100% board parity assertion after cascade settles.
   - Scenario D: 20-second turn timeout: active player idle, server auto-passes turn, active slot advances, board unchanged.
   - Scenario E: Disconnect & reconnect recovery: close guest page, verify reconnecting status on peers, open new page with saved `sessionToken`, verify `game:sync_state` rehydration and 100% board parity restoration.
8. Create `tests/e2e/multiplayer_bot_simulation.ts`:
   - Standalone CLI runner using Playwright chromium that spins up a 4-player match, plays 10 consecutive turns automatically, logs board hashes, asserts zero desync, and exits cleanly with exit code 0.
9. Verify:
   - Run `npm test` (all unit tests must pass).
   - Run `npm run test:e2e` (all Playwright E2E tests must pass).
   - Run `npm run test:e2e:bot` (the bot simulation CLI must pass).

Document all commands, code files created, and test outputs in:
`c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/worker_m4/handoff.md`
Send a message to the orchestrator when finished.
