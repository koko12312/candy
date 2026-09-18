# Handoff Report: Multi-Client Test Scenario Matrix (Milestone M4)

## 1. Observation

### 1.1 Client UI Elements & Selectors
Direct inspection of `index.html`, `src/client/ui/LobbyUI.ts`, and `src/client/ui/HUD.ts` reveals the exact UI hierarchy and selectors used throughout the client lifecycle:

- **Lobby Screen** (`#lobby-screen`):
  - Initial card: `#lobby-main-card`
  - Waiting room card: `#lobby-waiting-card` (switched via `LobbyUI.setWaitingMode(inWaitingRoom, roomCode)`)
  - Profile controls: `#player-name-input` (alias input), `.avatar-option[data-avatar="avatar_X"]` (`avatar_1` through `avatar_6`, selected via `.selected`)
  - Creation & Join controls: `#btn-create-room`, `#btn-join-room-prompt`, `#join-form-row`, `#room-code-input`, `#btn-submit-join`, `#btn-refresh-rooms`, `#public-rooms-list`
  - Waiting room components: `#waiting-room-code` (displays uppercase 5-6 char code), `#btn-copy-code`, `#waiting-slots-container` (holds 4 `.slot-card` items), `.badge-ready`, `.badge-waiting`
  - Waiting room actions: `#btn-toggle-ready` (toggles text between `"Ready Up"` and `"Ready! (Cancel)"`), `#btn-start-game` (host only; disabled until all connected players ready), `#btn-leave-room`

- **In-Game Screen** (`#game-screen`):
  - Header: `#hud-room-code` (room code badge), `#btn-sound-toggle`, `#btn-music-toggle`
  - Turn Timer Ring: `#timer-ring-progress` (SVG circle stroke-dashoffset), `#timer-number-display` (`.timer-critical` when $\le 5$s)
  - Active Turn Banner: `#turn-banner` (`.turn-status-banner.my-turn` with text `"YOUR TURN!"` when active; `"{PlayerName}'s Turn"` otherwise)
  - Canvases: `#canvas-wrapper`, `#bg-canvas` (z-index 1), `#interactive-canvas` (z-index 2)
  - Players HUD: `#hud-players-strip`, holding `.player-pill` elements with `.player-pill.active` on active turn, `.player-pill.disconnected` when offline, `.pill-score` for points

- **Game Over Modal** (`#game-over-modal`):
  - Overlay: `.modal-overlay` (removes class `hidden` on game over)
  - Podium list: `#podium-entries`, holding `.podium-entry` items with `.podium-entry.winner` on first place
  - Back to lobby: `#btn-podium-lobby`

### 1.2 Exposed Testing Automation Hook (`window.__MATCH_POP__`)
Directly observed in `src/client/main.ts` (lines 11-26 and lines 350-380):
```typescript
window.__MATCH_POP__ = {
  getRoomCode: () => string,
  getGameState: () => 'LOBBY' | 'IN_GAME' | 'GAME_OVER',
  getActiveSlot: () => number,
  getActivePlayerId: () => string,
  getBoardState: () => Tile[][],
  getBoardHash: () => string,
  getTurnRemainingSeconds: () => number,
  simulateSwap: (from: Coordinate, to: Coordinate) => Promise<boolean>,
  onCascadeSettled: (callback: () => void) => void,
  getScores: () => Record<string, number>
};
```

### 1.3 Authoritative Board Hash Formula
Directly observed in `src/client/render/CanvasRenderer.ts` (lines 697-710):
```typescript
public getBoardHash(): string {
  let hashStr = '';
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const visual = this.gridMatrix[r][c];
      if (visual) {
        hashStr += `${r},${c}:${visual.id}:${visual.color}:${visual.type}|`;
      } else {
        hashStr += `${r},${c}:null|`;
      }
    }
  }
  return hashStr;
}
```
Each cell encodes discrete row, col, unique tile numeric `id`, color enum (0..5), and candy type string (`NORMAL`, `STRIPED_HORIZONTAL`, `STRIPED_VERTICAL`, `WRAPPED`, `COLOR_BOMB`).

