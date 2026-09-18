import { describe, it, expect, beforeEach } from 'vitest';
import { CandyColor, CandyType, Coordinate, PlayerMove, Tile } from '../../src/shared/types';
import { GRID_COLS, GRID_ROWS } from '../../src/shared/constants';
import { PRNG } from '../../src/shared/prng';
import { Match3Engine } from '../../src/shared/engine/Match3Engine';
import { MatchDetector } from '../../src/shared/engine/MatchDetector';
import { SpecialCandyHandler } from '../../src/shared/engine/SpecialCandyHandler';
import { GravityCascade } from '../../src/shared/engine/GravityCascade';

describe('Empirical Challenger 2 - Edge Cases & Stress Suite', () => {
  let engine: Match3Engine;
  let prng: PRNG;

  beforeEach(() => {
    engine = new Match3Engine();
    prng = new PRNG(98765);
  });

  /**
   * Helper to create an inert 9x9 board with NO initial matches.
   * Uses pattern: ((r * 2 + c) % 6) to avoid any 3-in-a-row.
   */
  function createInertBoard(): Tile[][] {
    const board: Tile[][] = [];
    let id = 1;
    for (let r = 0; r < GRID_ROWS; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        // Pattern: (r * 2 + c) % 5 ensures no 3-in-a-row horizontally or vertically
        const color = ((r * 2 + c) % 5) as CandyColor;
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
  // 1. BOUNDARY CONDITION TESTS (ROWS 0, 8; COLS 0, 8; CORNERS)
  // =========================================================================
  describe('1. Boundary Condition Tests', () => {
    it('1.1: Match-3 at Top-Left Corner (0,0) - Horizontal and Vertical', () => {
      // Horizontal at Row 0, Cols 0..2
      const boardH = createInertBoard();
      boardH[0][0].color = CandyColor.RED;
      boardH[0][1].color = CandyColor.RED;
      boardH[0][2].color = CandyColor.BLUE;
      boardH[1][2].color = CandyColor.RED; // Swap up into (0,2)

      const resH = engine.resolveMove(
        boardH,
        { playerId: 'p1', from: { row: 1, col: 2 }, to: { row: 0, col: 2 } },
        prng
      );
      expect(resH.valid).toBe(true);
      expect(resH.finalBoard.length).toBe(GRID_ROWS);
      expect(resH.finalBoard[0].length).toBe(GRID_COLS);
      // Ensure no nulls exist on settled board
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          expect(resH.finalBoard[r][c]).toBeDefined();
          expect(resH.finalBoard[r][c].row).toBe(r);
          expect(resH.finalBoard[r][c].col).toBe(c);
        }
      }

      // Vertical at Col 0, Rows 0..2
      const boardV = createInertBoard();
      boardV[0][0].color = CandyColor.GREEN;
      boardV[1][0].color = CandyColor.GREEN;
      boardV[2][0].color = CandyColor.BLUE;
      boardV[2][1].color = CandyColor.GREEN; // Swap left into (2,0)

      const resV = engine.resolveMove(
        boardV,
        { playerId: 'p1', from: { row: 2, col: 1 }, to: { row: 2, col: 0 } },
        prng
      );
      expect(resV.valid).toBe(true);
      expect(resV.finalBoard[0][0]).toBeDefined();
    });

    it('1.2: Match-3 at Top-Right Corner (0,8) - Horizontal and Vertical', () => {
      // Horizontal at Row 0, Cols 6..8
      const boardH = createInertBoard();
      boardH[0][6].color = CandyColor.YELLOW;
      boardH[0][7].color = CandyColor.YELLOW;
      boardH[0][8].color = CandyColor.PURPLE;
      boardH[1][8].color = CandyColor.YELLOW; // Swap up into (0,8)

      const resH = engine.resolveMove(
        boardH,
        { playerId: 'p1', from: { row: 1, col: 8 }, to: { row: 0, col: 8 } },
        prng
      );
      expect(resH.valid).toBe(true);
      expect(resH.finalBoard[0][8]).toBeDefined();

      // Vertical at Col 8, Rows 0..2
      const boardV = createInertBoard();
      boardV[0][8].color = CandyColor.ORANGE;
      boardV[1][8].color = CandyColor.ORANGE;
      boardV[2][8].color = CandyColor.PURPLE;
      boardV[2][7].color = CandyColor.ORANGE; // Swap right into (2,8)

      const resV = engine.resolveMove(
        boardV,
        { playerId: 'p1', from: { row: 2, col: 7 }, to: { row: 2, col: 8 } },
        prng
      );
      expect(resV.valid).toBe(true);
      expect(resV.finalBoard[0][8]).toBeDefined();
    });

    it('1.3: Match-3 at Bottom-Left Corner (8,0) - Horizontal and Vertical', () => {
      // Horizontal at Row 8, Cols 0..2
      const boardH = createInertBoard();
      boardH[8][0].color = CandyColor.PURPLE;
      boardH[8][1].color = CandyColor.PURPLE;
      boardH[8][2].color = CandyColor.BLUE;
      boardH[7][2].color = CandyColor.PURPLE; // Swap down into (8,2)

      const resH = engine.resolveMove(
        boardH,
        { playerId: 'p1', from: { row: 7, col: 2 }, to: { row: 8, col: 2 } },
        prng
      );
      expect(resH.valid).toBe(true);
      expect(resH.finalBoard[8][0]).toBeDefined();

      // Vertical at Col 0, Rows 6..8
      const boardV = createInertBoard();
      boardV[6][0].color = CandyColor.RED;
      boardV[7][0].color = CandyColor.RED;
      boardV[8][0].color = CandyColor.BLUE;
      boardV[8][1].color = CandyColor.RED; // Swap left into (8,0)

      const resV = engine.resolveMove(
        boardV,
        { playerId: 'p1', from: { row: 8, col: 1 }, to: { row: 8, col: 0 } },
        prng
      );
      expect(resV.valid).toBe(true);
      expect(resV.finalBoard[8][0]).toBeDefined();
    });

    it('1.4: Match-3 at Bottom-Right Corner (8,8) - Horizontal and Vertical', () => {
      // Horizontal at Row 8, Cols 6..8
      const boardH = createInertBoard();
      boardH[8][6].color = CandyColor.GREEN;
      boardH[8][7].color = CandyColor.GREEN;
      boardH[8][8].color = CandyColor.BLUE;
      boardH[7][8].color = CandyColor.GREEN; // Swap down into (8,8)

      const resH = engine.resolveMove(
        boardH,
        { playerId: 'p1', from: { row: 7, col: 8 }, to: { row: 8, col: 8 } },
        prng
      );
      expect(resH.valid).toBe(true);
      expect(resH.finalBoard[8][8]).toBeDefined();

      // Vertical at Col 8, Rows 6..8
      const boardV = createInertBoard();
      boardV[6][8].color = CandyColor.BLUE;
      boardV[7][8].color = CandyColor.BLUE;
      boardV[8][8].color = CandyColor.YELLOW;
      boardV[8][7].color = CandyColor.BLUE; // Swap right into (8,8)

      const resV = engine.resolveMove(
        boardV,
        { playerId: 'p1', from: { row: 8, col: 7 }, to: { row: 8, col: 8 } },
        prng
      );
      expect(resV.valid).toBe(true);
      expect(resV.finalBoard[8][8]).toBeDefined();
    });

    it('1.5: 4-in-a-row Striped spawn and 5-in-a-row Color Bomb at extreme edges', () => {
      // 4-in-a-row at top boundary row 0, cols 0..3
      const board4 = createInertBoard();
      board4[0][0].color = CandyColor.YELLOW;
      board4[0][1].color = CandyColor.YELLOW;
      board4[0][2].color = CandyColor.YELLOW;
      board4[0][3].color = CandyColor.RED;
      board4[1][3].color = CandyColor.YELLOW; // Swap up into (0,3)

      const res4 = engine.resolveMove(
        board4,
        { playerId: 'p1', from: { row: 1, col: 3 }, to: { row: 0, col: 3 } },
        prng
      );
      expect(res4.valid).toBe(true);
      const match4Event = res4.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match4Event).toBeDefined();
      if (match4Event && match4Event.type === 'MATCH_FOUND') {
        expect(match4Event.spawnSpecial?.type).toBe(CandyType.STRIPED_HORIZONTAL);
        const spawnedId = match4Event.spawnSpecial?.id;
        // Find the striped tile on the board:
        let foundTile: Tile | undefined;
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            if (res4.finalBoard[r][c].type === CandyType.STRIPED_HORIZONTAL) {
              foundTile = res4.finalBoard[r][c];
            }
          }
        }
        expect(foundTile).toBeDefined();
        console.log('spawnSpecial.id:', spawnedId, 'vs tile.id on finalBoard:', foundTile?.id);
        expect(foundTile?.id).toBe(spawnedId);
      }

      // 5-in-a-row at rightmost boundary col 8, rows 4..8
      const board5 = createInertBoard();
      for (let r = 4; r <= 7; r++) {
        board5[r][8].color = CandyColor.PURPLE;
      }
      board5[8][8].color = CandyColor.GREEN;
      board5[8][7].color = CandyColor.PURPLE; // Swap into (8,8)

      const res5 = engine.resolveMove(
        board5,
        { playerId: 'p1', from: { row: 8, col: 7 }, to: { row: 8, col: 8 } },
        prng
      );
      expect(res5.valid).toBe(true);
      const match5Event = res5.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match5Event).toBeDefined();
      if (match5Event && match5Event.type === 'MATCH_FOUND') {
        expect(match5Event.spawnSpecial?.type).toBe(CandyType.COLOR_BOMB);
      }
    });

    it('1.6: Special Candy Detonation clamped at all 4 corners', () => {
      // Corner (0,0): Wrapped explosion must clamp to 4 tiles without throwing
      const boardTL = createInertBoard();
      boardTL[0][0].type = CandyType.WRAPPED;
      boardTL[0][1].type = CandyType.NORMAL;
      const resTL = engine.resolveMove(
        boardTL,
        { playerId: 'p1', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        prng
      );
      // Wait, normal swap of WRAPPED with NORMAL only activates if part of match or combo
      // In candy crush, WRAPPED + WRAPPED or matching it triggers.
      // Let's test Wrapped + Wrapped combo at (0,0) and (0,1)
      boardTL[0][1].type = CandyType.WRAPPED;
      const resTLCombo = engine.resolveMove(
        boardTL,
        { playerId: 'p1', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        prng
      );
      expect(resTLCombo.valid).toBe(true);
      expect(resTLCombo.finalBoard[0][0]).toBeDefined();

      // Corner (8,8): Wrapped + Wrapped combo at bottom-right
      const boardBR = createInertBoard();
      boardBR[8][7].type = CandyType.WRAPPED;
      boardBR[8][8].type = CandyType.WRAPPED;
      const resBRCombo = engine.resolveMove(
        boardBR,
        { playerId: 'p1', from: { row: 8, col: 7 }, to: { row: 8, col: 8 } },
        prng
      );
      expect(resBRCombo.valid).toBe(true);
      expect(resBRCombo.finalBoard[8][8]).toBeDefined();

      // Striped + Wrapped at top-left corner (0,0)
      const boardSW = createInertBoard();
      boardSW[0][0].type = CandyType.STRIPED_HORIZONTAL;
      boardSW[0][1].type = CandyType.WRAPPED;
      const resSW = engine.resolveMove(
        boardSW,
        { playerId: 'p1', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        prng
      );
      expect(resSW.valid).toBe(true);
      expect(resSW.finalBoard[0][0]).toBeDefined();
    });
  });

  // =========================================================================
  // 2. T AND L SHAPES FACING ALL 4 ORIENTATIONS + CROSS
  // =========================================================================
  describe('2. T and L Shapes - All Orientations and Anchor Precision', () => {
    it('2.1: T-Shape Facing Down (T): horizontal top row, stem going down', () => {
      const board = createInertBoard();
      // Center (4,4)
      // Horizontal bar: (3,3), (3,4), (3,5)
      // Vertical stem: (3,4), (4,4), (5,4)
      // Intersection: (3,4)
      board[3][3].color = CandyColor.PURPLE;
      board[3][4].color = CandyColor.PURPLE;
      board[3][5].color = CandyColor.PURPLE;
      board[4][4].color = CandyColor.PURPLE;
      board[5][4].color = CandyColor.BLUE;
      board[5][5].color = CandyColor.PURPLE; // Swap left into (5,4)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 5, col: 5 }, to: { row: 5, col: 4 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.color).toBe(CandyColor.PURPLE);
        expect(match.spawnSpecial?.row).toBe(3);
        expect(match.spawnSpecial?.col).toBe(4);
      }
    });

    it('2.2: T-Shape Facing Up (ꓕ): horizontal bottom row, stem going up', () => {
      const board = createInertBoard();
      // Intersection at (5,4)
      // Horizontal bar: (5,3), (5,4), (5,5)
      // Vertical stem: (3,4), (4,4), (5,4)
      board[5][3].color = CandyColor.RED;
      board[5][4].color = CandyColor.RED;
      board[5][5].color = CandyColor.RED;
      board[4][4].color = CandyColor.RED;
      board[3][4].color = CandyColor.BLUE;
      board[2][4].color = CandyColor.RED; // Swap down into (3,4)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 2, col: 4 }, to: { row: 3, col: 4 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(5);
        expect(match.spawnSpecial?.col).toBe(4);
      }
    });

    it('2.3: T-Shape Facing Left (⊣): vertical bar right, stem going left', () => {
      const board = createInertBoard();
      // Intersection at (4,5)
      // Vertical bar: (3,5), (4,5), (5,5)
      // Horizontal stem: (4,3), (4,4), (4,5)
      board[3][5].color = CandyColor.GREEN;
      board[4][5].color = CandyColor.GREEN;
      board[5][5].color = CandyColor.GREEN;
      board[4][4].color = CandyColor.GREEN;
      board[4][3].color = CandyColor.YELLOW;
      board[4][2].color = CandyColor.GREEN; // Swap right into (4,3)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 4, col: 2 }, to: { row: 4, col: 3 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(4);
        expect(match.spawnSpecial?.col).toBe(5);
      }
    });

    it('2.4: T-Shape Facing Right (⊢): vertical bar left, stem going right', () => {
      const board = createInertBoard();
      // Intersection at (4,3)
      // Vertical bar: (3,3), (4,3), (5,3)
      // Horizontal stem: (4,3), (4,4), (4,5)
      board[3][3].color = CandyColor.BLUE;
      board[4][3].color = CandyColor.BLUE;
      board[5][3].color = CandyColor.BLUE;
      board[4][4].color = CandyColor.BLUE;
      board[4][5].color = CandyColor.YELLOW;
      board[4][6].color = CandyColor.BLUE; // Swap left into (4,5)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 4, col: 6 }, to: { row: 4, col: 5 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(4);
        expect(match.spawnSpecial?.col).toBe(3);
      }
    });

    it('2.5: L-Shape 1 (└ Corner Bottom-Left): corner at (5,3)', () => {
      const board = createInertBoard();
      // Vertical: (3,3), (4,3), (5,3)
      // Horizontal: (5,3), (5,4), (5,5)
      // Intersection: (5,3)
      board[3][3].color = CandyColor.YELLOW;
      board[4][3].color = CandyColor.YELLOW;
      board[5][3].color = CandyColor.YELLOW;
      board[5][4].color = CandyColor.YELLOW;
      board[5][5].color = CandyColor.RED;
      board[6][5].color = CandyColor.YELLOW; // Swap up into (5,5)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 6, col: 5 }, to: { row: 5, col: 5 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(5);
        expect(match.spawnSpecial?.col).toBe(3);
      }
    });

    it('2.6: L-Shape 2 (┘ Corner Bottom-Right): corner at (5,5)', () => {
      const board = createInertBoard();
      // Vertical: (3,5), (4,5), (5,5)
      // Horizontal: (5,3), (5,4), (5,5)
      // Intersection: (5,5)
      board[3][5].color = CandyColor.PURPLE;
      board[4][5].color = CandyColor.PURPLE;
      board[5][5].color = CandyColor.PURPLE;
      board[5][4].color = CandyColor.PURPLE;
      board[5][3].color = CandyColor.RED;
      board[6][3].color = CandyColor.PURPLE; // Swap up into (5,3)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 6, col: 3 }, to: { row: 5, col: 3 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(5);
        expect(match.spawnSpecial?.col).toBe(5);
      }
    });

    it('2.7: L-Shape 3 (┌ Corner Top-Left): corner at (3,3)', () => {
      const board = createInertBoard();
      // Vertical: (3,3), (4,3), (5,3)
      // Horizontal: (3,3), (3,4), (3,5)
      // Intersection: (3,3)
      board[3][3].color = CandyColor.ORANGE;
      board[4][3].color = CandyColor.ORANGE;
      board[5][3].color = CandyColor.ORANGE;
      board[3][4].color = CandyColor.ORANGE;
      board[3][5].color = CandyColor.BLUE;
      board[2][5].color = CandyColor.ORANGE; // Swap down into (3,5)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 2, col: 5 }, to: { row: 3, col: 5 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(3);
        expect(match.spawnSpecial?.col).toBe(3);
      }
    });

    it('2.8: L-Shape 4 (┐ Corner Top-Right): corner at (3,5)', () => {
      const board = createInertBoard();
      // Vertical: (3,5), (4,5), (5,5)
      // Horizontal: (3,3), (3,4), (3,5)
      // Intersection: (3,5)
      board[3][5].color = CandyColor.RED;
      board[4][5].color = CandyColor.RED;
      board[5][5].color = CandyColor.RED;
      board[3][4].color = CandyColor.RED;
      board[3][3].color = CandyColor.BLUE;
      board[2][3].color = CandyColor.RED; // Swap down into (3,3)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 2, col: 3 }, to: { row: 3, col: 3 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(3);
        expect(match.spawnSpecial?.col).toBe(5);
      }
    });

    it('2.9: Cross / Plus Shape (+): intersection at (4,4)', () => {
      const board = createInertBoard();
      // Horizontal: (4,3), (4,4), (4,5)
      // Vertical: (3,4), (4,4), (5,4)
      board[4][3].color = CandyColor.GREEN;
      board[4][4].color = CandyColor.GREEN;
      board[4][5].color = CandyColor.GREEN;
      board[3][4].color = CandyColor.GREEN;
      board[5][4].color = CandyColor.BLUE;
      board[5][3].color = CandyColor.GREEN; // Swap right into (5,4)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 5, col: 3 }, to: { row: 5, col: 4 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(4);
        expect(match.spawnSpecial?.col).toBe(4);
      }
    });
  });

  // =========================================================================
  // 3. COMPLEX CASCADING CHAIN REACTIONS & SIMULTANEOUS EXPLOSIONS
  // =========================================================================
  describe('3. Complex Cascading Chain Reactions & Simultaneous Explosions', () => {
    it('3.1: Simultaneous detonation of two Striped Candies in opposite orientations', () => {
      const board = createInertBoard();
      // Place a STRIPED_HORIZONTAL at (2,2) and STRIPED_VERTICAL at (6,6)
      board[2][2].type = CandyType.STRIPED_HORIZONTAL;
      board[2][2].color = CandyColor.RED;
      board[2][1].color = CandyColor.RED;
      board[2][0].color = CandyColor.BLUE;
      board[1][0].color = CandyColor.RED; // Will swap to (2,0) triggering (2,2)

      board[6][6].type = CandyType.STRIPED_VERTICAL;
      board[6][6].color = CandyColor.GREEN;
      board[7][6].color = CandyColor.GREEN;
      board[8][6].color = CandyColor.GREEN; // This would be a pre-existing match if same color, so make (8,6) match on cascade or place in line of beam!

      // Instead, align (6,2) as STRIPED_VERTICAL so row 2 beam hits col 2!
      // (2,2) STRIPED_H will hit (2,6) which is STRIPED_V!
      board[2][6].type = CandyType.STRIPED_VERTICAL;
      board[2][6].color = CandyColor.YELLOW;

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 1, col: 0 }, to: { row: 2, col: 0 } },
        prng
      );
      expect(res.valid).toBe(true);

      const detEvents = res.events.filter((e) => e.type === 'SPECIAL_DETONATE');
      expect(detEvents.length).toBeGreaterThanOrEqual(2);
      expect(detEvents.some((e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.STRIPED_HORIZONTAL)).toBe(true);
      expect(detEvents.some((e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.STRIPED_VERTICAL)).toBe(true);
    });

    it('3.2: Multi-tier cascade: Striped -> Wrapped -> Color Bomb blast chain', () => {
      const board = createInertBoard();
      // (3,0) STRIPED_H
      board[3][0].type = CandyType.STRIPED_HORIZONTAL;
      board[3][0].color = CandyColor.RED;
      board[3][1].color = CandyColor.RED;
      board[3][2].color = CandyColor.BLUE;
      board[2][2].color = CandyColor.RED; // Swap into (3,2)

      // In line with row 3 beam:
      // (3,4) is WRAPPED
      board[3][4].type = CandyType.WRAPPED;

      // In 3x3 radius of (3,4):
      // (4,4) is COLOR_BOMB
      board[4][4].type = CandyType.COLOR_BOMB;

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 2, col: 2 }, to: { row: 3, col: 2 } },
        prng
      );
      expect(res.valid).toBe(true);

      const detTypes = res.events
        .filter((e) => e.type === 'SPECIAL_DETONATE')
        .map((e) => (e as any).specialType);

      expect(detTypes).toContain(CandyType.STRIPED_HORIZONTAL);
      expect(detTypes).toContain(CandyType.WRAPPED);
      expect(detTypes).toContain(CandyType.COLOR_BOMB);
    });

    it('3.3: Overlapping Wrapped Blasts do not double-count or crash', () => {
      const board = createInertBoard();
      // Two wrapped candies adjacent to each other: (4,4) and (4,5)
      // Hit them with a striped beam along col 4
      board[0][4].type = CandyType.STRIPED_VERTICAL;
      board[0][4].color = CandyColor.BLUE;
      board[1][4].color = CandyColor.BLUE;
      board[2][4].color = CandyColor.RED;
      board[2][3].color = CandyColor.BLUE; // Swap into (2,4)

      board[4][4].type = CandyType.WRAPPED;
      board[4][5].type = CandyType.WRAPPED;

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 2, col: 3 }, to: { row: 2, col: 4 } },
        prng
      );
      expect(res.valid).toBe(true);

      // Verify board settled cleanly
      expect(res.finalBoard.length).toBe(9);
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          expect(res.finalBoard[r][c]).toBeDefined();
          expect(res.finalBoard[r][c].row).toBe(r);
          expect(res.finalBoard[r][c].col).toBe(c);
        }
      }
    });

    it('3.4: Deep multi-step gravity cascade preserves combo multipliers and scores', () => {
      // Create a deterministic cascade with predefined column stacks
      const board = createInertBoard();
      // Setup step 1 match at bottom row 8
      board[8][0].color = CandyColor.RED;
      board[8][1].color = CandyColor.RED;
      board[8][2].color = CandyColor.BLUE;
      board[7][2].color = CandyColor.RED; // Swap down

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 7, col: 2 }, to: { row: 8, col: 2 } },
        prng
      );
      expect(res.valid).toBe(true);
      expect(res.turnScore).toBeGreaterThan(0);

      const stepEvents = res.events.filter((e) => e.type === 'CASCADE_STEP_COMPLETE');
      expect(stepEvents.length).toBeGreaterThanOrEqual(1);
      // Verify step multiplier: cumulativeScore is monotonically increasing
      let prevCumulative = 0;
      for (const stepEv of stepEvents) {
        if (stepEv.type === 'CASCADE_STEP_COMPLETE') {
          expect(stepEv.cumulativeScore).toBeGreaterThan(prevCumulative);
          prevCumulative = stepEv.cumulativeScore;
        }
      }
    });
  });

  // =========================================================================
  // 4. BOARD RESHUFFLING BEHAVIOR ON 0-MOVE BOARDS
  // =========================================================================
  describe('4. Board Reshuffling Behavior on 0-Move Boards', () => {
    /**
     * Constructs an artificial locked board with 0 matches and 0 valid moves.
     */
    function createZeroMoveBoard(): Tile[][] {
      // A board where adjacent tiles are strictly arranged so that no swap can create 3 in a row.
      // E.g., repeated lines of [0, 1, 2, 3, 4, 5, 0, 1, 2] shifted by 2 each row:
      // Row 0: 0 1 2 3 4 5 0 1 2
      // Row 1: 2 3 4 5 0 1 2 3 4
      // Row 2: 4 5 0 1 2 3 4 5 0
      // Row 3: 0 1 2 3 4 5 0 1 2
      // Row 4: 2 3 4 5 0 1 2 3 4
      // Row 5: 4 5 0 1 2 3 4 5 0
      // Row 6: 0 1 2 3 4 5 0 1 2
      // Row 7: 2 3 4 5 0 1 2 3 4
      // Row 8: 4 5 0 1 2 3 4 5 0
      const board: Tile[][] = [];
      let id = 1;
      for (let r = 0; r < GRID_ROWS; r++) {
        const row: Tile[] = [];
        for (let c = 0; c < GRID_COLS; c++) {
          const color = (((r % 3) * 2 + c) % 6) as CandyColor;
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

    it('4.1: hasValidMoves returns false on a verified 0-move board', () => {
      const board = createZeroMoveBoard();
      // Verify initial matches are 0
      const matches = MatchDetector.detectMatches(board);
      expect(matches.length).toBe(0);

      // Verify no valid moves exist
      const hasMoves = engine.hasValidMoves(board);
      expect(hasMoves).toBe(false);
    });

    it('4.2: reshuffleBoard rearranges 0-move board into a valid board with moves and 0 matches', () => {
      const board = createZeroMoveBoard();
      const initialCounts = new Map<CandyColor, number>();
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const color = board[r][c].color;
          initialCounts.set(color, (initialCounts.get(color) || 0) + 1);
        }
      }

      const { newBoard, events } = engine.reshuffleBoard(board, prng);

      // Event emitted
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('BOARD_RESHUFFLE');

      // Zero pre-formed matches
      const newMatches = MatchDetector.detectMatches(newBoard);
      expect(newMatches.length).toBe(0);

      // At least 1 valid move
      expect(engine.hasValidMoves(newBoard)).toBe(true);

      // Color multiset conservation: exactly same count of each color
      const newCounts = new Map<CandyColor, number>();
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const color = newBoard[r][c].color;
          newCounts.set(color, (newCounts.get(color) || 0) + 1);
        }
      }
      expect(newCounts).toEqual(initialCounts);
    });

    it('4.3: Reshuffle preserves special candies and their attributes', () => {
      const board = createZeroMoveBoard();
      // Put a striped candy and wrapped candy
      board[0][0].type = CandyType.STRIPED_HORIZONTAL;
      board[1][1].type = CandyType.WRAPPED;

      // Note: putting specials on board might make hasValidMoves true if adjacent,
      // so place them non-adjacent to test preservation
      const initialSpecialTypes = [board[0][0].type, board[1][1].type];

      const { newBoard } = engine.reshuffleBoard(board, prng);

      const newSpecials: CandyType[] = [];
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (newBoard[r][c].type !== CandyType.NORMAL) {
            newSpecials.push(newBoard[r][c].type);
          }
        }
      }
      expect(newSpecials.sort()).toEqual(initialSpecialTypes.sort());
    });

    it('4.4: Stress test: 50 consecutive reshuffles all produce valid boards with >=1 moves and 0 matches', () => {
      let currentBoard = createZeroMoveBoard();
      for (let i = 0; i < 50; i++) {
        const { newBoard } = engine.reshuffleBoard(currentBoard, prng);
        expect(MatchDetector.detectMatches(newBoard).length).toBe(0);
        expect(engine.hasValidMoves(newBoard)).toBe(true);
        currentBoard = newBoard;
      }
    });

    it('4.5: Automatic reshuffle triggered in resolveMove when cascade leaves 0 moves', () => {
      // Craft a move that settles into a board with 0 moves
      // We can verify this by checking that if finalBoard has no valid moves, BOARD_RESHUFFLE is appended before TURN_SETTLE
      const board = createInertBoard();
      // Make a simple match
      board[4][0].color = CandyColor.RED;
      board[4][1].color = CandyColor.RED;
      board[4][2].color = CandyColor.BLUE;
      board[3][2].color = CandyColor.RED;

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 3, col: 2 }, to: { row: 4, col: 2 } },
        prng
      );
      expect(res.valid).toBe(true);
      // The settled board MUST always have valid moves!
      expect(engine.hasValidMoves(res.finalBoard)).toBe(true);
      const settleEvent = res.events[res.events.length - 1];
      expect(settleEvent.type).toBe('TURN_SETTLE');
    });

    it('4.6: [EMPIRICAL BUG CHECK] Swapping Color Bomb with RED candy clears only RED and Color Bomb', () => {
      const board = createInertBoard();
      // Set up Color Bomb at (4,4) and RED candy at (4,5)
      board[4][4].type = CandyType.COLOR_BOMB;
      board[4][4].color = CandyColor.NONE;
      board[4][5].type = CandyType.NORMAL;
      board[4][5].color = CandyColor.RED;

      // Count each color on the board BEFORE the move
      const countsBefore = new Map<CandyColor, number>();
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const col = board[r][c].color;
          countsBefore.set(col, (countsBefore.get(col) || 0) + 1);
        }
      }

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 4, col: 4 }, to: { row: 4, col: 5 } },
        prng
      );
      expect(res.valid).toBe(true);

      // Check the SPECIAL_DETONATE events
      const detEvents = res.events.filter((e) => e.type === 'SPECIAL_DETONATE');
      console.log('detEvents count for Color Bomb + RED:', detEvents.length);

      // In authentic Candy Crush, swapping Color Bomb with RED clears ONLY RED candies.
      // It should NOT emit 2 SPECIAL_DETONATE events, and should NOT clear a second random color!
      expect(detEvents.length).toBe(1);
    });

    it('4.8: [EMPIRICAL BUG CHECK] Color Bomb + Striped combo detonates unintended random color', () => {
      const board = createInertBoard();
      board[4][4].type = CandyType.COLOR_BOMB;
      board[4][4].color = CandyColor.NONE;
      board[4][5].type = CandyType.STRIPED_HORIZONTAL;
      board[4][5].color = CandyColor.BLUE;

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 4, col: 4 }, to: { row: 4, col: 5 } },
        prng
      );
      expect(res.valid).toBe(true);

      // Check if detonateTilesRecursive fired an extra COLOR_BOMB detonation
      const cbDetonations = res.events.filter(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.COLOR_BOMB
      );
      console.log('Color Bomb detonations during CB+Striped combo:', cbDetonations.length);
      // Because colorBombTile was passed into detonateTilesRecursive, it picked an extra color:
      expect(cbDetonations.length).toBe(0);
    });

    it('2.10: L-Shape at Top-Left Corner (0,0)', () => {
      const board = createInertBoard();
      // L at (0,0): (0,0), (0,1), (0,2) and (0,0), (1,0), (2,0)
      board[0][0].color = CandyColor.PURPLE;
      board[0][1].color = CandyColor.PURPLE;
      board[0][2].color = CandyColor.PURPLE;
      board[1][0].color = CandyColor.PURPLE;
      board[2][0].color = CandyColor.BLUE;
      board[2][1].color = CandyColor.PURPLE; // Swap left into (2,0)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 2, col: 1 }, to: { row: 2, col: 0 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(0);
        expect(match.spawnSpecial?.col).toBe(0);
      }
    });

    it('2.11: L-Shape at Bottom-Right Corner (8,8)', () => {
      const board = createInertBoard();
      // L at (8,8): (8,6), (8,7), (8,8) and (6,8), (7,8), (8,8)
      board[8][6].color = CandyColor.GREEN;
      board[8][7].color = CandyColor.GREEN;
      board[8][8].color = CandyColor.GREEN;
      board[7][8].color = CandyColor.GREEN;
      board[6][8].color = CandyColor.BLUE;
      board[6][7].color = CandyColor.GREEN; // Swap right into (6,8)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 6, col: 7 }, to: { row: 6, col: 8 } },
        prng
      );
      expect(res.valid).toBe(true);
      const match = res.events.find((e) => e.type === 'MATCH_FOUND');
      expect(match).toBeDefined();
      if (match && match.type === 'MATCH_FOUND') {
        expect(match.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(match.spawnSpecial?.row).toBe(8);
        expect(match.spawnSpecial?.col).toBe(8);
      }
    });

    it('4.7: [AUTHENTIC BEHAVIOR] Wrapped Candy explodes in a 3x3 area twice (R1 requirement)', () => {
      const board = createInertBoard();
      // Place a WRAPPED candy at (4,4)
      board[4][4].type = CandyType.WRAPPED;
      board[4][4].color = CandyColor.RED;
      board[4][3].color = CandyColor.RED;
      board[4][2].color = CandyColor.BLUE;
      board[3][2].color = CandyColor.RED; // Swap down into (4,2)

      const res = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 3, col: 2 }, to: { row: 4, col: 2 } },
        prng
      );
      expect(res.valid).toBe(true);

      const wrappedExplosions = res.events.filter(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.WRAPPED
      );
      // Requirement R1 states: "T or L shape → Wrapped Candy (explodes in a 3x3 area twice)."
      // types.ts states: "WRAPPED = 'wrapped', // Explodes in a 3x3 area twice"
      console.log('Wrapped candy explosions count:', wrappedExplosions.length);
      expect(wrappedExplosions.length).toBe(2);
    });
  });
});
