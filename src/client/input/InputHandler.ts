import { Coordinate } from '../../shared/types';
import { CanvasRenderer } from '../render/CanvasRenderer';

export interface DragStartInfo {
  pointerId: number;
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
  private swipeThreshold = 24; // Drag distance in CSS pixels to trigger swap

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
    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointermove', (e: PointerEvent) => this.handlePointerMove(e));
    this.canvas.addEventListener('pointerup', (e: PointerEvent) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', (e: PointerEvent) => this.handlePointerCancel(e));
  }

  private getRelativeCoordinates(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.isLocked) return;
    e.preventDefault();

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignored if pointer capture not supported
    }

    const pos = this.getRelativeCoordinates(e);
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
      pointerId: e.pointerId,
      startX: pos.x,
      startY: pos.y,
      cell
    };
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.isLocked || !this.dragStart) return;
    if (e.pointerId !== this.dragStart.pointerId) return;

    const pos = this.getRelativeCoordinates(e);
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

  private handlePointerUp(e: PointerEvent): void {
    if (this.dragStart && e.pointerId === this.dragStart.pointerId) {
      this.dragStart = null;
    }
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignored
    }
  }

  private handlePointerCancel(e: PointerEvent): void {
    this.handlePointerUp(e);
  }

  public areAdjacent(c1: Coordinate, c2: Coordinate): boolean {
    const dr = Math.abs(c1.row - c2.row);
    const dc = Math.abs(c1.col - c2.col);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }
}