### 1.4 Authoritative Server Rules & Timing Contracts
Observed in `src/server/Room.ts`, `GameSession.ts`, and `SocketServer.ts`:
- Player slots: 0, 1, 2, 3 assigned sequentially. Slot 0 is always initial host.
- Start readiness requirement: `allReady = state.players.length >= 1 && state.players.every((p) => p.isReady || p.isHost)`.
- Turn timer: 20,000ms (`DEFAULT_TURN_DURATION_MS`). On expiration, server invokes `handleTurnTimeout()`, records `consecutiveTimeouts++`, and emits `game:timeout` followed by `game:turn_change`.
- Move evaluation & concurrency lockout: `isEvaluatingMove = true` locks concurrent moves; server computes cascade steps and schedules turn advance after `animDelay = Math.min(3000, cascadeSteps * 400)`.
- Disconnect grace period: 45,000ms (`RECONNECT_GRACE_PERIOD_MS`). Reconnection with `sessionToken` restores slot and emits `game:sync_state` with full board and turn timer.
- Game Over: Triggers when `round > maxRounds` after cyclic wrap, or when only 1 connected player remains in a multiplayer room.

---

## 2. Logic Chain

### 2.1 Transition to Multi-Client Bot Simulation
1. **Observation 1.1 & 1.2**: Client UI transitions are driven deterministically by server socket events (`room:state`, `game:start`, `game:move_result`, `game:turn_change`, `game:timeout`, `game:over`, `game:sync_state`), and expose both standard DOM selectors and clean programmatic hooks on `window.__MATCH_POP__`.
2. **Observation 1.3**: `CanvasRenderer.getBoardHash()` computes an exact serialized fingerprint of the visual board matrix. If any client has a single mismatched tile id, color, or type, the string hashes diverge immediately.
3. **Inference**: A Playwright test suite launching 2 to 4 concurrent browser contexts can assert 100% board parity and turn state correctness at every step by polling `window.__MATCH_POP__.getBoardHash()` and `window.__MATCH_POP__.getActiveSlot()`.
4. **Scenario Matrix Formulation**:
   - **Scenario A (2-Player Match Lifecycle)**: Proves base two-party room creation, join code propagation, ready status negotiation, host start synchronization, and initial board render parity.
   - **Scenario B (4-Player Full Match & Cyclic Rotation)**: Proves full room capacity (Slots 0..3), slot ordering, spectator rejection/handling, and authoritative cyclic turn progression ($0 \to 1 \to 2 \to 3 \to 0$) with round incrementing.
   - **Scenario C (Player Move Simulation & Cascades)**: Proves move initiation via `simulateSwap` and synthetic touch drag, waiting for `onCascadeSettled`, verifying cascade animations across all clients, score increments, and post-cascade zero-desync parity.
   - **Scenario D (20s Authoritative Turn Timeout)**: Proves that when an active player remains idle, the server's 20s authoritative timer triggers auto-pass, advances slot to next player, leaves board completely unchanged, and leaves scores untouched.
   - **Scenario E (Mid-Game Disconnect & Reconnect Recovery)**: Proves graceful degradation when a tab closes, HUD disconnect status indication, and complete board/state rehydration when a new page connects using the saved `sessionToken`.
   - **Scenario F (Game Over Podium & Lobby Return)**: Proves game termination triggers, accurate score descending sort on the podium modal, winner highlight, and seamless return to lobby.

---

## 3. Detailed Scenario Matrix & Specifications

### 3.1 Scenario A: 2-Player Match Lifecycle

