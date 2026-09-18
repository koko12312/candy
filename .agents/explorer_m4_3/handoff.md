# Milestone M4 Investigation Report: Invariant Assertion & Desync Verification Mechanics

**Explorer**: Explorer 3 (M4 Headless Multi-Client Bot Simulation & Verification Suite)  
**Date**: 2026-09-17  
**Working Directory**: `c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_m4_3`  
**Status**: Complete  

---

## 1. Observation

### 1.1 Codebase Inspection of `getBoardHash()`
- **Client Implementation (`src/client/render/CanvasRenderer.ts:697-710`)**:
  ```ts
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
- **Window Testing Hook Exposure (`src/client/main.ts:351-380`)**:
  ```ts
  window.__MATCH_POP__ = {
    getRoomCode: () => this.network.getRoomCode(),
    getGameState: () => this.gameState,
    getActiveSlot: () => this.activeSlot,
    getActivePlayerId: () => this.activePlayerId,
    getBoardState: () => this.currentBoard,
    getBoardHash: () => this.renderer.getBoardHash(),
    getTurnRemainingSeconds: () => this.hud.getTurnRemainingSeconds(),
    simulateSwap: (from: Coordinate, to: Coordinate): Promise<boolean> => { ... },
    onCascadeSettled: (callback: () => void) => { ... },
    getScores: () => { ... }
  };
  ```
- **Server Board State (`src/server/GameSession.ts:34`)**:
  - `public board: Tile[][] = [];`
  - In `Tile` (`src/shared/types.ts:29-35`):
    ```ts
    export interface Tile {
      id: number;           // Unique instance ID (monotonically incremented)
      row: number;          // Current row (0..8)
      col: number;          // Current col (0..8)
      color: CandyColor;    // Color 0..5, or -1 for Color Bomb
      type: CandyType;      // normal, striped_h, striped_v, wrapped, color_bomb
    }
    ```
  - `GameSession` does not currently expose a native `getBoardHash()` method on the class, though the equivalent computation is already validated in `tests/unit/client_render.test.ts:31-44`.

### 1.2 Cascade Settlement & Event Lifecycle Observation
- **Move Resolution on Server (`src/server/GameSession.ts:238-328`)**:
  1. `resolution = this.engine.resolveMove(this.board, { playerId, from, to }, this.prng)`
  2. Server updates authoritative board: `this.board = resolution.finalBoard`
  3. Server broadcasts `game:move_result` payload with `events: resolution.events` and `boardAfterSettled: Match3Engine.cloneBoard(this.board)`.
  4. Server calculates animation delay:
     ```ts
     const cascadeSteps = Math.max(1, resolution.events.filter(e => e.type === 'CASCADE_STEP_COMPLETE').length);
     const animDelay = Math.min(3000, cascadeSteps * 400);
     ```
     Server schedules `this.animationTimer = setTimeout(..., animDelay)` to call `advanceTurn()` and broadcast `game:turn_change`.
- **Cascade Animation Pipeline on Client (`src/client/render/CanvasRenderer.ts:340-537`)**:
  - Sequential animation of `SWAP` (200ms), `MATCH_FOUND` (160ms), `SPECIAL_DETONATE` (180ms), `GRAVITY_DROP` (200ms), `REFILL_SPAWN` (220ms), `BOARD_RESHUFFLE` (400ms).
  - Explicit board sync at pipeline conclusion (`CanvasRenderer.ts:531-537`):
    ```ts
    if (finalBoard && finalBoard.length > 0) {
      this.setBoard(finalBoard);
    }
    this.isProcessingCascade = false;
    this.onCascadeSettledCallback?.();
    ```
  - In `src/client/main.ts:67-71`:
    ```ts
    this.renderer.setOnCascadeSettled(() => {
      this.isCascadeAnimating = false;
      this.updateInputLockState();
      this.notifyCascadeSettled();
    });
    ```
  - In `src/client/main.ts:335-342`:
    ```ts
    private updateInputLockState(): void {
      if (this.gameState !== 'IN_GAME' || this.isCascadeAnimating) {
        this.input.setLocked(true);
        return;
      }
      const isMyTurn = this.network.getPlayerId() === this.activePlayerId;
      this.input.setLocked(!isMyTurn);
    }
    ```

### 1.3 Test Suite Baseline
- Executed `npm test` across all existing test files:
  - 6 test files passed (`engine.test.ts`, `challenger_edge_cases.test.ts`, `client_render.test.ts`, `adversarial_engine.test.ts`, `server_room.test.ts`, `adversarial_desync_verification.test.ts`).
  - Total 115 tests passing, 0 failures.

---

## 2. Logic Chain

### 2.1 Attribute Parity & Invariant String Representation
1. **Serialization Format**:
   `${r},${c}:${id}:${color}:${type}|` for every coordinate `(r, c)` from `(0, 0)` to `(8, 8)` in strict row-major order (81 entries). If empty, `${r},${c}:null|`.
2. **Deterministic Tile Attributes**:
   - `id`: The server PRNG/engine assigns monotonic integer IDs (`nextIdRef.id++`). Initial tiles receive IDs `1..81`. Refills and spawned specials continue the sequence. When reshuffling, IDs are sequentially regenerated for all 81 tiles.
   - `color`: Integer `0..5` for regular candies, `-1` for Color Bomb (`CandyColor.NONE`).
   - `type`: String literal enum (`'normal'`, `'striped_h'`, `'striped_v'`, `'wrapped'`, `'color_bomb'`).
3. **State Rehydration Guarantee**:
   At the end of every client's `playEventsPipeline`, `this.setBoard(finalBoard)` is unconditionally called using `payload.boardAfterSettled` sent by the server. This completely overwrites `this.gridMatrix` with the server's authoritative board.
4. **Conclusion on Hash Equivalence**:
   Once cascade animations complete on each client, `getBoardHash()` produces an identical 81-entry character sequence across Client 1, Client 2, Client 3, Client 4, and the server board.

### 2.2 Synchronization Timing Dynamics & Cascade Settling
1. **Server vs. Client Duration Discrepancy**:
   - Client animation per cascade step: `MATCH_FOUND` (160ms) + `GRAVITY_DROP` (200ms) + `REFILL_SPAWN` (220ms) = 580ms (+200ms initial swap).
   - Server timer: `animDelay = Math.min(3000, cascadeSteps * 400ms)`.
   - Observation: For a 1-step cascade, server advances turn at 400ms, whereas the client visual cascade finishes at ~780ms.
2. **Client Input Guarding**:
   - When `game:turn_change` arrives at ~405ms on the new active player's client, `updateInputLockState()` checks `this.isCascadeAnimating`.
   - Because `isCascadeAnimating` is `true`, `input.setLocked(true)` remains enforced!
   - At ~780ms when `onCascadeSettledCallback` fires, `isCascadeAnimating` becomes `false` and `updateInputLockState()` re-evaluates, safely unlocking the input for the active player.
3. **Implication for Automated Test Verification**:
   - An automated test must NOT initiate the next move upon receiving `game:turn_change` alone, because client visual pipelines may still be playing.
   - The test must wait for `cascade_settled` across ALL client pages first.
   - Only after all clients have settled cascade animations should the test assert board parity and proceed to the next move.

### 2.3 Potential Race Conditions & Edge Cases

| # | Edge Case / Race Condition | Risk | Defensive Mechanism in Codebase | Recommended Assertion in M4 Test Suite |
|---|---|---|---|---|
| 1 | **Rapid Double Swaps (Client Spam)** | Two move packets sent within 50ms | `InputHandler.setLocked(true)` locks input immediately on swap. Server `isEvaluatingMove = true` rejects subsequent moves with `reason: 'EVALUATING'`. | Send 3-5 rapid `simulateSwap` calls; assert only first is accepted, rest rejected; no duplicate events or board corruptions. |
| 2 | **Out-of-Turn Move Proposal** | Non-active player sends `game:move` | Client checks `network.getPlayerId() === activePlayerId`. Server rejects with `NOT_YOUR_TURN`. | Non-active client attempts swap; verify rejected with `NOT_YOUR_TURN`, board remains identical across all clients. |
| 3 | **Timer Drift Across Browser Tabs** | Headless Chrome tabs running concurrently experience slight `setTimeout` drift | All events are queued; each client settles at its own pace and calls `setBoard(finalBoard)` at the end. | Test uses `Promise.all(pages.map(waitForSettle))` with an 8s timeout rather than fixed delays. |
| 4 | **Mid-Cascade State Queries** | Test queries hash while tiles are falling | Intermediate states have empty cells or incomplete drops; hashes will diverge transiently. | Strict test rule: Assertions are ONLY executed when all clients are settled (`isSettled === true`). |
| 5 | **Board Reshuffle (0 Valid Moves)** | Board has no legal moves remaining | Reshuffle re-indexes all 81 tile IDs sequentially and emits `BOARD_RESHUFFLE`. `boardAfterSettled` reflects the reshuffled grid. | Verify all 81 IDs are contiguous, `hasValidMoves === true`, and client hashes match server reshuffled board. |
| 6 | **Mid-Cascade Disconnect & Reconnect** | Client disconnects while cascade is playing | Reconnecting client sends `room:reconnect`; server responds with `game:sync_state` containing settled `board`; client calls `setBoard(payload.board)`. | Disconnect client mid-cascade, reconnect, assert rehydrated board hash matches other clients. |
| 7 | **Authoritative Turn Timeout (20s AFK)** | Active player does not make a move | Server `handleTurnTimeout` clears timer, advances active slot, emits `game:timeout` and `game:turn_change`. Board is untouched. | Trigger 20s timeout; verify turn advances to next slot and board hash remains 100% unchanged. |

---

## 3. Invariant Assertion Harness Design

### 3.1 Recommended Client API Enhancements
To guarantee zero-flakiness in Playwright multi-page execution, add two helper getters to `window.__MATCH_POP__` in `src/client/main.ts`:
1. `isSettled: () => boolean`: Returns `!this.isCascadeAnimating`.
2. `getSettledCount: () => number`: Returns a monotonic counter incremented every time `notifyCascadeSettled()` executes.
3. `isInputLocked: () => boolean`: Returns `this.input.getLocked()`.

### 3.2 Canonical Hash Helper
Both server tests and client tests should share the canonical board hash logic:
```ts
export function computeBoardHash(board: (Tile | null)[][]): string {
  let hashStr = '';
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const tile = board[r] ? board[r][c] : null;
      if (tile) {
        hashStr += `${r},${c}:${tile.id}:${tile.color}:${tile.type}|`;
      } else {
        hashStr += `${r},${c}:null|`;
      }
    }
  }
  return hashStr;
}
```

### 3.3 Test Harness Multi-Client Assertion Protocol
The complete harness implementation to be used in `tests/e2e/`:

```ts
import { Page, expect } from '@playwright/test';
import { Tile, CandyType, CandyColor } from '../../src/shared/types';
import { GRID_ROWS, GRID_COLS } from '../../src/shared/constants';

