# Technical Specification & Handoff Report: R2 Shared Board Multiplayer & Room System (1 to 4 Players)

## 1. Observation

Directly quoted from `ORIGINAL_REQUEST.md` (lines 21–26, 45–49):
> **R2. Shared Board Multiplayer & Room System (1 to 4 Players)**
> - Server backend using Node.js with WebSockets / Socket.io for authoritative game state and real-time synchronization.
> - Room lobby system: players can create private/public rooms, share room codes/links, choose names/avatars, and see connected players (1 to 4).
> - Turn-based flow on the shared board: active player indicator, countdown turn timer (e.g. 15-30s), spectator/waiting state updates, and turn handoff immediately after cascades settle.
> - Disconnect handling and player reconnection without corrupting the board state.
> 
> **Multiplayer Synchronization Acceptance Criteria**
> - Multiple players (up to 4) can join a room via unique code, see each other in the lobby, and start the game.
> - All players observe board updates and animations in real time (<150ms latency locally) while respecting turn order.
> - Turn timer expires cleanly, passing turn to the next player if inactive.

From Explorer 1's completed investigation (`.agents/explorer_1/handoff.md`):
- Pure deterministic Match-3 engine (`Match3Engine`) emitting fine-grained event logs (`SWAP`, `MATCH_FOUND`, `SPECIAL_DETONATE`, `GRAVITY_DROP`, `REFILL_SPAWN`, `CASCADE_STEP_COMPLETE`, `BOARD_RESHUFFLE`, `TURN_SETTLE`).
- Grid is 9x9 (81 tiles) with 6 candy colors (0..5) + special candy types (`striped_h`, `striped_v`, `wrapped`, `color_bomb`).
- PRNG is Mulberry32 / SplitMix32 seeded per game.
- Turn advances only after all cascades settle.

From local environment check:
- Node.js version: `v24.16.0`
- npm version: `11.16.0`
- OS: Windows 11 / PowerShell

---

## 2. Logic Chain & Detailed Architectural Specification

### 2.1 Backend Architecture with Node.js & Socket.io

To guarantee cheat-prevention, determinism, and instant updates across all 1 to 4 clients, the backend must use an **authoritative server architecture**:

1. **Transport Layer: Socket.io v4**
   - Built on top of HTTP server (Node `http` / Express).
   - Upgrades immediately from HTTP long-polling to WebSockets.
   - Built-in connection heartbeat (`pingInterval: 25000`, `pingTimeout: 20000`) for detecting abrupt disconnections.
   - Socket rooms (`socket.join("room:" + roomCode)`) for clean broadcast partitioning with zero cross-room packet leakage.

2. **Server Roles & Responsibilities:**
   - **Single Source of Truth:** The server maintains in-memory `Room` and `GameState` objects containing the active board `Tile[][]`, current turn index, player scores, combo states, seed, and turn timer countdowns.
   - **Input Validation:** Clients do NOT execute state changes directly. A client sends a `PROPOSE_MOVE` with `(from, to)`. The server checks if the sender is the active player and if the swap is legally valid using the shared engine.
   - **Deterministic Resolution:** If valid, the server executes the full cascade loop using its seeded PRNG, logs each discrete step, updates scores, and broadcasts the event sequence to all room participants.
   - **Turn Progression & Clock Master:** The server manages the authoritative turn timer (default 20 seconds). Clients only render an interpolated countdown synchronized to server timestamps.

```
       ┌────────────────────────────────────────────────────────┐
       │                 Node.js Server Process                 │
       │                                                        │
       │   Express HTTP Server (Serves Client Web SPA / Assets) │
       │                          │                             │
       │   Socket.io Server ──────┴────── In-Memory Room Store  │
       │        │                              │                │
       │   Auth & Session Token Verification   │                │
       │        │                              ▼                │
       │   Authoritative Room Manager ──> [ Room: "LIME" ]     │
       │        │                              │                │
       │        ├──> Turn State Machine        ├─ Players [1..4]│
       │        ├──> Turn Timer Loop (1s tick) ├─ Spectators    │
       │        └──> Match-3 Pure Engine       └─ GameBoard     │
       └─────────────────────────┬──────────────────────────────┘
                                 │ WebSockets (<150ms)
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
         [Client 1: P1]   [Client 2: P2]   [Client 3: P3]
```

---

### 2.2 Room Management System (1 to 4 Players)

#### Room Configuration & Identifiers
- **Room Code:** 4 or 5-letter uppercase alphanumeric string (e.g. `JELLY`, `CANDY`, `POPS4`), excluding easily confused characters (`0/O`, `1/I`).
- **Access Modes:**
  - **Public Room:** Displayed in a public lobby list queryable by any connected client.
  - **Private Room:** Unlisted; requires the exact room code or shareable deep link URL (`https://host/?room=JELLY`).
