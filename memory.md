# Match Pop Multiplayer - Project Memory

## Overview
Real-time 1-4 Player Multiplayer Candy Match-3 game with HTML5 Canvas client, Node.js + Socket.IO server backend, and Capacitor Android compilation via GitHub Actions.

## Recent Milestones & Fixes

### Permanent Signing Keystore Setup (Resolves APK Package Conflicts)
- **Problem**: When installing a newer APK build over an older one on Android, Android reported "Package conflict" / "App not installed as package appears to be invalid".
- **Root Cause**: GitHub Actions builds were signed using ephemeral debug keystores generated dynamically by Gradle or lost by cache eviction. Android strictly requires every update to be signed with the exact same cryptographic certificate.
- **Solution Applied**:
  1. Configured `signingConfigs` in `android/app/build.gradle` pointing to `matchpop-debug.keystore` with explicit credentials (`storePassword: matchpop123`, `keyAlias: matchpop`).
  2. Updated `.github/workflows/build-apk.yml` to generate `android/app/matchpop-debug.keystore` if absent using standard `keytool` with 10,000 days validity.
  3. Ensured `versionCode` increments sequentially (`1000 + GITHUB_RUN_NUMBER`) and `versionName` tracks `package.json`.
  4. Moving forward, every build will use the exact same signature, enabling seamless updates without uninstalling.

### Touch Overhaul Architecture (v1.0.8)
- Fixed session wipe trap in `main.ts` where background reconnect attempts on old rooms could run `clearSession()` and wipe active player ID to `""`.
- Completely rebuilt `InputHandler.ts` with hardware pointer capture (`setPointerCapture`), dual swipe and tap-tap mode, 12px mobile swipe threshold, and 4.5s self-healing lock watchdog.
- Isolated `#bg-canvas` with `pointer-events: none`.

### Visuals & Multiplayer Sync (v1.0.7)
- Fixed `SPECIAL_DETONATE` property crash (`affectedTiles`).
- Full gravity drop and spawn cascade animation delays.
- Candy Crush praise words with Google Font `Fredoka`.
- Real-time Match & Round progress bar with team target tracking.
- Clock-skew immune countdown timer on guest clients.
