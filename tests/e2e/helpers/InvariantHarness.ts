import { Page, expect } from '@playwright/test';
import { Tile, CandyType, CandyColor } from '../../../src/shared/types';
import { GRID_ROWS, GRID_COLS } from '../../../src/shared/constants';

export class InvariantHarness {
  /**
   * Computes authoritative board hash representation:
   * `${r},${c}:${id}:${color}:${type}|` for all 81 cells in row-major order.
   */
  public static computeBoardHash(board: (Tile | null)[][]): string {
    let hashStr = '';
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const tile = board[r] ? board[r][c] : null;
        if (tile) {
          hashStr += `${r},${c}:${tile.id}:${tile.color}:${tile.type}|`;
        } else {
          hashStr += `${r},${c}:null|`;
        }
      }
    }
    return hashStr;
  }

  /**
   * Waits for all browser pages to finish their visual cascade animations.
   */
  public static async waitForAllClientsToSettle(
    pages: Page[],
    expectedSettledCount?: number,
    timeoutMs = 15000
  ): Promise<void> {
    await Promise.all(
      pages.map(async (page) => {
        if (expectedSettledCount !== undefined) {
          await page.waitForFunction(
            (target) => {
              const api = (window as any).__MATCH_POP__;
              return api && typeof api.getSettledCount === 'function'
                ? api.getSettledCount() >= target
                : true;
            },
            expectedSettledCount,
            { timeout: timeoutMs }
          );
        } else {
          await page.waitForFunction(
            () => {
              const api = (window as any).__MATCH_POP__;
              return api && typeof api.isSettled === 'function' ? api.isSettled() : true;
            },
            null,
            { timeout: timeoutMs }
          );
        }
      })
    );
  }

  /**
   * Asserts 100% board parity across all connected client browser pages and optionally the server board.
   */
  public static async assertBoardParity(
    pages: Page[],
    serverBoard?: Tile[][],
    contextMessage = ''
  ): Promise<string> {
    // 1. Fetch hashes and board states from all client pages
    const clientData = await Promise.all(
      pages.map(async (page, index) => {
        const hash = await page.evaluate(() => (window as any).__MATCH_POP__.getBoardHash());
        const board = await page.evaluate(() => (window as any).__MATCH_POP__.getBoardState());
        return { index, hash, board };
      })
    );

    const firstHash = clientData[0].hash;
    expect(firstHash).toBeDefined();
    expect(firstHash.length).toBeGreaterThan(100);

    // 2. Validate client-to-client parity
    for (let i = 1; i < clientData.length; i++) {
      if (clientData[i].hash !== firstHash) {
        const diff = this.generateHashDiff(firstHash, clientData[i].hash, 'Client 0', `Client ${i}`);
        throw new Error(`[DESYNC DETECTED: CLIENT vs CLIENT] ${contextMessage}\n${diff}`);
      }
    }

    // 3. Validate client-to-server parity if provided
    if (serverBoard) {
      const serverHash = this.computeBoardHash(serverBoard);
      if (serverHash !== firstHash) {
        const diff = this.generateHashDiff(serverHash, firstHash, 'Server Board', 'Client 0');
        throw new Error(`[DESYNC DETECTED: SERVER vs CLIENT] ${contextMessage}\n${diff}`);
      }
    }

    // 4. Validate Structural Invariants on every board
    for (const { index, board } of clientData) {
      this.validateStructuralInvariants(board, `Client ${index}`);
    }
    if (serverBoard) {
      this.validateStructuralInvariants(serverBoard, 'Server Board');
    }

    return firstHash;
  }

  /**
   * Validates structural invariants on a settled board:
   * - Strict 9x9 dimensions
   * - Exactly 81 non-null tiles
   * - Strict coordinate integrity (tile.row === r, tile.col === c)
   * - Exactly 81 unique IDs
   * - Valid colors and candy types
   */
  public static validateStructuralInvariants(board: Tile[][], sourceName: string): void {
    if (!board || board.length !== GRID_ROWS) {
      throw new Error(`[${sourceName}] Invalid row count: expected ${GRID_ROWS}, got ${board?.length}`);
    }

    const seenIds = new Set<number>();
    for (let r = 0; r < GRID_ROWS; r++) {
      if (!board[r] || board[r].length !== GRID_COLS) {
        throw new Error(`[${sourceName}] Invalid col count at row ${r}: expected ${GRID_COLS}, got ${board[r]?.length}`);
      }
      for (let c = 0; c < GRID_COLS; c++) {
        const tile = board[r][c];
        if (!tile) {
          throw new Error(`[${sourceName}] Null tile found at (${r}, ${c}) on settled board`);
        }
        if (tile.row !== r || tile.col !== c) {
          throw new Error(`[${sourceName}] Tile coordinate mismatch at (${r}, ${c}): tile has row=${tile.row}, col=${tile.col}`);
        }
        if (seenIds.has(tile.id)) {
          throw new Error(`[${sourceName}] Duplicate tile ID ${tile.id} found at (${r}, ${c})`);
        }
        seenIds.add(tile.id);

        if (tile.type === CandyType.COLOR_BOMB) {
          if (tile.color !== CandyColor.NONE) {
            throw new Error(`[${sourceName}] Color Bomb at (${r}, ${c}) has invalid color ${tile.color}`);
          }
        } else {
          if (tile.color < 0 || tile.color > 5) {
            throw new Error(`[${sourceName}] Tile at (${r}, ${c}) has out-of-range color ${tile.color}`);
          }
        }
      }
    }

    if (seenIds.size !== GRID_ROWS * GRID_COLS) {
      throw new Error(`[${sourceName}] Expected ${GRID_ROWS * GRID_COLS} unique IDs, found ${seenIds.size}`);
    }
  }

  /**
   * Generates a side-by-side cellular diff showing up to 15 mismatched cells between two board hashes.
   */
  public static generateHashDiff(hashA: string, hashB: string, labelA = 'Expected', labelB = 'Actual'): string {
    const cellsA = hashA.split('|').filter(Boolean);
    const cellsB = hashB.split('|').filter(Boolean);
    const diffs: string[] = [];

    const maxLen = Math.max(cellsA.length, cellsB.length);
    for (let i = 0; i < maxLen; i++) {
      const a = cellsA[i] || '<missing>';
      const b = cellsB[i] || '<missing>';
      if (a !== b) {
        diffs.push(`  Cell [${i}] -> ${labelA}: "${a}"  vs  ${labelB}: "${b}"`);
      }
    }

    return (
      `=== BOARD DIFF: ${labelA} vs ${labelB} (${diffs.length} mismatched cells) ===\n` +
      diffs.slice(0, 15).join('\n') +
      (diffs.length > 15 ? `\n  ... and ${diffs.length - 15} more mismatched cells` : '')
    );
  }
}