- **Player Capacity:** 1 to 4 players. (1-player mode allows solo practice/high-score chase; 2–4 players provides competitive turn-based multiplayer).
- **Spectator Slots:** Any player joining after 4 active player slots are occupied, or who toggles "Spectate", joins as a `SPECTATOR`. Spectators receive all real-time board updates and chat/emotes, but do not take turns.

#### Player Identification & Session Token
When a client connects, they are assigned or restore a persistent `sessionToken` (UUID v4 stored in browser `localStorage`).
- `playerId`: Unique UUID for the session.
- `sessionToken`: Secret string proving identity on reconnect.
- `name`: Player display name (default "Player 1", sanitized, max 16 chars).
- `avatar`: Chosen avatar ID (e.g. `avatar_1` to `avatar_8`, or custom candy character icons).
- `slot`: Integer index `0..3`.
- `isReady`: Boolean.
- `isHost`: Boolean (Slot 0 creator; can start game, change settings, or kick afk players).
- `isConnected`: Boolean (tracks connection status).
- `disconnectedAt`: Timestamp for reconnection grace period.

#### Room State Lifecycle Machine
```
   [CREATED / EMPTY]
          │
          ▼
      [LOBBY] <───────────┐
          │ (Host Starts, │ (Rematch / Return to Lobby)
          │  All Ready)   │
          ▼               │
       [IN_GAME] ─────────┘
          │ (Final Turn / Max Score reached / All Candies cleared)
          ▼
     [GAME_OVER]
```

1. **LOBBY State:**
   - Players join, choose slot, pick name and avatar.
   - Toggle `isReady` (green checkmark).
   - Host controls game configuration (e.g. Turn Timer: 15s / 20s / 30s; Target Score or Max Turns: 10/20/30 rounds).
   - Game can start once $\ge 1$ player is present and all active players are ready (or Host forces start with countdown).
2. **IN_GAME State:**
   - Shared 9x9 board initialized with seed.
   - Initial board guaranteed to have $>0$ valid moves and $0$ pre-existing matches.
   - Turn cycle commences with Player slot 0.
3. **GAME_OVER State:**
   - Triggers when max turns reached (e.g. 5 rounds per player) or target score met.
   - Displays podium / leaderboard (1st, 2nd, 3rd, 4th) with total scores, best combos, and biggest single-move clears.
   - Option for "Play Again" (same players, new seed) or "Return to Lobby".

---

### 2.3 Authoritative Turn-Based Lifecycle & Timing

#### Active Player Selection & Turn Order
- Turn order follows active connected player slots cyclically: `Slot 0 -> Slot 1 -> Slot 2 -> Slot 3 -> Slot 0 ...`
- If a player is disconnected or marked inactive, the server skips their slot immediately or when their turn timer elapses.
- Only the **active player** (`currentTurnPlayerId === socket.playerId`) can submit a `PROPOSE_MOVE`. If any other player attempts a move, the server rejects it with an `OUT_OF_TURN` error code.

#### Turn Timer (15s – 30s Countdown)
- **Authoritative Server Timer:** The server stores `turnStartedAt` and `turnExpiresAt` (e.g. `now + 20,000ms`).
- **Time Sync Pulse:** On turn start, the server sends `TURN_CHANGE` with `turnExpiresAt: number` (epoch ms) and `durationMs: 20000`.
- **Clock Drift Compensation:** Clients calculate remaining time using their measured RTT offset ($t_{remaining} = turnExpiresAt - (Date.now() + serverOffset)$).
- **Grace Period & Auto-Timeout:**
  - If no valid move is received by `turnExpiresAt + 500ms`, the server executes a **Turn Timeout**.
  - Server emits `TURN_TIMEOUT { playerId }` and automatically calls `passTurnToNextPlayer()`.
  - Consecutive timeouts counter: If a player times out 2 consecutive turns, they are flagged as `AUTO_PASS` / AFK to keep the game brisk for other players.

#### Cascade Resolution Sequence & Turn Hand-off
To ensure perfect visual clarity and prevent race conditions:
1. Active player submits `PROPOSE_MOVE { from, to }`.
2. Turn timer is immediately **PAUSED** on the server.
3. Server executes `Match3Engine.resolveMove(board, move, prng)`.
4. If **INVALID**:
   - Server emits `MOVE_REJECTED { from, to, reason: 'NO_MATCH' }`.
   - Active player receives `SWAP_REVERT` event; turn timer resumes with remaining time.
