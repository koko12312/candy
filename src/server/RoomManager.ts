import { Room } from './Room';
import { RoomSettings } from '../shared/types';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  // Code generation charset: exclude easily confused chars (0/O, 1/I, L)
  private static readonly CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  /**
   * Generates a unique 4-5 letter uppercase room code.
   */
  public generateRoomCode(length = 4): string {
    let code = '';
    let attempts = 0;
    while (attempts < 1000) {
      code = '';
      for (let i = 0; i < length; i++) {
        const idx = Math.floor(Math.random() * RoomManager.CODE_CHARSET.length);
        code += RoomManager.CODE_CHARSET[idx];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
      attempts++;
    }
    // Fallback if collision rate high: 5 chars
    return this.generateRoomCode(5);
  }

  /**
   * Creates a new room.
   */
  public createRoom(
    isPublic = true,
    settings?: Partial<RoomSettings>,
    customCode?: string
  ): Room {
    const code = customCode ? customCode.toUpperCase() : this.generateRoomCode();
    if (this.rooms.has(code)) {
      throw new Error(`Room code ${code} already exists`);
    }

    const room = new Room(code, isPublic, settings);
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Retrieves a room by its code.
   */
  public getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  /**
   * Finds or reconnects a player across all rooms using sessionToken.
   */
  public findRoomBySession(sessionToken: string): { room: Room; playerId: string } | null {
    for (const room of this.rooms.values()) {
      const p = room.getPlayerBySession(sessionToken);
      if (p) {
        return { room, playerId: p.playerId };
      }
      const s = room.spectators.find((spec) => spec.sessionToken === sessionToken);
      if (s) {
        return { room, playerId: s.playerId };
      }
    }
    return null;
  }

  /**
   * Finds a player or spectator by their active socketId.
   */
  public findRoomBySocketId(socketId: string): { room: Room; playerId: string } | null {
    for (const room of this.rooms.values()) {
      const p = room.getPlayerBySocket(socketId);
      if (p) {
        return { room, playerId: p.playerId };
      }
      const s = room.getSpectatorBySocket(socketId);
      if (s) {
        return { room, playerId: s.playerId };
      }
    }
    return null;
  }

  /**
   * Destroys a room and clears its resources.
   */
  public deleteRoom(roomCode: string): boolean {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (room) {
      room.clearAllDisconnectTimers();
      return this.rooms.delete(code);
    }
    return false;
  }

  /**
   * Lists all public rooms in LOBBY status.
   */
  public findPublicRooms(): Room[] {
    return Array.from(this.rooms.values()).filter(
      (room) => room.isPublic && room.status === 'LOBBY' && room.players.length < 4
    );
  }

  /**
   * Returns count of active rooms.
   */
  public get roomCount(): number {
    return this.rooms.size;
  }

  /**
   * Cleanup empty rooms (e.g. 0 players and 0 spectators).
   */
  public cleanupEmptyRooms(): number {
    let cleaned = 0;
    for (const [code, room] of this.rooms.entries()) {
      if (room.players.length === 0 && room.spectators.length === 0) {
        room.clearAllDisconnectTimers();
        this.rooms.delete(code);
        cleaned++;
      }
    }
    return cleaned;
  }
}
