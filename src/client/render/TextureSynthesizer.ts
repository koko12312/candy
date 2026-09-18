import { CandyColor, CandyType } from '../../shared/types';

export const SPRITE_SIZE = 128; // High-DPI source tile resolution

export interface CandySpriteKey {
  color: CandyColor;
  type: CandyType;
}

export class TextureSynthesizer {
  private cache: Map<string, HTMLCanvasElement> = new Map();
  private particleShards: Map<CandyColor, HTMLCanvasElement[]> = new Map();
  private sparkleCanvas: HTMLCanvasElement | null = null;
  private cellCanvas: HTMLCanvasElement | null = null;
  private selectedCellCanvas: HTMLCanvasElement | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  public init(): void {
    if (this.isInitialized) return;
    if (typeof document === 'undefined') return; // Node/test environment safety

    this.prebakeCandies();
    this.prebakeBoardCells();
    this.prebakeParticles();
    this.isInitialized = true;
  }

  private createOffscreenCanvas(width = SPRITE_SIZE, height = SPRITE_SIZE): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  public getCandySprite(color: CandyColor, type: CandyType): HTMLCanvasElement | null {
    if (!this.isInitialized) this.init();
    const key = `${color}_${type}`;
    return this.cache.get(key) || null;
  }

  public getCellSprite(isSelected = false): HTMLCanvasElement | null {
    if (!this.isInitialized) this.init();
    return isSelected ? this.selectedCellCanvas : this.cellCanvas;
  }

  public getSparkleSprite(): HTMLCanvasElement | null {
    if (!this.isInitialized) this.init();
    return this.sparkleCanvas;
  }

  public getCandyShards(color: CandyColor): HTMLCanvasElement[] {
    if (!this.isInitialized) this.init();
    return this.particleShards.get(color) || [];
  }

  private prebakeCandies(): void {
    const colors = [
      CandyColor.RED,
      CandyColor.ORANGE,
      CandyColor.YELLOW,
      CandyColor.GREEN,
      CandyColor.BLUE,
      CandyColor.PURPLE
    ];

    const types = [
      CandyType.NORMAL,
      CandyType.STRIPED_HORIZONTAL,
      CandyType.STRIPED_VERTICAL,
      CandyType.WRAPPED
    ];

    for (const c of colors) {
      for (const t of types) {
        const canvas = this.createOffscreenCanvas();
        const ctx = canvas.getContext('2d');
        if (ctx) {
          this.renderCandyToContext(ctx, c, t);
          this.cache.set(`${c}_${t}`, canvas);
        }
      }
    }

    // Color Bomb (Chocolate Truffle) - Color independent
    const bombCanvas = this.createOffscreenCanvas();
    const bombCtx = bombCanvas.getContext('2d');
    if (bombCtx) {
      this.renderColorBomb(bombCtx);
      this.cache.set(`${CandyColor.NONE}_${CandyType.COLOR_BOMB}`, bombCanvas);
      // Map for all colors so lookup never fails
      for (const c of colors) {
        this.cache.set(`${c}_${CandyType.COLOR_BOMB}`, bombCanvas);
      }
    }
  }

  private renderCandyToContext(ctx: CanvasRenderingContext2D, color: CandyColor, type: CandyType): void {
    ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    // If wrapped candy, draw foil cellophane wings first (underneath base candy)
    if (type === CandyType.WRAPPED) {
      this.drawWrapperWings(ctx, color);
    }

    // Draw base candy shape
    ctx.save();
    switch (color) {
      case CandyColor.RED:
        this.drawRedJellyBean(ctx);
        break;
      case CandyColor.ORANGE:
        this.drawOrangeLozenge(ctx);
        break;
      case CandyColor.YELLOW:
        this.drawYellowLemonDrop(ctx);
        break;
      case CandyColor.GREEN:
        this.drawGreenChiclet(ctx);
        break;
      case CandyColor.BLUE:
        this.drawBlueLollipop(ctx);
        break;
      case CandyColor.PURPLE:
        this.drawPurpleCluster(ctx);
        break;
      default:
        this.drawBlueLollipop(ctx);
    }
    ctx.restore();

    // Overlay Special Effects: Striped or Wrapped ribbons
    if (type === CandyType.STRIPED_HORIZONTAL || type === CandyType.STRIPED_VERTICAL) {
      this.drawStripes(ctx, type === CandyType.STRIPED_HORIZONTAL);
    } else if (type === CandyType.WRAPPED) {
      this.drawWrapperRibbon(ctx);
    }
  }