5. If **VALID**:
   - Server updates board to `finalBoard`, credits `turnScore` to active player.
   - Server broadcasts `MOVE_ACCEPTED` followed immediately by the ordered event batch `CASCADE_STEPS { move, events, turnScore, cumulativeScores }`.
   - **Animation Lockout:** During cascade playback (duration estimated by client: sum of tween durations ~ 1.5s - 4.0s), all player inputs are locked.
   - Once all animations finish on client (or after server buffer duration), the server advances `currentTurnIndex = (currentTurnIndex + 1) % activePlayerCount`.
   - Server emits `TURN_CHANGE { activePlayerId, turnIndex, turnExpiresAt, roundNumber }` and starts the fresh 20-second countdown for the next player!

---

### 2.4 Real-Time Synchronization Protocol & Message Schemas

All messages are typed JSON payloads over Socket.io events.

#### A. Room & Lobby Events

##### Client $\rightarrow$ Server: `room:create`
```typescript
interface RoomCreateRequest {
  playerName: string;
  avatarId: string;
  isPublic: boolean;
  settings?: {
    turnDurationSeconds: number; // default: 20 (range 15-30)
    maxRounds: number;           // default: 10
    boardSize: number;           // default: 9 (9x9)
  };
}
```

##### Server $\rightarrow$ Client: `room:created`
```typescript
interface RoomCreatedResponse {
  roomCode: string;
  sessionToken: string;
  playerId: string;
  slot: number;
}
```

##### Client $\rightarrow$ Server: `room:join`
```typescript
interface RoomJoinRequest {
  roomCode: string;
  playerName: string;
  avatarId: string;
  sessionToken?: string; // If reconnecting
  asSpectator?: boolean;
}
```

##### Server $\rightarrow$ Client: `room:state` (Broadcast to Room)
```typescript
interface PlayerDTO {
  playerId: string;
  name: string;
  avatarId: string;
  slot: number;             // 0..3
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  score: number;
  consecutiveTimeouts: number;
}

interface RoomStateDTO {
  roomCode: string;
  status: 'LOBBY' | 'IN_GAME' | 'GAME_OVER';
  isPublic: boolean;
  players: PlayerDTO[];
  spectatorCount: number;
  settings: {
    turnDurationSeconds: number;
    maxRounds: number;
    boardSize: number;
  };
}
```

##### Client $\rightarrow$ Server: `room:ready` / `room:start`
```typescript
interface RoomReadyRequest {
  isReady: boolean;
}
// room:start has empty payload, only accepted from isHost === true
```

---

#### B. Gameplay Events

##### Server $\rightarrow$ Client: `game:start`
```typescript
interface GameStartPayload {
  seed: number;
  board: TileDTO[][];        // Initial 9x9 grid
  activePlayerId: string;
  round: number;
  turnExpiresAt: number;     // Epoch timestamp in ms
  turnDurationMs: number;
}
```

##### Client $\rightarrow$ Server: `game:move`
```typescript
interface ProposeMovePayload {
  roomCode: string;
  from: { row: number; col: number };
  to: { row: number; col: number };
  clientTimestamp: number;
}
```

##### Server $\rightarrow$ Client: `game:move_result` (Broadcast to Room)
```typescript
interface MoveResultPayload {
  valid: boolean;
  playerId: string;
  from: { row: number; col: number };
  to: { row: number; col: number };
  reason?: 'NOT_YOUR_TURN' | 'INVALID_SWAP' | 'GAME_NOT_ACTIVE';
  events: EngineEventDTO[];  // Full sequence of swap, match, explode, drop, spawn
  scoreAwarded: number;
  playerTotalScore: number;
  boardAfterSettled: TileDTO[][];
  needsReshuffle: boolean;
}
```

##### Server $\rightarrow$ Client: `game:turn_change` (Broadcast to Room)
```typescript
interface TurnChangePayload {
  activePlayerId: string;
  slot: number;
  round: number;
  turnExpiresAt: number;
  turnDurationMs: number;
  serverTimestamp: number;
}
```

##### Server $\rightarrow$ Client: `game:timeout`
```typescript
interface TurnTimeoutPayload {
  timedOutPlayerId: string;
  nextPlayerId: string;
}
```

##### Server $\rightarrow$ Client: `game:reshuffle`
```typescript
interface ReshufflePayload {
  reason: 'NO_VALID_MOVES';
  newBoard: TileDTO[][];
}
```

##### Server $\rightarrow$ Client: `game:over`
```typescript
interface GameOverPayload {
  winnerPlayerId: string;
  rankings: {
    playerId: string;
    name: string;
    avatarId: string;
    finalScore: number;
    rank: number;
  }[];
}
```

