# Technical Specification & Handoff Report: R1 Match-3 Core Mechanics & Special Candies

## 1. Observation

Directly quoted from `ORIGINAL_REQUEST.md` (lines 12–20):
> **R1. Authentic Match-3 Core Mechanics & Special Candies**
> - Grid mechanics supporting standard Candy Crush board dimensions, smooth touch/swipe and drag-swap controls, and match detections (horizontal & vertical 3+).
> - Special Candies:
>   - 4 in a row → Striped Candy (clears entire row or column when matched).
>   - T or L shape → Wrapped Candy (explodes in a 3x3 area twice).
>   - 5 in a row → Color Bomb / Chocolate Ball (clears all candies of whatever color it is swapped with).
>   - Special candy combos (Striped + Wrapped, Striped + Striped, Color Bomb + Striped, Color Bomb + Color Bomb).
> - Gravity drops, cascading refills, combo multiplier tracking, and automatic reshuffling when no valid moves remain.

From Acceptance Criteria (lines 39–44):
> - Swapping two candies via touch swipe or mouse drag creates matches if valid, and reverses smoothly if no match is formed.
> - Striped, Wrapped, and Color Bomb candies form under the correct patterns and execute their authentic blast mechanics and combinations.
> - Cascades drop and fill empty spaces continuously until no matches remain, awarding correct combo scores.

---

## 2. Logic Chain & Detailed Architectural Specification

### 2.1 Board Representation, Grid Dimensions, and Tile Model

#### Grid Dimensions
- **Standard Dimensions:** **9 rows × 9 columns** (81 tiles) is the canonical Candy Crush Saga board size. An **8 rows × 8 columns** (64 tiles) option is also standard for fast casual play.
- **Recommendation:** Implement a configurable `GRID_ROWS = 9`, `GRID_COLS = 9` (with default 9x9), perfectly centered on mobile viewports (e.g. 360px–430px wide, 38px–44px per cell + 2px padding).
- **Coordinate Space:**
  - `row`: `0` (top) to `GRID_ROWS - 1` (bottom).
  - `col`: `0` (left) to `GRID_COLS - 1` (right).
  - Indexing: `index = row * GRID_COLS + col`.

#### Candy Colors (Standard 6-Color Palette)
```typescript
export enum CandyColor {
  RED = 0,      // Jelly Bean
  ORANGE = 1,   // Lozenge / Oval
  YELLOW = 2,   // Lemon Drop / Triangle
  GREEN = 3,    // Pillow / Square
  BLUE = 4,     // Sphere / Ball
  PURPLE = 5,   // Cluster / Flower
  NONE = -1     // For Color Bomb or Empty
}
```

#### Candy Types
```typescript
export enum CandyType {
  NORMAL = 'normal',
  STRIPED_HORIZONTAL = 'striped_h', // Clears its entire row (horizontal beam)
  STRIPED_VERTICAL = 'striped_v',     // Clears its entire column (vertical beam)
  WRAPPED = 'wrapped',               // Explodes 3x3 area twice
  COLOR_BOMB = 'color_bomb'          // Clears all candies of chosen color
}
```

#### Tile Data Structure
Each candy tile must possess a unique, monotonically increasing `id` (e.g. integer `uid`) so the front-end animation engine (Phaser / Pixi / Canvas) can track discrete candy entities during swaps, gravity drops, and cascades without visual flickering.

```typescript
export interface Tile {
  id: number;           // Unique instance ID (monotonically incremented)
  row: number;          // Current row (0..8)
  col: number;          // Current col (0..8)
  color: CandyColor;    // Color 0..5, or -1 for Color Bomb
  type: CandyType;      // normal, striped_h, striped_v, wrapped, color_bomb
}
```

---

### 2.2 Swap Validation Rules

A player action consists of selecting cell `A (r1, c1)` and swapping with adjacent cell `B (r2, c2)`.

1. **Orthogonal Adjacency Constraint:**
   $$\Delta r = |r1 - r2|, \quad \Delta c = |c1 - c2|$$
   A swap is geometrically valid if and only if:
   $$(\Delta r == 1 \land \Delta c == 0) \lor (\Delta r == 0 \land \Delta c == 1)$$
   Diagonal moves are strictly prohibited.

