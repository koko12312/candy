import {
  CandyColor,
  CandyType,
  Coordinate,
  EngineEvent,
  MatchCluster,
  Tile
} from '../types';
import {
  CANDY_COLORS_COUNT,
  SCORE_BASE_TILE
} from '../constants';
import { PRNG } from '../prng';
import { MatchDetector } from './MatchDetector';
import { SpecialCandyHandler } from './SpecialCandyHandler';

export interface CascadeStepResult {
  settled: boolean;
  events: EngineEvent[];
  stepScore: number;
}

export class GravityCascade {
  /**
   * Drops non-empty tiles down to compact columns, then refills empty cells
   * at the top of each column using the deterministic PRNG.
   *
   * @param board The active 2D grid
   * @param prng Seeded PRNG for spawning new candy colors
   * @param nextIdRef Monotonically increasing ID counter for newly spawned tiles
   */
  public static applyGravityAndRefill(
    board: (Tile | null)[][],
    prng: PRNG,
    nextIdRef: { id: number }
  ): { events: EngineEvent[] } {
    const rows = board.length;
    const cols = board[0].length;
    const events: EngineEvent[] = [];

    const dropList: { id: number; fromRow: number; toRow: number; col: number }[] = [];
    const spawnList: { id: number; row: number; col: number; color: CandyColor; type: CandyType }[] = [];

    for (let c = 0; c < cols; c++) {
      let writeRow = rows - 1;

      // Scan from bottom to top for existing non-null tiles
      for (let r = rows - 1; r >= 0; r--) {
        const tile = board[r][c];
        if (tile !== null) {
          if (r !== writeRow) {
            dropList.push({
              id: tile.id,
              fromRow: r,
              toRow: writeRow,
              col: c
            });
            tile.row = writeRow;
            tile.col = c;
            board[writeRow][c] = tile;
            board[r][c] = null;
          }
          writeRow--;
        }
      }

      // Remaining slots above writeRow must be refilled
      for (let r = writeRow; r >= 0; r--) {
        const randomColor = prng.nextInt(0, CANDY_COLORS_COUNT - 1) as CandyColor;
        const newTile: Tile = {
          id: nextIdRef.id++,
          row: r,
          col: c,
          color: randomColor,
          type: CandyType.NORMAL
        };
        board[r][c] = newTile;
        spawnList.push({
          id: newTile.id,
          row: r,
          col: c,
          color: newTile.color,
          type: newTile.type
        });
      }
    }

    if (dropList.length > 0) {
      events.push({
        type: 'GRAVITY_DROP',
        drops: dropList
      });
    }

    if (spawnList.length > 0) {
      events.push({
        type: 'REFILL_SPAWN',
        spawns: spawnList
      });
    }

    return { events };
  }

  /**
   * Executes the cascade simulation loop until the board settles with zero matches.
   * Tracks combo step multiplier: multiplier k = 1 for step 1, 2 for step 2, etc.
   *
   * @param board The active 2D grid
   * @param prng Seeded PRNG
   * @param nextIdRef Monotonically increasing ID counter
   * @param initialClusters Optional pre-detected clusters for step 1
   */
  public static runCascade(
    board: (Tile | null)[][],
    prng: PRNG,
    nextIdRef: { id: number },
    initialClusters?: MatchCluster[],
    initialStep: number = 1,
    initialCumulativeScore: number = 0
  ): { events: EngineEvent[]; totalScore: number } {
    const allEvents: EngineEvent[] = [];
    let totalScore = 0;
    let step = initialStep;
    let cumulative = initialCumulativeScore;

    let currentClusters = initialClusters ?? MatchDetector.detectMatches(board, undefined, undefined, prng);

    while (currentClusters.length > 0 && step <= 100) {
      let stepBaseScore = 0;
      const coordsToDestroy = new Map<string, Coordinate>();
      const specialsToDetonate: Tile[] = [];
      const newSpecialsToSpawn: {
        id: number;
        anchor: Coordinate;
        color: CandyColor;
        type: CandyType;
      }[] = [];

      for (const cluster of currentClusters) {
        stepBaseScore += cluster.tiles.length * SCORE_BASE_TILE;

        // Record tiles for MATCH_FOUND event
        const matchedTileData = cluster.tiles.map((coord) => {
          const t = board[coord.row][coord.col];
          return {
            id: t?.id ?? 0,
            row: coord.row,
            col: coord.col,
            color: cluster.color
          };
        });

        // Check if a special candy should spawn at anchor
        let spawnSpecialInfo: { id: number; row: number; col: number; type: CandyType; color: CandyColor } | undefined = undefined;
        if (cluster.spawnType) {
          const specialId = nextIdRef.id++;
          const spawnColor =
            cluster.spawnType === CandyType.COLOR_BOMB
              ? CandyColor.NONE
              : cluster.color;

          spawnSpecialInfo = {
            id: specialId,
            row: cluster.anchor.row,
            col: cluster.anchor.col,
            type: cluster.spawnType,
            color: spawnColor
          };

          newSpecialsToSpawn.push({
            id: specialId,
            anchor: cluster.anchor,
            color: spawnColor,
            type: cluster.spawnType
          });
        }

        allEvents.push({
          type: 'MATCH_FOUND',
          step,
          tiles: matchedTileData,
          spawnSpecial: spawnSpecialInfo
        });

        // Mark tiles for destruction
        for (const coord of cluster.tiles) {
          coordsToDestroy.set(`${coord.row},${coord.col}`, coord);
          const t = board[coord.row][coord.col];
          if (t && t.type !== CandyType.NORMAL) {
            specialsToDetonate.push(t);
          }
        }
      }

      // If any existing special candies were caught in the match, detonate them recursively!
      if (specialsToDetonate.length > 0) {
        const detonationResult = SpecialCandyHandler.detonateTilesRecursive(
          board,
          specialsToDetonate,
          prng
        );
        stepBaseScore += detonationResult.score;
        allEvents.push(...detonationResult.events);
        for (const coord of detonationResult.affectedCoords) {
          coordsToDestroy.set(`${coord.row},${coord.col}`, coord);
        }
      }

      // Destroy matched/blasted tiles on the board
      for (const coord of coordsToDestroy.values()) {
        board[coord.row][coord.col] = null;
      }

      // Place newly created special candies at their anchors
      for (const sp of newSpecialsToSpawn) {
        board[sp.anchor.row][sp.anchor.col] = {
          id: sp.id,
          row: sp.anchor.row,
          col: sp.anchor.col,
          color: sp.color,
          type: sp.type
        };
      }

      // Gravity compaction & refill
      const gravityResult = this.applyGravityAndRefill(board, prng, nextIdRef);
      allEvents.push(...gravityResult.events);

      const stepScore = stepBaseScore * step;
      totalScore += stepScore;
      cumulative += stepScore;

      allEvents.push({
        type: 'CASCADE_STEP_COMPLETE',
        step,
        stepScore,
        cumulativeScore: cumulative
      });

      step++;
      // Check for cascading matches formed by newly dropped candies
      currentClusters = MatchDetector.detectMatches(board, undefined, undefined, prng);
    }

    return {
      events: allEvents,
      totalScore
    };
  }
}