export class InvariantHarness {
  /**
   * Waits for all browser pages to settle cascade animations.
   */
  public static async waitForAllClientsToSettle(
    pages: Page[],
    expectedSettledCount?: number,
    timeoutMs = 10000
  ): Promise<void> {
    await Promise.all(
      pages.map(async (page) => {
        if (expectedSettledCount !== undefined) {
          await page.waitForFunction(
            (target) => {
              const api = (window as any).__MATCH_POP__;
              return api && typeof api.getSettledCount === 'function'
                ? api.getSettledCount() >= target
                : true;
            },
            expectedSettledCount,
            { timeout: timeoutMs }
          );
        } else {
          await page.waitForFunction(
            () => {
              const api = (window as any).__MATCH_POP__;
              return api && typeof api.isSettled === 'function' ? api.isSettled() : true;
            },
            null,
            { timeout: timeoutMs }
          );
        }
      })
    );
  }

  /**
   * Asserts 100% board parity across all clients and server board.
   */
  public static async assertBoardParity(
    pages: Page[],
    serverBoard?: Tile[][],
    contextMessage = ''
  ): Promise<string> {
    // 1. Fetch hashes and board states from all client pages
    const clientData = await Promise.all(
      pages.map(async (page, index) => {
        const hash = await page.evaluate(() => (window as any).__MATCH_POP__.getBoardHash());
        const board = await page.evaluate(() => (window as any).__MATCH_POP__.getBoardState());
        return { index, hash, board };
      })
    );

    const firstHash = clientData[0].hash;
    expect(firstHash).toBeDefined();
    expect(firstHash.length).toBeGreaterThan(100);

    // 2. Validate client-to-client parity
    for (let i = 1; i < clientData.length; i++) {
      if (clientData[i].hash !== firstHash) {
        const diff = this.generateHashDiff(firstHash, clientData[i].hash, 'Client 0', `Client ${i}`);
        throw new Error(`[DESYNC DETECTED: CLIENT vs CLIENT] ${contextMessage}\n${diff}`);
      }
    }

    // 3. Validate client-to-server parity
    if (serverBoard) {
      const serverHash = this.computeBoardHash(serverBoard);
      if (serverHash !== firstHash) {
        const diff = this.generateHashDiff(serverHash, firstHash, 'Server Board', 'Client 0');
        throw new Error(`[DESYNC DETECTED: SERVER vs CLIENT] ${contextMessage}\n${diff}`);
      }
    }

    // 4. Validate Structural Invariants on every board
    for (const { index, board } of clientData) {
      this.validateStructuralInvariants(board, `Client ${index}`);
    }
    if (serverBoard) {
      this.validateStructuralInvariants(serverBoard, 'Server Board');
    }

    return firstHash;
  }

