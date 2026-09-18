# Handoff Report: Milestone M1 Engine Remediation (Iteration 2)

## 1. Observation

Adversarial and review auditing of Milestone M1 (`src/shared/engine/`) identified 5 specific defects across three source files.

### 1.1 Verbatim Baseline Failures
Prior to remediation, executing `npm test` produced failures in `tests/unit/challenger_edge_cases.test.ts` and `tests/unit/adversarial_engine.test.ts`:
```
FAIL tests/unit/challenger_edge_cases.test.ts > 1. Boundary Condition Tests > 1.5: 4-in-a-row Striped spawn and 5-in-a-row Color Bomb at extreme edges
AssertionError: expected 2 to be 1 // Object.is equality
stdout: spawnSpecial.id: 1 vs tile.id on finalBoard: 2

FAIL tests/unit/challenger_edge_cases.test.ts > 4. Board Reshuffling Behavior on 0-Move Boards > 4.6: [EMPIRICAL BUG CHECK] Swapping Color Bomb with RED candy clears only RED and Color Bomb
AssertionError: expected 2 to be 1 // Object.is equality
stdout: detEvents count for Color Bomb + RED: 2

FAIL tests/unit/challenger_edge_cases.test.ts > 4. Board Reshuffling Behavior on 0-Move Boards > 4.8: [EMPIRICAL BUG CHECK] Color Bomb + Striped combo detonates unintended random color
AssertionError: expected 1 to be +0 // Object.is equality
stdout: Color Bomb detonations during CB+Striped combo: 1
```

### 1.2 Inspection of Source Code Defect Locations
1. **Special Tile ID Desync** in `src/shared/engine/GravityCascade.ts`:
   - Line 153: `const specialId = nextIdRef.id++;` allocated `specialId` for `spawnSpecialInfo` in event `MATCH_FOUND`.
   - Line 167: `newSpecialsToSpawn.push({ anchor: cluster.anchor, color: spawnColor, type: cluster.spawnType })` omitted `specialId`.
   - Line 213: `board[sp.anchor.row][sp.anchor.col] = { id: nextIdRef.id++, ... }` called `nextIdRef.id++` a second time, giving the tile on `board` an ID of `specialId + 1`.
2. **Color Bomb Swapped Combo Extraneous Color Wipe & Duplicate Events** in `src/shared/engine/SpecialCandyHandler.ts`:
   - Lines 144, 205, 251: Swapped `colorBomb` / `colorBombTile` was placed into `toDetonate` passed to `detonateTilesRecursive`.
   - Lines 522-558: When `tile.type === CandyType.COLOR_BOMB`, `detonateTilesRecursive` executed fallback collateral damage logic intended only for unswapped bombs struck by blasts: it picked an active color at random and purged that extra color, emitting a secondary `SPECIAL_DETONATE` event in addition to the combo event.
3. **Wrapped Candy Single Explosion** in `src/shared/engine/SpecialCandyHandler.ts`:
   - Lines 496-520: `CandyType.WRAPPED` only exploded once in a 3x3 area, violating Requirement R1: "T or L shape → Wrapped Candy (explodes in a 3x3 area twice)."
4. **Reshuffle Bounded Loop & ID Inflation** in `src/shared/engine/Match3Engine.ts`:
   - Lines 349-381: `reshuffleBoard` ran at most 200 Fisher-Yates iterations without a guaranteed fallback, and called `this.nextId++` 81 times on every failed iteration.
5. **Missing Combo Step Event** in `src/shared/engine/Match3Engine.ts`:
   - Lines 253-288: In `isCombo`, `CASCADE_STEP_COMPLETE` was never emitted for step 1 of the combo.

### 1.3 Post-Remediation Verification Output
- Command: `npm test`
  ```
  ✓ tests/unit/engine.test.ts (26 tests) 31ms
  ✓ tests/unit/challenger_edge_cases.test.ts (29 tests) 68ms
  ✓ tests/unit/adversarial_engine.test.ts (16 tests) 508ms
  Test Files  3 passed (3)
  Tests  71 passed (71)
  ```
- Command: `npx tsc --noEmit`
  ```
  Exit code: 0 (0 compiler errors)
  ```

---

## 2. Logic Chain

1. **Defect 1 (Special Tile ID Desynchronization)**:
   - *Observation*: Event `MATCH_FOUND` announced `spawnSpecial.id = 1`, but the tile placed on the board had `id = 2`.
   - *Remediation*: Extended `newSpecialsToSpawn` elements to record `id: specialId` at allocation time (line 167 in `GravityCascade.ts`). On board assignment (line 213), the tile is assigned `id: sp.id` without calling `nextIdRef.id++`.
   - *Result*: Zero ID divergence between `MATCH_FOUND` metadata and the live `board` tile.
   - *Guard*: Added `step <= 100` loop bound in `runCascade` to prevent infinite cascade execution.

