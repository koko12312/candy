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
  private swipeThreshold = 14; // Responsive swipe distance
  private watchdogTimer: any = null;

  constructor(canvas: HTMLCanvasElement, renderer: CanvasRenderer, onSwap: SwapCallback) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.onSwap = onSwap;

    this.bindEvents();
  }

  public setLocked(locked: boolean): void {
    this.isLocked = locked;
    if (locked) {
      this.cancelDrag();
    }
  }

  public getLocked(): boolean {
    return this.isLocked;
  }

  public cancelDrag(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.dragStart = null;
    this.renderer.setSelectedCoordinate(null);
  }

  private bindEvents(): void {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;

    // 1. Modern Pointer Events (Chrome, Android WebView, Modern Browsers)
    const hasPointer = typeof window !== 'undefined' && 'PointerEvent' in window;

    if (hasPointer) {
      this.canvas.addEventListener(
        'pointerdown',
        (e: PointerEvent) => {
          try {
            if (this.canvas.setPointerCapture) {
              this.canvas.setPointerCapture(e.pointerId);
            }
          } catch (_) {}
          this.handleGestureStart(e.clientX, e.clientY, e.pointerId);
          e.preventDefault();
        },
        { passive: false }
      );

      this.canvas.addEventListener(
        'pointermove',
        (e: PointerEvent) => {
          this.handleGestureMove(e.clientX, e.clientY, e.pointerId);
          e.preventDefault();
        },
        { passive: false }
      );

      const onPointerEnd = (e: PointerEvent) => {
        try {
          if (this.canvas.releasePointerCapture && this.canvas.hasPointerCapture?.(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
          }
        } catch (_) {}
        this.handleGestureEnd(e.clientX, e.clientY, e.pointerId);
      };

      this.canvas.addEventListener('pointerup', onPointerEnd, { passive: false });
      this.canvas.addEventListener('pointercancel', onPointerEnd, { passive: false });
    }

    // 2. Touch Events Fallback (guarantees responsiveness on older WebView / mobile devices)
    this.canvas.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length > 0) {
          const t = e.touches[0];
          this.handleGestureStart(t.clientX, t.clientY, t.identifier);
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
          this.handleGestureMove(t.clientX, t.clientY, t.identifier);
        }
        e.preventDefault();
      },
      { passive: false }
    );

    const onTouchEnd = (e: TouchEvent) => {
      const id = this.dragStart ? this.dragStart.id : 0;
      if (e.changedTouches && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        this.handleGestureEnd(t.clientX, t.clientY, id);
      } else {
        this.handleGestureEnd(0, 0, id);
      }
    };

    this.canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // 3. Window safety net: release drag if user lifts finger outside canvas
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerup', (e: PointerEvent) => {
        if (this.dragStart && this.dragStart.id === e.pointerId) {
          this.handleGestureEnd(e.clientX, e.clientY, e.pointerId);
        }
      });
      window.addEventListener('touchend', () => {
        if (this.dragStart) {
          this.cancelDrag();
        }
      });
    }
  }

  private getRelativeCoordinates(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  private handleGestureStart(clientX: number, clientY: number, id: number | string): void {
    if (this.isLocked) return;

    // Safety watchdog: reset after 3s if gesture somehow hangs
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      if (this.dragStart) {
        this.cancelDrag();
      }
    }, 3000);

    const pos = this.getRelativeCoordinates(clientX, clientY);
    const cell = this.renderer.getCellCoordinatesFromPixel(pos.x, pos.y);
    if (!cell) {
      this.cancelDrag();
      return;
    }

    // Check tap-to-swap: Was an adjacent cell already selected?
    const prevSelected = this.renderer.getSelectedCoordinate();
    if (prevSelected) {
      const isAdj = this.areAdjacent(prevSelected, cell);
      if (isAdj) {
        // Tap on adjacent cell: trigger swap immediately!
        this.cancelDrag();
        this.executeSwap(prevSelected, cell);
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

  private handleGestureMove(clientX: number, clientY: number, id: number | string): void {
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

        this.cancelDrag();
        this.executeSwap(from, to);
      }
    }
  }

  private handleGestureEnd(clientX: number, clientY: number, id: number | string): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    if (this.dragStart && this.dragStart.id === id) {
      // Check if tap released on an adjacent cell
      if (clientX > 0 && clientY > 0) {
        const pos = this.getRelativeCoordinates(clientX, clientY);
        const cell = this.renderer.getCellCoordinatesFromPixel(pos.x, pos.y);
        const prev = this.renderer.getSelectedCoordinate();
        if (cell && prev && this.areAdjacent(prev, cell)) {
          this.cancelDrag();
          this.executeSwap(prev, cell);
          return;
        }
      }
      this.dragStart = null;
    }
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
