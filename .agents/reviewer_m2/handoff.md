# Milestone M2 Review & Adversarial Challenge Report: Authoritative Server & Room Sync

## Review Summary

**Verdict**: **REQUEST_CHANGES**
**Integrity & Reliability Findings**: 4 Critical, 1 Major, 1 Minor.

---

## 1. Observation

### Verification of Test Baseline
- Executed `npm test` from root `c:/Users/dsagh/OneDrive/Desktop/html/candy`:
  - Output: 5 test files passed, 94/94 tests passed (0 failed).
- Executed `npx tsc --noEmit` from root:
  - Output: Exited with code 0, 0 TypeScript compilation errors.

### Codebase Inspection Findings
1. **Immediate Game Over on Transient Disconnect in 2-Player Games (Bypassing 45s Grace Period)**:
   - File: `src/server/GameSession.ts`, lines 321-332:
     ```ts
     public handlePlayerDropped(playerId: string): void {
       const active = this.getActivePlayers();
       if (active.length === 0) {
         this.triggerGameOver();
         return;
       }

       if (active.length === 1 && this.room.players.length >= 2) {
         // If only 1 player remains in multiplayer, declare them winner
         this.triggerGameOver();
         return;
       }
     ```
   - In `src/server/SocketServer.ts`, lines 242-254:
     ```ts
     socket.on('disconnect', () => {
       const found = this.roomManager.findRoomBySocketId(socket.id);
       if (!found) return;

       const { room, playerId } = found;
       room.handleDisconnect(socket.id);

       const session = this.gameSessions.get(room.roomCode);
       if (session && room.status === 'IN_GAME') {
         session.handlePlayerDropped(playerId);
       }
       ...
     ```
   - In `src/server/Room.ts`, lines 183-187:
     ```ts
     public endGame(): void {
       this.status = 'GAME_OVER';
       this.clearAllDisconnectTimers();
       this.notifyStateChanged();
     }
     ```
   - When a player in a 2-player match experiences a momentary network drop or tab reload, `handlePlayerDropped` is called immediately. Because `active.length === 1 && this.room.players.length >= 2` evaluates to `true`, `triggerGameOver()` is executed immediately, setting the room status to `GAME_OVER` and purging `clearAllDisconnectTimers()`. The 45-second reconnect grace period is completely terminated on the spot.

2. **Dead Code & Broken Active Turn Passing in `handlePlayerDropped`**:
   - File: `src/server/GameSession.ts`, lines 334-343:
     ```ts
     const currentP = this.getCurrentPlayer();
     if (currentP && currentP.playerId === playerId) {
       // If dropped player was active, pass turn immediately
       this.advanceTurn();
       const nextP = this.getCurrentPlayer();
       if (nextP && this.room.status === 'IN_GAME') {
         this.emitTurnChange(nextP);
       }
     }
     ```
   - But `currentP = this.getCurrentPlayer()` selects only from `this.getActivePlayers() = this.room.players.filter(p => p.isConnected)`.
   - Because `room.handleDisconnect(socket.id)` has already set `player.isConnected = false` before `session.handlePlayerDropped(playerId)` is invoked, `getActivePlayers()` does not contain `playerId`.
   - Therefore, `currentP.playerId === playerId` is mathematically guaranteed to be **`false`**. This block is dead code and can never execute. When the active player drops, their turn is NOT passed; instead, the timer continues running until timeout, at which point the next innocent player is penalized with a timeout increment.

3. **Turn Desynchronization via Dynamic Array Indexing**:
   - File: `src/server/GameSession.ts`, lines 34, 56-68:
     ```ts
     public currentTurnIndex = 0; // Index into active connected players list

     public getActivePlayers(): RoomPlayer[] {
       return this.room.players.filter((p) => p.isConnected);
     }

     public getCurrentPlayer(): RoomPlayer | null {
       const active = this.getActivePlayers();
       if (active.length === 0) return null;
       return active[this.currentTurnIndex % active.length];
     }
     ```
   - `currentTurnIndex` is tracked as an integer index into `getActivePlayers()`. Whenever any player disconnects or reconnects, the order and size of `getActivePlayers()` shifts dynamically.
   - Example: In a 3-player match `[P1, P2, P3]`, if it is P2's turn (`currentTurnIndex = 1`), and P1 disconnects, `active` becomes `[P2, P3]`. `active[1 % 2]` is now `P3`. P2's active turn is immediately stolen and reassigned to P3 without any turn change notification. When P2 tries to move, the move is rejected with `NOT_YOUR_TURN`. When P1 reconnects, the index shifts back.

