import { PlayerDTO, RoomStateDTO } from '../../shared/types';

export const AVATAR_MAP: Record<string, string> = {
  avatar_1: '🍬',
  avatar_2: '🍭',
  avatar_3: '🍫',
  avatar_4: '🍩',
  avatar_5: '🧁',
  avatar_6: '🍪'
};

export interface LobbyCallbacks {
  onCreateRoom: (name: string, avatarId: string) => Promise<void>;
  onJoinRoom: (roomCode: string, name: string, avatarId: string) => Promise<void>;
  onToggleReady: (isReady: boolean) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onFetchPublicRooms: () => Promise<RoomStateDTO[]>;
}

export class LobbyUI {
  private container: HTMLElement;
  private callbacks: LobbyCallbacks;

  private selectedAvatarId = 'avatar_1';
  private playerName = 'SweetCrusher';
  private isReady = false;
  private localPlayerId = '';

  // Elements
  private lobbyScreen: HTMLElement;
  private lobbyMainCard: HTMLElement;
  private lobbyWaitingCard: HTMLElement;
  private playerNameInput: HTMLInputElement;
  private avatarOptions: NodeListOf<HTMLElement>;
  private btnCreateRoom: HTMLButtonElement;
  private btnJoinPrompt: HTMLButtonElement;
  private joinFormRow: HTMLElement;
  private roomCodeInput: HTMLInputElement;
  private btnSubmitJoin: HTMLButtonElement;
  private publicRoomsList: HTMLElement;
  private btnRefreshRooms: HTMLButtonElement;

  private waitingRoomCode: HTMLElement;
  private btnCopyCode: HTMLButtonElement;
  private waitingSlotsContainer: HTMLElement;
  private btnToggleReady: HTMLButtonElement;
  private btnStartGame: HTMLButtonElement;
  private btnLeaveRoom: HTMLButtonElement;

  constructor(container: HTMLElement, callbacks: LobbyCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.lobbyScreen = this.container.querySelector('#lobby-screen') as HTMLElement;
    this.lobbyMainCard = this.container.querySelector('#lobby-main-card') as HTMLElement;
    this.lobbyWaitingCard = this.container.querySelector('#lobby-waiting-card') as HTMLElement;
    this.playerNameInput = this.container.querySelector('#player-name-input') as HTMLInputElement;
    this.avatarOptions = this.container.querySelectorAll('.avatar-option');
    this.btnCreateRoom = this.container.querySelector('#btn-create-room') as HTMLButtonElement;
    this.btnJoinPrompt = this.container.querySelector('#btn-join-room-prompt') as HTMLButtonElement;
    this.joinFormRow = this.container.querySelector('#join-form-row') as HTMLElement;
    this.roomCodeInput = this.container.querySelector('#room-code-input') as HTMLInputElement;
    this.btnSubmitJoin = this.container.querySelector('#btn-submit-join') as HTMLButtonElement;
    this.publicRoomsList = this.container.querySelector('#public-rooms-list') as HTMLElement;
    this.btnRefreshRooms = this.container.querySelector('#btn-refresh-rooms') as HTMLButtonElement;

    this.waitingRoomCode = this.container.querySelector('#waiting-room-code') as HTMLElement;
    this.btnCopyCode = this.container.querySelector('#btn-copy-code') as HTMLButtonElement;
    this.waitingSlotsContainer = this.container.querySelector('#waiting-slots-container') as HTMLElement;
    this.btnToggleReady = this.container.querySelector('#btn-toggle-ready') as HTMLButtonElement;
    this.btnStartGame = this.container.querySelector('#btn-start-game') as HTMLButtonElement;
    this.btnLeaveRoom = this.container.querySelector('#btn-leave-room') as HTMLButtonElement;

    this.bindEvents();
    this.loadInitialProfile();
  }

  public setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  public show(): void {
    this.lobbyScreen.classList.remove('hidden');
  }

  public hide(): void {
    this.lobbyScreen.classList.add('hidden');
  }

