import { Coordinate, Tile } from '../../../src/shared/types';
import { Match3Engine } from '../../../src/shared/engine/Match3Engine';

export interface Move {
  from: Coordinate;
  to: Coordinate;
}

/**
 * Searches the 9x9 board for a legally swappable adjacent pair that forms a match or special combination.
 */
export function findValidMove(board: Tile[][]): Move | null {
  const engine = new Match3Engine();
  const rows = board.length;
  const cols = board[0].length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const current = board[r][c];

      // Check swap with right neighbor
      if (c + 1 < cols) {
        const right = board[r][c + 1];
        if ((engine as any).isValidSwap(board, current, right)) {
          return {
            from: { row: r, col: c },
            to: { row: r, col: c + 1 }
          };
        }
      }

      // Check swap with bottom neighbor
      if (r + 1 < rows) {
        const bottom = board[r + 1][c];
        if ((engine as any).isValidSwap(board, current, bottom)) {
          return {
            from: { row: r, col: c },
            to: { row: r + 1, col: c }
          };
        }
      }
    }
  }

  return null;
}

/**
 * Returns all valid moves available on the current board state.
 */
export function findAllValidMoves(board: Tile[][]): Move[] {
  const engine = new Match3Engine();
  const rows = board.length;
  const cols = board[0].length;
  const moves: Move[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const current = board[r][c];

      if (c + 1 < cols) {
        const right = board[r][c + 1];
        if ((engine as any).isValidSwap(board, current, right)) {
          moves.push({
            from: { row: r, col: c },
            to: { row: r, col: c + 1 }
          });
        }
      }

      if (r + 1 < rows) {
        const bottom = board[r + 1][c];
        if ((engine as any).isValidSwap(board, current, bottom)) {
          moves.push({
            from: { row: r, col: c },
            to: { row: r + 1, col: c }
          });
        }
      }
    }
  }

  return moves;
}