4. **Integrity / Facade: Timer Pause During Animation Execution**:
   - File: `src/server/GameSession.ts`, lines 201-285:
     ```ts
     this.isEvaluatingMove = true;
     this.pauseTimer();

     // Execute move via Match3Engine
     const resolution = this.engine.resolveMove(this.board, { playerId, from, to }, this.prng);
     ...
     this.callbacks.onMoveResult(movePayload);
     ...
     // Advance turn to next player
     this.advanceTurn();
     this.isEvaluatingMove = false;

     const nextP = this.getCurrentPlayer();
     if (nextP && this.room.status === 'IN_GAME') {
       this.emitTurnChange(nextP);
     }
     ```
   - `this.pauseTimer()` clears the timer right before synchronous `resolveMove` (~0.1ms). Then in the exact same synchronous execution stack, `this.emitTurnChange(nextP)` calls `this.startTurnCountdown()`.
   - The timer is paused for 0ms. There is zero animation pause or cascade settling delay. Both `game:move_result` and `game:turn_change` are emitted simultaneously. While clients are animating falling tiles and explosions (1-3 seconds), the server has already started the next player's 20s countdown.

5. **Mutex Locking Deadlock Risk**:
   - File: `src/server/GameSession.ts`, lines 200-278:
     - `this.isEvaluatingMove = true;` is NOT enclosed in a `try ... finally` block.
     - If `Match3Engine.resolveMove` throws an unhandled runtime error, `isEvaluatingMove` remains permanently `true`. All subsequent moves are permanently rejected with `reason: 'EVALUATING'`.

6. **Silent Rejection on Out-of-Turn / Evaluating Moves**:
   - File: `src/server/GameSession.ts`, lines 154-198:
     - When `handleMove` returns early for `GAME_NOT_ACTIVE`, `NOT_YOUR_TURN`, or `EVALUATING`, it does not invoke `this.callbacks.onMoveResult`.
     - In `src/server/SocketServer.ts`, line 184:
       `session.handleMove(player.playerId, payload.from, payload.to);` ignores the return value entirely.
     - The client socket receives zero feedback or error event over the socket.

---

## 2. Logic Chain

1. **R2 Requirement Specification**:
   - "Shared Board Multiplayer & Room System (1 to 4 Players): Server backend using Node.js with WebSockets / Socket.io for authoritative game state and real-time synchronization... 45s disconnect grace period, sessionToken reconnection, and state synchronization without board corruption... turn handoff immediately after cascades settle... countdown turn timer (20s) with auto-pass on timeout."
2. **Evaluation of 2-Player Disconnect Flow**:
   - Step A: Player 2 socket drops (e.g. WiFi hiccup or browser refresh).
   - Step B: Server socket `disconnect` fires.
   - Step C: `room.handleDisconnect` sets `Player2.isConnected = false` and schedules a 45s grace period timer.
   - Step D: `session.handlePlayerDropped(Player2.playerId)` is invoked synchronously.
   - Step E: `active.length` is 1 (only Player 1).
   - Step F: `active.length === 1 && this.room.players.length >= 2` evaluates to `true`.
   - Step G: `this.triggerGameOver()` is executed.
   - Step H: `this.room.endGame()` cancels all disconnect timers (`clearAllDisconnectTimers()`).
   - Step I: Match ends immediately. Player 2 cannot reconnect with `sessionToken`.
   - **Conclusion**: The 45-second disconnect grace period is completely non-functional in all 2-player games.
3. **Evaluation of Active Turn Drop Flow**:
   - Step A: Player 1 is active.
   - Step B: Player 1 socket drops.
   - Step C: `room.handleDisconnect` sets `Player 1.isConnected = false`.
   - Step D: `session.handlePlayerDropped(Player 1)` runs.
   - Step E: `currentP = this.getCurrentPlayer()` evaluates against `getActivePlayers()` which excludes Player 1.
   - Step F: `currentP.playerId === playerId` evaluates to `false`.
   - Step G: Turn is never advanced.
   - Step H: Timer expires after 20s. `handleTurnTimeout` attributes the timeout to Player 2 instead.
   - **Conclusion**: Active player drop logic is completely dead/broken code.
4. **Evaluation of Dynamic Turn Indexing**:
   - Indexing into a filtered collection `room.players.filter(p => p.isConnected)` using an integer counter `currentTurnIndex` creates unstable slot alignment whenever players transition between connected and disconnected states.
   - **Conclusion**: Turns must be tracked by an explicit, stable `activePlayerId: string` or stable slot (`activeSlot: number`).
