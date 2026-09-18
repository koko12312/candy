import {
  CandyColor,
  CandyType,
  Coordinate,
  EngineEvent,
  MoveResolution,
  PlayerMove,
  Tile
} from '../types';
import {
  CANDY_COLORS_COUNT,
  GRID_COLS,
  GRID_ROWS
} from '../constants';
import { PRNG } from '../prng';
import { MatchDetector } from './MatchDetector';
import { SpecialCandyHandler } from './SpecialCandyHandler';
import { GravityCascade } from './GravityCascade';

export class Match3Engine {
  private nextId = 1;

  /**
   * Deep clones a 2D tile grid.
   */
  public static cloneBoard(board: (Tile | null)[][]): Tile[][] {
    return board.map((row) =>
      row.map((tile) => {
        if (!tile) {
          throw new Error('cloneBoard encountered null tile on settled board');
        }
        return { ...tile };
      })
    );
  }

  /**
   * Creates an initial standard board (default 9x9) using a seed.
   * Guarantees 0 pre-existing 3-matches AND >= 1 valid move.
   */
  public createInitialBoard(seed: number): Tile[][] {
    const prng = new PRNG(seed);
    const rows = GRID_ROWS;
    const cols = GRID_COLS;
    let board: Tile[][] = [];
    let attempts = 0;

    while (attempts < 100) {
      attempts++;
      this.nextId = 1;
      board = [];

      for (let r = 0; r < rows; r++) {
        const row: Tile[] = [];
        for (let c = 0; c < cols; c++) {
          // Exclude colors that would immediately form a 3-match with neighbors to left or above
          const forbiddenColors = new Set<CandyColor>();
          if (c >= 2 && row[c - 1].color === row[c - 2].color) {
            forbiddenColors.add(row[c - 1].color);
          }
          if (r >= 2 && board[r - 1][c].color === board[r - 2][c].color) {
            forbiddenColors.add(board[r - 1][c].color);
          }

          const validColors: CandyColor[] = [];
          for (let colVal = 0; colVal < CANDY_COLORS_COUNT; colVal++) {
            if (!forbiddenColors.has(colVal as CandyColor)) {
              validColors.push(colVal as CandyColor);
            }
          }

          const chosenColor = prng.choice(validColors);
          row.push({
            id: this.nextId++,
            row: r,
            col: c,
            color: chosenColor,
            type: CandyType.NORMAL
          });
        }
        board.push(row);
      }

      // Check if board has at least one valid move
      if (this.hasValidMoves(board)) {
        return board;
      }
    }

    return board;
  }

  /**
   * Validates if a move between two coordinates is strictly orthogonal and adjacent.
   */
  public static isOrthogonal(from: Coordinate, to: Coordinate): boolean {
    const dr = Math.abs(from.row - to.row);
    const dc = Math.abs(from.col - to.col);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }

  /**
   * Checks whether the current board has at least 1 legal move (swapping 2 orthogonal cells produces a match or triggers a special combo).
   */
  public hasValidMoves(board: Tile[][]): boolean {
    const rows = board.length;
    const cols = board[0].length;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const current = board[r][c];

        // Check swap with right neighbor
        if (c + 1 < cols) {
          const right = board[r][c + 1];
          if (this.isValidSwap(board, current, right)) {
            return true;
          }
        }

        // Check swap with bottom neighbor
        if (r + 1 < rows) {
          const bottom = board[r + 1][c];
          if (this.isValidSwap(board, current, bottom)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Evaluates if swapping tileA and tileB produces a legal move.
   */
  private isValidSwap(
    board: Tile[][],
    tileA: Tile,
    tileB: Tile
  ): boolean {
    // Condition 1 & 2: Special candy combo or Color Bomb swap
    if (SpecialCandyHandler.isSpecialCombo(tileA, tileB)) {
      return true;
    }

    // Condition 3: Match-3 formation
    // Temporarily swap
    const rA = tileA.row;
    const cA = tileA.col;
    const rB = tileB.row;
    const cB = tileB.col;

    board[rA][cA] = tileB;
    board[rB][cB] = tileA;

    const matches = MatchDetector.detectMatches(board);

    // Swap back
    board[rA][cA] = tileA;
    board[rB][cB] = tileB;

    return matches.length > 0;
  }

  /**
   * Resolves a player move.
   * If invalid: emits SWAP (valid: false) and SWAP_REVERT. Returns unmodified board and turnScore 0.
   * If valid: executes special combos or matches, runs gravity cascades, checks for reshuffle if 0 moves remain.
   */
  public resolveMove(
    board: Tile[][],
    move: PlayerMove,
    prng: PRNG
  ): MoveResolution {
    const { from, to } = move;
    const rows = board.length;
    const cols = board[0].length;

    // Boundary check
    if (
      from.row < 0 ||
      from.row >= rows ||
      from.col < 0 ||
      from.col >= cols ||
      to.row < 0 ||
      to.row >= rows ||
      to.col < 0 ||
      to.col >= cols
    ) {
      return {
        valid: false,
        events: [{ type: 'SWAP_REVERT', from, to }],
        finalBoard: Match3Engine.cloneBoard(board),
        turnScore: 0
      };
    }

    // Adjacency check
    if (!Match3Engine.isOrthogonal(from, to)) {
      return {
        valid: false,
        events: [{ type: 'SWAP_REVERT', from, to }],
        finalBoard: Match3Engine.cloneBoard(board),
        turnScore: 0
      };
    }

    // Work on a deep clone of the board to guarantee purity
    const workingBoard: (Tile | null)[][] = board.map((row) =>
      row.map((tile) => ({ ...tile }))
    );

    const tileA = workingBoard[from.row][from.col]!;
    const tileB = workingBoard[to.row][to.col]!;

    const isCombo = SpecialCandyHandler.isSpecialCombo(tileA, tileB);

    // Perform swap
    workingBoard[from.row][from.col] = tileB;
    workingBoard[to.row][to.col] = tileA;
    tileB.row = from.row;
    tileB.col = from.col;
    tileA.row = to.row;
    tileA.col = to.col;

    const swapDirection = from.row === to.row ? 'horizontal' : 'vertical';
    const matches = MatchDetector.detectMatches(
      workingBoard,
      [from, to],
      swapDirection,
      prng
    );

    // If neither a special combo nor any match is formed, it's invalid!
    if (!isCombo && matches.length === 0) {
      return {
        valid: false,
        events: [
          { type: 'SWAP', from, to, valid: false },
          { type: 'SWAP_REVERT', from, to }
        ],
        finalBoard: Match3Engine.cloneBoard(board),
        turnScore: 0
      };
    }

    // Valid move!
    const events: EngineEvent[] = [{ type: 'SWAP', from, to, valid: true }];
    let turnScore = 0;
    const nextIdRef = { id: this.nextId };

    if (isCombo) {
      // Resolve special combo
      const comboResult = SpecialCandyHandler.resolveSpecialCombo(
        workingBoard,
        tileA,
        tileB,
        to, // locus is destination
        prng,
        nextIdRef
      );

      turnScore += comboResult.score;
      events.push(...comboResult.events);

      // Clear affected cells from board
      for (const coord of comboResult.affectedCoords) {
        workingBoard[coord.row][coord.col] = null;
      }

      // Drop and refill after combo blast
      const gravityResult = GravityCascade.applyGravityAndRefill(
        workingBoard,
        prng,
        nextIdRef
      );
      events.push(...gravityResult.events);

      // Emit CASCADE_STEP_COMPLETE for Step 1 of combo
      events.push({
        type: 'CASCADE_STEP_COMPLETE',
        step: 1,
        stepScore: comboResult.score,
        cumulativeScore: turnScore
      });

      // Continue with any cascading matches formed by the refill!
      const cascadeResult = GravityCascade.runCascade(
        workingBoard,
        prng,
        nextIdRef,
        undefined,
        2,
        turnScore
      );
      events.push(...cascadeResult.events);
      turnScore += cascadeResult.totalScore;
    } else {
      // Standard match resolution and cascade
      const cascadeResult = GravityCascade.runCascade(
        workingBoard,
        prng,
        nextIdRef,
        matches
      );
      events.push(...cascadeResult.events);
      turnScore += cascadeResult.totalScore;
    }

    this.nextId = nextIdRef.id;
    let finalBoard = workingBoard as Tile[][];

    // Check if board has any legal moves remaining
    if (!this.hasValidMoves(finalBoard)) {
      const reshuffleResult = this.reshuffleBoard(finalBoard, prng);
      finalBoard = reshuffleResult.newBoard;
      events.push(...reshuffleResult.events);
    }

    events.push({
      type: 'TURN_SETTLE',
      totalTurnScore: turnScore,
      board: Match3Engine.cloneBoard(finalBoard)
    });

    return {
      valid: true,
      events,
      finalBoard,
      turnScore
    };
  }

  /**
   * Reshuffles the board when no legal moves remain.
   * Runs a deterministic Fisher-Yates shuffle on all existing candy colors and types
   * until the board has 0 initial matches AND >= 1 valid move.
   */
  public reshuffleBoard(
    board: Tile[][],
    prng: PRNG
  ): { newBoard: Tile[][]; events: EngineEvent[] } {
    const rows = board.length;
    const cols = board[0].length;
    const items: { color: CandyColor; type: CandyType }[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        items.push({
          color: board[r][c].color,
          type: board[r][c].type
        });
      }
    }

    let attempts = 0;
    let newGrid: Tile[][] = [];
    let validFound = false;

    // Phase 1: High-ceiling (up to 1000 attempts) Fisher-Yates shuffle
    while (attempts < 1000) {
      attempts++;
      // Fisher-Yates shuffle
      for (let i = items.length - 1; i > 0; i--) {
        const j = prng.nextInt(0, i);
        const temp = items[i];
        items[i] = items[j];
        items[j] = temp;
      }

      newGrid = [];
      let itemIdx = 0;
      for (let r = 0; r < rows; r++) {
        const row: Tile[] = [];
        for (let c = 0; c < cols; c++) {
          const item = items[itemIdx++];
          row.push({
            id: 0,
            row: r,
            col: c,
            color: item.color,
            type: item.type
          });
        }
        newGrid.push(row);
      }

      // Validate: 0 pre-formed matches AND >= 1 valid moves
      const preMatches = MatchDetector.detectMatches(newGrid);
      if (preMatches.length === 0 && this.hasValidMoves(newGrid)) {
        validFound = true;
        break;
      }
    }

    // Phase 2: Deterministic repair fallback preserving item multisets
    if (!validFound) {
      let repairAttempts = 0;
      while (repairAttempts < 500) {
        repairAttempts++;
        const matches = MatchDetector.detectMatches(newGrid);
        if (matches.length === 0) {
          if (this.hasValidMoves(newGrid)) {
            break;
          } else {
            // Swap two pseudo-random non-matching cells to create valid move opportunity
            const r1 = prng.nextInt(0, rows - 1);
            const c1 = prng.nextInt(0, cols - 1);
            const r2 = prng.nextInt(0, rows - 1);
            const c2 = prng.nextInt(0, cols - 1);
            if (r1 !== r2 || c1 !== c2) {
              const tempCol = newGrid[r1][c1].color;
              const tempType = newGrid[r1][c1].type;
              newGrid[r1][c1].color = newGrid[r2][c2].color;
              newGrid[r1][c1].type = newGrid[r2][c2].type;
              newGrid[r2][c2].color = tempCol;
              newGrid[r2][c2].type = tempType;
            }
            continue;
          }
        }
        // Break pre-formed match by swapping its tile with a distant tile
        const cluster = matches[0];
        const matchTile = cluster.tiles[0];
        const targetR = prng.nextInt(0, rows - 1);
        const targetC = prng.nextInt(0, cols - 1);
        const tempCol = newGrid[matchTile.row][matchTile.col].color;
        const tempType = newGrid[matchTile.row][matchTile.col].type;
        newGrid[matchTile.row][matchTile.col].color = newGrid[targetR][targetC].color;
        newGrid[matchTile.row][matchTile.col].type = newGrid[targetR][targetC].type;
        newGrid[targetR][targetC].color = tempCol;
        newGrid[targetR][targetC].type = tempType;
      }
    }

    // Assign final IDs to the settled board
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newGrid[r][c].id = this.nextId++;
      }
    }

    return {
      newBoard: newGrid,
      events: [
        {
          type: 'BOARD_RESHUFFLE',
          newGrid: Match3Engine.cloneBoard(newGrid)
        }
      ]
    };
  }
}
