import { describe, it, expect } from 'vitest';
import { InvariantHarness } from '../e2e/helpers/InvariantHarness';
import { CandyColor, CandyType, Tile } from '../../src/shared/types';
import { GRID_ROWS, GRID_COLS } from '../../src/shared/constants';

function makeBoard(): Tile[][] {
  const board: Tile[][] = [];
  let id = 1;
  for (let r = 0; r < GRID_ROWS; r++) {
    board[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      board[r][c] = {
        id: id++,
        row: r,
        col: c,
        color: ((r + c) % 6) as CandyColor,
        type: CandyType.NORMAL
      };
    }
  }
  return board;
}

describe('InvariantHarness Empirical Desync Sensitivity Verification', () => {
  it('validates 100% sensitivity across every single one of all 81 board tiles', () => {
    const baselineBoard = makeBoard();
    const baselineHash = InvariantHarness.computeBoardHash(baselineBoard);

    // Verify baseline passes all structural invariants
    expect(() => InvariantHarness.validateStructuralInvariants(baselineBoard, 'Baseline')).not.toThrow();

    // Verify hash length spans all 81 tiles
    const cells = baselineHash.split('|').filter(Boolean);
    expect(cells.length).toBe(81);

    // Modify each tile individually and assert hash rejects it
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        // Alter color
        const alteredColor = makeBoard();
        alteredColor[r][c].color = ((alteredColor[r][c].color + 1) % 6) as CandyColor;
        const colorHash = InvariantHarness.computeBoardHash(alteredColor);
        expect(colorHash).not.toBe(baselineHash);

        // Alter type
        const alteredType = makeBoard();
        alteredType[r][c].type = CandyType.STRIPED_HORIZONTAL;
        const typeHash = InvariantHarness.computeBoardHash(alteredType);
        expect(typeHash).not.toBe(baselineHash);

        // Alter ID
        const alteredId = makeBoard();
        alteredId[r][c].id = 99999;
        const idHash = InvariantHarness.computeBoardHash(alteredId);
        expect(idHash).not.toBe(baselineHash);
      }
    }
  });

  it('rejects duplicate IDs across tiles', () => {
    const board = makeBoard();
    board[5][5].id = board[0][0].id;
    expect(() => InvariantHarness.validateStructuralInvariants(board, 'DuplicateId')).toThrow(/Duplicate tile ID/);
  });

  it('rejects coordinate mismatches where tile.row or tile.col does not match grid index', () => {
    const board = makeBoard();
    board[3][4].row = 2;
    expect(() => InvariantHarness.validateStructuralInvariants(board, 'WrongRow')).toThrow(/Tile coordinate mismatch/);

    const boardCol = makeBoard();
    boardCol[3][4].col = 5;
    expect(() => InvariantHarness.validateStructuralInvariants(boardCol, 'WrongCol')).toThrow(/Tile coordinate mismatch/);
  });

  it('rejects null or missing cells on settled board', () => {
    const board = makeBoard();
    (board[4] as any)[4] = null;
    expect(() => InvariantHarness.validateStructuralInvariants(board, 'NullCell')).toThrow(/Null tile found/);
  });

  it('rejects incorrect dimensions', () => {
    const board = makeBoard();
    board.pop();
    expect(() => InvariantHarness.validateStructuralInvariants(board, 'ShortRows')).toThrow(/Invalid row count/);

    const boardShortCol = makeBoard();
    boardShortCol[0].pop();
    expect(() => InvariantHarness.validateStructuralInvariants(boardShortCol, 'ShortCols')).toThrow(/Invalid col count/);
  });

  it('generates informative cellular diff identifying specific mismatched cell coordinates', () => {
    const b1 = makeBoard();
    const b2 = makeBoard();
    b2[2][3].color = CandyColor.PURPLE;
    b2[2][3].type = CandyType.WRAPPED;

    const h1 = InvariantHarness.computeBoardHash(b1);
    const h2 = InvariantHarness.computeBoardHash(b2);

    const diff = InvariantHarness.generateHashDiff(h1, h2, 'Player 1', 'Player 2');
    expect(diff).toContain('1 mismatched cells');
    expect(diff).toContain('Cell [21] -> Player 1: "2,3:');
    expect(diff).toContain('vs  Player 2: "2,3:');
  });
});
