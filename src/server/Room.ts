import { v4 as uuidv4 } from 'uuid';
import {
  PlayerDTO,
  RoomSettings,
  RoomStateDTO,
  RoomStatus,
  SpectatorDTO,
  Tile
} from '../shared/types';
import {
  DEFAULT_TURN_DURATION_MS,
  GRID_ROWS,
  RECONNECT_GRACE_PERIOD_MS
} from '../shared/constants';

export interface RoomPlayer {
  playerId: string;
  sessionToken: string;
  name: string;
  avatarId: string;
  slot: number; // 0..3
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  socketId?: string;
  score: number;
  consecutiveTimeouts: number;
  disconnectedAt?: number;
}

export interface RoomSpectator {
  playerId: string;
  sessionToken: string;
  name: string;
  avatarId: string;
  isConnected: boolean;
  socketId?: string;
}

export class Room {
  public readonly roomCode: string;
  public isPublic: boolean;
  public status: RoomStatus = 'LOBBY';
  public settings: RoomSettings;

  public players: RoomPlayer[] = [];
  public spectators: RoomSpectator[] = [];

  // Reconnection timers indexed by playerId
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  // Callbacks for room events
  public onStateChanged?: () => void;
  public onHostChanged?: (newHostId: string) => void;
  public onPlayerDisconnected?: (playerId: string) => void;
  public onPlayerReconnected?: (playerId: string) => void;
  public onPlayerForfeited?: (playerId: string) => void;

  constructor(
    roomCode: string,
    isPublic = true,
    settings?: Partial<RoomSettings>
  ) {
    this.roomCode = roomCode.toUpperCase();
    this.isPublic = isPublic;
    this.settings = {
      turnDurationSeconds: settings?.turnDurationSeconds ?? Math.round(DEFAULT_TURN_DURATION_MS / 1000),
      maxRounds: settings?.maxRounds ?? 10,
      boardSize: settings?.boardSize ?? GRID_ROWS
    };
  }

  /**
   * Adds a player or spectator to the room.
   */
  public addPlayer(
    name: string,
    avatarId = 'avatar_1',
    socketId?: string,
    asSpectator = false,
    existingSessionToken?: string
  ): { player?: RoomPlayer; spectator?: RoomSpectator; sessionToken: string; error?: string } {
    // If reconnecting with an existing token
    if (existingSessionToken) {
      const existingP = this.players.find((p) => p.sessionToken === existingSessionToken);
      if (existingP) {
        this.reconnectPlayer(existingSessionToken, socketId);
        return { player: existingP, sessionToken: existingP.sessionToken };
      }
      const existingS = this.spectators.find((s) => s.sessionToken === existingSessionToken);
      if (existingS) {
        existingS.isConnected = true;
        existingS.socketId = socketId;
        return { spectator: existingS, sessionToken: existingS.sessionToken };
      }
    }

    const sessionToken = uuidv4();
    const playerId = uuidv4();

    // Check if player wants or needs to join as spectator
    if (asSpectator || this.players.length >= 4 || this.status !== 'LOBBY') {
      const spectator: RoomSpectator = {
        playerId,
        sessionToken,
        name: name.trim().slice(0, 16) || `Spectator ${this.spectators.length + 1}`,
        avatarId,
        isConnected: true,
        socketId
      };
      this.spectators.push(spectator);
      this.notifyStateChanged();
      return { spectator, sessionToken };
    }

    // Assign lowest available slot 0..3
    const occupiedSlots = new Set(this.players.map((p) => p.slot));
    let slot = 0;
    while (occupiedSlots.has(slot) && slot < 4) {
      slot++;
    }

    const isHost = this.players.length === 0;
    const player: RoomPlayer = {
      playerId,
      sessionToken,
      name: name.trim().slice(0, 16) || `Player ${slot + 1}`,
      avatarId,
      slot,
      isReady: isHost, // Host is ready by default
      isHost,
      isConnected: true,
      socketId,
      score: 0,
      consecutiveTimeouts: 0
    };

    this.players.push(player);
    // Sort players by slot
    this.players.sort((a, b) => a.slot - b.slot);

    this.notifyStateChanged();
    return { player, sessionToken };
  }

  /**
   * Sets player ready state in LOBBY.
   */
  public setReady(playerId: string, isReady: boolean): boolean {
    if (this.status !== 'LOBBY') return false;
    const player = this.players.find((p) => p.playerId === playerId);
    if (!player) return false;
    player.isReady = isReady;
    this.notifyStateChanged();
    return true;
  }

  /**
   * Can game start?
   * Requires >= 1 player, all connected players ready.
   */
  public canStart(): boolean {
    if (this.status !== 'LOBBY') return false;
    if (this.players.length === 0) return false;
    const connectedPlayers = this.players.filter((p) => p.isConnected);
    if (connectedPlayers.length === 0) return false;
    return connectedPlayers.every((p) => p.isReady);
  }

  /**
   * Transition to IN_GAME.
   */
  public startGame(force = false): boolean {
    if (!force && !this.canStart()) return false;
    this.status = 'IN_GAME';
    this.notifyStateChanged();
    return true;
  }

  /**
   * Transition to GAME_OVER.
   */
  public endGame(): void {
    this.status = 'GAME_OVER';
    this.clearAllDisconnectTimers();
    this.notifyStateChanged();
  }

  /**
   * Return back to LOBBY (e.g. rematch).
   */
  public resetToLobby(): void {
    this.status = 'LOBBY';
    for (const p of this.players) {
      p.isReady = p.isHost;
      p.score = 0;
      p.consecutiveTimeouts = 0;
    }
    this.clearAllDisconnectTimers();
    this.notifyStateChanged();
  }

