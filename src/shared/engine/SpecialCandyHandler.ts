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
    // Condition 3: Fish swapped with normal candy of same color activates fish
    if (
      (tileA.type === CandyType.FISH && tileB.type === CandyType.NORMAL && tileA.color === tileB.color) ||
      (tileB.type === CandyType.FISH && tileA.type === CandyType.NORMAL && tileA.color === tileB.color)
    ) {
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
        const tile = board[r][c];
        // Ingredients are indestructible
        if (tile && (tile.type === CandyType.INGREDIENT_CHERRY || tile.type === CandyType.INGREDIENT_CHESTNUT)) {
          return;
        }
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

    // Case 8: Fish + Fish -> Spawns 3 fish swarming targets!
    if (tileA.type === CandyType.FISH && tileB.type === CandyType.FISH) {
      score += 2000;
      addCoord(tileA.row, tileA.col);
      addCoord(tileB.row, tileB.col);
      const targets = this.findSmartTargets(board, 3, prng, new Set([tileA.id, tileB.id]));
      const specialsToTrigger: Tile[] = [];

      for (const tgt of targets) {
        addCoord(tgt.row, tgt.col);
        events.push({
          type: 'FISH_SWIM',
          from: swapOrigin,
          target: { row: tgt.row, col: tgt.col },
          fishColor: tileA.color
        });
        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: CandyType.FISH,
          origin: { row: tgt.row, col: tgt.col },
          affectedTiles: [{ id: tgt.id, row: tgt.row, col: tgt.col }]
        });
        specialsToTrigger.push(tgt);
      }

      const secondaryResult = this.detonateTilesRecursive(
        board,
        specialsToTrigger,
        prng,
        new Set([tileA.id, tileB.id])
      );
      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }
      events.push(...secondaryResult.events);
      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    // Case 9: Fish + Striped -> Flying striped fish, detonates cross beam at target!
    if (
      (tileA.type === CandyType.FISH && (tileB.type === CandyType.STRIPED_HORIZONTAL || tileB.type === CandyType.STRIPED_VERTICAL)) ||
      (tileB.type === CandyType.FISH && (tileA.type === CandyType.STRIPED_HORIZONTAL || tileA.type === CandyType.STRIPED_VERTICAL))
    ) {
      score += 1500;
      addCoord(tileA.row, tileA.col);
      addCoord(tileB.row, tileB.col);
      const fishTile = tileA.type === CandyType.FISH ? tileA : tileB;
      const targets = this.findSmartTargets(board, 1, prng, new Set([tileA.id, tileB.id]));
      const specialsToTrigger: Tile[] = [];

      if (targets.length > 0) {
        const tgt = targets[0];
        addCoord(tgt.row, tgt.col);
        for (let c = 0; c < cols; c++) addCoord(tgt.row, c);
        for (let r = 0; r < rows; r++) addCoord(r, tgt.col);

        events.push({
          type: 'FISH_SWIM',
          from: swapOrigin,
          target: { row: tgt.row, col: tgt.col },
          fishColor: fishTile.color,
          comboType: CandyType.STRIPED_HORIZONTAL
        });
        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: 'combo',
          origin: { row: tgt.row, col: tgt.col },
          affectedTiles: Array.from(affectedMap.values()).map((coord) => ({
            id: board[coord.row]?.[coord.col]?.id ?? 0,
            row: coord.row,
            col: coord.col
          }))
        });

        affectedMap.forEach((coord) => {
          const t = board[coord.row]?.[coord.col];
          if (t && t.id !== tileA.id && t.id !== tileB.id && t.type !== CandyType.NORMAL) {
            specialsToTrigger.push(t);
          }
        });
      }

      const secondaryResult = this.detonateTilesRecursive(
        board,
        specialsToTrigger,
        prng,
        new Set([tileA.id, tileB.id])
      );
      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }
      events.push(...secondaryResult.events);
      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    // Case 10: Fish + Wrapped -> Flying wrapped fish, detonates 3x3 at target!
    if (
      (tileA.type === CandyType.FISH && tileB.type === CandyType.WRAPPED) ||
      (tileB.type === CandyType.FISH && tileA.type === CandyType.WRAPPED)
    ) {
      score += 1800;
      addCoord(tileA.row, tileA.col);
      addCoord(tileB.row, tileB.col);
      const fishTile = tileA.type === CandyType.FISH ? tileA : tileB;
      const targets = this.findSmartTargets(board, 1, prng, new Set([tileA.id, tileB.id]));
      const specialsToTrigger: Tile[] = [];

      if (targets.length > 0) {
        const tgt = targets[0];
        addCoord(tgt.row, tgt.col);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            addCoord(tgt.row + dr, tgt.col + dc);
          }
        }

        events.push({
          type: 'FISH_SWIM',
          from: swapOrigin,
          target: { row: tgt.row, col: tgt.col },
          fishColor: fishTile.color,
          comboType: CandyType.WRAPPED
        });
        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: CandyType.WRAPPED,
          origin: { row: tgt.row, col: tgt.col },
          affectedTiles: Array.from(affectedMap.values()).map((coord) => ({
            id: board[coord.row]?.[coord.col]?.id ?? 0,
            row: coord.row,
            col: coord.col
          }))
        });

        affectedMap.forEach((coord) => {
          const t = board[coord.row]?.[coord.col];
          if (t && t.id !== tileA.id && t.id !== tileB.id && t.type !== CandyType.NORMAL) {
            specialsToTrigger.push(t);
          }
        });
      }

      const secondaryResult = this.detonateTilesRecursive(
        board,
        specialsToTrigger,
        prng,
        new Set([tileA.id, tileB.id])
      );
      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }
      events.push(...secondaryResult.events);
      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    // Case 11: Color Bomb + Fish -> All candies of fish color become Fish and swim!
    if (
      (tileA.type === CandyType.COLOR_BOMB && tileB.type === CandyType.FISH) ||
      (tileB.type === CandyType.COLOR_BOMB && tileA.type === CandyType.FISH)
    ) {
      score += 2500;
      addCoord(tileA.row, tileA.col);
      addCoord(tileB.row, tileB.col);
      const fishTile = tileA.type === CandyType.FISH ? tileA : tileB;
      const targetColor = fishTile.color;

      const convertedFish: Tile[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cand = board[r][c];
          if (cand && cand.color === targetColor) {
            cand.type = CandyType.FISH;
            convertedFish.push(cand);
            addCoord(r, c);
          }
        }
      }

      const targets = this.findSmartTargets(board, convertedFish.length, prng, new Set([tileA.id, tileB.id, ...convertedFish.map(f => f.id)]));
      const specialsToTrigger: Tile[] = [];

      targets.forEach((tgt, i) => {
        const fromTile = convertedFish[i] || fishTile;
        addCoord(tgt.row, tgt.col);
        events.push({
          type: 'FISH_SWIM',
          from: { row: fromTile.row, col: fromTile.col },
          target: { row: tgt.row, col: tgt.col },
          fishColor: targetColor
        });
        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: CandyType.FISH,
          origin: { row: tgt.row, col: tgt.col },
          affectedTiles: [{ id: tgt.id, row: tgt.row, col: tgt.col }]
        });
        specialsToTrigger.push(tgt);
      });

      const secondaryResult = this.detonateTilesRecursive(
        board,
        specialsToTrigger,
        prng,
        new Set([tileA.id, tileB.id, ...convertedFish.map(f => f.id)])
      );
      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }
      events.push(...secondaryResult.events);
      return {
        affectedCoords: Array.from(affectedMap.values()),
        events,
        score: score + secondaryResult.score
      };
    }

    // Case 12: Fish + Normal (same color) -> Fish swims to a target!
    if (
      (tileA.type === CandyType.FISH && tileB.type === CandyType.NORMAL && tileA.color === tileB.color) ||
      (tileB.type === CandyType.FISH && tileA.type === CandyType.NORMAL && tileA.color === tileB.color)
    ) {
      score += 1000;
      addCoord(tileA.row, tileA.col);
      addCoord(tileB.row, tileB.col);
      const fishTile = tileA.type === CandyType.FISH ? tileA : tileB;
      const targets = this.findSmartTargets(board, 1, prng, new Set([tileA.id, tileB.id]));
      const specialsToTrigger: Tile[] = [];

      if (targets.length > 0) {
        const tgt = targets[0];
        addCoord(tgt.row, tgt.col);
        events.push({
          type: 'FISH_SWIM',
          from: swapOrigin,
          target: { row: tgt.row, col: tgt.col },
          fishColor: fishTile.color
        });
        events.push({
          type: 'SPECIAL_DETONATE',
          specialType: CandyType.FISH,
          origin: { row: tgt.row, col: tgt.col },
          affectedTiles: [{ id: tgt.id, row: tgt.row, col: tgt.col }]
        });
        specialsToTrigger.push(tgt);
      }

      const secondaryResult = this.detonateTilesRecursive(
        board,
        specialsToTrigger,
        prng,
        new Set([tileA.id, tileB.id])
      );
      for (const coord of secondaryResult.affectedCoords) {
        addCoord(coord.row, coord.col);
      }
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
   * Finds smart targets across the board for Swedish Fish homing.
   */
  public static findSmartTargets(
    board: (Tile | null)[][],
    count: number,
    prng: PRNG,
    excludeIds: Set<number>
  ): Tile[] {
    const rows = board.length;
    const cols = board[0].length;
    const targets: Tile[] = [];
    const chosenIds = new Set<number>(excludeIds);

    const candidateUnderIngredients: Tile[] = [];
    const candidateSpecials: Tile[] = [];
    const candidateNormals: Tile[] = [];

    // Scan for candidates below ingredients first
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ing = board[r][c];
        if (ing && (ing.type === CandyType.INGREDIENT_CHERRY || ing.type === CandyType.INGREDIENT_CHESTNUT)) {
          for (let belowR = r + 1; belowR < rows; belowR++) {
            const under = board[belowR][c];
            if (under && !chosenIds.has(under.id) && under.type !== CandyType.INGREDIENT_CHERRY && under.type !== CandyType.INGREDIENT_CHESTNUT) {
              candidateUnderIngredients.push(under);
            }
          }
        }
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cand = board[r][c];
        if (cand && !chosenIds.has(cand.id)) {
          if (cand.type !== CandyType.NORMAL && cand.type !== CandyType.INGREDIENT_CHERRY && cand.type !== CandyType.INGREDIENT_CHESTNUT) {
            candidateSpecials.push(cand);
          } else if (cand.type !== CandyType.INGREDIENT_CHERRY && cand.type !== CandyType.INGREDIENT_CHESTNUT) {
            candidateNormals.push(cand);
          }
        }
      }
    }

    while (targets.length < count) {
      let chosen: Tile | null = null;
      if (candidateUnderIngredients.length > 0) {
        chosen = candidateUnderIngredients.shift()!;
      } else if (candidateSpecials.length > 0) {
        const idx = prng.nextInt(0, candidateSpecials.length - 1);
        chosen = candidateSpecials.splice(idx, 1)[0];
      } else if (candidateNormals.length > 0) {
        const idx = prng.nextInt(0, candidateNormals.length - 1);
        chosen = candidateNormals.splice(idx, 1)[0];
      } else {
        break;
      }

      if (chosen && !chosenIds.has(chosen.id)) {
        chosenIds.add(chosen.id);
        targets.push(chosen);
      }
    }

    return targets;
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
        const t = board[r][c];
        if (t && (t.type === CandyType.INGREDIENT_CHERRY || t.type === CandyType.INGREDIENT_CHESTNUT)) {
          return;
        }
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
      } else if (tile.type === CandyType.FISH) {
        score += SCORE_WRAPPED_TILE;
        const targets = this.findSmartTargets(board, 1, prng, visitedTileIds);
        if (targets.length > 0) {
          const bestTarget = targets[0];
          markCoord(bestTarget.row, bestTarget.col);
          if (!visitedTileIds.has(bestTarget.id)) {
            queue.push(bestTarget);
          }

          events.push({
            type: 'FISH_SWIM',
            from: { row: tile.row, col: tile.col },
            target: { row: bestTarget.row, col: bestTarget.col },
            fishColor: tile.color
          });

          events.push({
            type: 'SPECIAL_DETONATE',
            specialType: CandyType.FISH,
            origin: { row: bestTarget.row, col: bestTarget.col },
            affectedTiles: [{ id: bestTarget.id, row: bestTarget.row, col: bestTarget.col }]
          });
        }
      }
    }

    return {
      affectedCoords: Array.from(affectedCoordsMap.values()),
      events,
      score
    };
  }
}
