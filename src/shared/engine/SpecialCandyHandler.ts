import {
  CandyColor,
  CandyType,
  Coordinate,
  EngineEvent,
  Tile
} from '../types';
import {
  GRID_COLS,
  GRID_ROWS,
  SCORE_COLOR_BOMB_TILE,
  SCORE_COMBO_COLOR_BOMB_COLOR_BOMB,
  SCORE_COMBO_COLOR_BOMB_STRIPED,
  SCORE_COMBO_COLOR_BOMB_WRAPPED,
  SCORE_COMBO_STRIPED_STRIPED,
  SCORE_COMBO_STRIPED_WRAPPED,
  SCORE_COMBO_WRAPPED_WRAPPED,
  SCORE_STRIPED_TILE,
  SCORE_WRAPPED_TILE
} from '../constants';
import { PRNG } from '../prng';

export interface SpecialDetonationResult {
  affectedCoords: Coordinate[];
  events: EngineEvent[];
  score: number;
}

export class SpecialCandyHandler {
  /**
   * Checks if a swap between tileA and tileB constitutes a direct special candy combination.
   */
  public static isSpecialCombo(tileA: Tile, tileB: Tile): boolean {
    // Condition 1: Both are specials
    if (tileA.type !== CandyType.NORMAL && tileB.type !== CandyType.NORMAL) {
      return true;
    }
    // Condition 2: Either is Color Bomb (can be swapped with anything)
    if (tileA.type === CandyType.COLOR_BOMB || tileB.type === CandyType.COLOR_BOMB) {
      return true;
    }
    return false;
  }

  /**
   * Resolves direct pairwise special combinations:
   * 1. Color Bomb + Color Bomb (Total board wipe)
   * 2. Color Bomb + Striped (All candies of striped color become striped and detonate)
   * 3. Color Bomb + Wrapped (Annihilates primary color then secondary color)
   * 4. Color Bomb + Normal (Clears all candies of normal candy color)
   * 5. Striped + Striped (Cross beam: entire row + entire col at swap locus)
   * 6. Striped + Wrapped (Giant 3x3 cross: 3 rows + 3 cols wiped clean)
   * 7. Wrapped + Wrapped (5x5 double blast)
   */
  public static resolveSpecialCombo(
    board: (Tile | null)[][],
    tileA: Tile,
    tileB: Tile,
    swapOrigin: Coordinate,
    prng: PRNG,
    nextIdRef: { id: number }
  ): SpecialDetonationResult {
    const rows = board.length;
    const cols = board[0].length;
    const events: EngineEvent[] = [];
    let score = 0;
    const affectedMap = new Map<string, Coordinate>();

    const addCoord = (r: number, c: number) => {
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        affectedMap.set(`${r},${c}`, { row: r, col: c });
      }
    };

    // Case 1: Color Bomb + Color Bomb -> Total Board Apocalypse
    if (
      tileA.type === CandyType.COLOR_BOMB &&
      tileB.type === CandyType.COLOR_BOMB
    ) {
      score += SCORE_COMBO_COLOR_BOMB_COLOR_BOMB;
      const allTiles: { id: number; row: number; col: number }[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = board[r][c];
          if (tile) {
            addCoord(r, c);
            allTiles.push({ id: tile.id, row: r, col: c });
            score += SCORE_COLOR_BOMB_TILE;
          }
        }
      }

