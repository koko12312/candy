import { Coordinate, EngineEvent, Tile } from '../../shared/types';
import { GRID_COLS, GRID_ROWS } from '../../shared/constants';
import { TextureSynthesizer } from './TextureSynthesizer';
import { ParticleSystem } from './ParticleSystem';

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  scale: number;
  alpha: number;
  color: string;
}

export interface TileVisual {
  id: number;
  row: number;
  col: number;
  color: number;
  type: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  scale: number;
  alpha: number;
  rotation: number;
  animTime: number;
  animDuration: number;
  easing: 'linear' | 'easeSwap' | 'easeDrop';
}

export type SoundEventCallback = (name: 'pop' | 'whoosh' | 'invalid' | 'laser' | 'wrapped' | 'bomb' | 'sweet' | 'tasty' | 'delicious', combo?: number) => void;

export class CanvasRenderer {
  private bgCanvas: HTMLCanvasElement;
  private gameCanvas: HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D | null;
  private gameCtx: CanvasRenderingContext2D | null;
  private container: HTMLElement;

  private textures: TextureSynthesizer;
  private particles: ParticleSystem;

  private boardTiles: Map<number, TileVisual> = new Map();
  private gridMatrix: (TileVisual | null)[][] = [];
  private selectedCoord: Coordinate | null = null;
  private floatingTexts: FloatingText[] = [];

  private cellSize = 48;
  private boardPixelWidth = 432;
  private boardPixelHeight = 432;
  private boardOffsetX = 0;
  private boardOffsetY = 0;

  private animationFrameId: number | null = null;
  private lastTime = 0;
  private isProcessingCascade = false;
  private onCascadeSettledCallback: (() => void) | null = null;
  private soundCallback: SoundEventCallback | null = null;

  constructor(
    bgCanvas: HTMLCanvasElement,
    gameCanvas: HTMLCanvasElement,
    container: HTMLElement,
    textures?: TextureSynthesizer,
    soundCallback?: SoundEventCallback
  ) {
    this.bgCanvas = bgCanvas;
    this.gameCanvas = gameCanvas;
    this.container = container;
    this.textures = textures || new TextureSynthesizer();
    this.particles = new ParticleSystem(this.textures);
    this.soundCallback = soundCallback || null;

    this.bgCtx = this.bgCanvas.getContext('2d');
    this.gameCtx = this.gameCanvas.getContext('2d');

    this.initGridMatrix();
    this.setupResizeListener();
    this.resize();
    this.startRenderLoop();
  }

  public setSoundCallback(cb: SoundEventCallback): void {
    this.soundCallback = cb;
  }

  public setOnCascadeSettled(cb: () => void): void {
    this.onCascadeSettledCallback = cb;
  }

  public getParticleSystem(): ParticleSystem {
    return this.particles;
  }