  public setWaitingMode(inWaitingRoom: boolean, roomCode = ''): void {
    if (inWaitingRoom) {
      this.lobbyMainCard.style.display = 'none';
      this.lobbyWaitingCard.style.display = 'block';
      this.waitingRoomCode.textContent = roomCode;
    } else {
      this.lobbyMainCard.style.display = 'block';
      this.lobbyWaitingCard.style.display = 'none';
      this.isReady = false;
      this.updateReadyButtonUI();
    }
  }

  private loadInitialProfile(): void {
    if (typeof localStorage !== 'undefined') {
      const name = localStorage.getItem('matchpop_player_name');
      const avatar = localStorage.getItem('matchpop_avatar_id');
      if (name) {
        this.playerName = name;
        this.playerNameInput.value = name;
      }
      if (avatar && AVATAR_MAP[avatar]) {
        this.selectedAvatarId = avatar;
        this.avatarOptions.forEach((opt) => {
          if (opt.getAttribute('data-avatar') === avatar) {
            opt.classList.add('selected');
          } else {
            opt.classList.remove('selected');
          }
        });
      }
    }
    this.refreshPublicRooms();
  }

  private bindEvents(): void {
    // Player Name Change
    this.playerNameInput.addEventListener('input', () => {
      this.playerName = this.playerNameInput.value.trim() || 'Player';
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('matchpop_player_name', this.playerName);
      }
    });

