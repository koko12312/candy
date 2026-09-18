## 2026-09-17T23:40:15Z
You are Explorer 2 for Milestone M4 (Headless Multi-Client Bot Simulation & Verification Suite).
Your working directory is: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_m4_2
Inputs:
- Read ORIGINAL_REQUEST.md: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/ORIGINAL_REQUEST.md
- Read PROJECT.md: c:/Users/dsagh/OneDrive/Desktop/html/candy/PROJECT.md
- Read client UI: `src/client/ui/LobbyUI.ts`, `HUD.ts`, and `src/client/main.ts`.

Task:
Design the complete test scenario matrix for 2-4 concurrent browser contexts:
1. Scenario A: 2-player match (create room, join code, ready up, host start, verify board rendered).
2. Scenario B: 4-player full match (slots 0..3, cyclic turn rotation, active indicator checks).
3. Scenario C: Player move simulation (using `window.__MATCH_POP__.simulateSwap` or synthetic touch drag, waiting for `onCascadeSettled`, verifying turn advance and score increment).
4. Scenario D: 20s authoritative turn timeout (no move made, server auto-passes turn, active slot advances, board unchanged).
5. Scenario E: Mid-game disconnect & reconnect recovery (closing a page, asserting reconnecting status, opening new page with same `sessionToken`, verifying full board state rehydration).
6. Scenario F: Game over / podium display when moves or rounds complete.

Write your report to: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_m4_2/handoff.md
Send a message to the orchestrator when finished.
