import { Coordinate, GameOverPayload, GameStartPayload, GameSyncStatePayload, MoveResultPayload, PlayerDTO, RoomStateDTO, Tile, TurnChangePayload, TurnTimeoutPayload } from '../shared/types';
import { NetworkClient } from './net/NetworkClient';
import { TextureSynthesizer } from './render/TextureSynthesizer';
import { CanvasRenderer } from './render/CanvasRenderer';
import { AudioEngine } from './audio/AudioEngine';
import { MusicSequencer } from './audio/MusicSequencer';
import { InputHandler } from './input/InputHandler';
import { LobbyUI } from './ui/LobbyUI';
import { HUD } from './ui/HUD';

declare global {
  interface Window {
    __MATCH_POP__: {
      getRoomCode: () => string;
      getGameState: () => 'LOBBY' | 'IN_GAME' | 'GAME_OVER';
      getActiveSlot: () => number;
      getActivePlayerId: () => string;
      getBoardState: () => Tile[][];
      getBoardHash: () => string;
      getTurnRemainingSeconds: () => number;
      simulateSwap: (from: Coordinate, to: Coordinate) => Promise<boolean>;
      onCascadeSettled: (callback: () => void) => void;
      getScores: () => Record<string, number>;
      isSettled: () => boolean;
      getSettledCount: () => number;
    };
  }
}

export class MatchPopApp {
  private network: NetworkClient;
  private textures: TextureSynthesizer;
  private renderer: CanvasRenderer;
  private audio: AudioEngine;
  private music: MusicSequencer;
  private input: InputHandler;
  private lobbyUI: LobbyUI;
  private hud: HUD;

  private gameState: 'LOBBY' | 'IN_GAME' | 'GAME_OVER' = 'LOBBY';
  private currentBoard: Tile[][] = [];
  private currentPlayers: PlayerDTO[] = [];
  private activePlayerId = '';
  private activeSlot = 0;
  private isCascadeAnimating = false;
  private settledCount = 0;
  private cascadeSettledCallbacks: (() => void)[] = [];
  
  private currentLevel = 1;
  private currentTargetScore = 2000;

