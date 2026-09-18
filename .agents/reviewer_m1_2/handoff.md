# Handoff Report: Milestone M1 (Core Match-3 Engine) Review & Adversarial Audit

## 1. Observation

### Verification Commands & Results
- **Command**: `npm test`
  - Output: `✓ tests/unit/engine.test.ts (22 tests) 20ms. Test Files: 1 passed (1), Tests: 22 passed (22). Duration: 766ms.`
  - Exit Code: `0`
- **Command**: `npx tsc --noEmit`
  - Output: Empty stdout/stderr.
  - Exit Code: `0`

### Code Observations & Verbatim Quotations

1. **Special Candy ID Desynchronization**:
   In `src/shared/engine/GravityCascade.ts`, lines 152-166 and 212-219:
   ```ts
   152: if (cluster.spawnType) {
   153:   const specialId = nextIdRef.id++;
   ...
   159:   spawnSpecialInfo = {
   160:     id: specialId,
   161:     row: cluster.anchor.row,
   162:     col: cluster.anchor.col,
   163:     type: cluster.spawnType,
   164:     color: spawnColor
   165:   };
   ...
   212: for (const sp of newSpecialsToSpawn) {
   213:   board[sp.anchor.row][sp.anchor.col] = {
   214:     id: nextIdRef.id++,
   215:     row: sp.anchor.row,
   216:     col: sp.anchor.col,
   217:     color: sp.color,
   218:     type: sp.type
   219:   };
   ```
   `nextIdRef.id++` is invoked at line 153 when populating `spawnSpecialInfo` for `MATCH_FOUND`, and then invoked a second time at line 213 when assigning the tile instance to the board.

2. **Swapped Color Bomb Erroneously Detonates Random 2nd Color**:
   In `src/shared/engine/SpecialCandyHandler.ts`, lines 241-263:
   ```ts
   241: if (
   242:   tileA.type === CandyType.COLOR_BOMB ||
   243:   tileB.type === CandyType.COLOR_BOMB
   244: ) {
   245:   const colorBomb = tileA.type === CandyType.COLOR_BOMB ? tileA : tileB;
   246:   const regularCandy = tileA.type === CandyType.COLOR_BOMB ? tileB : tileA;
   247:   const targetColor = regularCandy.color;
   248: 
   249:   addCoord(colorBomb.row, colorBomb.col);
   250:   const toDetonate: Tile[] = [colorBomb];
   ...
   263:   const secondaryResult = this.detonateTilesRecursive(board, toDetonate, prng);
   ```
   Combined with lines 521-558 of `SpecialCandyHandler.ts`:
   ```ts
   521: } else if (tile.type === CandyType.COLOR_BOMB) {
   522:   score += SCORE_COLOR_BOMB_TILE;
   523:   // If struck by blast (not swapped), pick random active color on board
   524:   const activeColors = new Set<CandyColor>();
   ...
   535:   const chosenColor =
   536:     colorList.length > 0 ? prng.choice(colorList) : CandyColor.RED;
   ...
   543:       if (cand && cand.color === chosenColor) {
   544:         markCoord(r, c);
   545:         colorBombAffected.push({ id: cand.id, row: cand.row, col: cand.col });
   ```
   The swapped Color Bomb is passed as element 0 in `toDetonate` into `detonateTilesRecursive`, triggering line 521 (which was explicitly commented as intended only for unswapped color bombs struck by blast), causing it to pick a random second color and wipe that color as well.

3. **Striped/Wrapped Combos Triggering Duplicate Secondary Blasts**:
   In `src/shared/engine/SpecialCandyHandler.ts`, lines 288-304:
   ```ts
   288: if (isStriped(tileA) && isStriped(tileB)) {
   ...
   294:   for (let c = 0; c < cols; c++) addCoord(r_swap, c);
   295:   for (let r = 0; r < rows; r++) addCoord(r, c_swap);
   ...
   298:   affectedMap.forEach((coord) => {
   299:     const tile = board[coord.row][coord.col];
   300:     if (tile) toDetonate.push(tile);
   301:   });
   ...
   303:   const secondaryResult = this.detonateTilesRecursive(board, toDetonate, prng);
   ```
   `toDetonate` contains `tileA` and `tileB` with their original `type: CandyType.STRIPED_...`. When `detonateTilesRecursive` processes them, their individual row/col blasts detonate as secondary explosions. Redundant `SPECIAL_DETONATE` events are emitted for both the combo and the individual tiles.

