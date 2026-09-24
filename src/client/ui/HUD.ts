import { GameOverPayload, PlayerDTO } from '../../shared/types';
import { AVATAR_MAP } from './LobbyUI';

export interface HUDCallbacks {
  onToggleSound: () => boolean;
  onToggleMusic: () => boolean;
  onBackToLobby: () => void;
  onQuitMatch: () => void;
  onTimerTick?: (secondsRemaining: number) => void;
}

export class HUD {
  private container: HTMLElement;
  private callbacks: HUDCallbacks;

  private gameScreen: HTMLElement;
  private roomCodeBadge: HTMLElement;
  private btnSoundToggle: HTMLButtonElement;
  private btnMusicToggle: HTMLButtonElement;
  private btnExitGame: HTMLButtonElement;
  private timerRingProgress: SVGCircleElement;
  private timerNumberDisplay: HTMLElement;
  private turnBanner: HTMLElement;
  private playersStrip: HTMLElement;

  private gameOverModal: HTMLElement;
  private podiumEntries: HTMLElement;
  private btnPodiumLobby: HTMLButtonElement;

  private localPlayerId = '';
  private activePlayerId = '';
  private turnTimerInterval: number | null = null;
  private turnExpiresAt = 0;
  private turnDurationMs = 20000;
  private lastTickSecond = -1;

  constructor(container: HTMLElement, callbacks: HUDCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.gameScreen = this.container.querySelector('#game-screen') as HTMLElement;
    this.roomCodeBadge = this.container.querySelector('#hud-room-code') as HTMLElement;
    this.btnSoundToggle = this.container.querySelector('#btn-sound-toggle') as HTMLButtonElement;
    this.btnMusicToggle = this.container.querySelector('#btn-music-toggle') as HTMLButtonElement;
    this.btnExitGame = this.container.querySelector('#btn-exit-game') as HTMLButtonElement;
    this.timerRingProgress = this.container.querySelector('#timer-ring-progress') as SVGCircleElement;
    this.timerNumberDisplay = this.container.querySelector('#timer-number-display') as HTMLElement;
    this.turnBanner = this.container.querySelector('#turn-banner') as HTMLElement;
    this.playersStrip = this.container.querySelector('#hud-players-strip') as HTMLElement;

    this.gameOverModal = this.container.querySelector('#game-over-modal') as HTMLElement;
    this.podiumEntries = this.container.querySelector('#podium-entries') as HTMLElement;
    this.btnPodiumLobby = this.container.querySelector('#btn-podium-lobby') as HTMLButtonElement;

    this.bindEvents();
  }

  public setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  public show(): void {
    this.gameScreen.classList.remove('hidden');
    this.gameOverModal.classList.add('hidden');
  }

  public hide(): void {
    this.gameScreen.classList.add('hidden');
    this.stopTimer();
  }

  private levelBanner!: HTMLDivElement;

  public setRoomCode(code: string): void {
    this.roomCodeBadge.textContent = code;
  }

  public showLevelUpOverlay(level: number): void {
    const overlay = document.createElement('div');
    overlay.className = 'level-up-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.5);
      background: linear-gradient(135deg, #ff007b, #ff7b00);
      color: white;
      padding: 20px 40px;
      border-radius: 20px;
      font-size: 3rem;
      font-weight: 900;
      text-transform: uppercase;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 0 20px rgba(255,255,255,0.5);
      text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
      z-index: 1000;
      opacity: 0;
      transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      pointer-events: none;
      white-space: nowrap;
    `;
    overlay.innerHTML = `Level ${level}!`;
    this.container.appendChild(overlay);

    // Animate in
    setTimeout(() => {
      overlay.style.opacity = '1';
      overlay.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 50);

    // Animate out and remove
    setTimeout(() => {
      overlay.style.opacity = '0';
      overlay.style.transform = 'translate(-50%, -50%) scale(1.5)';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 500);
    }, 2500);
  }

  public updateLevel(level: number, currentTotalScore: number, targetScore: number): void {
    if (!this.levelBanner) {
      this.levelBanner = document.createElement('div');
      this.levelBanner.className = 'level-status-banner';
      this.levelBanner.style.cssText = 'background: rgba(0,0,0,0.5); color: white; padding: 4px 10px; border-radius: 12px; margin-top: 6px; font-weight: bold; font-size: 0.9rem; text-align: center; border: 2px solid var(--accent-yellow); pointer-events: none;';
      // Insert right after the room code badge area
      this.roomCodeBadge.parentElement?.appendChild(this.levelBanner);
    }
    this.levelBanner.innerHTML = `Level ${level} • Score: ${currentTotalScore.toLocaleString()} / ${targetScore.toLocaleString()}`;
  }

  private bindEvents(): void {
    this.btnSoundToggle.addEventListener('click', () => {
      const isMuted = this.callbacks.onToggleSound();
      this.btnSoundToggle.textContent = isMuted ? '🔇' : '🔊';
    });

    this.btnMusicToggle.addEventListener('click', () => {
      const isMuted = this.callbacks.onToggleMusic();
      this.btnMusicToggle.textContent = isMuted ? '🎵❌' : '🎵';
    });

    this.btnExitGame.addEventListener('click', () => {
      if (confirm('Are you sure you want to quit the match? You will leave the room entirely.')) {
        this.callbacks.onQuitMatch();
      }
    });

    this.btnPodiumLobby.addEventListener('click', () => {
      this.gameOverModal.classList.add('hidden');
      this.callbacks.onBackToLobby();
    });
  }

  public setAudioButtonStates(soundMuted: boolean, musicMuted: boolean): void {
    this.btnSoundToggle.textContent = soundMuted ? '🔇' : '🔊';
    this.btnMusicToggle.textContent = musicMuted ? '🎵❌' : '🎵';
  }

  public updateTurn(activePlayerId: string, playerName: string, expiresAt: number, durationMs = 20000): void {
    this.activePlayerId = activePlayerId;
    this.turnExpiresAt = expiresAt;
    this.turnDurationMs = durationMs;

    const isMyTurn = activePlayerId === this.localPlayerId;
    if (isMyTurn) {
      this.turnBanner.textContent = 'YOUR TURN!';
      this.turnBanner.className = 'turn-status-banner my-turn';
    } else {
      this.turnBanner.textContent = `${playerName}'s Turn`;
      this.turnBanner.className = 'turn-status-banner';
    }

    this.startTimer();
  }