2. **Game Rule Validity:**
   A swap between `A` and `B` is legally allowed to proceed if **any** of the following conditions is met:
   - **Condition 1: Special Candy Direct Combo:**
     Both `A` and `B` are special candies (`type !== NORMAL`), regardless of their colors (e.g. Striped + Striped, Striped + Wrapped, Wrapped + Wrapped, Color Bomb + any Special).
   - **Condition 2: Color Bomb Swap:**
     Either `A` or `B` is a `COLOR_BOMB` (a Color Bomb can be swapped with ANY candy on the board, whether normal or special).
   - **Condition 3: Standard Match-3 Formation:**
     Temporarily exchanging `A` and `B` causes at least one group of $\ge 3$ consecutive candies of the same color along any horizontal row or vertical column containing either `A` or `B`.

3. **Revert Behavior:**
   If none of Conditions 1–3 are satisfied, the engine marks the move as **invalid**. The UI plays a forward swap animation followed immediately by a reverse swap animation (`SWAP_REVERT` event). The turn does NOT advance, no points are awarded, and no board state mutation persists.

---

### 2.3 Match Detection Algorithms & Precedence Rules

To detect all matches accurately while respecting overlapping shapes and special candy generation, a deterministic 2-pass sweep algorithm is specified:

#### Pass 1: Horizontal & Vertical Line Scans
1. **Horizontal Scan:**
   - Iterate each `row` from `0` to `GRID_ROWS - 1`.
   - Find contiguous spans of identical color (`color !== NONE`).
   - If span length $L \ge 3$, record a `HorizontalMatchRun { row, startCol, endCol, length: L, color }`.
2. **Vertical Scan:**
   - Iterate each `col` from `0` to `GRID_COLS - 1`.
   - Find contiguous spans of identical color (`color !== NONE`).
   - If span length $L \ge 3$, record a `VerticalMatchRun { col, startRow, endRow, length: L, color }`.

#### Pass 2: Intersection & Shape Classification
Group overlapping horizontal and vertical runs that share the same color into unified `MatchCluster`s:
- **5-in-a-Line (Color Bomb):**
  - Any single horizontal or vertical run where $L \ge 5$.
  - Generates: `CandyType.COLOR_BOMB` (color = `NONE`).
  - Anchor: Position of the candy that the player moved to form the 5-match. If formed via cascade, the center tile ($i = \lfloor L/2 \rfloor$).
- **T-Shape / L-Shape / Cross (Wrapped Candy):**
  - A horizontal run ($L \ge 3$) and vertical run ($L \ge 3$) that intersect at a shared cell `(r, c)` of the same color (forming a 5-candy T, L, or + pattern).
  - Generates: `CandyType.WRAPPED` with the matching color.
  - Anchor: The intersection cell `(r, c)`.
- **4-in-a-Line (Striped Candy):**
  - Any horizontal or vertical run where $L == 4$ (not intersecting into a T/L shape).
  - Generates:
    - If swap was made horizontally into the 4-match: `CandyType.STRIPED_VERTICAL` (creates vertical stripe, which fires vertically).
    - If swap was made vertically into the 4-match: `CandyType.STRIPED_HORIZONTAL` (creates horizontal stripe, which fires horizontally).
    - If formed in a cascade without player interaction: randomly assign `STRIPED_HORIZONTAL` (50%) or `STRIPED_VERTICAL` (50%) using the deterministic PRNG.
  - Anchor: The position the player swapped into, or tile index 1 in a cascade.
- **3-in-a-Line (Basic Match):**
  - Any isolated 3-match with no intersection.
  - Generates no special candy; all 3 tiles are marked for destruction.

#### Hierarchy / Precedence Resolution
When multiple patterns overlap (e.g. a 5-line that also intersects a 3-line to form a 7-candy cross):
1. **Priority 1:** 5-in-a-line straight $\rightarrow$ Color Bomb takes priority over Wrapped.
2. **Priority 2:** T/L/Cross $\rightarrow$ Wrapped Candy takes priority over Striped.
3. **Priority 3:** 4-in-a-line straight $\rightarrow$ Striped Candy takes priority over normal match.
4. **Priority 4:** 3-in-a-line basic match.

---

### 2.4 Special Candy Detonation Mechanics (Single Trigger)