4. **Reshuffle Termination Without Guarantees**:
   In `src/shared/engine/Match3Engine.ts`, lines 349-381:
   ```ts
   349: while (attempts < 200) {
   350:   attempts++;
   ...
   377:   const preMatches = MatchDetector.detectMatches(newGrid);
   378:   if (preMatches.length === 0 && this.hasValidMoves(newGrid)) {
   379:     break;
   380:   }
   381: }
   ```
   If after 200 Fisher-Yates shuffle attempts no configuration satisfies `preMatches.length === 0 && this.hasValidMoves(newGrid)`, the loop terminates and returns the invalid board without any fallback or error.

5. **Missing Step Complete Event on Special Combos**:
   In `src/shared/engine/Match3Engine.ts`, lines 253-288:
   `isCombo` calls `resolveSpecialCombo` and `applyGravityAndRefill` directly, but never emits a `CASCADE_STEP_COMPLETE` event for step 1.

6. **Non-Deterministic Fallback in MatchDetector**:
   In `src/shared/engine/MatchDetector.ts`, lines 247 and 282:
   ```ts
   spawnType = (prng ? prng.next() < 0.5 : Math.random() < 0.5)
   ```
   Invokes `Math.random()` when `prng` is omitted.

---

## 2. Logic Chain

1. **Integrity Audit**: Verified that source code in `src/shared/` contains no hardcoded test tables, dummy stubs, or bypasses. All algorithms (sweeps, compaction, Mulberry32 PRNG) are genuine implementations. No integrity violation is present.
2. **Special Candy ID Desync (Finding 1)**:
   - When a match creates a special candy, `nextIdRef.id++` runs in `GravityCascade.ts:153` producing ID $K$.
   - Then at line 213, `nextIdRef.id++` runs again, creating the actual tile with ID $K+1$.
   - The event `MATCH_FOUND` announces `spawnSpecial` with ID $K$.
   - When that tile drops in gravity or explodes in cascades, subsequent events refer to ID $K+1$.
   - The client sprite tracker will lose track of the tile, causing missing drop animations or desynchronization in Milestones M2 and M3.
3. **Color Bomb Multi-Purge Defect (Finding 2)**:
   - Swapping a Color Bomb with a Normal Candy (e.g. Red) should ONLY purge Red candies.
   - Because `colorBomb` is passed in `toDetonate` to `detonateTilesRecursive`, line 521 executes.
   - Line 521 picks a random active color from the board (e.g. Yellow) and clears Yellow candies in addition to Red candies.
   - This corrupts game balance and violates authentic Candy Crush rules.
4. **Combo Blast Duplication (Finding 3)**:
   - When Striped+Striped is swapped, a cross beam (+) is created.
   - Because both swapped tiles are in `toDetonate`, `detonateTilesRecursive` executes their individual line blasts in addition to the cross beam.
   - If the swap was vertical, `tileB` at the `from` row also clears its row, turning the cross (+) into a T-shape or double-row blast.
   - Redundant duplicate `SPECIAL_DETONATE` events are emitted.
5. **Reshuffle Bounded Loop (Finding 4)**:
   - On a 9x9 grid with 6 colors, a random permutation has roughly $e^{-3.5} \approx 3.0\%$ chance of having zero 3-matches.
   - In 200 random Fisher-Yates shuffles, $(1 - 0.03)^{200} \approx 0.22\%$ of runs fail to find a match-free board.
   - When this happens, `reshuffleBoard` returns a board with active matches or zero valid moves, potentially hanging turn progression.
6. **Verdict Deduction**:
   - Because Findings 1 and 2 directly break tile tracking and core game mechanics, the verdict cannot be APPROVE. The required verdict is **REQUEST_CHANGES**.

---

## 3. Review Findings & Challenges

### Review Summary
**Verdict**: REQUEST_CHANGES

### Findings

