import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { RoomManager } from './RoomManager';
import { Room } from './Room';
import { GameSession } from './GameSession';
import {
  ProposeMovePayload,
  RoomCreateRequest,
  RoomCreatedResponse,
  RoomJoinRequest,
  RoomReadyRequest
} from '../shared/types';

export class SocketServer {
  private io: SocketIOServer;
  private roomManager: RoomManager;
  private gameSessions: Map<string, GameSession> = new Map();

  constructor(httpServer: HTTPServer, roomManager?: RoomManager) {
    this.roomManager = roomManager ?? new RoomManager();
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      },
      pingInterval: 25000,
      pingTimeout: 20000
    });

    this.setupEventHandlers();
  }

  public getIO(): SocketIOServer {
    return this.io;
  }

  public getRoomManager(): RoomManager {
    return this.roomManager;
  }

  public getGameSession(roomCode: string): GameSession | undefined {
    return this.gameSessions.get(roomCode.toUpperCase());
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      // 1. Create Room
      socket.on('room:create', (req: RoomCreateRequest, callback?: (res: RoomCreatedResponse) => void) => {
        try {
          const room = this.roomManager.createRoom(
            req.isPublic ?? true,
            req.settings
          );

          const { player, sessionToken } = room.addPlayer(
            req.playerName,
            req.avatarId ?? 'avatar_1',
            socket.id,
            false
          );

          socket.join(`room:${room.roomCode}`);

          // Attach room callbacks
          this.bindRoomCallbacks(room);

          const response: RoomCreatedResponse = {
            roomCode: room.roomCode,
            sessionToken,
            playerId: player!.playerId,
            slot: player!.slot
          };

          if (callback) callback(response);
          socket.emit('room:created', response);
          this.broadcastRoomState(room.roomCode);
        } catch (err: any) {
          socket.emit('error', { message: err.message || 'Failed to create room' });
        }
      });

      // 2. Join Room
      socket.on('room:join', (req: RoomJoinRequest, callback?: (res: any) => void) => {
        try {
          const room = this.roomManager.getRoom(req.roomCode);
          if (!room) {
            socket.emit('error', { message: `Room ${req.roomCode} not found` });
            return;
          }

          const result = room.addPlayer(
            req.playerName,
            req.avatarId ?? 'avatar_1',
            socket.id,
            req.asSpectator ?? false,
            req.sessionToken
          );

          socket.join(`room:${room.roomCode}`);
          this.bindRoomCallbacks(room);

          const resPayload = {
            roomCode: room.roomCode,
            sessionToken: result.sessionToken,
            playerId: result.player ? result.player.playerId : result.spectator!.playerId,
            slot: result.player ? result.player.slot : -1,
            isSpectator: !result.player
          };

          if (callback) callback(resPayload);
          socket.emit('room:joined', resPayload);
          this.broadcastRoomState(room.roomCode);
        } catch (err: any) {
          socket.emit('error', { message: err.message || 'Failed to join room' });
        }
      });

      // 3. Ready Toggle
      socket.on('room:ready', (req: RoomReadyRequest) => {
        const found = this.roomManager.findRoomBySocketId(socket.id);
        if (!found) return;

        found.room.setReady(found.playerId, req.isReady);
        this.broadcastRoomState(found.room.roomCode);
      });

      // 4. Start Game (Host only)
      socket.on('room:start', () => {
        const found = this.roomManager.findRoomBySocketId(socket.id);
        if (!found) return;

        const player = found.room.getPlayerById(found.playerId);
        if (!player || !player.isHost) {
          socket.emit('error', { message: 'Only the room host can start the game' });
          return;
        }

        if (!found.room.canStart()) {
          socket.emit('error', { message: 'Cannot start game: waiting for players to be ready' });
          return;
        }

        found.room.startGame();
        this.broadcastRoomState(found.room.roomCode);

        // Initialize and start GameSession
        const session = new GameSession(found.room, {
          onGameStart: (payload) => {
            this.io.to(`room:${found.room.roomCode}`).emit('game:start', payload);
          },
          onMoveResult: (payload) => {
            this.io.to(`room:${found.room.roomCode}`).emit('game:move_result', payload);
          },
          onTurnChange: (payload) => {
            this.io.to(`room:${found.room.roomCode}`).emit('game:turn_change', payload);
          },
          onTurnTimeout: (payload) => {
            this.io.to(`room:${found.room.roomCode}`).emit('game:timeout', payload);
          },
          onReshuffle: (payload) => {
            this.io.to(`room:${found.room.roomCode}`).emit('game:reshuffle', payload);
          },
          onLevelUp: (payload) => {
            this.io.to(`room:${found.room.roomCode}`).emit('game:level_up', payload);
            this.broadcastRoomState(found.room.roomCode);
          },
          onGameOver: (payload) => {
            this.io.to(`room:${found.room.roomCode}`).emit('game:over', payload);
            this.broadcastRoomState(found.room.roomCode);
          }
        });

        this.gameSessions.set(found.room.roomCode, session);
        session.start();
      });

      // 5. Propose Move
      socket.on('game:move', (payload: ProposeMovePayload) => {
        const room = this.roomManager.getRoom(payload.roomCode);
        if (!room) {
          socket.emit('error', { message: `Room ${payload.roomCode} not found` });
          return;
        }

        const session = this.gameSessions.get(room.roomCode);
        if (!session) {
          socket.emit('game:move_result', {
            valid: false,
            playerId: '',
            from: payload.from,
            to: payload.to,
            reason: 'GAME_NOT_ACTIVE',
            events: [],
            scoreAwarded: 0,
            playerTotalScore: 0,
            boardAfterSettled: [],
            needsReshuffle: false
          });
          return;
        }

        const player = room.getPlayerBySocket(socket.id);
        if (!player) {
          socket.emit('game:move_result', {
            valid: false,
            playerId: '',
            from: payload.from,
            to: payload.to,
            reason: 'NOT_YOUR_TURN',
            events: [],
            scoreAwarded: 0,
            playerTotalScore: 0,
            boardAfterSettled: session.board,
            needsReshuffle: false
          });
          return;
        }

        const result = session.handleMove(player.playerId, payload.from, payload.to);
        if (
          !result.valid &&
          (result.reason === 'NOT_YOUR_TURN' ||
            result.reason === 'GAME_NOT_ACTIVE' ||
            result.reason === 'EVALUATING')
        ) {
          socket.emit('game:move_result', result);
        }
      });

      // 6. Reconnect Handshake
      socket.on('room:reconnect', (data: { roomCode: string; sessionToken: string }, callback?: (res: any) => void) => {
        const room = this.roomManager.getRoom(data.roomCode);
        if (!room) {
          socket.emit('error', { message: `Room ${data.roomCode} not found` });
          return;
        }

        const player = room.reconnectPlayer(data.sessionToken, socket.id);
        if (!player) {
          socket.emit('error', { message: 'Invalid session token for room' });
          return;
        }

        socket.join(`room:${room.roomCode}`);
        this.bindRoomCallbacks(room);

        const session = this.gameSessions.get(room.roomCode);
        const syncState = session ? session.getSyncState() : null;

        const resPayload = {
          success: true,
          player: {
            playerId: player.playerId,
            name: player.name,
            slot: player.slot
          },
          syncState
        };

        if (callback) callback(resPayload);
        socket.emit('game:sync_state', syncState);
        this.broadcastRoomState(room.roomCode);
        this.io.to(`room:${room.roomCode}`).emit('room:player_reconnected', { playerId: player.playerId });
      });

      // 7. Leave Room
      socket.on('room:leave', () => {
        const found = this.roomManager.findRoomBySocketId(socket.id);
        if (!found) return;

        const roomCode = found.room.roomCode;
        socket.leave(`room:${roomCode}`);
        found.room.removePlayer(found.playerId);

        const session = this.gameSessions.get(roomCode);
        if (session) {
          session.handlePlayerDropped(found.playerId, true);
        }

        this.broadcastRoomState(roomCode);
        this.roomManager.cleanupEmptyRooms();
      });

      // 8. Disconnect
      socket.on('disconnect', () => {
        const found = this.roomManager.findRoomBySocketId(socket.id);
        if (!found) return;

        const { room, playerId } = found;
        room.handleDisconnect(socket.id);

        const session = this.gameSessions.get(room.roomCode);
        if (session && room.status === 'IN_GAME') {
          session.handlePlayerDropped(playerId, false);
        }

        this.broadcastRoomState(room.roomCode);
        this.io.to(`room:${room.roomCode}`).emit('room:player_disconnected', {
          playerId,
          graceSecondsRemaining: 45
        });
      });
    });
  }

  private bindRoomCallbacks(room: Room): void {
    room.onStateChanged = () => {
      this.broadcastRoomState(room.roomCode);
    };

    room.onHostChanged = (newHostId: string) => {
      this.io.to(`room:${room.roomCode}`).emit('room:host_changed', { newHostPlayerId: newHostId });
      this.broadcastRoomState(room.roomCode);
    };

    room.onPlayerForfeited = (playerId: string) => {
      const session = this.gameSessions.get(room.roomCode);
      if (session) {
        session.handlePlayerDropped(playerId, true);
      }
      this.io.to(`room:${room.roomCode}`).emit('room:player_forfeited', { playerId });
      this.broadcastRoomState(room.roomCode);
    };
  }

  public broadcastRoomState(roomCode: string): void {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    this.io.to(`room:${room.roomCode}`).emit('room:state', room.toDTO());
  }

  public close(): Promise<void> {
    for (const session of this.gameSessions.values()) {
      session.destroy();
    }
    this.gameSessions.clear();

    return new Promise((resolve) => {
      this.io.close(() => resolve());
    });
  }
}
