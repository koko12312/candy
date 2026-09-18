import { CandyColor } from '../../shared/types';
import { TextureSynthesizer } from './TextureSynthesizer';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  scale: number;
  alpha: number;
  life: number;
  maxLife: number;
  type: 'shard' | 'sparkle' | 'shockwave' | 'laser';
  color?: CandyColor;
  customColor?: string;
  shardIndex?: number;
  radius?: number;
  maxRadius?: number;
  x2?: number;
  y2?: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private textures: TextureSynthesizer;
  private maxParticles = 300;

  constructor(textures: TextureSynthesizer) {
    this.textures = textures;
  }

  public spawnCandyShatter(x: number, y: number, color: CandyColor, count = 12): void {
    const shards = this.textures.getCandyShards(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 120 + Math.random() * 240;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60, // Slight upward pop
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 12,
        scale: 0.6 + Math.random() * 0.6,
        alpha: 1.0,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.25,
        type: 'shard',
        color,
        shardIndex: shards.length > 0 ? Math.floor(Math.random() * shards.length) : 0
      });
    }

    // Accompany with sugar sparkles
    this.spawnSparkles(x, y, 4);
  }

  public spawnSparkles(x: number, y: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 100;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 4,
        scale: 0.4 + Math.random() * 0.5,
        alpha: 1.0,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.2,
        type: 'sparkle'
      });
    }
  }

  public spawnShockwave(x: number, y: number, maxRadius = 120, customColor = 'rgba(255, 255, 255, 0.8)'): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      rotation: 0,
      vRot: 0,
      scale: 1,
      alpha: 1.0,
      life: 0,
      maxLife: 0.4,
      type: 'shockwave',
      radius: 8,
      maxRadius,
      customColor
    });
  }

  public spawnLaserSweep(x1: number, y1: number, x2: number, y2: number, customColor = '#ffffff'): void {
    this.particles.push({
      x: x1,
      y: y1,
      x2,
      y2,
      vx: 0,
      vy: 0,
      rotation: 0,
      vRot: 0,
      scale: 1,
      alpha: 1.0,
      life: 0,
      maxLife: 0.35,
      type: 'laser',
      customColor
    });
  }

  public update(dt: number): void {
    const gravity = 600; // pixels / sec^2

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      const progress = p.life / p.maxLife;

      if (p.type === 'shard') {
        p.vy += gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.vRot * dt;
        p.alpha = Math.max(0, 1 - progress * progress);
      } else if (p.type === 'sparkle') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.vRot * dt;
        p.alpha = Math.max(0, 1 - progress);
      } else if (p.type === 'shockwave') {
        if (p.radius !== undefined && p.maxRadius !== undefined) {
          p.radius += (p.maxRadius - p.radius) * (dt * 12);
        }
        p.alpha = Math.max(0, 1 - progress);
      } else if (p.type === 'laser') {
        p.alpha = Math.max(0, 1 - progress);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    const sparkleSprite = this.textures.getSparkleSprite();

    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (p.type === 'shard' && p.color !== undefined) {
        const shards = this.textures.getCandyShards(p.color);
        const shard = shards[p.shardIndex || 0];
        if (shard) {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          const size = 24 * p.scale;
          ctx.drawImage(shard, -size / 2, -size / 2, size, size);
        }
      } else if (p.type === 'sparkle' && sparkleSprite) {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        const size = 32 * p.scale;
        ctx.drawImage(sparkleSprite, -size / 2, -size / 2, size, size);
      } else if (p.type === 'shockwave' && p.radius) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.lineWidth = 6 * (1 - p.life / p.maxLife);
        ctx.strokeStyle = p.customColor || 'rgba(255, 255, 255, 0.8)';
        ctx.stroke();
      } else if (p.type === 'laser' && p.x2 !== undefined && p.y2 !== undefined) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x2, p.y2);
        ctx.lineWidth = 14 * (1 - p.life / p.maxLife);
        ctx.strokeStyle = p.customColor || '#ffffff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 16;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  public clear(): void {
    this.particles = [];
  }
}
