# Match Pop Multiplayer - Project Memory

## Overview
Real-time 1-4 Player Multiplayer Candy Match-3 game with HTML5 Canvas client, Node.js + Socket.IO server backend, and Capacitor Android compilation via GitHub Actions.

## Recent Milestones & Touch Overhaul (v1.0.8)
1. **Touch Overhaul & Elimination of Unpredictable Freezes**:
   - **Root Cause Uncovered**: In `main.ts`, `handleConnect()` had an unconditional `this.network.clearSession()` inside the reconnect catch block. When an old session timed out after 5s, it wiped the active `playerId` from memory and localStorage even while in an active game, permanently locking touch controls until app data was deleted.
   - **Fix Applied**: Removed the premature `clearSession()`. Player ID and session credentials persist across matches safely.
   - **New Universal Touch Engine (`InputHandler.ts`)**:
     - Dual-mode input: Fluid swipe gestures (12px threshold) + instantaneous two-tap adjacent swap.
     - Pointer capture with `setPointerCapture` and `releasePointerCapture` preventing Android touch slop drops.
     - Pure touch event fallback (`touchstart`, `touchmove`, `touchend`) with `{ passive: false }`.
     - Self-healing watchdog: Auto-unlocks any orphaned lock state after 4.5s.
     - Canvas isolation: `#bg-canvas` set to `pointer-events: none` to prevent touch event swallowing.

2. **Animation Pipeline & Visual Celebrations (v1.0.7)**:
   - Fixed `SPECIAL_DETONATE` reading `ev.affectedTiles` instead of undefined `ev.clearedTiles`.
   - Full animation pipeline for `GRAVITY_DROP` and `REFILL_SPAWN` with authentic delay.
   - Candy Crush praise words ("SWEET!", "TASTY!", "DELICIOUS!", "DIVINE!", "NICE!") with Google Font `Fredoka`.
   - Clock-skew immune turn timer on guest devices.
   - Match and round progress bar with team goal tracking.
