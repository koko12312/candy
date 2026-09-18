import { io, Socket } from 'socket.io-client';
import {
  Coordinate,
  GameOverPayload,
  GameStartPayload,
  GameSyncStatePayload,
  MoveResultPayload,
  ProposeMovePayload,
  ReshufflePayload,
  RoomCreateRequest,
  RoomCreatedResponse,
  RoomJoinRequest,
  RoomReadyRequest,
  RoomStateDTO,
  TurnChangePayload,
  TurnTimeoutPayload
} from '../../shared/types';

export interface NetworkCallbacks {
  onRoomState?: (state: RoomStateDTO) => void;
  onRoomCreated?: (res: RoomCreatedResponse) => void;
  onRoomJoined?: (res: any) => void;
  onGameStart?: (payload: GameStartPayload) => void;
  onMoveResult?: (payload: MoveResultPayload) => void;
  onTurnChange?: (payload: TurnChangePayload) => void;
  onTurnTimeout?: (payload: TurnTimeoutPayload) => void;
  onReshuffle?: (payload: ReshufflePayload) => void;
  onLevelUp?: (payload: import('../../shared/types').LevelUpPayload) => void;
  onGameOver?: (payload: GameOverPayload) => void;
  onGameSyncState?: (payload: GameSyncStatePayload) => void;
  onPlayerDisconnected?: (data: { playerId: string; graceSecondsRemaining: number }) => void;
  onPlayerReconnected?: (data: { playerId: string }) => void;
  onPlayerForfeited?: (data: { playerId: string }) => void;
  onError?: (err: { message: string }) => void;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
}

const STORAGE_KEY_TOKEN = 'matchpop_session_token';
const STORAGE_KEY_ROOM = 'matchpop_last_room';
const STORAGE_KEY_PLAYER_ID = 'matchpop_player_id';
const STORAGE_KEY_NAME = 'matchpop_player_name';
const STORAGE_KEY_AVATAR = 'matchpop_avatar_id';

export class NetworkClient {
  private socket: Socket | null = null;
  private serverUrl: string = '';
  private currentRoomCode: string = '';
  private currentSessionToken: string = '';
  private currentPlayerId: string = '';
  private currentSlot: number = -1;
  private callbacks: NetworkCallbacks = {};

  constructor(callbacks?: NetworkCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
    this.loadPersistedSession();
  }