#### [Critical] Finding 1: Special Candy ID Desynchronization
- **What**: Newly spawned special candies get two different IDs: ID $K$ in `MATCH_FOUND.spawnSpecial` and ID $K+1$ on `board`.
- **Where**: `src/shared/engine/GravityCascade.ts:153`, `src/shared/engine/GravityCascade.ts:213`
- **Why**: Breaks client sprite animation mapping and server state tracking across cascades.
- **Suggestion**: Pass `specialId` into `newSpecialsToSpawn` and assign `board[sp.anchor.row][sp.anchor.col] = { id: sp.id, ... }` without re-incrementing `nextIdRef.id++`.

#### [Critical] Finding 2: Swapped Color Bomb Erroneously Detonates a Random Second Color
- **What**: Swapping Color Bomb with a regular candy clears the target color PLUS an unintended random second color.
- **Where**: `src/shared/engine/SpecialCandyHandler.ts:241-263`, `src/shared/engine/SpecialCandyHandler.ts:521-558`
- **Why**: `colorBomb` is passed into `detonateTilesRecursive`, triggering the unswapped blast handler which chooses an additional random color via PRNG.
- **Suggestion**: Do not pass `colorBomb` into `detonateTilesRecursive` as an active `CandyType.COLOR_BOMB`. Clear its position directly or change its type to `NORMAL` before passing into `toDetonate`.

#### [Major] Finding 3: Striped & Wrapped Combos Trigger Redundant Sub-Blasts and Duplicate Events
- **What**: Swapped special candies in combos detonate their individual powers on top of the combo zone, clearing extra rows/cols and duplicating `SPECIAL_DETONATE` events.
- **Where**: `src/shared/engine/SpecialCandyHandler.ts:288-304, 334-360, 386-400`
- **Why**: `tileA` and `tileB` are placed into `toDetonate` with special types intact.
- **Suggestion**: Mark `tileA.id` and `tileB.id` as visited before invoking `detonateTilesRecursive`, or set their types to `NORMAL` in `toDetonate`.

#### [Major] Finding 4: Reshuffle Lacks Guaranteed Valid Board Fallback
- **What**: 200 Fisher-Yates attempts can fail (~0.2% probability) to find a match-free board with valid moves, returning an illegal board.
- **Where**: `src/shared/engine/Match3Engine.ts:349-381`
- **Why**: No fallback algorithm if the 200-attempt limit is reached.
- **Suggestion**: Increase iteration ceiling (e.g. 1000) or provide a deterministic swap fallback to eliminate matching runs if random shuffling does not settle.

#### [Minor] Finding 5: Missing `CASCADE_STEP_COMPLETE` Event on Special Combos
- **What**: Special combo moves skip emitting `CASCADE_STEP_COMPLETE` for step 1.
- **Where**: `src/shared/engine/Match3Engine.ts:253-288`
- **Suggestion**: Emit `CASCADE_STEP_COMPLETE` for the combo step so event streaming is uniform across all move types.

#### [Minor] Finding 6: Non-Deterministic Fallback via `Math.random()`
- **What**: `MatchDetector.ts:247, 282` falls back to `Math.random()` when `prng` is undefined.
- **Suggestion**: Default to a constant (e.g. `STRIPED_HORIZONTAL`) when `prng` is not supplied.

---

## 4. Caveats
- No caveats. All 5 core source files in `src/shared/` and the unit test suite in `tests/unit/` were fully analyzed line-by-line.

---

## 5. Conclusion
The Match-3 engine implementation is well-structured, written in pure TypeScript with zero runtime dependencies, and successfully passes Vitest unit tests and TypeScript compilation. However, adversarial inspection identified two Critical bugs (Tile ID desynchronization on special spawn, and Color Bomb purging an extraneous second color) and two Major bugs (redundant combo blasts and unbounded reshuffle failure) that must be remediated before Milestone M1 can be approved.

**Verdict: REQUEST_CHANGES**

---

## 6. Verification Method
1. Run `npm test` from project root to verify unit tests.
2. Run `npx tsc --noEmit` from project root to verify type correctness.
3. Invalidation condition: If `newSpecialsToSpawn` preserves `specialId` and `SpecialCandyHandler` prevents swapped Color Bombs from triggering line 521, these findings will be resolved.