- **Contexts**: Context 0 (Host P0, viewport `393x851`), Context 1 (Guest P1, viewport `390x844`).
- **Preconditions**: Server running, both pages at `/`.
- **Execution Flow**:
  1. P0 enters `"HostAlice"`, selects `avatar_1`, clicks `#btn-create-room`.
  2. P0 waits for `#lobby-waiting-card` visible. Extracts `roomCode = await page0.evaluate(() => window.__MATCH_POP__.getRoomCode())`.
  3. Assert P0 `#waiting-slots-container` shows Slot 1 `"HostAlice (You)"` with `"HOST"` badge. Host `#btn-start-game` is disabled (`disabled === true`).
  4. P1 enters `"GuestBob"`, selects `avatar_2`, clicks `#btn-join-room-prompt`, inputs `roomCode`, clicks `#btn-submit-join`.
  5. P1 waits for `#lobby-waiting-card` visible.
  6. Assert both pages show `#waiting-room-code === roomCode`.
  7. Assert on both pages: Slot 0 is `"HostAlice"`, Slot 1 is `"GuestBob"` with `"WAITING"` badge (`.badge-waiting`).
  8. P1 clicks `#btn-toggle-ready`. Button text updates to `"Ready! (Cancel)"`. Slot 1 badge updates to `"READY"` (`.badge-ready`) on both pages.
  9. Assert Host `#btn-start-game` becomes enabled.
  10. P0 clicks `#btn-start-game`.
  11. Both pages wait for `#game-screen` visible, `#lobby-screen.hidden`.
  12. Assert `window.__MATCH_POP__.getGameState() === 'IN_GAME'` on both.
- **Invariant Assertions**:
  - `page0.evaluate(() => window.__MATCH_POP__.getActiveSlot()) === 0`.
  - P0 `#turn-banner` has text `"YOUR TURN!"` and class `.my-turn`.
  - P1 `#turn-banner` has text `"HostAlice's Turn"`.
  - P0 and P1 both display 2 player pills in `#hud-players-strip`; Pill 0 has class `.active`.
  - Initial Board Parity: `expect(await page0.evaluate(() => window.__MATCH_POP__.getBoardHash())).toBe(await page1.evaluate(() => window.__MATCH_POP__.getBoardHash()))`.

### 3.2 Scenario B: 4-Player Full Match & Cyclic Turn Rotation

- **Contexts**: 4 concurrent contexts (P0..P3).
- **Execution Flow**:
  1. P0 creates room -> extracts `roomCode`.
  2. P1, P2, P3 join sequentially using `roomCode`.
  3. Slot Invariant Check: Verify on all 4 clients that P0 is Slot 0, P1 is Slot 1, P2 is Slot 2, P3 is Slot 3.
  4. Ready Check: P1, P2, P3 each click `#btn-toggle-ready`. Assert P0 `#btn-start-game` is enabled only when all 3 guests are ready.
  5. P0 clicks `#btn-start-game`. All 4 clients transition to `'IN_GAME'`.
  6. Cyclic Turn Progression (Slots $0 \to 1 \to 2 \to 3 \to 0$):
     - For each slot $S \in [0, 1, 2, 3]$:
       - On all 4 pages: `window.__MATCH_POP__.getActiveSlot() === S`.
       - On page $S$: `#turn-banner` is `"YOUR TURN!"` (class `.my-turn`).
       - On pages $\neq S$: `#turn-banner` displays active player's name.
       - In `#hud-players-strip` on all 4 pages: only pill $S$ has `.active`.
       - Active player executes a valid move via `simulateSwap`.
       - All 4 pages await `window.__MATCH_POP__.onCascadeSettled()`.
       - Server emits `game:turn_change` advancing to $(S + 1) \pmod 4$.
  7. Round Wrap Invariant: When advancing from Slot 3 back to Slot 0, verify round advances from 1 to 2.

### 3.3 Scenario C: Player Move Simulation & Cascades

