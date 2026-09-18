import {
  CandyColor,
  CandyType,
  Coordinate,
  HorizontalMatchRun,
  MatchCluster,
  Tile,
  VerticalMatchRun
} from '../types';
import { GRID_COLS, GRID_ROWS } from '../constants';
import { PRNG } from '../prng';

export class MatchDetector {
  /**
   * Scans the grid for all horizontal contiguous runs >= 3 matching colors (ignoring CandyColor.NONE).
   */
  public static findHorizontalRuns(board: (Tile | null)[][]): HorizontalMatchRun[] {
    const runs: HorizontalMatchRun[] = [];
    const rows = board.length;
    const cols = board[0].length;

    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        const tile = board[r][c];
        if (!tile || tile.color === CandyColor.NONE) {
          c++;
          continue;
        }

        const color = tile.color;
        let endC = c;
        while (endC + 1 < cols && board[r][endC + 1]?.color === color) {
          endC++;
        }

        const length = endC - c + 1;
        if (length >= 3) {
          runs.push({
            row: r,
            startCol: c,
            endCol: endC,
            length,
            color
          });
        }
        c = endC + 1;
      }
    }
    return runs;
  }

  /**
   * Scans the grid for all vertical contiguous runs >= 3 matching colors (ignoring CandyColor.NONE).
   */
  public static findVerticalRuns(board: (Tile | null)[][]): VerticalMatchRun[] {
    const runs: VerticalMatchRun[] = [];
    const rows = board.length;
    const cols = board[0].length;

    for (let c = 0; c < cols; c++) {
      let r = 0;
      while (r < rows) {
        const tile = board[r][c];
        if (!tile || tile.color === CandyColor.NONE) {
          r++;
          continue;
        }

        const color = tile.color;
        let endR = r;
        while (endR + 1 < rows && board[endR + 1][c]?.color === color) {
          endR++;
        }

        const length = endR - r + 1;
        if (length >= 3) {
          runs.push({
            col: c,
            startRow: r,
            endRow: endR,
            length,
            color
          });
        }
        r = endR + 1;
      }
    }
    return runs;
  }

  /**
   * 2-Pass sweep and intersection grouping with shape hierarchy:
   * 1. 5-in-a-line straight -> Color Bomb
   * 2. T/L/Cross intersection (>=3 horiz + >=3 vert sharing an intersection) -> Wrapped Candy
   * 3. 4-in-a-line straight -> Striped Candy (vertical if formed horizontally or horizontal if formed vertically, or PRNG)
   * 4. 3-in-a-line basic -> Basic Match
   *
   * @param board The 2D board
   * @param swappedCoords Optional coordinates involved in player swap (preferred anchors)
   * @param swapDirection Optional 'horizontal' | 'vertical' direction of player swap
   * @param prng Seeded PRNG for random stripe direction during cascades
   */
  public static detectMatches(
    board: (Tile | null)[][],
    swappedCoords?: Coordinate[],
    swapDirection?: 'horizontal' | 'vertical',
    prng?: PRNG
  ): MatchCluster[] {
    const hRuns = this.findHorizontalRuns(board);
    const vRuns = this.findVerticalRuns(board);

    if (hRuns.length === 0 && vRuns.length === 0) {
      return [];
    }

    const clusters: MatchCluster[] = [];

    // Track which runs have been consumed into clusters
    const usedHRuns = new Set<number>();
    const usedVRuns = new Set<number>();

    // Helper: find if a coordinate is in swappedCoords
    const isSwapped = (r: number, c: number) => {
      if (!swappedCoords) return false;
      return swappedCoords.some((coord) => coord.row === r && coord.col === c);
    };

    // Priority 1: Check for 5-in-a-line runs (Color Bomb)
    // Horizontal 5+
    hRuns.forEach((hRun, hIdx) => {
      if (hRun.length >= 5) {
        usedHRuns.add(hIdx);
        const tiles: Coordinate[] = [];
        for (let c = hRun.startCol; c <= hRun.endCol; c++) {
          tiles.push({ row: hRun.row, col: c });
        }
        // Anchor: preferred swapped tile, otherwise middle tile
        let anchor = tiles.find((t) => isSwapped(t.row, t.col));
        if (!anchor) {
          const midIdx = Math.floor(tiles.length / 2);
          anchor = tiles[midIdx];
        }

        clusters.push({
          color: hRun.color,
          tiles,
          shape: 'line5',
          anchor,
          spawnType: CandyType.COLOR_BOMB
        });
      }
    });

    // Vertical 5+
    vRuns.forEach((vRun, vIdx) => {
      if (vRun.length >= 5) {
        usedVRuns.add(vIdx);
        const tiles: Coordinate[] = [];
        for (let r = vRun.startRow; r <= vRun.endRow; r++) {
          tiles.push({ row: r, col: vRun.col });
        }
        let anchor = tiles.find((t) => isSwapped(t.row, t.col));
        if (!anchor) {
          const midIdx = Math.floor(tiles.length / 2);
          anchor = tiles[midIdx];
        }

        clusters.push({
          color: vRun.color,
          tiles,
          shape: 'line5',
          anchor,
          spawnType: CandyType.COLOR_BOMB
        });
      }
    });

    // Priority 2: Check for T/L/Cross intersections between unused H and V runs of the same color
    for (let hIdx = 0; hIdx < hRuns.length; hIdx++) {
      if (usedHRuns.has(hIdx)) continue;
      const hRun = hRuns[hIdx];

      for (let vIdx = 0; vIdx < vRuns.length; vIdx++) {
        if (usedVRuns.has(vIdx)) continue;
        const vRun = vRuns[vIdx];

        if (hRun.color === vRun.color) {
          // Check intersection: does vRun.col lie in [hRun.startCol, hRun.endCol] AND hRun.row lie in [vRun.startRow, vRun.endRow]?
          if (
            vRun.col >= hRun.startCol &&
            vRun.col <= hRun.endCol &&
            hRun.row >= vRun.startRow &&
            hRun.row <= vRun.endRow
          ) {
            // Intersection point is (hRun.row, vRun.col)
            const intersectionCoord: Coordinate = { row: hRun.row, col: vRun.col };
            usedHRuns.add(hIdx);
            usedVRuns.add(vIdx);

            const tileSet = new Map<string, Coordinate>();
            for (let c = hRun.startCol; c <= hRun.endCol; c++) {
              tileSet.set(`${hRun.row},${c}`, { row: hRun.row, col: c });
            }
            for (let r = vRun.startRow; r <= vRun.endRow; r++) {
              tileSet.set(`${r},${vRun.col}`, { row: r, col: vRun.col });
            }

            clusters.push({
              color: hRun.color,
              tiles: Array.from(tileSet.values()),
              shape: 't_l_cross',
              anchor: intersectionCoord,
              spawnType: CandyType.WRAPPED
            });
            break;
          }
        }
      }
    }

    // Priority 3: 4-in-a-line runs (Striped Candy)
    // Horizontal 4-in-a-line
    hRuns.forEach((hRun, hIdx) => {
      if (usedHRuns.has(hIdx)) return;
      if (hRun.length === 4) {
        usedHRuns.add(hIdx);
        const tiles: Coordinate[] = [];
        for (let c = hRun.startCol; c <= hRun.endCol; c++) {
          tiles.push({ row: hRun.row, col: c });
        }
        let anchor = tiles.find((t) => isSwapped(t.row, t.col));
        if (!anchor) {
          anchor = tiles[1]; // default index 1
        }

        // Stripe direction determination:
        // In Candy Crush: Swapping horizontally creates a vertical stripe (beams vertical).
        // Swapping vertically creates a horizontal stripe (beams horizontal).
        // If cascade: random 50/50.
        let spawnType: CandyType;
        if (swapDirection === 'horizontal') {
          spawnType = CandyType.STRIPED_VERTICAL;
        } else if (swapDirection === 'vertical') {
          spawnType = CandyType.STRIPED_HORIZONTAL;
        } else {
          spawnType = (prng ? prng.next() < 0.5 : Math.random() < 0.5)
            ? CandyType.STRIPED_HORIZONTAL
            : CandyType.STRIPED_VERTICAL;
        }

        clusters.push({
          color: hRun.color,
          tiles,
          shape: 'line4',
          anchor,
          spawnType
        });
      }
    });

    // Vertical 4-in-a-line
    vRuns.forEach((vRun, vIdx) => {
      if (usedVRuns.has(vIdx)) return;
      if (vRun.length === 4) {
        usedVRuns.add(vIdx);
        const tiles: Coordinate[] = [];
        for (let r = vRun.startRow; r <= vRun.endRow; r++) {
          tiles.push({ row: r, col: vRun.col });
        }
        let anchor = tiles.find((t) => isSwapped(t.row, t.col));
        if (!anchor) {
          anchor = tiles[1];
        }

        let spawnType: CandyType;
        if (swapDirection === 'vertical') {
          spawnType = CandyType.STRIPED_HORIZONTAL;
        } else if (swapDirection === 'horizontal') {
          spawnType = CandyType.STRIPED_VERTICAL;
        } else {
          spawnType = (prng ? prng.next() < 0.5 : Math.random() < 0.5)
            ? CandyType.STRIPED_HORIZONTAL
            : CandyType.STRIPED_VERTICAL;
        }

        clusters.push({
          color: vRun.color,
          tiles,
          shape: 'line4',
          anchor,
          spawnType
        });
      }
    });

    // Priority 4: 3-in-a-line basic matches
    hRuns.forEach((hRun, hIdx) => {
      if (usedHRuns.has(hIdx)) return;
      usedHRuns.add(hIdx);
      const tiles: Coordinate[] = [];
      for (let c = hRun.startCol; c <= hRun.endCol; c++) {
        tiles.push({ row: hRun.row, col: c });
      }
      clusters.push({
        color: hRun.color,
        tiles,
        shape: 'line3',
        anchor: tiles[1]
      });
    });

    vRuns.forEach((vRun, vIdx) => {
      if (usedVRuns.has(vIdx)) return;
      usedVRuns.add(vIdx);
      const tiles: Coordinate[] = [];
      for (let r = vRun.startRow; r <= vRun.endRow; r++) {
        tiles.push({ row: r, col: vRun.col });
      }
      clusters.push({
        color: vRun.color,
        tiles,
        shape: 'line3',
        anchor: tiles[1]
      });
    });

    return clusters;
  }
}
