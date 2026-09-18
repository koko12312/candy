# Project: Match Pop Multiplayer

## Architecture & System Overview
Match Pop Multiplayer is a high-performance, mobile-first Candy Crush Saga clone supporting 1 to 4 simultaneous players on a shared turn-based board with real-time state synchronization, authentic match-3 cascading physics, special candy combinatorics, procedural graphics & Web Audio sound, and an automated verification suite.

```
c:/Users/dsagh/OneDrive/Desktop/html/candy/
├── src/
│   ├── shared/                # Zero-dependency pure TypeScript engine & contracts
│   │   ├── types.ts           # Shared interfaces (Tile, CandyColor, EngineEvent, DTOs)
│   │   ├── constants.ts       # Board dimensions (9x9), timings, scores
│   │   ├── prng.ts            # Mulberry32 deterministic PRNG
│   │   └── engine/            # Authoritative Match-3 Game Engine
│   │       ├── Match3Engine.ts
│   │       ├── MatchDetector.ts
│   │       ├── SpecialCandyHandler.ts
│   │       └── GravityCascade.ts
│   │
│   ├── server/                # Authoritative Node.js + Socket.io server
│   │   ├── index.ts           # Server bootstrap (Express + HTTP + Socket.io)
│   │   ├── SocketServer.ts    # Socket connection, room events & auth
│   │   ├── RoomManager.ts     # Room lifecycle, lobby codes, slots & matchmaking
│   │   ├── Room.ts            # Room state, turn timer, slot management
│   │   └── GameSession.ts     # Server game loop driving Match3Engine
│   │
│   └── client/                # High-performance HTML5 Canvas frontend
│       ├── index.html         # Responsive Single Page App entry
│       ├── main.ts            # Client orchestrator & state manager
│       ├── net/
│       │   └── NetworkClient.ts # Socket.io client wrapper & session token store
│       ├── render/            # Layered Canvas 2D engine (Retina/DPR, sprites, particles)
│       │   ├── CanvasRenderer.ts
│       │   ├── TextureSynthesizer.ts
│       │   ├── ParticleSystem.ts
│       │   └── AnimationController.ts
│       ├── audio/             # Procedural Web Audio API sound engine
│       │   ├── AudioEngine.ts
│       │   └── MusicSequencer.ts
│       ├── input/             # Pointer events (touch/drag/tap) controller
│       │   └── InputHandler.ts
│       └── ui/                # UI screens (Lobby, RoomCode, In-Game HUD, GameOver)
│           ├── LobbyUI.ts
│           └── HUD.ts
│
├── tests/
│   ├── unit/                  # Fast unit tests (Engine & Room logic)
│   │   ├── engine.test.ts
│   │   └── room.test.ts
│   └── e2e/                   # Multi-client headless bot simulation
│       └── multiplayer_sync.spec.ts
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── capacitor.config.json      # Mobile Android APK packaging configuration
```

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 9x9 Grid & Tile Model | Configurable 9x9 discrete grid, 6 candy colors, unique tile uids | M1 | Survey (Explorer 1) |
| 2 | Orthogonal Swap Validation | Strict orthogonal adjacency, legality check, and smooth revert | M1 | Survey (Explorer 1) |
| 3 | 2-Pass Match Detection | Horizontal & vertical contiguous 3+ scans with intersection grouping | M1 | Survey (Explorer 1) |
| 4 | Special Candies Formation | Striped (4 in line), Wrapped (T/L shape), Color Bomb (5 in line) | M1 | Survey (Explorer 1) |
| 5 | Special Candies Detonation | Striped beam, Wrapped 3x3 double blast, Color Bomb color purge | M1 | Survey (Explorer 1) |
| 6 | Combinatorial Super-Combos | Striped+Striped, Striped+Wrapped, Wrapped+Wrapped, Color Bomb combos | M1 | Survey (Explorer 1) |
| 7 | Cascade Gravity & Refills | Column compaction, deterministic PRNG refills, combo multipliers | M1 | Survey (Explorer 1) |
| 8 | Reshuffle on No Moves | Automatic board shuffle when 0 legal moves remain | M1 | Survey (Explorer 1) |
| 9 | Authoritative Node.js Server | Express + Socket.io v4 server validating all moves and driving turns | M2 | Survey (Explorer 2) |
| 10 | Room & Lobby Management | 1-4 player rooms, public/private codes, names, avatars, ready status | M2 | Survey (Explorer 2) |
| 11 | Authoritative Turn Lifecycle | Active player indicator, 20s turn countdown timer, timeout pass | M2 | Survey (Explorer 2) |
| 12 | Disconnect & Reconnect | SessionToken persistence in localStorage, 45s grace period, full sync | M2 | Survey (Explorer 2) |
| 13 | Real-time Synchronization | Typed JSON event protocol broadcasting cascade events (<150ms) | M2 | Survey (Explorer 2) |
| 14 | Layered Canvas 2D Engine | Hardware-accelerated 60fps rendering, DPR scaling, tween queue | M3 | Survey (Explorer 3) |
| 15 | Procedural Vector Textures | Offscreen sprite baking for crisp candies, wrappers, and particles | M3 | Survey (Explorer 3) |
| 16 | Procedural Web Audio Engine | Dynamic pitch match pops, whooshes, blasts, ticks, and ambient BGM | M3 | Survey (Explorer 3) |
| 17 | Responsive Mobile Layout | Safe-area insets, mobile touch drag/swipe, portrait/landscape | M3 | Survey (Explorer 3) |
| 18 | Android APK Packaging Readiness | Capacitor configuration, Android manifest permissions, screen wake lock | M3 | Survey (Explorer 3) |
| 19 | Headless E2E Bot Simulation | Playwright suite launching 2-4 concurrent browser contexts verifying sync | M4 | Survey (Explorer 3) |
| 20 | Adversarial Hardening (Tier 5) | Comprehensive adversarial test harness verifying zero desync & edge cases | M4 | Survey (Explorer 3) |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Match-3 Engine | Pure TypeScript shared engine (9x9 grid, 2-pass match detector, specials, combos, cascades, deterministic PRNG, reshuffle) + full unit tests | None | DONE |
| M2 | Authoritative Server & Room Sync | Node.js + Socket.io server, room lobby (1-4 players), turn timers, disconnect recovery, real-time event streaming + socket integration tests | M1 | DONE |
| M3 | Client Rendering, Audio & Mobile APK | Canvas 2D engine, procedural texture synthesizer, Web Audio synthesis, mobile responsive layout, touch gesture handler, and Capacitor APK config | M1, M2 | DONE |
| M4 | E2E Testing Track & Final Verification | Multi-client headless bot simulation (2-4 players), automated turns, cascades, disconnect/reconnect, 100% board parity assertion, and adversarial coverage hardening | M1, M2, M3 | DONE |

