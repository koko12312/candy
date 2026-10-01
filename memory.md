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
- **Permanent Keystore Persistence in CI/CD**:
  - Configured GitHub Actions workflow (`.github/workflows/build-apk.yml`) with `contents: write` permissions to generate and commit `android/app/matchpop-debug.keystore` permanently back to the repository on its first run.
  - Ensures every subsequent APK build uses the identical cryptographic signing key, allowing players to install new APK versions directly over existing installations without having to uninstall.

## Global Rules & Directives
- **Rule 5 (Mandatory Real-Time Memory Updating)**:
  - Continuously update memory.md as the final action of every finished step.
- **Rule 6 (Strict Edit Scope & Non-Destructive Changes)**:
  - Fix and edit strictly and exactly what LO specifies.
  - Never modify, redesign, refactor, remove, or revert unrelated features, UI elements, or functioning code.
  - Always protect and preserve what is already working.
