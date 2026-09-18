# Worker M1 Fix Assignment Dispatch

## 2026-09-17T17:14:00Z
Task: Remediate 5 defects identified by reviewers and challengers:
1. Special Tile ID Desync in `src/shared/engine/GravityCascade.ts`:
   - Special candies currently have `nextIdRef.id++` called twice (line 153 and line 213).
   - Fix: Pass `specialId` into `newSpecialsToSpawn` and place `{ id: sp.id, ... }` on the board without incrementing `nextIdRef.id++` a second time.
2. Color Bomb Swapped Combo Extraneous Color Wipe & Duplicate Events in `src/shared/engine/SpecialCandyHandler.ts`:
   - Swapped Color Bombs (`Color Bomb + Normal`, `Color Bomb + Striped`, `Color Bomb + Wrapped`) are currently passed into `detonateTilesRecursive` with type `CandyType.COLOR_BOMB`, triggering the unswapped blast logic which picks an extra random color and clears it.
   - Fix: Ensure player-swapped Color Bombs do NOT trigger the unswapped random-color blast branch. Only purge the requested color(s) without secondary random purges, and eliminate duplicate `SPECIAL_DETONATE` events.
3. Authentic Wrapped Candy Double Blast in `src/shared/engine/SpecialCandyHandler.ts`:
   - Requirement R1: "Wrapped Candy (explodes in a 3x3 area twice)."
   - Implement authentic behavior where a wrapped explosion triggers its second 3x3 explosion (or registers both phases accurately per the R1 spec).
4. Reshuffle Fallback in `src/shared/engine/Match3Engine.ts`:
   - Ensure `reshuffleBoard` has a deterministic fallback / higher attempt ceiling (e.g. 1000) so it is guaranteed to return a board with 0 pre-formed matches and >=1 legal moves.
5. Combo Step Event:
   - Ensure `CASCADE_STEP_COMPLETE` is emitted consistently across all special combos.