      events.push({
        type: 'SPECIAL_DETONATE',
        specialType: 'combo',
        origin: swapOrigin,
        affectedTiles: allTiles
      });

      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score
      };
    }

    // Case 2: Color Bomb + Striped
    if (
      (tileA.type === CandyType.COLOR_BOMB &&
        (tileB.type === CandyType.STRIPED_HORIZONTAL ||
          tileB.type === CandyType.STRIPED_VERTICAL)) ||
      (tileB.type === CandyType.COLOR_BOMB &&
        (tileA.type === CandyType.STRIPED_HORIZONTAL ||
          tileA.type === CandyType.STRIPED_VERTICAL))
    ) {
      const stripedTile = tileA.type === CandyType.COLOR_BOMB ? tileB : tileA;
      const colorBombTile = tileA.type === CandyType.COLOR_BOMB ? tileA : tileB;
      const targetColor = stripedTile.color;

      score += SCORE_COMBO_COLOR_BOMB_STRIPED;
      addCoord(colorBombTile.row, colorBombTile.col);
      addCoord(stripedTile.row, stripedTile.col);

      // Transmute all candies of targetColor to striped candies and detonate them
      const transmutedStripes: Tile[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = board[r][c];
          if (tile && tile.color === targetColor) {
            // Randomize horizontal / vertical stripe
            const newType =
              prng.next() < 0.5
                ? CandyType.STRIPED_HORIZONTAL
                : CandyType.STRIPED_VERTICAL;
            tile.type = newType;
            transmutedStripes.push(tile);
          }
        }
      }

      // Detonate each transmuted stripe (excluding colorBombTile so no random color purge occurs)
      const secondaryResult = this.detonateTilesRecursive(
        board,
        transmutedStripes,
        prng,
        new Set([colorBombTile.id])
      );

      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }

      events.push({
        type: 'SPECIAL_DETONATE',
        specialType: 'combo',
        origin: swapOrigin,
        affectedTiles: Array.from(affectedMap.values()).map((coord) => ({
          id: board[coord.row]?.[coord.col]?.id ?? 0,
          row: coord.row,
          col: coord.col
        }))
      });
      events.push(...secondaryResult.events);

      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    // Case 3: Color Bomb + Wrapped
    if (
      (tileA.type === CandyType.COLOR_BOMB && tileB.type === CandyType.WRAPPED) ||
      (tileB.type === CandyType.COLOR_BOMB && tileA.type === CandyType.WRAPPED)
    ) {
      const wrappedTile = tileA.type === CandyType.COLOR_BOMB ? tileB : tileA;
      const colorBombTile = tileA.type === CandyType.COLOR_BOMB ? tileA : tileB;
      const primaryColor = wrappedTile.color;

      score += SCORE_COMBO_COLOR_BOMB_WRAPPED;
      addCoord(colorBombTile.row, colorBombTile.col);
      addCoord(wrappedTile.row, wrappedTile.col);

      // Count colors to find second most prevalent color
      const colorCounts = new Map<CandyColor, number>();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = board[r][c];
          if (
            tile &&
            tile.color !== CandyColor.NONE &&
            tile.color !== primaryColor
          ) {
            colorCounts.set(tile.color, (colorCounts.get(tile.color) || 0) + 1);
          }
        }
      }

      let secondaryColor: CandyColor | null = null;
      let maxCount = -1;
      for (const [col, count] of colorCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          secondaryColor = col;
        }
      }

      const toDetonate: Tile[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = board[r][c];
          if (tile && tile.id !== colorBombTile.id) {
            if (
              tile.color === primaryColor ||
              (secondaryColor !== null && tile.color === secondaryColor)
            ) {
              addCoord(r, c);
              toDetonate.push(tile);
            }
          }
        }
      }

      const secondaryResult = this.detonateTilesRecursive(
        board,
        toDetonate,
        prng,
        new Set([colorBombTile.id])
      );

      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }

      events.push({
        type: 'SPECIAL_DETONATE',
        specialType: 'combo',
        origin: swapOrigin,
        affectedTiles: Array.from(affectedMap.values()).map((coord) => ({
          id: board[coord.row]?.[coord.col]?.id ?? 0,
          row: coord.row,
          col: coord.col
        }))
      });
      events.push(...secondaryResult.events);

      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    // Case 4: Color Bomb + Normal Candy (Swapping Color Bomb with regular candy)
    if (
      tileA.type === CandyType.COLOR_BOMB ||
      tileB.type === CandyType.COLOR_BOMB
    ) {
      const colorBomb = tileA.type === CandyType.COLOR_BOMB ? tileA : tileB;
      const regularCandy = tileA.type === CandyType.COLOR_BOMB ? tileB : tileA;
      const targetColor = regularCandy.color;

      addCoord(colorBomb.row, colorBomb.col);
      const targetColorTiles: Tile[] = [];
      const specialsToTrigger: Tile[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = board[r][c];
          if (tile && tile.color === targetColor) {
            addCoord(r, c);
            targetColorTiles.push(tile);
            if (tile.type !== CandyType.NORMAL) {
              specialsToTrigger.push(tile);
            }
          }
        }
      }

      // Base score: 200 per tile cleared by color bomb (including the bomb itself)
      score += SCORE_COLOR_BOMB_TILE * (1 + targetColorTiles.length);

      // Trigger any special candies of targetColor recursively
      // Mark colorBomb and all targetColorTiles as visited so colorBomb doesn't fire random color purge
      const secondaryResult = this.detonateTilesRecursive(
        board,
        specialsToTrigger,
        prng,
        new Set([colorBomb.id, ...targetColorTiles.map((t) => t.id)])
      );

      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }

      const affectedTilesList = [
        { id: colorBomb.id, row: colorBomb.row, col: colorBomb.col },
        ...targetColorTiles.map((t) => ({ id: t.id, row: t.row, col: t.col }))
      ];

      events.push({
        type: 'SPECIAL_DETONATE',
        specialType: CandyType.COLOR_BOMB,
        origin: swapOrigin,
        affectedTiles: affectedTilesList
      });
      events.push(...secondaryResult.events);

      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    // Case 5: Striped + Striped -> Cross Blast (+)
    const isStriped = (t: Tile) =>
      t.type === CandyType.STRIPED_HORIZONTAL ||
      t.type === CandyType.STRIPED_VERTICAL;

    if (isStriped(tileA) && isStriped(tileB)) {
      score += SCORE_COMBO_STRIPED_STRIPED;
      const r_swap = swapOrigin.row;
      const c_swap = swapOrigin.col;

      // Entire row r_swap and entire col c_swap
      for (let c = 0; c < cols; c++) addCoord(r_swap, c);
      for (let r = 0; r < rows; r++) addCoord(r, c_swap);

      // Only trigger other specials caught in the cross blast (exclude the swapped pair to avoid duplicate line blasts)
      const specialsToTrigger: Tile[] = [];
      affectedMap.forEach((coord) => {
        const tile = board[coord.row][coord.col];
        if (tile && tile.id !== tileA.id && tile.id !== tileB.id) {
          if (tile.type !== CandyType.NORMAL) {
            specialsToTrigger.push(tile);
          }
        }
      });

      const secondaryResult = this.detonateTilesRecursive(
        board,
        specialsToTrigger,
        prng,
        new Set([tileA.id, tileB.id])
      );

      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }

      events.push({
        type: 'SPECIAL_DETONATE',
        specialType: 'combo',
        origin: swapOrigin,
        affectedTiles: Array.from(affectedMap.values()).map((coord) => ({
          id: board[coord.row]?.[coord.col]?.id ?? 0,
          row: coord.row,
          col: coord.col
        }))
      });
      events.push(...secondaryResult.events);

      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    // Case 6: Striped + Wrapped -> Giant 3x3 Cross Blast (3 rows and 3 cols)
    if (
      (isStriped(tileA) && tileB.type === CandyType.WRAPPED) ||
      (isStriped(tileB) && tileA.type === CandyType.WRAPPED)
    ) {
      score += SCORE_COMBO_STRIPED_WRAPPED;
      const r_swap = swapOrigin.row;
      const c_swap = swapOrigin.col;

      // Rows: r-1, r, r+1
      for (let dr = -1; dr <= 1; dr++) {
        const targetR = r_swap + dr;
        if (targetR >= 0 && targetR < rows) {
          for (let c = 0; c < cols; c++) {
            addCoord(targetR, c);
          }
        }
      }

      // Cols: c-1, c, c+1
      for (let dc = -1; dc <= 1; dc++) {
        const targetC = c_swap + dc;
        if (targetC >= 0 && targetC < cols) {
          for (let r = 0; r < rows; r++) {
            addCoord(r, targetC);
          }
        }
      }

      // Only trigger other specials caught in the giant cross blast
      const specialsToTrigger: Tile[] = [];
      affectedMap.forEach((coord) => {
        const tile = board[coord.row][coord.col];
        if (tile && tile.id !== tileA.id && tile.id !== tileB.id) {
          if (tile.type !== CandyType.NORMAL) {
            specialsToTrigger.push(tile);
          }
        }
      });

      const secondaryResult = this.detonateTilesRecursive(
        board,
        specialsToTrigger,
        prng,
        new Set([tileA.id, tileB.id])
      );

      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }

      events.push({
        type: 'SPECIAL_DETONATE',
        specialType: 'combo',
        origin: swapOrigin,
        affectedTiles: Array.from(affectedMap.values()).map((coord) => ({
          id: board[coord.row]?.[coord.col]?.id ?? 0,
          row: coord.row,
          col: coord.col
        }))
      });
      events.push(...secondaryResult.events);

      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    // Case 7: Wrapped + Wrapped -> Massive 5x5 explosion
    if (tileA.type === CandyType.WRAPPED && tileB.type === CandyType.WRAPPED) {
      score += SCORE_COMBO_WRAPPED_WRAPPED;
      const r_swap = swapOrigin.row;
      const c_swap = swapOrigin.col;

      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          addCoord(r_swap + dr, c_swap + dc);
        }
      }

      const specialsToTrigger: Tile[] = [];
      affectedMap.forEach((coord) => {
        const tile = board[coord.row][coord.col];
        if (tile && tile.id !== tileA.id && tile.id !== tileB.id) {
          if (tile.type !== CandyType.NORMAL) {
            specialsToTrigger.push(tile);
          }
        }
      });

      const secondaryResult = this.detonateTilesRecursive(
        board,
        specialsToTrigger,
        prng,
        new Set([tileA.id, tileB.id])
      );

      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }

      events.push({
        type: 'SPECIAL_DETONATE',
        specialType: 'combo',
        origin: swapOrigin,
        affectedTiles: Array.from(affectedMap.values()).map((coord) => ({
          id: board[coord.row]?.[coord.col]?.id ?? 0,
          row: coord.row,
          col: coord.col
        }))
      });
      events.push(...secondaryResult.events);

      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    return {
      affectedCoords: [],
      events: [],
      score: 0
    };
  }

  /**
   * Breadth-First / Queue-based recursive special candy detonation.
   * Handles chain reactions when specials hit other specials.
   */
  public static detonateTilesRecursive(
    board: (Tile | null)[][],
    initialTiles: Tile[],
    prng: PRNG,
    initialVisitedIds?: Set<number>
  ): SpecialDetonationResult {
    const rows = board.length;
    const cols = board[0].length;
    const events: EngineEvent[] = [];
    let score = 0;

    const visitedTileIds = new Set<number>(initialVisitedIds);
    const affectedCoordsMap = new Map<string, Coordinate>();
    const queue: Tile[] = [...initialTiles];

    const markCoord = (r: number, c: number) => {
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        affectedCoordsMap.set(`${r},${c}`, { row: r, col: c });
      }
    };

    while (queue.length > 0) {
      const tile = queue.shift()!;
      if (visitedTileIds.has(tile.id)) continue;
      visitedTileIds.add(tile.id);
      markCoord(tile.row, tile.col);

      if (tile.type === CandyType.NORMAL) {
        score += SCORE_STRIPED_TILE; // Base clear score
      } else if (tile.type === CandyType.STRIPED_HORIZONTAL) {
        score += SCORE_STRIPED_TILE;
        const rowTiles: { id: number; row: number; col: number }[] = [];
        for (let c = 0; c < cols; c++) {
          markCoord(tile.row, c);
          const target = board[tile.row][c];
          if (target) {
            rowTiles.push({ id: target.id, row: target.row, col: target.col });
            if (!visitedTileIds.has(target.id)) {
              queue.push(target);
            }
          }
        }
        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: CandyType.STRIPED_HORIZONTAL,
          origin: { row: tile.row, col: tile.col },
          affectedTiles: rowTiles
        });
      } else if (tile.type === CandyType.STRIPED_VERTICAL) {
        score += SCORE_STRIPED_TILE;
        const colTiles: { id: number; row: number; col: number }[] = [];
        for (let r = 0; r < rows; r++) {
          markCoord(r, tile.col);
          const target = board[r][tile.col];
          if (target) {
            colTiles.push({ id: target.id, row: target.row, col: target.col });
            if (!visitedTileIds.has(target.id)) {
              queue.push(target);
            }
          }
        }
        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: CandyType.STRIPED_VERTICAL,
          origin: { row: tile.row, col: tile.col },
          affectedTiles: colTiles
        });
      } else if (tile.type === CandyType.WRAPPED) {
        score += SCORE_WRAPPED_TILE;
        const blastTiles1: { id: number; row: number; col: number }[] = [];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const tr = tile.row + dr;
            const tc = tile.col + dc;
            if (tr >= 0 && tr < rows && tc >= 0 && tc < cols) {
              markCoord(tr, tc);
              const target = board[tr][tc];
              if (target) {
                blastTiles1.push({ id: target.id, row: target.row, col: target.col });
                if (!visitedTileIds.has(target.id)) {
                  queue.push(target);
                }
              }
            }
          }
        }
        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: CandyType.WRAPPED,
          origin: { row: tile.row, col: tile.col },
          affectedTiles: blastTiles1
        });

        // Phase 2: Authentic second 3x3 blast per Requirement R1 ("explodes in a 3x3 area twice")
        score += SCORE_WRAPPED_TILE;
        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: CandyType.WRAPPED,
          origin: { row: tile.row, col: tile.col },
          affectedTiles: [...blastTiles1]
        });
      } else if (tile.type === CandyType.COLOR_BOMB) {
        score += SCORE_COLOR_BOMB_TILE;
        // If struck by blast (not swapped), pick random active color on board
        const activeColors = new Set<CandyColor>();
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cand = board[r][c];
            if (cand && cand.color !== CandyColor.NONE && !visitedTileIds.has(cand.id)) {
              activeColors.add(cand.color);
            }
          }
        }

        const colorList = Array.from(activeColors);
        const chosenColor =
          colorList.length > 0 ? prng.choice(colorList) : CandyColor.RED;
        const colorBombAffected: { id: number; row: number; col: number }[] = [];

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cand = board[r][c];
            if (cand && cand.color === chosenColor) {
              markCoord(r, c);
              colorBombAffected.push({ id: cand.id, row: cand.row, col: cand.col });
              if (!visitedTileIds.has(cand.id)) {
                queue.push(cand);
              }
            }
          }
        }

        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: CandyType.COLOR_BOMB,
          origin: { row: tile.row, col: tile.col },
          affectedTiles: colorBombAffected
        });
      }
    }

    return {
      affectedCoords: Array.from(affectedCoordsMap.values()),
      events,
      score
    };
  }
}
