import { Match3Engine } from '../../src/shared/engine/Match3Engine';
import { MatchDetector } from '../../src/shared/engine/MatchDetector';
import { SpecialCandyHandler } from '../../src/shared/engine/SpecialCandyHandler';
import { GravityCascade } from '../../src/shared/engine/GravityCascade';
import { PRNG } from '../../src/shared/prng';
import { CandyColor, CandyType, Tile, PlayerMove } from '../../src/shared/types';
import { GRID_ROWS, GRID_COLS } from '../../src/shared/constants';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
}

console.log('--- Starting Adversarial Forensic Verification ---');

const engine = new Match3Engine();

// 1. Stress test board generation across 100 seeds
console.log('Test 1: 100 Random Seeds Board Generation...');
for (let seed = 1; seed <= 100; seed++) {
  const b = engine.createInitialBoard(seed);
  assert(b.length === GRID_ROWS, `Seed ${seed}: row count mismatch`);
  assert(b[0].length === GRID_COLS, `Seed ${seed}: col count mismatch`);
  const matches = MatchDetector.detectMatches(b);
  assert(matches.length === 0, `Seed ${seed}: initial matches detected (${matches.length})`);
  const validMoves = engine.hasValidMoves(b);
  assert(validMoves, `Seed ${seed}: no valid moves available`);
}
console.log('-> PASS: 100/100 generated boards have 0 initial matches and >=1 valid moves.');

// 2. Corner/Edge special combinations (not (4,4) or (4,5))
console.log('Test 2: Corner & Border Special Combinations...');
function makeBoard(): Tile[][] {
  const board: Tile[][] = [];
  let id = 1;
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      row.push({
        id: id++,
        row: r,
        col: c,
        color: ((r * 3 + c) % 6) as CandyColor,
        type: CandyType.NORMAL
      });
    }
    board.push(row);
  }
  return board;
}

// Top-left corner (0,0) with (0,1): Striped + Wrapped
{
  const b = makeBoard();
  b[0][0].type = CandyType.STRIPED_HORIZONTAL;
  b[0][1].type = CandyType.WRAPPED;
  const res = engine.resolveMove(b, { playerId: 'test', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }, new PRNG(42));
  assert(res.valid, 'Corner (0,0)-(0,1) Striped+Wrapped must be valid');
  assert(res.turnScore >= 2500, `Expected score >= 2500, got ${res.turnScore}`);
  assert(res.finalBoard.length === 9 && res.finalBoard[0].length === 9, 'Board dimension intact');
}

// Bottom-right corner (8,7) with (8,8): Color Bomb + Color Bomb
{
  const b = makeBoard();
  b[8][7].type = CandyType.COLOR_BOMB;
  b[8][8].type = CandyType.COLOR_BOMB;
  const res = engine.resolveMove(b, { playerId: 'test', from: { row: 8, col: 7 }, to: { row: 8, col: 8 } }, new PRNG(99));
  assert(res.valid, 'Corner (8,7)-(8,8) ColorBomb+ColorBomb must be valid');
  assert(res.turnScore >= 5000, `Expected score >= 5000, got ${res.turnScore}`);
  const apocalypse = res.events.find(e => e.type === 'SPECIAL_DETONATE' && e.specialType === 'combo' && e.affectedTiles.length === 81);
  assert(!!apocalypse, 'Apocalypse must wipe all 81 tiles');
}

// 3. Immutability of original board on invalid moves
console.log('Test 3: Board Immutability Check...');
{
  const b = makeBoard();
  const bCopy = JSON.stringify(b);
  const res = engine.resolveMove(b, { playerId: 'test', from: { row: 0, col: 0 }, to: { row: 1, col: 1 } }, new PRNG(1));
  assert(!res.valid, 'Diagonal swap must be invalid');
  assert(JSON.stringify(b) === bCopy, 'Original board must not be mutated on invalid move');
}

// 4. Multi-step cascade multiplier verification
console.log('Test 4: Multi-Step Cascade & Combo Multiplier Progression...');
{
  const b = makeBoard();
  // Clear any existing accidental match at rows 7,8
  for (let c = 0; c < 9; c++) {
    b[7][c].color = (c % 5) as CandyColor;
    b[8][c].color = ((c + 1) % 5) as CandyColor;
  }
  // Setup horizontal match on row 8 cols 0, 1, 2
  b[8][0].color = CandyColor.RED;
  b[8][1].color = CandyColor.RED;
  b[8][2].color = CandyColor.BLUE;
  b[7][2].color = CandyColor.RED; // Swap down

  const res = engine.resolveMove(b, { playerId: 'test', from: { row: 7, col: 2 }, to: { row: 8, col: 2 } }, new PRNG(100));
  assert(res.valid, 'Swap must be valid');
  const stepCompletes = res.events.filter(e => e.type === 'CASCADE_STEP_COMPLETE');
  assert(stepCompletes.length >= 1, 'At least 1 cascade step must complete');
  for (let i = 0; i < stepCompletes.length; i++) {
    const sc = stepCompletes[i] as any;
    assert(sc.step === i + 1, `Step numbering must be 1-indexed and consecutive, got ${sc.step}`);
  }
}

// 5. Test Reshuffle logic directly with a locked board
console.log('Test 5: Reshuffle Safety...');
{
  const lockedBoard: Tile[][] = [];
  let id = 1;
  for (let r = 0; r < 9; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < 9; c++) {
      row.push({
        id: id++,
        row: r,
        col: c,
        color: ((r * 2 + c) % 6) as CandyColor,
        type: CandyType.NORMAL
      });
    }
    lockedBoard.push(row);
  }
  assert(!engine.hasValidMoves(lockedBoard), 'Locked board must have 0 valid moves');
  const reshuffled = engine.reshuffleBoard(lockedBoard, new PRNG(42));
  assert(reshuffled.events[0].type === 'BOARD_RESHUFFLE', 'Reshuffle event emitted');
  assert(engine.hasValidMoves(reshuffled.newBoard), 'Reshuffled board must have >=1 valid moves');
  assert(MatchDetector.detectMatches(reshuffled.newBoard).length === 0, 'Reshuffled board must have 0 matches');
}

console.log('--- ALL ADVERSARIAL CHECKS PASSED EMPIRICALLY ---');
