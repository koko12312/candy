import { AudioEngine } from './AudioEngine';

const STORAGE_KEY_BGM_MUTED = 'matchpop_bgm_muted';
const STORAGE_KEY_BGM_VOLUME = 'matchpop_bgm_volume';

export class MusicSequencer {
  private audioEngine: AudioEngine;
  private isPlaying = false;
  private isMuted = false;
  private volume = 0.45;
  private bgmGain: GainNode | null = null;
  private intervalId: number | null = null;

  // 96 BPM => 1 beat = 625ms, 16th note = 156.25ms
  private bpm = 96;
  private step = 0;

  // Calypso / Marimba Pentatonic Scale Notes (Hz)
  // C4, D4, E4, G4, A4, C5, D5, E5
  private scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

  // 16-step rhythmic melody pattern (indices into scale, or -1 for rest)
  private melodyPattern = [
    0, 2, 4, 2, 5, -1, 4, 2,
    3, 5, 6, 5, 4, 2, 0, -1
  ];

  // Bass pattern (roots in octave 2/3: C3: 130.81, G2: 98.0, A2: 110.0, F2: 87.31)
  private bassPattern = [
    130.81, -1, 130.81, -1, 196.0, -1, 130.81, -1,
    174.61, -1, 174.61, -1, 196.0, -1, 130.81, -1
  ];

  constructor(audioEngine: AudioEngine) {
    this.audioEngine = audioEngine;
    this.loadSettings();
    this.setupAudioNodes();
  }

  private loadSettings(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const savedMuted = localStorage.getItem(STORAGE_KEY_BGM_MUTED);
        const savedVol = localStorage.getItem(STORAGE_KEY_BGM_VOLUME);
        if (savedMuted !== null) this.isMuted = savedMuted === 'true';
        if (savedVol !== null) this.volume = parseFloat(savedVol);
      } catch (e) {
        // Storage restricted
      }
    }
  }

  private setupAudioNodes(): void {
    const ctx = this.audioEngine.getContext();
    const master = this.audioEngine.getMasterGain();
    if (!ctx || !master) return;

    this.bgmGain = ctx.createGain();
    this.bgmGain.connect(master);
    this.bgmGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, ctx.currentTime);
  }

  public start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;

    if (!this.bgmGain) {
      this.setupAudioNodes();
    }

    const stepIntervalMs = (60 / this.bpm / 4) * 1000; // 16th note in ms (~156.25ms)
    this.step = 0;

    if (typeof window !== 'undefined') {
      this.intervalId = window.setInterval(() => {
        this.tick();
      }, stepIntervalMs);
    }
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.intervalId !== null && typeof window !== 'undefined') {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    const ctx = this.audioEngine.getContext();
    if (!ctx || !this.bgmGain || this.isMuted || ctx.state !== 'running') {
      this.step = (this.step + 1) % 16;
      return;
    }

    const now = ctx.currentTime;
    const melodyIndex = this.melodyPattern[this.step];
    const bassFreq = this.bassPattern[this.step];

    // 1. Play melody note
    if (melodyIndex >= 0 && melodyIndex < this.scale.length) {
      try {
        const freq = this.scale[melodyIndex];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle'; // Crisp marimba-like round sound
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.bgmGain);

        osc.start(now);
        osc.stop(now + 0.15);
      } catch (e) {
        // Ignored
      }
    }

    // 2. Play bass note
    if (bassFreq > 0) {
      try {
        const bOsc = ctx.createOscillator();
        const bGain = ctx.createGain();
        const bFilter = ctx.createBiquadFilter();

        bOsc.type = 'sine';
        bOsc.frequency.setValueAtTime(bassFreq, now);

        bFilter.type = 'lowpass';
        bFilter.frequency.setValueAtTime(320, now);

        bGain.gain.setValueAtTime(0.24, now);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        bOsc.connect(bFilter);
        bFilter.connect(bGain);
        bGain.connect(this.bgmGain);

        bOsc.start(now);
        bOsc.stop(now + 0.3);
      } catch (e) {
        // Ignored
      }
    }

    this.step = (this.step + 1) % 16;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    const ctx = this.audioEngine.getContext();
    if (this.bgmGain && ctx) {
      this.bgmGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, ctx.currentTime);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_BGM_MUTED, String(this.isMuted));
      } catch (e) {
        // Ignored
      }
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
    this.volume = Math.max(0, Math.min(1, vol));
    const ctx = this.audioEngine.getContext();
    if (this.bgmGain && ctx && !this.isMuted) {
      this.bgmGain.gain.setValueAtTime(this.volume, ctx.currentTime);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_BGM_VOLUME, String(this.volume));
      } catch (e) {
        // Ignored
      }
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public isRunning(): boolean {
    return this.isPlaying;
  }
}
