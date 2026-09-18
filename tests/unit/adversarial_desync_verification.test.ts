import { describe, it, expect, beforeEach } from 'vitest';
import { CandyColor, CandyType, Coordinate, PlayerMove, Tile } from '../../src/shared/types';
import { GRID_COLS, GRID_ROWS } from '../../src/shared/constants';
import { PRNG } from '../../src/shared/prng';
import { Match3Engine } from '../../src/shared/engine/Match3Engine';
import { MatchDetector } from '../../src/shared/engine/MatchDetector';

describe('Adversarial Desync & Tile ID Continuity Verification (100+ Moves)', () => {
  let engine: Match3Engine;

  beforeEach(() => {
    engine = new Match3Engine();
  });

  /**
   * Helper to find all currently valid orthogonal moves on a board.
   */
  function findAllValidMoves(board: Tile[][]): { from: Coordinate; to: Coordinate }[] {
    const validMoves: { from: Coordinate; to: Coordinate }[] = [];
    const dirs = [
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 }
    ];
    const probeEngine = new Match3Engine();

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        for (const { dr, dc } of dirs) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < GRID_ROWS && nc < GRID_COLS) {
            // Test swap legality on a clone
            const clone = Match3Engine.cloneBoard(board);
            const move: PlayerMove = {
              playerId: 'validator',
              from: { row: r, col: c },
              to: { row: nr, col: nc }
            };
            const sim = probeEngine.resolveMove(clone, move, new PRNG(99999));
            if (sim.valid) {
              validMoves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
            }
          }
        }
      }
    }
    return validMoves;
  }

  it('verifies ZERO board desync, ZERO duplicate events, and ZERO unexpected tile ID jumps across 100 moves', () => {
    const masterPrng = new PRNG(424242);
    let totalMovesExecuted = 0;
    let totalValidMoves = 0;
    let totalInvalidMoves = 0;
    let totalCascadesChecked = 0;
    let totalReshufflesChecked = 0;

    // We will run 10 independent game sessions of 10 moves each = 100 moves total
    for (let game = 0; game < 10; game++) {
      const gameSeed = masterPrng.nextInt(1, 999999);
      const gameEngine = new Match3Engine();
      let currentBoard = gameEngine.createInitialBoard(gameSeed);
      const gamePrng = new PRNG(masterPrng.nextInt(1, 999999));

      // Set to track all tile IDs that have ever existed in this game session
      const existingTileIds = new Set<number>();
      const destroyedTileIds = new Set<number>();

      // Record initial 81 tiles
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const tile = currentBoard[r][c];
          expect(existingTileIds.has(tile.id)).toBe(false);
          existingTileIds.add(tile.id);
        }
      }

      for (let moveIdx = 0; moveIdx < 10; moveIdx++) {
        totalMovesExecuted++;
        const boardBefore = Match3Engine.cloneBoard(currentBoard);

        // 70% chance to pick a verified legal move (to trigger cascades/specials),
        // 30% chance to pick a random swap (including invalid moves)
        let move: PlayerMove;
        const validMoves = findAllValidMoves(currentBoard);

        if (validMoves.length > 0 && gamePrng.next() < 0.7) {
          const chosen = gamePrng.choice(validMoves);
          move = { playerId: `player_${game}`, from: chosen.from, to: chosen.to };
        } else {
          // Random adjacent swap
          const r1 = gamePrng.nextInt(0, GRID_ROWS - 1);
          const c1 = gamePrng.nextInt(0, GRID_COLS - 1);
          const dirs = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1]
          ];
          const [dr, dc] = gamePrng.choice(dirs);
          const r2 = Math.max(0, Math.min(GRID_ROWS - 1, r1 + dr));
          const c2 = Math.max(0, Math.min(GRID_COLS - 1, c1 + dc));
          move = { playerId: `player_${game}`, from: { row: r1, col: c1 }, to: { row: r2, col: c2 } };
        }

        const startNextId = (gameEngine as any).nextId as number;
        const result = gameEngine.resolveMove(currentBoard, move, gamePrng);
        const endNextId = (gameEngine as any).nextId as number;

        // =====================================================================
        // INVARIANT CHECK 1: ZERO BOARD DESYNC
        // =====================================================================
        expect(result.finalBoard.length).toBe(GRID_ROWS);
        expect(result.finalBoard[0].length).toBe(GRID_COLS);

        // Every cell must be defined, non-null, valid coords
        const finalBoardIds = new Set<number>();
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            const tile = result.finalBoard[r][c];
            expect(tile).toBeDefined();
            expect(tile).not.toBeNull();
            if (tile.type === CandyType.COLOR_BOMB) {
              expect(tile.color).toBe(CandyColor.NONE);
            } else {
              expect(tile.color).toBeGreaterThanOrEqual(0);
              expect(tile.color).toBeLessThanOrEqual(5);
            }

            // Zero duplicate IDs on the board at any single moment
            expect(finalBoardIds.has(tile.id)).toBe(false);
            finalBoardIds.add(tile.id);
          }
        }

        // If invalid move: board must be identical to boardBefore
        if (!result.valid) {
          totalInvalidMoves++;
          expect(result.turnScore).toBe(0);
          expect(result.finalBoard).toEqual(boardBefore);
          expect(endNextId).toBe(startNextId); // No ID allocation on invalid move
          continue;
        }

        totalValidMoves++;

        // Verify final board matches TURN_SETTLE board exactly
        const settleEvent = result.events[result.events.length - 1];
        expect(settleEvent.type).toBe('TURN_SETTLE');
        if (settleEvent.type === 'TURN_SETTLE') {
          expect(settleEvent.totalTurnScore).toBe(result.turnScore);
          expect(settleEvent.board).toEqual(result.finalBoard);
        }

        // =====================================================================
        // INVARIANT CHECK 2: ZERO DUPLICATE EVENTS
        // =====================================================================
        // A. Exactly 1 TURN_SETTLE event and it must be last
        const settleEvents = result.events.filter((e) => e.type === 'TURN_SETTLE');
        expect(settleEvents.length).toBe(1);
        expect(result.events[result.events.length - 1].type).toBe('TURN_SETTLE');

        // B. Cascade step indices must be contiguous 1, 2, 3... without duplicates
        const stepEvents = result.events.filter((e) => e.type === 'CASCADE_STEP_COMPLETE');
        const stepIndices = stepEvents.map((e) => (e.type === 'CASCADE_STEP_COMPLETE' ? e.step : 0));
        for (let i = 0; i < stepIndices.length; i++) {
          expect(stepIndices[i]).toBe(i + 1);
        }
        if (stepEvents.length > 1) {
          totalCascadesChecked++;
        }

        // C. No duplicate drops for same tile ID in the same GRAVITY_DROP event
        const dropEvents = result.events.filter((e) => e.type === 'GRAVITY_DROP');
        for (const dropEvent of dropEvents) {
          if (dropEvent.type === 'GRAVITY_DROP') {
            const droppedIds = new Set<number>();
            for (const d of dropEvent.drops) {
              expect(droppedIds.has(d.id)).toBe(false);
              droppedIds.add(d.id);
            }
          }
        }

        // D. No duplicate spawns in the same REFILL_SPAWN event
        const refillEvents = result.events.filter((e) => e.type === 'REFILL_SPAWN');
        for (const refillEvent of refillEvents) {
          if (refillEvent.type === 'REFILL_SPAWN') {
            const spawnedIds = new Set<number>();
            for (const sp of refillEvent.spawns) {
              expect(spawnedIds.has(sp.id)).toBe(false);
              spawnedIds.add(sp.id);
            }
          }
        }

        // =====================================================================
        // INVARIANT CHECK 3: ZERO UNEXPECTED TILE ID JUMPS
        // =====================================================================
        const hasReshuffle = result.events.some((e) => e.type === 'BOARD_RESHUFFLE');
        if (hasReshuffle) {
          totalReshufflesChecked++;
          // Reshuffle resets all 81 tile IDs sequentially
          expect(endNextId).toBeGreaterThanOrEqual(startNextId + 81);
        } else {
          // Track all newly minted tile IDs in this move
          const newlyMintedIds: number[] = [];

          // 1. Spawned specials from MATCH_FOUND
          const matchEvents = result.events.filter((e) => e.type === 'MATCH_FOUND');
          for (const m of matchEvents) {
            if (m.type === 'MATCH_FOUND' && m.spawnSpecial) {
              newlyMintedIds.push(m.spawnSpecial.id);
            }
          }

          // 2. Refilled tiles from REFILL_SPAWN
          for (const ref of refillEvents) {
            if (ref.type === 'REFILL_SPAWN') {
              for (const sp of ref.spawns) {
                newlyMintedIds.push(sp.id);
              }
            }
          }

          // Verify all newly minted IDs are strictly unique
          const mintedSet = new Set(newlyMintedIds);
          expect(mintedSet.size).toBe(newlyMintedIds.length);

          // Verify strictly monotonic ordering and ZERO ID jumps or gaps!
          // Every newly minted ID must be in the exact contiguous range [startNextId, endNextId - 1]
          if (newlyMintedIds.length > 0) {
            const minId = Math.min(...newlyMintedIds);
            const maxId = Math.max(...newlyMintedIds);
            expect(minId).toBe(startNextId);
            expect(maxId).toBe(startNextId + newlyMintedIds.length - 1);
            expect(endNextId).toBe(startNextId + newlyMintedIds.length);
          } else {
            expect(endNextId).toBe(startNextId);
          }

          // Check that no destroyed tile ever reappears on finalBoard
          for (const m of matchEvents) {
            if (m.type === 'MATCH_FOUND') {
              for (const t of m.tiles) {
                // If it wasn't replaced by a special at that exact coordinate
                if (!m.spawnSpecial || m.spawnSpecial.id !== t.id) {
                  destroyedTileIds.add(t.id);
                }
              }
            }
          }
          for (const destroyedId of destroyedTileIds) {
            expect(finalBoardIds.has(destroyedId)).toBe(false);
          }
        }

        // Update currentBoard for the next turn in this game session
        currentBoard = result.finalBoard;
      }
    }

    console.log(
      `Verified 100 moves: ${totalMovesExecuted} total moves (${totalValidMoves} valid, ${totalInvalidMoves} invalid, ${totalCascadesChecked} cascades, ${totalReshufflesChecked} reshuffles)`
    );
    expect(totalMovesExecuted).toBe(100);
    expect(totalValidMoves).toBeGreaterThan(40);
    expect(totalInvalidMoves).toBeGreaterThan(10);
  });

  it('verifies pairwise special combinations produce ZERO desync, ZERO duplicate detonations, and ZERO ID leaks', () => {
    const specialTypes = [
      [CandyType.STRIPED_HORIZONTAL, CandyType.STRIPED_VERTICAL],
      [CandyType.STRIPED_HORIZONTAL, CandyType.WRAPPED],
      [CandyType.WRAPPED, CandyType.WRAPPED],
      [CandyType.COLOR_BOMB, CandyType.STRIPED_HORIZONTAL],
      [CandyType.COLOR_BOMB, CandyType.WRAPPED],
      [CandyType.COLOR_BOMB, CandyType.COLOR_BOMB],
      [CandyType.COLOR_BOMB, CandyType.NORMAL]
    ];

    for (const [typeA, typeB] of specialTypes) {
      const eng = new Match3Engine();
      const board = eng.createInitialBoard(12345);
      const prng = new PRNG(67890);

      const r = 4;
      const c = 4;
      board[r][c].type = typeA;
      board[r][c].color = typeA === CandyType.COLOR_BOMB ? CandyColor.NONE : CandyColor.RED;

      board[r][c + 1].type = typeB;
      board[r][c + 1].color = typeB === CandyType.COLOR_BOMB ? CandyColor.NONE : CandyColor.BLUE;

      const startNextId = (eng as any).nextId as number;
      const move: PlayerMove = {
        playerId: 'special_tester',
        from: { row: r, col: c },
        to: { row: r, col: c + 1 }
      };

      const result = eng.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      // Invariant 1: Board Integrity
      const idsOnBoard = new Set<number>();
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const t = result.finalBoard[row][col];
          expect(t).toBeDefined();
          expect(t.row).toBe(row);
          expect(t.col).toBe(col);
          expect(idsOnBoard.has(t.id)).toBe(false);
          idsOnBoard.add(t.id);
        }
      }

      // Invariant 2: Step 1 CASCADE_STEP_COMPLETE must be emitted for combo
      const stepEvents = result.events.filter((e) => e.type === 'CASCADE_STEP_COMPLETE');
      expect(stepEvents.length).toBeGreaterThanOrEqual(1);
      expect((stepEvents[0] as any).step).toBe(1);

      // Invariant 3: Zero duplicate detonations
      if (typeA === CandyType.COLOR_BOMB && typeB === CandyType.NORMAL) {
        const cbDetonations = result.events.filter((e) => e.type === 'SPECIAL_DETONATE');
        expect(cbDetonations.length).toBe(1);
      }
      if (typeA === CandyType.COLOR_BOMB && typeB === CandyType.STRIPED_HORIZONTAL) {
        const cbDetonations = result.events.filter(
          (e) => e.type === 'SPECIAL_DETONATE' && (e as any).specialType === CandyType.COLOR_BOMB
        );
        expect(cbDetonations.length).toBe(0);
      }

      // Invariant 4: Monotonic ID sequence
      const endNextId = (eng as any).nextId as number;
      expect(endNextId).toBeGreaterThan(startNextId);
    }
  });

  it('verifies reshuffling maintains ZERO board desync, ZERO duplicate events, and EXACT 81 tile ID increment across 20 cycles', () => {
    const eng = new Match3Engine();
    let board = eng.createInitialBoard(999);
    const prng = new PRNG(112233);

    for (let cycle = 0; cycle < 20; cycle++) {
      const startNextId = (eng as any).nextId as number;
      const res = eng.reshuffleBoard(board, prng);
      const endNextId = (eng as any).nextId as number;

      // Invariant 1: Board has 81 valid tiles with zero matches and >=1 moves
      expect(res.newBoard.length).toBe(GRID_ROWS);
      expect(res.newBoard[0].length).toBe(GRID_COLS);
      expect(MatchDetector.detectMatches(res.newBoard).length).toBe(0);
      expect(eng.hasValidMoves(res.newBoard)).toBe(true);

      // Invariant 2: Exactly 1 BOARD_RESHUFFLE event
      expect(res.events.length).toBe(1);
      expect(res.events[0].type).toBe('BOARD_RESHUFFLE');
      if (res.events[0].type === 'BOARD_RESHUFFLE') {
        expect(res.events[0].newGrid).toEqual(res.newBoard);
      }

      // Invariant 3: Exactly 81 IDs assigned consecutively from startNextId to startNextId + 80
      const ids = new Set<number>();
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const t = res.newBoard[r][c];
          expect(t.row).toBe(r);
          expect(t.col).toBe(c);
          expect(ids.has(t.id)).toBe(false);
          ids.add(t.id);
          expect(t.id).toBeGreaterThanOrEqual(startNextId);
          expect(t.id).toBeLessThan(startNextId + 81);
        }
      }
      expect(ids.size).toBe(81);
      expect(endNextId).toBe(startNextId + 81);

      board = res.newBoard;
    }
  });
});

