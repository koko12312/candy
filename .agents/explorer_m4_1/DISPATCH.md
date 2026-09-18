## 2026-09-17T23:40:15Z
You are Explorer 1 for Milestone M4 (Headless Multi-Client Bot Simulation & Verification Suite).
Your working directory is: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_m4_1
Inputs:
- Read ORIGINAL_REQUEST.md: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/ORIGINAL_REQUEST.md
- Read PROJECT.md: c:/Users/dsagh/OneDrive/Desktop/html/candy/PROJECT.md
- Read Explorer 3 Survey: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_3/handoff.md
- Examine existing server in `src/server/index.ts`, `SocketServer.ts`, client in `src/client/main.ts` (especially `window.__MATCH_POP__`), and `package.json`.

Task:
Investigate and recommend the optimal runner architecture and environment setup for Milestone M4:
1. Check what packages are available or needed (`@playwright/test`, `playwright`, or standalone script with `playwright-core` / chromium).
2. How to reliably launch the combined Vite client + SocketServer in background or ephemeral port during test execution on Windows without port conflicts.
3. How to configure `npm run test:e2e` in `package.json` for seamless, non-flaky execution.
4. Report detailed recommendations and concrete code snippets for the test runner and config.

Write your report to: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_m4_1/handoff.md
Send a message to the orchestrator when finished.
