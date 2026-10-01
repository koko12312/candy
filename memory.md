# Project Memory: Match Pop Multiplayer

## Architecture & Conventions
- **Language/Stack**: TypeScript, HTML5 Dual Canvas (Retina scaled), Socket.io, Vite, Capacitor for Android APK packaging.
- **Client Architecture**:
  - `src/client/input/InputHandler.ts`: Mobile touch & pointer engine with dual PointerEvent + TouchEvent handling, `setPointerCapture`, window-level touch release tracking, and a 3-second failsafe gesture watchdog.
  - `src/client/render/CanvasRenderer.ts`: Dual-canvas system (bg canvas + interactive game canvas) with candy rendering, special candy detonations (striped laser sweeps, wrapped shockwaves, bomb detonations), particles, combo praise text, and CSS pixel coordinate mapping.
  - `src/client/ui/HUD.ts`: Top HUD with room code, mute/SFX controls, exit button, turn timer ring, turn banner, and match goal/level progress bar.
  - `src/client/main.ts`: Orchestrates client network events, audio playback, level progression, and turn lock states (`localPlayerId` & `activePlayerId` syncing).
- **Server Architecture**:
  - `src/server/Room.ts`: Room lifecycle management, player slot allocation (0..3), 45-second reconnect grace period, spectator support, rematch lobby resets.
  - `src/server/GameSession.ts`: Authoritative match-3 logic, round and level progression, special candy combinatorics, board gravity refills, cascade settlement.
- **Android APK Build**:
  - Permanent debug keystore located at `android/app/matchpop-debug.keystore` with fixed credentials (`matchpop123`, alias `matchpop`) configured in `android/app/build.gradle`.
  - Cached keystore in GitHub Actions (`.github/workflows/build-apk.yml`) to ensure every APK build is signed with the identical key and installs seamlessly over existing versions without package conflicts.

## Key Fixes & Milestones
- **Level Progression Overhaul & Turn Carry-Over**:
  - Implemented dynamic target score thresholding in `GameSession.ts` (`while (totalScore >= this.targetScore)`) to handle multi-level leaps smoothly during high-combo cascades.
  - Added leftover turns carry-over on level up (`room.settings.maxRounds = baseMaxRounds + leftoverRounds`), preserving every remaining move from the previous round so players don't lose leftover turns when beating a level early.
  - Updated client `handleLevelUp` and `handleTurnChange` in `main.ts` to sync `currentRound` and `maxRounds`, refreshing the HUD goal progress bar, triggering the level-up celebration overlay, and playing the fanfare.
  - Deployed the authoritative backend live to Render (`srv-damj9n942hec739b8cf0`), ensuring that the production server in the cloud is always synchronized with code changes. Every change affecting game logic is pushed and deployed to Render immediately.
- **Gameplay Balancing, Indestructible Ingredients & Multiplayer Latency Overhaul**:
  - **Full Rematch Clean Reset**: Fixed cross-game move pollution by ensuring `Room.resetToLobby()` resets `settings.maxRounds = 10` and `GameSession.start()` always derives starting moves cleanly as `10 * connectedPlayers.length`.
  - **Indestructible Ingredients**: Cherry and Chestnut tiles are completely protected in `SpecialCandyHandler.ts`, `Match3Engine.ts`, and `GravityCascade.ts`. Striped lasers, wrapped bombs, color bombs, and fish will never destroy or nullify ingredients; ingredients only clear when collected at row 8.
  - **Alternating Collection Feature (Max 5)**: Ingredients only appear on even levels (Level 2: 2 items, Level 4: 3 items, Level 6: 4 items, Level 8+: 5 items max). Odd levels (Level 1, 3, 5...) are pure match-and-score levels with zero ingredients spawning.
  - **Score Progress Bar Calibration**: Level up target score is computed relative to the current team score (`totalScore + (level * 2000) + 1000`), ensuring that the new level starts with a fresh empty progress bar even after high-scoring cascades.
  - **Multiplayer Responsiveness & Optimistic Swap**: Implemented instant client-side optimistic visual swapping in `main.ts` so the active player's screen immediately slides tiles under their fingers without waiting for network round-trip packets. Streamlined animation delays across `CanvasRenderer.ts` and `GameSession.ts` for snappy, simultaneous multiplayer pacing.
  - **Public GitHub Releases**: Configured automated GitHub Release publishing (`v1.0.20`) for direct 1-click APK download without requiring a GitHub account.
  - All 122 unit tests passing.

## Global Rules & Directives
- **Rule 5 (Mandatory Real-Time Memory Updating)**:
  - Continuously update memory.md as the final action of every finished step.
- **Rule 6 (Strict Edit Scope & Non-Destructive Changes)**:
  - Fix and edit strictly and exactly what LO specifies.
  - Never modify, redesign, refactor, remove, or revert unrelated features, UI elements, or functioning code.
  - Always protect and preserve what is already working.