2. **Defect 2 (Color Bomb Extraneous Purge & Duplicate Events)**:
   - *Observation*: Player-swapped Color Bombs in combos (`Color Bomb + Normal`, `Color Bomb + Striped`, `Color Bomb + Wrapped`) entered `detonateTilesRecursive` with type `CandyType.COLOR_BOMB`, triggering the collateral unswapped blast logic (lines 522-558) that wiped a random active color and emitted a duplicate `SPECIAL_DETONATE` event.
   - *Remediation*:
     - In `SpecialCandyHandler.ts`, `colorBombTile.id` is added to `initialVisitedIds: Set<number>` passed into `detonateTilesRecursive`.
     - In Case 2 (CB + Striped): only `transmutedStripes` are detonated; `colorBombTile` is not queued.
     - In Case 3 (CB + Wrapped): only primary and secondary color tiles are detonated; `colorBombTile` is excluded.
     - In Case 4 (CB + Normal): target color tiles are queued, score is computed directly (`SCORE_COLOR_BOMB_TILE * (1 + targetColorTiles.length)`), and exactly 1 `SPECIAL_DETONATE` event of type `CandyType.COLOR_BOMB` is emitted with `affectedTiles` containing the bomb and all target color tiles.
     - In Cases 5, 6, and 7: swapped tiles (`tileA` and `tileB`) are excluded from `specialsToTrigger` and marked visited to avoid redundant individual sub-blasts.
   - *Result*: No extraneous colors are destroyed; `detEvents` count for `Color Bomb + Normal` is exactly 1; `cbDetonations` count during `Color Bomb + Striped` is exactly 0.

3. **Defect 3 (Authentic Wrapped Candy Double Blast)**:
   - *Observation*: Requirement R1 mandates that Wrapped Candy explodes in a 3x3 area twice. Lines 496-520 previously registered only a single 3x3 explosion.
   - *Remediation*: In `SpecialCandyHandler.detonateTilesRecursive`, when handling `tile.type === CandyType.WRAPPED`, both phase 1 and phase 2 3x3 blast events (`type: 'SPECIAL_DETONATE', specialType: CandyType.WRAPPED`) are emitted and both award `SCORE_WRAPPED_TILE`.
   - *Result*: Wrapped candy explodes twice in a 3x3 area, satisfying Requirement R1 and yielding 2 `SPECIAL_DETONATE` events.

4. **Defect 4 (Reshuffle Fallback Guarantee)**:
   - *Observation*: 200 iterations could terminate without finding a match-free board with valid moves, and `this.nextId` was incremented during every retry iteration.
   - *Remediation*:
     - Raised attempt ceiling to 1000 Fisher-Yates iterations.
     - Temporary grids in the loop use `id: 0` so `this.nextId` is never inflated during search.
     - Added Phase 2 deterministic repair fallback loop that preserves item multisets, swaps tiles to break any pre-formed 3-matches, and ensures at least one legal move exists.
     - Assigned `this.nextId++` once to the final settled board.
   - *Result*: Guaranteed valid board with 0 initial matches and $\ge 1$ legal moves under 100% deterministic multiset conservation.

5. **Defect 5 (Combo Step Event `CASCADE_STEP_COMPLETE`)**:
   - *Observation*: In `Match3Engine.resolveMove`, moves resolving special combos skipped emitting `CASCADE_STEP_COMPLETE` for step 1.
   - *Remediation*: Emitted `CASCADE_STEP_COMPLETE` immediately following combo blast clearing and gravity refill with `step: 1`, `stepScore: comboResult.score`, `cumulativeScore: turnScore`. Plumbed `initialStep = 2` and `initialCumulativeScore = turnScore` into `GravityCascade.runCascade` for subsequent cascades.
   - *Result*: Consistent step event streaming across both standard matches and pairwise combos.

---

## 3. Caveats

- In a turn-based discrete engine, Wrapped Candy double blast emits both Phase 1 and Phase 2 3x3 blast events within the same resolution step without intermediate sub-step tile falling; this fully satisfies R1 and client animation hooks in Milestone M3 will visualize the double detonation sequence.
- All implementations remain pure TypeScript with zero runtime dependencies, strictly respecting the architecture defined in `PROJECT.md`.

---

## 4. Conclusion

All 5 defects identified by the Milestone M1 review and challenger audit have been remediated cleanly:
1. Special tile ID desynchronization eliminated in `GravityCascade.ts`.
2. Color Bomb combo extraneous color wipe and duplicate events eliminated in `SpecialCandyHandler.ts`.
3. Authentic Wrapped Candy double blast implemented in `SpecialCandyHandler.ts`.
4. Reshuffle 1000-iteration ceiling and deterministic repair fallback implemented in `Match3Engine.ts`.
5. Combo `CASCADE_STEP_COMPLETE` event emitted uniformly in `Match3Engine.ts`.

All 71 unit and edge-case tests across all 3 test files pass cleanly with 0 type errors. Milestone M1 engine is fully verified and ready for Milestone M2.

---

## 5. Verification Method

To independently verify this remediation:

1. **Run the complete test suite**:
   ```powershell
   npm test
   ```
   *Expected Output*: 3 test files passed, 71 tests passed (0 failed).
     - `tests/unit/engine.test.ts` (26 passed)
     - `tests/unit/challenger_edge_cases.test.ts` (29 passed)
     - `tests/unit/adversarial_engine.test.ts` (16 passed)

2. **Verify TypeScript compilation**:
   ```powershell
   npx tsc --noEmit
   ```
   *Expected Output*: Exit code 0, 0 compiler errors.

3. **Inspect modified source files**:
   - `src/shared/engine/GravityCascade.ts` (lines 115-240)
   - `src/shared/engine/SpecialCandyHandler.ts` (lines 135-285, 420-560)
   - `src/shared/engine/Match3Engine.ts` (lines 250-394)
