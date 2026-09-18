# Handoff Report: Challenger 1 - Milestone M1 (Core Match-3 Engine)

## 1. Observation

Adversarial and generative stress testing was conducted against `Match3Engine` and the supporting classes in `src/shared/engine/` using a newly created test suite at `tests/unit/adversarial_engine.test.ts` (16 test cases) in conjunction with `tests/unit/challenger_edge_cases.test.ts`.

### Empirical Findings:
1. **Color Bomb Swaps Annihilate Unselected Extra Random Colors & Emit Duplicate Events**:
   - Location: `src/shared/engine/SpecialCandyHandler.ts`, lines 145, 220, 254 and lines 521–558.
   - When swapping a Color Bomb with a normal candy (e.g. RED), `toDetonate` contains `[colorBomb, ...redCandies]`.
   - In `detonateTilesRecursive`, when `colorBomb` is shifted from the queue, it hits lines 521–558:
     ```typescript
     } else if (tile.type === CandyType.COLOR_BOMB) {
       score += SCORE_COLOR_BOMB_TILE;
       // If struck by blast (not swapped), pick random active color on board
     ```
   - This randomly selects an *unselected active color* (e.g. ORANGE or BLUE), enqueues all candies of that second color, and emits a secondary `SPECIAL_DETONATE` event for that color.
   - Furthermore, lines 264–274 in `SpecialCandyHandler.ts` emit an outer `SPECIAL_DETONATE` event and append `secondaryResult.events`, producing **two duplicate `SPECIAL_DETONATE` events** for a single move and clearing two distinct colors instead of one.
   - The identical issue occurs in **Color Bomb + Striped** (transmutes target color to stripes AND wipes an unintended random color) and **Color Bomb + Wrapped** (clears primary, secondary, AND an unintended 3rd random color).
   - Verbatim test output:
     ```
     [EMPIRICAL FINDING] Color Bomb + Normal Candy emitted 2 SPECIAL_DETONATE events instead of 1.
     [EMPIRICAL FINDING] Color Bomb + Striped contains unintended random-color SPECIAL_DETONATE event: true
     [EMPIRICAL FINDING] Color Bomb + Wrapped contains unintended 3rd random-color SPECIAL_DETONATE event: true
     ```

2. **Spawned Special Candy ID Mismatch Between Event and Board**:
   - Location: `src/shared/engine/GravityCascade.ts`, line 153 vs line 213.
   - At line 153, `spawnSpecialInfo` is created with:
     ```typescript
     const specialId = nextIdRef.id++;
     spawnSpecialInfo = { id: specialId, ... };
     ```
   - Later, at lines 212–219, when placing the special candy on the board, `nextIdRef.id++` is invoked a second time:
     ```typescript
     board[sp.anchor.row][sp.anchor.col] = {
       id: nextIdRef.id++, // <-- Second increment!
       ...
     };
     ```
   - Result: The `MATCH_FOUND` event announces `spawnSpecial.id = X`, but the tile on the final board actually has `id = X + 1`. This breaks client-server entity synchronization and animation mapping.

3. **Wrapped Candy Fails Authenticity Requirement (Only Explodes Once)**:
   - Location: `src/shared/engine/SpecialCandyHandler.ts`, lines 496–520.
   - Requirement R1 (`ORIGINAL_REQUEST.md` line 16) explicitly mandates:
     `T or L shape → Wrapped Candy (explodes in a 3x3 area twice).`
   - In `detonateTilesRecursive`, Wrapped Candy detonates a single 3x3 blast and disappears immediately. No secondary delayed explosion or two-stage blast event is modeled.

4. **Engine Instance Mutable `nextId` State Leaks Across Calls**:
   - Location: `src/shared/engine/Match3Engine.ts`, lines 21, 50, 251, 300, 366.
   - `this.nextId` is an instance field. While `createInitialBoard(seed)` resets `this.nextId = 1`, neither `resolveMove` nor `reshuffleBoard` allows stateless move evaluation. Calling `resolveMove` on a trial/cloned board permanently advances `this.nextId` on the engine instance, causing tile ID desynchronization between any systems (e.g. bot search vs game loop).

