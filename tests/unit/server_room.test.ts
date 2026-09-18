import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { Room } from '../../src/server/Room';
import { RoomManager } from '../../src/server/RoomManager';
import { GameSession } from '../../src/server/GameSession';
import { createServer, AppServer } from '../../src/server/index';
import {
  GameStartPayload,
  GameSyncStatePayload,
  MoveResultPayload,
  RoomCreatedResponse,
  RoomStateDTO,
  TurnChangePayload,
  TurnTimeoutPayload
} from '../../src/shared/types';
import { Match3Engine } from '../../src/shared/engine/Match3Engine';
import { PRNG } from '../../src/shared/prng';

describe('Match Pop Multiplayer - Authoritative Server & Room Sync (Milestone M2)', () => {
  describe('1. Room State Machine & Slot Capacity (1-4 Players + Spectators)', () => {
    let room: Room;

    beforeEach(() => {
      room = new Room('TEST', true, { turnDurationSeconds: 20, maxRounds: 5 });
    });

    afterEach(() => {
      room.clearAllDisconnectTimers();
    });

    it('creates a room in LOBBY state with correct default settings', () => {
      expect(room.roomCode).toBe('TEST');
      expect(room.status).toBe('LOBBY');
      expect(room.isPublic).toBe(true);
      expect(room.players.length).toBe(0);
      expect(room.spectators.length).toBe(0);
      expect(room.settings.turnDurationSeconds).toBe(20);
      expect(room.settings.maxRounds).toBe(5);
    });

    it('assigns slots 0..3 sequentially and designates the first player as host', () => {
      const p1 = room.addPlayer('Alice', 'avatar_1', 'socket_1');
      expect(p1.player?.slot).toBe(0);
      expect(p1.player?.isHost).toBe(true);
      expect(p1.player?.isReady).toBe(true); // Host ready by default

      const p2 = room.addPlayer('Bob', 'avatar_2', 'socket_2');
      expect(p2.player?.slot).toBe(1);
      expect(p2.player?.isHost).toBe(false);
      expect(p2.player?.isReady).toBe(false);

      const p3 = room.addPlayer('Charlie', 'avatar_3', 'socket_3');
      expect(p3.player?.slot).toBe(2);

      const p4 = room.addPlayer('Diana', 'avatar_4', 'socket_4');
      expect(p4.player?.slot).toBe(3);
      expect(room.players.length).toBe(4);
    });

    it('automatically relegates the 5th joining player to a SPECTATOR', () => {
      room.addPlayer('P1');
      room.addPlayer('P2');
      room.addPlayer('P3');
      room.addPlayer('P4');

      const p5 = room.addPlayer('Eve', 'avatar_5', 'socket_5');
      expect(p5.player).toBeUndefined();
      expect(p5.spectator).toBeDefined();
      expect(p5.spectator?.name).toBe('Eve');
      expect(room.players.length).toBe(4);
      expect(room.spectators.length).toBe(1);
    });

    it('allows a player to explicitly join as spectator even if player slots are open', () => {
      room.addPlayer('Alice');
      const spectatorRes = room.addPlayer('Bob', 'avatar_2', 'socket_2', true);
      expect(spectatorRes.player).toBeUndefined();
      expect(spectatorRes.spectator).toBeDefined();
      expect(room.players.length).toBe(1);
      expect(room.spectators.length).toBe(1);
    });

    it('validates start prerequisites: requires all connected players to be ready', () => {
      const p1 = room.addPlayer('Host');
      const p2 = room.addPlayer('Guest');

      expect(room.canStart()).toBe(false);

      // Guest readies up
      room.setReady(p2.player!.playerId, true);
      expect(room.canStart()).toBe(true);

      expect(room.startGame()).toBe(true);
      expect(room.status).toBe('IN_GAME');
    });
  });

  describe('2. RoomManager Lifecycle & Matchmaking', () => {
    let manager: RoomManager;

    beforeEach(() => {
      manager = new RoomManager();
    });

    it('generates unique 4-letter uppercase room codes without ambiguous characters', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const code = manager.generateRoomCode();
        expect(code.length).toBe(4);
        expect(code).toMatch(/^[A-Z2-9]+$/);
        expect(code).not.toContain('0');
        expect(code).not.toContain('O');
        expect(code).not.toContain('1');
        expect(code).not.toContain('I');
        codes.add(code);
      }
      expect(codes.size).toBeGreaterThan(45);
    });

    it('creates, retrieves, and deletes rooms correctly', () => {
      const room = manager.createRoom(true, { turnDurationSeconds: 15 }, 'CANDY');
      expect(manager.getRoom('CANDY')).toBe(room);
      expect(manager.getRoom('candy')).toBe(room); // Case-insensitive lookup

      expect(manager.roomCount).toBe(1);
      expect(manager.deleteRoom('CANDY')).toBe(true);
      expect(manager.getRoom('CANDY')).toBeUndefined();
      expect(manager.roomCount).toBe(0);
    });

    it('finds public rooms that have available slots', () => {
      const r1 = manager.createRoom(true, {}, 'PUB1');
      const r2 = manager.createRoom(false, {}, 'PRIV');
      r1.addPlayer('Player1');

      const publicRooms = manager.findPublicRooms();
      expect(publicRooms.length).toBe(1);
      expect(publicRooms[0].roomCode).toBe('PUB1');

      // Fill r1 to 4 players
      r1.addPlayer('Player2');
      r1.addPlayer('Player3');
      r1.addPlayer('Player4');
      expect(manager.findPublicRooms().length).toBe(0);
    });
  });

  describe('3. Disconnect Grace Period & Host Migration', () => {
    let room: Room;

    beforeEach(() => {
      vi.useFakeTimers();
      room = new Room('MIGR');
    });

    afterEach(() => {
      room.clearAllDisconnectTimers();
      vi.useRealTimers();
    });

    it('marks player as disconnected and migrates host to next connected player', () => {
      const p1 = room.addPlayer('HostAlice', 'avatar_1', 'sock_1').player!;
      const p2 = room.addPlayer('Bob', 'avatar_2', 'sock_2').player!;

      expect(p1.isHost).toBe(true);
      expect(p2.isHost).toBe(false);

      // Disconnect host
      room.handleDisconnect('sock_1');
      expect(p1.isConnected).toBe(false);
      expect(p2.isHost).toBe(true); // Migrated!
    });

    it('allows player to reconnect with sessionToken within grace period', () => {
      const p1 = room.addPlayer('Alice', 'avatar_1', 'sock_1');
      const token = p1.sessionToken;

      room.handleDisconnect('sock_1');
      expect(p1.player!.isConnected).toBe(false);

      const reconnected = room.reconnectPlayer(token, 'sock_1_new');
      expect(reconnected).toBeDefined();
      expect(reconnected?.isConnected).toBe(true);
      expect(reconnected?.socketId).toBe('sock_1_new');
    });

    it('removes disconnected player in lobby when 45s grace period expires', () => {
      const p1 = room.addPlayer('Alice', 'avatar_1', 'sock_1');
      const p2 = room.addPlayer('Bob', 'avatar_2', 'sock_2');

      room.handleDisconnect('sock_2');
      expect(p2.player!.isConnected).toBe(false);
      expect(room.players.length).toBe(2);

      // Advance clock past 45 seconds (45000ms)
      vi.advanceTimersByTime(45100);

      expect(room.players.length).toBe(1);
      expect(room.players[0].name).toBe('Alice');
    });
  });

  describe('4. GameSession: Authoritative Turns, Move Validation & Cascades', () => {
    let room: Room;
    let session: GameSession;
    let eventsLog: any[];

    beforeEach(() => {
      vi.useFakeTimers();
      room = new Room('GAME', true, { turnDurationSeconds: 20, maxRounds: 3 });
      const p1 = room.addPlayer('Player1', 'av1', 'sock1');
      const p2 = room.addPlayer('Player2', 'av2', 'sock2');
      room.setReady(p2.player!.playerId, true);
      room.startGame();

      eventsLog = [];
      session = new GameSession(
        room,
        {
          onGameStart: (payload) => eventsLog.push({ type: 'start', payload }),
          onMoveResult: (payload) => eventsLog.push({ type: 'move_result', payload }),
          onTurnChange: (payload) => eventsLog.push({ type: 'turn_change', payload }),
          onTurnTimeout: (payload) => eventsLog.push({ type: 'timeout', payload }),
          onReshuffle: (payload) => eventsLog.push({ type: 'reshuffle', payload }),
          onGameOver: (payload) => eventsLog.push({ type: 'game_over', payload })
        },
        42 // Fixed PRNG seed
      );
      session.start();
    });

    afterEach(() => {
      session.destroy();
      room.clearAllDisconnectTimers();
      vi.useRealTimers();
    });

    it('initializes game with 9x9 board and active Player 1', () => {
      expect(session.board.length).toBe(9);
      expect(session.board[0].length).toBe(9);
      const current = session.getCurrentPlayer();
      expect(current?.name).toBe('Player1');
      expect(eventsLog.some((e) => e.type === 'start')).toBe(true);
    });

    it('rejects moves from out-of-turn players', () => {
      const p2 = room.players[1];
      const result = session.handleMove(p2.playerId, { row: 0, col: 0 }, { row: 0, col: 1 });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('NOT_YOUR_TURN');
    });

    it('rejects invalid non-matching swaps and preserves turn timer', () => {
      const p1 = room.players[0];
      // Search for an invalid swap on the current board
      let invalidMove: { from: any; to: any } | null = null;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const move = { from: { row: r, col: c }, to: { row: r, col: c + 1 } };
          const engine = new Match3Engine();
          const sim = engine.resolveMove(session.board, { playerId: p1.playerId, ...move }, new (engine as any).constructor());
          // Check validity with Match3Engine
          const testRes = engine.resolveMove(session.board, { playerId: p1.playerId, ...move }, session['prng']);
          if (!testRes.valid) {
            invalidMove = move;
            break;
          }
        }
        if (invalidMove) break;
      }

      if (invalidMove) {
        const res = session.handleMove(p1.playerId, invalidMove.from, invalidMove.to);
        expect(res.valid).toBe(false);
        expect(res.reason).toBe('INVALID_SWAP');
        // Player 1 remains active
        expect(session.getCurrentPlayer()?.playerId).toBe(p1.playerId);
      }
    });

    it('executes a valid move, applies score, and advances turn to Player 2', () => {
      const p1 = room.players[0];
      const p2 = room.players[1];

      // Find a known valid move
      const engine = new Match3Engine();
      let validMove: { from: any; to: any } | null = null;

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const neighbors = [
            { row: r + 1, col: c },
            { row: r, col: c + 1 }
          ];
          for (const n of neighbors) {
            if (n.row < 9 && n.col < 9) {
              const testRes = engine.resolveMove(
                session.board,
                { playerId: p1.playerId, from: { row: r, col: c }, to: n },
                session['prng']
              );
              if (testRes.valid) {
                validMove = { from: { row: r, col: c }, to: n };
                break;
              }
            }
          }
          if (validMove) break;
        }
        if (validMove) break;
      }

      expect(validMove).not.toBeNull();
      const initialScore = p1.score;

      const result = session.handleMove(p1.playerId, validMove!.from, validMove!.to);
      expect(result.valid).toBe(true);
      expect(result.scoreAwarded).toBeGreaterThan(0);
      expect(p1.score).toBe(initialScore + result.scoreAwarded);

      // During cascade animation delay, turn has not advanced yet and isEvaluatingMove is true
      expect(session.isEvaluatingMove).toBe(true);
      expect(session.getCurrentPlayer()?.playerId).toBe(p1.playerId);

      // Advance timers by cascade animation settling delay
      vi.advanceTimersByTime(3000);

      // Turn has advanced to Player 2 and isEvaluatingMove is false
      expect(session.isEvaluatingMove).toBe(false);
      expect(session.getCurrentPlayer()?.playerId).toBe(p2.playerId);
    });

    it('smoothly passes turn to next player when active player drops mid-turn', () => {
      const p1 = room.players[0];
      const p2 = room.players[1];
      expect(session.getCurrentPlayer()?.playerId).toBe(p1.playerId);

      // Active Player 1 disconnects
      p1.isConnected = false;
      session.handlePlayerDropped(p1.playerId, false);

      // Turn immediately passes to Player 2
      expect(session.getCurrentPlayer()?.playerId).toBe(p2.playerId);
      const turnChangeEvents = eventsLog.filter((e) => e.type === 'turn_change');
      expect(turnChangeEvents.length).toBeGreaterThan(0);
      expect(turnChangeEvents[turnChangeEvents.length - 1].payload.activePlayerId).toBe(p2.playerId);
      // No false timeout penalty on Player 2
      expect(p2.consecutiveTimeouts).toBe(0);
    });

    it('does NOT trigger game over when player drops in 2-player match; allows reconnect within 45s grace period', () => {
      const p2 = room.players[1];
      p2.isConnected = false;
      session.handlePlayerDropped(p2.playerId, false);

      // Game must NOT be over; grace period is running
      expect(room.status).toBe('IN_GAME');
      expect(eventsLog.some((e) => e.type === 'game_over')).toBe(false);

      // Reconnect Player 2
      p2.isConnected = true;
      const syncState = session.getSyncState();
      expect(syncState.status).toBe('IN_GAME');
      expect(syncState.players.find((p) => p.playerId === p2.playerId)?.isConnected).toBe(true);
    });

    it('triggers game over when 45s grace period expires or player forfeits in 2-player match', () => {
      const p1 = room.players[0];
      const p2 = room.players[1];
      p2.isConnected = false;

      // 45s grace period expires (isForfeit = true)
      session.handlePlayerDropped(p2.playerId, true);

      expect(room.status).toBe('GAME_OVER');
      const gameOverEvent = eventsLog.find((e) => e.type === 'game_over');
      expect(gameOverEvent).toBeDefined();
      expect(gameOverEvent.payload.winnerPlayerId).toBe(p1.playerId);
    });

    it('maintains slot-based cyclic turn order even if intermediate player disconnects', () => {
      // Create a 3-player room
      const r3 = new Room('R3', true, { turnDurationSeconds: 20, maxRounds: 3 });
      const pA = r3.addPlayer('A').player!;
      const pB = r3.addPlayer('B').player!;
      const pC = r3.addPlayer('C').player!;
      r3.setReady(pB.playerId, true);
      r3.setReady(pC.playerId, true);
      r3.startGame();

      const s3 = new GameSession(
        r3,
        {
          onGameStart: () => {},
          onMoveResult: () => {},
          onTurnChange: () => {},
          onTurnTimeout: () => {},
          onReshuffle: () => {},
          onLevelUp: () => {},
          onGameOver: () => {}
        },
        123
      );
      s3.start();

      expect(s3.getCurrentPlayer()?.playerId).toBe(pA.playerId);

      // Disconnect player B (slot 1)
      pB.isConnected = false;

      // Advance turn from A (slot 0)
      s3.advanceTurn();
      // Should advance directly to C (slot 2)
      expect(s3.getCurrentPlayer()?.playerId).toBe(pC.playerId);

      // Advance turn from C (slot 2)
      const wrapped = s3.advanceTurn();
      // Should wrap back to A (slot 0) and increment round
      expect(wrapped).toBe(true);
      expect(s3.getCurrentPlayer()?.playerId).toBe(pA.playerId);
      expect(s3.round).toBe(2);

      s3.destroy();
      r3.clearAllDisconnectTimers();
    });

    it('guarantees isEvaluatingMove resets via finally block even if resolveMove throws an exception', () => {
      const p1 = room.players[0];
      const originalResolve = (session as any).engine.resolveMove;
      (session as any).engine.resolveMove = () => {
        throw new Error('Simulated engine crash');
      };

      expect(() => {
        session.handleMove(p1.playerId, { row: 0, col: 0 }, { row: 0, col: 1 });
      }).toThrow('Simulated engine crash');

      // isEvaluatingMove must not be stuck true
      expect(session.isEvaluatingMove).toBe(false);

      // Restore original method
      (session as any).engine.resolveMove = originalResolve;
    });

    it('automatically times out after 20s and passes turn to next player', () => {
      const p1 = room.players[0];
      const p2 = room.players[1];
      expect(session.getCurrentPlayer()?.playerId).toBe(p1.playerId);

      // Fast-forward 20 seconds
      vi.advanceTimersByTime(20050);

      expect(p1.consecutiveTimeouts).toBe(1);
      expect(session.getCurrentPlayer()?.playerId).toBe(p2.playerId);
      expect(eventsLog.some((e) => e.type === 'timeout')).toBe(true);
      expect(eventsLog.some((e) => e.type === 'turn_change')).toBe(true);
    });

    it('generates complete sync_state matching the authoritative board without corruption', () => {
      const sync = session.getSyncState();
      expect(sync.roomCode).toBe('GAME');
      expect(sync.status).toBe('IN_GAME');
      expect(sync.board.length).toBe(9);
      expect(sync.players.length).toBe(2);
      expect(sync.activePlayerId).toBe(session.getCurrentPlayer()?.playerId);
    });
  });

  describe('5. SocketServer Integration (Real Network Sockets & Protocol)', () => {
    let server: AppServer;
    let port: number;
    let client1: ClientSocketType;
    let client2: ClientSocketType;

    beforeEach(async () => {
      server = createServer();
      port = await server.start(0); // Random ephemeral port
    });

    afterEach(async () => {
      if (client1 && client1.connected) client1.disconnect();
      if (client2 && client2.connected) client2.disconnect();
      await server.stop();
    });

    it('completes room creation, 2-player join, ready cycle and starts game', async () => {
      // Connect Client 1 (Host)
      client1 = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });
      await new Promise<void>((resolve) => client1.on('connect', () => resolve()));

      let createdRoomCode = '';
      let hostSessionToken = '';
      let hostPlayerId = '';

      await new Promise<void>((resolve) => {
        client1.emit('room:create', { playerName: 'HostHero' }, (res: RoomCreatedResponse) => {
          createdRoomCode = res.roomCode;
          hostSessionToken = res.sessionToken;
          hostPlayerId = res.playerId;
          expect(res.slot).toBe(0);
          resolve();
        });
      });

      expect(createdRoomCode).toBeDefined();

      // Connect Client 2 (Guest)
      client2 = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });
      await new Promise<void>((resolve) => client2.on('connect', () => resolve()));

      await new Promise<void>((resolve) => {
        client2.emit('room:join', { roomCode: createdRoomCode, playerName: 'GuestStar' }, (res: any) => {
          expect(res.roomCode).toBe(createdRoomCode);
          expect(res.slot).toBe(1);
          resolve();
        });
      });

      // Verify room state broadcast to client 1
      const roomState = await new Promise<RoomStateDTO>((resolve) => {
        client1.once('room:state', (state: RoomStateDTO) => resolve(state));
        // Guest toggles ready
        client2.emit('room:ready', { isReady: true });
      });

      expect(roomState.players.length).toBe(2);
      expect(roomState.players[1].isReady).toBe(true);

      // Host starts game
      const [startPayloadP1, startPayloadP2] = await Promise.all([
        new Promise<GameStartPayload>((resolve) => client1.once('game:start', resolve)),
        new Promise<GameStartPayload>((resolve) => client2.once('game:start', resolve)),
        new Promise<void>((resolve) => {
          client1.emit('room:start');
          resolve();
        })
      ]);

      expect(startPayloadP1.activePlayerId).toBe(hostPlayerId);
      expect(startPayloadP2.activePlayerId).toBe(hostPlayerId);
      expect(startPayloadP1.board.length).toBe(9);
      expect(startPayloadP1.turnDurationMs).toBe(20000);
    });

    it('handles player disconnect and seamless reconnection with sessionToken', async () => {
      // Connect Client 1
      client1 = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });
      await new Promise<void>((resolve) => client1.on('connect', () => resolve()));

      let roomCode = '';
      let sessionToken = '';

      await new Promise<void>((resolve) => {
        client1.emit('room:create', { playerName: 'PersistentPlayer' }, (res: RoomCreatedResponse) => {
          roomCode = res.roomCode;
          sessionToken = res.sessionToken;
          resolve();
        });
      });

      // Disconnect client1
      client1.disconnect();

      // Connect new client socket simulating page reload
      const client1Reconnected = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });
      await new Promise<void>((resolve) => client1Reconnected.on('connect', () => resolve()));

      const syncResult = await new Promise<any>((resolve) => {
        client1Reconnected.emit('room:reconnect', { roomCode, sessionToken }, (res: any) => {
          resolve(res);
        });
      });

      expect(syncResult.success).toBe(true);
      expect(syncResult.player.name).toBe('PersistentPlayer');
      expect(syncResult.player.slot).toBe(0);

      client1Reconnected.disconnect();
    });

    it('executes a full move on active turn and broadcasts move_result to both clients', async () => {
      client1 = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });
      client2 = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });

      await Promise.all([
        new Promise<void>((res) => client1.on('connect', () => res())),
        new Promise<void>((res) => client2.on('connect', () => res()))
      ]);

      let roomCode = '';
      let hostId = '';

      await new Promise<void>((res) => {
        client1.emit('room:create', { playerName: 'Player1' }, (r: RoomCreatedResponse) => {
          roomCode = r.roomCode;
          hostId = r.playerId;
          res();
        });
      });

      await new Promise<void>((res) => {
        client2.emit('room:join', { roomCode, playerName: 'Player2' }, () => res());
      });

      client2.emit('room:ready', { isReady: true });

      // Start game
      const startPromise = new Promise<GameStartPayload>((res) => client1.once('game:start', res));
      client1.emit('room:start');
      const startData = await startPromise;

      // Find valid move from startData.board
      const engine = new Match3Engine();
      const testPrng = new PRNG(startData.seed);
      let validMove: { from: any; to: any } | null = null;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const neighbors = [{ row: r + 1, col: c }, { row: r, col: c + 1 }];
          for (const n of neighbors) {
            if (n.row < 9 && n.col < 9) {
              const check = engine.resolveMove(
                startData.board,
                { playerId: hostId, from: { row: r, col: c }, to: n },
                testPrng
              );
              if (check.valid) {
                validMove = { from: { row: r, col: c }, to: n };
                break;
              }
            }
          }
          if (validMove) break;
        }
        if (validMove) break;
      }

      // Propose move from Client 1
      const moveResultPromiseP2 = new Promise<MoveResultPayload>((res) => {
        client2.once('game:move_result', res);
      });

      // Using validMove or fallback test swap
      const from = validMove ? validMove.from : { row: 0, col: 0 };
      const to = validMove ? validMove.to : { row: 0, col: 1 };

      client1.emit('game:move', { roomCode, from, to });

      const moveResult = await moveResultPromiseP2;
      expect(moveResult).toBeDefined();
      expect(moveResult.playerId).toBe(hostId);
      expect(moveResult.from).toEqual(from);
      expect(moveResult.to).toEqual(to);
    });

    it('keeps 2-player game active when player drops mid-game and allows seamless reconnect with sessionToken', async () => {
      client1 = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });
      client2 = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });

      await Promise.all([
        new Promise<void>((res) => client1.on('connect', () => res())),
        new Promise<void>((res) => client2.on('connect', () => res()))
      ]);

      let roomCode = '';
      let client2Token = '';

      await new Promise<void>((res) => {
        client1.emit('room:create', { playerName: 'Alice' }, (r: RoomCreatedResponse) => {
          roomCode = r.roomCode;
          res();
        });
      });

      await new Promise<void>((res) => {
        client2.emit('room:join', { roomCode, playerName: 'Bob' }, (r: any) => {
          client2Token = r.sessionToken;
          res();
        });
      });

      client2.emit('room:ready', { isReady: true });

      // Start game
      await new Promise<void>((res) => {
        client1.once('game:start', () => res());
        client1.emit('room:start');
      });

      let gameOverFired = false;
      client1.on('game:over', () => {
        gameOverFired = true;
      });

      // Disconnect Client 2
      const disconnectPromise = new Promise<void>((res) => {
        client1.once('room:player_disconnected', () => res());
      });
      client2.disconnect();
      await disconnectPromise;

      // Verify game did NOT immediately end
      const room = server.roomManager.getRoom(roomCode);
      expect(room?.status).toBe('IN_GAME');
      expect(gameOverFired).toBe(false);

      // Reconnect with new socket using sessionToken
      const client2Reconnected = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });
      await new Promise<void>((res) => client2Reconnected.on('connect', () => res()));

      const reconnectedPromise = new Promise<void>((res) => {
        client1.once('room:player_reconnected', () => res());
      });

      const reconnectRes = await new Promise<any>((res) => {
        client2Reconnected.emit(
          'room:reconnect',
          { roomCode, sessionToken: client2Token },
          (r: any) => res(r)
        );
      });

      await reconnectedPromise;

      expect(reconnectRes.success).toBe(true);
      expect(reconnectRes.syncState).toBeDefined();
      expect(reconnectRes.syncState.status).toBe('IN_GAME');
      expect(room?.status).toBe('IN_GAME');

      client2Reconnected.disconnect();
    });

    it('emits game:move_result with reason NOT_YOUR_TURN back to socket proposing out-of-turn move', async () => {
      client1 = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });
      client2 = ClientSocket(`http://localhost:${port}`, { transports: ['websocket'] });

      await Promise.all([
        new Promise<void>((res) => client1.on('connect', () => res())),
        new Promise<void>((res) => client2.on('connect', () => res()))
      ]);

      let roomCode = '';

      await new Promise<void>((res) => {
        client1.emit('room:create', { playerName: 'Player1' }, (r: RoomCreatedResponse) => {
          roomCode = r.roomCode;
          res();
        });
      });

      await new Promise<void>((res) => {
        client2.emit('room:join', { roomCode, playerName: 'Player2' }, () => res());
      });

      client2.emit('room:ready', { isReady: true });

      // Start game (Player 1 is active player)
      await new Promise<void>((res) => {
        client1.once('game:start', () => res());
        client1.emit('room:start');
      });

      // Player 2 proposes move out of turn
      const rejectedPromise = new Promise<MoveResultPayload>((res) => {
        client2.once('game:move_result', (result: MoveResultPayload) => res(result));
      });

      client2.emit('game:move', {
        roomCode,
        from: { row: 0, col: 0 },
        to: { row: 0, col: 1 }
      });

      const rejectedResult = await rejectedPromise;
      expect(rejectedResult.valid).toBe(false);
      expect(rejectedResult.reason).toBe('NOT_YOUR_TURN');
    });
  });
});
