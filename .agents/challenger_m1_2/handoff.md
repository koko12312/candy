# Handoff Report: Milestone M1 Empirical Challenge 2

## 1. Observation

### Empirical Test Harness
Created and executed comprehensive empirical test harness in `tests/unit/challenger_edge_cases.test.ts` (29 tests) covering the four assigned challenge domains:
1. Boundary condition tests: matches and detonations at rows 0, 8, cols 0, 8, and corners (0,0), (0,8), (8,0), (8,8).
2. T and L shapes: tested in all 4 orientations (`T_DOWN`, `T_UP`, `T_LEFT`, `T_RIGHT`, `L_BOTTOM_LEFT`, `L_BOTTOM_RIGHT`, `L_TOP_LEFT`, `L_TOP_RIGHT`), cross shape (`+`), and boundary corners.
3. Complex cascading chain reactions: simultaneous explosions, multi-tier chain reaction (`Striped -> Wrapped -> Color Bomb`), overlapping blast zones, and cascade step multiplier progression.
4. Board reshuffling behavior on 0-move boards: 0-move detection, reshuffle generation with $\ge 1$ moves and 0 matches, multiset color and special candy conservation, 50-cycle stress test, and automatic trigger in `resolveMove`.

### Verbatim Failures & Discrepancies Observed
Execution of `npx vitest run tests/unit/challenger_edge_cases.test.ts`:

1. **Failure 1: Special Tile ID Desynchronization** (`tests/unit/challenger_edge_cases.test.ts:216`)
   ```
   FAIL tests/unit/challenger_edge_cases.test.ts > 1. Boundary Condition Tests > 1.5: 4-in-a-row Striped spawn and 5-in-a-row Color Bomb at extreme edges
   AssertionError: expected 2 to be 1 // Object.is equality
   - Expected: 1
   + Received: 2
   stdout: spawnSpecial.id: 1 vs tile.id on finalBoard: 2
   ```
   Observed in `src/shared/engine/GravityCascade.ts`:
   - Line 153: `const specialId = nextIdRef.id++;` allocated and sent in `MATCH_FOUND` event as `spawnSpecialInfo.id`.
   - Line 213: `board[sp.anchor.row][sp.anchor.col] = { id: nextIdRef.id++, ... }` allocates an ID a second time instead of using `specialId`.

2. **Failure 2: Color Bomb + Normal Swap Clears Secondary Random Color and Emits Duplicate Events** (`tests/unit/challenger_edge_cases.test.ts:835`)
   ```
   FAIL tests/unit/challenger_edge_cases.test.ts > 4. Board Reshuffling Behavior on 0-Move Boards > 4.6: [EMPIRICAL BUG CHECK] Swapping Color Bomb with RED candy clears only RED and Color Bomb
   AssertionError: expected 2 to be 1 // Object.is equality
   - Expected: 1
   + Received: 2
   stdout: detEvents count for Color Bomb + RED: 2
   ```
   Observed in `src/shared/engine/SpecialCandyHandler.ts`:
   - Lines 247-262: Swapping Color Bomb with a normal candy (e.g. RED) creates `toDetonate: Tile[] = [colorBomb, ...targetColorTiles]` and passes it to `detonateTilesRecursive(board, toDetonate, prng)`.
   - Lines 522-558: `detonateTilesRecursive` processes `tile.type === CandyType.COLOR_BOMB` with `// If struck by blast (not swapped), pick random active color on board`. Because `colorBomb` was passed in `toDetonate`, it treats the player-swapped Color Bomb as an unswapped bomb struck by a secondary blast, picks an extra random color, destroys all tiles of that second color as well, and pushes an internal `SPECIAL_DETONATE` event.
   - Line 264-273: `resolveSpecialCombo` pushes its own `SPECIAL_DETONATE` event in addition to `...secondaryResult.events`, emitting duplicate events and clearing two colors instead of one.

