/**
 * Deterministic Mulberry32 Pseudo-Random Number Generator.
 * 32-bit state, deterministic, fast, zero external dependencies.
 */
export class PRNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /**
   * Returns pseudo-random float in [0, 1)
   */
  next(): number {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns pseudo-random integer in [min, max] inclusive
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Selects random element from array
   */
  choice<T>(arr: T[]): T {
    if (arr.length === 0) {
      throw new Error('PRNG.choice called on empty array');
    }
    const idx = Math.floor(this.next() * arr.length);
    return arr[idx];
  }

  /**
   * Returns current internal state
   */
  getState(): number {
    return this.s;
  }

  /**
   * Sets internal state
   */
  setState(state: number): void {
    this.s = state >>> 0;
  }
}