---

## 2. Logic Chain

1. **Color Bomb Defect**:
   - Observation: Swapping Color Bomb with RED emits two `SPECIAL_DETONATE` events and destroys all tiles of both RED and a randomly chosen second color.
   - Mechanism: `SpecialCandyHandler.resolveSpecialCombo` passes `colorBomb` into `detonateTilesRecursive`. The comment at line 523 explicitly states that lines 521–558 are meant only for Color Bombs *struck by blast (not swapped)*. Because it was passed into `detonateTilesRecursive`, the engine treats the swapped Color Bomb as if it were an un-swapped bomb struck by collateral damage.
   - Fix: In `resolveSpecialCombo` (Cases 2, 3, and 4), do not pass `colorBomb` or `colorBombTile` into `detonateTilesRecursive` with type `COLOR_BOMB`. Instead, mark its position in `affectedMap` directly and only pass the target tiles to `detonateTilesRecursive`.

2. **Special Candy ID Mismatch**:
   - Observation: Vitest caught `expected 2 to be 1` for `spawnSpecial.id` vs `tile.id`.
   - Mechanism: `GravityCascade.ts` increments `nextIdRef.id++` at line 153 for event metadata, and increments `nextIdRef.id++` at line 213 when writing to `board`.
   - Fix: Pass `specialId` directly in `newSpecialsToSpawn` (`{ anchor, color, type, id: specialId }`) and use that exact `id` when assigning `board[sp.anchor.row][sp.anchor.col]`.

3. **Double Wrapped Blast**:
   - Observation: Wrapped Candy blasts only 1 time in a 3x3 region.
   - Mechanism: Specification R1 requires two 3x3 blasts (typically blast 1 on match, then drops down with gravity, and blast 2 settles before refill). At minimum, the event stream and score must reflect the authentic double 3x3 blast mechanics of Candy Crush Saga.

---

## 3. Caveats

- **Robust Baseline Elements**:
  - `Mulberry32` PRNG determinism is 100% sound. Identical seeds and parallel engines produce bitwise identical event streams and final board configurations across multi-turn sequences.
  - Column compaction and gravity refills in `applyGravityAndRefill` are pure, terminating, and correctly compact columns from bottom to top.
  - Cascade convergence is verified: 50 randomly generated boards and 200 random moves converged with zero infinite loops.
  - Orthogonal swap validation, diagonal swap rejection, self-swap rejection, and out-of-bounds checks are completely solid.
  - Reshuffling locked boards produces boards with 0 pre-existing matches and $\ge 1$ legal moves.

---

## 4. Conclusion

**VERDICT: REQUEST_CHANGES**

Worker M1 must address the following three defects before Milestone M1 can be approved:
1. **Fix Color Bomb Combinations**: Prevent swapped Color Bombs from triggering the collateral random-color blast in `detonateTilesRecursive` and eliminate duplicate `SPECIAL_DETONATE` events in `SpecialCandyHandler.ts`.
2. **Fix Tile ID Consistency in GravityCascade**: Ensure the `id` assigned in `spawnSpecial` matches the tile placed on `board` (eliminate the double `nextIdRef.id++` increment).
3. **Implement Wrapped Candy Double Blast**: Satisfy requirement R1 for wrapped candies (3x3 blast twice).

---

## 5. Verification Method

To independently verify these findings:
1. Run the full test suite:
   ```powershell
   npm test
   ```
   Observe the 3 failing tests identifying the exact Color Bomb double-detonation, tile ID divergence, and wrapped candy single-explosion issues.
2. Verify TypeScript type safety:
   ```powershell
   npx tsc --noEmit
   ```