  constructor() {
    // 1. Audio Engine & Music Sequencer
    this.audio = new AudioEngine();
    this.music = new MusicSequencer(this.audio);

    // 2. Textures & Offscreen prebaking
    this.textures = new TextureSynthesizer();

    // 3. Canvases & Renderer
    const bgCanvas = document.getElementById('bg-canvas') as HTMLCanvasElement;
    const interactiveCanvas = document.getElementById('interactive-canvas') as HTMLCanvasElement;
    const canvasWrapper = document.getElementById('canvas-wrapper') as HTMLElement;

    this.renderer = new CanvasRenderer(
      bgCanvas,
      interactiveCanvas,
      canvasWrapper,
      this.textures,
      (soundName, combo) => this.handleSoundEvent(soundName, combo)
    );

    this.renderer.setOnCascadeSettled(() => {
      this.isCascadeAnimating = false;
      this.settledCount++;
      this.updateInputLockState();
      this.notifyCascadeSettled();
    });

    // 4. Input Handler
    this.input = new InputHandler(interactiveCanvas, this.renderer, (from, to) => {
      this.handlePlayerSwap(from, to);
    });
    this.input.setLocked(true); // Locked until game starts & our turn

    // 5. Network Client
    this.network = new NetworkClient({
      onConnect: () => this.handleConnect(),
      onDisconnect: (reason) => console.log('[Network] Disconnected:', reason),
      onRoomState: (state) => this.handleRoomState(state),
      onGameStart: (payload) => this.handleGameStart(payload),
      onMoveResult: (payload) => this.handleMoveResult(payload),
      onTurnChange: (payload) => this.handleTurnChange(payload),
      onTurnTimeout: (payload) => this.handleTurnTimeout(payload),
      onReshuffle: (payload) => this.handleReshuffle(payload),
      onLevelUp: (payload) => this.handleLevelUp(payload),
      onGameOver: (payload) => this.handleGameOver(payload),
      onGameSyncState: (payload) => this.handleGameSyncState(payload),
      onError: (err) => console.warn('[Network Error]', err.message)
    });

    // 6. UI Components (Lobby & HUD)
    this.lobbyUI = new LobbyUI(document.getElementById('app')!, {
      onCreateRoom: async (name, avatarId) => {
        this.audio.unlock();
        this.network.saveProfile(name, avatarId);
        const res = await this.network.createRoom({ playerName: name, avatarId, isPublic: true });
        this.lobbyUI.setLocalPlayerId(res.playerId);
        this.hud.setLocalPlayerId(res.playerId);
        this.lobbyUI.setWaitingMode(true, res.roomCode);
        this.hud.setRoomCode(res.roomCode);
      },
      onJoinRoom: async (roomCode, name, avatarId) => {
        this.audio.unlock();
        this.network.saveProfile(name, avatarId);
        const res = await this.network.joinRoom({ roomCode, playerName: name, avatarId });
        this.lobbyUI.setLocalPlayerId(res.playerId);
        this.hud.setLocalPlayerId(res.playerId);
        this.lobbyUI.setWaitingMode(true, res.roomCode);
        this.hud.setRoomCode(res.roomCode);
      },
      onToggleReady: (isReady) => {
        this.network.setReady(isReady);
      },
      onStartGame: () => {
        this.network.startGame();
      },
      onLeaveRoom: () => {
        this.network.leaveRoom();
        this.gameState = 'LOBBY';
        this.hud.hide();
        this.lobbyUI.show();
        this.lobbyUI.setWaitingMode(false);
      },
      onFetchPublicRooms: async () => {
        try {
          const apiBase = this.network.getServerUrl();
          const response = await fetch(`${apiBase}/api/rooms`);
          if (response.ok) {
            const data = await response.json();
            return data.rooms || [];
          }
        } catch (e) {
          // Ignored
        }
        return [];
      }
    });

    this.hud = new HUD(document.getElementById('app')!, {
      onToggleSound: () => this.audio.toggleMute(),
      onToggleMusic: () => this.music.toggleMute(),
      onBackToLobby: () => {
        this.network.returnToRoomLobby();
      },
      onTimerTick: (sec) => this.audio.playTimerTick(sec)
    });

    this.hud.setAudioButtonStates(this.audio.getMuted(), this.music.getMuted());

    // 7. Connect Network
    this.network.connect();

    // 8. Register Test Automation Hook
    this.exposeTestingHook();
  }

  private handleConnect(): void {
    const session = this.network.loadPersistedSession();
    if (session && session.roomCode && session.sessionToken) {
      this.network.reconnect(session.roomCode, session.sessionToken).catch(() => {
        this.network.clearSession();
      });
    }
  }

  private handleSoundEvent(name: string, combo = 1): void {
    switch (name) {
      case 'pop':
        this.audio.playMatchPop(combo);
        break;
      case 'whoosh':
        this.audio.playWhoosh();
        break;
      case 'invalid':
        this.audio.playInvalidSwap();
        break;
      case 'laser':
        this.audio.playStripedLaser();
        break;
      case 'wrapped':
        this.audio.playWrappedExplosion();
        break;
      case 'bomb':
        this.audio.playColorBomb();
        break;
      case 'sweet':
        this.audio.playComboFanfare('sweet');
        break;
      case 'tasty':
        this.audio.playComboFanfare('tasty');
        break;
      case 'delicious':
        this.audio.playComboFanfare('delicious');
        break;
    }
  }

  private moveTimeout: any = null;

  private handlePlayerSwap(from: Coordinate, to: Coordinate): void {
    if (this.gameState !== 'IN_GAME') return;
    if (this.network.getPlayerId() !== this.activePlayerId) return;

    this.input.setLocked(true);
    if (this.moveTimeout) clearTimeout(this.moveTimeout);
    this.moveTimeout = setTimeout(() => {
      if (this.gameState === 'IN_GAME' && !this.isCascadeAnimating) {
        this.updateInputLockState();
      }
    }, 4000);
    this.network.sendMove(from, to);
  }