  // 1. RED Jelly Bean (Kidney / Pill shape)
  private drawRedJellyBean(ctx: CanvasRenderingContext2D): void {
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;

    // Outer subtle shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;

    // Kidney bean path
    ctx.beginPath();
    ctx.moveTo(cx - 36, cy - 8);
    ctx.bezierCurveTo(cx - 38, cy - 36, cx + 18, cy - 42, cx + 36, cy - 20);
    ctx.bezierCurveTo(cx + 46, cy - 4, cx + 40, cy + 24, cx + 18, cy + 36);
    ctx.bezierCurveTo(cx - 10, cy + 44, cx - 44, cy + 24, cx - 36, cy - 8);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, 48);
    grad.addColorStop(0, '#ff5277');
    grad.addColorStop(0.5, '#d50000');
    grad.addColorStop(1, '#7f0000');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Specular highlight crescent
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx - 14, cy - 18, 20, 8, -Math.PI / 6, 0, Math.PI * 2);
    const specGrad = ctx.createLinearGradient(cx - 24, cy - 24, cx - 4, cy - 12);
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = specGrad;
    ctx.fill();
    ctx.restore();
  }

  // 2. ORANGE Lozenge (Rounded tilted diamond / hexagon)
  private drawOrangeLozenge(ctx: CanvasRenderingContext2D): void {
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;

    // Diamond path with rounded vertices
    const r = 42;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, 46);
    grad.addColorStop(0, '#ffa726');
    grad.addColorStop(0.5, '#ff6d00');
    grad.addColorStop(1, '#b23c00');
    ctx.fillStyle = grad;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = grad;
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    // Beveled facet highlights
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy - 18);
    ctx.lineTo(cx + 6, cy - 24);
    ctx.lineTo(cx - 2, cy - 6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fill();
    ctx.restore();
  }

  // 3. YELLOW Lemon Drop (Glossy teardrop / triangle)
  private drawYellowLemonDrop(ctx: CanvasRenderingContext2D): void {
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;

    ctx.beginPath();
    ctx.moveTo(cx, cy - 40);
    ctx.bezierCurveTo(cx + 42, cy - 8, cx + 38, cy + 34, cx, cy + 38);
    ctx.bezierCurveTo(cx - 38, cy + 34, cx - 42, cy - 8, cx, cy - 40);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx - 8, cy - 12, 4, cx, cy, 44);
    grad.addColorStop(0, '#ffff56');
    grad.addColorStop(0.5, '#ffd600');
    grad.addColorStop(1, '#e65100');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Glossy gleam
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx - 8, cy - 12, 16, 9, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
    ctx.restore();
  }

  // 4. GREEN Chiclet (Pillow / rounded square)
  private drawGreenChiclet(ctx: CanvasRenderingContext2D): void {
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;
    const size = 68;
    const half = size / 2;
    const radius = 18;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;

    ctx.beginPath();
    ctx.roundRect(cx - half, cy - half, size, size, radius);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, 46);
    grad.addColorStop(0, '#a7ffeb');
    grad.addColorStop(0.4, '#00e676');
    grad.addColorStop(1, '#00692c');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Pillow cushion highlight
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx - half + 6, cy - half + 6, size - 12, 18, [12, 12, 6, 6]);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
    ctx.restore();
  }

  // 5. BLUE Lollipop (Glossy orb / sphere)
  private drawBlueLollipop(ctx: CanvasRenderingContext2D): void {
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;
    const radius = 38;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, radius);
    grad.addColorStop(0, '#80d8ff');
    grad.addColorStop(0.45, '#0091ea');
    grad.addColorStop(1, '#003c8f');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Circular specular orb
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx - 12, cy - 14, 10, 0, Math.PI * 2);
    const specGrad = ctx.createRadialGradient(cx - 12, cy - 14, 1, cx - 12, cy - 14, 10);
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = specGrad;
    ctx.fill();
    ctx.restore();
  }

  // 6. PURPLE Cluster (4-lobed grape / flower)
  private drawPurpleCluster(ctx: CanvasRenderingContext2D): void {
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;

    const lobeOffsets = [
      { x: -16, y: -16 },
      { x: 16, y: -16 },
      { x: -16, y: 16 },
      { x: 16, y: 16 }
    ];

    for (const off of lobeOffsets) {
      ctx.beginPath();
      ctx.arc(cx + off.x, cy + off.y, 22, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(cx + off.x - 6, cy + off.y - 6, 2, cx + off.x, cy + off.y, 22);
      grad.addColorStop(0, '#ea80fc');
      grad.addColorStop(0.5, '#aa00ff');
      grad.addColorStop(1, '#4a0072');
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();

    // Specular beads on each lobe
    ctx.save();
    for (const off of lobeOffsets) {
      ctx.beginPath();
      ctx.arc(cx + off.x - 5, cy + off.y - 5, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();
    }
    ctx.restore();
  }

  // Striped overlay
  private drawStripes(ctx: CanvasRenderingContext2D, horizontal: boolean): void {
    ctx.save();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';

    if (horizontal) {
      // Horizontal bands
      for (let y = 38; y <= 90; y += 14) {
        ctx.beginPath();
        ctx.moveTo(26, y);
        ctx.lineTo(102, y);
        ctx.stroke();
      }
      // Chevrons pointing left & right: < >
      ctx.fillStyle = '#ffffff';
      this.drawArrow(ctx, 42, 64, -1, 0);
      this.drawArrow(ctx, 86, 64, 1, 0);
    } else {
      // Vertical bands
      for (let x = 38; x <= 90; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, 26);
        ctx.lineTo(x, 102);
        ctx.stroke();
      }
      // Chevrons pointing up & down: ^ v
      ctx.fillStyle = '#ffffff';
      this.drawArrow(ctx, 64, 42, 0, -1);
      this.drawArrow(ctx, 64, 86, 0, 1);
    }
    ctx.restore();
  }

  private drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number): void {
    ctx.save();
    ctx.translate(x, y);
    const angle = Math.atan2(dy, dx);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Wrapped cellophane wings (corners)
  private drawWrapperWings(ctx: CanvasRenderingContext2D, color: CandyColor): void {
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;
    ctx.save();

    const wings = [
      { x: cx - 44, y: cy - 44, angle: -Math.PI / 4 },
      { x: cx + 44, y: cy - 44, angle: Math.PI / 4 },
      { x: cx - 44, y: cy + 44, angle: -3 * Math.PI / 4 },
      { x: cx + 44, y: cy + 44, angle: 3 * Math.PI / 4 }
    ];

    for (const w of wings) {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-18, -14);
      ctx.lineTo(0, -24);
      ctx.lineTo(18, -14);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // Wrapped ribbon bow overlay
  private drawWrapperRibbon(ctx: CanvasRenderingContext2D): void {
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;

    ctx.save();
    // Shiny silver / white band
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.stroke();

    // Center bow knot
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Color Bomb: Chocolate truffle with 16 colorful sprinkles
  private renderColorBomb(ctx: CanvasRenderingContext2D): void {
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;
    const radius = 42;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;

    // Dark chocolate truffle ball
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx - 14, cy - 14, 4, cx, cy, radius);
    grad.addColorStop(0, '#5d4037');
    grad.addColorStop(0.5, '#3e2723');
    grad.addColorStop(1, '#1b0000');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // 16 Rainbow Sprinkles (Nonpareils)
    const sprinkleColors = ['#ff1744', '#00e5ff', '#ffea00', '#76ff03', '#ff9100', '#e040fb'];
    const sprinklePositions = [
      { r: 12, a: 0.3 },
      { r: 18, a: 1.8 },
      { r: 24, a: 3.2 },
      { r: 15, a: 4.5 },
      { r: 28, a: 5.7 },
      { r: 30, a: 0.9 },
      { r: 32, a: 2.3 },
      { r: 26, a: 3.9 },
      { r: 34, a: 4.9 },
      { r: 8,  a: 2.8 },
      { r: 20, a: 0.0 },
      { r: 35, a: 1.4 },
      { r: 22, a: 2.1 },
      { r: 14, a: 5.2 },
      { r: 29, a: 3.5 },
      { r: 33, a: 6.0 }
    ];

    ctx.save();
    for (let i = 0; i < sprinklePositions.length; i++) {
      const pos = sprinklePositions[i];
      const sx = cx + Math.cos(pos.a) * pos.r;
      const sy = cy + Math.sin(pos.a) * pos.r;
      const col = sprinkleColors[i % sprinkleColors.length];

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(pos.a + i);
      ctx.beginPath();
      ctx.roundRect(-4, -2, 8, 4, 2);
      ctx.fillStyle = col;
      ctx.fill();
      // Dot shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(-2, -1, 3, 2);
      ctx.restore();
    }
    ctx.restore();

    // Luster shine
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx - 16, cy - 16, 9, 0, Math.PI * 2);
    const spec = ctx.createRadialGradient(cx - 16, cy - 16, 1, cx - 16, cy - 16, 9);
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.fill();
    ctx.restore();
  }

  private prebakeBoardCells(): void {
    // Normal Cell
    const cell = this.createOffscreenCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = cell.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      const pad = 4;
      ctx.beginPath();
      ctx.roundRect(pad, pad, SPRITE_SIZE - pad * 2, SPRITE_SIZE - pad * 2, 14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();

      // Inner soft gradient
      const innerGrad = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE);
      innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
      innerGrad.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
      ctx.fillStyle = innerGrad;
      ctx.fill();
    }
    this.cellCanvas = cell;

    // Selected Cell Glow
    const selCell = this.createOffscreenCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const selCtx = selCell.getContext('2d');
    if (selCtx) {
      selCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      const pad = 4;
      selCtx.beginPath();
      selCtx.roundRect(pad, pad, SPRITE_SIZE - pad * 2, SPRITE_SIZE - pad * 2, 14);
      selCtx.fillStyle = 'rgba(255, 215, 0, 0.18)';
      selCtx.fill();
      selCtx.lineWidth = 4;
      selCtx.strokeStyle = '#ffd700';
      selCtx.shadowColor = '#ffd700';
      selCtx.shadowBlur = 12;
      selCtx.stroke();
    }
    this.selectedCellCanvas = selCell;
  }

  private prebakeParticles(): void {
    // 4-pointed sugar sparkle star
    const star = this.createOffscreenCanvas(64, 64);
    const starCtx = star.getContext('2d');
    if (starCtx) {
      starCtx.clearRect(0, 0, 64, 64);
      const cx = 32;
      const cy = 32;
      starCtx.fillStyle = '#ffffff';
      starCtx.shadowColor = '#ffd000';
      starCtx.shadowBlur = 8;
      starCtx.beginPath();
      starCtx.moveTo(cx, cy - 24);
      starCtx.quadraticCurveTo(cx, cy, cx + 24, cy);
      starCtx.quadraticCurveTo(cx, cy, cx, cy + 24);
      starCtx.quadraticCurveTo(cx, cy, cx - 24, cy);
      starCtx.quadraticCurveTo(cx, cy, cx, cy - 24);
      starCtx.closePath();
      starCtx.fill();
    }
    this.sparkleCanvas = star;

    // Color shards
    const colors = [
      CandyColor.RED,
      CandyColor.ORANGE,
      CandyColor.YELLOW,
      CandyColor.GREEN,
      CandyColor.BLUE,
      CandyColor.PURPLE
    ];
    const hexMap: Record<CandyColor, string> = {
      [CandyColor.RED]: '#ff1744',
      [CandyColor.ORANGE]: '#ff9100',
      [CandyColor.YELLOW]: '#ffea00',
      [CandyColor.GREEN]: '#00e676',
      [CandyColor.BLUE]: '#00e5ff',
      [CandyColor.PURPLE]: '#d500f9',
      [CandyColor.NONE]: '#ffffff'
    };

    for (const c of colors) {
      const shards: HTMLCanvasElement[] = [];
      for (let i = 0; i < 3; i++) {
        const shard = this.createOffscreenCanvas(32, 32);
        const sctx = shard.getContext('2d');
        if (sctx) {
          sctx.fillStyle = hexMap[c];
          sctx.beginPath();
          if (i === 0) {
            sctx.moveTo(8, 4);
            sctx.lineTo(26, 12);
            sctx.lineTo(16, 28);
          } else if (i === 1) {
            sctx.moveTo(4, 16);
            sctx.lineTo(28, 6);
            sctx.lineTo(22, 26);
          } else {
            sctx.moveTo(16, 4);
            sctx.lineTo(28, 24);
            sctx.lineTo(6, 20);
          }
          sctx.closePath();
          sctx.fill();
        }
        shards.push(shard);
      }
      this.particleShards.set(c, shards);
    }
  }
}