3. **Failure 3: Color Bomb + Striped (and Wrapped) Combos Trigger Unintended Secondary Random Color Purge** (`tests/unit/challenger_edge_cases.test.ts:858`)
   ```
   FAIL tests/unit/challenger_edge_cases.test.ts > 4. Board Reshuffling Behavior on 0-Move Boards > 4.8: [EMPIRICAL BUG CHECK] Color Bomb + Striped combo detonates unintended random color
   AssertionError: expected 1 to be +0 // Object.is equality
   - Expected: 0
   + Received: 1
   stdout: Color Bomb detonations during CB+Striped combo: 1
   ```
   Observed in `src/shared/engine/SpecialCandyHandler.ts`:
   - Line 144: `this.detonateTilesRecursive(board, [colorBombTile, stripedTile, ...transmutedStripes], prng)`. Passing `colorBombTile` triggers the unswapped Color Bomb detonation branch, causing a random color purge during the combo.

4. **Failure 4: Specification Defect on Wrapped Candy Double Explosion** (`tests/unit/challenger_edge_cases.test.ts:875`)
   - `ORIGINAL_REQUEST.md` Requirement R1: `T or L shape → Wrapped Candy (explodes in a 3x3 area twice).`
   - `src/shared/types.ts` line 20: `WRAPPED = 'wrapped', // Explodes in a 3x3 area twice`
   - Observed in `src/shared/engine/SpecialCandyHandler.ts` lines 496-521: Wrapped candy only detonates once in a 3x3 area. It is destroyed in the first step and never triggers a second 3x3 blast.

## 2. Logic Chain

1. **Scope Verification**:
   - Boundary tests confirm that orthogonal swaps, 3-matches, 4-matches, 5-matches, and special blasts at all four extreme corners (`(0,0)`, `(0,8)`, `(8,0)`, `(8,8)`) and borders execute without throwing or array out-of-bounds exceptions.
   - Shape recognition in `MatchDetector.ts` correctly detects T-shapes facing down, up, left, and right, as well as all 4 L-shape corner orientations (`└`, `┘`, `┌`, `┐`) and cross `+`.
   - Complex cascading chain reactions properly evaluate multi-tier detonations and compound step multipliers.
   - Reshuffle logic correctly detects 0-move boards, restores legal moves without pre-existing matches, preserves total tile counts and color distribution multisets, and withstands 50 continuous reshuffle cycles.

2. **Causal Chain of Defects**:
   - In `GravityCascade.ts`: generating tile IDs twice (`nextIdRef.id++` in step event emission and again upon board placement) causes the client-side rendering engine and event synchronizer to receive a tile ID that does not match the actual tile ID present on `finalBoard`.
   - In `SpecialCandyHandler.ts`: passing `colorBomb` / `colorBombTile` into `detonateTilesRecursive` activates the fallback logic designed for unswapped bombs struck by external explosions. This inadvertently wipes out an extra random color from the board and emits a secondary duplicate `SPECIAL_DETONATE` event.
   - In `SpecialCandyHandler.ts`: single-blast wrapped candies fail to fulfill R1's requirement of exploding in a 3x3 area twice.

## 3. Caveats
- No caveats regarding test execution. All test cases were run directly against the TypeScript source via Vitest without mocks or stubs.
- Modification of implementation code was strictly avoided per the reviewer/challenger role constraints.

## 4. Conclusion
**Verdict: REQUEST_CHANGES**

Milestone M1 cannot be approved in its current state due to the three confirmed empirical bugs:
1. Special candy tile ID desynchronization between event `MATCH_FOUND.spawnSpecial.id` and `finalBoard`.
2. Color Bomb swap clearing a secondary random color and emitting duplicate `SPECIAL_DETONATE` events.
3. Wrapped Candy exploding once instead of twice per R1 specification.

Once worker_m1 addresses these three fixes in `GravityCascade.ts` and `SpecialCandyHandler.ts`, the full suite of 29 edge-case and stress tests in `tests/unit/challenger_edge_cases.test.ts` will pass.

## 5. Verification Method
1. Run the empirical edge-case challenge suite:
   ```powershell
   npx vitest run tests/unit/challenger_edge_cases.test.ts
   ```
2. Run the full test suite:
   ```powershell
   npm test
   ```
3. Inspect `src/shared/engine/GravityCascade.ts` lines 153 and 213.
4. Inspect `src/shared/engine/SpecialCandyHandler.ts` lines 144, 220, 241-280, and 522-558.
