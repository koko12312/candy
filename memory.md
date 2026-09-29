# Match Pop Multiplayer - Project Memory

## Overview
Real-time 1-4 Player Multiplayer Candy Match-3 game with HTML5 Canvas client, Node.js + Socket.IO server backend, and Capacitor Android compilation via GitHub Actions.

## Recent Fixes & Milestones (v1.0.7)
1. **Bomb & Special Detonation Freeze / 1-Frame Snap Fix**:
   - `CanvasRenderer.ts` was reading `ev.clearedTiles` which was undefined (server sends `ev.affectedTiles`). This threw a runtime `TypeError` during detonations, immediately aborting the async event pipeline and snapping the board in 1 frame without showing drops or animations.
   - Fixed `CanvasRenderer.ts` to iterate `ev.affectedTiles || ev.clearedTiles` safely.
   - Added complete handlers for `GRAVITY_DROP` and `REFILL_SPAWN` with proper concurrent/staggered delays (360ms for explosions/lasers, 280ms for drops).

2. **Candy Crush Praise Text Restored**:
   - Hooked `CASCADE_STEP_COMPLETE` to spawn "SWEET!" (step 2), "TASTY!" (step 3), "DELICIOUS!" (step 4), and "DIVINE!" (step 5+).
   - Hooked special creations to trigger "NICE!", "WRAPPED!", and "TASTY!".
   - Imported authentic Google Font `Fredoka` in `index.html` for juicy arcade typography.

3. **Guest Timer Stuck at 0 Fix**:
   - Fixed clock skew issue in `HUD.ts`. Previously, `remainingMs = Math.max(0, turnExpiresAt - Date.now())`. If the guest phone's clock was ahead of the server, `remainingMs` evaluated to 0 instantly, stopping the timer immediately.
   - Refactored `HUD.ts` to reference `this.turnExpiresAt` locally against `Date.now() + remainingMs`. Added `serverTimestamp` sync to prevent freeze.

4. **Level Progression & Match / Round Display**:
   - Created dedicated `game-match-bar` in `index.html` and `HUD.ts` displaying:
     - Level badge ("LEVEL 1", "LEVEL 2", etc.)
     - Round counter ("ROUND 1/10", "ROUND 2/10", etc.)
     - Team score target progress bar ("0 / 2,000", with real-time gradient fill).
   - Synced `level`, `targetScore`, and `currentRound` through `Room.toDTO()` and `GameSession.ts` so all clients receive state updates on level up and turn change.
   - Updated Game Over screen to clearly report victory/defeat reasons (e.g. "Target Score Reached!" vs "Out of Rounds!").