  private handleRoomState(state: RoomStateDTO): void {
    this.currentPlayers = state.players;
    const pid = this.network.getPlayerId();
    if (pid) {
      this.lobbyUI.setLocalPlayerId(pid);
      this.hud.setLocalPlayerId(pid);
    }

    if (state.status === 'LOBBY') {
      if (this.gameState !== 'LOBBY') {
        this.gameState = 'LOBBY';
        this.hud.hide();
        this.lobbyUI.show();
        this.lobbyUI.setWaitingMode(true, this.network.getRoomCode());
      }
      this.lobbyUI.updateWaitingRoomState(state);
    } else if (state.status === 'IN_GAME') {
      this.lobbyUI.hide();
      this.hud.updatePlayers(state.players);
    }
  }

  private handleGameStart(payload: GameStartPayload): void {
    console.log('[Main] Received game:start', payload);
    try {
      this.gameState = 'IN_GAME';
      this.isCascadeAnimating = false; // Fix touch lock on second game
      this.currentBoard = payload.board;
      this.activePlayerId = payload.activePlayerId;
      this.currentLevel = payload.level || 1;
      this.currentTargetScore = payload.targetScore || 2000;

      const activePlayer = this.currentPlayers.find((p) => p.playerId === payload.activePlayerId);
      this.activeSlot = activePlayer ? activePlayer.slot : 0;

      this.lobbyUI.hide();
      this.hud.show();
      this.hud.setRoomCode(this.network.getRoomCode());
      this.hud.updatePlayers(this.currentPlayers);
      this.hud.updateLevel(this.currentLevel, 0, this.currentTargetScore);
      this.hud.updateTurn(
        payload.activePlayerId,
        activePlayer ? activePlayer.name : 'Player',
        payload.turnExpiresAt,
        payload.turnDurationMs
      );

      this.renderer.resize();
      this.renderer.setBoard(payload.board);

      this.music.start();
      this.updateInputLockState();
    } catch (err: any) {
      console.error('[Main] Error in handleGameStart:', err);
    }
  }