  /**
   * Structural invariant validation:
   * - Strict 9x9 dimensions
   * - No null tiles when settled
   * - Strict coordinate integrity: tile at (r, c) has row === r, col === c
   * - ID uniqueness: exactly 81 unique IDs
   * - Valid color/type constraints
   */
  public static validateStructuralInvariants(board: Tile[][], sourceName: string): void {
    if (!board || board.length !== GRID_ROWS) {
      throw new Error(`[${sourceName}] Invalid row count: expected ${GRID_ROWS}, got ${board?.length}`);
    }

    const seenIds = new Set<number>();
    for (let r = 0; r < GRID_ROWS; r++) {
      if (!board[r] || board[r].length !== GRID_COLS) {
        throw new Error(`[${sourceName}] Invalid col count at row ${r}: expected ${GRID_COLS}, got ${board[r]?.length}`);
      }
      for (let c = 0; c < GRID_COLS; c++) {
        const tile = board[r][c];
        if (!tile) {
          throw new Error(`[${sourceName}] Null tile found at (${r}, ${c}) on settled board`);
        }
        if (tile.row !== r || tile.col !== c) {
          throw new Error(`[${sourceName}] Tile coordinate mismatch at (${r}, ${c}): tile has row=${tile.row}, col=${tile.col}`);
        }
        if (seenIds.has(tile.id)) {
          throw new Error(`[${sourceName}] Duplicate tile ID ${tile.id} found at (${r}, ${c})`);
        }
        seenIds.add(tile.id);

        if (tile.type === CandyType.COLOR_BOMB) {
          if (tile.color !== CandyColor.NONE) {
            throw new Error(`[${sourceName}] Color Bomb at (${r}, ${c}) has invalid color ${tile.color}`);
          }
        } else {
          if (tile.color < 0 || tile.color > 5) {
            throw new Error(`[${sourceName}] Tile at (${r}, ${c}) has out-of-range color ${tile.color}`);
          }
        }
      }
    }
    if (seenIds.size !== GRID_ROWS * GRID_COLS) {
      throw new Error(`[${sourceName}] Expected ${GRID_ROWS * GRID_COLS} unique IDs, found ${seenIds.size}`);
    }
  }