---

### 2.5 Robustness, Fault Tolerance & Reconnection Handling

Real-world mobile play suffers from flaky Wi-Fi, cell tower switches, screen lock, and accidental tab refreshes. The system must never deadlock or leave remaining players stuck.

1. **Session Token & Reconnect Handshake:**
   - Every player client stores `sessionToken` in browser `localStorage`.
   - On reconnect (after network drop or page reload), client emits:
     `room:reconnect { roomCode, sessionToken }`
   - Server checks `room.players.find(p => p.sessionToken === sessionToken)`.
   - If matched:
     - Updates player's `socket.id = newSocket.id`.
     - Sets `isConnected = true`.
     - Clears the disconnect grace timer.
     - Immediately replies with `game:sync_state` containing:
       - Current full `board` (`Tile[][]`).
       - Scores of all players.
       - Current active player ID and remaining turn time ($turnExpiresAt - now$).
       - Active game status.
     - Broadcasts `room:player_reconnected` to other players.
     - Client smoothly resumes without restarting game!

2. **Disconnect Grace Timer (45 Seconds):**
   - When a socket abruptly drops (`socket.on('disconnect')`):
     - Mark player `isConnected = false`, `disconnectedAt = Date.now()`.
     - Start a 45-second reconnection grace timer.
     - Broadcast `room:player_disconnected { playerId, graceSecondsRemaining: 45 }`.
     - Other players see a dimmed avatar with a reconnecting icon.
   - **If it is the disconnected player's turn:**
     - The current 20s turn timer continues counting down.
     - When it expires, server passes turn to the next connected player.
     - Subsequent turns skip this player while disconnected.
   - **If player does NOT reconnect within 45 seconds:**
     - Player is formally forfeited / dropped.
     - If game had 2 players, the remaining player is declared winner.
     - If game had 3-4 players, the game continues with remaining connected players; turn order is recalculated dynamically.

3. **Player Voluntary Leave Mid-Game:**
   - Client emits `room:leave`.
   - Server removes player from active rotation.
   - If player was active turn player: turn timer is reset and immediately passed to next player.
   - Total active players updated. Game does not crash.

4. **Host Migration:**
   - If the host (Slot 0) leaves or permanently disconnects:
     - Server automatically transfers `isHost = true` to the next lowest connected slot (e.g. Slot 1).
     - Broadcasts `room:host_changed { newHostPlayerId }`.

5. **Anti-Deadlock Guarantees:**
   - The turn timer runs on an absolute server-side `setTimeout` / `setInterval` tick. Even if a client sends invalid packets, hangs, or halts JavaScript, the server timer will fire and advance the game state.
   - All board mutations occur in synchronous, pure functions before emitting events, preventing partial state corruptions or race conditions.

---

### 2.6 Project Directory Structure & Dependencies

#### Directory Layout
A clean, modular monorepo/folder layout that allows shared TypeScript engine code to be consumed identically by both Node server and web frontend:

```
c:/Users/dsagh/OneDrive/Desktop/html/candy/
├── package.json               # Root dependencies and scripts (dev, build, start, test)
├── tsconfig.json              # TypeScript compilation configuration
├── vite.config.ts             # Vite configuration for lightning-fast frontend bundling
│
├── src/
│   ├── shared/                # ZERO DOM/NODE DEPENDENCIES - Pure shared logic
│   │   ├── types.ts           # Shared interfaces (Tile, CandyColor, EngineEvent, DTOs)
│   │   ├── constants.ts       # Board dimensions (9x9), scores, timings
│   │   ├── prng.ts            # Seeded Mulberry32 deterministic generator
│   │   └── engine/            # Authoritative Match-3 Game Engine
│   │       ├── Match3Engine.ts
│   │       ├── MatchDetector.ts
│   │       ├── SpecialCandyHandler.ts
│   │       └── GravityCascade.ts
│   │
│   ├── server/                # Node.js Authoritative Backend
│   │   ├── index.ts           # Entry point (Express + HTTP + Socket.io bootstrap)
│   │   ├── SocketServer.ts    # Socket.io connection & event dispatching
│   │   ├── RoomManager.ts     # Room lifecycle, lobby codes, join/leave/reconnect
│   │   ├── Room.ts            # Room state, turn timer, slot management
│   │   └── GameSession.ts     # In-game state wrapper driving Match3Engine
│   │
│   └── client/                # Modern Web Frontend (Mobile & APK ready)
│       ├── index.html         # Single Page App entry point
│       ├── main.ts            # Client bootstrap
│       ├── net/
│       │   └── NetworkClient.ts # Socket.io client wrapper & session token manager
│       ├── ui/                # UI screens (Lobby, RoomCodeModal, Scoreboard, TurnTimer)
│       ├── render/            # High-performance Canvas/Pixi renderer for board & candies
│       ├── audio/             # Web Audio API procedural sound engine
│       └── input/             # Touch & drag swipe controller
│
├── tests/
│   ├── unit/                  # Unit tests for Match3Engine & RoomManager
│   │   ├── engine.test.ts
│   │   └── room.test.ts
│   └── e2e/                   # Headless multi-client automated bot verification
│       └── multiplayer_sync.spec.ts
│
└── capacitor.config.json      # Mobile APK packaging config (Android target)
```