  private initGridMatrix(): void {
    this.gridMatrix = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      this.gridMatrix[r] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        this.gridMatrix[r][c] = null;
      }
    }
  }

  private setupResizeListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this.resize();
      });
    }
  }

  public resize(): void {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const cssWidth = Math.max(rect.width, 300);
    const cssHeight = Math.max(rect.height, 300);

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    // Responsive Board dimension calculation per Explorer 3 spec
    const availableSize = Math.min(cssWidth - 16, cssHeight - 16, 540);
    this.cellSize = Math.floor(availableSize / GRID_ROWS);
    this.boardPixelWidth = this.cellSize * GRID_COLS;
    this.boardPixelHeight = this.cellSize * GRID_ROWS;
    this.boardOffsetX = Math.floor((cssWidth - this.boardPixelWidth) / 2);
    this.boardOffsetY = Math.floor((cssHeight - this.boardPixelHeight) / 2);

    // Apply Retina / DPR scaling to bgCanvas
    this.bgCanvas.width = Math.round(cssWidth * dpr);
    this.bgCanvas.height = Math.round(cssHeight * dpr);
    this.bgCanvas.style.width = `${cssWidth}px`;
    this.bgCanvas.style.height = `${cssHeight}px`;
    if (this.bgCtx) {
      this.bgCtx.resetTransform?.();
      this.bgCtx.scale(dpr, dpr);
      this.bgCtx.imageSmoothingEnabled = true;
      this.bgCtx.imageSmoothingQuality = 'high';
    }

    // Apply Retina / DPR scaling to gameCanvas
    this.gameCanvas.width = Math.round(cssWidth * dpr);
    this.gameCanvas.height = Math.round(cssHeight * dpr);
    this.gameCanvas.style.width = `${cssWidth}px`;
    this.gameCanvas.style.height = `${cssHeight}px`;
    if (this.gameCtx) {
      this.gameCtx.resetTransform?.();
      this.gameCtx.scale(dpr, dpr);
      this.gameCtx.imageSmoothingEnabled = true;
      this.gameCtx.imageSmoothingQuality = 'high';
    }

    this.renderBackground();
    this.repositionAllTilesInstant();
  }

  public renderBackground(): void {
    if (!this.bgCtx) return;
    const ctx = this.bgCtx;
    const width = parseFloat(this.bgCanvas.style.width) || this.bgCanvas.width;
    const height = parseFloat(this.bgCanvas.style.height) || this.bgCanvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw board frame with rounded rectangle and glassmorphism glow
    const framePad = 10;
    const fx = this.boardOffsetX - framePad;
    const fy = this.boardOffsetY - framePad;
    const fw = this.boardPixelWidth + framePad * 2;
    const fh = this.boardPixelHeight + framePad * 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, 22);
    ctx.fillStyle = 'rgba(28, 7, 54, 0.72)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.stroke();

    // Soft outer glow
    ctx.shadowColor = 'rgba(170, 0, 255, 0.35)';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.restore();

    // Draw 9x9 checkerboard cells
    const cellSprite = this.textures.getCellSprite(false);
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const x = this.boardOffsetX + c * this.cellSize;
        const y = this.boardOffsetY + r * this.cellSize;

        if (cellSprite) {
          ctx.drawImage(cellSprite, x, y, this.cellSize, this.cellSize);
        } else {
          ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.1)';
          ctx.beginPath();
          ctx.roundRect(x + 2, y + 2, this.cellSize - 4, this.cellSize - 4, 8);
          ctx.fill();
        }
      }
    }
  }

  public setBoard(board: Tile[][]): void {
    this.boardTiles.clear();
    this.initGridMatrix();

    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        const t = board[r][c];
        if (!t) continue;
        const tx = this.boardOffsetX + c * this.cellSize;
        const ty = this.boardOffsetY + r * this.cellSize;

        const visual: TileVisual = {
          id: t.id,
          row: r,
          col: c,
          color: t.color,
          type: t.type,
          x: tx,
          y: ty,
          targetX: tx,
          targetY: ty,
          scale: 1.0,
          alpha: 1.0,
          rotation: 0,
          animTime: 0,
          animDuration: 0,
          easing: 'linear'
        };
        this.boardTiles.set(t.id, visual);
        this.gridMatrix[r][c] = visual;
      }
    }
  }

  private repositionAllTilesInstant(): void {
    for (const visual of this.boardTiles.values()) {
      visual.targetX = this.boardOffsetX + visual.col * this.cellSize;
      visual.targetY = this.boardOffsetY + visual.row * this.cellSize;
      visual.x = visual.targetX;
      visual.y = visual.targetY;
    }
  }

  public setSelectedCoordinate(coord: Coordinate | null): void {
    this.selectedCoord = coord;
  }

  public getSelectedCoordinate(): Coordinate | null {
    return this.selectedCoord;
  }

  public getCellCoordinatesFromPixel(pixelX: number, pixelY: number): Coordinate | null {
    const relX = pixelX - this.boardOffsetX;
    const relY = pixelY - this.boardOffsetY;

    if (relX < 0 || relX >= this.boardPixelWidth || relY < 0 || relY >= this.boardPixelHeight) {
      return null;
    }

    const col = Math.floor(relX / this.cellSize);
    const row = Math.floor(relY / this.cellSize);

    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
      return { row, col };
    }
    return null;
  }

  public getCellCenterPixel(row: number, col: number): { x: number; y: number } {
    return {
      x: this.boardOffsetX + col * this.cellSize + this.cellSize / 2,
      y: this.boardOffsetY + row * this.cellSize + this.cellSize / 2
    };
  }

  // Visual tween: Swap two tiles smoothly
  public animateSwap(from: Coordinate, to: Coordinate, revert = false): Promise<void> {
    const tileA = this.gridMatrix[from.row][from.col];
    const tileB = this.gridMatrix[to.row][to.col];

    if (!tileA || !tileB) return Promise.resolve();

    this.soundCallback?.('whoosh');

    const dur = 200;
    const xA = this.boardOffsetX + from.col * this.cellSize;
    const yA = this.boardOffsetY + from.row * this.cellSize;
    const xB = this.boardOffsetX + to.col * this.cellSize;
    const yB = this.boardOffsetY + to.row * this.cellSize;

    tileA.targetX = xB;
    tileA.targetY = yB;
    tileA.animTime = 0;
    tileA.animDuration = dur;
    tileA.easing = 'easeSwap';

    tileB.targetX = xA;
    tileB.targetY = yB;
    tileB.animTime = 0;
    tileB.animDuration = dur;
    tileB.easing = 'easeSwap';

    return new Promise((resolve) => {
      setTimeout(() => {
        if (revert) {
          this.soundCallback?.('invalid');
          tileA.targetX = xA;
          tileA.targetY = yA;
          tileA.animTime = 0;
          tileA.animDuration = dur;
          tileB.targetX = xB;
          tileB.targetY = yB;
          tileB.animTime = 0;
          tileB.animDuration = dur;
          setTimeout(() => resolve(), dur);
        } else {
          // Commit swap in grid matrix
          tileA.row = to.row;
          tileA.col = to.col;
          tileB.row = from.row;
          tileB.col = from.col;
          this.gridMatrix[to.row][to.col] = tileA;
          this.gridMatrix[from.row][from.col] = tileB;
          resolve();
        }
      }, dur);
    });
  }

  // Process server cascade events pipeline sequentially
  public async playEventsPipeline(events: EngineEvent[], finalBoard: Tile[][]): Promise<void> {
    this.isProcessingCascade = true;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];

      switch (ev.type) {
        case 'SWAP':
          if (ev.valid) {
            await this.animateSwap(ev.from, ev.to, false);
          }
          break;

        case 'SWAP_REVERT':
          await this.animateSwap(ev.from, ev.to, true);
          break;

        case 'MATCH_FOUND': {
          this.soundCallback?.('pop', ev.step);
          for (const m of ev.tiles) {
            const visual = this.boardTiles.get(m.id);
            if (visual) {
              const center = this.getCellCenterPixel(visual.row, visual.col);
              this.particles.spawnCandyShatter(center.x, center.y, visual.color, 12);
              visual.scale = 0;
              visual.alpha = 0;
              this.boardTiles.delete(visual.id);
              if (this.gridMatrix[visual.row][visual.col] === visual) {
                this.gridMatrix[visual.row][visual.col] = null;
              }
            }
          }

          // If a special candy was formed at anchor
          if (ev.spawnSpecial) {
            const sp = ev.spawnSpecial;
            const center = this.getCellCenterPixel(sp.row, sp.col);
            this.particles.spawnSparkles(center.x, center.y, 14);
            const newVis: TileVisual = {
              id: sp.id,
              row: sp.row,
              col: sp.col,
              color: sp.color,
              type: sp.type,
              x: center.x - this.cellSize / 2,
              y: center.y - this.cellSize / 2,
              targetX: center.x - this.cellSize / 2,
              targetY: center.y - this.cellSize / 2,
              scale: 1.4,
              alpha: 1.0,
              rotation: 0,
              animTime: 0,
              animDuration: 180,
              easing: 'easeDrop'
            };
            this.boardTiles.set(sp.id, newVis);
            this.gridMatrix[sp.row][sp.col] = newVis;
          }

          await this.delay(160);
          break;
        }

        case 'SPECIAL_DETONATE': {
          const originCenter = this.getCellCenterPixel(ev.origin.row, ev.origin.col);

          if (ev.specialType === 'striped_h') {
            this.soundCallback?.('laser');
            this.particles.spawnLaserSweep(
              this.boardOffsetX,
              originCenter.y,
              this.boardOffsetX + this.boardPixelWidth,
              originCenter.y,
              '#00e5ff'
            );
          } else if (ev.specialType === 'striped_v') {
            this.soundCallback?.('laser');
            this.particles.spawnLaserSweep(
              originCenter.x,
              this.boardOffsetY,
              originCenter.x,
              this.boardOffsetY + this.boardPixelHeight,
              '#00e5ff'
            );
          } else if (ev.specialType === 'wrapped') {
            this.soundCallback?.('wrapped');
            this.particles.spawnShockwave(originCenter.x, originCenter.y, 160, 'rgba(255, 64, 129, 0.9)');
          } else if (ev.specialType === 'color_bomb' || ev.specialType === 'combo') {
            this.soundCallback?.('bomb');
            this.particles.spawnShockwave(originCenter.x, originCenter.y, 220, 'rgba(255, 215, 0, 0.95)');
          }

          for (const aff of ev.affectedTiles) {
            const visual = this.boardTiles.get(aff.id);
            if (visual) {
              const center = this.getCellCenterPixel(visual.row, visual.col);
              this.particles.spawnCandyShatter(center.x, center.y, visual.color, 8);
              visual.scale = 0;
              visual.alpha = 0;
              this.boardTiles.delete(visual.id);
              if (this.gridMatrix[visual.row][visual.col] === visual) {
                this.gridMatrix[visual.row][visual.col] = null;
              }
            }
          }
          await this.delay(180);
          break;
        }

        case 'GRAVITY_DROP': {
          for (const drop of ev.drops) {
            const visual = this.boardTiles.get(drop.id);
            if (visual) {
              visual.row = drop.toRow;
              visual.targetY = this.boardOffsetY + drop.toRow * this.cellSize;
              visual.animTime = 0;
              visual.animDuration = 240;
              visual.easing = 'easeDrop';
              this.gridMatrix[drop.toRow][drop.col] = visual;
            }
          }
          await this.delay(200);
          break;
        }

        case 'REFILL_SPAWN': {
          for (const sp of ev.spawns) {
            const tx = this.boardOffsetX + sp.col * this.cellSize;
            const ty = this.boardOffsetY + sp.row * this.cellSize;
            // Spawn above top of board
            const startY = this.boardOffsetY - (GRID_ROWS - sp.row) * this.cellSize;

            const visual: TileVisual = {
              id: sp.id,
              row: sp.row,
              col: sp.col,
              color: sp.color,
              type: sp.type,
              x: tx,
              y: startY,
              targetX: tx,
              targetY: ty,
              scale: 1.0,
              alpha: 1.0,
              rotation: 0,
              animTime: 0,
              animDuration: 280,
              easing: 'easeDrop'
            };
            this.boardTiles.set(sp.id, visual);
            this.gridMatrix[sp.row][sp.col] = visual;
          }
          await this.delay(220);
          break;
        }

        case 'CASCADE_STEP_COMPLETE': {
          if (ev.step === 2) {
            this.spawnPraiseText('SWEET!', '#ffd000');
            this.soundCallback?.('sweet');
          } else if (ev.step === 3) {
            this.spawnPraiseText('TASTY!', '#ff4097');
            this.soundCallback?.('tasty');
          } else if (ev.step >= 4) {
            this.spawnPraiseText('DELICIOUS!', '#00e5ff');
            this.soundCallback?.('delicious');
          }
          break;
        }

        case 'BOARD_RESHUFFLE': {
          this.spawnPraiseText('RESHUFFLE!', '#ffd000');
          this.particles.spawnShockwave(
            this.boardOffsetX + this.boardPixelWidth / 2,
            this.boardOffsetY + this.boardPixelHeight / 2,
            300,
            '#ffd000'
          );
          this.setBoard(ev.newGrid);
          await this.delay(400);
          break;
        }

        case 'TURN_SETTLE': {
          this.setBoard(ev.board);
          break;
        }
      }
    }

    // Ensure final state synchronizes identically to server finalBoard
    if (finalBoard && finalBoard.length > 0) {
      this.setBoard(finalBoard);
    }

    this.isProcessingCascade = false;
    this.onCascadeSettledCallback?.();
  }

  public spawnPraiseText(text: string, color = '#ffd000'): void {
    const cx = this.boardOffsetX + this.boardPixelWidth / 2;
    const cy = this.boardOffsetY + this.boardPixelHeight / 2;

    this.floatingTexts.push({
      text,
      x: cx,
      y: cy,
      life: 0,
      maxLife: 1.2,
      scale: 0.2,
      alpha: 1.0,
      color
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private startRenderLoop(): void {
    const loop = (time: number) => {
      if (!this.lastTime) this.lastTime = time;
      const dt = Math.min((time - this.lastTime) / 1000, 0.1);
      this.lastTime = time;

      this.update(dt);
      this.render();

      if (typeof window !== 'undefined') {
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };

    if (typeof window !== 'undefined') {
      this.animationFrameId = requestAnimationFrame(loop);
    }
  }

  private update(dt: number): void {
    // 1. Update tile tweens
    for (const visual of this.boardTiles.values()) {
      if (visual.animDuration > 0) {
        visual.animTime += dt * 1000;
        const p = Math.min(visual.animTime / visual.animDuration, 1.0);

        let ease = p;
        if (visual.easing === 'easeSwap') {
          // easeInOutCubic
          ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        } else if (visual.easing === 'easeDrop') {
          // easeOutBack bounce
          const c1 = 1.70158;
          const c3 = c1 + 1;
          ease = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
        }

        visual.x = visual.x + (visual.targetX - visual.x) * ease;
        visual.y = visual.y + (visual.targetY - visual.y) * ease;

        if (p >= 1.0) {
          visual.x = visual.targetX;
          visual.y = visual.targetY;
          visual.animDuration = 0;
        }
      }
    }

    // 2. Update particles
    this.particles.update(dt);

    // 3. Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      const progress = ft.life / ft.maxLife;
      // Spring scale pop
      if (progress < 0.25) {
        ft.scale = 0.2 + (progress / 0.25) * 1.1; // pop up to 1.3
      } else {
        ft.scale = 1.3 - (progress - 0.25) * 0.4;
      }
      ft.y -= 30 * dt; // float upward
      ft.alpha = progress > 0.65 ? Math.max(0, 1 - (progress - 0.65) / 0.35) : 1.0;
    }
  }

  public render(): void {
    if (!this.gameCtx) return;
    const ctx = this.gameCtx;
    const width = parseFloat(this.gameCanvas.style.width) || this.gameCanvas.width;
    const height = parseFloat(this.gameCanvas.style.height) || this.gameCanvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Selection Glow Highlight
    if (this.selectedCoord) {
      const selSprite = this.textures.getCellSprite(true);
      const sx = this.boardOffsetX + this.selectedCoord.col * this.cellSize;
      const sy = this.boardOffsetY + this.selectedCoord.row * this.cellSize;
      if (selSprite) {
        ctx.drawImage(selSprite, sx, sy, this.cellSize, this.cellSize);
      }
    }

    // 2. Draw Candies
    for (const visual of this.boardTiles.values()) {
      if (visual.alpha <= 0 || visual.scale <= 0) continue;

      const sprite = this.textures.getCandySprite(visual.color, visual.type as any);
      if (sprite) {
        ctx.save();
        ctx.globalAlpha = visual.alpha;

        const renderW = this.cellSize * visual.scale;
        const renderH = this.cellSize * visual.scale;
        const cx = visual.x + this.cellSize / 2;
        const cy = visual.y + this.cellSize / 2;

        ctx.translate(cx, cy);
        if (visual.rotation !== 0) {
          ctx.rotate(visual.rotation);
        }

        ctx.drawImage(sprite, -renderW / 2, -renderH / 2, renderW, renderH);
        ctx.restore();
      }
    }

    // 3. Render Particles (shatters, sparkles, lasers, shockwaves)
    this.particles.render(ctx);

    // 4. Render Floating Praise Texts
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.translate(ft.x, ft.y);
      ctx.scale(ft.scale, ft.scale);

      ctx.font = '900 36px "Fredoka", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Thick stroke shadow
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#18042c';
      ctx.strokeText(ft.text, 0, 0);

      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }
  }

  public getBoardHash(): string {
    let hashStr = '';
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const visual = this.gridMatrix[r][c];
        if (visual) {
          hashStr += `${r},${c}:${visual.id}:${visual.color}:${visual.type}|`;
        } else {
          hashStr += `${r},${c}:null|`;
        }
      }
    }
    return hashStr;
  }

  public getBoardState(): Tile[][] {
    const board: Tile[][] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        const visual = this.gridMatrix[r][c];
        if (visual) {
          row.push({
            id: visual.id,
            row: visual.row,
            col: visual.col,
            color: visual.color as any,
            type: visual.type as any
          });
        }
      }
      board.push(row);
    }
    return board;
  }

  public destroy(): void {
    if (this.animationFrameId !== null && typeof window !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.boardTiles.clear();
    this.particles.clear();
  }
}