- **Contexts**: 2-4 concurrent contexts.
- **Execution Flow**:
  1. Active player queries `board = await activePage.evaluate(() => window.__MATCH_POP__.getBoardState())`.
  2. Helper detects valid orthogonal match-3 move `{ from: { row, col }, to: { row, col } }`.
  3. **Method 1 (Programmatic)**:
     - `await activePage.evaluate(({from, to}) => window.__MATCH_POP__.simulateSwap(from, to), { from, to })`.
  4. **Method 2 (Synthetic Touch Drag)**:
     - Compute pixel bounding box of `#interactive-canvas`.
     - Calculate center of cell `from` and cell `to`.
     - Dispatch pointer drag: `mouse.move(fromX, fromY)` $\to$ `mouse.down()` $\to$ `mouse.move(toX, toY, { steps: 5 })` (exceeding 24px swipe threshold) $\to$ `mouse.up()`.
  5. **Cascade Settling Synchronization**:
     - All clients register settling promise:
       ```typescript
       await Promise.all(pages.map(p => p.evaluate(() => new Promise<void>(res => {
         window.__MATCH_POP__.onCascadeSettled(() => res());
       }))));
       ```
  6. **Invariant Assertions**:
     - Active player score in `window.__MATCH_POP__.getScores()` and HUD `.pill-score` increased by turn score.
     - Other players' scores remain unchanged.
     - Board Parity: `expect(hashP0).toBe(hashP1) === ... === hashPN`.
     - Non-active players attempting `simulateSwap` during the turn are rejected with `'NOT_YOUR_TURN'`.
     - Swaps during cascade evaluation are rejected with `'EVALUATING'`.

### 3.4 Scenario D: 20s Authoritative Turn Timeout

- **Contexts**: 2-4 concurrent contexts.
- **Execution Flow**:
  1. Record current active slot $S$ and capture `boardHashBefore = await page0.evaluate(() => window.__MATCH_POP__.getBoardHash())`.
  2. Record initial scores for all players.
  3. No move is made by active player.
  4. Invariant during countdown:
     - `getTurnRemainingSeconds()` decreases authoritatively from $\approx 20$ to $0$.
     - When remaining $\le 5$, `#timer-number-display` gains class `.timer-critical` and stroke turns red.
  5. Await turn transition:
     ```typescript
     await page0.waitForFunction((prevSlot) => {
       return window.__MATCH_POP__.getActiveSlot() !== prevSlot;
     }, S, { timeout: 25000 });
     ```
  6. **Invariant Assertions**:
     - New active slot is $(S + 1) \pmod N$.
     - Board unchanged: `expect(await page0.evaluate(() => window.__MATCH_POP__.getBoardHash())).toBe(boardHashBefore)`.
     - All scores remain exactly equal to initial scores (no points awarded).
     - `#turn-banner` updates: old active player loses `.my-turn`, new active player gets `.my-turn`.
     - Timer resets back to 20s for the new player.

### 3.5 Scenario E: Mid-Game Disconnect & Reconnect Recovery

- **Contexts**: Context 0 (P0 Host), Context 1 (P1 Guest).
- **Execution Flow**:
  1. Match in progress, at least 1 move made, scores $> 0$.
  2. Capture `boardHashBefore = await page0.evaluate(() => window.__MATCH_POP__.getBoardHash())`.
  3. Extract P1's session credentials:
     ```typescript
     const { sessionToken, roomCode } = await page1.evaluate(() => ({
       sessionToken: localStorage.getItem('matchpop_session_token'),
       roomCode: localStorage.getItem('matchpop_last_room')
     }));
     ```
  4. Abrupt disconnect: `await page1.close()`.
  5. On P0:
     - Wait for `.player-pill.disconnected` to appear on P1's pill.
     - Verify P0 board remains intact and interactive.
  6. Reconnection:
     - In Context 1, open new page: `const reconnectedPage = await context1.newPage();`.
     - Seed `localStorage` before load:
       ```typescript
       await reconnectedPage.addInitScript(({ token, code }) => {
         localStorage.setItem('matchpop_session_token', token);
         localStorage.setItem('matchpop_last_room', code);
       }, { token: sessionToken, code: roomCode });
       await reconnectedPage.goto('http://localhost:3000/');
       ```
  7. **Rehydration Assertions**:
     - `reconnectedPage` bypasses Lobby and renders `#game-screen` directly.
     - `window.__MATCH_POP__.getGameState() === 'IN_GAME'`.
     - Reconnected board hash matches P0 board hash:
       `expect(await reconnectedPage.evaluate(() => window.__MATCH_POP__.getBoardHash())).toBe(boardHashBefore)`.
     - On P0: `.player-pill.disconnected` class is removed from P1.
     - Both players can resume normal turn moves with zero desync.

### 3.6 Scenario F: Game Over & Podium Display