#### Recommended NPM Packages & Dependencies

##### Backend & Server:
- `express` (`^4.21.0`): Minimal HTTP server for serving static assets and health check.
- `socket.io` (`^4.8.0`): Real-time WebSockets communication with room abstractions, auto-reconnection, and fallback.
- `uuid` (`^10.0.0`): Generation of secure `sessionToken`s and `playerId`s.
- `cors` (`^2.8.5`): Clean CORS handling for local development and multi-port testing.

##### Shared & Engine:
- Pure TypeScript (built-in standard library, no external npm physics packages required).

##### Development & Tooling:
- `typescript` (`^5.6.0`): Type-safety and interface contracts across server and client.
- `tsx` / `ts-node`: Fast server development execution without manual build steps (`tsx watch src/server/index.ts`).
- `vite` (`^5.4.0`): Ultra-fast client bundler with instant HMR and optimized production build output.
- `vitest` or `jest`: Fast unit test runner for the engine and room logic.
- `@types/node`, `@types/express`, `@types/uuid`: TypeScript typings.

---

## 3. Caveats & Edge Cases

1. **Cascade Duration vs Turn Timer:**
   If a massive combo triggers multiple cascades lasting 4 seconds, the next player must not lose 4 seconds of their turn. The server must pause the clock during cascade resolution and emit a fresh `turnExpiresAt` only when `TURN_CHANGE` occurs.
2. **Double Move Spam (Network Latency):**
   A player rapidly swiping or sending concurrent `game:move` packets while a prior move is being evaluated. The server must enforce an `isEvaluatingMove` lock per room, ignoring extraneous moves until the current resolution completes.
3. **Split Brain / Desync Prevention:**
   Clients must NEVER mutate their authoritative board array independently. The client visual layer is strictly an animation interpreter of the server's `EngineEvent[]`. If a desynchronization occurs (e.g. dropped packet), the client can request a `FULL_BOARD_SYNC` which replaces local grid with the server's raw `Tile[][]`.
4. **Reshuffling During Multi-Cascade:**
   If a board settles with no remaining moves, the server automatically computes the reshuffle, generates a `BOARD_RESHUFFLE` event, and appends it to the turn's event queue before handing off the turn.

---

## 4. Conclusion & Recommendations

1. **Architecture:** Use a Node.js + Socket.io authoritative server coupled with the pure TypeScript `Match3Engine`. Server validates all moves, drives turn timers, and broadcasts deterministic cascade event logs.
2. **Room Management:** Support 1 to 4 players with 4-letter room codes, private/public listing, slot assignments, and spectator capabilities.
3. **Session Persistence:** Implement `sessionToken` in `localStorage` with a 45-second disconnect grace period and immediate board state restoration.
4. **Anti-Deadlock:** Authoritative server timers guarantee game progression even if clients crash or drop offline.

---

## 5. Verification Method

Once implemented, verify independently via:
1. **Server Unit Tests (`npm test`):**
   - Test room creation, duplicate code handling, player slot assignments (1 to 4).
   - Test turn rotation logic, skipping disconnected players, and host migration.
   - Test timeout triggers passing the turn automatically after 20s.
2. **Socket Mock Integration Tests:**
   - Simulate 2 socket clients connecting to room `TEST1`.
   - Client 1 submits valid move; verify Client 2 receives identical `MOVE_ACCEPTED` and `CASCADE_STEPS`.
   - Client 2 attempts move during Client 1's turn; verify rejection with `NOT_YOUR_TURN`.
   - Disconnect Client 1 socket; reconnect with `sessionToken`; verify `sync_state` matches exact board.
3. **Automated Headless Multi-Client E2E (Playwright):**
   - Spin up server.
   - Launch 3 headless browser contexts in parallel.
   - Complete lobby ready sequence, execute 5 turns in round-robin order, and assert 100% board tile parity across all 3 DOM/Canvas instances.
