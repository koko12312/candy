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
- **Swedish Fish Candy, Falling Ingredients & Multiplayer Move Balancing**:
  - Implemented 2x2 Swedish Fish Candy formation in `MatchDetector.ts` and `SpecialCandyHandler.ts`. Swedish Fish swim with an animated curved trajectory and bubble trail to target high-priority tiles or candies under falling ingredients.
  - Implemented authentic Candy Crush Swedish Fish special combinations (Fish + Fish spawns 3 swimming fish, Fish + Striped creates a swimming striped rocket, Fish + Wrapped creates a swimming detonator, Fish + Color Bomb spawns 3 fish of the matching color).
  - Implemented Falling Ingredients (Cherries and Chestnuts) spawning in refills on Level 2+, dropping via gravity, and collecting at the bottom row with collection counter tracking (`ingredientsCollected` / `ingredientsTarget`).
  - Balanced multiplayer move count in `GameSession.ts` by counting every individual player move toward the shared move pool (`this.round++`), preventing multiple players from multiplying moves.
  - Added Swedish Fish, Cherry, and Chestnut procedural vector sprites to `TextureSynthesizer.ts`, animated fish swimming in `CanvasRenderer.ts`, and updated HUD in `HUD.ts` and `index.html` with the ingredient goal indicator (`🍒 collected/target`).
  - Built production bundle v1.0.15 and verified all 121 unit tests pass.

- **Vertical Animation Smoothness, True Easing Math & Rematch/Ingredient Balancing**:
  - **Fixed Compounding Lerp & Restored Silky Vertical Swapping**: Added `startX` and `startY` to `TileVisual` in `CanvasRenderer.ts` and updated `update(dt)` to use absolute start-to-target eased interpolation (`visual.y = visual.startY + (visual.targetY - visual.startY) * ease`) instead of compounding `(targetY - y) * ease`. Both candies in vertical swaps now slide smoothly past each other identically to horizontal swaps.
  - **Smooth Pops & Cascading Drops**: In `MATCH_FOUND`, shatter particle explosion coordinates are computed from the real-time canvas pixel position of the matched candy (`visual.x + cellSize / 2`, `visual.y + cellSize / 2`), and gravity drops and spawns smoothly glide and bounce into position with the full duration rather than snapping in 2 frames.
  - **Indestructible Ingredients & Rematch Clean Reset**: Cherries and chestnuts remain protected against special perks and combos, collection is active on even levels only (up to 5 max), level progression targets recalculate relative to current score, and match rematches reset to a clean 10 moves per player.
  - **Rule Update**: Removed pre-execution approval rule from global settings as directed.

- **Indestructible Ingredients & Progression Score Capping Fixes**:
  - **Indestructible Collectibles (Perks & Specials)**: `SpecialCandyHandler.ts` now strictly filters out `CandyType.INGREDIENT_CHERRY` and `CandyType.INGREDIENT_CHESTNUT` in `isSpecialCombo`, `addCoord`, and `markCoord`, and in all single and combo special detonation loops (`STRIPED_HORIZONTAL`, `STRIPED_VERTICAL`, `WRAPPED`, `COLOR_BOMB`, and `FISH`). Safeguarded `Match3Engine.ts` and `GravityCascade.ts` board nullification to never clear ingredient cells. Updated `CanvasRenderer.ts` so `cherry` and `chestnut` visual tiles are never shattered or removed during `SPECIAL_DETONATE` or `MATCH_FOUND`.
  - **Progression Score Cap When Full**: In `GameSession.ts`, when `ingredientsTarget > 0` and `ingredientsCollected < ingredientsTarget`, moves cannot advance `totalScore` beyond `this.targetScore`. The score freezes at full and ceases accumulating extra points while waiting for remaining collectibles. When all collectibles are collected, the new level's target score is calculated from the capped score, preventing level skipping. In `HUD.ts`, `scoreTargetText` is clamped to `targetScore` while waiting on collectibles.
- **Capacitor Over-The-Air (OTA) Live URL**:
  - Configured `capacitor.config.json` with `"server": { "url": "https://match-pop-multiplayer.onrender.com" }` and ran `npx cap sync android`.
  - The app now loads the live cloud code directly over-the-air, eliminating the need to reinstall APKs on every code change.

## Global Rules & Directives
- **Rule 5 (Mandatory Real-Time Memory Updating)**:
  - Continuously update memory.md as the final action of every finished step.
- **Rule 6 (Strict Edit Scope & Non-Destructive Changes)**:
  - Fix and edit strictly and exactly what LO specifies.
  - Never modify, redesign, refactor, remove, or revert unrelated features, UI elements, or functioning code.
  - Always protect and preserve what is already working.
