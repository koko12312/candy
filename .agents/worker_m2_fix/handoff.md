# Milestone M2 Remediation Handoff Report: Authoritative Server & Room Sync

## 1. Observation

### Root Causes & Verbatim Code Defect Remediations
1. **2-Player Disconnect Grace Period**:
   - *Previous state*: `src/server/GameSession.ts` lines 328-332 checked `if (active.length === 1 && this.room.players.length >= 2) this.triggerGameOver()`, which instantly aborted 2-player games on a transient socket drop, wiping out the 45-second reconnect grace period in `Room.ts`.
   - *Remediation*: Added `isForfeit = false` flag to `handlePlayerDropped(playerId: string, isForfeit = false)`. In `GameSession.ts`, game over is now only triggered if `active.length === 0` (all disconnected), or if `isForfeit && active.length <= 1 && this.room.players.length >= 2` (45s grace period timer in `Room.ts` expired or player explicitly executed `room:leave`). Transient drops in 2-player matches keep the game in `IN_GAME` state while the 45s timer runs.

2. **Active Player Disconnect Turn Passing**:
   - *Previous state*: `currentP = this.getCurrentPlayer()` checked `getActivePlayers()`, which already excluded the disconnected player (`isConnected = false`). Therefore `currentP.playerId === playerId` was dead code (`false`), and the turn never advanced, penalizing the next player with a false timeout.
   - *Remediation*: Active player is now tracked authoritatively by `activePlayerId: string` and `activeSlot: number`. `handlePlayerDropped` tests `if (playerId === this.activePlayerId)` directly. If true and no animation is running, it clears the turn timer, advances turn immediately via `this.advanceTurn()`, and emits `game:turn_change` for the next connected player with zero false timeouts.

3. **Stabilized Cyclic Slot-Based Turn Rotation**:
   - *Previous state*: `currentTurnIndex % active.length` relied on indexing into a dynamically fluctuating filtered list of connected players, causing turn reassignments and desyncs whenever players reconnected or dropped.
   - *Remediation*: Implemented slot-based cyclic rotation in `advanceTurn()`:
     ```ts
     const connected = this.getActivePlayers();
     if (connected.length === 0) return false;
     const higherSlotPlayers = connected.filter((p) => p.slot > this.activeSlot);
     let nextPlayer: RoomPlayer;
     let wrapped = false;
     if (higherSlotPlayers.length > 0) {
       nextPlayer = higherSlotPlayers[0];
     } else {
       nextPlayer = connected[0];
       wrapped = true;
       this.round++;
     }
     this.activePlayerId = nextPlayer.playerId;
     this.activeSlot = nextPlayer.slot;
     return wrapped;
     ```

4. **Authentic Cascade Animation Settling Delay**:
   - *Previous state*: Move evaluation called `pauseTimer()` and `emitTurnChange()` in the exact same synchronous execution tick (0ms pause), causing the next turn countdown to run while clients were animating tile drops.
   - *Remediation*: Computed cascade animation settling delay `const animDelay = Math.min(3000, cascadeSteps * 400)`. `game:move_result` is emitted immediately to all clients. `this.advanceTurn()` and `this.emitTurnChange(nextP)` are delayed by `animDelay` via `setTimeout`, during which `isEvaluatingMove = true` is held to prevent out-of-order moves while board settles.

5. **Move Mutex Protected by `try ... finally`**:
   - *Previous state*: `isEvaluatingMove = true` was unshielded; any engine runtime exception resulted in a permanent mutex deadlock.
   - *Remediation*: Wrapped move resolution in `try ... finally`. If an error occurs or swap is invalid, `isEvaluatingMove` is guaranteed to reset to `false`. When async animation settling is scheduled, `animationTimer` completion sets `isEvaluatingMove = false`.

6. **Direct Socket Feedback for Rejected Moves**:
   - *Previous state*: Moves rejected for `NOT_YOUR_TURN`, `GAME_NOT_ACTIVE`, or `EVALUATING` returned silently without emitting any event back to the proposing socket.
   - *Remediation*: In `src/server/SocketServer.ts`, when `handleMove` returns an invalid move with `NOT_YOUR_TURN`, `GAME_NOT_ACTIVE`, or `EVALUATING`, `socket.emit('game:move_result', result)` is dispatched specifically to the requesting socket.