  public setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public connect(url?: string): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    const envUrl = (import.meta as any).env?.VITE_SERVER_URL;
    let queryUrl: string | null = null;
    let localStoredUrl: string | null = null;

    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        queryUrl = params.get('server');
        localStoredUrl = localStorage.getItem('matchpop_server_url');
      } catch (e) {
        // Ignored
      }
    }

    if (url) {
      this.serverUrl = url;
    } else if (queryUrl) {
      this.serverUrl = queryUrl;
      if (typeof localStorage !== 'undefined') localStorage.setItem('matchpop_server_url', queryUrl);
    } else if (envUrl) {
      this.serverUrl = envUrl;
    } else if (localStoredUrl) {
      this.serverUrl = localStoredUrl;
    } else if (typeof window !== 'undefined') {
      if (window.location.port === '3000') {
        this.serverUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
      } else if (window.location.protocol.startsWith('http')) {
        this.serverUrl = window.location.origin;
      } else {
        // Local APK / file protocol / capacitor
        this.serverUrl = 'http://localhost:3001';
      }
    } else {
      this.serverUrl = 'http://localhost:3001';
    }

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    this.registerEventHandlers();
    return this.socket;
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public isConnected(): boolean {
    return !!this.socket && this.socket.connected;
  }

  public getRoomCode(): string {
    return this.currentRoomCode;
  }

  public getSessionToken(): string {
    return this.currentSessionToken;
  }

  public getPlayerId(): string {
    return this.currentPlayerId;
  }

  public getSlot(): number {
    return this.currentSlot;
  }

  public getServerUrl(): string {
    return this.serverUrl || 'http://localhost:3001';
  }

  private registerEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.callbacks.onConnect?.();
    });

    this.socket.on('disconnect', (reason: string) => {
      this.callbacks.onDisconnect?.(reason);
    });

    this.socket.on('room:state', (state: RoomStateDTO) => {
      this.callbacks.onRoomState?.(state);
    });

    this.socket.on('room:created', (res: RoomCreatedResponse) => {
      this.setSession(res.roomCode, res.sessionToken, res.playerId, res.slot);
      this.callbacks.onRoomCreated?.(res);
    });

    this.socket.on('room:joined', (res: any) => {
      this.setSession(res.roomCode, res.sessionToken, res.playerId, res.slot);
      this.callbacks.onRoomJoined?.(res);
    });

    this.socket.on('game:start', (payload: GameStartPayload) => {
      this.callbacks.onGameStart?.(payload);
    });

    this.socket.on('game:move_result', (payload: MoveResultPayload) => {
      this.callbacks.onMoveResult?.(payload);
    });

    this.socket.on('game:turn_change', (payload: TurnChangePayload) => {
      this.callbacks.onTurnChange?.(payload);
    });

    this.socket.on('game:timeout', (payload: TurnTimeoutPayload) => {
      this.callbacks.onTurnTimeout?.(payload);
    });

    this.socket.on('game:reshuffle', (payload: ReshufflePayload) => {
      this.callbacks.onReshuffle?.(payload);
    });

    this.socket.on('game:level_up', (payload: import('../../shared/types').LevelUpPayload) => {
      this.callbacks.onLevelUp?.(payload);
    });

    this.socket.on('game:over', (payload: GameOverPayload) => {
      this.callbacks.onGameOver?.(payload);
    });

    this.socket.on('game:sync_state', (payload: GameSyncStatePayload) => {
      this.callbacks.onGameSyncState?.(payload);
    });

    this.socket.on('room:player_disconnected', (data: { playerId: string; graceSecondsRemaining: number }) => {
      this.callbacks.onPlayerDisconnected?.(data);
    });

    this.socket.on('room:player_reconnected', (data: { playerId: string }) => {
      this.callbacks.onPlayerReconnected?.(data);
    });

    this.socket.on('room:player_forfeited', (data: { playerId: string }) => {
      this.callbacks.onPlayerForfeited?.(data);
    });

    this.socket.on('error', (err: { message: string }) => {
      this.callbacks.onError?.(err);
    });
  }

  public setSession(roomCode: string, sessionToken: string, playerId: string, slot: number): void {
    this.currentRoomCode = roomCode;
    this.currentSessionToken = sessionToken;
    this.currentPlayerId = playerId;
    this.currentSlot = slot;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_ROOM, roomCode);
        localStorage.setItem(STORAGE_KEY_TOKEN, sessionToken);
        localStorage.setItem(STORAGE_KEY_PLAYER_ID, playerId);
      } catch (e) {
        // Storage restricted / private mode
      }
    }
  }

  public clearSession(): void {
    this.currentRoomCode = '';
    this.currentSessionToken = '';
    this.currentPlayerId = '';
    this.currentSlot = -1;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY_ROOM);
        localStorage.removeItem(STORAGE_KEY_TOKEN);
        localStorage.removeItem(STORAGE_KEY_PLAYER_ID);
      } catch (e) {
        // Ignored
      }
    }
  }

  public loadPersistedSession(): { roomCode: string; sessionToken: string; playerId: string } | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const room = localStorage.getItem(STORAGE_KEY_ROOM) || '';
      const token = localStorage.getItem(STORAGE_KEY_TOKEN) || '';
      const pid = localStorage.getItem(STORAGE_KEY_PLAYER_ID) || '';
      if (room && token) {
        this.currentRoomCode = room;
        this.currentSessionToken = token;
        this.currentPlayerId = pid;
        return { roomCode: room, sessionToken: token, playerId: pid };
      }
    } catch (e) {
      // Ignored
    }
    return null;
  }

  public getStoredProfile(): { name: string; avatarId: string } {
    let name = 'Player';
    let avatarId = 'avatar_1';
    if (typeof localStorage !== 'undefined') {
      try {
        const storedName = localStorage.getItem(STORAGE_KEY_NAME);
        const storedAvatar = localStorage.getItem(STORAGE_KEY_AVATAR);
        if (storedName) name = storedName;
        if (storedAvatar) avatarId = storedAvatar;
      } catch (e) {
        // Ignored
      }
    }
    return { name, avatarId };
  }

  public saveProfile(name: string, avatarId: string): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_NAME, name);
        localStorage.setItem(STORAGE_KEY_AVATAR, avatarId);
      } catch (e) {
        // Ignored
      }
    }
  }

  public createRoom(req: RoomCreateRequest): Promise<RoomCreatedResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket) this.connect();
      const timer = setTimeout(() => reject(new Error('Room creation timeout')), 5000);

      this.socket!.emit('room:create', req, (res: RoomCreatedResponse) => {
        clearTimeout(timer);
        this.setSession(res.roomCode, res.sessionToken, res.playerId, res.slot);
        resolve(res);
      });
    });
  }

  public joinRoom(req: RoomJoinRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) this.connect();
      const timer = setTimeout(() => reject(new Error('Room join timeout')), 5000);

      this.socket!.emit('room:join', req, (res: any) => {
        clearTimeout(timer);
        if (res && res.roomCode) {
          this.setSession(res.roomCode, res.sessionToken, res.playerId, res.slot);
        }
        resolve(res);
      });
    });
  }

  public setReady(isReady: boolean): void {
    if (!this.socket) return;
    const payload: RoomReadyRequest = { isReady };
    this.socket.emit('room:ready', payload);
  }

  public startGame(): void {
    if (!this.socket) return;
    this.socket.emit('room:start');
  }

  public sendMove(from: Coordinate, to: Coordinate): void {
    if (!this.socket || !this.currentRoomCode) return;
    const payload: ProposeMovePayload = {
      roomCode: this.currentRoomCode,
      from,
      to,
      clientTimestamp: Date.now()
    };
    this.socket.emit('game:move', payload);
  }

  public reconnect(roomCode: string, sessionToken: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) this.connect();
      const timer = setTimeout(() => reject(new Error('Reconnect timeout')), 5000);

      this.socket!.emit('room:reconnect', { roomCode, sessionToken }, (res: any) => {
        clearTimeout(timer);
        if (res && res.player) {
          this.setSession(roomCode, sessionToken, res.player.playerId, res.player.slot);
        }
        resolve(res);
      });
    });
  }

  public leaveRoom(): void {
    if (this.socket) {
      this.socket.emit('room:leave');
    }
    this.clearSession();
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