When a special candy is matched in a 3-group or hit by an explosion:
1. **Striped Candy (Horizontal):**
   - Clears all tiles in `row r` from `col 0` to `GRID_COLS - 1`.
   - Triggers any special candies located in that row.
2. **Striped Candy (Vertical):**
   - Clears all tiles in `col c` from `row 0` to `GRID_ROWS - 1`.
   - Triggers any special candies located in that column.
3. **Wrapped Candy (Double Blast):**
   - **Phase 1:** Explodes a $3 \times 3$ bounding box centered at `(r, c)`: $[\max(0, r-1) .. \min(R-1, r+1)] \times [\max(0, c-1) .. \min(C-1, c+1)]$.
   - **Phase 2:** The wrapped core drops with gravity until it hits solid ground/settles, then detonates a second $3 \times 3$ blast.
4. **Color Bomb (Swapped with regular candy of Color X):**
   - Detonates and removes the Color Bomb tile.
   - Finds every candy currently on the board where `tile.color === X`.
   - Destroys all of them simultaneously. If any of those candies were special candies (e.g. a striped red candy), their special effects activate upon destruction!

---

### 2.5 Special Candy Combinations (Pairwise Swaps)

When two special candies are directly swapped with each other, standard match-3 color checks are bypassed and an authentic super-combo triggers immediately at the swap locus `(r_swap, c_swap)`:

| Combination | Mechanics & Area of Effect | Authentic Behavior |
| :--- | :--- | :--- |
| **Striped + Striped** | **Cross Blast (+)** | Detonates the entire row `r_swap` AND the entire column `c_swap` simultaneously. Clears $R + C - 1$ tiles (17 tiles on 9x9). |
| **Striped + Wrapped** | **Giant 3x3 Cross Blast** | Clears **3 full rows** (`r_swap - 1`, `r_swap`, `r_swap + 1`) and **3 full columns** (`c_swap - 1`, `c_swap`, `c_swap + 1`) spanning the entire board. Massive board wipe (up to 45 tiles on 9x9). |
| **Wrapped + Wrapped** | **Massive 5x5 Double Explosion** | Phase 1: Detonates a gigantic $5 \times 5$ square area centered at `(r_swap, c_swap)` (clearing up to 25 tiles). Phase 2: Drops and triggers a second $5 \times 5$ explosion after settling. |
| **Color Bomb + Striped** | **Color-Wide Stripe Transmutation & Detonation** | Finds all candies matching the Striped Candy's color. Transforms EVERY one of those candies into a Striped Candy (randomizing horizontal/vertical orientation). Then detonates ALL of them sequentially/simultaneously in a fireworks barrage of row and column beams! |
| **Color Bomb + Wrapped** | **Double-Color Annihilation** | Clears all candies of the Wrapped Candy's color, then picks the next most prevalent color on the board and clears all candies of that second color as well. In alternate King mobile revisions: transforms all candies of that color into Wrapped candies and detonates them. |
| **Color Bomb + Color Bomb**| **Total Board Apocalypse** | Clears EVERY single candy on the entire board ($9 \times 9 = 81$ tiles wiped clean). The entire board clears and refills from the top in a massive cascade. |

---

### 2.6 Cascade Physics, Gravity, Refills, and Reshuffling

The cascade cycle is a discrete, deterministic simulation loop executed synchronously on the authoritative server and replicated on the client:

```
[Player Move / Swap]
        │
        ▼
   [Validate] ──(Invalid)──> [Emit SWAP_REVERT] ──> [Wait for Next Input]
        │
     (Valid)
        ▼
┌─> [Phase 1: Mark & Collect Matches / Detonations]
│       │
│       ▼
│   [Phase 2: Spawn Special Candies at Anchors]
│       │
│       ▼
│   [Phase 3: Destroy Matched & Blasted Tiles]
│       │
│       ▼
│   [Phase 4: Gravity Drop (Column-wise compaction downwards)]
│       │
│       ▼
│   [Phase 5: Spawn Refills at top of columns from Seeded PRNG]
│       │
│       ▼
│   [Phase 6: Check for new matches in updated board]
│       │
└─── (Matches Found? Loop back with combo_multiplier += 1)
        │
    (No Matches)
        ▼
[Check Valid Moves Exist on Board]
   ├── (Valid Moves >= 1) ──> [Cascade Settled, Advance Turn]
   └── (Valid Moves == 0) ──> [Trigger RESHUFFLE Algorithm]
```