- **Contexts**: 2-4 concurrent contexts.
- **Execution Flow**:
  1. Trigger match completion: Game round exceeds `maxRounds` (configured e.g. `maxRounds: 1` or `2` for test speed), or 1 player remains after forfeit.
  2. On all clients:
     - `#game-over-modal` removes class `hidden`.
     - `window.__MATCH_POP__.getGameState() === 'GAME_OVER'`.
     - Input handler is locked.
  3. **Podium Invariant Assertions**:
     - `#podium-entries` contains exactly $N$ entries.
     - First entry has class `.podium-entry.winner` with 🥇 emoji and gold accent.
     - Extracted scores across podium entries are sorted in strict descending order:
       $\text{Score}_0 \ge \text{Score}_1 \ge \dots \ge \text{Score}_{N-1}$.
     - Local player entry shows `"(You)"`.
  4. Click `#btn-podium-lobby`:
     - Modal hides, `#game-screen.hidden` added, `#lobby-screen` shown.
     - `window.__MATCH_POP__.getGameState() === 'LOBBY'`.

---

## 4. Invariant Assertion Summary Table

| ID | Invariant | Check Mechanism | Severity |
|:---|:---|:---|:---|
| **INV-1** | **Board Hash Parity** | `hash(P_0) === hash(P_1) === ... === hash(P_{N-1})` at resting states | **FATAL** |
| **INV-2** | **Single Active Player** | Exactly 1 player has `#turn-banner.my-turn` and `inputLocked === false` | **FATAL** |
| **INV-3** | **Score Monotonicity** | Only the player executing valid swap receives score $> 0$ | **CRITICAL** |
| **INV-4** | **Rehydration Parity** | Reconnected client `boardHash === host boardHash` immediately post-sync | **CRITICAL** |
| **INV-5** | **Cyclic Slot Order** | Active slot cycles $0 \to 1 \to 2 \to 3 \to 0$ without skipping active players | **CRITICAL** |
| **INV-6** | **Timeout Invariance** | Authoritative 20s timeout leaves board tiles and all scores 100% identical | **HIGH** |

---

## 5. Caveats

1. **Headless Execution Timing**: Headless Chromium running on CI or developer workstations may dispatch `requestAnimationFrame` at varying rates. Direct assertions on intermediate cascading frames must be avoided; all parity assertions must await `onCascadeSettled`.
2. **Turn Duration in Tests**: In production, turns are 20 seconds. In tests, waiting 20s for Scenario D is necessary once to verify authoritative timeout behavior, but Scenarios A, B, C, E, and F should execute moves promptly ($< 3$s) to keep total suite execution under 45 seconds.
3. **Audio Autoplay Policy**: Headless Chromium restricts Web Audio until user interaction. The client architecture handles this cleanly via `audio.unlock()` on first button click, but headless tests should run with `--autoplay-policy=no-user-gesture-required` to prevent audio context warnings.

---

## 6. Conclusion
The 6-scenario matrix (Scenarios A through F) provides complete, exhaustive coverage of the multi-client multiplayer lifecycle:
- Handles 2 to 4 concurrent browser contexts.
- Validates both DOM element states and the programmatic `window.__MATCH_POP__` testing API.
- Implements strict invariant assertions (INV-1 through INV-6) guaranteeing zero board desync across moves, cascades, timeouts, and reconnections.
- Ready for immediate implementation in `tests/e2e/multiplayer_sync.spec.ts` alongside Explorer 1's runner harness and Explorer 3's invariant hashing contracts.

---

## 7. Verification Method
1. **Unit Test Baseline**: Run existing unit tests to confirm server and room contracts remain healthy:
   ```pwsh
   npm test
   ```
2. **E2E Test Execution (Milestone M4 Implementer)**:
   - Configure `@playwright/test` using Explorer 1's recommendation.
   - Run the full multi-client suite:
     ```pwsh
     npx playwright test tests/e2e/multiplayer_sync.spec.ts
     ```
   - Invalidation condition: Any test failure where `hashP0 !== hashP1` (INV-1 failure), active slot desync (INV-2/INV-5), or rehydration mismatch (INV-4).