    // Avatar Selection
    this.avatarOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        const av = opt.getAttribute('data-avatar');
        if (av) {
          this.selectedAvatarId = av;
          this.avatarOptions.forEach((o) => o.classList.remove('selected'));
          opt.classList.add('selected');
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('matchpop_avatar_id', av);
          }
        }
      });
    });

    // Create Room
    this.btnCreateRoom.addEventListener('click', async () => {
      this.btnCreateRoom.disabled = true;
      try {
        await this.callbacks.onCreateRoom(this.getPlayerName(), this.selectedAvatarId);
      } catch (e: any) {
        alert(e.message || 'Failed to create room');
      } finally {
        this.btnCreateRoom.disabled = false;
      }
    });

    // Join Prompt Toggle
    this.btnJoinPrompt.addEventListener('click', () => {
      const isVisible = this.joinFormRow.style.display !== 'none';
      this.joinFormRow.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        this.roomCodeInput.focus();
      }
    });

    // Submit Join
    this.btnSubmitJoin.addEventListener('click', async () => {
      const code = this.roomCodeInput.value.trim().toUpperCase();
      if (!code) {
        alert('Please enter a room code');
        return;
      }
      this.btnSubmitJoin.disabled = true;
      try {
        await this.callbacks.onJoinRoom(code, this.getPlayerName(), this.selectedAvatarId);
      } catch (e: any) {
        alert(e.message || 'Failed to join room');
      } finally {
        this.btnSubmitJoin.disabled = false;
      }
    });

    // Public Rooms Refresh
    this.btnRefreshRooms.addEventListener('click', () => {
      this.refreshPublicRooms();
    });

    // Copy Room Code
    this.btnCopyCode.addEventListener('click', () => {
      const code = this.waitingRoomCode.textContent || '';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code);
        this.btnCopyCode.textContent = 'Copied!';
        setTimeout(() => {
          this.btnCopyCode.textContent = 'Copy Link';
        }, 1800);
      }
    });

    // Ready Button Toggle
    this.btnToggleReady.addEventListener('click', () => {
      this.isReady = !this.isReady;
      this.updateReadyButtonUI();
      this.callbacks.onToggleReady(this.isReady);
    });

    // Host Start Game
    this.btnStartGame.addEventListener('click', () => {
      this.callbacks.onStartGame();
    });

    // Leave Room
    this.btnLeaveRoom.addEventListener('click', () => {
      this.callbacks.onLeaveRoom();
      this.setWaitingMode(false);
    });
  }

  public getPlayerName(): string {
    const val = this.playerNameInput.value.trim();
    return val || this.playerName || 'SweetCrusher';
  }

  public getSelectedAvatar(): string {
    return this.selectedAvatarId;
  }

  private updateReadyButtonUI(): void {
    if (this.isReady) {
      this.btnToggleReady.textContent = 'Ready! (Cancel)';
      this.btnToggleReady.style.background = 'linear-gradient(180deg, #ff9800 0%, #e65100 100%)';
    } else {
      this.btnToggleReady.textContent = 'Ready Up';
      this.btnToggleReady.style.background = 'linear-gradient(180deg, #38d39f 0%, #159c6b 100%)';
    }
  }

  public async refreshPublicRooms(): Promise<void> {
    try {
      const rooms = await this.callbacks.onFetchPublicRooms();
      this.renderPublicRoomsList(rooms);
    } catch (e) {
      // Ignored
    }
  }

  public renderPublicRoomsList(rooms: RoomStateDTO[]): void {
    if (!this.publicRoomsList) return;
    this.publicRoomsList.innerHTML = '';

    if (!rooms || rooms.length === 0) {
      this.publicRoomsList.innerHTML = `
        <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 12px;">
          No active public rooms found. Create one!
        </div>
      `;
      return;
    }

    rooms.forEach((room) => {
      const item = document.createElement('div');
      item.className = 'room-item';
      const count = room.players.length;
      const isFull = count >= 4;

      item.innerHTML = `
        <div>
          <span style="font-weight: 800; color: var(--accent-yellow); font-size: 1.05rem;">${room.roomCode}</span>
          <span style="color: var(--text-muted); font-size: 0.85rem; margin-left: 8px;">(${count}/4 Players)</span>
        </div>
        <button class="btn-secondary" style="padding: 6px 14px; font-size: 0.85rem;" ${isFull ? 'disabled' : ''}>
          ${isFull ? 'Full' : 'Join'}
        </button>
      `;

      const joinBtn = item.querySelector('button');
      if (joinBtn && !isFull) {
        joinBtn.addEventListener('click', async () => {
          try {
            await this.callbacks.onJoinRoom(room.roomCode, this.getPlayerName(), this.selectedAvatarId);
          } catch (e: any) {
            alert(e.message || 'Failed to join room');
          }
        });
      }

      this.publicRoomsList.appendChild(item);
    });
  }

  // Update 4 Waiting Room Slot Cards
  public updateWaitingRoomState(state: RoomStateDTO): void {
    this.waitingSlotsContainer.innerHTML = '';

    const localPlayer = state.players.find((p) => p.playerId === this.localPlayerId);
    const isHost = localPlayer ? localPlayer.isHost : false;

    // Host has Start Game button, Guest has Ready Up button
    this.btnStartGame.style.display = isHost ? 'block' : 'none';
    this.btnToggleReady.style.display = isHost ? 'none' : 'block';

    // Start button enabled only if host and at least 1 player and all players are ready
    const allReady = state.players.length >= 1 && state.players.every((p) => p.isReady);
    this.btnStartGame.disabled = !isHost || !allReady;

    if (localPlayer) {
      this.isReady = localPlayer.isReady;
      this.updateReadyButtonUI();
    }

    for (let slot = 0; slot < 4; slot++) {
      const p = state.players.find((pl) => pl.slot === slot);
      const card = document.createElement('div');
      card.className = `slot-card ${p ? 'occupied' : ''}`;

      if (p) {
        const emoji = AVATAR_MAP[p.avatarId] || '🍬';
        const readyBadge = p.isHost
          ? `<span class="badge-ready" style="background:#ffd000; color:#4a2c00;">HOST</span>`
          : p.isReady
          ? `<span class="badge-ready">READY</span>`
          : `<span class="badge-waiting">WAITING</span>`;

        card.innerHTML = `
          <div class="slot-avatar">${emoji}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${p.name} ${p.playerId === this.localPlayerId ? '(You)' : ''}
            </div>
            <div style="margin-top: 4px;">${readyBadge}</div>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="slot-avatar" style="border: 2px dashed rgba(255,255,255,0.2);">+</div>
          <div style="color: var(--text-muted); font-size: 0.85rem; font-weight: 600;">
            Slot ${slot + 1} (Empty)
          </div>
        `;
      }

      this.waitingSlotsContainer.appendChild(card);
    }
  }
}
