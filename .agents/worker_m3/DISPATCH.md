## 2026-09-17T23:14:14Z
You are Worker M3 for Match Pop Multiplayer.
Your working directory is: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/worker_m3

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Context & Inputs:
- Read ORIGINAL_REQUEST.md: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/ORIGINAL_REQUEST.md
- Read PROJECT.md: c:/Users/dsagh/OneDrive/Desktop/html/candy/PROJECT.md
- Read Explorer 3 Handoff: c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/explorer_3/handoff.md
- Shared engine in `src/shared/` and Server in `src/server/`

Your Task (Milestone M3: Visuals, Audio, Asset Pipeline & Mobile/APK Readiness):
1. Configure Vite & Client Dependencies:
   - Ensure `index.html` exists at root or in `src/client/` and is bundled cleanly by Vite into `dist/`.
   - Setup `capacitor.config.json` with Android configuration per Explorer 3 handoff.
2. Implement Frontend Architecture in `src/client/`:
   - `net/NetworkClient.ts`: Socket.io client connecting to server, managing `sessionToken` in `localStorage`, room create/join/ready/start/reconnect, sending `game:move`, and dispatching received events.
   - `render/TextureSynthesizer.ts`: Procedural offscreen vector canvas pre-baking high-DPI sprites (128x128 per tile): Red Jelly Bean, Orange Lozenge, Yellow Lemon Drop, Green Chiclet, Blue Lollipop, Purple Cluster, Striped Candy chevrons/stripes, Wrapped Candy cellophane wings, Color Bomb chocolate truffle with rainbow nonpareils, board cells, and particle fragments.
   - `render/CanvasRenderer.ts`: Layered Canvas 2D engine with `window.devicePixelRatio` retina scaling, rendering 9x9 board, smooth tile tweens (swaps, gravity drops, bounce easing), selection glow, striped laser sweeps, wrapped dual explosions, and floating praise text ("SWEET!", "TASTY!", "DELICIOUS!").
   - `render/ParticleSystem.ts`: 60fps particle bursts for candy shatters, sugar sparkles, and explosion rings.
   - `audio/AudioEngine.ts` & `audio/MusicSequencer.ts`: Pure Web Audio API procedural synthesis:
     - Crunchy match pops with pitch stepping by cascade combo tier.
     - Swap whoosh, invalid bump thump, laser beam sweep, wrapped boom, color bomb shimmer.
     - Woodblock turn timer tick-tock.
     - Calypso/marimba ambient music loop with volume and mute toggles.
     - Safe audio unlock on first pointerdown.
   - `input/InputHandler.ts`: Unified Pointer Events (`pointerdown`, `pointermove`, `pointerup`) with pointer capture, touch swipe detection threshold (24px), cell tap-to-swap, and safe-area margin offsets.
   - `ui/LobbyUI.ts` & `ui/HUD.ts`:
     - Mobile-first lobby: Player name, avatar selector, room code input, public room list, ready toggle, host start button.
     - In-game HUD: Room code badge, turn countdown timer circle/bar, active player indicator, 4 player cards with scores and avatars, BGM/SFX toggle switches.
     - Game Over podium: 1st-4th ranking, final scores, play again / lobby buttons.
   - `main.ts`: Client bootstrap wiring network, audio, renderer, input, and UI.
   - Expose `window.__MATCH_POP__` testing hook for headless automation:
     `getRoomCode()`, `getGameState()`, `getActiveSlot()`, `getBoardState()`, `getBoardHash()`, `getTurnRemainingSeconds()`, `simulateSwap(from, to)`.
3. Client Build & Unit/Integration Verification:
   - Run `npm run build` (Vite build producing `dist/` bundle) and verify 0 errors.
   - Run `npx tsc --noEmit` and `npm test` to ensure all existing tests pass without regressions.
   - Add unit tests in `tests/unit/client_render.test.ts` verifying texture synthesis, board hash computation, and audio synthesis triggers without crashing in Node/Vitest environments.

Write your handoff report to:
c:/Users/dsagh/OneDrive/Desktop/html/candy/.agents/worker_m3/handoff.md
Send a message to the orchestrator when finished.
