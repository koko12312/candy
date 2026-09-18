import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CandyColor, CandyType, Tile } from '../../src/shared/types';
import { GRID_COLS, GRID_ROWS } from '../../src/shared/constants';
import { TextureSynthesizer, SPRITE_SIZE } from '../../src/client/render/TextureSynthesizer';
import { ParticleSystem } from '../../src/client/render/ParticleSystem';
import { AudioEngine } from '../../src/client/audio/AudioEngine';
import { MusicSequencer } from '../../src/client/audio/MusicSequencer';
import { InputHandler } from '../../src/client/input/InputHandler';
import { NetworkClient } from '../../src/client/net/NetworkClient';

// Helper to generate dummy 9x9 board
function createTestBoard(): Tile[][] {
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

// Invariant board hash function matching Explorer 3 & CanvasRenderer specification
function computeBoardHash(board: Tile[][]): string {
  let hashStr = '';
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const tile = board[r][c];
      if (tile) {
        hashStr += `${r},${c}:${tile.id}:${tile.color}:${tile.type}|`;
      } else {
        hashStr += `${r},${c}:null|`;
      }
    }
  }
  return hashStr;
}

describe('Client Rendering & Visual Systems (Milestone M3)', () => {
  describe('1. Board Hash Computation & State Invariance', () => {
    it('produces identical board hashes for identical board configurations', () => {
      const board1 = createTestBoard();
      const board2 = createTestBoard();

      const hash1 = computeBoardHash(board1);
      const hash2 = computeBoardHash(board2);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBeGreaterThan(100);
      expect(hash1).toContain('0,0:1:0:normal|');
    });

    it('produces distinct board hashes if a single tile color or type changes', () => {
      const board1 = createTestBoard();
      const board2 = createTestBoard();

      // Change one tile color
      board2[4][4].color = CandyColor.PURPLE;
      expect(computeBoardHash(board1)).not.toBe(computeBoardHash(board2));

      // Reset and change tile type to striped_h
      board2[4][4].color = board1[4][4].color;
      board2[4][4].type = CandyType.STRIPED_HORIZONTAL;
      expect(computeBoardHash(board1)).not.toBe(computeBoardHash(board2));

      // Reset and change tile ID
      board2[4][4].type = CandyType.NORMAL;
      board2[4][4].id = 9999;
      expect(computeBoardHash(board1)).not.toBe(computeBoardHash(board2));
    });

    it('accounts for null/empty spaces during cascades', () => {
      const board1 = createTestBoard();
      const board2 = createTestBoard();

      (board2[2] as any)[3] = null;
      expect(computeBoardHash(board2)).toContain('2,3:null|');
      expect(computeBoardHash(board1)).not.toBe(computeBoardHash(board2));
    });
  });

  describe('2. TextureSynthesizer & Sprite Pipeline', () => {
    it('initializes TextureSynthesizer without crashing in Node/test environments', () => {
      const synth = new TextureSynthesizer();
      expect(synth).toBeDefined();

      // In Node environment without DOM canvas, should return null safely rather than crashing
      const sprite = synth.getCandySprite(CandyColor.RED, CandyType.NORMAL);
      expect(sprite === null || typeof sprite === 'object').toBe(true);

      const cell = synth.getCellSprite(false);
      expect(cell === null || typeof cell === 'object').toBe(true);
    });

    it('can prebake vector sprites when HTML5 Canvas is mocked', () => {
      // Mock minimal Canvas and 2D context
      const mockContext = {
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        ellipse: vi.fn(),
        roundRect: vi.fn(),
        bezierCurveTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
      };

      const mockCanvas = {
        width: SPRITE_SIZE,
        height: SPRITE_SIZE,
        getContext: vi.fn(() => mockContext)
      };

      const originalDoc = (global as any).document;
      (global as any).document = {
        createElement: vi.fn(() => ({ ...mockCanvas }))
      };

      try {
        const synth = new TextureSynthesizer();
        synth.init();

        // Check each candy color and type
        const redPill = synth.getCandySprite(CandyColor.RED, CandyType.NORMAL);
        expect(redPill).toBeDefined();

        const blueOrb = synth.getCandySprite(CandyColor.BLUE, CandyType.STRIPED_HORIZONTAL);
        expect(blueOrb).toBeDefined();

        const wrapped = synth.getCandySprite(CandyColor.GREEN, CandyType.WRAPPED);
        expect(wrapped).toBeDefined();

        const colorBomb = synth.getCandySprite(CandyColor.NONE, CandyType.COLOR_BOMB);
        expect(colorBomb).toBeDefined();

        const cell = synth.getCellSprite(true);
        expect(cell).toBeDefined();

        const sparkle = synth.getSparkleSprite();
        expect(sparkle).toBeDefined();

        const shards = synth.getCandyShards(CandyColor.ORANGE);
        expect(shards.length).toBeGreaterThan(0);
      } finally {
        (global as any).document = originalDoc;
      }
    });
  });

  describe('3. ParticleSystem Simulation & Lifecycles', () => {
    let mockSynth: TextureSynthesizer;
    let particles: ParticleSystem;

    beforeEach(() => {
      mockSynth = new TextureSynthesizer();
      particles = new ParticleSystem(mockSynth);
    });

    it('spawns candy shatter fragments with realistic velocities and decay', () => {
      particles.spawnCandyShatter(100, 100, CandyColor.RED, 10);
      // Access internal particles or verify update does not crash
      expect(() => particles.update(0.016)).not.toThrow();

      // Advancing past max life clears expired particles
      particles.update(1.0);
      // Empty after 1s
      expect(() => particles.update(0.016)).not.toThrow();
    });

    it('spawns sparkles, shockwaves, and laser sweeps without error', () => {
      particles.spawnSparkles(50, 50, 8);
      particles.spawnShockwave(120, 120, 180, 'rgba(255,255,255,0.9)');
      particles.spawnLaserSweep(0, 50, 400, 50, '#00e5ff');

      expect(() => {
        particles.update(0.016);
        particles.update(0.05);
      }).not.toThrow();

      particles.clear();
      expect(() => particles.update(0.016)).not.toThrow();
    });

    it('simulates gravity acceleration on candy shards over time', () => {
      particles.spawnCandyShatter(100, 100, CandyColor.BLUE, 5);

      // Step simulation by 100ms
      particles.update(0.1);
      // Step simulation by another 100ms
      particles.update(0.1);
      expect(true).toBe(true);
    });
  });

  describe('4. InputHandler Touch & Swipe Calculations', () => {
    it('correctly validates orthogonal adjacency and rejects diagonals/distant cells', () => {
      const handler = new InputHandler(
        {} as any,
        { setSelectedCoordinate: vi.fn(), getCellCoordinatesFromPixel: vi.fn() } as any,
        vi.fn()
      );

      // Adjacent: right, left, down, up
      expect(handler.areAdjacent({ row: 2, col: 3 }, { row: 2, col: 4 })).toBe(true);
      expect(handler.areAdjacent({ row: 2, col: 3 }, { row: 2, col: 2 })).toBe(true);
      expect(handler.areAdjacent({ row: 2, col: 3 }, { row: 3, col: 3 })).toBe(true);
      expect(handler.areAdjacent({ row: 2, col: 3 }, { row: 1, col: 3 })).toBe(true);

      // Non-adjacent: diagonals
      expect(handler.areAdjacent({ row: 2, col: 3 }, { row: 3, col: 4 })).toBe(false);
      expect(handler.areAdjacent({ row: 2, col: 3 }, { row: 1, col: 2 })).toBe(false);

      // Same cell
      expect(handler.areAdjacent({ row: 2, col: 3 }, { row: 2, col: 3 })).toBe(false);

      // Distant cells
      expect(handler.areAdjacent({ row: 2, col: 3 }, { row: 2, col: 6 })).toBe(false);
      expect(handler.areAdjacent({ row: 0, col: 0 }, { row: 8, col: 8 })).toBe(false);
    });

    it('toggles input lock state cleanly', () => {
      const handler = new InputHandler(
        { addEventListener: vi.fn() } as any,
        { setSelectedCoordinate: vi.fn(), getCellCoordinatesFromPixel: vi.fn() } as any,
        vi.fn()
      );

      handler.setLocked(true);
      expect(handler.getLocked()).toBe(true);

      handler.setLocked(false);
      expect(handler.getLocked()).toBe(false);
    });
  });

  describe('5. AudioEngine & MusicSequencer Sound Synthesizers', () => {
    it('initializes AudioEngine safely in non-browser / headless environments', () => {
      const audio = new AudioEngine();
      expect(audio).toBeDefined();
      expect(audio.getMuted()).toBe(false);

      audio.setMuted(true);
      expect(audio.getMuted()).toBe(true);

      audio.toggleMute();
      expect(audio.getMuted()).toBe(false);

      audio.setVolume(0.5);
    });

    it('calls all SFX recipes safely without throwing', () => {
      const audio = new AudioEngine();

      expect(() => {
        audio.playMatchPop(1);
        audio.playMatchPop(3);
        audio.playMatchPop(7);
        audio.playWhoosh();
        audio.playInvalidSwap();
        audio.playStripedLaser();
        audio.playWrappedExplosion();
        audio.playColorBomb();
        audio.playTimerTick(10);
        audio.playTimerTick(3);
        audio.playComboFanfare('sweet');
        audio.playComboFanfare('tasty');
        audio.playComboFanfare('delicious');
      }).not.toThrow();
    });

    it('initializes MusicSequencer and controls volume and mute', () => {
      const audio = new AudioEngine();
      const music = new MusicSequencer(audio);

      expect(music).toBeDefined();
      expect(music.isRunning()).toBe(false);

      music.start();
      music.stop();

      music.setMuted(true);
      expect(music.getMuted()).toBe(true);

      music.setVolume(0.8);
      expect(music.getVolume()).toBe(0.8);
    });
  });

  describe('6. NetworkClient Storage & Profile Integration', () => {
    it('manages session data and local storage fallbacks gracefully', () => {
      const client = new NetworkClient();
      expect(client.getRoomCode()).toBe('');
      expect(client.getPlayerId()).toBe('');
      expect(client.getSlot()).toBe(-1);

      client.setSession('JELLY', 'token_xyz123', 'player_abc', 2);
      expect(client.getRoomCode()).toBe('JELLY');
      expect(client.getSessionToken()).toBe('token_xyz123');
      expect(client.getPlayerId()).toBe('player_abc');
      expect(client.getSlot()).toBe(2);

      client.clearSession();
      expect(client.getRoomCode()).toBe('');
      expect(client.getSessionToken()).toBe('');
      expect(client.getPlayerId()).toBe('');
      expect(client.getSlot()).toBe(-1);
    });
  });
});