7. **Verification Output**:
   - `npx tsc --noEmit`: Exited with code 0 (0 errors).
   - `npm test`: 5 test files passed, 101/101 tests passed (100% pass, 0 failed).

---

## 2. Logic Chain

1. **2-Player Disconnect Flow**:
   - Step 1: In a 2-player match, Player 2's socket drops.
   - Step 2: `socket.on('disconnect')` invokes `room.handleDisconnect(socket.id)` and `session.handlePlayerDropped(playerId, false)`.
   - Step 3: `Room.ts` sets `player.isConnected = false` and arms the 45-second timer `setTimeout(..., 45000)`.
   - Step 4: `session.handlePlayerDropped(playerId, false)` checks `isForfeit`. Because `isForfeit` is false, `triggerGameOver()` is NOT called.
   - Step 5: If Player 2 reconnects within 45s via `room:reconnect` with their `sessionToken`, `room.reconnectPlayer()` restores `isConnected = true`, cancels the 45s timer, and returns `syncState` in `IN_GAME` status.
   - Step 6: If 45s expires without reconnection, `Room.handleGracePeriodExpired` invokes `room.onPlayerForfeited(playerId)`, which invokes `session.handlePlayerDropped(playerId, true)`. Now `isForfeit` is true and `active.length <= 1`, triggering `this.triggerGameOver()` and declaring the remaining active player the winner.

2. **Active Player Mid-Turn Drop Flow**:
   - Step 1: Active player drops while their countdown timer is ticking.
   - Step 2: `session.handlePlayerDropped` checks `playerId === this.activePlayerId`.
   - Step 3: Because `playerId` matches `activePlayerId` and no cascade animation is pending, the current turn timer is cleared and `this.advanceTurn()` executes.
   - Step 4: `advanceTurn()` finds the next connected player in cyclic slot order and updates `activePlayerId` and `activeSlot`.
   - Step 5: `this.emitTurnChange(nextP)` emits `game:turn_change` and starts the 20s countdown for the new player. No timeout penalty is applied to the successor.

3. **Cascade Animation Delay Flow**:
   - Step 1: Active player proposes valid swap creating cascades.
   - Step 2: `resolution` generates `CASCADE_STEP_COMPLETE` events (e.g. 2 cascade steps).
   - Step 3: `animDelay` calculated as `Math.min(3000, 2 * 400) = 800ms`.
   - Step 4: `game:move_result` emitted immediately to all clients.
   - Step 5: `isEvaluatingMove` remains `true` for 800ms. Any move attempts in this window receive `{ valid: false, reason: 'EVALUATING' }`.
   - Step 6: At 800ms, `animationTimer` fires, `isEvaluatingMove = false`, turn advances, and `game:turn_change` begins countdown for next player.

---

## 3. Caveats

- In headless unit test environments using Vitest fake timers (`vi.useFakeTimers()`), tests asserting turn rotation after a valid move must advance timers past the cascade settling delay (e.g. `vi.advanceTimersByTime(3000)`).
- If all players disconnect simultaneously (`active.length === 0`), `GameSession.handlePlayerDropped` cleanly ends the match immediately to avoid orphaned session processes.

---

## 4. Conclusion

All 6 defects identified by Reviewer M2 have been remediated cleanly:
- 2-player disconnect grace period is preserved.
- Active player disconnect turn passing is robust and immediate.
- Turn rotation is slot-based and invariant under disconnects.
- Authentic cascade animation settling delay is enforced.
- Concurrency mutex is protected by `try ... finally`.
- Rejected move socket feedback is emitted.
- All 101 tests pass with zero failures and zero TypeScript compilation errors.

---

## 5. Verification Method

To independently verify these changes:

```bash
# 1. Typecheck the entire codebase
npx tsc --noEmit

# 2. Run the server and room unit test suite (27 tests)
npx vitest run tests/unit/server_room.test.ts

# 3. Run the complete test suite across all modules (101 tests)
npm test
```

Expected result: 101/101 tests passing, exit code 0, 0 compilation errors.