#### Gravity Drop Algorithm (Per Column)
For each column $c \in [0, C-1]$:
1. Scan from bottom row $r = R-1$ up to $0$.
2. Maintain a write index `writeRow = R - 1`.
3. For each tile at `(r, c)` that is NOT empty:
   - If `r !== writeRow`, record a drop event `{ id: tile.id, fromRow: r, toRow: writeRow, col: c }` and move `board[writeRow][c] = board[r][c]`.
   - Decrement `writeRow--`.
4. For all remaining rows from `writeRow` up to `0`:
   - Mark as empty space needing refill.
   - For each empty slot from `writeRow` down to `0`, generate a new `Tile` with a new unique `id` and a pseudo-random color chosen via deterministic PRNG.
   - Record a spawn event `{ id: newTile.id, row: emptyRow, col: c, color: newTile.color, type: NORMAL }`.

#### Combo Multiplier & Scoring Formula
- Base tile match: 20 points per tile (3-match = 60 pts, 4-match = 80 pts, 5-match = 100 pts).
- Striped candy blast: 60 pts per tile cleared.
- Wrapped candy explosion: 100 pts per tile cleared.
- Color Bomb trigger: 200 pts per tile cleared.
- Cascade Multiplier:
  $$\text{Step } k \text{ (where } k=1 \text{ is initial move, } k=2 \text{ is cascade 1, etc.)} \implies \text{Score} = \text{BasePoints} \times k$$
- Combo Bonus:
  - Striped + Striped: 1,000 pts
  - Striped + Wrapped: 2,500 pts
  - Wrapped + Wrapped: 3,500 pts
  - Color Bomb + Striped: 3,000 pts
  - Color Bomb + Color Bomb: 5,000 pts

#### Automatic Reshuffle Algorithm (No Valid Moves)
1. **Detection:**
   Scan every cell `(r, c)`. Test swapping with `(r, c+1)` and `(r+1, c)`. If any simulated swap produces a match ($\ge 3$), then `hasValidMoves = true`.
2. **If `hasValidMoves === false`:**
   - Collect all existing candies on the board.
   - Run a deterministic Fisher-Yates shuffle on the board candies until:
     - (a) No 3-matches are pre-formed on the board ($0$ initial matches).
     - (b) At least one valid swap move exists ($> 0$ available moves).
   - Emit a `BOARD_RESHUFFLE` event containing the old-to-new tile coordinate mapping so the front end can play a "Reshuffling!" banner and tile re-arrangement animation.

---

### 2.7 Seeded PRNG & Determinism for Multiplayer

To prevent desynchronization between Node.js server and 1–4 players:
- Use a deterministic 32-bit PRNG (e.g. **Mulberry32** or **SplitMix32**).
- When a room is created, the server generates a room `seed: number`.
- Each turn / cascade step maintains a synchronized `prngState`.
- Any random roll (new candies falling in, cascade stripe direction, Color Bomb + Striped orientations) draws sequentially from this PRNG.
- The server sends the verified sequence of events; clients can also run local prediction / validation using the identical PRNG.

---

### 2.8 Shared Engine State Machine & Event Contracts

The match-3 core engine must be written in platform-agnostic TypeScript/JavaScript (no DOM/Node-specific dependencies) located in a shared directory (e.g. `packages/engine` or `src/shared/engine`).

#### Primary Interfaces