---

## Interface Contracts

### Shared Engine ↔ Server & Client
- `Match3Engine.resolveMove(board: Tile[][], move: PlayerMove, prng: PRNG): MoveResolution`
  - Returns `{ valid: boolean, events: EngineEvent[], finalBoard: Tile[][], turnScore: number }`
- `Match3Engine.hasValidMoves(board: Tile[][]): boolean`
- `Match3Engine.reshuffleBoard(board: Tile[][], prng: PRNG): { newBoard: Tile[][], events: EngineEvent[] }`

### Client ↔ Server Socket.io Protocol
- `room:create` / `room:created`
- `room:join` / `room:state`
- `room:ready` / `room:start`
- `game:start` `{ seed, board, activePlayerId, turnExpiresAt, turnDurationMs }`
- `game:move` `{ roomCode, from, to, clientTimestamp }`
- `game:move_result` `{ valid, events, scoreAwarded, playerTotalScore, boardAfterSettled }`
- `game:turn_change` `{ activePlayerId, slot, round, turnExpiresAt, turnDurationMs }`
- `game:timeout` `{ timedOutPlayerId, nextPlayerId }`
- `room:reconnect` / `game:sync_state`

---

## Code Layout
- Root: `package.json`, `tsconfig.json`, `vite.config.ts`, `capacitor.config.json`
- `src/shared/`: Shared types, constants, PRNG, and Match-3 Engine
- `src/server/`: Express + Socket.io backend
- `src/client/`: HTML5 Canvas, Web Audio, UI, NetworkClient
- `tests/unit/`: Vitest engine & room tests
- `tests/e2e/`: Playwright multi-client bot simulation
