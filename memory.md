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
1. **Restored Match Progress UI & Detonation FX**:
   - Kept the Level & Round indicator, Team Goal score track, praise popups ("SWEET!", "TASTY!", "DELICIOUS!"), and smooth bomb detonations.
2. **Touch Engine Overhaul**:
   - Implemented `setPointerCapture` on `pointerdown` and `releasePointerCapture` on end.
   - Dual-event architecture: PointerEvents + TouchEvents fallback for older Android WebViews.
   - Window-level touch release handlers prevent stuck touches if finger exits canvas.
   - 3-second auto-release watchdog resets drag state automatically if OS interrupts a touch event.
   - Fixed `updateInputLockState` in `main.ts` with `localPlayerId` fallback to ensure input unlocks reliably across multiple consecutive matches.
3. **APK Signing**:
   - Retained the permanent keystore configuration to prevent signature package conflicts on updates.