```typescript
export interface Coordinate {
  row: number;
  col: number;
}

export interface PlayerMove {
  playerId: string;
  from: Coordinate;
  to: Coordinate;
}

export type EngineEvent =
  | { type: 'SWAP'; from: Coordinate; to: Coordinate; valid: boolean }
  | { type: 'SWAP_REVERT'; from: Coordinate; to: Coordinate }
  | { 
      type: 'MATCH_FOUND'; 
      step: number;
      tiles: { id: number; row: number; col: number; color: CandyColor }[];
      spawnSpecial?: { id: number; row: number; col: number; type: CandyType; color: CandyColor };
    }
  | {
      type: 'SPECIAL_DETONATE';
      specialType: CandyType;
      origin: Coordinate;
      affectedTiles: { id: number; row: number; col: number }[];
    }
  | {
      type: 'GRAVITY_DROP';
      drops: { id: number; fromRow: number; toRow: number; col: number }[];
    }
  | {
      type: 'REFILL_SPAWN';
      spawns: { id: number; row: number; col: number; color: CandyColor; type: CandyType }[];
    }
  | {
      type: 'CASCADE_STEP_COMPLETE';
      step: number;
      stepScore: number;
      cumulativeScore: number;
    }
  | {
      type: 'BOARD_RESHUFFLE';
      newGrid: Tile[][];
    }
  | {
      type: 'TURN_SETTLE';
      totalTurnScore: number;
      board: Tile[][];
      nextPlayerId: string;
    };

export interface MoveResolution {
  valid: boolean;
  events: EngineEvent[];
  finalBoard: Tile[][];
  turnScore: number;
}
```

---

## 3. Caveats & Edge Cases

1. **Simultaneous Multi-Line Matches:**
   A single move can simultaneously form a horizontal 4-match and an independent vertical 3-match of a different color. The engine must cleanly isolate each color run, create the striped candy for the 4-match, and destroy the 3-match without double-counting tiles.
2. **Double Color Bomb Swap with Obstacles:**
   Color Bomb + Color Bomb wipes 100% of the active board. All tiles must be registered as cleared in a single event, followed by an entire 9x9 refill drop from row 0.
3. **Chain Reaction Detonation:**
   If a Horizontal Striped candy detonates a row that contains a Wrapped Candy and a Vertical Striped candy, those secondary specials must detonate recursively (breadth-first or queue-based activation). A `visited` set of tile IDs prevents infinite loops.
4. **Color Bomb Struck by Blast:**
   If a Color Bomb is NOT swapped by a player, but is hit by a striped beam or wrapped explosion, authentic Candy Crush behavior detonates it by randomly picking one active color currently on the board and clearing all candies of that color.
5. **Turn Hand-off Timing:**
   In multiplayer (R2), the turn timer must not count down while cascade animations are actively playing. The server must only transfer active player control AFTER `TURN_SETTLE` is emitted.

---

## 4. Conclusion & Recommendations for Implementation

1. **Engine Architecture:**
   Construct `Match3Engine` as a pure, side-effect-free TypeScript class. It takes `(board, move, prng)` and returns `{ valid, events, finalBoard, turnScore }`.
   This allows identical unit testing, server-side authoritative execution, and client-side instant visual playback.
2. **Animation Pipeline:**
   The front end should consume `EngineEvent[]` as an async animation queue:
   - `SWAP` $\rightarrow$ tween two tiles (200ms).
   - `MATCH_FOUND` & `SPECIAL_DETONATE` $\rightarrow$ particle blast, scale down & fade out (250ms).
   - `GRAVITY_DROP` & `REFILL_SPAWN` $\rightarrow$ bounce ease-down tween (300ms–400ms).
   - Repeat for each cascade step until `TURN_SETTLE`.
3. **Multiplayer Safety:**
   The server holds the single source of truth. The client sends `{ from, to }`; the server resolves the move, emits the event queue to all 1–4 players via WebSockets, and updates player scores.

---

## 5. Verification Method

To independently verify the engine once implemented:
1. **Unit Test Suite (`npm test`):**
   - `swap_validation.test.ts`: Verify orthogonal adjacency check, valid match swaps, invalid swap reversions, and special candy pair swaps.
   - `match_detection.test.ts`: Test standard 3-matches, 4-in-a-row (horizontal and vertical), T-shapes, L-shapes, and 5-in-a-row straight lines.
   - `special_candies.test.ts`: Verify striped beam line-clearing, wrapped 3x3 double blast, and color bomb board-wide color purge.
   - `combos.test.ts`: Test Striped+Striped (+ cross), Striped+Wrapped (3-line cross), Wrapped+Wrapped (5x5 blast), Color Bomb+Striped (all color become stripes and detonate), and Color Bomb+Color Bomb (total board wipe).
   - `cascade_gravity.test.ts`: Verify column compaction with no floating tiles, deterministic PRNG refills, and multiplier scaling.
   - `reshuffle.test.ts`: Feed a locked board with 0 moves; verify reshuffle event fires and results in a playable board with 0 initial matches and $\ge 1$ move.