  public getTurnRemainingSeconds(): number {
    const remainingMs = Math.max(0, this.turnExpiresAt - Date.now());
    return Math.ceil(remainingMs / 1000);
  }

  public startTimer(): void {
    this.stopTimer();
    this.lastTickSecond = -1;

    const updateRing = () => {
      const remainingMs = Math.max(0, this.turnExpiresAt - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      const fraction = Math.max(0, Math.min(1, remainingMs / this.turnDurationMs));

      // 2 * PI * 16 = ~100.5
      const circumference = 100.5;
      const offset = circumference * (1 - fraction);

      this.timerRingProgress.style.strokeDashoffset = String(offset);
      this.timerNumberDisplay.textContent = String(remainingSec);

      if (remainingSec <= 5) {
        this.timerNumberDisplay.classList.add('timer-critical');
        this.timerRingProgress.style.stroke = '#ff1744';
      } else {
        this.timerNumberDisplay.classList.remove('timer-critical');
        this.timerRingProgress.style.stroke = '#ffd000';
      }

      // Trigger audio tick once per second
      if (remainingSec !== this.lastTickSecond && remainingSec > 0 && remainingSec <= 10) {
        this.lastTickSecond = remainingSec;
        this.callbacks.onTimerTick?.(remainingSec);
      }

      if (remainingMs <= 0) {
        this.stopTimer();
      }
    };

    updateRing();
    if (typeof window !== 'undefined') {
      this.turnTimerInterval = window.setInterval(updateRing, 100);
    }
  }

  public stopTimer(): void {
    if (this.turnTimerInterval !== null && typeof window !== 'undefined') {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
  }

  public updatePlayers(players: PlayerDTO[]): void {
    this.playersStrip.innerHTML = '';

    players.forEach((p) => {
      const pill = document.createElement('div');
      const isActive = p.playerId === this.activePlayerId;
      pill.className = `player-pill ${isActive ? 'active' : ''} ${!p.isConnected ? 'disconnected' : ''}`;

      const emoji = AVATAR_MAP[p.avatarId] || '🍬';
      const isMe = p.playerId === this.localPlayerId;

      pill.innerHTML = `
        <div class="pill-avatar">${emoji}</div>
        <div class="pill-info">
          <div class="pill-name">${p.name} ${isMe ? '(You)' : ''}</div>
          <div class="pill-score">${p.score}</div>
        </div>
      `;

      this.playersStrip.appendChild(pill);
    });
  }

  public showGameOver(payload: GameOverPayload): void {
    this.stopTimer();
    this.podiumEntries.innerHTML = '';

    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    
    // Add victory/defeat title
    const titleItem = document.createElement('div');
    titleItem.style.cssText = 'text-align: center; margin-bottom: 20px;';
    if (payload.isVictory) {
      titleItem.innerHTML = `<h2 style="color: var(--accent-yellow); text-shadow: 0 0 10px rgba(255,215,0,0.5); font-size: 2rem;">🏆 VICTORY! 🏆</h2><p>Target Score Reached!</p>`;
    } else {
      titleItem.innerHTML = `<h2 style="color: #ff1744; font-size: 2rem;">Game Over</h2><p>Out of Rounds!</p>`;
    }
    this.podiumEntries.appendChild(titleItem);

    payload.rankings.forEach((entry, idx) => {
      const item = document.createElement('div');
      item.className = `podium-entry ${idx === 0 ? 'winner' : ''}`;
      const emoji = AVATAR_MAP[entry.avatarId] || '🍬';

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.4rem;">${medals[idx] || (idx + 1)}</span>
          <span style="font-size: 1.4rem;">${emoji}</span>
          <span style="font-weight: 700; font-size: 1.05rem;">
            ${entry.name} ${entry.playerId === this.localPlayerId ? '(You)' : ''}
          </span>
        </div>
        <div style="font-weight: 900; font-size: 1.2rem; color: var(--accent-yellow);">
          ${entry.finalScore.toLocaleString()} pts
        </div>
      `;

      this.podiumEntries.appendChild(item);
    });

    this.gameOverModal.classList.remove('hidden');
  }
}