  private async handleMoveResult(payload: MoveResultPayload): Promise<void> {
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout);
      this.moveTimeout = null;
    }
    this.isCascadeAnimating = true;
    this.input.setLocked(true);

    if (!payload.valid && payload.reason === 'INVALID_SWAP') {
      this.audio.playInvalidSwap();
    }

    if (payload.boardAfterSettled && payload.boardAfterSettled.length > 0) {
      this.currentBoard = payload.boardAfterSettled;
    }

    if (payload.playerTotalScore !== undefined) {
      const p = this.currentPlayers.find((pl) => pl.playerId === payload.playerId);
      if (p) p.score = payload.playerTotalScore;
      this.hud.updatePlayers(this.currentPlayers);
      
      const totalScore = this.currentPlayers.reduce((sum, p) => sum + p.score, 0);
      this.hud.updateLevel(this.currentLevel, totalScore, this.currentTargetScore);
    }

    try {
      // Play visual animations
      await this.renderer.playEventsPipeline(payload.events, payload.boardAfterSettled);
      this.currentBoard = payload.boardAfterSettled;
    } catch (err) {
      console.error('[Main] Error playing events pipeline:', err);
    } finally {
      this.isCascadeAnimating = false;
      this.updateInputLockState();
    }
  }

  private handleTurnChange(payload: TurnChangePayload): void {
    this.activePlayerId = payload.activePlayerId;
    this.activeSlot = payload.slot;

    const activePlayer = this.currentPlayers.find((p) => p.playerId === payload.activePlayerId);
    this.hud.updateTurn(
      payload.activePlayerId,
      activePlayer ? activePlayer.name : `Slot ${payload.slot + 1}`,
      payload.turnExpiresAt,
      payload.turnDurationMs
    );

    this.updateInputLockState();
  }

  private handleTurnTimeout(payload: TurnTimeoutPayload): void {
    this.activePlayerId = payload.nextPlayerId;
    const activePlayer = this.currentPlayers.find((p) => p.playerId === payload.nextPlayerId);
    if (activePlayer) {
      this.activeSlot = activePlayer.slot;
      this.hud.updateTurn(payload.nextPlayerId, activePlayer.name, Date.now() + 20000, 20000);
    }
    this.updateInputLockState();
  }

  private handleReshuffle(payload: { reason: string; newBoard: Tile[][] }): void {
    this.currentBoard = payload.newBoard;
    this.renderer.setBoard(payload.newBoard);
  }

  private handleLevelUp(payload: import('../shared/types').LevelUpPayload): void {
    this.currentLevel = payload.newLevel;
    this.currentTargetScore = payload.newTargetScore;
    this.currentBoard = payload.newBoard;
    this.renderer.setBoard(payload.newBoard);
    
    // Play sound and visual effect (fanfare)
    this.audio.playComboFanfare('delicious');
    this.hud.showLevelUpOverlay(this.currentLevel);
    
    // Update HUD
    const totalScore = this.currentPlayers.reduce((s, p) => s + p.score, 0);
    this.hud.updateLevel(this.currentLevel, totalScore, this.currentTargetScore);
  }

  private handleGameOver(payload: import('../shared/types').GameOverPayload): void {
    this.gameState = 'GAME_OVER';
    this.input.setLocked(true);
    this.music.stop();
    this.hud.showGameOver(payload);
  }

  private handleGameSyncState(payload: GameSyncStatePayload): void {
    if (!payload) return;

    this.currentPlayers = payload.players;
    this.currentBoard = payload.board;
    this.activePlayerId = payload.activePlayerId;
    if (payload.level) this.currentLevel = payload.level;
    if (payload.targetScore) this.currentTargetScore = payload.targetScore;

    const activePlayer = this.currentPlayers.find((p) => p.playerId === payload.activePlayerId);
    this.activeSlot = activePlayer ? activePlayer.slot : 0;

    if (payload.status === 'IN_GAME') {
      this.gameState = 'IN_GAME';
      this.lobbyUI.hide();
      this.hud.show();
      this.hud.setRoomCode(payload.roomCode);
      this.hud.updatePlayers(payload.players);
      const totalScore = this.currentPlayers.reduce((sum, p) => sum + p.score, 0);
      this.hud.updateLevel(this.currentLevel, totalScore, this.currentTargetScore);
      this.hud.updateTurn(
        payload.activePlayerId,
        activePlayer ? activePlayer.name : 'Player',
        payload.turnExpiresAt,
        payload.turnDurationMs
      );

      this.renderer.resize();
      this.renderer.setBoard(payload.board);
      this.music.start();
      this.updateInputLockState();
    } else if (payload.status === 'LOBBY') {
      this.gameState = 'LOBBY';
      this.lobbyUI.show();
      this.lobbyUI.setWaitingMode(true, payload.roomCode);
    }
  }

  private updateInputLockState(): void {
    if (this.gameState !== 'IN_GAME' || this.isCascadeAnimating) {
      this.input.setLocked(true);
      return;
    }
    const isMyTurn = this.network.getPlayerId() === this.activePlayerId;
    this.input.setLocked(!isMyTurn);
  }

  private notifyCascadeSettled(): void {
    const cbs = [...this.cascadeSettledCallbacks];
    this.cascadeSettledCallbacks = [];
    cbs.forEach((cb) => cb());
  }

  private exposeTestingHook(): void {
    window.__MATCH_POP__ = {
      getRoomCode: () => this.network.getRoomCode(),
      getGameState: () => this.gameState,
      getActiveSlot: () => this.activeSlot,
      getActivePlayerId: () => this.activePlayerId,
      getBoardState: () => this.renderer.getBoardState(),
      getBoardHash: () => this.renderer.getBoardHash(),
      getTurnRemainingSeconds: () => this.hud.getTurnRemainingSeconds(),
      simulateSwap: (from: Coordinate, to: Coordinate): Promise<boolean> => {
        return new Promise((resolve) => {
          if (this.gameState !== 'IN_GAME') {
            resolve(false);
            return;
          }
          this.network.sendMove(from, to);
          resolve(true);
        });
      },
      onCascadeSettled: (callback: () => void) => {
        this.cascadeSettledCallbacks.push(callback);
      },
      getScores: () => {
        const scores: Record<string, number> = {};
        this.currentPlayers.forEach((p) => {
          scores[p.playerId] = p.score;
        });
        return scores;
      },
      isSettled: () => !this.isCascadeAnimating,
      getSettledCount: () => this.settledCount
    };
  }
}

// Auto-initialize when loaded in browser
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    new MatchPopApp();
  });
}
