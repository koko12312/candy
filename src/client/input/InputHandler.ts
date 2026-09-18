import { Coordinate } from '../../shared/types';
import { CanvasRenderer } from '../render/CanvasRenderer';

export interface DragStartInfo {
  id: number | string;
  startX: number;
  startY: number;
  cell: Coordinate;
}

export type SwapCallback = (from: Coordinate, to: Coordinate) => void;

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private renderer: CanvasRenderer;
  private onSwap: SwapCallback;

  private isLocked = false;
  private dragStart: DragStartInfo | null = null;
  private swipeThreshold = 14; // Lowered from 24px for responsive mobile touch

  constructor(canvas: HTMLCanvasElement, renderer: CanvasRenderer, onSwap: SwapCallback) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.onSwap = onSwap;

    this.bindEvents();
  }

  public setLocked(locked: boolean): void {
    this.isLocked = locked;
    if (locked) {
      this.dragStart = null;
      this.renderer.setSelectedCoordinate(null);
    }
  }

  public getLocked(): boolean {
    return this.isLocked;
  }

  private bindEvents(): void {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;

    // Pointer Events (Mouse, Pen, Modern Touch)
    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.onPointerDown(e.clientX, e.clientY, e.pointerId);
      e.preventDefault();
    });
    this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
      this.onPointerMove(e.clientX, e.clientY, e.pointerId);
      e.preventDefault();
    });
    this.canvas.addEventListener('pointerup', (e: PointerEvent) => {
      this.onPointerUp(e.pointerId);
    });
    this.canvas.addEventListener('pointercancel', (e: PointerEvent) => {
      this.onPointerUp(e.pointerId);
    });

    // Native Touch Events fallback for Android WebViews (passive: false to prevent gesture interference)
    this.canvas.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length > 0) {
          const t = e.touches[0];
          this.onPointerDown(t.clientX, t.clientY, t.identifier);
        }
        e.preventDefault();
      },
      { passive: false }
    );

    this.canvas.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (e.touches.length > 0) {
          const t = e.touches[0];
          this.onPointerMove(t.clientX, t.clientY, t.identifier);
        }
        e.preventDefault();
      },
      { passive: false }
    );

    this.canvas.addEventListener('touchend', (e: TouchEvent) => {
      if (this.dragStart) {
        this.onPointerUp(this.dragStart.id);
      }
    });

    this.canvas.addEventListener('touchcancel', (e: TouchEvent) => {
      if (this.dragStart) {
        this.onPointerUp(this.dragStart.id);
      }
    });
  }

  private getRelativeCoordinates(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const styleW = parseFloat(this.canvas.style.width) || rect.width;
    const styleH = parseFloat(this.canvas.style.height) || rect.height;
    const scaleX = rect.width > 0 ? styleW / rect.width : 1;
    const scaleY = rect.height > 0 ? styleH / rect.height : 1;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  private onPointerDown(clientX: number, clientY: number, id: number | string): void {
    if (this.isLocked) return;

    const pos = this.getRelativeCoordinates(clientX, clientY);
    const cell = this.renderer.getCellCoordinatesFromPixel(pos.x, pos.y);
    if (!cell) {
      this.renderer.setSelectedCoordinate(null);
      this.dragStart = null;
      return;
    }

    // Check tap-to-swap: Was an adjacent cell already selected?
    const prevSelected = this.renderer.getSelectedCoordinate();
    if (prevSelected) {
      const isAdj = this.areAdjacent(prevSelected, cell);
      if (isAdj) {
        // Tap on adjacent cell: trigger swap immediately!
        this.renderer.setSelectedCoordinate(null);
        this.dragStart = null;
        this.onSwap(prevSelected, cell);
        return;
      }
    }

    // Set new selection highlight
    this.renderer.setSelectedCoordinate(cell);
    this.dragStart = {
      id,
      startX: pos.x,
      startY: pos.y,
      cell
    };
  }

  private onPointerMove(clientX: number, clientY: number, id: number | string): void {
    if (this.isLocked || !this.dragStart) return;
    if (id !== this.dragStart.id) return;

    const pos = this.getRelativeCoordinates(clientX, clientY);
    const dx = pos.x - this.dragStart.startX;
    const dy = pos.y - this.dragStart.startY;
    const distSq = dx * dx + dy * dy;

    if (distSq >= this.swipeThreshold * this.swipeThreshold) {
      // Determine dominant direction
      let targetRow = this.dragStart.cell.row;
      let targetCol = this.dragStart.cell.col;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        targetCol += dx > 0 ? 1 : -1;
      } else {
        // Vertical swipe
        targetRow += dy > 0 ? 1 : -1;
      }

      // Check bounds (9x9)
      if (targetRow >= 0 && targetRow < 9 && targetCol >= 0 && targetCol < 9) {
        const from = { ...this.dragStart.cell };
        const to = { row: targetRow, col: targetCol };

        // Clear selection & start state to prevent double fires
        this.dragStart = null;
        this.renderer.setSelectedCoordinate(null);
        this.onSwap(from, to);
      }
    }
  }

  private onPointerUp(id: number | string): void {
    if (this.dragStart && this.dragStart.id === id) {
      this.dragStart = null;
    }
  }

  public areAdjacent(c1: Coordinate, c2: Coordinate): boolean {
    const dr = Math.abs(c1.row - c2.row);
    const dc = Math.abs(c1.col - c2.col);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }
}
