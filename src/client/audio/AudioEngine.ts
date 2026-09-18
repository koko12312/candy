/**
 * Match Pop Multiplayer - Procedural Web Audio API Sound Engine
 * Zero external audio assets (100% procedural synthesis).
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private isMuted = false;
  private sfxVolume = 0.8;
  private isUnlocked = false;

  constructor() {
    this.initAudioContext();
    this.setupUnlockListener();
  }

  private initAudioContext(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain.gain.setValueAtTime(this.isMuted ? 0 : this.sfxVolume, this.ctx.currentTime);
      }
    } catch (e) {
      // Audio context initialization error or not supported
    }
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getMasterGain(): GainNode | null {
    return this.masterGain;
  }

  public setupUnlockListener(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
  }

  public async unlock(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        this.isUnlocked = true;
      } catch (e) {
        // Context resume error
      }
    } else if (this.ctx && this.ctx.state === 'running') {
      this.isUnlocked = true;
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.isMuted ? 0 : this.sfxVolume, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (this.sfxGain && this.ctx && !this.isMuted) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
  }

  // 1. Crunchy Match Pop with pitch stepping by cascade combo tier
  public playMatchPop(comboLevel = 1): void {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const combo = Math.min(comboLevel, 12);

    // Layer A: Noise Crunch burst (30ms)
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.035);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = buffer;

      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(2400, now);
      bandpass.Q.setValueAtTime(3.5, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      noiseSource.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(this.sfxGain);

      noiseSource.start(now);
      noiseSource.stop(now + 0.04);
    } catch (e) {
      // Ignored
    }

    // Layer B: Tonal Pop with combo pitch scaling
    try {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';

      const semitones = (combo - 1) * 2;
      const fStart = 550 * Math.pow(2, semitones / 12);
      const fEnd = 140 * Math.pow(2, semitones / 12);

      osc.frequency.setValueAtTime(fStart, now);
      osc.frequency.exponentialRampToValueAtTime(fEnd, now + 0.055);

      oscGain.gain.setValueAtTime(0.6, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.065);
    } catch (e) {
      // Ignored
    }
  }

  // 2. Swap Whoosh
  public playWhoosh(): void {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    try {
      const dur = 0.11;
      const bufferSize = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(350, now);
      filter.frequency.linearRampToValueAtTime(1400, now + dur * 0.5);
      filter.frequency.linearRampToValueAtTime(450, now + dur);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.22, now + dur * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      noise.start(now);
      noise.stop(now + dur + 0.01);
    } catch (e) {
      // Ignored
    }
  }

  // 3. Invalid Swap Thump (dull "uh-oh" pulse)
  public playInvalidSwap(): void {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    try {
      const playTone = (freq: number, startOffset: number) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + startOffset);

        gain.gain.setValueAtTime(0.35, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + 0.05);

        osc.connect(gain);
        gain.connect(this.sfxGain!);

        osc.start(now + startOffset);
        osc.stop(now + startOffset + 0.06);
      };

      playTone(110, 0);
      playTone(75, 0.04);
    } catch (e) {
      // Ignored
    }
  }

  // 4. Striped Laser Blast Sweep
  public playStripedLaser(): void {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    try {
      const dur = 0.32;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + dur);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4500, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + dur);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (e) {
      // Ignored
    }
  }

  // 5. Wrapped Double Explosion Boom
  public playWrappedExplosion(): void {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    try {
      const dur = 0.45;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + dur);

      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (e) {
      // Ignored
    }
  }

  // 6. Color Bomb Shimmer & Discharge
  public playColorBomb(): void {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    try {
      const carrier = this.ctx.createOscillator();
      const mod = this.ctx.createOscillator();
      const modGain = this.ctx.createGain();
      const masterGain = this.ctx.createGain();

      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(800, now);
      carrier.frequency.exponentialRampToValueAtTime(2200, now + 0.35);

      mod.type = 'triangle';
      mod.frequency.setValueAtTime(120, now);

      modGain.gain.setValueAtTime(400, now);

      masterGain.gain.setValueAtTime(0.35, now);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      mod.connect(modGain);
      modGain.connect(carrier.frequency);

      carrier.connect(masterGain);
      masterGain.connect(this.sfxGain);

      mod.start(now);
      carrier.start(now);
      mod.stop(now + 0.42);
      carrier.stop(now + 0.42);
    } catch (e) {
      // Ignored
    }
  }

  // 7. Woodblock Turn Timer Tick-Tock
  public playTimerTick(secondsRemaining: number): void {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';

      const freq = secondsRemaining <= 5 ? 1500 : secondsRemaining % 2 === 0 ? 1200 : 950;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {
      // Ignored
    }
  }

  // 8. Combo Fanfares ('sweet' | 'tasty' | 'delicious')
  public playComboFanfare(tier: 'sweet' | 'tasty' | 'delicious'): void {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const notes =
      tier === 'sweet'
        ? [523.25, 659.25, 783.99] // C5, E5, G5
        : tier === 'tasty'
        ? [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
        : [523.25, 783.99, 1046.5, 1318.51, 1567.98]; // C5, G5, C6, E6, G6

    notes.forEach((freq, idx) => {
      try {
        const noteStart = now + idx * 0.08;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0.28, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.18);

        osc.connect(gain);
        gain.connect(this.sfxGain!);

        osc.start(noteStart);
        osc.stop(noteStart + 0.2);
      } catch (e) {
        // Ignored
      }
    });
  }
}