  public static computeBoardHash(board: (Tile | null)[][]): string {
    let hashStr = '';
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const tile = board[r] ? board[r][c] : null;
        if (tile) {
          hashStr += `${r},${c}:${tile.id}:${tile.color}:${tile.type}|`;
        } else {
          hashStr += `${r},${c}:null|`;
        }
      }
    }
    return hashStr;
  }

  public static generateHashDiff(hashA: string, hashB: string, labelA = 'Expected', labelB = 'Actual'): string {
    const cellsA = hashA.split('|').filter(Boolean);
    const cellsB = hashB.split('|').filter(Boolean);
    const diffs: string[] = [];

    const maxLen = Math.max(cellsA.length, cellsB.length);
    for (let i = 0; i < maxLen; i++) {
      const a = cellsA[i] || '<missing>';
      const b = cellsB[i] || '<missing>';
      if (a !== b) {
        diffs.push(`  Cell [${i}] -> ${labelA}: "${a}"  vs  ${labelB}: "${b}"`);
      }
    }

    return (
      `=== BOARD DIFF: ${labelA} vs ${labelB} (${diffs.length} mismatched cells) ===\n` +
      diffs.slice(0, 15).join('\n') +
      (diffs.length > 15 ? `\n  ... and ${diffs.length - 15} more mismatched cells` : '')
    );
  }
}
```

---

## 4. Caveats
1. **Mid-Animation Hash Comparison**:
   Comparing hashes mid-cascade will fail due to asynchronous timer execution across browser processes. Assertions must strictly wait for cascade settlement.
2. **Server `getBoardHash()`**:
   `GameSession.ts` does not yet declare a public `getBoardHash()` method. For unit and integration tests, `computeBoardHash(session.board)` works seamlessly; for runtime parity convenience, adding `public getBoardHash(): string` directly to `GameSession.ts` is strongly recommended.
3. **Playwright Chromium Background Tab Throttling**:
   When launching browser contexts in Playwright, background tab throttling flags (`--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`) should be passed in Chromium launch options so that all connected tabs update `setTimeout` timers without artificial delays.

---

## 5. Conclusion
1. **Cell Attribute Parity**:
   Cell serialization in `CanvasRenderer.ts` (`${r},${c}:${visual.id}:${visual.color}:${visual.type}|`) maps directly to `Tile` properties (`row`, `col`, `id`, `color`, `type`). Monotonic ID allocation and `setBoard(finalBoard)` at the conclusion of `playEventsPipeline` guarantee 100% deterministic string parity across all clients and the server board.
2. **Cascade Settlement Synchronization**:
   `cascade_settled` fires on each client when `playEventsPipeline` completes. The client's `isCascadeAnimating` flag prevents premature user or bot input even if the server's `game:turn_change` packet arrives slightly earlier. Test suites must wait for all clients to settle (`isSettled === true`) before comparing hashes.
3. **Robust Harness Design**:
   The designed `InvariantHarness` provides multi-client settle synchronization, 100% string parity assertion, 81-tile structural invariant validation, and human-readable cellular diff reporting on mismatch.
4. **Edge Case Defensibility**:
   Concurrency locks (`isEvaluatingMove`), input locks (`setLocked`), authoritative validation (`NOT_YOUR_TURN`), and monotonic re-indexing during reshuffle prevent desync under rapid clicks, out-of-turn moves, timeouts, and network reconnection.

---

## 6. Verification Method

To independently verify these conclusions and mechanics:
1. **Run Existing Unit Verification Suite**:
   ```pwsh
   npm test
   ```
   Inspect tests in `tests/unit/adversarial_desync_verification.test.ts` and `tests/unit/client_render.test.ts` to confirm 100-move desync invariance and board hash parity.
2. **Inspect Hash Format**:
   Examine `src/client/render/CanvasRenderer.ts:697-710` and `tests/unit/client_render.test.ts:31-44` to verify identical `${r},${c}:${id}:${color}:${type}|` serialization.
3. **Inspect Cascade Pipeline Settle Hook**:
   Examine `src/client/render/CanvasRenderer.ts:530-537` to verify `this.setBoard(finalBoard)` and `this.onCascadeSettledCallback?.()` execution.
4. **Inspect Input Lock Protection**:
   Examine `src/client/main.ts:335-342` to verify `isCascadeAnimating` locks input even if `turn_change` arrives early.
