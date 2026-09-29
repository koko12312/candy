/**
 * Match Pop Multiplayer - Core Game Engine Types
 * Pure TypeScript, zero external dependencies.
 */

export enum CandyColor {
  RED = 0,      // Jelly Bean
  ORANGE = 1,   // Lozenge / Oval
  YELLOW = 2,   // Lemon Drop / Triangle
  GREEN = 3,    // Pillow / Square
  BLUE = 4,     // Sphere / Ball
  PURPLE = 5,   // Cluster / Flower
  NONE = -1     // For Color Bomb or Empty/Wild
}

export enum CandyType {
  NORMAL = 'normal',
  STRIPED_HORIZONTAL = 'striped_h', // Clears its entire row
  STRIPED_VERTICAL = 'striped_v',     // Clears its entire column
  WRAPPED = 'wrapped',               // Explodes in a 3x3 area twice
  COLOR_BOMB = 'color_bomb'          // Clears all candies of chosen color
}

export interface Coordinate {
  row: number;
  col: number;
}

export interface Tile {
  id: number;           // Unique instance ID (monotonically incremented)
  row: number;          // Current row (0..8)
  col: number;          // Current col (0..8)
  color: CandyColor;    // Color 0..5, or -1 for Color Bomb
  type: CandyType;      // normal, striped_h, striped_v, wrapped, color_bomb
}

export interface PlayerMove {
  playerId: string;
  from: Coordinate;
  to: Coordinate;
}

export type EngineEvent =
  | { type: 'SWAP'; from: Coordinate; to: Coordinate; valid: boolean }
  | { type: 'SWAP_REVERT'; from: Coordinate; to: Coordinate }
  | {
      type: 'MATCH_FOUND';
      step: number;
      tiles: { id: number; row: number; col: number; color: CandyColor }[];
      spawnSpecial?: { id: number; row: number; col: number; type: CandyType; color: CandyColor };
    }
  | {
      type: 'SPECIAL_DETONATE';
      specialType: CandyType | 'combo';
      origin: Coordinate;
      affectedTiles: { id: number; row: number; col: number }[];
    }
  | {
      type: 'GRAVITY_DROP';
      drops: { id: number; fromRow: number; toRow: number; col: number }[];
    }
  | {
      type: 'REFILL_SPAWN';
      spawns: { id: number; row: number; col: number; color: CandyColor; type: CandyType }[];
    }
  | {
      type: 'CASCADE_STEP_COMPLETE';
      step: number;
      stepScore: number;
      cumulativeScore: number;
    }
  | {
      type: 'BOARD_RESHUFFLE';
      newGrid: Tile[][];
    }
  | {
      type: 'TURN_SETTLE';
      totalTurnScore: number;
      board: Tile[][];
      nextPlayerId?: string;
    };

export interface MoveResolution {
  valid: boolean;
  events: EngineEvent[];
  finalBoard: Tile[][];
  turnScore: number;
}

export interface HorizontalMatchRun {
  row: number;
  startCol: number;
  endCol: number;
  length: number;
  color: CandyColor;
}

export interface VerticalMatchRun {
  col: number;
  startRow: number;
  endRow: number;
  length: number;
  color: CandyColor;
}

export interface MatchCluster {
  color: CandyColor;
  tiles: Coordinate[];
  shape: 'line3' | 'line4' | 'line5' | 't_l_cross';
  anchor: Coordinate;
  spawnType?: CandyType;
}

// ==========================================
// Multiplayer & Room Synchronization DTOs
// ==========================================

export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'GAME_OVER';

export interface RoomSettings {
  turnDurationSeconds: number; // default: 20
  maxRounds: number;           // default: 10
  boardSize: number;           // default: 9 (9x9)
  gameMode: 'coop' | 'competitive'; // default: 'coop'
}

export interface PlayerDTO {
  playerId: string;
  name: string;
  avatarId: string;
  slot: number;             // 0..3
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  score: number;
  consecutiveTimeouts: number;
}

export interface SpectatorDTO {
  playerId: string;
  name: string;
  avatarId: string;
  isConnected: boolean;
}

export interface RoomStateDTO {
  roomCode: string;
  status: RoomStatus;
  isPublic: boolean;
  players: PlayerDTO[];
  spectators?: SpectatorDTO[];
  spectatorCount: number;
  settings: RoomSettings;
  activePlayerId?: string;
  currentRound?: number;
  level?: number;
  targetScore?: number;
}

export interface RoomCreateRequest {
  playerName: string;
  avatarId?: string;
  isPublic?: boolean;
  settings?: Partial<RoomSettings>;
}

export interface RoomCreatedResponse {
  roomCode: string;
  sessionToken: string;
  playerId: string;
  slot: number;
}

export interface RoomJoinRequest {
  roomCode: string;
  playerName: string;
  avatarId?: string;
  sessionToken?: string;
  asSpectator?: boolean;
}

export interface RoomReadyRequest {
  isReady: boolean;
}

export interface GameStartPayload {
  seed: number;
  board: Tile[][];
  activePlayerId: string;
  round: number;
  level: number;
  targetScore: number;
  turnExpiresAt: number;
  turnDurationMs: number;
}

export interface ProposeMovePayload {
  roomCode: string;
  from: Coordinate;
  to: Coordinate;
  clientTimestamp?: number;
}

export interface MoveResultPayload {
  valid: boolean;
  playerId: string;
  from: Coordinate;
  to: Coordinate;
  reason?: 'NOT_YOUR_TURN' | 'INVALID_SWAP' | 'GAME_NOT_ACTIVE' | 'EVALUATING';
  events: EngineEvent[];
  scoreAwarded: number;
  playerTotalScore: number;
  boardAfterSettled: Tile[][];
  needsReshuffle: boolean;
}

export interface TurnChangePayload {
  activePlayerId: string;
  slot: number;
  round: number;
  turnExpiresAt: number;
  turnDurationMs: number;
  serverTimestamp: number;
}

export interface TurnTimeoutPayload {
  timedOutPlayerId: string;
  nextPlayerId: string;
}

export interface ReshufflePayload {
  reason: 'NO_VALID_MOVES';
  newBoard: Tile[][];
  events: EngineEvent[];
}

export interface LevelUpPayload {
  newLevel: number;
  newTargetScore: number;
  newBoard: Tile[][];
  events: EngineEvent[];
}

export interface GameOverPayload {
  winnerPlayerId: string;
  isVictory: boolean;
  rankings: {
    playerId: string;
    name: string;
    avatarId: string;
    finalScore: number;
    rank: number;
  }[];
}

export interface GameSyncStatePayload {
  roomCode: string;
  status: RoomStatus;
  board: Tile[][];
  players: PlayerDTO[];
  activePlayerId: string;
  round: number;
  level: number;
  targetScore: number;
  turnExpiresAt: number;
  turnDurationMs: number;
  serverTimestamp: number;
  settings: RoomSettings;
}