  /**
   * Handles player disconnection with a 45s grace period.
   */
  public handleDisconnect(socketId: string): RoomPlayer | RoomSpectator | null {
    const spectator = this.spectators.find((s) => s.socketId === socketId);
    if (spectator) {
      spectator.isConnected = false;
      spectator.socketId = undefined;
      this.notifyStateChanged();
      return spectator;
    }

    const player = this.players.find((p) => p.socketId === socketId);
    if (!player) return null;

    player.isConnected = false;
    player.socketId = undefined;
    player.disconnectedAt = Date.now();

    if (this.status === 'LOBBY') {
      // In lobby, mark unready
      player.isReady = false;
    }

    // Set 45-second reconnect grace timer
    this.clearDisconnectTimer(player.playerId);
    const timer = setTimeout(() => {
      this.handleGracePeriodExpired(player.playerId);
    }, RECONNECT_GRACE_PERIOD_MS);

    this.disconnectTimers.set(player.playerId, timer);

    if (this.onPlayerDisconnected) {
      this.onPlayerDisconnected(player.playerId);
    }
    this.notifyStateChanged();

    // Check host migration if host disconnected
    if (player.isHost) {
      this.migrateHost();
    }

    return player;
  }

  /**
   * Reconnects a player with their sessionToken.
   */
  public reconnectPlayer(sessionToken: string, newSocketId?: string): RoomPlayer | null {
    const player = this.players.find((p) => p.sessionToken === sessionToken);
    if (!player) return null;

    player.isConnected = true;
    player.socketId = newSocketId;
    player.disconnectedAt = undefined;

    this.clearDisconnectTimer(player.playerId);

    if (this.onPlayerReconnected) {
      this.onPlayerReconnected(player.playerId);
    }
    this.notifyStateChanged();
    return player;
  }

  /**
   * Voluntary leave mid-game or lobby.
   */
  public removePlayer(playerId: string): boolean {
    this.clearDisconnectTimer(playerId);

    const pIdx = this.players.findIndex((p) => p.playerId === playerId);
    if (pIdx !== -1) {
      const removed = this.players.splice(pIdx, 1)[0];
      if (removed.isHost && this.players.length > 0) {
        this.migrateHost();
      }
      if (this.onPlayerForfeited) {
        this.onPlayerForfeited(playerId);
      }
      this.notifyStateChanged();
      return true;
    }

    const sIdx = this.spectators.findIndex((s) => s.playerId === playerId);
    if (sIdx !== -1) {
      this.spectators.splice(sIdx, 1);
      this.notifyStateChanged();
      return true;
    }

    return false;
  }

  /**
   * Host migration to the lowest slot connected player.
   */
  public migrateHost(): RoomPlayer | null {
    let newHost = this.players.find((p) => p.isConnected && !p.isHost);
    if (!newHost && this.players.length > 0) {
      newHost = this.players[0];
    }

    if (!newHost) return null;

    for (const p of this.players) {
      p.isHost = p.playerId === newHost.playerId;
    }

    if (this.onHostChanged) {
      this.onHostChanged(newHost.playerId);
    }
    this.notifyStateChanged();
    return newHost;
  }

  /**
   * When 45s grace period expires.
   */
  private handleGracePeriodExpired(playerId: string): void {
    this.clearDisconnectTimer(playerId);
    const player = this.players.find((p) => p.playerId === playerId);
    if (!player || player.isConnected) return;

    if (this.status === 'LOBBY') {
      // In lobby, completely remove player
      this.removePlayer(playerId);
    } else {
      // IN_GAME or GAME_OVER, notify forfeiture
      if (this.onPlayerForfeited) {
        this.onPlayerForfeited(playerId);
      }
      this.notifyStateChanged();
    }
  }

  private clearDisconnectTimer(playerId: string): void {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }

  public clearAllDisconnectTimers(): void {
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }

  public getPlayerBySession(sessionToken: string): RoomPlayer | undefined {
    return this.players.find((p) => p.sessionToken === sessionToken);
  }

  public getPlayerById(playerId: string): RoomPlayer | undefined {
    return this.players.find((p) => p.playerId === playerId);
  }

  public getPlayerBySocket(socketId: string): RoomPlayer | undefined {
    return this.players.find((p) => p.socketId === socketId);
  }

  public getSpectatorBySocket(socketId: string): RoomSpectator | undefined {
    return this.spectators.find((s) => s.socketId === socketId);
  }

  public toDTO(): RoomStateDTO {
    const playersDTO: PlayerDTO[] = this.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      avatarId: p.avatarId,
      slot: p.slot,
      isReady: p.isReady,
      isHost: p.isHost,
      isConnected: p.isConnected,
      score: p.score,
      consecutiveTimeouts: p.consecutiveTimeouts
    }));

    const spectatorsDTO: SpectatorDTO[] = this.spectators.map((s) => ({
      playerId: s.playerId,
      name: s.name,
      avatarId: s.avatarId,
      isConnected: s.isConnected
    }));

    return {
      roomCode: this.roomCode,
      status: this.status,
      isPublic: this.isPublic,
      players: playersDTO,
      spectators: spectatorsDTO,
      spectatorCount: this.spectators.length,
      settings: { ...this.settings }
    };
  }

  private notifyStateChanged(): void {
    if (this.onStateChanged) {
      this.onStateChanged();
    }
  }
}