5. **Evaluation of Cascade Animation Timing**:
   - Clearing a timer and re-starting it within the same synchronous tick is a no-op / facade.
   - While the move resolution is synchronous on the server, the clients require animation time to display swaps, matches, gravity drops, and refills before the next player can interact.
   - **Conclusion**: The server should incorporate an animation delay based on cascade step count (e.g., `cascadeSteps * 400ms` or a minimum settling delay) before starting the next turn timer countdown and emitting `game:turn_change`, or allow clients to signal settlement.

---

## 3. Caveats

- The Room Lobby creation, player joining (1-4 players), spectator relegation, room code generation, and host migration in `Room.ts` / `RoomManager.ts` are cleanly implemented and structurally sound.
- The unit test suite in `tests/unit/server_room.test.ts` passes 20/20 tests because all disconnect tests were executed exclusively in `LOBBY` status rather than during an active `IN_GAME` session.
- `Match3Engine` from M1 operates properly when invoked by the server.

---

## 4. Conclusion & Required Changes

**Verdict**: **REQUEST_CHANGES**

The following fixes must be implemented by the worker:

1. **Fix 2-Player Disconnect Grace Period**:
   - In `GameSession.ts` / `SocketServer.ts`: Do NOT trigger `triggerGameOver()` on a simple socket disconnect.
   - Socket disconnection should only mark the player disconnected, pause or pass their turn if active, and let the 45-second timer run.
   - `triggerGameOver()` for player abandonment should ONLY be triggered if:
     - All players are disconnected (`active.length === 0`), OR
     - A player explicitly sends `room:leave` (forfeit), OR
     - The 45-second grace period timer in `Room.ts` actually expires (`onPlayerForfeited`), leaving only 1 player remaining.

2. **Fix Active Player Disconnect Handling**:
   - Track active player by `activePlayerId: string` (or `activeSlot: number`), NOT by an array index into a filtered list.
   - When any player disconnects:
     - Check if `playerId === this.activePlayerId`.
     - If yes, smoothly advance `activePlayerId` to the next connected player in slot order and emit `game:turn_change`.
     - Do not rely on `this.getCurrentPlayer().playerId === playerId` after `isConnected` has already been set to `false`.

3. **Stabilize Turn Rotation**:
   - Replace `currentTurnIndex % active.length` with slot-based rotation:
     ```ts
     private advanceTurn(): void {
       const connected = this.room.players.filter(p => p.isConnected);
       if (connected.length === 0) return;
       const currentIdx = connected.findIndex(p => p.playerId === this.activePlayerId);
       const nextIdx = (currentIdx + 1) % connected.length;
       if (nextIdx === 0) this.round++;
       this.activePlayerId = connected[nextIdx].playerId;
     }
     ```

4. **Add Authentic Animation Pause / Settling Delay**:
   - When a valid move with cascades is resolved in `handleMove`:
     - Calculate cascade animation duration based on cascade steps (e.g., `const animDelay = Math.min(3000, cascadeSteps * 500)`).
     - Emit `game:move_result` immediately.
     - Delay `this.advanceTurn()` and `this.emitTurnChange(nextP)` using `setTimeout(..., animDelay)` so the next player's turn timer does NOT count down while the cascade animation is playing on all clients.
     - Keep `isEvaluatingMove = true` during this animation window to prevent out-of-order moves while the board is visually settling.

5. **Protect Move Mutex with `try ... finally`**:
   - In `handleMove`:
     ```ts
     this.isEvaluatingMove = true;
     try {
       // execute move & cascades
     } finally {
       this.isEvaluatingMove = false;
     }
     ```

6. **Emit Feedback for Rejected Moves**:
   - If a move is rejected due to `NOT_YOUR_TURN`, `GAME_NOT_ACTIVE`, or `EVALUATING`, emit `game:move_result` with `{ valid: false, reason }` back to the requesting socket so the client does not hang.

7. **Add Comprehensive Server Tests**:
   - Add tests specifically covering:
     - 2-player game in progress: Player 2 socket drops -> game remains `IN_GAME`, 45s grace period runs, Player 2 reconnects via `room:reconnect` with `sessionToken`, game resumes without desync.
     - Active player drops mid-turn -> turn immediately passes to next player with `game:turn_change`, no false timeout penalty.
     - Disconnect in 3-player game -> active turn remains with the correct player without index shift.

---

## 5. Verification Method

To independently verify after changes:
```bash
# 1. Typecheck the entire codebase
npx tsc --noEmit

# 2. Run the Vitest test suite
npm test
```
Both commands must pass with exit code 0, and new tests demonstrating mid-game disconnect/reconnect and cascade animation settling must pass.
