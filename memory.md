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
- **Level Progression Overhaul**:
  - Implemented dynamic target score thresholding in `GameSession.ts` (`while (totalScore >= this.targetScore)`) to handle multi-level leaps smoothly during high-combo cascades.
  - Added round replenishment on level up (`round = 1`) so moves reset and players can progress to higher levels instead of hitting an arbitrary game over.
  - Updated client `handleLevelUp` in `main.ts` to sync `currentRound`, refresh the HUD goal progress bar, trigger the level-up celebration overlay, and play the fanfare.
  - Deployed the authoritative backend live to Render (`srv-damj9n942hec739b8cf0`, deploy `dep-dau891093c1s73d566p0`), resolving the stale production server instance (which had been frozen on an un-progressed commit from September 18) so level up and score progression now execute seamlessly in online play.

## Global Rules & Directives
- **Rule 6 (Strict Edit Scope & Non-Destructive Changes)**:
  - Fix and edit strictly and exactly what LO specifies.
  - Never modify, redesign, refactor, remove, or revert unrelated features, UI elements, or functioning code.
  - Always protect and preserve what is already working.
