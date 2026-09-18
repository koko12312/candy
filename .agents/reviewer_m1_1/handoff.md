# Handoff Report: Milestone M1 Review (Core Match-3 Engine)

## 1. Observation
- Inspected all engine files under `src/shared/`:
  - `types.ts` (113 lines): Defines `Tile`, `CandyColor`, `CandyType`, `EngineEvent`, `MoveResolution`, `MatchCluster`.
  - `constants.ts` (27 lines): Defines grid dimensions (9x9), score constants, combo constants, turn timings.
  - `prng.ts` (55 lines): Deterministic Mulberry32 algorithm with `next()`, `nextInt()`, `choice()`, state serialization.
  - `MatchDetector.ts` (331 lines): 2-pass sweep detection implementing shape hierarchy: 5-in-a-line (`line5` -> `COLOR_BOMB`) > T/L/Cross (`t_l_cross` -> `WRAPPED`) > 4-in-a-line (`line4` -> `STRIPED`) > 3-in-a-line (`line3` -> Normal).
  - `SpecialCandyHandler.ts` (568 lines): Pairwise combos and recursive queue-based detonation.
  - `GravityCascade.ts` (246 lines): Gravity column compaction, deterministic PRNG refill, cascade loop with combo step multipliers.
  - `Match3Engine.ts` (394 lines): Facade with `createInitialBoard`, `isOrthogonal`, `hasValidMoves`, `resolveMove`, and `reshuffleBoard`.
- Executed `npm test`:
  - Vitest v2.1.9 ran 22 unit tests in `tests/unit/engine.test.ts`.
  - Result: 22/22 passed in 19ms.
- Executed `npx tsc --noEmit`:
  - Output: Exited with code 0, 0 compiler errors.
- Verified absence of integrity violations:
  - No hardcoded test outputs or mock seed bypasses.
  - Genuine pure TypeScript implementations with zero runtime dependencies.
- Identified specific code observations:
  1. `src/shared/engine/GravityCascade.ts:153` & `src/shared/engine/GravityCascade.ts:213`:
     - Line 153: `const specialId = nextIdRef.id++;` generates `specialId` and attaches it to `MATCH_FOUND` event: `spawnSpecial = { id: specialId, ... }`.
     - Line 167: `newSpecialsToSpawn.push({ anchor: cluster.anchor, color: spawnColor, type: cluster.spawnType })` omits `specialId`.
     - Line 213: `board[sp.anchor.row][sp.anchor.col] = { id: nextIdRef.id++, ... }` increments `nextIdRef.id` a second time, assigning an ID different from `spawnSpecial.id`.
  2. `src/shared/engine/SpecialCandyHandler.ts:251` & `src/shared/engine/SpecialCandyHandler.ts:521-558`:
     - Case 4 (Color Bomb + Normal Candy): `const toDetonate: Tile[] = [colorBomb];` adds `colorBomb` to `toDetonate` alongside all candies of `targetColor`.
     - Inside `detonateTilesRecursive`, when `colorBomb` is processed from the queue, lines 521-558 (`// If struck by blast (not swapped), pick random active color on board`) execute: it selects a random active color via `prng.choice` and detonates all candies of that second color as well, emitting a second `SPECIAL_DETONATE` event.
  3. `src/shared/engine/GravityCascade.ts:126`:
     - `while (currentClusters.length > 0)` lacks a `MAX_CASCADE_STEPS` guard (e.g. `step <= 100`).

## 2. Logic Chain
1. **Integrity & Conformance**:
   - The engine is a genuine, pure TypeScript implementation adhering to the zero-dependency rule in `src/shared/`.
   - The Mulberry32 PRNG operates deterministically via bitwise 32-bit operations.
   - The shape hierarchy correctly enforces Color Bomb (5-line) > Wrapped (T/L/Cross) > Striped (4-line) > Normal (3-line) through mutually exclusive priority passes with run consumption sets (`usedHRuns`, `usedVRuns`).
2. **Finding 1 (Tile ID Inconsistency)**:
   - When a special candy spawns, client animation controllers (M3) rely on `spawnSpecial.id` from `MATCH_FOUND` to instantiate and track the visual candy sprite.
   - Because `board` receives `id: nextIdRef.id++` (e.g., ID+1), subsequent events (`GRAVITY_DROP` or `SPECIAL_DETONATE`) will reference ID+1 instead of ID.
   - This causes downstream sprite tracking in M3 to fail or orphan tile references.
3. **Finding 2 (Color Bomb Swapping Clears Second Random Color)**:
   - In authentic match-3 rules, swapping a Color Bomb with a normal candy of color C clears only color C.
   - In `SpecialCandyHandler.ts`, passing `colorBomb` into `detonateTilesRecursive` without flagging it as already handled activates the blast-strike fallback branch.
   - This causes a secondary random color to be wiped unpredictably, inflating scores and distorting game state.
4. **Finding 3 (Unbounded Cascade Loop Risk)**:
   - An authoritative game server must be protected against pathological seeds or state deadlocks. A safety bound (`MAX_CASCADE_STEPS = 100`) ensures server threads cannot be stalled.

## 3. Caveats
- Single Wrapped Candy detonation currently executes as a single 3x3 blast rather than a two-phase falling double-blast. This is acceptable for M1 as a turn-based engine baseline, provided it is documented.
- No other engine files or external dependencies were modified during this review.

## 4. Conclusion
**Verdict**: **REQUEST_CHANGES**

### Required Changes:
1. **Fix Tile ID Inconsistency**: In `src/shared/engine/GravityCascade.ts`, store `id: specialId` in `newSpecialsToSpawn` and use `id: sp.id` when instantiating the tile on line 213 (do not call `nextIdRef.id++` twice).
2. **Fix Color Bomb Swap Detonation**: In `src/shared/engine/SpecialCandyHandler.ts` Case 4 (and Cases 2 & 3), prevent the swapped Color Bomb from re-triggering the random-color blast-strike branch inside `detonateTilesRecursive` (e.g., mark `visitedTileIds.add(colorBomb.id)` before queue execution, or pass only target tiles into the queue).
3. **Add Safety Loop Bound**: In `src/shared/engine/GravityCascade.ts`, add a maximum step guard (e.g., `step < 100`) to `while (currentClusters.length > 0)`.

## 5. Verification Method
- Run the test suite:
  ```powershell
  npm test
  ```
  Expected: All existing and new tests pass.
- Run type checker:
  ```powershell
  npx tsc --noEmit
  ```
  Expected: 0 errors.
- Add unit assertions to `tests/unit/engine.test.ts`:
  1. Verify `board[anchor.row][anchor.col].id === spawnSpecial.id` upon special candy creation.
  2. Verify swapping Color Bomb with RED clears only RED candies and does not clear a second random color.
