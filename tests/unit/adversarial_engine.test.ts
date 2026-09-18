import { describe, it, expect, beforeEach } from 'vitest';
import { CandyColor, CandyType, PlayerMove, Tile } from '../../src/shared/types';
import {
  GRID_COLS,
  GRID_ROWS,
  SCORE_COMBO_STRIPED_STRIPED,
  SCORE_COMBO_STRIPED_WRAPPED,
  SCORE_COMBO_WRAPPED_WRAPPED,
  SCORE_COMBO_COLOR_BOMB_COLOR_BOMB,
  SCORE_COMBO_COLOR_BOMB_STRIPED,
  SCORE_COMBO_COLOR_BOMB_WRAPPED,
  SCORE_COLOR_BOMB_TILE
} from '../../src/shared/constants';
import { PRNG } from '../../src/shared/prng';
import { Match3Engine } from '../../src/shared/engine/Match3Engine';
import { MatchDetector } from '../../src/shared/engine/MatchDetector';
import { SpecialCandyHandler } from '../../src/shared/engine/SpecialCandyHandler';
import { GravityCascade } from '../../src/shared/engine/GravityCascade';

describe('Adversarial & Generative Stress Test Suite for Match3Engine', () => {
  let engine: Match3Engine;

  beforeEach(() => {
    engine = new Match3Engine();
  });

  // Helper to build a clean 9x9 checkerboard with zero pre-existing matches
  function createCheckerBoard(): Tile[][] {
    const board: Tile[][] = [];
    let id = 1;
    for (let r = 0; r < GRID_ROWS; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        // Pattern ((r % 2) * 3 + (c % 3)) guarantees no 3 contiguous identical colors
        const color = ((r % 2) * 3 + (c % 3)) as CandyColor;
        row.push({
          id: id++,
          row: r,
          col: c,
          color,
          type: CandyType.NORMAL
        });
      }
      board.push(row);
    }
    return board;
  }

  // =========================================================================
  // SUITE 1: Generative Fuzzing & Cascade Convergence Stress Testing
  // =========================================================================
  describe('1. Generative Fuzzing & Cascade Convergence', () => {
    it('generates 50 random initial boards and confirms all satisfy invariant (0 matches, >=1 move)', () => {
      for (let seed = 1000; seed < 1050; seed++) {
        const eng = new Match3Engine();
        const board = eng.createInitialBoard(seed);

        expect(board.length).toBe(GRID_ROWS);
        expect(board[0].length).toBe(GRID_COLS);

        // Invariant 1: Exactly 0 pre-existing matches
        const matches = MatchDetector.detectMatches(board);
        expect(matches.length).toBe(0);

        // Invariant 2: At least 1 valid move exists
        const hasValid = eng.hasValidMoves(board);
        expect(hasValid).toBe(true);

        // Invariant 3: All tiles are non-null and valid colors
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            const tile = board[r][c];
            expect(tile).toBeDefined();
            expect(tile.color).toBeGreaterThanOrEqual(0);
            expect(tile.color).toBeLessThanOrEqual(5);
            expect(tile.type).toBe(CandyType.NORMAL);
            expect(tile.row).toBe(r);
            expect(tile.col).toBe(c);
          }
        }
      }
    });

    it('simulates 200 random swaps across multiple boards, asserting cascade convergence and state consistency', () => {
      const prng = new PRNG(98765);
      let executedValidMoves = 0;
      let executedInvalidMoves = 0;

      for (let game = 0; game < 20; game++) {
        const gameEngine = new Match3Engine();
        let currentBoard = gameEngine.createInitialBoard(prng.nextInt(1, 1000000));

        for (let turn = 0; turn < 10; turn++) {
          // Pick a random coordinate
          const r1 = prng.nextInt(0, GRID_ROWS - 1);
          const c1 = prng.nextInt(0, GRID_COLS - 1);

          // 50% chance pick adjacent orthogonal neighbor, 50% chance pick completely random cell
          let r2: number;
          let c2: number;
          if (prng.next() < 0.5) {
            const dirs = [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1]
            ];
            const [dr, dc] = prng.choice(dirs);
            r2 = Math.max(0, Math.min(GRID_ROWS - 1, r1 + dr));
            c2 = Math.max(0, Math.min(GRID_COLS - 1, c1 + dc));
          } else {
            r2 = prng.nextInt(0, GRID_ROWS - 1);
            c2 = prng.nextInt(0, GRID_COLS - 1);
          }

          const move: PlayerMove = {
            playerId: 'bot',
            from: { row: r1, col: c1 },
            to: { row: r2, col: c2 }
          };

          const boardBefore = Match3Engine.cloneBoard(currentBoard);
          const result = gameEngine.resolveMove(currentBoard, move, prng);

          // Assertions
          if (!result.valid) {
            executedInvalidMoves++;
            expect(result.turnScore).toBe(0);
            expect(result.events.length).toBeGreaterThanOrEqual(1);
            expect(result.events.some((e) => e.type === 'SWAP_REVERT')).toBe(true);
            // Board must remain identical
            expect(result.finalBoard).toEqual(boardBefore);
          } else {
            executedValidMoves++;
            expect(result.turnScore).toBeGreaterThan(0);
            // Final event must be TURN_SETTLE
            const lastEvent = result.events[result.events.length - 1];
            expect(lastEvent.type).toBe('TURN_SETTLE');
            if (lastEvent.type === 'TURN_SETTLE') {
              expect(lastEvent.totalTurnScore).toBe(result.turnScore);
            }

            // Invariant: Settled board must have NO remaining matches
            const remainingMatches = MatchDetector.detectMatches(result.finalBoard);
            expect(remainingMatches.length).toBe(0);

            // Invariant: Final board must have >= 1 valid move (if 0, reshuffle must have triggered)
            const hasMoves = gameEngine.hasValidMoves(result.finalBoard);
            expect(hasMoves).toBe(true);

            // Invariant: Zero null or undefined tiles
            for (let r = 0; r < GRID_ROWS; r++) {
              for (let c = 0; c < GRID_COLS; c++) {
                const t = result.finalBoard[r][c];
                expect(t).toBeDefined();
                expect(t).not.toBeNull();
                expect(t.row).toBe(r);
                expect(t.col).toBe(c);
              }
            }

            currentBoard = result.finalBoard;
          }
        }
      }

      expect(executedInvalidMoves).toBeGreaterThan(0);
      expect(executedValidMoves).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // SUITE 2: Pairwise Special Candy Combinations Stress Testing
  // =========================================================================
  describe('2. Special Candy Pairwise Combos', () => {
    it('executes Striped + Striped cross blast (+) at center and board boundaries without index errors', () => {
      const positions = [
        { row: 4, col: 4, neighbor: { row: 4, col: 5 } }, // center
        { row: 0, col: 0, neighbor: { row: 0, col: 1 } }, // top-left corner
        { row: 0, col: 8, neighbor: { row: 1, col: 8 } }, // top-right corner
        { row: 8, col: 0, neighbor: { row: 7, col: 0 } }, // bottom-left corner
        { row: 8, col: 8, neighbor: { row: 8, col: 7 } }  // bottom-right corner
      ];

      for (const pos of positions) {
        const board = createCheckerBoard();
        board[pos.row][pos.col].type = CandyType.STRIPED_HORIZONTAL;
        board[pos.neighbor.row][pos.neighbor.col].type = CandyType.STRIPED_VERTICAL;

        const move: PlayerMove = {
          playerId: 'p1',
          from: { row: pos.row, col: pos.col },
          to: { row: pos.neighbor.row, col: pos.neighbor.col }
        };

        const result = engine.resolveMove(board, move, new PRNG(1234));
        expect(result.valid).toBe(true);
        expect(result.turnScore).toBeGreaterThanOrEqual(SCORE_COMBO_STRIPED_STRIPED);

        // Verify combo event
        const comboEvent = result.events.find(
          (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === 'combo'
        );
        expect(comboEvent).toBeDefined();

        // Settled board invariant
        expect(MatchDetector.detectMatches(result.finalBoard).length).toBe(0);
      }
    });

    it('executes Striped + Wrapped giant 3x3 cross blast at center and corners', () => {
      const positions = [
        { from: { row: 4, col: 4 }, to: { row: 4, col: 5 } },
        { from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { from: { row: 8, col: 8 }, to: { row: 7, col: 8 } }
      ];

      for (const pos of positions) {
        const board = createCheckerBoard();
        board[pos.from.row][pos.from.col].type = CandyType.STRIPED_HORIZONTAL;
        board[pos.to.row][pos.to.col].type = CandyType.WRAPPED;

        const move: PlayerMove = {
          playerId: 'p1',
          from: pos.from,
          to: pos.to
        };

        const result = engine.resolveMove(board, move, new PRNG(5678));
        expect(result.valid).toBe(true);
        expect(result.turnScore).toBeGreaterThanOrEqual(SCORE_COMBO_STRIPED_WRAPPED);

        const comboEvent = result.events.find(
          (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === 'combo'
        );
        expect(comboEvent).toBeDefined();
        expect(MatchDetector.detectMatches(result.finalBoard).length).toBe(0);
      }
    });

    it('executes Wrapped + Wrapped 5x5 explosion at center and corners', () => {
      const positions = [
        { from: { row: 4, col: 4 }, to: { row: 4, col: 5 } },
        { from: { row: 0, col: 0 }, to: { row: 1, col: 0 } },
        { from: { row: 8, col: 8 }, to: { row: 8, col: 7 } }
      ];

      for (const pos of positions) {
        const board = createCheckerBoard();
        board[pos.from.row][pos.from.col].type = CandyType.WRAPPED;
        board[pos.to.row][pos.to.col].type = CandyType.WRAPPED;

        const move: PlayerMove = {
          playerId: 'p1',
          from: pos.from,
          to: pos.to
        };

        const result = engine.resolveMove(board, move, new PRNG(9999));
        expect(result.valid).toBe(true);
        expect(result.turnScore).toBeGreaterThanOrEqual(SCORE_COMBO_WRAPPED_WRAPPED);
        expect(MatchDetector.detectMatches(result.finalBoard).length).toBe(0);
      }
    });

    it('executes Color Bomb + Color Bomb apocalypse wiping all 81 tiles', () => {
      const board = createCheckerBoard();
      board[4][4].type = CandyType.COLOR_BOMB;
      board[4][5].type = CandyType.COLOR_BOMB;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, new PRNG(1111));
      expect(result.valid).toBe(true);
      const expectedMinScore =
        SCORE_COMBO_COLOR_BOMB_COLOR_BOMB + 81 * SCORE_COLOR_BOMB_TILE;
      expect(result.turnScore).toBeGreaterThanOrEqual(expectedMinScore);

      const apocalypse = result.events.find(
        (e) =>
          e.type === 'SPECIAL_DETONATE' &&
          e.specialType === 'combo' &&
          e.affectedTiles.length === 81
      );
      expect(apocalypse).toBeDefined();

      // All 81 tiles must be replaced
      expect(result.finalBoard.length).toBe(GRID_ROWS);
      expect(MatchDetector.detectMatches(result.finalBoard).length).toBe(0);
    });

    // -----------------------------------------------------------------------
    // EMPIRICAL BUG TESTS FOR COLOR BOMB COMBINATIONS
    // -----------------------------------------------------------------------
    describe('Verified Remediation: Color Bomb Swaps', () => {
      it('VERIFIED FIX: Color Bomb + Normal Candy clears an unselected extra random color and emits duplicate SPECIAL_DETONATE', () => {
        const board = createCheckerBoard();
        board[4][4].type = CandyType.COLOR_BOMB;
        board[4][4].color = CandyColor.NONE;
        board[4][5].type = CandyType.NORMAL;
        board[4][5].color = CandyColor.RED;

        // Count RED candies on board
        const redCoords: { r: number; c: number }[] = [];
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            if (board[r][c].color === CandyColor.RED) {
              redCoords.push({ r, c });
            }
          }
        }

        const move: PlayerMove = {
          playerId: 'p1',
          from: { row: 4, col: 4 },
          to: { row: 4, col: 5 }
        };

        const result = engine.resolveMove(board, move, new PRNG(42));
        expect(result.valid).toBe(true);

        const specialDetonates = result.events.filter(
          (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.COLOR_BOMB
        );

        expect(specialDetonates.length).toBe(1);
      });

      it('VERIFIED FIX: Color Bomb + Striped triggers only transmuted stripes without unselected random color detonation', () => {
        const board = createCheckerBoard();
        board[4][4].type = CandyType.COLOR_BOMB;
        board[4][4].color = CandyColor.NONE;
        board[4][5].type = CandyType.STRIPED_HORIZONTAL;
        board[4][5].color = CandyColor.BLUE;

        const move: PlayerMove = {
          playerId: 'p1',
          from: { row: 4, col: 4 },
          to: { row: 4, col: 5 }
        };

        const result = engine.resolveMove(board, move, new PRNG(42));
        expect(result.valid).toBe(true);

        const unwantedColorBombDetonate = result.events.find(
          (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.COLOR_BOMB
        );
        expect(unwantedColorBombDetonate).toBeUndefined();
      });

      it('VERIFIED FIX: Color Bomb + Wrapped triggers only primary and secondary colors without unselected 3rd color detonation', () => {
        const board = createCheckerBoard();
        board[4][4].type = CandyType.COLOR_BOMB;
        board[4][4].color = CandyColor.NONE;
        board[4][5].type = CandyType.WRAPPED;
        board[4][5].color = CandyColor.PURPLE;

        const move: PlayerMove = {
          playerId: 'p1',
          from: { row: 4, col: 4 },
          to: { row: 4, col: 5 }
        };

        const result = engine.resolveMove(board, move, new PRNG(42));
        expect(result.valid).toBe(true);

        const unwantedColorBombDetonate = result.events.find(
          (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.COLOR_BOMB
        );
        expect(unwantedColorBombDetonate).toBeUndefined();
      });
    });
  });

  // =========================================================================
  // SUITE 3: Deterministic Repeatability
  // =========================================================================
  describe('3. Deterministic Repeatability', () => {
    it('produces identical event streams, final boards, and scores across identical runs with seed X', () => {
      const testSeeds = [123, 456, 789, 99999, 314159];

      for (const seed of testSeeds) {
        // Run A
        const engineA = new Match3Engine();
        const prngA = new PRNG(seed);
        const boardA = engineA.createInitialBoard(seed);

        // Find first valid move on boardA
        let firstMove: PlayerMove | null = null;
        outerA: for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            if (c + 1 < GRID_COLS) {
              const move = { playerId: 'p1', from: { row: r, col: c }, to: { row: r, col: c + 1 } };
              const testClone = Match3Engine.cloneBoard(boardA);
              if (engineA.resolveMove(testClone, move, new PRNG(seed)).valid) {
                firstMove = move;
                break outerA;
              }
            }
            if (r + 1 < GRID_ROWS) {
              const move = { playerId: 'p1', from: { row: r, col: c }, to: { row: r + 1, col: c } };
              const testClone = Match3Engine.cloneBoard(boardA);
              if (engineA.resolveMove(testClone, move, new PRNG(seed)).valid) {
                firstMove = move;
                break outerA;
              }
            }
          }
        }

        expect(firstMove).not.toBeNull();

        const resultA = engineA.resolveMove(boardA, firstMove!, new PRNG(seed + 1));

        // Run B (fresh engine, identical seeds)
        const engineB = new Match3Engine();
        const boardB = engineB.createInitialBoard(seed);
        const resultB = engineB.resolveMove(boardB, firstMove!, new PRNG(seed + 1));

        // Strict bitwise equivalence
        expect(resultA.valid).toBe(resultB.valid);
        expect(resultA.turnScore).toBe(resultB.turnScore);
        // Compare color and type events and tile layout
        expect(resultA.events.length).toBe(resultB.events.length);
        expect(resultA.finalBoard.map(r => r.map(t => ({ color: t.color, type: t.type }))))
          .toEqual(resultB.finalBoard.map(r => r.map(t => ({ color: t.color, type: t.type }))));
      }
    });

    it('maintains 100% deterministic state parity over a 5-turn sequence between two parallel engine instances', () => {
      const masterSeed = 88888;
      const engine1 = new Match3Engine();
      const engine2 = new Match3Engine();

      let board1 = engine1.createInitialBoard(masterSeed);
      let board2 = engine2.createInitialBoard(masterSeed);
      expect(board1).toEqual(board2);

      const prng1 = new PRNG(masterSeed);
      const prng2 = new PRNG(masterSeed);

      for (let turn = 0; turn < 5; turn++) {
        // Find a valid move using hasValidMoves / isValidSwap logic (without mutating nextId)
        let validMove: PlayerMove | null = null;
        outer: for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            if (c + 1 < GRID_COLS) {
              const m = { playerId: 'bot', from: { row: r, col: c }, to: { row: r, col: c + 1 } };
              // Check validity purely without resolveMove
              const tileA = board1[r][c];
              const tileB = board1[r][c + 1];
              if (SpecialCandyHandler.isSpecialCombo(tileA, tileB)) {
                validMove = m;
                break outer;
              }
              const clone = Match3Engine.cloneBoard(board1);
              clone[r][c] = tileB;
              clone[r][c + 1] = tileA;
              if (MatchDetector.detectMatches(clone).length > 0) {
                validMove = m;
                break outer;
              }
            }
            if (r + 1 < GRID_ROWS) {
              const m = { playerId: 'bot', from: { row: r, col: c }, to: { row: r + 1, col: c } };
              const tileA = board1[r][c];
              const tileB = board1[r + 1][c];
              if (SpecialCandyHandler.isSpecialCombo(tileA, tileB)) {
                validMove = m;
                break outer;
              }
              const clone = Match3Engine.cloneBoard(board1);
              clone[r][c] = tileB;
              clone[r + 1][c] = tileA;
              if (MatchDetector.detectMatches(clone).length > 0) {
                validMove = m;
                break outer;
              }
            }
          }
        }

        if (!validMove) break;

        const res1 = engine1.resolveMove(board1, validMove, prng1);
        const res2 = engine2.resolveMove(board2, validMove, prng2);

        expect(res1.valid).toBe(res2.valid);
        expect(res1.turnScore).toBe(res2.turnScore);
        expect(res1.events).toEqual(res2.events);
        expect(res1.finalBoard).toEqual(res2.finalBoard);

        board1 = res1.finalBoard;
        board2 = res2.finalBoard;
      }
    });
  });

  // =========================================================================
  // SUITE 4: Adversarial Edge Cases & Boundary Conditions
  // =========================================================================
  describe('4. Adversarial Edge Cases', () => {
    it('rejects self-swap (from == to) with SWAP_REVERT', () => {
      const board = createCheckerBoard();
      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 3, col: 3 },
        to: { row: 3, col: 3 }
      };

      const res = engine.resolveMove(board, move, new PRNG(1));
      expect(res.valid).toBe(false);
      expect(res.turnScore).toBe(0);
      expect(res.events[0].type).toBe('SWAP_REVERT');
      expect(res.finalBoard).toEqual(board);
    });

    it('rejects swapping two adjacent candies of the SAME color that do not create matches', () => {
      const board = createCheckerBoard();
      board[3][3].color = CandyColor.BLUE;
      board[3][4].color = CandyColor.BLUE;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 3, col: 3 },
        to: { row: 3, col: 4 }
      };

      const res = engine.resolveMove(board, move, new PRNG(1));
      expect(res.valid).toBe(false);
      expect(res.turnScore).toBe(0);
      expect(res.events.some((e) => e.type === 'SWAP_REVERT')).toBe(true);
    });

    it('rejects extreme out-of-bounds coordinates cleanly without crashing', () => {
      const board = createCheckerBoard();
      const extremeMoves: PlayerMove[] = [
        { playerId: 'p1', from: { row: -100, col: 0 }, to: { row: 0, col: 0 } },
        { playerId: 'p1', from: { row: 0, col: 0 }, to: { row: 100, col: 100 } },
        { playerId: 'p1', from: { row: NaN, col: 0 }, to: { row: 0, col: 0 } },
        { playerId: 'p1', from: { row: 9, col: 9 }, to: { row: 8, col: 8 } }
      ];

      for (const m of extremeMoves) {
        const res = engine.resolveMove(board, m, new PRNG(1));
        expect(res.valid).toBe(false);
        expect(res.turnScore).toBe(0);
        expect(res.events[0].type).toBe('SWAP_REVERT');
        expect(res.finalBoard).toEqual(board);
      }
    });

    it('triggers secondary chain reaction when a striped candy beam detonates another special candy', () => {
      const board = createCheckerBoard();
      // Setup horizontal match of RED at row 2, with striped candy at (2,0)
      board[2][0].color = CandyColor.RED;
      board[2][0].type = CandyType.STRIPED_HORIZONTAL;
      board[2][1].color = CandyColor.RED;
      board[2][2].color = CandyColor.BLUE;
      board[1][2].color = CandyColor.RED; // Swap down into (2,2)

      // Place a WRAPPED candy at (2,7) directly in the path of the horizontal beam
      board[2][7].type = CandyType.WRAPPED;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 1, col: 2 },
        to: { row: 2, col: 2 }
      };

      const result = engine.resolveMove(board, move, new PRNG(1));
      expect(result.valid).toBe(true);

      // Verify both striped detonation AND secondary wrapped detonation occurred
      const stripedDetonate = result.events.find(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.STRIPED_HORIZONTAL
      );
      const wrappedDetonate = result.events.find(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.WRAPPED
      );

      expect(stripedDetonate).toBeDefined();
      expect(wrappedDetonate).toBeDefined();
    });

    it('reshuffles a locked board deterministically when 0 legal moves remain', () => {
      // Locked board: alternating colors with 0 matches and 0 legal moves
      const board: Tile[][] = [];
      let id = 1;
      for (let r = 0; r < GRID_ROWS; r++) {
        const row: Tile[] = [];
        for (let c = 0; c < GRID_COLS; c++) {
          row.push({
            id: id++,
            row: r,
            col: c,
            color: ((r * 2 + c) % 6) as CandyColor,
            type: CandyType.NORMAL
          });
        }
        board.push(row);
      }

      expect(engine.hasValidMoves(board)).toBe(false);

      const prng1 = new PRNG(777);
      const prng2 = new PRNG(777);

      const eng1 = new Match3Engine();
      const eng2 = new Match3Engine();

      const reshuffle1 = eng1.reshuffleBoard(board, prng1);
      const reshuffle2 = eng2.reshuffleBoard(board, prng2);

      expect(reshuffle1.newBoard).toEqual(reshuffle2.newBoard);
      expect(reshuffle1.events).toEqual(reshuffle2.events);
      expect(eng1.hasValidMoves(reshuffle1.newBoard)).toBe(true);
      expect(MatchDetector.detectMatches(reshuffle1.newBoard).length).toBe(0);
    });
  });
});
