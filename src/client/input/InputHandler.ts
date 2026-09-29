import { Coordinate } from '../../shared/types';
import { CanvasRenderer } from '../render/CanvasRenderer';

export interface DragStartInfo {
  id: number | string;
  startX: number;
  startY: number;
  cell: Coordinate;
  startTime: number;
}

export type SwapCallback = (from: Coordinate, to: Coordinate) => void;

/**
 * Commercial-Grade Universal Touch & Mouse Input Handler for Match Pop.
 * Features:
 * 1. Dual Gesture Engine: Fluid swipe drag-to-swap + intuitive two-tap swap.
 * 2. Hardware Pointer Capture: Zero dropped moves when dragging fast across edges.
 * 3. DPI & Viewport Safe: Dynamically computes bounding client rect on every touch.
 * 4. Self-Healing Failsafe: Automatically clears orphaned touch locks after 4 seconds.
 * 5. Touch Prevention: Stops default browser pinch/scroll behaviors cleanly.
 */
export class InputHandler {
  private canvas: HTMLCanvasElement;
  private renderer: CanvasRenderer;
  private onSwap: SwapCallback;

  private isLocked = false;
  private lastLockTime = 0;
  private dragStart: DragStartInfo | null = null;
  
  // Sensitive 12px threshold for instantaneous responsive feel on mobile screens
  private readonly swipeThreshold = 12;

  constructor(canvas: HTMLCanvasElement, renderer: CanvasRenderer, onSwap: SwapCallback) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.onSwap = onSwap;

    this.bindEvents();
  }

  public setLocked(locked: boolean): void {
    this.isLocked = locked;
    if (locked) {
      this.lastLockTime = Date.now();
      this.dragStart = null;
      this.renderer.setSelectedCoordinate(null);
    }
  }

  public getLocked(): boolean {
    // Self-healing watchdog: If locked for > 4.5 seconds with no reset, auto-unlock
    if (this.isLocked && Date.now() - this.lastLockTime > 4500) {
      console.warn('[InputHandler] Failsafe: Auto-unlocking stuck input lock');
      this.isLocked = false;
      this.dragStart = null;
    }
    return this.isLocked;
  }

  public forceUnlock(): void {
    this.isLocked = false;
    this.dragStart = null;
    this.renderer.setSelectedCoordinate(null);
  }

  private bindEvents(): void {
    if (!this.canvas) return;

    // 1. Primary: Pointer Events with pointer capture (modern Android WebView, Chrome, iOS Safari)
    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
      this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
        try {
          if (this.canvas.setPointerCapture) {
            this.canvas.setPointerCapture(e.pointerId);
          }
        } catch (_) {}
        this.handleTouchStart(e.clientX, e.clientY, e.pointerId);
      }, { passive: false });

      this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
        this.handleTouchMove(e.clientX, e.clientY, e.pointerId);
      }, { passive: false });

      const onPointerEnd = (e: PointerEvent) => {
        try {
          if (this.canvas.releasePointerCapture && this.canvas.hasPointerCapture?.(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
          }
        } catch (_) {}
        this.handleTouchEnd(e.clientX, e.clientY, e.pointerId);
      };

      this.canvas.addEventListener('pointerup', onPointerEnd, { passive: false });
      this.canvas.addEventListener('pointercancel', onPointerEnd, { passive: false });
    }

    // 2. Fallback: Pure Touch Events for older WebViews / embedded wrappers
    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const t = e.touches[0];
        this.handleTouchStart(t.clientX, t.clientY, t.identifier);
      }
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const t = e.touches[0];
        this.handleTouchMove(t.clientX, t.clientY, t.identifier);
      }
      e.preventDefault();
    }, { passive: false });

    const onTouchEnd = (e: TouchEvent) => {
      const id = this.dragStart ? this.dragStart.id : 0;
      const t = e.changedTouches[0];
      if (t) {
        this.handleTouchEnd(t.clientX, t.clientY, id);
      } else {
        this.handleTouchEnd(0, 0, id);
      }
    };

    this.canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }

  /**
   * Converts window clientX/clientY into exact canvas CSS coordinates.
   */
  private getRelativeCoordinates(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  private handleTouchStart(clientX: number, clientY: number, pointerId: number | string): void {
    if (this.getLocked()) return;

    const pos = this.getRelativeCoordinates(clientX, clientY);
    const cell = this.renderer.getCellCoordinatesFromPixel(pos.x, pos.y);
    if (!cell) {
      this.renderer.setSelectedCoordinate(null);
      this.dragStart = null;
      return;
    }

    // Two-Tap Mode: If user already tapped an adjacent cell previously, swap instantly!
    const prevSelected = this.renderer.getSelectedCoordinate();
    if (prevSelected) {
      if (this.areAdjacent(prevSelected, cell)) {
        this.renderer.setSelectedCoordinate(null);
        this.dragStart = null;
        this.executeSwap(prevSelected, cell);
        return;
      }
    }

    // Select the new tile with tactile glow
    this.renderer.setSelectedCoordinate(cell);
    this.dragStart = {
      id: pointerId,
      startX: pos.x,
      startY: pos.y,
      cell,
      startTime: Date.now()
    };
  }

  private handleTouchMove(clientX: number, clientY: number, pointerId: number | string): void {
    if (this.getLocked() || !this.dragStart) return;
    if (pointerId !== this.dragStart.id) return;

    const pos = this.getRelativeCoordinates(clientX, clientY);
    const dx = pos.x - this.dragStart.startX;
    const dy = pos.y - this.dragStart.startY;
    const distSq = dx * dx + dy * dy;

    // Once gesture passes threshold, determine cardinal direction & trigger move immediately
    if (distSq >= this.swipeThreshold * this.swipeThreshold) {
      let targetRow = this.dragStart.cell.row;
      let targetCol = this.dragStart.cell.col;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        targetCol += dx > 0 ? 1 : -1;
      } else {
        // Vertical swipe
        targetRow += dy > 0 ? 1 : -1;
      }

      // Ensure target is on 9x9 board
      if (targetRow >= 0 && targetRow < 9 && targetCol >= 0 && targetCol < 9) {
        const from = { ...this.dragStart.cell };
        const to = { row: targetRow, col: targetCol };

        // Clean up gesture state before swap
        this.dragStart = null;
        this.renderer.setSelectedCoordinate(null);
        this.executeSwap(from, to);
      }
    }
  }

  private handleTouchEnd(clientX: number, clientY: number, pointerId: number | string): void {
    if (!this.dragStart || this.dragStart.id !== pointerId) return;

    // If released on a cell quickly (tap gesture), check two-tap
    const pos = this.getRelativeCoordinates(clientX, clientY);
    const cell = this.renderer.getCellCoordinatesFromPixel(pos.x, pos.y);

    if (cell && this.renderer.getSelectedCoordinate()) {
      const prev = this.renderer.getSelectedCoordinate()!;
      if (this.areAdjacent(prev, cell)) {
        this.renderer.setSelectedCoordinate(null);
        this.dragStart = null;
        this.executeSwap(prev, cell);
        return;
      }
    }

    this.dragStart = null;
  }

  private executeSwap(from: Coordinate, to: Coordinate): void {
    this.setLocked(true);
    this.onSwap(from, to);
  }

  public areAdjacent(c1: Coordinate, c2: Coordinate): boolean {
    const dr = Math.abs(c1.row - c2.row);
    const dc = Math.abs(c1.col - c2.col);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }
}
