# Original User Request

## 2026-09-17T16:36:39Z

Build a complete, polished Candy Crush Saga clone named **Match Pop Multiplayer**, playable online for 1 to 4 players simultaneously on a shared turn-based board with real-time state synchronization, authentic match-3 cascading physics, special candy combinatorics, rich graphics/sound, and lobby management. The client must be architected for responsive mobile touch screens and structured for easy packaging/compilation into an Android APK (e.g., using Capacitor / Cordova / WebView wrapping).

Working directory: `c:/Users/dsagh/OneDrive/Desktop/html/candy`
Integrity mode: development

## Requirements

### R1. Authentic Match-3 Core Mechanics & Special Candies
- Grid mechanics supporting standard Candy Crush board dimensions, smooth touch/swipe and drag-swap controls, and match detections (horizontal & vertical 3+).
- Special Candies:
  - 4 in a row → Striped Candy (clears entire row or column when matched).
  - T or L shape → Wrapped Candy (explodes in a 3x3 area twice).
  - 5 in a row → Color Bomb / Chocolate Ball (clears all candies of whatever color it is swapped with).
  - Special candy combos (Striped + Wrapped, Striped + Striped, Color Bomb + Striped, Color Bomb + Color Bomb).
- Gravity drops, cascading refills, combo multiplier tracking, and automatic reshuffling when no valid moves remain.

### R2. Shared Board Multiplayer & Room System (1 to 4 Players)
- Server backend using Node.js with WebSockets / Socket.io for authoritative game state and real-time synchronization.
- Room lobby system: players can create private/public rooms, share room codes/links, choose names/avatars, and see connected players (1 to 4).
- Turn-based flow on the shared board: active player indicator, countdown turn timer (e.g. 15-30s), spectator/waiting state updates, and turn handoff immediately after cascades settle.
- Disconnect handling and player reconnection without corrupting the board state.

### R3. Visuals, Audio, Asset Pipeline & Mobile/APK Readiness
- Modern web frontend (HTML5 Canvas / PixiJS / Phaser or crisp web-native rendering) delivering Candy Crush aesthetic: vibrant candy textures, jellies, board skins, particle explosions, and candy drop animations.
- Responsive mobile-first layout with touch events, viewport scaling, and orientation handling suitable for packaging into an Android APK via Capacitor or Cordova.
- Web research before attempting asset capture/generation, leveraging Playwright MCP with user's Chrome profile when retrieving or referencing online assets if needed.
- Audio engine: juicy crunch sounds, sweet match melodies, combos, countdown tick, and background music with toggle controls.

### R4. Automated Testing & Verification Suite
- Headless automated bot simulation script (e.g. Playwright script or test runner) that launches 2 to 4 concurrent browser client sessions, connects them to a room, executes sequential moves, verifies turn advancement, validates match cascades, and confirms board synchronization across all connected clients.
- Mobile viewport & touch event verification to ensure smooth touch control and rendering on Android mobile screen dimensions.

## Acceptance Criteria

### Core Mechanics & Mobile UX
- [ ] Swapping two candies via touch swipe or mouse drag creates matches if valid, and reverses smoothly if no match is formed.
- [ ] Striped, Wrapped, and Color Bomb candies form under the correct patterns and execute their authentic blast mechanics and combinations.
- [ ] Cascades drop and fill empty spaces continuously until no matches remain, awarding correct combo scores.
- [ ] Layout scales responsively to mobile aspect ratios (portrait/landscape) with touch targets suitable for an Android APK build.

### Multiplayer Synchronization
- [ ] Multiple players (up to 4) can join a room via unique code, see each other in the lobby, and start the game.
- [ ] All players observe board updates and animations in real time (<150ms latency locally) while respecting turn order.
- [ ] Turn timer expires cleanly, passing turn to the next player if inactive.

### Automated Verification
- [ ] Verification script successfully runs end-to-end with multiple headless instances verifying matching, turn progression, and zero board state desynchronization.

## Follow-up — 2026-09-17T18:28:21Z

User instruction: Complete Milestone M2 and its verification gate, then pause all further work/milestones for 3 hours to allow rate limits to reset. Do not begin Milestone M3 until resumed.

## Follow-up — 2026-09-17T23:11:23Z

The 3-hour limit reset pause is complete. Please resume the project immediately:
1. Advance from M2 to Milestone M3 (Client Rendering, Texture Synthesizer, Web Audio, Responsive Mobile Touch UI, and Android APK packaging configuration).
2. Proceed to Milestone M4 (Playwright Headless Multi-Client Bot Simulation & Verification Suite).
Continue with full multi-agent swarm execution until completion.

