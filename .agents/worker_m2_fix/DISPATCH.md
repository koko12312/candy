## 2026-09-17T11:06:17Z

Remediate the 6 specific defects identified by Reviewer M2 in `src/server/GameSession.ts` and `src/server/SocketServer.ts`:

1. Fix 2-Player Disconnect Grace Period:
   - In `GameSession.ts`, do NOT immediately trigger `triggerGameOver()` when a player disconnects in a 2-player match.
   - The 45-second timer in `Room.ts` must be allowed to run.
   - `triggerGameOver()` should only be called if:
     - All players are disconnected (`active.length === 0`), OR
     - A player explicitly forfeits/leaves (`room:leave`), OR
     - The 45-second timer expires in `Room.ts` leaving only 1 player.

2. Fix Active Player Disconnect Handling:
   - Track active player by `activePlayerId: string` (and `activeSlot: number`).
   - When a player drops, check if `playerId === this.activePlayerId`.
   - If yes, advance the turn to the next connected player in slot order immediately and emit `game:turn_change`. Do not let dead code or empty array checks stall turn passing.

3. Stabilize Turn Rotation:
   - Replace dynamic array indexing `currentTurnIndex % active.length` with slot-based rotation among connected players:
     Find the next connected player in cyclic slot order (`0 -> 1 -> 2 -> 3 -> 0`), update `activePlayerId`, and increment round when wrapping.

4. Authentic Animation Settling Delay:
   - When a valid move with cascades resolves in `handleMove`, calculate cascade animation delay based on cascade steps (e.g. `const animDelay = Math.min(3000, cascadeSteps * 400)`).
   - Emit `game:move_result` immediately.
   - Delay `this.advanceTurn()` and `this.emitTurnChange(nextP)` using `setTimeout(..., animDelay)` so the next player's turn timer does NOT count down while the cascade animation is playing on all clients.
   - Keep `isEvaluatingMove = true` during this animation window.

5. Protect Move Mutex with `try ... finally`:
   - In `handleMove`: wrap the move evaluation in `try ... finally` to guarantee `isEvaluatingMove` is never stuck true if an exception occurs.

6. Emit Socket Feedback on Rejected Moves:
   - When `handleMove` rejects a move due to `NOT_YOUR_TURN`, `GAME_NOT_ACTIVE`, or `EVALUATING`, emit `game:move_result` with `{ valid: false, reason }` back to the requesting socket so the client does not hang.

7. Update Tests:
   - In `tests/unit/server_room.test.ts`, add unit and socket tests verifying:
     - 2-player in-game disconnect: game remains `IN_GAME`, 45s grace period timer runs, player reconnects with `sessionToken` without game abort.
     - Active player disconnect mid-turn: turn smoothly passes to the next player with `game:turn_change`.
     - Cascade animation delay: timer does not advance until cascade settling delay completes.
8. Run tests (`npm test`) and typecheck (`npx tsc --noEmit`) to verify 100% pass.
