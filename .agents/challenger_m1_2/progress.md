# Progress — Challenger M1-2

- Last visited: 2026-09-17T10:10:00Z
- Status: Completed empirical challenge suite for Milestone M1.
- Test suite executed: `tests/unit/challenger_edge_cases.test.ts` (29 empirical tests).
- Results:
  - Boundary conditions: Verified at all 4 corners and board edges.
  - T & L shapes: Verified in all 4 orientations, cross, and corners.
  - Cascades & simultaneous explosions: Verified.
  - Board reshuffling: Verified (0-move detection, conservation, 50-cycle stress).
- Critical Bugs Found Empirically:
  1. Tile ID desync between `MATCH_FOUND.spawnSpecial.id` and `finalBoard` in `GravityCascade.ts`.
  2. Color Bomb + Normal swap wipes two colors and emits duplicate `SPECIAL_DETONATE` events in `SpecialCandyHandler.ts`.
  3. Color Bomb + Striped / Wrapped combos wipe unintended extra random color.
  4. Wrapped Candy explodes only once instead of twice per R1 specification.
- Verdict: REQUEST_CHANGES

