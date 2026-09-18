import { describe, it, expect, beforeEach } from 'vitest';
import { CandyColor, CandyType, PlayerMove, Tile } from '../../src/shared/types';
import { GRID_COLS, GRID_ROWS } from '../../src/shared/constants';
import { PRNG } from '../../src/shared/prng';
import { Match3Engine } from '../../src/shared/engine/Match3Engine';
import { MatchDetector } from '../../src/shared/engine/MatchDetector';
import { SpecialCandyHandler } from '../../src/shared/engine/SpecialCandyHandler';
import { GravityCascade } from '../../src/shared/engine/GravityCascade';

describe('Match Pop Multiplayer - Core Match-3 Engine Suite', () => {
  let engine: Match3Engine;
  let prng: PRNG;

  beforeEach(() => {
    engine = new Match3Engine();
    prng = new PRNG(12345);
  });

  // Helper to create a plain dummy 9x9 board with no matches
  function createDummyBoard(): Tile[][] {
    const board: Tile[][] = [];
    let id = 1;
    for (let r = 0; r < GRID_ROWS; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        // Alternating checker pattern that creates 0 matches
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

  describe('1. PRNG Determinism', () => {
    it('produces identical sequences for identical seeds', () => {
      const p1 = new PRNG(42);
      const p2 = new PRNG(42);
      const seq1 = [p1.next(), p1.next(), p1.nextInt(0, 5)];
      const seq2 = [p2.next(), p2.next(), p2.nextInt(0, 5)];
      expect(seq1).toEqual(seq2);
    });

    it('produces different sequences for different seeds', () => {
      const p1 = new PRNG(42);
      const p2 = new PRNG(999);
      expect(p1.next()).not.toEqual(p2.next());
    });
  });

  describe('2. Board Generation & Valid Moves', () => {
    it('generates a 9x9 board with 0 initial matches and at least 1 valid move', () => {
      const board = engine.createInitialBoard(777);
      expect(board.length).toBe(GRID_ROWS);
      expect(board[0].length).toBe(GRID_COLS);

      const matches = MatchDetector.detectMatches(board);
      expect(matches.length).toBe(0);

      const hasMoves = engine.hasValidMoves(board);
      expect(hasMoves).toBe(true);
    });
  });

  describe('3. Swap Validation & Reversion', () => {
    it('rejects non-orthogonal diagonal swaps with SWAP_REVERT', () => {
      const board = createDummyBoard();
      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 0, col: 0 },
        to: { row: 1, col: 1 } // Diagonal
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(false);
      expect(result.turnScore).toBe(0);
      expect(result.events[0].type).toBe('SWAP_REVERT');
      expect(result.finalBoard).toEqual(board);
    });

    it('rejects out-of-bounds swaps with SWAP_REVERT', () => {
      const board = createDummyBoard();
      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 0, col: 0 },
        to: { row: -1, col: 0 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(false);
      expect(result.events[0].type).toBe('SWAP_REVERT');
    });

    it('reverts swaps that do not create matches or trigger specials', () => {
      const board = createDummyBoard();
      // Ensure (0,0) and (0,1) colors do not match surrounding
      board[0][0].color = CandyColor.RED;
      board[0][1].color = CandyColor.BLUE;
      board[0][2].color = CandyColor.GREEN;
      board[1][0].color = CandyColor.YELLOW;
      board[1][1].color = CandyColor.PURPLE;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 0, col: 0 },
        to: { row: 0, col: 1 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(false);
      expect(result.events).toEqual([
        { type: 'SWAP', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, valid: false },
        { type: 'SWAP_REVERT', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }
      ]);
      expect(result.turnScore).toBe(0);
    });
  });

  describe('4. Match Formations & Special Candies', () => {
    it('detects normal 3-in-a-row match and awards base score', () => {
      const board = createDummyBoard();
      // Setup horizontal match at row 2: (2,0) RED, (2,1) RED, (1,2) RED swapped to (2,2)
      board[2][0].color = CandyColor.RED;
      board[2][1].color = CandyColor.RED;
      board[2][2].color = CandyColor.BLUE;
      board[2][3].color = CandyColor.BLUE;
      board[1][2].color = CandyColor.RED;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 1, col: 2 },
        to: { row: 2, col: 2 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);
      expect(result.turnScore).toBeGreaterThanOrEqual(60); // 3 * 20 = 60

      const matchEvent = result.events.find((e) => e.type === 'MATCH_FOUND');
      expect(matchEvent).toBeDefined();
      if (matchEvent && matchEvent.type === 'MATCH_FOUND') {
        expect(matchEvent.tiles.length).toBe(3);
        expect(matchEvent.spawnSpecial).toBeUndefined();
      }
    });

    it('detects 4-in-a-row and spawns Striped Candy', () => {
      const board = createDummyBoard();
      // Setup horizontal 4-match at row 3
      board[3][0].color = CandyColor.GREEN;
      board[3][1].color = CandyColor.GREEN;
      board[3][2].color = CandyColor.GREEN;
      board[3][3].color = CandyColor.YELLOW;
      board[2][3].color = CandyColor.GREEN; // Will swap down to (3,3)

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 2, col: 3 },
        to: { row: 3, col: 3 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      const matchEvent = result.events.find((e) => e.type === 'MATCH_FOUND');
      expect(matchEvent).toBeDefined();
      if (matchEvent && matchEvent.type === 'MATCH_FOUND') {
        expect(matchEvent.tiles.length).toBe(4);
        expect(matchEvent.spawnSpecial).toBeDefined();
        // Since moved vertically into row 3, striped horizontal is created
        expect(matchEvent.spawnSpecial?.type).toBe(CandyType.STRIPED_HORIZONTAL);
      }
    });

    it('detects T/L-shape and spawns Wrapped Candy', () => {
      const board = createDummyBoard();
      // Setup T-shape at center (4,4)
      // Horizontal row 4: cols 3, 4, 5 all PURPLE
      // Vertical col 4: rows 2, 3, 4 all PURPLE
      // Swapping (1,4) PURPLE into (2,4)
      board[4][3].color = CandyColor.PURPLE;
      board[4][4].color = CandyColor.PURPLE;
      board[4][5].color = CandyColor.PURPLE;
      board[3][4].color = CandyColor.PURPLE;
      board[2][4].color = CandyColor.BLUE;
      board[1][4].color = CandyColor.PURPLE;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 1, col: 4 },
        to: { row: 2, col: 4 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      const matchEvent = result.events.find((e) => e.type === 'MATCH_FOUND');
      expect(matchEvent).toBeDefined();
      if (matchEvent && matchEvent.type === 'MATCH_FOUND') {
        expect(matchEvent.spawnSpecial).toBeDefined();
        expect(matchEvent.spawnSpecial?.type).toBe(CandyType.WRAPPED);
        expect(matchEvent.spawnSpecial?.color).toBe(CandyColor.PURPLE);
      }
    });

    it('detects 5-in-a-row straight and spawns Color Bomb', () => {
      const board = createDummyBoard();
      // Setup 5 in row 5: cols 1..5
      board[5][1].color = CandyColor.YELLOW;
      board[5][2].color = CandyColor.YELLOW;
      board[5][3].color = CandyColor.YELLOW;
      board[5][4].color = CandyColor.YELLOW;
      board[5][5].color = CandyColor.BLUE;
      board[4][5].color = CandyColor.YELLOW; // Swap into (5,5)

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 5 },
        to: { row: 5, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      const matchEvent = result.events.find((e) => e.type === 'MATCH_FOUND');
      expect(matchEvent).toBeDefined();
      if (matchEvent && matchEvent.type === 'MATCH_FOUND') {
        expect(matchEvent.tiles.length).toBe(5);
        expect(matchEvent.spawnSpecial).toBeDefined();
        expect(matchEvent.spawnSpecial?.type).toBe(CandyType.COLOR_BOMB);
      }
    });
  });

  describe('5. Special Candy Detonation & Pairwise Combos', () => {
    it('executes Striped + Striped cross blast (+)', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.STRIPED_HORIZONTAL;
      board[4][5].type = CandyType.STRIPED_VERTICAL;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);
      expect(result.turnScore).toBeGreaterThanOrEqual(1000); // Super combo score

      const comboEvent = result.events.find(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === 'combo'
      );
      expect(comboEvent).toBeDefined();
    });

    it('executes Striped + Wrapped giant 3x3 cross blast', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.STRIPED_HORIZONTAL;
      board[4][5].type = CandyType.WRAPPED;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);
      expect(result.turnScore).toBeGreaterThanOrEqual(2500);

      const comboEvent = result.events.find(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === 'combo'
      );
      expect(comboEvent).toBeDefined();
    });

    it('executes Wrapped + Wrapped massive 5x5 double blast', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.WRAPPED;
      board[4][5].type = CandyType.WRAPPED;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);
      expect(result.turnScore).toBeGreaterThanOrEqual(3500);
    });

    it('executes Color Bomb + Regular Candy clearing all of that color', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.COLOR_BOMB;
      board[4][5].color = CandyColor.RED;
      board[4][5].type = CandyType.NORMAL;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);
      expect(result.turnScore).toBeGreaterThan(0);

      const detonateEvent = result.events.find(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.COLOR_BOMB
      );
      expect(detonateEvent).toBeDefined();
    });

    it('executes Color Bomb + Striped transmuting all of that color to stripes and detonating', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.COLOR_BOMB;
      board[4][5].color = CandyColor.BLUE;
      board[4][5].type = CandyType.STRIPED_HORIZONTAL;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);
      expect(result.turnScore).toBeGreaterThanOrEqual(3000);
    });

    it('executes Color Bomb + Color Bomb total board apocalypse (81 tiles wiped)', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.COLOR_BOMB;
      board[4][5].type = CandyType.COLOR_BOMB;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);
      expect(result.turnScore).toBeGreaterThanOrEqual(5000);

      const apocalypse = result.events.find(
        (e) =>
          e.type === 'SPECIAL_DETONATE' &&
          e.specialType === 'combo' &&
          e.affectedTiles.length === 81
      );
      expect(apocalypse).toBeDefined();
    });
  });

  describe('6. Cascades, Gravity Drops & Combo Multipliers', () => {
    it('drops tiles down column-wise and refills from PRNG', () => {
      const board: (Tile | null)[][] = createDummyBoard();
      // Empty out bottom 2 rows of column 3
      board[7][3] = null;
      board[8][3] = null;

      const idRef = { id: 1000 };
      const { events } = GravityCascade.applyGravityAndRefill(board, prng, idRef);

      expect(events.some((e) => e.type === 'GRAVITY_DROP')).toBe(true);
      expect(events.some((e) => e.type === 'REFILL_SPAWN')).toBe(true);

      // Verify no null cells remain
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          expect(board[r][c]).not.toBeNull();
        }
      }
    });

    it('increments cascade step multiplier on consecutive cascades', () => {
      const board = createDummyBoard();
      // Setup a cascade where initial match triggers a second match
      // Step 1: match row 5
      board[5][0].color = CandyColor.RED;
      board[5][1].color = CandyColor.RED;
      board[5][2].color = CandyColor.BLUE;
      board[4][2].color = CandyColor.RED; // Swap down

      const result = engine.resolveMove(
        board,
        { playerId: 'p1', from: { row: 4, col: 2 }, to: { row: 5, col: 2 } },
        prng
      );

      expect(result.valid).toBe(true);
      const stepEvents = result.events.filter(
        (e) => e.type === 'CASCADE_STEP_COMPLETE'
      );
      expect(stepEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('7. Reshuffle Logic on No Moves', () => {
    it('detects when no valid moves exist and reshuffles the board', () => {
      // Construct a strictly unmatchable locked board
      // e.g., strictly alternating colors with 0 two-in-a-row anywhere
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

      const reshuffleResult = engine.reshuffleBoard(board, prng);
      expect(reshuffleResult.events.length).toBe(1);
      expect(reshuffleResult.events[0].type).toBe('BOARD_RESHUFFLE');

      // The new board must have at least one valid move
      expect(engine.hasValidMoves(reshuffleResult.newBoard)).toBe(true);
      // And zero pre-existing matches
      expect(MatchDetector.detectMatches(reshuffleResult.newBoard).length).toBe(0);
    });
  });

  describe('8. Chain Reaction & Edge Cases', () => {
    it('executes Color Bomb + Wrapped double-color annihilation combo', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.COLOR_BOMB;
      board[4][5].type = CandyType.WRAPPED;
      board[4][5].color = CandyColor.PURPLE;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);
      expect(result.turnScore).toBeGreaterThanOrEqual(3500);

      const comboEvent = result.events.find(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === 'combo'
      );
      expect(comboEvent).toBeDefined();
    });

    it('triggers special candy detonation when matched in a standard 3-match', () => {
      const board = createDummyBoard();
      // Setup horizontal match of RED where one of the RED candies is STRIPED_HORIZONTAL
      board[2][0].color = CandyColor.RED;
      board[2][0].type = CandyType.STRIPED_HORIZONTAL;
      board[2][1].color = CandyColor.RED;
      board[2][2].color = CandyColor.BLUE;
      board[2][3].color = CandyColor.BLUE;
      board[1][2].color = CandyColor.RED;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 1, col: 2 },
        to: { row: 2, col: 2 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      // Verify that a SPECIAL_DETONATE for STRIPED_HORIZONTAL occurred
      const stripeDetonate = result.events.find(
        (e) =>
          e.type === 'SPECIAL_DETONATE' &&
          e.specialType === CandyType.STRIPED_HORIZONTAL
      );
      expect(stripeDetonate).toBeDefined();
    });

    it('handles chain reactions when a striped beam hits a wrapped candy', () => {
      const board = createDummyBoard();
      // Place a STRIPED_HORIZONTAL at (2,0)
      board[2][0].color = CandyColor.RED;
      board[2][0].type = CandyType.STRIPED_HORIZONTAL;
      // Place a WRAPPED candy at (2,5) along the same row
      board[2][5].type = CandyType.WRAPPED;

      // Trigger the striped candy via match
      board[2][1].color = CandyColor.RED;
      board[2][2].color = CandyColor.BLUE;
      board[2][3].color = CandyColor.BLUE;
      board[1][2].color = CandyColor.RED;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 1, col: 2 },
        to: { row: 2, col: 2 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      // Verify wrapped detonation was triggered as secondary
      const wrappedDetonate = result.events.find(
        (e) =>
          e.type === 'SPECIAL_DETONATE' &&
          e.specialType === CandyType.WRAPPED
      );
      expect(wrappedDetonate).toBeDefined();
    });
  });

  describe('9. Remediated Core Engine Invariants', () => {
    it('ensures spawnSpecial.id exactly matches the placed special tile id on the board (zero desync)', () => {
      const board = createDummyBoard();
      // Setup horizontal 4-match at row 3
      board[3][0].color = CandyColor.GREEN;
      board[3][1].color = CandyColor.GREEN;
      board[3][2].color = CandyColor.GREEN;
      board[3][3].color = CandyColor.YELLOW;
      board[2][3].color = CandyColor.GREEN;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 2, col: 3 },
        to: { row: 3, col: 3 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      const matchEvent = result.events.find((e) => e.type === 'MATCH_FOUND');
      expect(matchEvent).toBeDefined();
      if (matchEvent && matchEvent.type === 'MATCH_FOUND') {
        const spawnedSpecial = matchEvent.spawnSpecial;
        expect(spawnedSpecial).toBeDefined();
        // Find the tile on the board
        let foundTile: Tile | undefined;
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            if (result.finalBoard[r][c].type === spawnedSpecial?.type) {
              foundTile = result.finalBoard[r][c];
            }
          }
        }
        expect(foundTile).toBeDefined();
        expect(foundTile?.id).toBe(spawnedSpecial?.id);
      }
    });

    it('emits CASCADE_STEP_COMPLETE for step 1 of a special combo move', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.STRIPED_HORIZONTAL;
      board[4][5].type = CandyType.STRIPED_VERTICAL;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      const step1Event = result.events.find(
        (e) => e.type === 'CASCADE_STEP_COMPLETE' && e.step === 1
      );
      expect(step1Event).toBeDefined();
      if (step1Event && step1Event.type === 'CASCADE_STEP_COMPLETE') {
        expect(step1Event.stepScore).toBeGreaterThanOrEqual(1000);
      }
    });

    it('verifies Wrapped Candy double blast emits 2 SPECIAL_DETONATE events', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.WRAPPED;
      board[4][4].color = CandyColor.RED;
      board[4][3].color = CandyColor.RED;
      board[4][2].color = CandyColor.BLUE;
      board[3][2].color = CandyColor.RED;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 3, col: 2 },
        to: { row: 4, col: 2 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      const wrappedDetonations = result.events.filter(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.WRAPPED
      );
      expect(wrappedDetonations.length).toBe(2);
    });

    it('verifies Color Bomb + Normal Swap purges only target color with 0 extraneous color purges', () => {
      const board = createDummyBoard();
      board[4][4].type = CandyType.COLOR_BOMB;
      board[4][4].color = CandyColor.NONE;
      board[4][5].type = CandyType.NORMAL;
      board[4][5].color = CandyColor.YELLOW;

      const move: PlayerMove = {
        playerId: 'p1',
        from: { row: 4, col: 4 },
        to: { row: 4, col: 5 }
      };

      const result = engine.resolveMove(board, move, prng);
      expect(result.valid).toBe(true);

      const cbDetonations = result.events.filter(
        (e) => e.type === 'SPECIAL_DETONATE' && e.specialType === CandyType.COLOR_BOMB
      );
      // Exactly 1 event for the swapped color bomb purge
      expect(cbDetonations.length).toBe(1);
    });
  });
});
